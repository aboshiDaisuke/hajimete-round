/* tools/build_pwa.pyで配信ファイル一覧とバージョンを更新する。 */
// BEGIN PRECACHE
const VERSION = "19d6b359655b9496";
const APP_FILES = [
  "index.html",
  "manifest.webmanifest",
  "js/app.js",
  "js/avatar.js",
  "js/bgm-score.js",
  "js/bgm.js",
  "js/data.js",
  "js/game.js",
  "js/golfer3d.js",
  "js/lobby3d.js",
  "js/practice-flow.js",
  "js/putting.js",
  "js/pwa.js",
  "js/scene3d.js",
  "js/tempo.js",
  "css/style.css",
  "vendor/three/build/three.module.js",
  "vendor/three/examples/jsm/controls/OrbitControls.js",
  "vendor/three/examples/jsm/loaders/GLTFLoader.js",
  "vendor/three/examples/jsm/utils/BufferGeometryUtils.js",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
  "assets/hero.jpg",
  "assets/lobby-poster.png",
  "assets/face-female.jpg",
  "assets/face-male.jpg",
  "assets/ball-glb.js",
  "assets/lobby-glb.js",
  "assets/golfer-female-glb.js",
  "assets/golfer-male-glb.js",
  "assets/golfer-female-face.js",
  "assets/golfer-male-face.js"
];
// END PRECACHE

const CACHE_PREFIX = 'hajimete-round:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const INDEX_URL = new URL('index.html', self.registration.scope).href;
const APP_URLS = new Set(APP_FILES.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  // 全ファイルの保存に成功した版だけ有効にする。失敗時は旧版を維持。
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...APP_URLS].map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
  // skipWaitingを使わず、開いている練習やゲームを旧版で続けられるようにする。
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = ''; url.hash = '';
  const entry = event.request.mode === 'navigate' && (url.href === self.registration.scope || url.href === INDEX_URL);
  const key = entry ? INDEX_URL : url.href;
  // アプリ本体だけを扱い、外部フォントや別サイトの通信には介入しない。
  if (!APP_URLS.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(key)) || fetch(event.request);
  })());
});
