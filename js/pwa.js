/* ホーム画面への追加とオフライン保存。練習中に自動リロードしない。 */
(() => {
  'use strict';
  const standalone = matchMedia('(display-mode: standalone)');
  const isApp = () => standalone.matches || navigator.standalone === true;
  const available = () => !window.GOLF_ARTIFACT && /^https?:$/.test(location.protocol) && window.isSecureContext;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // オフライン再起動では登録の再確認より先に、現在のワーカーで準備済みと判断する。
  const workerURL = new URL('sw.js', document.baseURI).href;
  let promptEvent = null, installing = false, failed = false, registration = null;
  let offlineReady = available() && 'serviceWorker' in navigator && navigator.serviceWorker.controller?.scriptURL === workerURL;
  let installMessage = '';

  function sync() {
    document.querySelectorAll('[data-pwa-home]').forEach(el => { el.hidden = isApp(); });
    document.querySelectorAll('[data-pwa-install]').forEach(button => {
      button.hidden = isApp() || !promptEvent;
      button.disabled = installing;
      button.textContent = installing ? '追加を確認中…' : 'ホーム画面に追加する';
    });
    document.querySelectorAll('[data-pwa-help]').forEach(el => { el.hidden = isApp() || !available(); });
    document.querySelectorAll('[data-pwa-status]').forEach(el => {
      let message;
      if (!available()) message = 'ホーム画面への追加は、公開したURLから利用できます。';
      else if (offlineReady) message = navigator.onLine
        ? 'オフラインの準備ができました。通信がなくても練習・記録・ゲームを使えます。'
        : 'オフラインです。練習や記録はいつもどおり使えます。';
      else if (failed) message = 'オフライン保存ができませんでした。通信があるときに開き直してください。';
      else message = 'オフラインで使えるよう準備しています。初回は通信がある状態でお待ちください。';
      if (isApp()) message = 'アプリとして起動しています。' + message;
      if (registration && registration.waiting) message += ' 更新があります。このアプリの画面をすべて閉じて開き直すと反映されます。';
      if (installMessage) message += ' ' + installMessage;
      el.textContent = message;
    });
  }

  function homeCard() {
    if (isApp() || !available()) return '';
    return `<aside class="card section" data-pwa-home aria-label="アプリとして使う">
      <div class="pwa-heading"><img src="assets/icon-192.png" width="48" height="48" alt=""><div><h2>練習を、ホーム画面から。</h2><p>アイコンからすぐ起動。通信がない場所でも。</p></div></div>
      <a class="btn btn-ghost btn-block" href="#settings">アプリとして使う</a>
    </aside>`;
  }

  function settingsCard() {
    const steps = ios
      ? '<li>Safariでこのアプリを開き、共有ボタンを押します。</li><li>「ホーム画面に追加」を選びます。</li><li>「Webアプリとして開く」がある場合はONにして「追加」を押します。</li>'
      : '<li>ブラウザのメニューを開きます。</li><li>「アプリをインストール」または「ホーム画面に追加」を選びます。</li><li>追加したアイコンから起動します。</li>';
    return `<section class="card section" aria-labelledby="pwa-heading">
      <div class="pwa-heading"><img src="assets/icon-192.png" width="48" height="48" alt=""><div><h2 id="pwa-heading">アプリとして使う</h2><p>ホーム画面から、今日の練習へ。</p></div></div>
      <p class="goal">ホーム画面に追加すると、アドレスバーのないアプリ画面で使えます。練習の進み具合はこの端末に保存します。</p>
      <button class="btn btn-primary btn-block" type="button" data-pwa-install hidden>ホーム画面に追加する</button>
      <details class="pwa-help" data-pwa-help ${ios ? 'open' : ''}><summary>${ios ? 'iPhone・iPadでの追加方法' : 'ホーム画面への追加方法'}</summary><ol>${steps}</ol></details>
      <p class="pwa-status" data-pwa-status role="status" aria-live="polite"></p>
    </section>`;
  }

  window.GolfPWA = { homeCard, settingsCard, sync };
  window.addEventListener('beforeinstallprompt', e => {
    if (!available() || isApp()) return;
    e.preventDefault(); promptEvent = e; installMessage = ''; sync();
  });
  window.addEventListener('appinstalled', () => { promptEvent = null; installMessage = 'ホーム画面に追加しました。アイコンから起動できます。'; sync(); });
  standalone.addEventListener('change', sync);
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  document.addEventListener('click', async e => {
    if (!e.target.closest('[data-pwa-install]') || !promptEvent || installing) return;
    const deferred = promptEvent;
    installing = true; installMessage = ''; sync();
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      installMessage = choice.outcome === 'accepted' ? '追加したアイコンから起動できます。' : 'あとからブラウザのメニューでも追加できます。';
    } catch (_) { installMessage = 'ブラウザのメニューからホーム画面に追加できます。'; }
    finally { installing = false; promptEvent = null; sync(); }
  });

  if (!available()) return;
  if (!('serviceWorker' in navigator)) { failed = true; return; }
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register(workerURL, { updateViaCache: 'none' });
      // activeは必要な一式の保存が成功したワーカー。既存版もそのまま使える。
      offlineReady = offlineReady || !!registration.active;
      sync();
      const watch = worker => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') { offlineReady = true; failed = false; }
          if (worker.state === 'redundant' && !registration.active) failed = true;
          sync();
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => { watch(registration.installing); sync(); });
      navigator.serviceWorker.ready.then(() => { offlineReady = true; failed = false; sync(); });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && navigator.onLine) registration.update().catch(() => {});
      });
    } catch (_) { failed = true; sync(); }
  });
})();
