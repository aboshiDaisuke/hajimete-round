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
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); const d = defaults(); return Object.assign(d, s, { profile: Object.assign(d.profile, s.profile) }); }
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
    S.done[id] = true; save();
    toast(msg || 'タスクを達成しました');
  }

  /* ---------- アイコン ---------- */
  const P = {
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
    if (r === 'home' || r === 'settings') return 'home';
    if (r === 'plan' || r.startsWith('week-')) return 'plan';
    if (r === 'practice' || r.startsWith('drill-') || r === 'tempo' || r === 'putting') return 'practice';
    if (r === 'log') return 'log';
    return 'learn';
  };
  const PARENT = (r) => {
    if (r.startsWith('week-')) return 'plan';
    if (r.startsWith('drill-') || r === 'tempo' || r === 'putting') return 'practice';
    if (r === 'settings') return 'home';
    if (['course', 'history', 'trivia', 'quiz', 'glossary', 'rules', 'debut', 'clubs'].includes(r)) return 'learn';
    return null;
  };
  const TITLES = {
    plan: '12週プログラム', practice: '練習', learn: '学ぶ', log: '練習の記録', settings: '設定',
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
    return h || 'home';
  }

  /* ---------- 共通パーツ ---------- */
  function appbar() {
    const parent = PARENT(route);
    const bar = $('#appbar');
    if (route === 'home') {
      bar.innerHTML = `<div class="appbar-inner">
        <div class="brand"><img src="assets/icon-192.png" alt="" width="32" height="32">
          <div><div class="brand-name">はじめてのラウンド</div></div></div>
        <button class="icon-btn" data-go="settings" aria-label="設定">${icon('gear')}</button></div>`;
      return;
    }
    let title = TITLES[route] || '';
    if (route.startsWith('week-')) title = `WEEK ${route.slice(5)}`;
    if (route.startsWith('drill-')) { const d = drillById(route.slice(6)); title = d ? d.name : 'ドリル'; }
    bar.innerHTML = `<div class="appbar-inner">
      ${parent ? `<button class="icon-btn" data-back="${parent}" aria-label="戻る">${icon('back')}</button>` : '<span style="width:4px"></span>'}
      <h1>${esc(title)}</h1>
      ${route === 'home' ? '' : `<button class="icon-btn" data-go="settings" aria-label="設定">${icon('gear')}</button>`}</div>`;
  }
  function tabbar() {
    const tabs = [['home', 'ホーム', 'home'], ['plan', 'プラン', 'flag'], ['practice', '練習', 'target'], ['learn', '学ぶ', 'book'], ['log', '記録', 'chart']];
    const cur = TAB_OF(route);
    $('#tabbar').innerHTML = `<div class="tabbar-inner">${tabs.map(([r, l, i]) =>
      `<a class="tab" href="#${r}" ${cur === r ? 'aria-current="page"' : ''}>${icon(i)}<span>${l}</span></a>`).join('')}</div>`;
  }
  let toastTimer = 0;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
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

  /* ---------- 画面: ホーム ---------- */
  let triviaIdx = null;
  function viewHome() {
    const n = curWeek(), w = weekOf(n);
    const left = diffDays(today(), S.profile.debut);
    const name = S.profile.name ? `${esc(S.profile.name)}さん、` : '';
    let count;
    if (left > 0) count = `<span class="label">${name}コースデビューまで</span><span class="days">${left}<small>日</small></span>`;
    else if (left === 0) count = `<span class="label">${name}いよいよ</span><span class="days" style="font-size:clamp(48px,12vw,80px)">今日がデビュー！</span>`;
    else count = `<span class="label">${name}コースデビューから</span><span class="days">${-left}<small>日</small></span>`;
    if (triviaIdx == null) triviaIdx = Math.floor(parse(today()) / 86400000) % D.trivia.length;
    const tv = D.trivia[triviaIdx];
    const pending = w.tasks.filter(t => !S.done[t.id]).slice(0, 3);

    const welcome = S.profile.confirmed ? '' : `<section class="card welcome" aria-labelledby="wl">
      <div class="eyebrow">WELCOME</div><h2 id="wl">90日でコースデビューしよう</h2>
      <p class="lead">練習開始日を ${fmtMD(S.profile.start)}、デビュー予定日を <strong>${fmtYMD(S.profile.debut)}</strong> にしています。</p>
      <ol><li>毎週の「今週のメニュー」をこなしてチェック</li><li>練習したら「記録」に残す</li><li>すきま時間に「学ぶ」でルールやうんちくを読む</li></ol>
      <div class="btn-row"><button class="btn btn-primary" data-action="confirm">この日程ではじめる</button><button class="btn btn-ghost" data-go="settings">日程を変える</button></div>
    </section>`;

    return `
    <section class="hero" aria-label="3Dのゴルフコース">
      <div class="scene-host" id="hero-scene"></div>
      <div class="hero-inner">
        <div class="hero-top"><span class="hero-chip">WEEK ${n} / ${TOTAL_WEEKS}</span><span class="hero-chip">${esc(D.phases.find(p => p.weeks.includes(n)).en)}</span></div>
        <div class="hero-count">${count}<span class="date">デビュー予定 ${fmtYMD(S.profile.debut)}</span></div>
      </div>
    </section>
    <div class="page">
      ${welcome}
      <div class="grid-2">
        <div class="section" style="gap:20px">
          <section class="card week-card" aria-labelledby="tw">
            <div class="top"><div class="hole-badge"><div><div class="l">HOLE</div><div class="n">${n}</div></div></div>
              <div><div class="eyebrow">今週のテーマ</div><h3 id="tw">${esc(w.title)}</h3></div></div>
            <p class="goal">目標：${esc(w.goal)}</p>
            ${progressBar(weekDone(n), w.tasks.length)}
            ${pending.length ? `<ul class="tasks">${pending.map(taskItem).join('')}</ul>` : '<p class="goal">今週のメニューは全部できました。ナイスラウンド！</p>'}
            <div class="btn-row"><button class="btn btn-pine" data-go="week-${n}">今週のメニューを全部見る</button><button class="btn btn-ghost" data-go="log">練習を記録</button></div>
          </section>
          <section class="section" aria-labelledby="sc">
            <div class="section-head"><h2 id="sc">12週のスコアカード</h2><button class="more" data-go="plan">プラン一覧</button></div>
            ${scorecard()}
          </section>
        </div>
        <div class="section" style="gap:20px">
          <section class="section" aria-labelledby="tl">
            <div class="section-head"><h2 id="tl">練習ツール</h2></div>
            <div class="tool-grid">
              <a class="tool" href="#tempo"><span class="ic ic-pine">${icon('metronome')}</span><span class="t">テンポ練習</span><span class="d">イチ・ニ・サンのリズムで素振り</span></a>
              <a class="tool" href="#putting"><span class="ic ic-flag">${icon('hole')}</span><span class="t">パター距離感ゲーム</span><span class="d">振り幅でカップに寄せる</span></a>
              <a class="tool" href="#course"><span class="ic ic-water">${icon('cube')}</span><span class="t">3Dコース図鑑</span><span class="d">コースの各エリアの名前と意味</span></a>
              <a class="tool" href="#rules"><span class="ic ic-sand">${icon('shield')}</span><span class="t">ルールとマナー</span><span class="d">最低限これだけ覚えればOK</span></a>
            </div>
          </section>
          <section class="card trivia-card" aria-labelledby="tv">
            <div class="eyebrow">今日のうんちく ・ ${esc(tv.tag)}</div>
            <h3 id="tv">${esc(tv.title)}</h3>
            <p>${esc(tv.body)}</p>
            <button class="btn btn-ghost" data-action="next-trivia">次のうんちく</button>
          </section>
        </div>
      </div>
    </div>`;
  }
  function afterHome() {
    if (window.GolfScene) window.GolfScene.mount($('#hero-scene'), { mode: 'hero' });
  }

  /* ---------- 画面: プラン ---------- */
  function viewPlan() {
    const now = curWeek();
    return `<div class="page page-narrow">
      <section class="section">
        <p class="lead">1週間を1ホールに見立てた、全12ホール（約3か月）のプログラムです。練習開始日：${fmtYMD(S.profile.start)}</p>
        <div class="card" style="display:grid;gap:8px"><div class="eyebrow">全体の進み具合</div>${progressBar(allDone(), allTasks())}</div>
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
        <div class="section-head"><h2 id="wm">今週のメニュー</h2></div>
        ${progressBar(weekDone(n), w.tasks.length)}
        <ul class="tasks">${w.tasks.map(taskItem).join('')}</ul>
      </section>
      <section class="point"><strong>コーチのひとこと</strong><p>${esc(w.point)}</p></section>
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
      onRep: () => { S.tempoReps++; save(); },
      onFinish: (n) => toast(`${n}回できました。ナイステンポ！`),
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
      <div class="stats">
        <div class="stat"><span class="k">練習日数</span><span class="v">${days}<small>日</small></span></div>
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
      if (entry.place === 'コース' && entry.score) completeTask('w12d', 'WEEK 12「ラウンド後の記録」を達成');
      toast('記録しました');
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
        <h2 style="font-size:18px;font-weight:900">表示</h2>
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
    home: [viewHome, afterHome], plan: [viewPlan], practice: [viewPractice], tempo: [viewTempo, afterTempo],
    putting: [viewPutting, afterPutting], learn: [viewLearn], course: [viewCourse, afterCourse], history: [viewHistory],
    trivia: [viewTrivia], quiz: [viewQuiz], glossary: [viewGlossary], rules: [viewRules], debut: [viewDebut], clubs: [viewClubs],
    log: [viewLog, afterLog], settings: [viewSettings, afterSettings],
  };
  function teardown() {
    if (window.GolfScene) window.GolfScene.unmount();
    if (window.GolfPutting) window.GolfPutting.unmount();
    if (window.GolfTempo) window.GolfTempo.unmount();
  }
  function render(keepScroll) {
    teardown();
    let r = route, html, after;
    if (r.startsWith('week-')) html = viewWeek(Number(r.slice(5)));
    else if (r.startsWith('drill-')) html = viewDrill(r.slice(6));
    else { const v = VIEWS[r] || VIEWS.home; if (!VIEWS[r]) route = 'home'; html = v[0](); after = v[1]; }
    appbar(); tabbar();
    const main = $('#main');
    main.innerHTML = html;
    if (after) after();
    if (!keepScroll) window.scrollTo(0, 0);
    document.title = route === 'home' ? 'はじめてのラウンド' : `${$('#appbar h1') ? $('#appbar h1').textContent : ''} ｜ はじめてのラウンド`;
  }
  function onRoute() {
    route = currentRoute();
    if (route === 'quiz' && quiz && quiz.i >= quiz.qs.length) quiz = null;
    render();
  }

  /* ---------- イベント ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-back],[data-action],[data-cat],[data-hist],[data-answer],[data-tempo],[data-del],[data-hs],[data-theme-set]');
    if (!t) return;
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
      case 'confirm': S.profile.confirmed = true; save(); toast('スタート！まずはWEEK 1から'); render(true); break;
      case 'next-trivia': triviaIdx = (triviaIdx + 1) % D.trivia.length; render(true); break;
      case 'shuffle': triviaOrder = D.trivia.map((_, i) => i).sort(() => Math.random() - 0.5); render(true); break;
      case 'overview': window.GolfScene.resetView(); break;
      case 'quiz-start': newQuiz(); render(); break;
      case 'quiz-next':
        quiz.i++; quiz.answered = null;
        if (quiz.i >= quiz.qs.length) {
          if (S.quizBest == null || quiz.correct > S.quizBest) S.quizBest = quiz.correct;
          save();
          if (quiz.correct >= 8) completeTask('w9b', 'WEEK 9「クイズ8問正解」を達成');
        }
        render(); break;
      case 'reset': confirmReset = true; render(true); break;
      case 'reset-no': confirmReset = false; render(true); break;
      case 'reset-yes':
        confirmReset = false; S = defaults(); save(); applyTheme(); toast('データを消去しました'); go('home'); break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.task) {
      if (t.checked) S.done[t.dataset.task] = true; else delete S.done[t.dataset.task];
      save();
      // 進捗表示だけ更新（スクロール位置は保つ）
      const wn = D.weeks.find(w => w.tasks.some(x => x.id === t.dataset.task));
      if (t.checked && wn && weekDone(wn.n) === wn.tasks.length) toast(`WEEK ${wn.n} クリア！ナイスパー`);
      render(true);
      const again = $(`[data-task="${t.dataset.task}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    if (t.dataset.check) {
      if (t.checked) S.checklist[t.dataset.check] = true; else delete S.checklist[t.dataset.check];
      save(); render(true);
      const again = $(`[data-check="${t.dataset.check}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'gl-q') $('#gl-list').innerHTML = glossList(e.target.value);
  });

  window.addEventListener('hashchange', onRoute);
  onRoute();
})();
