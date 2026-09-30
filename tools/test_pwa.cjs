/* node tools/test_pwa.cjs — Playwright/Chromiumが必要。専用サーバー・プロファイルで確認。 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
let revision = 0, broken = false;
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/nested/')) pathname = pathname.slice('/nested'.length);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    if (broken && pathname === '/js/data.js') { res.writeHead(503).end(); return; }
    let data = await fs.readFile(file);
    if (pathname === '/sw.js') data = Buffer.from(data.toString().replace(/const VERSION = "([^"]+)";/, `const VERSION = "$1-test-${revision}";`));
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (_) { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.GOLF_BROWSER_PATH || undefined, headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  // 外部フォントに依存せず3Dを含む本体が動く。
  await context.route('https://**/*', route => route.abort());
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const ready = async target => {
    await target.waitForFunction(() => !!navigator.serviceWorker.controller);
    await target.locator('[data-pwa-status]').filter({ hasText: 'オフラインの準備ができました' }).waitFor();
  };
  const cachesFor = target => target.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('hajimete-round:')));
  try {
    await page.goto(url + '/#settings', { waitUntil: 'networkidle' });
    await ready(page);
    const manifest = await (await context.request.get(url + '/manifest.webmanifest')).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.id, './index.html');
    assert.equal(await page.evaluate(() => !!window.THREE), true);
    const firstCache = (await cachesFor(page))[0];
    const assets = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(request => request.url), firstCache);
    for (const asset of ['index.html', 'js/practice-flow.js', 'assets/golfer-male-glb.js', 'vendor/three/build/three.module.js']) {
      assert(assets.some(value => value.endsWith('/' + asset)), asset + ' is cached');
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320px layout');
    if (process.env.GOLF_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.GOLF_SCREENSHOT_DIR, 'pwa-settings.png'), fullPage: true });

    // OSのインストール画面は自動化せず、イベントの受付と取消後の案内を確認。
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });
    await page.locator('[data-pwa-install]').click();
    await page.locator('[data-pwa-status]').filter({ hasText: 'あとからブラウザ' }).waitFor();
    assert.equal(await page.locator('[data-pwa-install]').isVisible(), false);
    await page.evaluate(() => {
      localStorage.setItem('pwa-regression-marker', 'kept');
      location.hash = 'home';
    });
    await page.locator('[data-pwa-home]').waitFor();

    await context.setOffline(true);
    await page.goto(url + '/index.html?source=icon#home', { waitUntil: 'load' });
    await page.locator('#home-lobby.is-3d').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('pwa-regression-marker')), 'kept');
    await page.evaluate(() => { location.hash = 'play'; });
    await page.locator('[data-chara="male"]').click();
    await page.waitForFunction(() => !!window.GOLFER_GLBS?.male);
    await page.evaluate(() => { location.hash = 'game-round'; });
    await page.locator('.in-game canvas').first().waitFor();
    await page.evaluate(() => { location.hash = 'home'; });
    await page.locator('.daily-session [data-practice="start"]').click();
    await page.locator('.session-stages').waitFor();
    await page.reload({ waitUntil: 'load' });
    await page.locator('.session-stages').waitFor();
    const savedPractice = await page.evaluate(() => JSON.parse(localStorage.getItem('hajimete-round-v1')).practice.active);
    assert(savedPractice, 'offline practice survives reload');

    // 新版の保存中に練習を中断せず、すべての画面を閉じた後に反映。
    await context.setOffline(false);
    await page.evaluate(() => { location.hash = 'settings'; });
    revision = 1;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    await page.locator('[data-pwa-status]').filter({ hasText: '更新があります' }).waitFor();
    assert((await cachesFor(page)).includes(firstCache), 'old cache survives pending update');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hajimete-round-v1')).practice.active), savedPractice);
    await page.close();
    const updated = await context.newPage();
    updated.on('pageerror', error => errors.push(error.message));
    await updated.goto(url + '/#settings', { waitUntil: 'networkidle' });
    await ready(updated);
    await updated.waitForFunction(async () => (await caches.keys()).filter(key => key.startsWith('hajimete-round:')).length === 1);
    assert((await cachesFor(updated))[0].endsWith('-test-1'), 'updated cache is active');

    // 次の更新で一部ファイルが取れなくても、正常な旧版の保存を維持。
    revision = 2; broken = true;
    await updated.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await new Promise(async (resolve, reject) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); });
        }, { once: true });
        try { await registration.update(); } catch (error) { reject(error); }
      });
    });
    assert.equal((await cachesFor(updated)).length, 1);
    assert((await cachesFor(updated))[0].endsWith('-test-1'));
    await context.setOffline(true);
    await updated.reload({ waitUntil: 'load' });
    await updated.locator('[data-pwa-status]').filter({ hasText: 'オフラインです' }).waitFor();
    assert.equal(await updated.evaluate(() => localStorage.getItem('pwa-regression-marker')), 'kept');
    await context.setOffline(false); broken = false;

    // サブディレクトリでもscopeとキャッシュが独立して動く。
    const nested = await context.newPage();
    await nested.goto(url + '/nested/#settings', { waitUntil: 'networkidle' });
    await ready(nested);
    const scope = await nested.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
    assert.equal(scope, url + '/nested/');
    await context.setOffline(true);
    await nested.reload({ waitUntil: 'load' });
    await nested.locator('[data-pwa-status]').filter({ hasText: 'オフラインです' }).waitFor();

    const iphone = await browser.newContext({ viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1' });
    await iphone.route('https://**/*', route => route.abort());
    const iosPage = await iphone.newPage();
    await iosPage.goto(url + '/#settings', { waitUntil: 'networkidle' });
    await iosPage.locator('[data-pwa-help][open]').waitFor();
    assert.match(await iosPage.locator('[data-pwa-help]').textContent(), /Safari.*共有.*ホーム画面に追加.*Webアプリ/s);
    // iOSのstandaloneフラグに従って、起動済みアプリでは追加案内を隠す。
    await iosPage.evaluate(() => { Object.defineProperty(navigator, 'standalone', { value: true }); window.GolfPWA.sync(); });
    assert.equal(await iosPage.locator('[data-pwa-help]').isVisible(), false);
    await iosPage.evaluate(() => { location.hash = 'home'; });
    await iosPage.locator('.daily-session').waitFor();
    assert.equal(await iosPage.locator('[data-pwa-home]').count(), 0);
    await iphone.close();

    const files = await browser.newContext();
    await files.route('https://**/*', route => route.abort());
    const filePage = await files.newPage();
    for (const file of ['index.html', 'dist/artifact.html']) {
      await filePage.goto(pathToFileURL(path.join(root, file)).href + '#settings', { waitUntil: 'networkidle' });
      await filePage.locator('[data-pwa-status]').filter({ hasText: '公開したURL' }).waitFor();
      assert.equal(await filePage.locator('[data-pwa-install]').isVisible(), false);
      assert.equal(await filePage.locator('[data-pwa-help]').isVisible(), false);
    }
    await files.close();
    assert.deepEqual(errors, []);
    console.log('PASS: install guidance, 320px layout, offline reload/3D/game/practice, saved progress, waiting update, failed update recovery, subdirectory scope, iOS/standalone guidance, file/artifact fallback');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
