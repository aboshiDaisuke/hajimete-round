/* 実行には Playwright と、ローカルで配信したアプリが必要。
   GOLF_URL=http://127.0.0.1:8765 node tools/test_practice.cjs */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.GOLF_BROWSER_PATH || undefined,
    headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const url = process.env.GOLF_URL || 'http://127.0.0.1:8765';
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('hajimete-round-v1')));
  const route = async name => {
    await page.evaluate(name => { location.hash = name; }, name);
    await page.waitForFunction(name => location.hash === '#' + name && document.querySelector('#main').textContent.length > 0, name);
    await page.waitForTimeout(100);
  };
  const dismiss = async () => { if (await page.locator('#levelup').isVisible()) await page.locator('[data-action="lu-close"]').click(); };
  const next = () => page.locator('[data-practice="next"]').click();
  const prepare = async () => {
    await next();
    assert.equal(await page.locator('[data-practice="next"]').isDisabled(), true);
    await page.locator('[data-session-ready="equipment"]').check();
    await page.locator('[data-session-ready="space"]').check();
    await next();
    await page.locator('#session-clock').waitFor();
  };
  try {
    await page.goto(url + '/#home', { waitUntil: 'networkidle' });
    // 古い保存データへ新しい練習機能を足しても、既存の記録を失わない。
    await page.evaluate(() => {
      const date = new Date();
      const today = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      date.setDate(date.getDate() + 90);
      const debut = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      localStorage.setItem('hajimete-round-v1', JSON.stringify({
        profile: { name: '練習テスト', start: today, debut, confirmed: true }, done: { w1e: today }, xp: 17,
        logs: [{ id: 1, date: today, place: '自宅', minutes: 10, balls: 0, focus: '既存の記録', feel: 3 }], bgm: false,
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(await page.locator('#training-greeting').textContent(), /練習テスト/);
    await page.locator('[data-mode="5"]').click();
    if (process.env.GOLF_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.GOLF_SCREENSHOT_DIR, 'training-home.png'), fullPage: true });
    await page.locator('.daily-session [data-practice="start"]').click();
    await page.locator('.session-stages').waitFor();
    assert.equal((await state()).logs.length, 1);
    assert.equal((await state()).practice.active.items.length, 1);
    await prepare();
    await page.locator('[data-practice="count"][data-add="10"]').click();
    await page.locator('[data-practice="timer"]').click();
    await page.waitForTimeout(1250);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const pausedAt = (await state()).practice.active.items[0].elapsed;
    await page.waitForTimeout(1100);
    assert.equal((await state()).practice.active.items[0].elapsed, pausedAt, '別タブにいる間は時間を増やさない');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('[data-practice="pause"]').click();
    await page.locator('.daily-session').waitFor();
    const saved = await state();
    assert.equal(saved.practice.active.items[0].actual, 10);
    assert.ok(saved.practice.active.items[0].elapsed >= 1);
    await page.reload({ waitUntil: 'networkidle' });
    await route('drill-slope');
    await page.locator('[data-practice="start"][data-selected="slope"]').click();
    await page.locator('#session-clock').waitFor();
    assert.equal((await state()).practice.active.id, saved.practice.active.id, '他の練習を選んでも保存中の内容を上書きしない');
    assert.equal(await page.locator('#session-timer').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#session-count').textContent(), '10');
    await next();
    await page.locator('[data-session-rating="0"][value="hard"]').check();
    await page.locator('#session-minutes').fill('5');
    await page.locator('#session-memo').fill('構えの復習をした');
    await page.locator('#session-next').fill('握る力を弱くする');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#session-next').inputValue(), '握る力を弱くする');
    await page.locator('#session-review button[type="submit"]').click();
    await page.locator('.session-summary').waitFor();
    await dismiss();
    let s = await state();
    assert.equal(s.logs.length, 2);
    assert.equal(s.logs[1].minutes, 5);
    assert.equal(s.logs[1].place, '自宅');
    assert.equal(s.logs[1].nextFocus, '握る力を弱くする');
    assert.equal(s.done.w1a, undefined, '短い練習だけで週の目標を達成扱いにしない');
    assert.ok(s.done.w1e, '既存の完了状態を維持する');
    const difficult = s.logs[1].items[0].drill;
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await state()).logs.length, 2, '結果画面を再読み込みしても重複記録しない');
    await route('home');
    assert.match(await page.locator('.daily-session').textContent(), /もう一度/);
    assert.match(await page.locator('.daily-session').textContent(), /握る力を弱くする/);
    await page.locator('.daily-session [data-practice="start"]').click();
    assert.equal((await state()).practice.active.items[0].drill, difficult);
    await prepare();
    await next();
    await page.locator('[data-session-rating="0"][value="done"]').check();
    await page.locator('[data-session-goal="0"]').check();
    await page.locator('#session-minutes').fill('5');
    await page.locator('#session-review button[type="submit"]').click();
    await dismiss();
    s = await state();
    assert.ok(s.done.w1a, '本人が確認した週の目標だけを達成にする');
    await route('home');
    assert.equal(await page.locator('.daily-session .repeat-label').count(), 0, '取り組めた復習を次回も固定しない');
    // 見送ったメニューでは記録・XP・週のチェックを増やさない。
    await page.locator('.daily-session [data-practice="start"]').click();
    await page.locator('[data-practice="skip"]').click();
    const beforeSkip = await state();
    await page.locator('#session-review button[type="submit"]').click();
    const afterSkip = await state();
    assert.equal(afterSkip.logs.length, beforeSkip.logs.length);
    assert.equal(afterSkip.xp, beforeSkip.xp);
    assert.deepEqual(afterSkip.done, beforeSkip.done);
    // 週の振り返りは、場所が一致する場合だけ今日のメニューへ反映。
    await route('weekreview');
    await page.locator('#weekly-good').fill('構えを繰り返せた');
    await page.locator('#weekly-hard').fill('ボールに当てるのが難しい');
    await page.locator('#weekly-task').selectOption('w1d');
    await page.locator('#weekly-review button').click();
    await page.locator('[data-mode="range"]').click();
    assert.match(await page.locator('.session-menu li').first().textContent(), /ハーフスイング/);
    await page.locator('[data-mode="5"]').click();
    assert.doesNotMatch(await page.locator('.session-menu').textContent(), /ハーフスイング/);
    // 自己確認と当日のメモは、XPから独立して保存される。
    await route('readiness');
    await page.locator('[data-readiness="shot-setup"]').check();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-readiness="shot-setup"]').isChecked(), true);
    await route('debut');
    await page.locator('#visit-course').fill('テストゴルフクラブ');
    await page.locator('#visit-meet').fill('08:30');
    await page.locator('#visit-tee').fill('09:00');
    await page.locator('#visit-memo').fill('入口に集合');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#visit-meet').inputValue(), '08:30');
    assert.equal(await page.locator('#visit-course').inputValue(), 'テストゴルフクラブ');
    await page.locator('[data-check="c-ball"]').check();
    assert.ok((await state()).checklist['c-ball']);
    console.log('PASS: practice, persistence, explicit completion, review, readiness, and debut preparation');
    // 12週すべてのおすすめが、場所と所要時間に合い、練習から始められる。
    for (let week = 1; week <= 12; week++) {
      await page.evaluate(week => {
        const s = JSON.parse(localStorage.getItem('hajimete-round-v1'));
        const d = new Date(); d.setDate(d.getDate() - (week - 1) * 7);
        s.profile.start = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        s.practice.active = null; s.practice.reviews = {}; s.logs = []; s.done = {};
        localStorage.setItem('hajimete-round-v1', JSON.stringify(s));
      }, week);
      await route('home'); await page.reload({ waitUntil: 'domcontentloaded' });
      for (const mode of ['5', '15', 'range']) {
        await page.locator(`[data-mode="${mode}"]`).click();
        await page.locator('.daily-session [data-practice="start"]').click();
        const a = (await state()).practice.active;
        assert.equal(a.week, week);
        assert.equal(a.items.reduce((n, x) => n + x.minutes, 0), mode === 'range' ? (week === 12 ? 20 : 40) : Number(mode));
        assert.ok(a.items.every(x => mode === 'range' ? x.where === '練習場' : ['自宅', 'どこでも', 'アプリ'].includes(x.where)));
        assert.ok(a.items.every(x => x.link !== 'quiz' && x.link !== 'putting'));
        while (!(await page.locator('#session-review').count())) await page.locator('[data-practice="skip"]').click();
        await page.locator('#session-review button[type="submit"]').click();
        await route('home');
      }
    }
    console.log('PASS: practice recommendations for all 12 weeks and 3 time/place modes');
    // 画面幅・テーマごとの表示を確認。小さなスマホでも横にはみ出さない。
    for (const width of [320, 390, 480, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const name of ['home', 'readiness', 'weekreview', 'debut', 'week-1']) {
        await route(name);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow at ${width}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await route('home');
    await page.locator('[data-mode="5"]').click();
    await page.locator('.daily-session [data-practice="start"]').click();
    await prepare();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `practice overflow at ${width}`);
      if (process.env.GOLF_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.GOLF_SCREENSHOT_DIR, `training-session-${width}.png`), fullPage: true });
    }
    await next();
    await page.locator('[data-session-rating="0"][value="done"]').check();
    await page.locator('#session-minutes').fill('5');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'review overflow');
    if (process.env.GOLF_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.GOLF_SCREENSHOT_DIR, 'training-review.png'), fullPage: true });
    await page.locator('#session-review button[type="submit"]').click();
    // 直前の準備を目立たせ、既存のゲーム・学習画面も引き続き開ける。
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hajimete-round-v1'));
      const d = new Date(); d.setDate(d.getDate() + 14);
      s.profile.debut = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      localStorage.setItem('hajimete-round-v1', JSON.stringify(s));
    });
    await route('home'); await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.prep-reminder').count(), 1);
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const name of ['home', 'practice', 'plan', 'rules', 'tempo', 'putting', 'play', 'log', 'my', 'settings']) {
      await route(name);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dark ${name} overflow`);
    }
    // 教材へ移動しても練習へ戻れ、3Dの読込に失敗しても練習は使える。
    await route('drill-tempo');
    await page.locator('[data-practice="start"][data-selected="tempo"]').click();
    await prepare();
    await page.locator('a[href="#tempo"]').filter({ hasText: '音を使う' }).click();
    await page.locator('.session-return').click();
    await page.locator('#session-clock').waitFor();
    assert.equal((await state()).practice.active.items[0].drill, 'tempo');
    assert.equal(await page.locator('#session-timer').getAttribute('aria-pressed'), 'false');
    const fallback = await browser.newPage({ viewport: { width: 320, height: 844 } });
    await fallback.route('https://**/*', r => r.abort());
    await fallback.goto(url + '/#home', { waitUntil: 'networkidle' });
    await fallback.locator('.daily-session [data-practice="start"]').click();
    await fallback.locator('.session-stages').waitFor();
    await fallback.close();
    assert.deepEqual(errors, []);
    console.log('PASS: saved-data migration, guided practice, timer pause/resume, draft recovery, recording, explicit goals, review suggestions, skipping, 12-week plans, readiness, debut notes, responsive layouts');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
