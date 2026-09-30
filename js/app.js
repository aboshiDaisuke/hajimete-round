/* =========================================================
   はじめてのラウンド — アプリ本体
   画面の切り替え（#ハッシュ）、進捗の保存、各画面の描画
   ========================================================= */
(function () {
  'use strict';
  const D = window.GOLF_DATA;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 日付 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const fmtMD = (s) => { const d = parse(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };
  const fmtYMD = (s) => { const d = parse(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };

  /* ---------- 保存データ ---------- */
  const KEY = 'hajimete-round-v1';
  function defaults() {
    const t = today();
    return {
      profile: { name: '', start: t, debut: addDays(t, 90), confirmed: false },
      done: {}, logs: [], checklist: {}, quizBest: null, puttBest: null, puttRounds: 0, tempoReps: 0, theme: 'system',
      xp: 0, badges: {}, daily: { date: '', counts: {}, claimed: {} }, cosmetic: { ball: 'white', wear: 'pine', chara: 'female' }, sound: true, bgm: true, bgmVolume: 0.45,
      game: { roundBest: null, nearpinBest: null, driveBest: null, tutorialSeen: false, holes: 0, courseBest: {}, sel: { course: 'hills', weather: 'auto' } },
      rounds: [], activity: {}, pace: { ext: 0, dismiss: '' }, lastMode: '15',
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw); const d = defaults();
        return Object.assign(d, s, {
          profile: Object.assign(d.profile, s.profile), game: Object.assign(d.game, s.game),
          cosmetic: Object.assign(d.cosmetic, s.cosmetic), daily: s.daily || d.daily, pace: Object.assign(d.pace, s.pace), activity: s.activity || {},
        });
      }
    } catch (e) { /* 保存できない環境でも動かす */ }
    return defaults();
  }
  let S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ } }

  function applyTheme() {
    const r = document.documentElement;
    if (S.theme === 'light' || S.theme === 'dark') r.setAttribute('data-theme', S.theme);
    else r.removeAttribute('data-theme');
  }
  applyTheme();
  const musicVolume = () => Number.isFinite(Number(S.bgmVolume)) ? Math.max(0, Math.min(1, Number(S.bgmVolume))) : 0.45;
  function musicForRoute() {
    if (route === 'tempo') return null;
    if (route === 'title' || route === 'welcome') return 'title';
    if (route === 'game-nearpin' || route === 'game-drive') return 'challenge';
    if (route.startsWith('game-')) return 'course';
    if (route === 'putting') return 'putt';
    return 'menu';
  }
  function syncMusicUI() {
    const music = window.GolfBGM;
    if (!music) return;
    const messages = { muted: '♪ BGM OFF', quiet: '♪ 音量 0%', waiting: '♪ タップしてBGMを聴く', paused: '♪ おやすみ中', off: '♪ BGMはおやすみ中', unavailable: '♪ この端末では音を再生できません' };
    const text = messages[music.status] || `♪ ${music.track ? music.track.title : 'ゴルフ・サウンドトラック'}`;
    $$('[data-music-state]').forEach(el => { el.textContent = text; });
    const value = Math.round(musicVolume() * 100);
    $$('[data-music-volume-label]').forEach(el => { el.textContent = value + '%'; });
  }
  window.addEventListener('golf-bgm-change', syncMusicUI);

  /* ---------- プログラム ---------- */
  const TOTAL_WEEKS = D.weeks.length;
  const curWeek = () => Math.min(TOTAL_WEEKS, Math.max(1, Math.floor(diffDays(S.profile.start, today()) / 7) + 1));
  const weekStart = (n) => addDays(S.profile.start, (n - 1) * 7);
  const weekOf = (n) => D.weeks[n - 1];
  const weekDone = (n) => weekOf(n).tasks.filter((t) => S.done[t.id]).length;
  const allTasks = () => D.weeks.reduce((a, w) => a + w.tasks.length, 0);
  const allDone = () => D.weeks.reduce((a, w) => a + weekDone(w.n), 0);
  const drillById = (id) => D.drills.find((d) => d.id === id);
  function completeTask(id, msg) {
    if (S.done[id]) return;
    S.done[id] = today(); save();
    toast(msg || 'タスクを達成しました');
    gain(20, 'メニュー達成'); track('task'); checkBadges();
  }

  /* ---------- レベル・バッジ・デイリーミッション ---------- */
  const TITLES_LV = [[15, 'シングルの卵'], [13, '100切りハンター'], [11, 'ボギーペース'], [9, 'コースデビュー級'], [7, 'ショートコース経験者'], [5, 'ナイスショット見習い'], [3, '打ちっぱなし常連'], [1, 'ビギナー']];
  const xpAt = (L) => 50 * L * (L - 1);
  const levelOf = (xp) => { let L = 1; while (xp >= xpAt(L + 1)) L++; return L; };
  const titleOf = (L) => TITLES_LV.find(([l]) => L >= l)[1];
  const skillOf = (L) => { const k = Math.min(L, 15) - 1; return { meet: 0.045 + k * 0.003, power: 1 + k * 0.01 }; };
  const level = () => levelOf(S.xp);
  const BALLS = [
    { id: 'white', name: 'ホワイト', color: '#f8f8f4', lv: 1 }, { id: 'yellow', name: 'イエロー', color: '#f5d90a', lv: 2 },
    { id: 'orange', name: 'オレンジ', color: '#ff8a1f', lv: 4 }, { id: 'pink', name: 'ピンク', color: '#ff7eb6', lv: 6 },
    { id: 'lime', name: 'ライム', color: '#a6e22e', lv: 8 }, { id: 'gold', name: 'ゴールド', color: '#d4a017', lv: 12 },
  ];
  const WEARS = [
    { id: 'pine', name: 'いつもの服', color: '#8fc78d', lv: 1, original: true }, { id: 'white', name: 'ホワイト', color: '#eeeeea', lv: 1 },
    { id: 'navy', name: 'ネイビー', color: '#1f3a68', lv: 3 }, { id: 'red', name: 'レッド', color: '#c8322b', lv: 5 },
    { id: 'sky', name: 'スカイ', color: '#5fb2e6', lv: 7 }, { id: 'flag', name: 'フラッグ', color: '#f2b705', lv: 10 },
    { id: 'black', name: 'ブラック', color: '#1a1d1b', lv: 14 },
  ];
  const ballColor = () => (BALLS.find(b => b.id === S.cosmetic.ball) || BALLS[0]).color;
  const wearColor = () => (WEARS.find(b => b.id === S.cosmetic.wear) || WEARS[0]).color;
  // 3Dキャラのシャツの色（「いつもの服」のときは設定画の色のまま = null）
  const wearTint = () => { const w = WEARS.find(b => b.id === S.cosmetic.wear) || WEARS[0]; return w.original ? null : w.color; };
  const charaId = () => (S.cosmetic.chara === 'male' ? 'male' : 'female');
  const BADGES = [
    { id: 'first-shot', name: 'はじめの一打', desc: 'ゲームで初めてショットした', kind: 'game' },
    { id: 'first-hole', name: 'ホールアウト', desc: '1ホールを最後までプレーした', kind: 'game' },
    { id: 'par', name: 'パーを取った', desc: 'ゲームでパー以上のスコア', kind: 'game' },
    { id: 'birdie', name: 'バーディー', desc: 'パーより1打少なく上がった', kind: 'game' },
    { id: 'eagle', name: 'イーグル', desc: 'パーより2打少なく上がった', kind: 'game' },
    { id: 'hio', name: 'ホールインワン', desc: '1打でカップイン', kind: 'game' },
    { id: 'chipin', name: 'チップイン', desc: 'グリーンの外から直接カップイン', kind: 'game' },
    { id: 'round-even', name: 'イーブンパー', desc: 'ショートラウンドをパー以内で回った', kind: 'game' },
    { id: 'course-lake', name: 'レイクサイド制覇', desc: 'レイクサイドで3ホールを回りきった', kind: 'game' },
    { id: 'course-links', name: 'リンクス制覇', desc: 'シーサイドリンクスで3ホールを回りきった', kind: 'game' },
    { id: 'all9', name: '9ホール完走', desc: '全9ホールを通しで回りきった', kind: 'game' },
    { id: 'rain-round', name: '雨の日ゴルファー', desc: '雨のなか1ラウンドを回りきった', kind: 'game' },
    { id: 'nearpin5', name: 'ニアピン', desc: 'ニアピンで5m以内に寄せた', kind: 'game' },
    { id: 'nearpin1', name: 'ベタピン', desc: 'ニアピンで1m以内に寄せた', kind: 'game' },
    { id: 'drive200', name: 'ビッグドライブ', desc: 'ドラコンで200y以上', kind: 'game' },
    { id: 'putt10', name: '距離感の達人', desc: 'パター距離感ゲームで10点以上', kind: 'game' },
    { id: 'putt15', name: 'パット・パーフェクト', desc: 'パター距離感ゲームで15点満点', kind: 'game' },
    { id: 'log1', name: '練習スタート', desc: 'はじめて練習を記録した', kind: 'practice' },
    { id: 'log10', name: '練習の虫', desc: '練習の記録が10回', kind: 'practice' },
    { id: 'streak3', name: '3日連続', desc: '3日続けて練習を記録した', kind: 'practice' },
    { id: 'tempo100', name: 'リズムキープ', desc: 'テンポ素振りを合計100回', kind: 'practice' },
    { id: 'week1', name: '1ホール完走', desc: '1週間のメニューを全部達成', kind: 'practice' },
    { id: 'month1', name: '基礎マスター', desc: 'WEEK 1〜4を全部達成', kind: 'practice' },
    { id: 'all12', name: '12ホール完走', desc: '12週プログラムを全部達成', kind: 'practice' },
    { id: 'quiz8', name: 'ルール博士', desc: 'クイズで8問以上正解', kind: 'learn' },
    { id: 'quiz10', name: 'ゴルフ博士', desc: 'クイズで10問全問正解', kind: 'learn' },
    { id: 'checklist', name: '準備万端', desc: 'デビューの持ち物を全部そろえた', kind: 'learn' },
  ];
  /* ---------- コースと天気の選択 ---------- */
  const COURSES = window.GolfScene.COURSES.concat([{ id: 'all', name: '全9ホール', desc: '3つのコースを続けて回る。パー33の本格ラウンド', lv: 5 }]);
  const WXS = [{ id: 'auto', name: 'おまかせ' }].concat(window.GolfScene.WEATHERS);
  const wxName = (id) => (WXS.find(w => w.id === id) || { name: '晴れ' }).name;
  const courseName = (id) => (COURSES.find(c => c.id === id) || COURSES[0]).name;
  function sel() {
    const g = S.game;
    if (!g.sel) g.sel = { course: 'hills', weather: 'auto' };
    const c = COURSES.find(x => x.id === g.sel.course);
    if (!c || c.lv > level()) g.sel.course = 'hills';
    if (!WXS.some(w => w.id === g.sel.weather)) g.sel.weather = 'auto';
    return g.sel;
  }
  // 過去のベスト（コース別）。以前の記録は「グリーンヒルズ」のものとして引き継ぐ
  const bestOf = (course) => (S.game.courseBest && S.game.courseBest[course] != null ? S.game.courseBest[course] : course === 'hills' ? S.game.roundBest : null);
  const pickWeather = (w) => w !== 'auto' ? w : ['sunny', 'sunny', 'cloudy', 'sunset', 'rain'][Math.floor(Math.random() * 5)];
  const parOf = (course) => (course === 'all' ? 33 : 11);
  const diffText = (d) => (d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`);

  const MISSIONS = {
    log: { text: '練習を記録する', n: 1, go: 'log' }, task: { text: '今週のメニューを1つ達成', n: 1, go: 'week' },
    tempo: { text: 'テンポ素振りを10回', n: 10, go: 'tempo' }, putt: { text: 'パター距離感ゲームを1ラウンド', n: 1, go: 'putting' },
    quiz: { text: 'ゴルフクイズに挑戦', n: 1, go: 'quiz' }, hole: { text: 'ゲームで1ホールプレー', n: 1, go: 'game-round' },
    nearpin5: { text: 'ニアピンで5m以内に寄せる', n: 1, go: 'game-nearpin' }, trivia: { text: 'うんちくを3つ読む', n: 3, go: 'home' },
    drive180: { text: 'ドラコンで180y以上', n: 1, go: 'game-drive' },
  };
  function todaysMissions() {
    const seed = Number(today().replace(/-/g, ''));
    const a = ['log', 'task', 'tempo'], b = ['putt', 'quiz', 'hole', 'nearpin5', 'trivia', 'drive180'];
    const r = (n, k) => Math.floor(seed / k) % n;
    const i = r(b.length, 3);
    let j = r(b.length, 7);
    if (j === i) j = (j + 1) % b.length;
    return [a[r(a.length, 1)], b[i], b[j]];
  }
  function daily() {
    if (!S.daily || S.daily.date !== today()) S.daily = { date: today(), counts: {}, claimed: {} };
    return S.daily;
  }
  function gain(xp, reason, silent) {
    if (!xp) return;
    const before = levelOf(S.xp);
    S.xp = Math.max(0, S.xp + xp);
    save();
    if (xp > 0 && !silent) toast(`+${xp} XP ${reason || ''}`);
    const after = levelOf(S.xp);
    if (after > before) levelUp(before, after);
  }
  // 練習した日（カレンダー用）。メニュー・記録・テンポ・パター・ドリルなど、体を動かしたときに数える
  const PRACTICE_KEYS = ['task', 'log', 'tempo', 'putt', 'drill'];
  function markActive(date, n) {
    if (!S.activity) S.activity = {};
    S.activity[date] = (S.activity[date] || 0) + (n || 1);
  }
  function track(key, n) {
    if (PRACTICE_KEYS.includes(key) && key !== 'log') markActive(today(), key === 'tempo' ? 0.2 : 1);
    const d = daily();
    d.counts[key] = (d.counts[key] || 0) + (n || 1);
    save();
    if (todaysMissions().includes(key) && !d.claimed[key] && d.counts[key] >= MISSIONS[key].n) {
      d.claimed[key] = true; save();
      toast(`ミッション達成「${MISSIONS[key].text}」 +40 XP`);
      gain(40, '', true);
    }
  }
  function award(id) {
    if (S.badges[id]) return;
    const b = BADGES.find(x => x.id === id);
    if (!b) return;
    S.badges[id] = today(); save();
    toast(`バッジ獲得「${b.name}」 +50 XP`);
    gain(50, '', true);
  }
  function checkBadges() {
    const n = S.logs.length;
    if (n >= 1) award('log1');
    if (n >= 10) award('log10');
    const full = (w) => weekDone(w.n) === w.tasks.length;
    if (D.weeks.some(full)) award('week1');
    if (D.weeks.slice(0, 4).every(full)) award('month1');
    if (D.weeks.every(full)) award('all12');
    if (D.checklist.every(c => S.checklist[c.id])) award('checklist');
    if (S.tempoReps >= 100) award('tempo100');
    const days = Array.from(new Set(S.logs.map(l => l.date))).sort();
    for (let i = 2; i < days.length; i++) if (diffDays(days[i - 2], days[i]) === 2) { award('streak3'); break; }
  }
  function levelUp(before, after) {
    const unlocked = [...BALLS.filter(b => b.lv > before && b.lv <= after).map(b => `ボール：${b.name}`),
      ...WEARS.filter(b => b.lv > before && b.lv <= after).map(b => `ウェア：${b.name}`)];
    const sk = skillOf(after), sk0 = skillOf(before);
    let el = $('#levelup');
    if (!el) { el = document.createElement('div'); el.id = 'levelup'; el.className = 'levelup'; document.body.appendChild(el); }
    el.innerHTML = `<div class="levelup-card" role="dialog" aria-modal="true" aria-labelledby="lu-t">
      <div class="eyebrow">LEVEL UP</div>
      <div class="lu-lv num" id="lu-t">Lv.${after}</div>
      <div class="lu-title">${esc(titleOf(after))}</div>
      <ul class="lu-list">
        ${sk.power > sk0.power ? `<li>ゲームのパワー <b>+${Math.round((sk.power - 1) * 100)}%</b></li><li>ナイスショットのゾーン幅 <b>${(sk.meet * 200).toFixed(1)}%</b></li>` : ''}
        ${unlocked.map(u => `<li>新しい着せ替え：<b>${esc(u)}</b></li>`).join('')}
      </ul>
      <button class="btn btn-primary btn-block" data-action="lu-close">やった！</button></div>`;
    el.hidden = false;
    confetti();
    if (window.GolfBGM && S.bgm !== false) window.GolfBGM.jingle('levelup');
    setTimeout(() => { const b = el.querySelector('button'); if (b) b.focus(); }, 50);
  }
  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
    document.body.appendChild(c);
    const x = c.getContext('2d');
    x.scale(devicePixelRatio, devicePixelRatio);
    const cols = ['#f2b705', '#3e8e57', '#ffffff', '#5fb2e6', '#ff7eb6'];
    const P = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 12 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)],
    }));
    const t0 = performance.now();
    (function step(t) {
      const k = (t - t0) / 2200;
      x.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of P) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        x.save(); x.globalAlpha = Math.max(0, 1 - k); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
      }
      if (k < 1) requestAnimationFrame(step); else c.remove();
    })(t0);
  }
  window.GolfFX = { confetti };

  function onGameEvent(e) {
    if (e.type === 'shot') { award('first-shot'); return; }
    if (e.type === 'hole') {
      S.game.holes++; track('hole'); award('first-hole');
      let xp = 15, why = 'ホールアウト';
      if (e.hio) { xp += 300; why = 'ホールインワン'; award('hio'); }
      else if (e.diff <= -2) { xp += 100; why = 'イーグル'; award('par'); award('birdie'); award('eagle'); }
      else if (e.diff === -1) { xp += 50; why = 'バーディー'; award('par'); award('birdie'); }
      else if (e.diff === 0) { xp += 20; why = 'パー'; award('par'); }
      if (e.chipin) { xp += 30; award('chipin'); }
      gain(xp, why);
    }
    if (e.type === 'round') {
      const all = e.course === 'all';
      const prev = bestOf(e.course);
      const best = prev == null || e.total < prev;
      if (!S.game.courseBest) S.game.courseBest = {};
      if (best) S.game.courseBest[e.course] = e.total;
      S.rounds.unshift({ date: today(), course: e.course, weather: e.weather, total: e.total, par: e.par, scores: e.scores });
      S.rounds.length = Math.min(S.rounds.length, 50);
      if (e.total <= e.par) award('round-even');
      if (e.course === 'lake' || all) award('course-lake');
      if (e.course === 'links' || all) award('course-links');
      if (all) award('all9');
      if (e.weather === 'rain') award('rain-round');
      gain(all ? 90 : 30, best ? 'ベストスコア更新' : 'ラウンド完了');
    }
    if (e.type === 'nearpin' && e.dist != null) {
      if (S.game.nearpinBest == null || e.dist < S.game.nearpinBest) S.game.nearpinBest = Math.round(e.dist * 10) / 10;
      if (e.dist <= 5) { track('nearpin5'); award('nearpin5'); }
      if (e.dist <= 1) award('nearpin1');
      gain(Math.max(5, Math.round(30 - e.dist * 3)), 'ニアピン');
    }
    if (e.type === 'drive' && e.yards > 0) {
      if (S.game.driveBest == null || e.yards > S.game.driveBest) S.game.driveBest = e.yards;
      if (e.yards >= 180) track('drive180');
      if (e.yards >= 200) award('drive200');
      gain(Math.round(e.yards / 10), 'ドラコン');
    }
    save();
  }

  /* ---------- アイコン ---------- */
  const P = {
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    sound: '<path d="M11 4L6 8H3v8h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 4L6 8H3v8h3l5 4z"/><path d="M16 9l6 6M22 9l-6 6"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20"/>',
    chart: '<path d="M3 21h18"/><path d="M6 17v-6"/><path d="M11 17V6"/><path d="M16 17v-9"/><path d="M21 17v-4"/>',
    gear: '<path d="M4 6h9"/><path d="M17 6h3"/><circle cx="15" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="17" cy="18" r="2"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    metronome: '<path d="M8 21h8L14 3h-4z"/><path d="M12 15l5-8"/><path d="M9 17h6"/>',
    hole: '<ellipse cx="12" cy="18" rx="8" ry="2.6"/><path d="M12 18V3l6 3-6 3"/>',
    cube: '<path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z"/><path d="M12 12l8.5-4.7M12 12v9.5M12 12L3.5 7.3"/>',
    shield: '<path d="M12 3l7 3v6c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.6 1 2.5h6c0-.9.3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.7v.6"/><path d="M12 17h.01"/>',
    abc: '<path d="M3 18l4.5-12L12 18"/><path d="M4.7 14h5.6"/><path d="M15 10h6"/><path d="M15 14h6"/><path d="M15 18h6"/>',
    bag: '<rect x="6" y="7" width="12" height="14" rx="2"/><path d="M9 7V4h6v3"/><path d="M6 12h12"/>',
    club: '<path d="M8 3l5.5 15"/><path d="M13.5 18l4.5 1.2-.8 2.3-4.9-1.3z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h8"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  /* ---------- 図解（SVG） ---------- */
  function clockSVG(spec) {
    const map = { '9-3': [9, 3, '腰から腰'], '10-2': [10, 2, '肩から肩'], '7-5': [7.5, 4.5, 'ひざからひざ'], full: [11, 1, 'フルスイング'] };
    const [from, to, name] = map[spec] || map['9-3'];
    const cx = 180, cy = 110, R = 80;
    const pt = (h, r) => { const a = h * 30 * Math.PI / 180; return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; };
    const [x1, y1] = pt(from, R), [x2, y2] = pt(to, R);
    const span = ((from - to) * 30 + 360) % 360;
    const ticks = Array.from({ length: 12 }, (_, i) => { const [a, b] = pt(i, R - 6), [c, d] = pt(i, R + 6); return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="sv-stroke" stroke-width="${i % 3 ? 1.5 : 3}"/>`; }).join('');
    const lbl = (h, t) => { const [a, b] = pt(h, R + 22); return `<text x="${a}" y="${b + 5}" text-anchor="middle" class="sv-muted" font-size="14" font-family="Barlow Condensed, sans-serif" font-weight="600">${t}</text>`; };
    const [bx, by] = pt(from, R + 34), [fx, fy] = pt(to, R + 34);
    return `<svg viewBox="0 0 360 240" role="img" aria-label="スイングの振り幅：${from}時から${to}時">
      <circle cx="${cx}" cy="${cy}" r="${R}" class="sv-dial" stroke-width="2"/>${ticks}
      ${lbl(0, '12')}${lbl(3, '3')}${lbl(6, '6')}${lbl(9, '9')}
      <path d="M${x1} ${y1} A${R} ${R} 0 ${span > 180 ? 1 : 0} 0 ${x2} ${y2}" fill="none" class="sv-accent" stroke-width="10" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${pt(6, R)[0]}" y2="${pt(6, R)[1]}" class="sv-stroke" stroke-width="3" stroke-dasharray="4 5"/>
      <circle cx="${cx}" cy="${cy}" r="7" class="sv-ink-f"/>
      <circle cx="${x1}" cy="${y1}" r="9" class="sv-grass-f"/><circle cx="${x2}" cy="${y2}" r="9" class="sv-grass-f"/>
      <text x="${Math.max(40, Math.min(320, bx))}" y="${Math.max(18, by)}" text-anchor="middle" class="sv-ink-f" font-size="13" font-weight="700">テークバック</text>
      <text x="${Math.max(40, Math.min(320, fx))}" y="${Math.max(18, fy)}" text-anchor="middle" class="sv-ink-f" font-size="13" font-weight="700">フォロー</text>
      <text x="${cx}" y="232" text-anchor="middle" class="sv-muted" font-size="13">正面から見た手元の位置（${esc(name)}）</text>
    </svg>`;
  }
  function ballposSVG() {
    const ball = (x, t) => `<circle cx="${x}" cy="92" r="9" class="sv-ball"/><text x="${x}" y="68" text-anchor="middle" class="sv-ink-f" font-size="13" font-weight="700">${t}</text><line x1="${x}" y1="74" x2="${x}" y2="82" class="sv-stroke" stroke-width="1.5"/>`;
    return `<svg viewBox="0 0 360 230" role="img" aria-label="クラブごとのボールの位置（上から見た図）">
      <line x1="20" y1="92" x2="340" y2="92" class="sv-stroke" stroke-width="1.5" stroke-dasharray="5 6"/>
      <path d="M52 30 H20 M20 30 l10 -7 M20 30 l10 7" class="sv-stroke" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <text x="58" y="35" class="sv-muted" font-size="13" font-weight="700">目標の方向</text>
      <rect x="84" y="128" width="44" height="72" rx="20" class="sv-foot"/>
      <rect x="232" y="128" width="44" height="72" rx="20" class="sv-foot"/>
      <text x="106" y="222" text-anchor="middle" class="sv-muted" font-size="13">左足</text>
      <text x="254" y="222" text-anchor="middle" class="sv-muted" font-size="13">右足</text>
      <line x1="180" y1="104" x2="180" y2="200" class="sv-stroke" stroke-width="1" stroke-dasharray="3 5"/>
      ${ball(112, 'ドライバー')}${ball(150, 'UT・FW')}${ball(206, 'アイアン')}
    </svg>`;
  }
  function teeSVG() {
    return `<svg viewBox="0 0 360 210" role="img" aria-label="ドライバーのティーの高さ">
      <line x1="20" y1="170" x2="340" y2="170" class="sv-stroke" stroke-width="2"/>
      <rect x="184" y="126" width="6" height="52" class="sv-accent-f"/>
      <path d="M175 126 h24 l-8 8 h-8 z" class="sv-accent-f"/>
      <circle cx="187" cy="104" r="23" class="sv-ball"/>
      <path d="M70 104 h80 a14 14 0 0 1 14 14 v38 a14 14 0 0 1 -14 14 h-66 a14 14 0 0 1 -14 -14 z" class="sv-head"/>
      <line x1="60" y1="104" x2="300" y2="104" class="sv-grass-s" stroke-width="2" stroke-dasharray="6 5"/>
      <text x="222" y="80" class="sv-ink-f" font-size="14" font-weight="700">ボールの半分が</text>
      <text x="222" y="98" class="sv-ink-f" font-size="14" font-weight="700">ヘッドより上</text>
      <text x="110" y="196" text-anchor="middle" class="sv-muted" font-size="13">ドライバーのヘッド</text>
    </svg>`;
  }
  function pendulumSVG() {
    const ghost = (deg) => `<g transform="rotate(${deg} 180 70)" opacity=".35"><line x1="150" y1="70" x2="180" y2="140" class="sv-stroke" stroke-width="3"/><line x1="210" y1="70" x2="180" y2="140" class="sv-stroke" stroke-width="3"/><line x1="180" y1="140" x2="180" y2="186" class="sv-stroke" stroke-width="3"/></g>`;
    return `<svg viewBox="0 0 360 230" role="img" aria-label="肩を支点にした振り子のストローク">
      ${ghost(-16)}${ghost(16)}
      <path d="M140 196 A120 120 0 0 0 220 196" fill="none" class="sv-accent" stroke-width="6" stroke-linecap="round"/>
      <circle cx="180" cy="36" r="18" class="sv-dial" stroke-width="2"/>
      <line x1="140" y1="70" x2="220" y2="70" class="sv-stroke" stroke-width="4" stroke-linecap="round"/>
      <line x1="150" y1="70" x2="180" y2="140" class="sv-ink-s" stroke-width="4"/>
      <line x1="210" y1="70" x2="180" y2="140" class="sv-ink-s" stroke-width="4"/>
      <line x1="180" y1="140" x2="180" y2="186" class="sv-ink-s" stroke-width="4"/>
      <rect x="166" y="184" width="28" height="10" rx="3" class="sv-ink-f"/>
      <circle cx="180" cy="70" r="5" class="sv-grass-f"/>
      <text x="236" y="74" class="sv-ink-f" font-size="13" font-weight="700">肩が支点</text>
      <text x="180" y="222" text-anchor="middle" class="sv-muted" font-size="13">三角形の形を変えずに、左右同じ大きさで</text>
    </svg>`;
  }
  function illus(svg) {
    if (!svg) return '';
    let out = '';
    if (svg.startsWith('clock:')) out = clockSVG(svg.slice(6));
    else if (svg === 'ballpos') out = ballposSVG();
    else if (svg === 'tee') out = teeSVG();
    else if (svg === 'pendulum') out = pendulumSVG();
    return `<figure class="illus" style="margin:0">${out}</figure>`;
  }

  /* ---------- ルーティング ---------- */
  const TAB_OF = (r) => {
    if (r === 'home') return 'home';
    if (r === 'plan' || r.startsWith('week-') || r === 'practice' || r.startsWith('drill-') || r === 'tempo') return 'practice';
    if (r === 'play' || r === 'rounds' || r === 'putting' || r.startsWith('game-')) return 'play';
    if (r === 'my' || r === 'log' || r === 'settings') return 'my';
    return 'learn';
  };
  const PARENT = (r) => {
    if (r.startsWith('week-')) return 'plan';
    if (r === 'plan' || r.startsWith('drill-') || r === 'tempo') return 'practice';
    if (r === 'rounds' || r === 'putting' || r.startsWith('game-')) return 'play';
    if (r === 'log' || r === 'settings') return 'my';
    if (['course', 'history', 'trivia', 'quiz', 'glossary', 'rules', 'debut', 'clubs'].includes(r)) return 'learn';
    return null;
  };
  const TITLES = {
    plan: '12週プログラム', practice: '練習', learn: '学ぶ', log: '練習の記録', settings: '設定',
    play: 'プレー', rounds: 'ラウンドの記録', my: 'マイページ', 'game-round': 'ショートラウンド', 'game-nearpin': 'ニアピンチャレンジ', 'game-drive': 'ドラコンチャレンジ',
    tempo: 'テンポ練習', putting: 'パター距離感ゲーム', course: '3Dコース図鑑', history: 'ゴルフの歴史',
    trivia: 'ゴルフのうんちく', quiz: 'ゴルフクイズ', glossary: '用語集', rules: 'ルールとマナー', debut: 'デビュー準備', clubs: 'クラブの基本',
  };
  let route = 'home';
  function go(r) {
    if (r === route) { render(); return; }
    try { location.hash = r; } catch (e) { route = r; render(); }
  }
  function currentRoute() {
    const h = (location.hash || '').replace(/^#/, '');
    return h || 'title';
  }

  /* ---------- 共通パーツ ---------- */
  function appbar() {
    const parent = PARENT(route);
    const bar = $('#appbar');
    if (route === 'home') {
      bar.innerHTML = `<div class="appbar-inner">
        <div class="brand"><img src="assets/icon-192.png" alt="" width="32" height="32">
          <div><div class="brand-name">はじめてのラウンド</div></div></div>
        <button class="icon-btn" data-go="title" aria-label="タイトル画面">${icon('flag')}</button>
        <button class="icon-btn" data-go="settings" aria-label="設定">${icon('gear')}</button></div>`;
      return;
    }
    let title = TITLES[route] || '';
    if (route.startsWith('week-')) title = `WEEK ${route.slice(5)}`;
    if (route === 'game-round' && sel().course === 'all') title = '全9ホールラウンド';
    if (route.startsWith('drill-')) { const d = drillById(route.slice(6)); title = d ? d.name : 'ドリル'; }
    bar.innerHTML = `<div class="appbar-inner">
      ${parent ? `<button class="icon-btn" data-back="${parent}" aria-label="戻る">${icon('back')}</button>` : '<span style="width:4px"></span>'}
      <h1>${esc(title)}</h1>
      ${route === 'home' ? '' : `<button class="icon-btn" data-go="settings" aria-label="設定">${icon('gear')}</button>`}</div>`;
  }
  function tabbar() {
    const tabs = [['home', 'ホーム', 'home'], ['practice', '練習', 'target'], ['play', 'プレー', 'play'], ['learn', '学ぶ', 'book'], ['my', 'マイ', 'user']];
    const cur = TAB_OF(route);
    $('#tabbar').innerHTML = `<div class="tabbar-inner">${tabs.map(([r, l, i]) =>
      `<a class="tab" href="#${r}" ${cur === r ? 'aria-current="page"' : ''}>${icon(i)}<span>${l}</span></a>`).join('')}</div>`;
  }
  const toastQ = [];
  let toastBusy = false;
  function toast(msg) {
    toastQ.push(msg);
    if (toastQ.length > 4) toastQ.splice(0, toastQ.length - 4);
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    const msg = toastQ.shift();
    if (!msg) { toastBusy = false; el.hidden = true; return; }
    toastBusy = true;
    el.textContent = msg; el.hidden = false;
    setTimeout(nextToast, toastQ.length ? 1500 : 2200);
  }

  function xpBar() {
    const L = level(), a = xpAt(L), b = xpAt(L + 1);
    const pct = Math.round((S.xp - a) / (b - a) * 100);
    return `<div class="xp"><div class="xp-row"><span class="num">Lv.<b>${L}</b></span><span class="xp-title">${esc(titleOf(L))}</span><span class="num xp-next">次まで ${b - S.xp} XP</span></div>
      <div class="progress xp-bar" role="progressbar" aria-label="次のレベルまで" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div></div>`;
  }
  const CHARAS = [['female', '女性', 'ピンクのバイザーとグリーンのポロ'], ['male', '男性', 'オレンジのキャップとポロ']];
  function charaPicker() {
    return `<section class="chara-pick" aria-labelledby="cp-h">
      <h2 id="cp-h">使うキャラクターを選ぶ</h2>
      <div class="chara-opts" role="radiogroup" aria-label="使うキャラクター">${CHARAS.map(([id, nm, d]) => `<button class="chara-opt ${charaId() === id ? 'on' : ''}" role="radio" aria-checked="${charaId() === id}" data-chara="${id}">
        <img src="assets/face-${id}.jpg" alt="" width="56" height="56"><span><b>${nm}</b><small>${d}</small></span>${charaId() === id ? `<i class="chara-check" aria-hidden="true">${icon('check')}</i>` : ''}</button>`).join('')}</div>
      <p class="chara-hint">ここで選んだキャラが、ショートラウンドやニアピンなどのゲームに出てきます。</p>
    </section>`;
  }
  function playerCard() {
    const L = level(), sk = skillOf(L);
    return `<section class="player-card" aria-label="プレーヤー">
      <div class="pc-avatar" id="avatar-host" role="img" aria-label="ゴルファー（タップすると喜びます）" style="--wear:${wearColor()};--ball:${ballColor()}"><span class="pc-head"></span><span class="pc-body"></span><span class="pc-ball"></span></div>
      <div class="pc-main">${xpBar()}
        <div class="pc-stats"><span>パワー <b class="num">+${Math.round((sk.power - 1) * 100)}%</b></span><span>ミート <b class="num">${(sk.meet * 200).toFixed(1)}%</b></span><span>バッジ <b class="num">${Object.keys(S.badges).length}/${BADGES.length}</b></span></div>
      </div></section>`;
  }
  function missionsCard() {
    const d = daily();
    const ms = todaysMissions();
    const done = ms.filter(k => d.claimed[k]).length;
    return `<section class="card missions" aria-labelledby="ms-h">
      <div class="section-head"><h2 id="ms-h">今日のミッション</h2><span class="num ms-count">${done}/3</span></div>
      <ul class="ms-list">${ms.map(k => {
        const m = MISSIONS[k], c = Math.min(m.n, d.counts[k] || 0), ok = d.claimed[k];
        const go = m.go === 'week' ? `week-${curWeek()}` : m.go;
        return `<li class="${ok ? 'ok' : ''}"><span class="ms-ic" aria-hidden="true">${ok ? icon('check') : icon('star')}</span>
          <span class="ms-t">${esc(m.text)}${m.n > 1 ? ` <span class="num">(${c}/${m.n})</span>` : ''}</span>
          ${ok ? '<span class="tag">+40 XP</span>' : `<a class="ms-go" href="#${go}">やる</a>`}</li>`;
      }).join('')}</ul>
      <p class="goal" style="font-size:13px">毎日0時に新しいミッションに変わります。</p>
    </section>`;
  }

  function taskItem(t) {
    const d = t.drill ? drillById(t.drill) : null;
    let link = '';
    if (d) link = `<a href="#drill-${d.id}">ドリル：${esc(d.name)}</a>`;
    if (t.tool === 'putting') link += `${link ? ' ' : ''}<a href="#putting">ゲームを開く</a>`;
    if (t.link) link = `<a href="#${t.link}">${esc(TITLES[t.link] || '開く')}を開く</a>`;
    return `<li class="task"><label>
      <input type="checkbox" data-task="${t.id}" ${S.done[t.id] ? 'checked' : ''}>
      <span class="check" aria-hidden="true">${icon('check')}</span>
      <span class="task-body"><span class="task-text">${esc(t.text)}</span>
      <span class="task-meta"><span class="tag ${t.where === '自宅' ? 'tag-sand' : ''}">${esc(t.where)}</span>${link}</span></span>
    </label></li>`;
  }

  function progressBar(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    return `<div class="progress-row"><div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div><span class="num">${done}/${total}</span></div>`;
  }

  function scorecard() {
    const now = curWeek();
    const cell = (w) => {
      const d = weekDone(w.n), t = w.tasks.length;
      const cls = d === t ? 'done' : d > 0 ? 'part' : '';
      return `<td><button class="sc-cell" data-go="week-${w.n}" aria-label="WEEK ${w.n} ${esc(w.title)} ${d}/${t}">
        <span class="sc-mark ${cls} ${w.n === now ? 'now' : ''}">${d || (w.n <= now ? '0' : '·')}</span></button></td>`;
    };
    const half = (a, b) => D.weeks.slice(a, b);
    const sumPar = (ws) => ws.reduce((s, w) => s + w.tasks.length, 0);
    const sumDone = (ws) => ws.reduce((s, w) => s + weekDone(w.n), 0);
    const A = half(0, 6), B = half(6, 12);
    return `<div class="scorecard"><div class="scorecard-scroll"><table>
      <thead><tr><th scope="row">WEEK</th>${A.map(w => `<th>${w.n}</th>`).join('')}<th>OUT</th>${B.map(w => `<th>${w.n}</th>`).join('')}<th>IN</th></tr></thead>
      <tbody>
        <tr><th scope="row">PAR</th>${A.map(w => `<td>${w.tasks.length}</td>`).join('')}<td class="out">${sumPar(A)}</td>${B.map(w => `<td>${w.tasks.length}</td>`).join('')}<td class="in">${sumPar(B)}</td></tr>
        <tr><th scope="row">達成</th>${A.map(cell).join('')}<td class="out">${sumDone(A)}</td>${B.map(cell).join('')}<td class="in">${sumDone(B)}</td></tr>
      </tbody></table></div>
      <div class="sc-legend"><span><i style="background:var(--grass)"></i>全部できた</span><span><i style="border-color:var(--grass)"></i>途中</span><span><i style="border-color:var(--flag)"></i>今週</span><span>PAR＝その週のメニュー数</span></div>
    </div>`;
  }

  /* ---------- 無理なく続けるための仕組み ---------- */
  // 1週の目安：メニューの6割できればOK（全部やらなくていい）
  const okCount = (w) => Math.ceil(w.tasks.length * 0.6);
  const taskHref = (t) => t.drill ? `drill-${t.drill}` : t.tool ? t.tool : t.link ? t.link : `week-${D.weeks.find(w => w.tasks.includes(t)).n}`;
  // 練習した日の数（活動のあった日＋記録を残した日）
  function activityMap() {
    const m = {};
    Object.entries(S.activity || {}).forEach(([d, v]) => { m[d] = (m[d] || 0) + v; });
    S.logs.forEach(l => { m[l.date] = (m[l.date] || 0) + 3; });
    return m;
  }
  const practicedDays = () => Object.entries(activityMap()).filter(([, v]) => v >= 1).map(([d]) => d);
  // ペースをゆっくりにする：WEEK target が「今日から」始まるように、開始日とデビュー日を後ろへずらす
  function slowDown(target) {
    const shift = diffDays(weekStart(target), today());
    if (shift <= 0) { toast(`WEEK ${target} は今日はじまったばかり。このままで大丈夫`); return; }
    S.profile.start = addDays(S.profile.start, shift);
    S.profile.debut = addDays(S.profile.debut, shift);
    S.pace.ext = (S.pace.ext || 0) + 1;
    S.pace.dismiss = `${S.profile.start}:${curWeek()}`;        // ずらした直後は、ペースのひとことを出さない
    save();
    toast(`WEEK ${target} を今日から1週間。デビュー予定は${fmtMD(S.profile.debut)}に`);
  }
  // ホームに出す「ペースのひとこと」（出さないときは null）
  function paceNote() {
    if (!S.profile.confirmed) return null;
    const n = curWeek(), w = weekOf(n);
    const key = `${S.profile.start}:${n}`;
    const days = practicedDays().filter(d => d < today()).sort();
    const last = days[days.length - 1];
    const gap = last ? diffDays(last, today()) : null;
    const dayIn = diffDays(weekStart(n), today());          // 今週の何日目か（0〜6）
    if (gap != null && gap >= 7 && S.pace.dismiss !== 'back:' + today()) {
      return { id: 'back:' + today(), eyebrow: 'WELCOME BACK', title: `おかえりなさい。${gap}日ぶりですね`,
        body: 'あいた分は気にしなくて大丈夫。今日できることを1つだけやってみましょう。',
        slow: n > 1 ? `ひとつ前の週（WEEK ${n - 1}）からやり直す` : null, target: n - 1, keep: `WEEK ${n} から続ける` };
    }
    if (S.pace.dismiss === key) return null;
    if (n > 1 && dayIn <= 2 && weekDone(n - 1) < okCount(weekOf(n - 1))) {
      const pw = weekOf(n - 1);
      return { id: key, eyebrow: 'PACE', title: `先週の「${pw.title}」は、まだ途中です`,
        body: '残りは気にせず、新しいテーマに進んでOK。もう少し先週のテーマを続けたいなら、1週ゆっくりにできます。',
        slow: `「${pw.title}」をもう1週つづける`, target: n - 1, keep: `このまま WEEK ${n} へ` };
    }
    if (n < TOTAL_WEEKS && dayIn >= 4 && weekDone(n) < okCount(w)) {
      return { id: key, eyebrow: 'PACE', title: `今週はあと${7 - dayIn}日。いそがなくて大丈夫`,
        body: `目安は${okCount(w)}つ（いま${weekDone(n)}つ）。むずかしい週は、このテーマを今日からもう1週間つづけてもOKです。`,
        slow: 'もう1週つづける', target: n, keep: 'このままでOK' };
    }
    return null;
  }
  function paceCard() {
    const p = paceNote();
    if (!p) return '';
    return `<section class="card pace-card" aria-labelledby="pc-h">
      <div class="eyebrow">${p.eyebrow}</div><h2 id="pc-h">${esc(p.title)}</h2><p class="goal">${esc(p.body)}</p>
      <div class="btn-row">${p.slow ? `<button class="btn btn-pine" data-action="slow" data-week="${p.target}">${esc(p.slow)}</button>` : ''}<button class="btn btn-ghost" data-pace-ok="${esc(p.id)}">${esc(p.keep)}</button></div>
    </section>`;
  }

  // 今日の時間に合わせたおすすめ（5分／15分／練習場）
  const MODES = [['5', '5分だけ'], ['15', '15分'], ['range', '練習場に行く']];
  function suggestion(mode) {
    const n = curWeek();
    const pool = weekOf(n).tasks.filter(t => !S.done[t.id]).concat(n > 1 ? weekOf(n - 1).tasks.filter(t => !S.done[t.id]) : []);
    const seed = Math.floor(parse(today()) / 86400000);
    if (mode === 'range') {
      const t = pool.find(x => x.where === '練習場');
      return t ? { href: taskHref(t), t: '今日の練習場メニュー', sub: t.text, note: '球数は半分でもOK。打ったら記録しよう' }
        : { href: 'log', t: '練習場で好きに打とう', sub: '今週の練習場メニューはクリア済み', note: '打ったら記録しよう' };
    }
    if (mode === '15') {
      const t = pool.find(x => ['自宅', 'どこでも', 'アプリ'].includes(x.where));
      if (t) return { href: taskHref(t), t: '今日の15分練習', sub: t.text, note: '終わったらチェックを付けよう' };
      const home = D.drills.filter(d => d.where !== '練習場');
      const d = home[seed % home.length];
      return { href: `drill-${d.id}`, t: '今日の15分練習', sub: `ドリル「${d.name}」`, note: `目安 ${d.time}` };
    }
    const quick = [
      { href: 'tempo', t: '今日の5分練習', sub: 'テンポ素振りを10回', note: '音に合わせて振るだけ' },
      { href: 'putting', t: '今日の5分練習', sub: 'パター距離感を1ラウンド', note: '5球だけの勝負' },
      { href: 'drill-grip', t: '今日の5分練習', sub: 'グリップを作る→ほどくを10回', note: 'テレビを見ながらでもOK' },
      { href: 'drill-stretch', t: '今日の5分練習', sub: 'ゴルフのストレッチ', note: '体をほぐすだけでも練習' },
    ];
    return quick[seed % quick.length];
  }
  function modeNow() { const d = daily(); return d.mode || S.lastMode || '15'; }

  // 練習カレンダー（直近13週。1マス=1日、濃いほどたくさん）
  function practiceCalendar() {
    const m = activityMap();
    const t = today();
    const dow = (parse(t).getDay() + 6) % 7;                 // 月曜=0
    const start = addDays(t, -dow - 7 * 12);
    let cells = '', months = '';
    let lastMonth = -1;
    for (let c = 0; c < 13; c++) {
      const colStart = addDays(start, c * 7);
      const mo = parse(colStart).getMonth();
      if (mo !== lastMonth) { months += `<span style="grid-column:${c + 1}">${mo + 1}月</span>`; lastMonth = mo; }
      for (let r = 0; r < 7; r++) {
        const d = addDays(colStart, r);
        const v = m[d] || 0;
        const lv = d > t ? 'fut' : v >= 4 ? 'l3' : v >= 2 ? 'l2' : v >= 1 ? 'l1' : 'l0';
        const mark = d === S.profile.debut ? ' debut' : d === t ? ' today' : '';
        cells += `<i class="${lv}${mark}" style="grid-column:${c + 1};grid-row:${r + 1}" title="${fmtMD(d)}${v >= 1 ? ' 練習した' : ''}"></i>`;
      }
    }
    return `<div class="cal" role="img" aria-label="直近13週の練習カレンダー。練習した日は${practicedDays().length}日">
      <div class="cal-m" aria-hidden="true">${months}</div>
      <div class="cal-g" aria-hidden="true">${cells}</div>
      <div class="cal-legend" aria-hidden="true"><span>少ない</span><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>多い</span><span class="cal-dl"><i class="l0 today"></i>今日</span></div>
    </div>`;
  }
  function practiceTotals() {
    const days = practicedDays().length;
    const mins = S.logs.reduce((a, l) => a + (Number(l.minutes) || 0), 0);
    const balls = S.logs.reduce((a, l) => a + (Number(l.balls) || 0), 0);
    const tasks = Object.keys(S.done).length;
    return `<div class="totals">
      <div><b class="num">${days}</b><span>練習した日</span></div>
      <div><b class="num">${tasks}</b><span>できたメニュー</span></div>
      <div><b class="num">${S.tempoReps}</b><span>テンポ素振り</span></div>
      <div><b class="num">${balls.toLocaleString()}</b><span>打った球</span></div>
      <div><b class="num">${(mins / 60).toFixed(mins % 60 ? 1 : 0)}</b><span>練習時間（h）</span></div>
    </div>`;
  }
  // 今週（月〜日）の練習した日を7つの丸で
  function weekDots() {
    const m = activityMap(), t = today();
    const dow = (parse(t).getDay() + 6) % 7;
    const mon = addDays(t, -dow);
    const labels = ['月', '火', '水', '木', '金', '土', '日'];
    let n = 0;
    const dots = labels.map((l, i) => {
      const d = addDays(mon, i), on = (m[d] || 0) >= 1;
      if (on) n++;
      return `<span class="wd ${on ? 'on' : ''} ${d === t ? 'today' : ''} ${d > t ? 'fut' : ''}"><i>${on ? icon('check') : ''}</i>${l}</span>`;
    }).join('');
    return `<a class="week-dots" href="#my" aria-label="今週の練習 ${n}日。これまで${practicedDays().length}日">
      <span class="wd-h"><b>今週の練習</b><small>これまで <b class="num">${practicedDays().length}</b> 日</small></span>
      <span class="wd-row">${dots}</span></a>`;
  }

  /* ---------- 画面: ホーム ---------- */
  let triviaIdx = null;
  // 練習を記録した日が、今日（または昨日）から何日つながっているか
  function logStreak() {
    const days = new Set(S.logs.map(l => l.date));
    let d = today();
    if (!days.has(d)) d = addDays(d, -1);
    let n = 0;
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }
  function viewHome() {
    const n = curWeek(), w = weekOf(n);
    const L = level(), a = xpAt(L), b = xpAt(L + 1);
    const pct = Math.round((S.xp - a) / (b - a) * 100);
    const left = diffDays(today(), S.profile.debut);
    const debut = left > 0 ? `デビューまで<b class="num">${left}</b>日` : left === 0 ? '今日がデビュー！' : `デビューから<b class="num">${-left}</b>日`;
    const streak = logStreak();
    const d = daily(), ms = todaysMissions();
    const msDone = ms.filter(k => d.claimed[k]).length;
    const name = S.profile.name ? `${esc(S.profile.name)}さん、` : '';
    const pend = w.tasks.filter(t => !S.done[t.id]);
    const okW = okCount(w);
    const say = pend.length === 0 ? `${name}今週のメニュー、全部できたね！` : weekDone(n) >= okW ? `${name}今週の目安はクリア！あとはのんびりでOK` : msDone === ms.length ? `${name}今日のミッション、全部クリア！` : `${name}今日も少しだけ、いっしょに練習しよう`;
    if (triviaIdx == null) triviaIdx = Math.floor(parse(today()) / 86400000) % D.trivia.length;
    const tv = D.trivia[triviaIdx];
    const mode = modeNow();
    const cta = suggestion(mode);
    const ok = okCount(w), wd = weekDone(n);

    const welcome = S.profile.confirmed ? '' : `<section class="card welcome" aria-labelledby="wl">
      <div class="eyebrow">WELCOME</div><h2 id="wl">90日でコースデビューしよう</h2>
      <p class="lead">練習開始日を ${fmtMD(S.profile.start)}、デビュー予定日を <strong>${fmtYMD(S.profile.debut)}</strong> にしています。</p>
      <div class="btn-row"><button class="btn btn-primary" data-action="confirm">この日程ではじめる</button><button class="btn btn-ghost" data-go="settings">日程を変える</button></div>
    </section>`;

    return `
    <section class="home-stage home-course-stage" aria-label="あなたのゴルファー">
      <div class="home-course-caption"><span class="launch-kicker">YOUR DAILY CLUBHOUSE</span><h2>${S.profile.name ? `${esc(S.profile.name)}さん、おかえり。` : '今日も、ナイスな一日に。'}</h2></div>
      <div class="home-lobby lobby-host" id="home-lobby" role="img" aria-label="選んだゴルファーと立体のゴルフコース。ドラッグで見渡せます。"><img class="lobby-poster" src="assets/lobby-poster.png" alt=""></div>
      <div class="home-hud">
        <a class="home-lv" href="#my" aria-label="レベル ${L}、${esc(titleOf(L))}。マイページを開く">
          <span class="num home-lv-n">Lv.<b>${L}</b></span>
          <span class="home-lv-t">${esc(titleOf(L))}</span>
          <span class="home-xp" aria-hidden="true"><span style="width:${pct}%"></span></span>
        </a>
        <div class="home-chips"><span class="home-chip home-chip-debut">${debut}</span>${streak >= 2 ? `<span class="home-chip home-chip-hot">練習<b class="num">${streak}</b>日連続</span>` : ''}</div>
      </div>
      <p class="home-say">${say}</p>
    </section>
    <div class="page home-page">
      <a class="go-cta" href="#${cta.href}"><span class="go-ic" aria-hidden="true">${icon('target')}</span>
        <span class="go-t"><b>${cta.t}</b><small>${esc(cta.sub)}</small></span></a>
      <div class="home-shortcuts" aria-label="クイックメニュー"><a href="#play">${icon('play')}<span>ラウンドで遊ぶ</span><span aria-hidden="true">↗</span></a><a href="#plan">${icon('flag')}<span>12週のマイコース</span><span aria-hidden="true">↗</span></a></div>
      <div class="today-pick">
        <span class="tp-l" id="tp-l">今日はどれくらい？</span>
        <div class="seg" role="radiogroup" aria-labelledby="tp-l">${MODES.map(([k, l]) => `<button class="seg-b" role="radio" aria-checked="${mode === k}" data-mode="${k}">${l}</button>`).join('')}</div>
        <p class="tp-note">${esc(cta.note)}</p>
      </div>
      ${welcome}
      ${paceCard()}
      ${weekDots()}
      <section class="card week-card" aria-labelledby="tw">
        <div class="top"><div class="hole-badge"><div><div class="l">HOLE</div><div class="n">${n}</div></div></div>
          <div><div class="eyebrow">今週のテーマ ・ 目安 ${ok}つ</div><h3 id="tw">${esc(w.title)}</h3></div></div>
        ${progressBar(wd, w.tasks.length)}
        <p class="ok-note ${wd >= ok ? 'is-ok' : ''}">${wd >= ok ? (pend.length ? `目安クリア！ 残り${pend.length}つは、できたらでOK` : '全部できました。ナイスラウンド！') : `あと${ok - wd}つで今週の目安。全部やらなくて大丈夫`}</p>
        ${pend.length ? `<ul class="tasks">${pend.slice(0, 3).map(taskItem).join('')}</ul>` : ''}
        <div class="btn-row"><button class="btn btn-pine" data-go="week-${n}">今週のメニューを全部見る</button><button class="btn btn-ghost" data-go="log">練習を記録</button></div>
      </section>
      ${missionsCard()}
      <a class="game-link" href="#play"><span class="game-link-ic" aria-hidden="true">${icon('play')}</span>
        <span class="game-link-t"><b>ゲームで遊ぶ</b><small>ショートラウンドやニアピンで、練習の成果をためそう</small></span></a>
      <section class="card trivia-card" aria-labelledby="tv">
        <div class="eyebrow">今日のうんちく ・ ${esc(tv.tag)}</div>
        <h3 id="tv">${esc(tv.title)}</h3>
        <p>${esc(tv.body)}</p>
        <button class="btn btn-ghost" data-action="next-trivia">次のうんちく</button>
      </section>
    </div>`;
  }

  /* ---------- 起動・はじめての設定 ---------- */
  function viewTitle() {
    const returning = S.profile.confirmed || S.xp > 0 || S.logs.length > 0;
    return `<section class="launch-screen" aria-labelledby="launch-title">
      <div class="launch-top"><span class="launch-wordmark">FIRST ROUND <i>GOLF CLUB</i></span>
        <button class="launch-sound" data-action="launch-sound" aria-label="BGM ${S.bgm !== false ? 'オフにする' : 'オンにする'}" aria-pressed="${S.bgm !== false}">${icon(S.bgm !== false ? 'sound' : 'mute')}</button></div>
      <div class="launch-heading"><span class="launch-kicker"><i></i> YOUR FIRST TEE STARTS HERE</span>
        <h1 id="launch-title">はじめての<br><span>ラウンド<span class="launch-period">.</span></span></h1>
        <p>小さな一打から、はじまる毎日。</p></div>
      <div class="launch-world-wrap"><div class="launch-world lobby-host" id="lobby-host" role="img" aria-label="男女のゴルファーが迎える立体のゴルフコース。左右にドラッグして見渡せます。"><img class="lobby-poster" src="assets/lobby-poster.png" alt="" fetchpriority="high"></div>
        <span class="launch-course-label"><i></i> GREEN HILLS <small>PAR 4 · HOLE 01</small></span>
        <span class="launch-stamp">LET'S<br><b>GOLF!</b></span></div>
      <div class="launch-bottom"><div class="launch-pick-head"><span>あなたのゴルファー</span><span class="num" id="launch-pick-index">${charaId() === 'female' ? '01' : '02'} / 02</span></div>
        <div class="launch-picker" role="group" aria-label="使うキャラクター">${CHARAS.map(([id, name]) => `<button class="launch-character" data-launch-chara="${id}" aria-pressed="${charaId() === id}"><img src="assets/face-${id}.jpg" alt="" width="44" height="44"><span><b>${name}ゴルファー</b><small>${id === 'female' ? 'GREEN & PINK' : 'ORANGE & IVORY'}</small></span><i class="launch-check" aria-hidden="true">${icon('check')}</i></button>`).join('')}</div>
        <p class="launch-status" id="launch-status" role="status">コースを準備しています…</p>
        <button class="launch-start" data-action="launch-start"><span>${returning ? 'つづきからはじめる' : 'さあ、はじめよう'}</span>${icon('arrow')}</button>
        <button class="launch-try" data-go="play">まずはゲームで遊んでみる <span aria-hidden="true">↗</span></button>
        <div class="launch-footer"><span>12 WEEKS TO YOUR FIRST ROUND</span><button class="launch-music" data-action="music-preview"><span data-music-state>♪ タップしてBGMを聴く</span></button></div></div>
    </section>`;
  }
  function setLaunchCharacter(ch) {
    if (!['female', 'male'].includes(ch)) return;
    S.cosmetic.chara = ch; save();
    $$('[data-launch-chara]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.launchChara === ch)));
    const index = $('#launch-pick-index'); if (index) index.textContent = `${ch === 'female' ? '01' : '02'} / 02`;
    if (window.GolfLobby) window.GolfLobby.select(ch);
  }
  function afterTitle() {
    if (window.GolfLobby) window.GolfLobby.mount($('#lobby-host'), {
      pair: true, character: charaId(), onSelect: setLaunchCharacter,
      onStatus: text => { const el = $('#launch-status'); if (el) el.textContent = text; },
    });
  }
  function viewWelcome() {
    return `<section class="setup-screen" aria-labelledby="setup-title">
      <button class="setup-back" data-go="title">${icon('back')} タイトルへ</button>
      <div class="setup-steps" aria-label="最後の準備"><span></span><span></span><span class="active"></span></div>
      <div class="launch-kicker">LET'S GET YOU READY</div><h1 id="setup-title">あなたの<br>はじめの一歩。</h1>
      <p class="setup-lead">目標は、90日後のコースデビュー。<br>まずは、あなたのペースを決めよう。</p>
      <div class="setup-golfer"><img src="assets/face-${charaId()}.jpg" alt="選んだゴルファー" width="60" height="60"><span><b>いっしょに練習しよう！</b><small>キャラクターも日程も、あとで変更できます。</small></span></div>
      <form class="form" id="welcome-form">
        <div class="field"><label for="welcome-name">ニックネーム <span>任意</span></label><input id="welcome-name" type="text" maxlength="20" autocomplete="nickname" placeholder="なんて呼べばいい？" value="${esc(S.profile.name)}"></div>
        <div class="field"><label for="welcome-start">練習をはじめる日</label><input id="welcome-start" type="date" required value="${S.profile.start}"></div>
        <div class="field"><label for="welcome-debut">コースデビューの目標日</label><input id="welcome-debut" type="date" required min="${S.profile.start}" value="${S.profile.debut}"></div>
        <p class="setup-note">1日5分からで大丈夫。<br>12週間の練習メニューを用意しています。</p>
        <button class="launch-start" type="submit"><span>マイコースへ進む</span>${icon('arrow')}</button>
      </form>
    </section>`;
  }
  function afterWelcome() {
    const form = $('#welcome-form'), start = $('#welcome-start'), debut = $('#welcome-debut');
    start.addEventListener('change', () => {
      if (!start.value) return;
      debut.min = start.value; debut.value = addDays(start.value, 90); debut.setCustomValidity('');
    });
    debut.addEventListener('input', () => debut.setCustomValidity(''));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!start.value || !debut.value) return;
      if (diffDays(start.value, debut.value) < 0) { debut.setCustomValidity('目標日は練習開始日以降にしてください'); debut.reportValidity(); return; }
      Object.assign(S.profile, { name: $('#welcome-name').value.trim(), start: start.value, debut: debut.value, confirmed: true });
      save(); go('home');
    });
  }
  function afterHome() {
    if (window.GolfLobby) window.GolfLobby.mount($('#home-lobby'), { character: charaId(), wear: wearTint() });
  }

  /* ---------- 画面: プラン ---------- */
  function viewPlan() {
    const now = curWeek();
    return `<div class="page page-narrow">
      <section class="section">
        <p class="lead">1週間を1ホールに見立てた、全12ホール（約3か月）のプログラムです。練習開始日：${fmtYMD(S.profile.start)}</p>
        <div class="card" style="display:grid;gap:8px"><div class="eyebrow">全体の進み具合</div>${progressBar(allDone(), allTasks())}</div>
        ${scorecard()}
      </section>
      ${D.phases.map(ph => `<section class="phase" aria-labelledby="ph${ph.id}">
        <div class="phase-head"><div class="eyebrow">${ph.en}</div><h2 id="ph${ph.id}">${esc(ph.name)}</h2><p class="lead">${esc(ph.desc)}</p></div>
        <div class="week-list">${ph.weeks.map(n => { const w = weekOf(n); return `
          <button class="week-row ${n === now ? 'is-now' : ''}" data-go="week-${n}">
            <span class="wn">WEEK<b>${n}</b></span>
            <span><span class="wt">${esc(w.title)}${n === now ? ' <span class="tag">今週</span>' : ''}</span><br><span class="wg">${fmtMD(weekStart(n))}〜 ・ ${esc(w.goal)}</span></span>
            <span class="wp">${weekDone(n)}/${w.tasks.length}</span>
          </button>`; }).join('')}</div>
      </section>`).join('')}
    </div>`;
  }

  function viewWeek(n) {
    const w = weekOf(n);
    if (!w) return viewPlan();
    const ph = D.phases.find(p => p.weeks.includes(n));
    return `<div class="page page-narrow">
      <section class="week-hero">
        <div class="eyebrow">${ph.en} ・ HOLE ${n}</div>
        <h2>${esc(w.title)}</h2>
        <p class="dates">${fmtMD(weekStart(n))} 〜 ${fmtMD(addDays(weekStart(n), 6))}${n === curWeek() ? ' ・ 今週' : ''}</p>
        <p class="goal">目標：${esc(w.goal)}</p>
      </section>
      <section class="card" style="display:grid;gap:12px" aria-labelledby="wm">
        <div class="section-head"><h2 id="wm">今週のメニュー</h2><span class="num" style="color:var(--ink-2)">目安 ${okCount(w)}つ</span></div>
        ${progressBar(weekDone(n), w.tasks.length)}
        <p class="ok-note ${weekDone(n) >= okCount(w) ? 'is-ok' : ''}">${weekDone(n) >= okCount(w) ? '目安クリア！ 残りはできたらでOK' : `${okCount(w)}つできれば十分。球数は分けても、半分でもOK`}</p>
        <ul class="tasks">${w.tasks.map(taskItem).join('')}</ul>
      </section>
      <section class="point"><strong>コーチのひとこと</strong><p>${esc(w.point)}</p></section>
      ${n === curWeek() && n < TOTAL_WEEKS && diffDays(weekStart(n), today()) >= 2 ? `<section class="card section slow-card"><p class="goal">むずかしい週や忙しい週は、このテーマを今日からもう1週間つづけられます（デビュー予定もその分うしろにずれます）。</p>
        <button class="btn btn-ghost" data-action="slow" data-week="${n}">今日からもう1週間つづける</button></section>` : ''}
      <nav class="week-nav" aria-label="週の移動">
        ${n > 1 ? `<button class="btn btn-ghost" data-go="week-${n - 1}">← WEEK ${n - 1}</button>` : '<span></span>'}
        ${n < TOTAL_WEEKS ? `<button class="btn btn-ghost" data-go="week-${n + 1}">WEEK ${n + 1} →</button>` : '<span></span>'}
      </nav>
    </div>`;
  }

  /* ---------- 画面: 練習 ---------- */
  let drillCat = 'すべて';
  function drillCards() {
    const list = D.drills.filter(d => drillCat === 'すべて' || d.cat === drillCat);
    return list.map(d => `<button class="drill-item" data-go="drill-${d.id}">
      <span class="dn">${esc(d.name)}</span><span class="tag ${d.where === '自宅' ? 'tag-sand' : ''}">${esc(d.where)}</span>
      <span class="ds">${esc(d.summary)}</span>
      <span class="dm"><span class="tag">${esc(d.cat)}</span><span class="tag">${esc(d.time)}</span></span>
    </button>`).join('');
  }
  function viewPractice() {
    const cats = ['すべて', ...Array.from(new Set(D.drills.map(d => d.cat)))];
    return `<div class="page">
      <a class="plan-link card" href="#plan"><span class="hole-badge"><span><span class="l">WEEK</span><span class="n">${curWeek()}</span></span></span>
        <span><span class="eyebrow">12週プログラム</span><br><strong>${esc(weekOf(curWeek()).title)}</strong><br><span class="goal">全体 ${allDone()}/${allTasks()} ・ プラン一覧を見る</span></span></a>
      <section class="section" aria-labelledby="pt">
        <div class="section-head"><h2 id="pt">練習ツール</h2></div>
        <div class="tool-grid">
          <a class="tool" href="#tempo"><span class="ic ic-pine">${icon('metronome')}</span><span class="t">テンポ練習</span><span class="d">音に合わせて素振り。リズムが整うと当たりが揃う</span></a>
          <a class="tool" href="#putting"><span class="ic ic-flag">${icon('hole')}</span><span class="t">パター距離感ゲーム</span><span class="d">ベスト ${S.puttBest == null ? '―' : S.puttBest + '点'}</span></a>
          <a class="tool" href="#course"><span class="ic ic-water">${icon('cube')}</span><span class="t">3Dコース図鑑</span><span class="d">打つ前に知っておきたい場所の名前</span></a>
          <a class="tool" href="#clubs"><span class="ic ic-sand">${icon('club')}</span><span class="t">クラブの基本</span><span class="d">番手と飛距離の目安</span></a>
        </div>
      </section>
      <section class="section" aria-labelledby="dz">
        <div class="section-head"><h2 id="dz">ドリル図鑑</h2><span class="num" style="color:var(--ink-2)">${D.drills.length} DRILLS</span></div>
        <div class="chip-row" role="group" aria-label="カテゴリで絞り込む">${cats.map(c => `<button class="chip" data-cat="${c}" aria-pressed="${c === drillCat}">${c}</button>`).join('')}</div>
        <div class="drill-list" id="drill-list">${drillCards()}</div>
      </section>
    </div>`;
  }

  function viewDrill(id) {
    const d = drillById(id);
    if (!d) return viewPractice();
    const usedIn = D.weeks.filter(w => w.tasks.some(t => t.drill === id));
    return `<div class="page page-narrow">
      <section class="section">
        <div class="chip-row"><span class="tag">${esc(d.cat)}</span></div>
        <h2 style="font-size:26px;font-weight:900">${esc(d.name)}</h2>
        <p class="lead">${esc(d.summary)}</p>
        <dl class="facts" style="margin:0"><div><dt>場所</dt><dd>${esc(d.where)}</dd></div><div><dt>クラブ</dt><dd>${esc(d.club)}</dd></div><div><dt>時間</dt><dd>${esc(d.time)}</dd></div></dl>
      </section>
      ${illus(d.svg)}
      <section class="card section" aria-labelledby="st"><h2 id="st" style="font-size:18px;font-weight:900">やり方</h2><ol class="steps">${d.steps.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ol></section>
      <section class="point"><strong>ポイント</strong><p>${esc(d.point)}</p></section>
      ${d.ng && d.ng.length ? `<section class="card section" aria-labelledby="ng"><h2 id="ng" style="font-size:18px;font-weight:900">よくある失敗</h2><ul class="ng">${d.ng.map(s => `<li>${esc(s)}</li>`).join('')}</ul></section>` : ''}
      ${d.tool ? `<a class="btn btn-primary btn-block" href="#${d.tool}">テンポ練習を開く</a>` : ''}
      <button class="btn ${d.tool ? 'btn-ghost' : 'btn-primary'} btn-block" data-action="drill-done" data-drill="${d.id}">${(daily().counts['drill:' + d.id]) ? '今日はこのドリルをやった ✓' : 'このドリルをやった'}</button>
      ${usedIn.length ? `<section class="section"><div class="eyebrow">このドリルを使う週</div><div class="chip-row">${usedIn.map(w => `<button class="chip" data-go="week-${w.n}">WEEK ${w.n} ${esc(w.title)}</button>`).join('')}</div></section>` : ''}
    </div>`;
  }

  /* ---------- 画面: テンポ練習 ---------- */
  let tempoPreset = 'slow';
  function viewTempo() {
    const ticks = Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; const r1 = 132, r2 = i % 3 ? 140 : 146; return `<line x1="${160 + Math.sin(a) * r1}" y1="${160 - Math.cos(a) * r1}" x2="${160 + Math.sin(a) * r2}" y2="${160 - Math.cos(a) * r2}" stroke="rgba(255,255,255,.45)" stroke-width="${i % 3 ? 2 : 4}"/>`; }).join('');
    return `<div class="page">
      <p class="lead">振り上げに「イチ・ニ」、振り下ろしに「サン」。振り上げ3：振り下ろし1のリズムは、プロにも共通する黄金比です。音が鳴ったら素振りをしてみましょう。</p>
      <div class="tempo-wrap">
        <div class="tempo-dial">
          <svg viewBox="0 0 320 320" role="img" aria-label="スイングの時計。針がクラブの動きを示します">
            <circle cx="160" cy="160" r="150" fill="rgba(255,255,255,.06)"/>
            ${ticks}
            <line id="tp-club" x1="160" y1="160" x2="160" y2="278" stroke="#f2b705" stroke-width="7" stroke-linecap="round"/>
            <circle id="tp-head" cx="160" cy="278" r="13" fill="#f2b705"/>
            <circle cx="160" cy="160" r="22" fill="#fff"/>
            <text x="160" y="166" text-anchor="middle" font-size="15" font-weight="700" fill="#0d4731">体</text>
          </svg>
        </div>
        <div class="card section">
          <div class="beats" aria-live="off"><div class="beat"><b>イチ</b><span>始動</span></div><div class="beat"><b>ニ</b><span>トップ</span></div><div class="beat"><b>サン</b><span>インパクト</span></div></div>
          <div class="field"><span class="lbl">速さ</span>
            <div class="chip-row" role="group" aria-label="速さ">${Object.entries(window.GolfTempo ? window.GolfTempo.PRESETS : {}).map(([k, v]) => `<button class="chip" data-tempo="${k}" aria-pressed="${k === tempoPreset}">${v.name}</button>`).join('')}</div></div>
          <div class="form-row">
            <div class="field"><label for="tp-reps">回数</label><select id="tp-reps"><option>5</option><option selected>10</option><option>20</option><option>30</option></select></div>
            <div class="field"><span class="lbl">音</span><label style="display:flex;gap:8px;align-items:center;min-height:48px;font-weight:500"><input type="checkbox" id="tp-sound" checked style="width:22px;height:22px;min-height:0"> 鳴らす</label></div>
          </div>
          <div class="progress-row"><span>回数</span><span class="num" id="tp-count" style="font-size:22px;color:var(--ink)">0 / 10</span></div>
          <button class="btn btn-primary btn-block" id="tp-btn">スタート</button>
          <p class="goal">これまでのテンポ素振り：<span class="num">${S.tempoReps}</span>回</p>
        </div>
      </div>
    </div>`;
  }
  function afterTempo() {
    window.GolfTempo.mount({
      btn: $('#tp-btn'), club: $('#tp-club'), head: $('#tp-head'), beats: $$('.beat'), count: $('#tp-count'),
      reps: $('#tp-reps'), sound: $('#tp-sound'), getPreset: () => tempoPreset,
      onRep: () => { S.tempoReps++; save(); track('tempo'); gain(1, '', true); },
      onFinish: (n) => { toast(`${n}回できました。ナイステンポ！ +${n} XP`); checkBadges(); },
    });
  }

  /* ---------- 画面: パター距離感ゲーム ---------- */
  function viewPutting() {
    return `<div class="page">
      <div class="grid-2">
        <section class="section">
          <div class="putt-stage" id="putt-stage">
            <div class="putt-hud">
              <div class="row"><div class="hud-pill">カップまで <span id="pt-dist"><b>—</b>m</span></div><div class="hud-pill" id="pt-speed">グリーン：—</div></div>
              <div class="putt-result" id="pt-result" hidden></div>
              <div class="row"><div class="hud-pill balls" id="pt-balls" aria-label="残りのボール"></div><div class="hud-pill" id="pt-score">0 点</div></div>
            </div>
          </div>
          <p id="pt-fallback" class="goal" hidden>この端末では3D表示が使えないため、ゲームを表示できません。</p>
        </section>
        <section class="card putt-controls">
          <div class="field"><label for="pt-amp">振り幅（テークバックの大きさ）</label>
            <div class="amp-row"><input type="range" id="pt-amp" min="3" max="66" step="1" value="18"><span class="amp-val" id="pt-amp-out">18cm</span></div></div>
          <button class="btn btn-primary btn-block" id="pt-go">打つ</button>
          <div class="point"><strong>ヒント</strong><p>「ふつう」のグリーンなら、振り幅(cm) ÷ 6 ≒ 転がる距離(m)。遅いグリーンは少し大きく、速いグリーンは少し小さく。カップを40cmほど越える強さが理想です。</p></div>
          <p class="goal">5球で最高15点。カップイン3点／50cm以内2点／1m以内1点。<br>ベスト：<strong>${S.puttBest == null ? 'まだありません' : S.puttBest + '点'}</strong>（${S.puttRounds}ラウンド）</p>
        </section>
      </div>
    </div>`;
  }
  function afterPutting() {
    window.GOLF_BALL_COLOR = ballColor();
    window.GolfPutting.mount({
      stage: $('#putt-stage'), amp: $('#pt-amp'), ampOut: $('#pt-amp-out'), go: $('#pt-go'), result: $('#pt-result'),
      dist: $('#pt-dist'), speed: $('#pt-speed'), balls: $('#pt-balls'), score: $('#pt-score'), fallback: $('#pt-fallback'),
      onRoundEnd: (score) => {
        S.puttRounds++;
        const best = S.puttBest == null || score > S.puttBest;
        if (best) S.puttBest = score;
        save();
        $('#pt-result').innerHTML = `ラウンド終了：${score}点<small>${best ? 'ベストスコア更新！' : `ベストは${S.puttBest}点`}</small>`;
        $('#pt-result').hidden = false;
        gain(score * 3, 'パター距離感'); track('putt');
        if (score >= 10) award('putt10');
        if (score >= 15) award('putt15');
        completeTask('w3d', 'WEEK 3「距離感ゲーム」を達成');
        if (score >= 8) S.done.w5d || completeTask('w5d', 'WEEK 5「8点以上」を達成');
      },
    });
  }

  /* ---------- 画面: 学ぶ ---------- */
  function viewLearn() {
    const items = [
      ['history', 'clock', 'ic-pine', 'ゴルフの歴史', '15世紀のスコットランドから松山英樹のマスターズ制覇まで'],
      ['trivia', 'bulb', 'ic-flag', 'うんちく', 'カップが108mmの理由、バーディーの語源など'],
      ['quiz', 'quiz', 'ic-water', 'ゴルフクイズ', `10問に挑戦。ベスト ${S.quizBest == null ? '―' : S.quizBest + '/10'}`],
      ['rules', 'shield', 'ic-sand', 'ルールとマナー', 'デビュー前に覚えたい20項目'],
      ['debut', 'bag', 'ic-pine', 'デビュー準備', '持ち物チェックと当日の流れ'],
      ['glossary', 'abc', 'ic-flag', '用語集', `${D.glossary.length}語。わからない言葉はここで`],
      ['clubs', 'club', 'ic-sand', 'クラブの基本', '番手と飛距離の目安、最初にそろえる本数'],
    ];
    return `<div class="page">
      <a class="learn-feature" href="#course"><span class="eyebrow">3D COURSE GUIDE</span><span class="t">3Dコース図鑑</span><span class="d">ティーからグリーンまで、1ホールを回しながら各エリアの名前とルールを学べます</span></a>
      <div class="learn-grid">${items.map(([r, i, c, t, d]) => `<a class="learn-item" href="#${r}" style="text-decoration:none"><span class="ic ${c}">${icon(i)}</span><span><span class="t">${t}</span><br><span class="d">${esc(d)}</span></span></a>`).join('')}</div>
    </div>`;
  }

  /* 3D コース図鑑 */
  function viewCourse() {
    return `<div class="page">
      <section class="explore" id="explore">
        <div class="scene-host" id="explore-scene"></div>
        <div class="hs-layer" id="hs-layer"></div>
        <div class="explore-tools"><button class="btn" data-action="overview">全体を見る</button></div>
        <div class="explore-hint">ドラッグで回転・ピンチで拡大。黄色い点をタップ</div>
      </section>
      <div class="grid-2">
        <section class="card hs-info" id="hs-info" aria-live="polite">
          <div class="eyebrow">PAR 4 ・ 約270ヤード</div>
          <h2>コースの各エリアを知ろう</h2>
          <p>1つのホールは、ティーイングエリア・フェアウェイ・ラフ・バンカー・ペナルティエリア・グリーンでできています。気になる場所をタップしてください。</p>
        </section>
        <section class="section"><div class="eyebrow">エリア一覧</div><div class="chip-row" id="hs-chips"></div></section>
      </div>
    </div>`;
  }
  function afterCourse() {
    const showInfo = (hs) => {
      $('#hs-info').innerHTML = `<div class="eyebrow">COURSE GUIDE</div><h2>${esc(hs.label)}</h2><p>${esc(hs.body)}</p><p class="tip"><strong>ワンポイント：</strong>${esc(hs.tip)}</p>`;
      $$('#hs-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.hs === hs.id)));
    };
    const fillChips = () => {
      const hs = window.GolfScene.hotspots;
      $('#hs-chips').innerHTML = hs.map(h => `<button class="chip" data-hs="${h.id}" aria-pressed="false">${esc(h.label)}</button>`).join('');
    };
    window.GolfScene.mount($('#explore-scene'), { mode: 'explore', layer: $('#hs-layer'), onSelect: showInfo, onReady: fillChips });
    setTimeout(() => { if (window.GolfScene.failed) $('#explore').classList.add('scene-failed'); }, 4000);
  }

  /* 歴史 */
  let histTag = 'すべて';
  function viewHistory() {
    const tags = ['すべて', '世界', '日本', '道具', 'ルール'];
    const list = D.history.filter(h => histTag === 'すべて' || h.tag === histTag);
    return `<div class="page page-narrow">
      <p class="lead">スコットランドの羊飼いの遊びから、オリンピック競技へ。約600年の歩みをたどります。</p>
      <div class="chip-row" role="group" aria-label="絞り込み">${tags.map(t => `<button class="chip" data-hist="${t}" aria-pressed="${t === histTag}">${t}</button>`).join('')}</div>
      <ol class="timeline">${list.map(h => `<li class="tl-item ${h.tag === '日本' ? 'jp' : ''}">
        <div class="tl-year">${esc(h.year)}</div><div class="tl-line" aria-hidden="true"></div>
        <div class="tl-body"><span class="tag ${h.tag === '日本' ? 'tag-sand' : ''}" style="justify-self:start">${esc(h.tag)}</span><h3>${esc(h.title)}</h3><p>${esc(h.body)}</p></div>
      </li>`).join('')}</ol>
      <button class="btn btn-pine" data-go="quiz">クイズで確かめる</button>
    </div>`;
  }

  /* うんちく */
  let triviaOrder = null;
  function viewTrivia() {
    const list = triviaOrder ? triviaOrder.map(i => D.trivia[i]) : D.trivia;
    return `<div class="page">
      <div class="section-head"><p class="lead">ラウンド中の会話がちょっと楽しくなる、ゴルフの小ネタ集。</p><button class="btn btn-ghost" data-action="shuffle">シャッフル</button></div>
      <div class="trivia-grid">${list.map(t => `<article class="card"><span class="tag ${t.tag === '俗説' ? 'tag-sand' : ''}" style="justify-self:start">${esc(t.tag)}</span><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p></article>`).join('')}</div>
    </div>`;
  }

  /* クイズ */
  let quiz = null;
  function newQuiz() {
    const idx = D.quiz.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 10);
    quiz = { qs: idx.map(i => D.quiz[i]), i: 0, correct: 0, answered: null };
  }
  function viewQuiz() {
    if (!quiz) {
      return `<div class="page page-narrow"><section class="card quiz-card">
        <div class="eyebrow">GOLF QUIZ</div><h2 style="font-size:24px;font-weight:900">ゴルフクイズ 10問</h2>
        <p class="lead">歴史・ルール・マナー・用語からランダムに出題。8問以上正解でWEEK 9のメニュー達成です。</p>
        <p>ベストスコア：<strong class="num" style="font-size:22px">${S.quizBest == null ? '―' : S.quizBest + ' / 10'}</strong></p>
        <button class="btn btn-primary btn-block" data-action="quiz-start">スタート</button></section></div>`;
    }
    if (quiz.i >= quiz.qs.length) {
      const sc = quiz.correct;
      const msg = sc >= 9 ? 'すばらしい！もうコースで困りません。' : sc >= 8 ? '合格です！自信をもってデビューしましょう。' : sc >= 5 ? 'あと少し。ルールとマナーを読み返してみましょう。' : '学ぶタブで知識を増やしてから、もう一度挑戦！';
      return `<div class="page page-narrow"><section class="card quiz-card" style="text-align:center">
        <div class="eyebrow">RESULT</div><div class="score-big">${sc}<small style="font-size:32px"> / 10</small></div>
        <p class="lead" style="margin:0 auto">${msg}</p>
        <div class="btn-row" style="justify-content:center"><button class="btn btn-primary" data-action="quiz-start">もう一度</button><button class="btn btn-ghost" data-go="rules">ルールとマナー</button></div></section></div>`;
    }
    const q = quiz.qs[quiz.i];
    const a = quiz.answered;
    return `<div class="page page-narrow"><section class="card quiz-card">
      <div class="quiz-top"><span>Q ${quiz.i + 1} / ${quiz.qs.length}</span><span>正解 ${quiz.correct}</span></div>
      <div class="progress"><span style="width:${quiz.i / quiz.qs.length * 100}%"></span></div>
      <h2 class="quiz-q">${esc(q.q)}</h2>
      <div class="choices">${q.c.map((c, k) => {
        let cls = '';
        if (a != null) { if (k === q.a) cls = 'correct'; else if (k === a) cls = 'wrong'; }
        return `<button class="choice ${cls}" data-answer="${k}" ${a != null ? 'disabled' : ''}><span class="k">${'ABCD'[k]}</span>${esc(c)}</button>`;
      }).join('')}</div>
      ${a != null ? `<div class="feedback ${a === q.a ? 'ok' : 'ng'}" role="status"><strong>${a === q.a ? '正解！' : `ざんねん。正解は「${esc(q.c[q.a])}」`}</strong><p>${esc(q.exp)}</p></div>
      <button class="btn btn-primary btn-block" data-action="quiz-next">${quiz.i + 1 < quiz.qs.length ? '次の問題' : '結果を見る'}</button>` : ''}
    </section></div>`;
  }

  /* 用語集 */
  function glossList(q) {
    const k = (q || '').trim();
    const list = D.glossary.filter(([t, d]) => !k || t.includes(k) || d.includes(k));
    if (!list.length) return `<p class="empty">「${esc(k)}」に当てはまる用語はありません。</p>`;
    return `<dl class="gloss">${list.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>`;
  }
  function viewGlossary() {
    return `<div class="page page-narrow">
      <label class="sr-only" for="gl-q">用語を検索</label>
      <input class="search" id="gl-q" type="search" placeholder="用語を検索（例：OB、ダフリ）" autocomplete="off">
      <div id="gl-list">${glossList('')}</div>
    </div>`;
  }

  /* ルールとマナー */
  function viewRules() {
    const list = (arr) => `<ol class="rule-list">${arr.map(r => `<li><div><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p></div></li>`).join('')}</ol>`;
    return `<div class="page page-narrow">
      <p class="lead">ゴルフの規則は細かいですが、デビュー戦で必要なのはここにある20項目だけ。迷ったら同伴者に聞けば大丈夫です。</p>
      <section class="section" aria-labelledby="r1"><div class="section-head"><h2 id="r1">まず覚えるルール10</h2></div>${list(D.rules)}</section>
      <section class="card section" aria-labelledby="r3"><h2 id="r3" style="font-size:18px;font-weight:900">スコアの数え方の例（パー4）</h2>
        <ol class="steps">
          <li><span>1打目：ティーショットが右へ曲がってOB</span></li>
          <li><span>OBの罰で＋1打。元の場所から打ち直すのは「3打目」</span></li>
          <li><span>4打目でグリーンに乗り、2パットで入れる</span></li>
          <li><span>合計6打＝ダブルボギー。初ラウンドなら上出来です</span></li>
        </ol></section>
      <section class="section" aria-labelledby="r2"><div class="section-head"><h2 id="r2">マナー10か条</h2></div>${list(D.manners)}</section>
      <button class="btn btn-pine" data-go="quiz">クイズで確かめる</button>
    </div>`;
  }

  /* デビュー準備 */
  function viewDebut() {
    const done = D.checklist.filter(c => S.checklist[c.id]).length;
    const groups = Array.from(new Set(D.checklist.map(c => c.group)));
    return `<div class="page">
      <p class="lead">デビュー予定日：<strong>${fmtYMD(S.profile.debut)}</strong>。前日までに持ち物をそろえ、当日の流れをイメージしておきましょう。</p>
      <div class="grid-2">
        <section class="card section" aria-labelledby="ck">
          <div class="section-head"><h2 id="ck">持ち物チェック</h2></div>
          ${progressBar(done, D.checklist.length)}
          ${groups.map(g => `<div class="check-group"><h3>${g}</h3><ul class="tasks">${D.checklist.filter(c => c.group === g).map(c => `<li class="task"><label>
            <input type="checkbox" data-check="${c.id}" ${S.checklist[c.id] ? 'checked' : ''}><span class="check" aria-hidden="true">${icon('check')}</span>
            <span class="task-body"><span class="task-text">${esc(c.text)}</span></span></label></li>`).join('')}</ul></div>`).join('')}
        </section>
        <div class="section" style="gap:20px">
          <section class="card section" aria-labelledby="fl"><h2 id="fl" style="font-size:18px;font-weight:900">当日の流れ（スタート時間を0分として）</h2>
            <ol class="flow">${D.dayFlow.map(f => `<li><span class="tm">${esc(f.time)}</span><div><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div></li>`).join('')}</ol></section>
          <section class="section" aria-labelledby="tp"><div class="section-head"><h2 id="tp">デビュー戦のコツ</h2></div>
            <ol class="rule-list">${D.debutTips.map(r => `<li><div><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p></div></li>`).join('')}</ol></section>
        </div>
      </div>
    </div>`;
  }

  /* クラブの基本 */
  function viewClubs() {
    return `<div class="page page-narrow">
      <p class="lead">バッグに入れていいのは14本まで。でも最初は7〜8本のハーフセットで十分です。★は最初にそろえたいクラブ。</p>
      <div class="table-wrap"><table class="club-table">
        <thead><tr><th scope="col">クラブ</th><th scope="col">役割</th><th scope="col">初心者男性</th><th scope="col">初心者女性</th></tr></thead>
        <tbody>${D.clubs.map(c => `<tr><td><span class="club-short">${c.short}</span> ${esc(c.name)}${c.starter ? ' <span aria-label="最初にそろえたい">★</span>' : ''}</td><td>${esc(c.role)}</td><td class="num">${c.men}</td><td class="num">${c.women}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="goal">飛距離はキャリーとランを合わせた目安（y＝ヤード、1y≒0.91m）。個人差が大きいので、練習で自分の数字を見つけていきましょう。</p>
      <section class="point"><strong>番手の数字のしくみ</strong><p>アイアンは数字が大きくなるほどシャフトが短く、フェイスが上を向いて（ロフトが大きく）、高く上がって飛距離が短くなります。番手が1つ変わると、飛距離はおよそ10ヤード変わります。</p></section>
    </div>`;
  }

  /* ---------- 画面: 記録 ---------- */
  const PLACES = ['練習場', '自宅', 'ショートコース', 'コース'];
  function weeklyMinutes() {
    const arr = Array(TOTAL_WEEKS).fill(0);
    for (const l of S.logs) {
      const w = Math.floor(diffDays(S.profile.start, l.date) / 7);
      if (w >= 0 && w < TOTAL_WEEKS) arr[w] += Number(l.minutes) || 0;
    }
    return arr;
  }
  function chartSVG(data, sample) {
    const W = 380, H = 220, L = 38, R = 6, T = 14, B = 30;
    const max = Math.max(60, ...data);
    const step = max <= 120 ? 30 : max <= 300 ? 60 : max <= 600 ? 120 : 240;
    const top = Math.ceil(max / step) * step;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const bw = (W - L - R) / data.length;
    const now = curWeek();
    let grid = '';
    for (let v = 0; v <= top; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="sv-grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="sv-muted" font-size="13">${v}</text>`;
    const bars = data.map((v, i) => {
      const x = L + i * bw + bw * 0.2, w = bw * 0.6, y0 = y(0), y1 = y(v), r = Math.min(4, (y0 - y1) / 2, w / 2);
      const path = v > 0 ? `M${x} ${y0} V${y1 + r} Q${x} ${y1} ${x + r} ${y1} H${x + w - r} Q${x + w} ${y1} ${x + w} ${y1 + r} V${y0} Z` : '';
      const fillCls = i + 1 === now ? 'sv-accent-f' : 'sv-grass-f';
      return `<g class="bar" data-tip="WEEK ${i + 1}：${v}分">
        <rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>
        ${path ? `<path d="${path}" class="${fillCls}"/>` : ''}
        <text x="${L + i * bw + bw / 2}" y="${H - 12}" text-anchor="middle" class="sv-muted" font-size="14" font-family="Barlow Condensed, sans-serif">${i + 1}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="週ごとの練習時間（分）${sample ? '・サンプル' : ''}" ${sample ? 'style="opacity:.45"' : ''}>${grid}
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="sv-stroke" stroke-width="1"/>${bars}</svg>`;
  }
  function viewLog() {
    const logs = S.logs.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const mins = S.logs.reduce((s, l) => s + (Number(l.minutes) || 0), 0);
    const balls = S.logs.reduce((s, l) => s + (Number(l.balls) || 0), 0);
    const days = new Set(S.logs.map(l => l.date)).size;
    const data = weeklyMinutes();
    const hasData = data.some(v => v > 0);
    const sample = [40, 60, 90, 75, 120, 90, 100, 150, 120, 160, 140, 110];
    const w = weekOf(curWeek());
    return `<div class="page">
      <section class="card section" aria-labelledby="cal-h"><div class="section-head"><h2 id="cal-h" style="font-size:18px">練習カレンダー</h2><span class="num" style="color:var(--ink-2)">${practicedDays().length}日</span></div>${practiceCalendar()}</section>
      <div class="stats">
        <div class="stat"><span class="k">記録した日</span><span class="v">${days}<small>日</small></span></div>
        <div class="stat"><span class="k">練習時間</span><span class="v">${(mins / 60).toFixed(mins % 60 ? 1 : 0)}<small>時間</small></span></div>
        <div class="stat"><span class="k">打った球</span><span class="v">${balls.toLocaleString()}<small>球</small></span></div>
      </div>
      <div class="grid-2">
        <div class="section" style="gap:20px">
          <section class="card chart-card section" aria-labelledby="ch" style="position:relative">
            <div class="section-head"><h2 id="ch" style="font-size:18px">週ごとの練習時間（分）</h2></div>
            ${chartSVG(hasData ? data : sample, !hasData)}
            <div id="chart-tip" class="hud-pill" hidden style="position:absolute;pointer-events:none"></div>
            <p class="note">${hasData ? '黄色が今週。バーに触れると時間が出ます。' : '記録するとここにグラフが表示されます（今はサンプル表示）。'}</p>
          </section>
          <section class="section" aria-labelledby="ls">
            <div class="section-head"><h2 id="ls">これまでの記録</h2></div>
            ${logs.length ? `<ul class="log-list">${logs.map(l => { const d = parse(l.date); return `<li class="log-item">
              <div class="log-date"><b>${d.getDate()}</b><span>${d.getMonth() + 1}月 ${WD[d.getDay()]}</span></div>
              <div class="log-main"><span class="l1">${esc(l.place)} ・ ${esc(l.focus || '練習')}</span>
                <span class="l2">${l.minutes ? `${l.minutes}分` : ''}${l.balls ? ` ・ ${l.balls}球` : ''}${l.score ? ` ・ スコア${esc(l.score)}` : ''} ・ 手ごたえ ${'●'.repeat(l.feel || 0)}${'○'.repeat(5 - (l.feel || 0))}</span>
                ${l.memo ? `<span class="l2">${esc(l.memo)}</span>` : ''}</div>
              <button class="del" data-del="${l.id}" aria-label="${fmtMD(l.date)}の記録を削除">削除</button></li>`; }).join('')}</ul>`
              : '<p class="empty card">まだ記録がありません。練習したら「練習を記録する」から残しましょう。</p>'}
          </section>
        </div>
        <section class="card" aria-labelledby="fm">
          <form class="form" id="log-form">
            <h2 id="fm" style="font-size:18px;font-weight:900">練習を記録する</h2>
            <div class="form-row">
              <div class="field"><label for="lf-date">日付</label><input type="date" id="lf-date" value="${today()}" required></div>
              <div class="field"><label for="lf-place">場所</label><select id="lf-place">${PLACES.map(p => `<option>${p}</option>`).join('')}</select></div>
            </div>
            <div class="form-row">
              <div class="field"><label for="lf-min">時間（分）</label><input type="number" id="lf-min" inputmode="numeric" min="0" max="600" value="60"></div>
              <div class="field"><label for="lf-balls">球数</label><input type="number" id="lf-balls" inputmode="numeric" min="0" max="2000" value="100"></div>
            </div>
            <div class="field"><label for="lf-focus">テーマ</label><input type="text" id="lf-focus" value="${esc(w.title)}" maxlength="40"></div>
            <div class="field"><label for="lf-score">スコア（ラウンドのとき）</label><input type="text" id="lf-score" inputmode="numeric" maxlength="8" placeholder="例：128"></div>
            <div class="field"><span class="lbl" id="feel-l">手ごたえ</span>
              <div class="feel" role="radiogroup" aria-labelledby="feel-l">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="feel" value="${n}" ${n === 3 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
            <div class="field"><label for="lf-memo">メモ（気づいたこと、振り幅と距離など）</label><textarea id="lf-memo" maxlength="400"></textarea></div>
            <button class="btn btn-primary btn-block" type="submit">記録する</button>
          </form>
        </section>
      </div>
    </div>`;
  }
  function afterLog() {
    const form = $('#log-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const entry = {
        id: Date.now(), date: $('#lf-date').value || today(), place: $('#lf-place').value,
        minutes: Math.max(0, Number($('#lf-min').value) || 0), balls: Math.max(0, Number($('#lf-balls').value) || 0),
        focus: $('#lf-focus').value.trim(), score: $('#lf-score').value.trim(), memo: $('#lf-memo').value.trim(),
        feel: Number((form.querySelector('input[name="feel"]:checked') || {}).value) || 3,
      };
      S.logs.push(entry); save();
      toast('記録しました');
      gain(30 + Math.min(20, Math.round(entry.minutes / 6)), '練習を記録'); track('log'); checkBadges();
      if (entry.place === 'コース' && entry.score) completeTask('w12d', 'WEEK 12「ラウンド後の記録」を達成');
      render();
    });
    const card = $('.chart-card'), tip = $('#chart-tip');
    $$('.chart-card .bar').forEach(g => {
      const show = () => {
        const r = g.getBoundingClientRect(), c = card.getBoundingClientRect();
        tip.textContent = g.dataset.tip; tip.hidden = false;
        tip.style.left = `${Math.min(c.width - 130, Math.max(8, r.left - c.left + r.width / 2 - 55))}px`;
        tip.style.top = `${r.top - c.top + 20}px`;
      };
      g.addEventListener('pointerenter', show);
      g.addEventListener('pointerdown', show);
      g.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  }

  /* ---------- 画面: プレー ---------- */
  function courseChoices() {
    const c0 = sel();
    return `<section class="section" aria-labelledby="cw">
      <div class="section-head"><h2 id="cw">コースと天気</h2></div>
      <div class="course-list" role="radiogroup" aria-label="コース">${COURSES.map(c => {
        const lock = c.lv > level(), on = c0.course === c.id, b = bestOf(c.id);
        return `<button class="course-opt course-${c.id} ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-course="${c.id}" ${lock ? 'aria-disabled="true"' : ''}>
          <span class="course-sw" aria-hidden="true"></span>
          <span class="course-tx"><b>${esc(c.name)}</b><small>${lock ? `Lv.${c.lv}で解放` : esc(c.desc)}</small></span>
          <span class="course-best num">${lock ? icon('lock') : b == null ? '―' : `${b}<small>打</small>`}</span></button>`;
      }).join('')}</div>
      <div class="chip-row" role="group" aria-label="天気">${WXS.map(w => `<button class="chip" data-wx="${w.id}" aria-pressed="${c0.weather === w.id}">${w.name}</button>`).join('')}</div>
      <p class="goal" style="font-size:13px">雨の日は風が強く、ボールが転がりにくくなります。夕焼けとくもりは見た目だけ変わります。</p>
    </section>`;
  }
  function roundRow(r, detail) {
    const d = r.total - r.par;
    return `<li class="round-row"><span class="rr-date num">${fmtMD(r.date).replace(/\(.\)/, '')}</span>
      <span class="rr-name"><b>${esc(courseName(r.course))}</b><small>${esc(wxName(r.weather))}${detail ? ` ・ ${r.scores.map(x => x.strokes).join(' - ')}` : ''}</small></span>
      <span class="rr-score num ${d < 0 ? 'under' : ''}">${r.total}<small>${diffText(d)}</small></span></li>`;
  }
  function viewPlay() {
    const g = S.game, c0 = sel();
    const ct = COURSES.find(c => c.id === c0.course);
    const modes = [
      ['game-round', ct.id === 'all' ? '全9ホールラウンド' : 'ショートラウンド', ct.id === 'all' ? '3コース9ホール・パー33。OBや池のルールもそのまま体験' : '3ホール・パー11。OBや池のルールもそのまま体験', bestOf(c0.course) == null ? 'ベスト ―' : `ベスト ${bestOf(c0.course)}打`, 'flag', 'ic-pine'],
      ['game-nearpin', 'ニアピンチャレンジ', 'パー3で3球。ピンに一番近づけた距離を競う', g.nearpinBest == null ? 'ベスト ―' : `ベスト ${g.nearpinBest}m`, 'target', 'ic-flag'],
      ['game-drive', 'ドラコンチャレンジ', 'ドライバーで3球。フェアウェイに残った最長飛距離', g.driveBest == null ? 'ベスト ―' : `ベスト ${g.driveBest}y`, 'club', 'ic-water'],
      ['putting', 'パター距離感', '振り幅で距離を合わせる5球勝負', S.puttBest == null ? 'ベスト ―' : `ベスト ${S.puttBest}点`, 'hole', 'ic-sand'],
    ];
    return `<div class="page">
      ${playerCard()}
      ${courseChoices()}
      <section class="section" aria-labelledby="gm">
        <div class="section-head"><h2 id="gm">ゲームモード</h2><span class="chip-row"><button class="more" data-action="bgm">BGM：${S.bgm !== false ? 'ON' : 'OFF'}</button><button class="more" data-action="sound">効果音：${S.sound ? 'ON' : 'OFF'}</button></span></div>
        <div class="mode-grid">${modes.map(([r, t, d, b, i, c]) => `<a class="mode" href="#${r}">
          <span class="ic ${c}">${icon(i)}</span><span class="t">${t}</span><span class="d">${d}</span><span class="best num">${b}</span></a>`).join('')}</div>
      </section>
      ${S.rounds.length ? `<section class="section" aria-labelledby="rc">
        <div class="section-head"><h2 id="rc">ラウンドの記録</h2><a class="more" href="#rounds">すべて見る</a></div>
        <ul class="round-list">${S.rounds.slice(0, 3).map(r => roundRow(r)).join('')}</ul>
      </section>` : ''}
      <div class="grid-2">
        ${missionsCard()}
        <section class="card section" aria-labelledby="hx">
          <h2 id="hx" style="font-size:18px;font-weight:900">レベルの上げ方</h2>
          <p class="goal">本物の練習をするほど、ゲームのゴルファーも上手くなります。コースもレベルで増えていきます。</p>
          <table class="xp-table"><tbody>
            <tr><td>今週のメニューを1つ達成</td><td class="num">+20 XP</td></tr>
            <tr><td>練習を記録する</td><td class="num">+30〜50 XP</td></tr>
            <tr><td>今日のミッション</td><td class="num">+40 XP</td></tr>
            <tr><td>バッジ獲得</td><td class="num">+50 XP</td></tr>
            <tr><td>クイズ・パター・ゲームのスコア</td><td class="num">+5〜300 XP</td></tr>
          </tbody></table>
        </section>
      </div>
      ${charaPicker()}
    </div>`;
  }
  function viewRounds() {
    const bests = COURSES.filter(c => bestOf(c.id) != null);
    return `<div class="page page-narrow">
      ${bests.length ? `<section class="section"><div class="eyebrow">コース別ベスト</div>
        <div class="stats">${bests.map(c => `<div class="stat"><span class="k">${esc(c.name)}</span><span class="v">${bestOf(c.id)}<small>打</small></span></div>`).join('')}</div></section>` : ''}
      <section class="section" aria-labelledby="ra">
        <div class="section-head"><h2 id="ra">これまでのラウンド</h2><span class="num" style="color:var(--ink-2)">${S.rounds.length}回</span></div>
        ${S.rounds.length ? `<ul class="round-list">${S.rounds.map(r => roundRow(r, true)).join('')}</ul>
          <p class="goal" style="font-size:13px">数字は各ホールの打数です。右は合計とパーとの差。最新の50回まで残ります。</p>` : '<p class="lead">まだラウンドの記録がありません。プレーでホールを回りきると、ここに残ります。</p>'}
        <a class="btn btn-primary btn-block" href="#game-round">ラウンドに行く</a>
      </section>
    </div>`;
  }
  function viewGame() {
    return `<div class="game-stage" id="game-stage"><div class="scene-host"></div></div>`;
  }
  function afterGame() {
    const mode = route.slice(5);
    document.body.classList.add('in-game');
    const c0 = sel();
    S.game.lastWeather = pickWeather(c0.weather);
    window.GolfGame.mount($('#game-stage'), {
      mode,
      course: mode === 'round' ? c0.course : (c0.course === 'all' ? 'hills' : c0.course),
      weather: S.game.lastWeather,
      sound: () => S.sound !== false,
      bgm: () => S.bgm !== false,
      ballColor, wearColor, wearTint, character: charaId,
      skill: () => skillOf(level()),
      showTutorial: !S.game.tutorialSeen,
      onTutorialSeen: () => { S.game.tutorialSeen = true; save(); },
      onEvent: onGameEvent,
      onExit: () => go('play'),
    });
  }

  /* ---------- 画面: マイページ ---------- */
  function viewMy() {
    const L = level();
    const kinds = [['practice', '練習'], ['game', 'ゲーム'], ['learn', '学ぶ']];
    const swatch = (kind, list) => list.map(it => {
      const lock = it.lv > L, on = S.cosmetic[kind] === it.id;
      return `<button class="swatch ${on ? 'on' : ''}" data-cos="${kind}:${it.id}" aria-pressed="${on}" ${lock ? 'aria-disabled="true"' : ''} aria-label="${esc(it.name)}${lock ? `（Lv.${it.lv}で解放）` : ''}">
        <span class="sw" style="background:${it.color}"></span><span class="sw-n">${lock ? `${icon('lock')}Lv.${it.lv}` : esc(it.name)}</span></button>`;
    }).join('');
    return `<div class="page">
      ${playerCard()}
      ${charaPicker()}
      <div class="grid-2">
        <div class="section" style="gap:20px">
          ${missionsCard()}
          <section class="card section" aria-labelledby="lg">
            <div class="section-head"><h2 id="lg" style="font-size:18px">これまでの練習</h2><a class="more" href="#log">記録を見る</a></div>
            ${practiceCalendar()}
            ${practiceTotals()}
            ${S.pace.ext ? `<p class="goal" style="font-size:13px">ペースを${S.pace.ext}回ゆっくりにしました。自分のペースで大丈夫です。</p>` : ''}
            <a class="btn btn-primary btn-block" href="#log">練習を記録する</a>
          </section>
          <section class="card section" aria-labelledby="cs">
            <h2 id="cs" style="font-size:18px;font-weight:900">着せ替え</h2>
            <p class="goal">レベルが上がると、ボールとウェアの色が増えます。ゲームとパター距離感に反映されます。</p>
            <div class="eyebrow">BALL</div><div class="swatches">${swatch('ball', BALLS)}</div>
            <div class="eyebrow">WEAR</div><div class="swatches">${swatch('wear', WEARS)}</div>
          </section>
        </div>
        <section class="section" aria-labelledby="bd">
          <div class="section-head"><h2 id="bd">バッジ</h2><span class="num" style="color:var(--ink-2)">${Object.keys(S.badges).length} / ${BADGES.length}</span></div>
          ${kinds.map(([k, name]) => `<div class="eyebrow">${name}</div><ul class="badges">${BADGES.filter(b => b.kind === k).map(b => {
            const got = S.badges[b.id];
            return `<li class="badge ${got ? 'got' : ''}"><span class="bd-ic" aria-hidden="true">${icon(got ? 'trophy' : 'lock')}</span><span class="bd-n">${esc(b.name)}</span><span class="bd-d">${esc(b.desc)}</span></li>`;
          }).join('')}</ul>`).join('')}
          <a class="btn btn-ghost" href="#settings">設定・データ</a>
        </section>
      </div>
    </div>`;
  }

  /* ---------- 画面: 設定 ---------- */
  let confirmReset = false;
  function viewSettings() {
    return `<div class="page page-narrow">
      <section class="card">
        <form class="form" id="set-form">
          <h2 style="font-size:18px;font-weight:900">プロフィールと日程</h2>
          <div class="field"><label for="sf-name">ニックネーム（任意）</label><input id="sf-name" type="text" maxlength="20" value="${esc(S.profile.name)}"></div>
          <div class="form-row">
            <div class="field"><label for="sf-start">練習開始日</label><input id="sf-start" type="date" value="${S.profile.start}" required></div>
            <div class="field"><label for="sf-debut">デビュー予定日</label><input id="sf-debut" type="date" value="${S.profile.debut}" required></div>
          </div>
          <p class="goal">練習開始日から1週間ごとに、WEEK 1〜12が進みます。デビュー日はだいたい開始から90日後がおすすめです。</p>
          <button class="btn btn-primary btn-block" type="submit">保存する</button>
        </form>
      </section>
      <section class="card section">
        <h2 style="font-size:18px;font-weight:900">サウンドと表示</h2>
        <div class="chip-row" role="group" aria-label="BGM"><button class="chip" data-action="bgm" aria-pressed="${S.bgm !== false}">BGM ${S.bgm !== false ? 'ON' : 'OFF'}</button><button class="chip" data-action="sound" aria-pressed="${!!S.sound}">効果音 ${S.sound ? 'ON' : 'OFF'}</button></div>
        <div class="music-volume"><label for="music-volume">BGMの音量</label><output for="music-volume" data-music-volume-label>${Math.round(musicVolume() * 100)}%</output><input id="music-volume" type="range" min="0" max="100" step="1" value="${Math.round(musicVolume() * 100)}" aria-label="BGMの音量"></div>
        <p class="music-now" data-music-state role="status"></p><p class="goal">ゴルフに似合う、6つのオリジナルBGM。画面をタップすると音楽が始まります。</p>
        <div class="chip-row" role="group" aria-label="テーマ">${[['system', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']].map(([k, l]) => `<button class="chip" data-theme-set="${k}" aria-pressed="${S.theme === k}">${l}</button>`).join('')}</div>
      </section>
      <section class="card section">
        <h2 style="font-size:18px;font-weight:900">データ</h2>
        <p class="goal">記録やチェックはこの端末のブラウザに保存されています。</p>
        ${confirmReset ? `<p><strong>すべての進捗と記録を消去します。元に戻せません。</strong></p>
          <div class="btn-row"><button class="btn btn-danger" data-action="reset-yes">消去する</button><button class="btn btn-ghost" data-action="reset-no">やめる</button></div>`
          : '<button class="btn btn-ghost" data-action="reset">データを消去する</button>'}
      </section>
      <p class="goal" style="text-align:center">はじめてのラウンド ・ 3Dモデル：Blender ／ 描画：Three.js</p>
    </div>`;
  }
  function afterSettings() {
    $('#set-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const start = $('#sf-start').value, debut = $('#sf-debut').value;
      if (!start || !debut) return;
      if (diffDays(start, debut) < 0) { toast('デビュー日は開始日より後にしてください'); return; }
      Object.assign(S.profile, { name: $('#sf-name').value.trim(), start, debut, confirmed: true });
      save(); toast('保存しました');
      go('home');
    });
  }

  /* ---------- 描画 ---------- */
  const VIEWS = {
    title: [viewTitle, afterTitle], welcome: [viewWelcome, afterWelcome],
    home: [viewHome, afterHome], plan: [viewPlan], practice: [viewPractice], tempo: [viewTempo, afterTempo],
    putting: [viewPutting, afterPutting], learn: [viewLearn], course: [viewCourse, afterCourse], history: [viewHistory],
    trivia: [viewTrivia], quiz: [viewQuiz], glossary: [viewGlossary], rules: [viewRules], debut: [viewDebut], clubs: [viewClubs],
    log: [viewLog, afterLog], settings: [viewSettings, afterSettings],
    play: [viewPlay], rounds: [viewRounds], my: [viewMy],
    'game-round': [viewGame, afterGame], 'game-nearpin': [viewGame, afterGame], 'game-drive': [viewGame, afterGame],
  };
  function teardown() {
    if (window.GolfLobby) window.GolfLobby.unmount();
    if (window.GolfScene) window.GolfScene.unmount();
    if (window.GolfAvatar) window.GolfAvatar.unmount();
    if (window.GolfPutting) window.GolfPutting.unmount();
    if (window.GolfTempo) window.GolfTempo.unmount();
    if (window.GolfGame) window.GolfGame.unmount();
    document.body.classList.remove('in-game');
  }
  function render(keepScroll) {
    teardown();
    let r = route, html, after;
    if (r.startsWith('week-')) html = viewWeek(Number(r.slice(5)));
    else if (r.startsWith('drill-')) html = viewDrill(r.slice(6));
    else { const v = VIEWS[r] || VIEWS.home; if (!VIEWS[r]) route = 'home'; html = v[0](); after = v[1]; }
    const isTitle = route === 'title' || route === 'welcome';
    document.body.classList.toggle('in-title', isTitle);
    $$('meta[name="theme-color"]').forEach(meta => meta.setAttribute('content', isTitle ? '#f4f6e9' : getComputedStyle(document.documentElement).getPropertyValue('--pine').trim()));
    $('#appbar').hidden = $('#tabbar').hidden = isTitle;
    appbar(); tabbar();
    if (window.GolfBGM) {
      window.GolfBGM.setEnabled(S.bgm !== false);
      window.GolfBGM.setVolume(musicVolume());
      const track = musicForRoute();
      if (track) window.GolfBGM.play(track); else window.GolfBGM.stop();
    }
    const main = $('#main');
    main.classList.toggle('enter', !keepScroll);
    main.innerHTML = html;
    syncMusicUI();
    if (after) after();
    const av = $('#avatar-host');
    if (av && window.GolfAvatar) window.GolfAvatar.mount(av, { wear: wearTint(), ball: ballColor(), character: charaId() });
    if (!keepScroll) window.scrollTo(0, 0);
    document.title = route === 'home' ? 'はじめてのラウンド' : `${$('#appbar h1') ? $('#appbar h1').textContent : ''} ｜ はじめてのラウンド`;
    if (isTitle) document.title = 'はじめてのラウンド';
  }
  function onRoute() {
    route = currentRoute();
    if (route === 'quiz' && quiz && quiz.i >= quiz.qs.length) quiz = null;
    render();
  }

  /* ---------- イベント ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-back],[data-action],[data-cat],[data-hist],[data-answer],[data-tempo],[data-del],[data-hs],[data-theme-set],[data-cos],[data-chara],[data-course],[data-wx],[data-mode],[data-pace-ok],[data-launch-chara]');
    if (!t) return;
    if (t.dataset.launchChara) { setLaunchCharacter(t.dataset.launchChara); return; }
    if (t.dataset.go) { go(t.dataset.go); return; }
    if (t.dataset.back) { go(t.dataset.back); return; }
    if (t.dataset.cat) {
      drillCat = t.dataset.cat;
      $$('[data-cat]').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cat === drillCat)));
      $('#drill-list').innerHTML = drillCards();
      return;
    }
    if (t.dataset.hist) { histTag = t.dataset.hist; render(true); return; }
    if (t.dataset.tempo) { tempoPreset = t.dataset.tempo; $$('[data-tempo]').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.tempo === tempoPreset))); return; }
    if (t.dataset.hs) { window.GolfScene.select(t.dataset.hs); return; }
    if (t.dataset.mode) { daily().mode = t.dataset.mode; S.lastMode = t.dataset.mode; save(); render(true); return; }
    if (t.dataset.paceOk) { S.pace.dismiss = t.dataset.paceOk; save(); render(true); return; }
    if (t.dataset.course) {
      const c = COURSES.find(x => x.id === t.dataset.course);
      if (c && c.lv > level()) { toast(`Lv.${c.lv}になると遊べます`); return; }
      sel().course = t.dataset.course; save(); render(true); return;
    }
    if (t.dataset.wx) { sel().weather = t.dataset.wx; save(); render(true); return; }
    if (t.dataset.chara) { S.cosmetic.chara = t.dataset.chara; save(); render(true); return; }
    if (t.dataset.cos) {
      const [kind, id] = t.dataset.cos.split(':');
      const list = kind === 'ball' ? BALLS : WEARS;
      const item = list.find(x => x.id === id);
      if (item && item.lv <= level()) { S.cosmetic[kind] = id; save(); render(true); }
      else if (item) toast(`Lv.${item.lv}で使えるようになります`);
      return;
    }
    if (t.dataset.themeSet) { S.theme = t.dataset.themeSet; save(); applyTheme(); render(true); return; }
    if (t.dataset.del) { S.logs = S.logs.filter(l => String(l.id) !== t.dataset.del); save(); toast('削除しました'); render(true); return; }
    if (t.dataset.answer != null && quiz && quiz.answered == null) {
      const k = Number(t.dataset.answer);
      quiz.answered = k;
      if (k === quiz.qs[quiz.i].a) quiz.correct++;
      render(true);
      return;
    }
    switch (t.dataset.action) {
      case 'launch-start': go(S.profile.confirmed || S.xp > 0 || S.logs.length > 0 ? 'home' : 'welcome'); break;
      case 'launch-sound':
        S.bgm = S.bgm === false; save();
        if (window.GolfBGM) { window.GolfBGM.setEnabled(S.bgm); if (S.bgm) window.GolfBGM.play(musicForRoute()); }
        t.setAttribute('aria-pressed', String(S.bgm));
        t.setAttribute('aria-label', `BGM ${S.bgm ? 'オフにする' : 'オンにする'}`);
        t.innerHTML = icon(S.bgm ? 'sound' : 'mute'); break;
      case 'music-preview':
        S.bgm = true; if (musicVolume() === 0) S.bgmVolume = 0.45; save();
        if (window.GolfBGM) { window.GolfBGM.setEnabled(true); window.GolfBGM.setVolume(musicVolume()); window.GolfBGM.play(musicForRoute()); window.GolfBGM.unlock(); }
        const speaker = $('.launch-sound');
        if (speaker) { speaker.setAttribute('aria-pressed', 'true'); speaker.setAttribute('aria-label', 'BGM オフにする'); speaker.innerHTML = icon('sound'); }
        break;
      case 'slow': slowDown(Number(t.dataset.week) || curWeek()); render(true); break;
      case 'drill-done': {
        const key = 'drill:' + t.dataset.drill, dd = daily();
        if (dd.counts[key]) { toast('今日はもう記録済み。ナイス！'); break; }
        dd.counts[key] = 1; track('drill'); gain(10, 'ドリル'); render(true); break;
      }
      case 'confirm': S.profile.confirmed = true; save(); toast('スタート！まずはWEEK 1から'); render(true); break;
      case 'next-trivia': triviaIdx = (triviaIdx + 1) % D.trivia.length; track('trivia'); gain(2, '', true); render(true); break;
      case 'lu-close': $('#levelup').hidden = true; if (!route.startsWith('game-') && route !== 'putting') render(true); break;
      case 'sound': S.sound = !S.sound; save(); render(true); break;
      case 'bgm':
        S.bgm = S.bgm === false; save();
        if (window.GolfBGM) window.GolfBGM.setEnabled(S.bgm);
        render(true); break;
      case 'shuffle': triviaOrder = D.trivia.map((_, i) => i).sort(() => Math.random() - 0.5); render(true); break;
      case 'overview': window.GolfScene.resetView(); break;
      case 'quiz-start': newQuiz(); render(); break;
      case 'quiz-next':
        quiz.i++; quiz.answered = null;
        if (quiz.i >= quiz.qs.length) {
          if (S.quizBest == null || quiz.correct > S.quizBest) S.quizBest = quiz.correct;
          save();
          gain(10 + quiz.correct * 5, `クイズ ${quiz.correct}問正解`); track('quiz');
          if (quiz.correct >= 8) award('quiz8');
          if (quiz.correct >= 10) award('quiz10');
          if (quiz.correct >= 8) completeTask('w9b', 'WEEK 9「クイズ8問正解」を達成');
        }
        render(); break;
      case 'reset': confirmReset = true; render(true); break;
      case 'reset-no': confirmReset = false; render(true); break;
      case 'reset-yes':
        confirmReset = false; S = defaults(); save(); applyTheme(); toast('データを消去しました'); go('title'); break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.task) {
      if (t.checked) S.done[t.dataset.task] = today(); else delete S.done[t.dataset.task];
      save();
      if (t.checked) { gain(20, 'メニュー達成'); track('task'); checkBadges(); } else gain(-20, '', true);
      // 進捗表示だけ更新（スクロール位置は保つ）
      const wn = D.weeks.find(w => w.tasks.some(x => x.id === t.dataset.task));
      if (t.checked && wn && weekDone(wn.n) === wn.tasks.length) toast(`WEEK ${wn.n} クリア！ナイスパー`);
      render(true);
      const again = $(`[data-task="${t.dataset.task}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    if (t.dataset.check) {
      if (t.checked) S.checklist[t.dataset.check] = true; else delete S.checklist[t.dataset.check];
      save();
      if (t.checked) { gain(5, '', true); checkBadges(); }
      render(true);
      const again = $(`[data-check="${t.dataset.check}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'music-volume') { S.bgmVolume = Number(e.target.value) / 100; save(); if (window.GolfBGM) window.GolfBGM.setVolume(musicVolume()); syncMusicUI(); }
    if (e.target.id === 'gl-q') $('#gl-list').innerHTML = glossList(e.target.value);
  });

  window.addEventListener('hashchange', onRoute);
  onRoute();
})();
