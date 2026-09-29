/* =========================================================
   ラウンドゲーム（3クリックショット）
   - round  : 3ホールのショートラウンド
   - nearpin: パー3で3球、ピンにどれだけ寄せられるか
   - drive  : ドライバー3球、フェアウェイに残った最長飛距離
   1打目のタップでスイング開始 → 2打目でパワー決定 → 3打目でインパクト
   ========================================================= */
(function () {
  'use strict';

  const YD = 0.9144;
  const BALL_R = 0.0214 * 1.6;   // 見やすいように実寸の1.6倍
  const CUP_R = 0.12;            // カップに入る判定（ゲーム用に少し大きめ）
  const CLUBS = [
    { id: '1W', name: 'ドライバー', max: 215, launch: 12, run: 0.16, tee: true },
    { id: '5W', name: '5番ウッド', max: 185, launch: 15, run: 0.12 },
    { id: 'UT', name: 'ユーティリティ', max: 170, launch: 17, run: 0.1 },
    { id: '7I', name: '7番アイアン', max: 145, launch: 21, run: 0.07 },
    { id: '9I', name: '9番アイアン', max: 125, launch: 27, run: 0.05 },
    { id: 'PW', name: 'ピッチングウェッジ', max: 105, launch: 31, run: 0.04 },
    { id: 'SW', name: 'サンドウェッジ', max: 75, launch: 38, run: 0.02 },
    { id: 'PT', name: 'パター', putter: true },
  ];
  const PUTT_RANGES = [3, 6, 10, 15, 25, 40];
  const LIE = {
    tee: { name: 'ティー', pow: 1, fr: 2.0, land: 1 },
    fairway: { name: 'フェアウェイ', pow: 1, fr: 2.0, land: 1 },
    path: { name: 'カート道', pow: 1, fr: 1.1, land: 1.3 },
    fringe: { name: 'カラー', pow: 0.95, fr: 1.5, land: 0.85 },
    green: { name: 'グリーン', pow: 1, fr: 0.85, land: 0.7 },
    rough: { name: 'ラフ', pow: 0.82, fr: 5.0, land: 0.35, note: '飛距離 -18%' },
    bunker: { name: 'バンカー', pow: 0.55, fr: 22, land: 0, note: '飛距離 -45%' },
    water: { name: '池', pow: 0, fr: 99, land: 0 },
    ob: { name: 'OB', pow: 0, fr: 99, land: 0 },
  };
  const TERMS = { '-4': 'コンドル', '-3': 'アルバトロス', '-2': 'イーグル', '-1': 'バーディー', '0': 'パー', '1': 'ボギー', '2': 'ダブルボギー', '3': 'トリプルボギー' };
  const term = (d) => TERMS[String(d)] || `+${d}`;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Blender のアニメーションのタイミング（秒）と、クラブごとのボール位置（ゴルファーの足元基準：x=目標方向, z=前方）
  const ANIM = {
    swing: { top: 28 / 30, imp: 40 / 30, end: 62 / 30, down: 250, follow: 900 },
    putt: { top: 16 / 30, imp: 28 / 30, end: 40 / 30, down: 320, follow: 650 },
  };
  const GS = (window.GolferKit && window.GolferKit.SCALE) || 1;   // ゴルファーの縮尺
  const BALL_AT = { Iron: [0.0, 0.735 * GS], Driver: [0.1 * GS, 1.022 * GS], Putter: [0.0, 0.492 * GS] };
  const clubKind = (c) => c.putter ? 'Putter' : ['1W', '5W', 'UT'].includes(c.id) ? 'Driver' : 'Iron';
  const bgm = (fn, ...a) => { if (window.GolfBGM && opts && opts.bgm && opts.bgm()) window.GolfBGM[fn](...a); };

  let W = null;      // GolfScene.world()
  let G = null;      // ゲームの状態
  let ui = null;     // HUD の要素
  let opts = null;
  let objs = null;   // 3D オブジェクト（ボール・ゴルファーなど）

  /* ---------- 効果音 ---------- */
  let actx = null;
  function sfx(kind) {
    if (!opts || !opts.sound()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { return; }
    const t = actx.currentTime;
    const tone = (f, at, len, vol, type) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(vol, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      o.connect(g).connect(actx.destination); o.start(t + at); o.stop(t + at + len + 0.05);
    };
    if (kind === 'tick') tone(900, 0, 0.05, 0.12);
    if (kind === 'impact') { tone(1800, 0, 0.06, 0.35, 'triangle'); tone(420, 0, 0.12, 0.25); }
    if (kind === 'just') { tone(1800, 0, 0.06, 0.35, 'triangle'); tone(1320, 0.05, 0.25, 0.25); tone(1760, 0.12, 0.3, 0.2); }
    if (kind === 'putt') tone(700, 0, 0.08, 0.3, 'triangle');
    if (kind === 'cup') { tone(1568, 0, 0.12, 0.3); tone(1175, 0.1, 0.2, 0.3); tone(1568, 0.22, 0.3, 0.25); }
    if (kind === 'cheer') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.4, 0.2));
    if (kind === 'bad') { tone(220, 0, 0.3, 0.25, 'sawtooth'); tone(165, 0.15, 0.4, 0.2, 'sawtooth'); }
  }

  /* ---------- 3D：ゴルファー（ずんぐりしたかわいい体型） ---------- */
  function makeGolfer(THREE, wear) {
    const root = new THREE.Group();
    const M = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.7 : r });
    const skin = M(0xf1c9a5), shirt = M(wear || 0x0d4731), pants = M(0x2b2f36), white = M(0xf5f5f0, 0.5), dark = M(0x1a1a1a, 0.4);
    const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || root).add(m); return m; };
    add(new THREE.CylinderGeometry(0.1, 0.09, 0.62, 12), pants, -0.15, 0.36, 0);
    add(new THREE.CylinderGeometry(0.1, 0.09, 0.62, 12), pants, 0.15, 0.36, 0);
    add(new THREE.BoxGeometry(0.16, 0.08, 0.28), white, -0.15, 0.04, 0.05);
    add(new THREE.BoxGeometry(0.16, 0.08, 0.28), white, 0.15, 0.04, 0.05);
    const torso = new THREE.Group(); torso.position.set(0, 0.72, 0); root.add(torso);
    add(new THREE.CapsuleGeometry(0.25, 0.32, 6, 16), shirt, 0, 0.3, 0.02, torso);
    const head = add(new THREE.SphereGeometry(0.27, 24, 18), skin, 0, 0.86, 0.06, torso);
    head.scale.set(1, 0.96, 1);
    const cap = add(new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0.9, 0.06, torso);
    cap.scale.set(1.02, 0.8, 1.02);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), white, 0, 0.92, 0.2, torso).scale.set(1, 1, 1.2);
    add(new THREE.SphereGeometry(0.035, 10, 8), dark, -0.09, 0.88, 0.31, torso);
    add(new THREE.SphereGeometry(0.035, 10, 8), dark, 0.09, 0.88, 0.31, torso);
    // 腕とクラブ（肩の中心を支点に振る）
    const pivot = new THREE.Group(); pivot.position.set(0, 0.52, 0.1); torso.add(pivot);
    const arc = new THREE.Group(); pivot.add(arc);
    const arm = (x) => { const m = add(new THREE.CylinderGeometry(0.06, 0.055, 0.55, 10), shirt, x, -0.3, 0, arc); m.rotation.z = x > 0 ? 0.18 : -0.18; };
    arm(-0.12); arm(0.12);
    add(new THREE.SphereGeometry(0.075, 12, 10), skin, 0, -0.6, 0, arc);
    const club = new THREE.Group(); club.position.set(0, -0.6, 0); arc.add(club);
    const shaft = add(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), M(0xc9ccd1, 0.3), 0, -0.5, 0, club);
    const headM = add(new THREE.BoxGeometry(0.1, 0.07, 0.16), M(0x3a3f45, 0.35), 0.0, -1.0, 0.04, club);
    return {
      root, torso, pivot, arc, club, shaft, headM, shirtMat: shirt,
      setClubLen(len) { shaft.scale.y = len; shaft.position.y = -len / 2; headM.position.y = -len; },
      pose(theta) { arc.rotation.z = theta; torso.rotation.y = -theta * 0.22; },
    };
  }

  /* ---------- 3D：Blender で作ったゴルファー（js/golfer3d.js） ---------- */
  function loadGolferModel(THREE, wear, onReady) {
    if (window.GolferKit) window.GolferKit.load(THREE, { character: opts.character ? opts.character() : 'female', wear: opts.wearTint ? opts.wearTint() : null }, onReady);
  }

  function makeTrail(THREE) {
    const N = 90;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    line.frustumCulled = false;
    let n = 0;
    return {
      line,
      reset() { n = 0; geo.setDrawRange(0, 0); line.material.opacity = 0.85; },
      push(p) {
        const a = geo.attributes.position.array;
        if (n >= N) { a.copyWithin(0, 3); n = N - 1; }
        a[n * 3] = p.x; a[n * 3 + 1] = p.y; a[n * 3 + 2] = p.z; n++;
        geo.attributes.position.needsUpdate = true; geo.setDrawRange(0, n);
      },
    };
  }

  function buildObjects() {
    const THREE = W.THREE;
    const ball = W.makeBall(THREE, BALL_R, opts.ballColor());
    const golfer = makeGolfer(THREE, opts.wearColor());
    // 本物のゴルファーを読み込めたら差し替える
    loadGolferModel(THREE, opts.wearColor(), (model) => {
      if (!objs) return;
      objs.group.remove(objs.golfer.root);
      objs.group.add(model.root);
      objs.golfer = model;
      if (G) placeGolfer();
    });
    const trail = makeTrail(THREE);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 40), new THREE.MeshBasicMaterial({ color: 0xf2b705, transparent: true, opacity: 0.9, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 10;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    dot.rotation.x = -Math.PI / 2; dot.renderOrder = 11;
    // 遠くても見えるように、地面の輪に加えて看板型の目印を立てる
    const c = document.createElement('canvas'); c.width = 128; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#f2b705'; x.strokeStyle = '#0d4731'; x.lineWidth = 8;
    x.beginPath(); x.arc(64, 60, 50, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#0d4731'; x.beginPath(); x.arc(64, 60, 16, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2b705'; x.beginPath(); x.moveTo(40, 112); x.lineTo(88, 112); x.lineTo(64, 156); x.closePath(); x.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    pin.center.set(0.5, 0); pin.renderOrder = 12;
    const marker = new THREE.Group(); marker.add(ring, dot, pin);
    marker.userData.pin = pin;
    const aimGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    const aimLine = new THREE.Line(aimGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.18, gapSize: 0.12, depthTest: false, transparent: true, opacity: 0.9 }));
    aimLine.renderOrder = 10; aimLine.frustumCulled = false;
    const group = new THREE.Group();
    group.add(ball, golfer.root, trail.line, marker, aimLine);
    W.scene.add(group);
    return { group, ball, golfer, trail, marker, aimLine, look: new THREE.Vector3(), tmp: new THREE.Vector3() };
  }

  /* ---------- ユーティリティ ---------- */
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const yds = (m) => Math.round(m / YD);
  const groundY = (x, z) => W.height(x, z);
  function slopeAt(x, z) {
    const e = 0.3;
    return { x: (groundY(x + e, z) - groundY(x - e, z)) / (2 * e), z: (groundY(x, z + e) - groundY(x, z - e)) / (2 * e) };
  }
  function clubMax(c, lie) {
    let m = c.max * YD * G.skill.power;
    const L = LIE[lie] || LIE.fairway;
    if (lie === 'bunker' && c.id === 'SW') return m * 0.85;
    return m * L.pow;
  }
  function allowedClubs() {
    return CLUBS.filter(c => {
      if (G.lockClub) return c.id === G.lockClub;
      if (c.tee && G.lie !== 'tee') return false;
      return true;
    });
  }
  function autoClub() {
    const d = dist2(G.ball, G.pin);
    const list = allowedClubs();
    if (G.lockClub) return list[0];
    if (G.lie === 'green' || (G.lie === 'fringe' && d < 14)) return CLUBS.find(c => c.putter);
    const shots = list.filter(c => !c.putter).sort((a, b) => a.max - b.max);
    return shots.find(c => clubMax(c, G.lie) >= d * 0.98) || shots[shots.length - 1];
  }
  function puttRange(d) { return PUTT_RANGES.find(r => r >= d * 1.3) || PUTT_RANGES[PUTT_RANGES.length - 1]; }
  function autoAim() {
    const d = dist2(G.ball, G.pin);
    const c = G.club;
    let tx = G.pin.x, tz = G.pin.z;
    if (!c.putter) {
      const reach = clubMax(c, G.lie) / (1 + c.run);
      if (d > reach * 1.15) {
        // 届かないときはフェアウェイの中央を狙う
        let best = null;
        for (let z = G.ball.z; z > G.pin.z; z -= 2) {
          const x = W.center(z);
          if (Math.hypot(x - G.ball.x, z - G.ball.z) >= reach) { best = { x, z }; break; }
        }
        if (best) { tx = best.x; tz = best.z; }
      }
    }
    G.yaw = Math.atan2(tx - G.ball.x, tz - G.ball.z);
  }
  const dirOf = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

  /* ---------- 状態 ---------- */
  // 選んだコースのホール一覧（「全9ホール」は3コースを順に）
  function courseHoles() {
    const GS = window.GolfScene;
    if (opts.course === 'all') return GS.COURSES.flatMap(c => GS.holesOf(c.id)).map((h, i) => Object.assign({}, h, { n: i + 1 }));
    return W.holes;
  }
  function newGame(mode) {
    const first = opts.course === 'all' ? 'hills' : (opts.course || 'hills');
    if (window.GolfScene.course !== first) window.GolfScene.setCourse(first);
    const holes = courseHoles();
    G = {
      mode, phase: 'intro', t0: performance.now(), last: performance.now(),
      holes: mode === 'round' ? holes : mode === 'nearpin' ? [holes[1]] : [holes[0]],
      hi: 0, scores: [], attempts: [], tries: 3,
      skill: opts.skill(),
      lockClub: mode === 'drive' ? '1W' : null,
      swing: { theta: 0, anim: null },
      shotsThisHole: 0,
    };
    startHole();
  }

  // 次のホールが別のコースなら、コースを作り直してから始める
  function enterHole() {
    const h = G.holes[G.hi];
    const GS = window.GolfScene;
    if (h.course && GS.course !== h.course) {
      const c = GS.COURSES.find(x => x.id === h.course);
      G.phase = 'loading';
      showOverlay(`<div class="g-ov-eyebrow">NEXT COURSE</div><div class="g-ov-term">${c.name}</div><p>つぎのコースへ移動中…</p>`);
      setTimeout(() => { if (!G) return; GS.setCourse(h.course); hideOverlay(); startHole(); }, 80);
      return;
    }
    startHole();
  }

  function startHole() {
    const h = G.holes[G.hi];
    G.hole = h;
    G.par = h.par;
    G.strokes = 0;
    G.pin = { x: h.pin.x, z: h.pin.z };
    G.ball = { x: h.tee.x, z: h.tee.z };
    G.prev = { x: h.tee.x, z: h.tee.z };
    G.lie = 'tee';
    G.chip = false;
    const sp = (h.wind[0] + Math.random() * (h.wind[1] - h.wind[0])) * W.weather.wind;
    const ang = Math.random() * Math.PI * 2;
    G.wind = { x: Math.sin(ang) * sp, z: Math.cos(ang) * sp, sp };
    W.flag.setPin(G.pin.x, G.pin.z);
    W.flag.setWind(Math.atan2(-G.wind.z, G.wind.x));
    W.flag.group.visible = true;
    W.flag.group.scale.setScalar(0.5);   // プレー中は実寸に近い旗竿に
    G.length = dist2(G.ball, G.pin);
    prepareShot(true);
    G.phase = 'intro';
    G.t0 = performance.now();
    const title = G.mode === 'nearpin' ? 'ニアピンチャレンジ' : G.mode === 'drive' ? 'ドラコンチャレンジ' : `HOLE ${h.n}`;
    showMsg(title, `PAR ${h.par} ・ ${yds(G.length)}y`, 'info', 2200);
    renderHud();
  }

  function prepareShot(first) {
    G.lie = first ? 'tee' : W.lie(G.ball.x, G.ball.z);
    G.club = autoClub();
    G.puttMax = puttRange(dist2(G.ball, G.pin));
    autoAim();
    placeBall();
    placeGolfer();
    objs.trail.reset();
    G.phase = 'aim';
    G.power = 0; G.p = 0;
    bgm('duck', false);
    renderHud();
  }

  function placeBall() {
    const y = groundY(G.ball.x, G.ball.z) + BALL_R + (G.lie === 'tee' ? 0.04 : 0);
    objs.ball.position.set(G.ball.x, y, G.ball.z);
    objs.ball.visible = true;
  }

  function placeGolfer() {
    const d = dirOf(G.yaw);
    const f = { x: -d.z, z: d.x };             // ゴルファーの向き（目標線の右向き）
    const gr = objs.golfer;
    G.swing = { theta: 0, anim: null };
    G.animT = 0;
    G.react = null;
    if (gr.model) {
      const kind = clubKind(G.club);
      const [ox, oz] = BALL_AT[kind];
      const gx = G.ball.x - d.x * ox - f.x * oz, gz = G.ball.z - d.z * ox - f.z * oz;
      gr.root.position.set(gx, groundY(gx, gz) + (G.lie === 'tee' ? 0 : 0), gz);
      gr.root.rotation.y = Math.atan2(f.x, f.z);
      gr.setClub(kind);
      gr.pose(0, 0);
      gr.root.visible = true;
      return;
    }
    const off = G.club.putter ? 0.55 : 0.72;
    const gx = G.ball.x - f.x * off, gz = G.ball.z - f.z * off;
    gr.root.position.set(gx, groundY(gx, gz), gz);
    gr.root.rotation.y = Math.atan2(f.x, f.z);
    // 肩からボールまでの長さに合わせてクラブの角度を決める
    const shoulderY = 0.72 + 0.52, reach = off - 0.1;
    const lean = Math.atan2(reach, shoulderY - 0.02);
    gr.pivot.rotation.x = -lean;
    gr.setClubLen(Math.max(0.3, Math.hypot(reach, shoulderY) - 0.6 - 0.02));
    gr.pose(0);
    gr.root.visible = true;
  }

  /* ---------- 入力 ---------- */
  function tap() {
    if (!G) return;
    const now = performance.now();
    if (G.phase === 'intro') { G.phase = 'aim'; hideMsg(); return; }
    if (G.phase === 'aim') { G.phase = 'power'; G.t0 = now; sfx('tick'); renderHud(); return; }
    if (G.phase === 'power') {
      G.power = Math.max(0.03, G.p);
      if (G.club.putter) { hit(0); return; }
      G.phase = 'return'; G.t1 = now; sfx('tick'); return;
    }
    if (G.phase === 'return') { hit(G.p); return; }
    if (G.phase === 'rest-wait' || G.phase === 'flight' || G.phase === 'roll') return;
  }
  function aim(delta) { if (G && G.phase === 'aim') { G.yaw += delta; placeGolfer(); } }
  function changeClub(step) {
    if (!G || G.phase !== 'aim') return;
    if (G.club.putter) {
      const i = PUTT_RANGES.indexOf(G.puttMax);
      const j = Math.max(0, Math.min(PUTT_RANGES.length - 1, i + step));
      if (j !== i) { G.puttMax = PUTT_RANGES[j]; renderHud(); return; }
    }
    const list = allowedClubs();
    let i = list.indexOf(G.club);
    i = Math.max(0, Math.min(list.length - 1, i + step));
    G.club = list[i];
    if (G.club.putter) G.puttMax = puttRange(dist2(G.ball, G.pin));
    placeGolfer();
    renderHud();
  }

  /* ---------- ショット ---------- */
  function hit(acc) {
    const c = G.club;
    G.strokes++;
    G.shotsThisHole++;
    G.prev = { x: G.ball.x, z: G.ball.z };
    G.fromLie = G.lie;
    G.chip = false;
    G.lastDry = null;
    if (opts.onEvent) opts.onEvent({ type: 'shot' });
    const d = dirOf(G.yaw);
    const right = { x: -d.z, z: d.x };
    G.swing.anim = { start: performance.now(), top: G.swing.theta, topT: G.animT || 0 };
    bgm('duck', true);
    objs.marker.visible = false; objs.aimLine.visible = false;

    if (c.putter) {
      sfx('putt');
      const distFlat = G.power * G.puttMax;
      const fr = LIE[G.lie].fr;
      const v0 = Math.sqrt(2 * fr * distFlat);
      G.vel = { x: d.x * v0, z: d.z * v0 };
      G.phase = 'swing';
      G.pendingRoll = true;
      G.putt = true;
      renderHud();
      return;
    }
    G.putt = false;
    // 当たりの判定
    const meet = G.skill.meet;
    let err, label = '', bonus = 1;
    const o = acc;
    if (Math.abs(o) <= meet * 0.35) { err = 0; bonus = 1.03; label = 'JUST!'; }
    else if (Math.abs(o) <= meet) err = (o / meet) * 0.12;
    else err = Math.sign(o) * Math.min(1, 0.12 + (Math.abs(o) - meet) * 5);
    if (G.lie === 'rough') err += (Math.random() - 0.5) * 0.14;
    let power = G.power * bonus;
    if (Math.abs(err) > 0.5) { power *= 1 - (Math.abs(err) - 0.5) * 0.7; label = 'ミスショット'; }
    else if (!label) label = err > 0.06 ? 'フック気味' : err < -0.06 ? 'スライス気味' : 'ナイスショット';
    sfx(label === 'JUST!' ? 'just' : 'impact');
    G.shotLabel = label;

    const carry = clubMax(c, G.lie) / (1 + c.run) * power;
    const lat = -err * carry * 0.24;
    const T = 1.0 + carry / 85;
    const launch = (c.launch + 6) * Math.PI / 180;
    const apex = Math.max(1.2, carry * Math.tan(launch) * 0.33);
    const driftK = T * 0.5 * (0.6 + c.launch / 60);
    const drift = { x: G.wind.x * driftK, z: G.wind.z * driftK };
    const start = { x: G.ball.x, z: G.ball.z, y: objs.ball.position.y };
    const endX = start.x + d.x * carry + right.x * lat + drift.x;
    const endZ = start.z + d.z * carry + right.z * lat + drift.z;
    G.flight = { start, d, right, carry, lat, drift, T, apex, end: { x: endX, z: endZ, y: groundY(endX, endZ) + BALL_R }, t0: null };
    G.phase = 'swing';
    if (label !== 'ナイスショット') showMsg(label, '', label === 'JUST!' ? 'good' : label === 'ミスショット' ? 'bad' : 'info', 1100);
  }

  function flightPos(f, t, out) {
    const x = f.start.x + f.d.x * f.carry * t + f.right.x * f.lat * t * t + f.drift.x * Math.pow(t, 1.6);
    const z = f.start.z + f.d.z * f.carry * t + f.right.z * f.lat * t * t + f.drift.z * Math.pow(t, 1.6);
    const y = f.start.y + (f.end.y - f.start.y) * t + 4 * f.apex * t * (1 - t) * (1 + 0.25 * t);
    out.set(x, Math.max(y, groundY(x, z) + BALL_R), z);
    return out;
  }

  function land() {
    const f = G.flight;
    const x = f.end.x, z = f.end.z;
    G.ball = { x, z };
    const lie = W.lie(x, z);
    if (lie === 'ob') return penalty('ob');
    if (lie === 'water') return penalty('water', { x: f.start.x, z: f.start.z });
    const L = LIE[lie];
    // 着地後の転がり
    const dx = f.d.x * f.carry + f.right.x * f.lat * 2 + f.drift.x * 1.6;
    const dz = f.d.z * f.carry + f.right.z * f.lat * 2 + f.drift.z * 1.6;
    const len = Math.hypot(dx, dz) || 1;
    const run = f.carry * G.club.run * L.land * W.weather.roll;
    const v = Math.sqrt(2 * L.fr * Math.max(0, run));
    G.vel = { x: dx / len * v, z: dz / len * v };
    G.phase = 'roll';
    G.rollStart = performance.now();
  }

  function rollStep(dt) {
    let steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    while (steps-- > 0) {
      const lie = W.lie(G.ball.x, G.ball.z);
      if (lie === 'ob') return penalty('ob');
      if (lie === 'water') return penalty('water', G.lastDry || G.prev);
      G.lastDry = { x: G.ball.x, z: G.ball.z };
      const L = LIE[lie];
      const sl = slopeAt(G.ball.x, G.ball.z);
      const k = lie === 'green' || lie === 'fringe' ? 5.2 : 3.2;
      let ax = -sl.x * k, az = -sl.z * k;
      const sp = Math.hypot(G.vel.x, G.vel.z);
      const slopeA = Math.hypot(ax, az);
      if (sp < 0.05 && slopeA < L.fr * 0.9) { G.vel.x = G.vel.z = 0; return stop(); }
      if (sp > 0) { ax -= G.vel.x / sp * L.fr; az -= G.vel.z / sp * L.fr; }
      G.vel.x += ax * h; G.vel.z += az * h;
      const nsp = Math.hypot(G.vel.x, G.vel.z);
      if (sp > 0 && nsp > 0 && (G.vel.x * (G.vel.x - ax * h) + G.vel.z * (G.vel.z - az * h)) < 0 && slopeA < L.fr) { G.vel.x = G.vel.z = 0; return stop(); }
      G.ball.x += G.vel.x * h; G.ball.z += G.vel.z * h;
      // カップ
      const dc = dist2(G.ball, G.pin);
      if (dc < CUP_R) {
        if (nsp < 1.9) return holed();
        // 速すぎるとカップの縁で弾む
        G.vel.x *= 0.7; G.vel.z *= 0.7;
      }
    }
    if (performance.now() - G.rollStart > 14000) { G.vel.x = G.vel.z = 0; return stop(); }
  }

  function stop() {
    G.phase = 'rest-wait';
    G.restAt = performance.now();
  }

  function holed() {
    G.phase = 'holed';
    G.holedAt = performance.now();
    G.chip = !G.putt;
    sfx('cup');
    bgm('jingle', 'cupin');
    react('cheer');
    objs.ball.position.set(G.pin.x, groundY(G.pin.x, G.pin.z) + BALL_R, G.pin.z);
  }

  // ゴルファーの反応（喜ぶ・落ち込む）
  function react(kind) {
    if (!kind || !objs || !objs.golfer.model) return;
    G.react = kind;
    objs.golfer.react(kind);
  }

  function penalty(kind, from) {
    G.strokes++;
    sfx('bad');
    bgm('jingle', 'miss');
    react('sad');
    if (kind === 'ob') {
      G.ball = { x: G.prev.x, z: G.prev.z };
      showMsg('OB', `1打罰で元の場所から打ち直し。次は${G.strokes + 1}打目`, 'bad', 2600);
      G.afterPenalty = G.fromLie === 'tee' ? 'tee' : null;
    } else {
      // 池に入った地点の近く（手前）にドロップ
      const s = from || G.prev;
      let x = G.ball.x, z = G.ball.z;
      const dx = s.x - x, dz = s.z - z, len = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < 200 && W.lie(x, z) === 'water'; i++) { x += dx / len; z += dz / len; }
      x += dx / len * 2; z += dz / len * 2;
      G.ball = { x, z };
      G.afterPenalty = null;
      showMsg('池に入りました', `1打罰でドロップ。次は${G.strokes + 1}打目`, 'bad', 2600);
    }
    if (opts.onEvent) opts.onEvent({ type: 'penalty', kind });
    if (G.mode !== 'round') { endAttempt({ fail: kind === 'ob' ? 'OB' : '池' }); return; }
    G.phase = 'penalty';
    G.restAt = performance.now();
  }

  function afterRest() {
    if (G.mode === 'nearpin') {
      const d = dist2(G.ball, G.pin);
      const onGreen = ['green', 'fringe'].includes(W.lie(G.ball.x, G.ball.z));
      return endAttempt({ dist: d, onGreen });
    }
    if (G.mode === 'drive') {
      const lie = W.lie(G.ball.x, G.ball.z);
      const yards = yds(dist2(G.ball, G.hole.tee));
      return endAttempt({ yards, fair: lie === 'fairway' || lie === 'fringe' || lie === 'green', lie });
    }
    // ラウンド：パーの2倍で打ち切り
    if (G.strokes >= G.par * 2) {
      showMsg('ギブアップ', `パーの2倍（${G.par * 2}打）でボールを拾いました`, 'info', 2400);
      return finishHole(true);
    }
    const lie = W.lie(G.ball.x, G.ball.z);
    if (lie === 'bunker') showMsg('バンカー', 'クラブを砂につけずに構えよう', 'info', 1800);
    else if (lie === 'green' && !G.putt) showMsg(G.shotLabel === 'JUST!' ? 'ナイスオン！' : 'グリーンに乗った！', '', 'good', 1500);
    prepareShot(false);
  }

  function endAttempt(res) {
    G.attempts.push(res);
    G.phase = 'attempt-end';
    G.restAt = performance.now();
    let title, sub;
    if (G.mode === 'nearpin') {
      if (res.fail) { title = res.fail; sub = '記録なし'; }
      else if (res.holed) { title = 'ホールインワン！'; sub = '0m'; }
      else { title = `ピンまで ${res.dist.toFixed(1)}m`; sub = res.dist <= 1 ? 'ベタピン！' : res.dist <= 5 ? 'ナイスニアピン！' : res.onGreen ? 'ナイスオン' : ''; }
      if (opts.onEvent) opts.onEvent({ type: 'nearpin', dist: res.fail ? null : res.holed ? 0 : res.dist });
    } else {
      if (res.fail) { title = res.fail; sub = '記録なし'; }
      else if (res.fair) { title = `${res.yards}ヤード`; sub = res.yards >= 200 ? 'ビッグドライブ！' : 'フェアウェイキープ'; }
      else { title = 'フェアウェイ外'; sub = `${res.yards}y（${LIE[res.lie] ? LIE[res.lie].name : ''}）は記録になりません`; }
      if (opts.onEvent) opts.onEvent({ type: 'drive', yards: res.fair && !res.fail ? res.yards : 0 });
    }
    const good = (G.mode === 'nearpin' && !res.fail && (res.holed || res.dist <= 5)) || (G.mode === 'drive' && res.fair && res.yards >= 200);
    if (good) { sfx('cheer'); bgm('jingle', 'fanfare'); if (window.GolfFX) window.GolfFX.confetti(); }
    react(good ? 'cheer' : res.fail || (G.mode === 'drive' && !res.fair) ? 'sad' : null);
    showMsg(title, sub, res.fail ? 'bad' : 'good', 2200);
  }

  function nextAttempt() {
    if (G.attempts.length >= G.tries) return showChallengeResult();
    G.ball = { x: G.hole.tee.x, z: G.hole.tee.z };
    G.strokes = 0;
    prepareShot(true);
  }

  function finishHole(gaveUp) {
    const strokes = gaveUp ? G.par * 2 : G.strokes;
    const diff = strokes - G.par;
    G.scores.push({ n: G.hole.n, par: G.par, strokes, diff });
    G.phase = 'hole-end';
    const hio = !gaveUp && strokes === 1;
    if (opts.onEvent) opts.onEvent({ type: 'hole', par: G.par, strokes, diff, chipin: !gaveUp && G.chip && strokes > 1, hio });
    if (diff <= -1 || hio) { sfx('cheer'); bgm('jingle', 'fanfare'); if (window.GolfFX) window.GolfFX.confetti(); }
    react(diff <= -1 || hio ? 'cheer' : diff >= 2 ? 'sad' : null);
    const name = hio ? 'ホールインワン！' : term(diff);
    const chip = !gaveUp && G.chip && !hio ? 'チップイン！ ' : '';
    showOverlay(`
      <div class="g-ov-eyebrow">HOLE ${G.hole.n} ・ PAR ${G.par}</div>
      <div class="g-ov-term ${diff < 0 || hio ? 'good' : ''}">${chip}${name}</div>
      <p>${strokes}打でホールアウト${gaveUp ? '（ギブアップ）' : ''}</p>
      <button class="btn btn-primary btn-block" data-g="next-hole">${G.hi + 1 < G.holes.length ? '次のホールへ' : 'スコアカードを見る'}</button>`);
  }

  function nextHole() {
    hideOverlay();
    G.hi++;
    if (G.hi >= G.holes.length) return showRoundResult();
    enterHole();
  }

  function showRoundResult() {
    const tot = G.scores.reduce((s, x) => s + x.strokes, 0);
    const par = G.scores.reduce((s, x) => s + x.par, 0);
    const d = tot - par;
    if (opts.onEvent) opts.onEvent({ type: 'round', total: tot, par, course: opts.course || 'hills', weather: opts.weather || 'sunny', scores: G.scores.map(x => ({ n: x.n, par: x.par, strokes: x.strokes })) });
    G.phase = 'over';
    showOverlay(`
      <div class="g-ov-eyebrow">${opts.course === 'all' ? 'ALL 9 HOLES' : 'SHORT ROUND'} ・ RESULT</div>
      <div class="g-ov-score">${tot}<small>（${d === 0 ? 'イーブン' : d > 0 ? '+' + d : d}）</small></div>
      <div class="g-sc ${G.scores.length > 5 ? 'g-sc-wide' : ''}"><table><thead><tr><th>HOLE</th>${G.scores.map(s => `<th>${s.n}</th>`).join('')}<th>計</th></tr></thead>
      <tbody><tr><th>PAR</th>${G.scores.map(s => `<td>${s.par}</td>`).join('')}<td>${par}</td></tr>
      <tr><th>打数</th>${G.scores.map(s => `<td><span class="g-sc-mark ${s.diff < 0 ? 'under' : s.diff > 0 ? 'over' : ''}">${s.strokes}</span></td>`).join('')}<td>${tot}</td></tr></tbody></table></div>
      <p class="g-ov-note">〇はバーディー以上、□はボギー以上。本物のスコアカードと同じ書き方です。</p>
      <div class="btn-row"><button class="btn btn-primary" data-g="again">もう一度</button><button class="btn btn-ghost" data-g="exit">ゲーム一覧へ</button></div>`);
  }

  function showChallengeResult() {
    G.phase = 'over';
    let rows, best;
    if (G.mode === 'nearpin') {
      const ok = G.attempts.filter(a => !a.fail).map(a => a.holed ? 0 : a.dist);
      best = ok.length ? Math.min(...ok) : null;
      rows = G.attempts.map((a, i) => `<li><span>${i + 1}球目</span><b>${a.fail ? a.fail : a.holed ? 'カップイン' : a.dist.toFixed(1) + 'm'}</b></li>`).join('');
      best = best == null ? '記録なし' : best.toFixed(1) + 'm';
    } else {
      const ok = G.attempts.filter(a => !a.fail && a.fair).map(a => a.yards);
      best = ok.length ? Math.max(...ok) + 'y' : '記録なし';
      rows = G.attempts.map((a, i) => `<li><span>${i + 1}球目</span><b>${a.fail ? a.fail : a.fair ? a.yards + 'y' : 'フェアウェイ外'}</b></li>`).join('');
    }
    showOverlay(`
      <div class="g-ov-eyebrow">${G.mode === 'nearpin' ? 'NEAREST TO THE PIN' : 'LONG DRIVE'}</div>
      <div class="g-ov-score">${best}<small>ベスト</small></div>
      <ul class="g-list">${rows}</ul>
      <div class="btn-row"><button class="btn btn-primary" data-g="again">もう一度</button><button class="btn btn-ghost" data-g="exit">ゲーム一覧へ</button></div>`);
  }

  /* ---------- 毎フレーム ---------- */
  function frame(time) {
    if (!G || !objs) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - G.last) / 1000);
    G.last = now;
    const cam = W.camera;
    const d = dirOf(G.yaw);
    const b = objs.ball.position;
    const ease = (k) => 1 - Math.exp(-dt * k);

    // ゲージ
    const A = G.club.putter ? ANIM.putt : ANIM.swing;
    if (G.phase === 'power') {
      G.p = Math.min(1, (now - G.t0) / 1050);
      G.swing.theta = -(G.club.putter ? 0.9 : 2.5) * G.p;
      G.animT = A.top * G.p;
      if (G.p >= 1) {
        G.power = 1;
        if (G.club.putter) hit(0); else { G.phase = 'return'; G.t1 = now; }
      }
    } else if (G.phase === 'return') {
      G.p = G.power - (now - G.t1) / 1000 * 1.5;
      if (G.p <= -0.2) hit(-0.2);
    }
    if (G.phase === 'swing') {
      const k = Math.min(1, (now - G.swing.anim.start) / A.down);
      G.swing.theta = G.swing.anim.top * (1 - k * k);
      G.animT = G.swing.anim.topT + (A.imp - G.swing.anim.topT) * k * k;
      if (k >= 1) {
        if (G.pendingRoll) { G.pendingRoll = false; G.phase = 'roll'; G.rollStart = now; }
        else { G.phase = 'flight'; G.flight.t0 = now; objs.trail.reset(); }
      }
    }
    // フォロースルー
    if (G.swing.anim && G.phase !== 'swing' && G.phase !== 'power' && G.phase !== 'return') {
      const k = Math.min(1, (now - G.swing.anim.start - A.down) / A.follow);
      if (k > 0) {
        G.swing.theta = (G.club.putter ? 0.8 : 2.7) * (1 - Math.pow(1 - k, 3));
        G.animT = A.imp + (A.end - A.imp) * (1 - Math.pow(1 - k, 2));
      }
    }
    const gf = objs.golfer;
    if (gf.model && G.react) gf.tick(dt);
    else if (gf.model && (G.phase === 'aim' || G.phase === 'intro') && !G.swing.anim) gf.idle(dt);
    else gf.pose(G.swing.theta, G.animT);

    // ボールの移動
    if (G.phase === 'flight') {
      const t = Math.min(1, (now - G.flight.t0) / 1000 / G.flight.T);
      flightPos(G.flight, t, objs.ball.position);
      objs.trail.push(objs.ball.position);
      if (t >= 1) land();
    } else if (G.phase === 'roll') {
      rollStep(dt);
      if (G.phase === 'roll' || G.phase === 'rest-wait') placeBall();
      if (G.putt) objs.trail.reset();
    }
    if (G.phase === 'holed') {
      const k = Math.min(1, (now - G.holedAt) / 350);
      objs.ball.position.y = groundY(G.pin.x, G.pin.z) + BALL_R - k * 0.15;
      if (k >= 1 && !G.holedShown) {
        G.holedShown = true;
        objs.ball.visible = false;
        if (G.mode === 'round') {
          setTimeout(() => { G.holedShown = false; finishHole(false); }, 700);
        } else {
          setTimeout(() => { G.holedShown = false; endAttempt(G.mode === 'nearpin' ? { dist: 0, holed: true } : { yards: yds(dist2(G.pin, G.hole.tee)), fair: true }); }, 500);
        }
      }
    }
    if (G.phase === 'rest-wait' && now - G.restAt > 700) afterRest();
    if (G.phase === 'penalty' && now - G.restAt > 1400) {
      if (G.afterPenalty === 'tee') { G.ball = { x: G.hole.tee.x, z: G.hole.tee.z }; prepareShot(true); }
      else prepareShot(false);
    }
    if (G.phase === 'attempt-end' && now - G.restAt > 2300) nextAttempt();
    if (objs.trail.line.material.opacity > 0 && (G.phase === 'aim')) objs.trail.line.material.opacity = Math.max(0, objs.trail.line.material.opacity - dt);

    // 目標マーカー
    const aiming = G.phase === 'aim' || G.phase === 'power' || G.phase === 'return' || G.phase === 'intro';
    if (aiming && !G.club.putter) {
      const reach = clubMax(G.club, G.lie) / (1 + G.club.run);
      const mx = G.ball.x + d.x * reach, mz = G.ball.z + d.z * reach;
      objs.marker.position.set(mx, groundY(mx, mz) + 0.3, mz);
      objs.marker.scale.setScalar(Math.max(1, reach / 70));
      const camD = cam.position.distanceTo(objs.marker.position);
      const sz = camD * 0.045 / objs.marker.scale.x;
      objs.marker.userData.pin.scale.set(sz, sz * 1.25, 1);
      objs.marker.visible = true; objs.aimLine.visible = false;
    } else if (aiming) {
      objs.marker.visible = false;
      const len = Math.min(dist2(G.ball, G.pin) + 0.5, G.puttMax);
      const pts = objs.aimLine.geometry.attributes.position.array;
      pts[0] = b.x; pts[1] = b.y; pts[2] = b.z;
      const ex = b.x + d.x * len, ez = b.z + d.z * len;
      pts[3] = ex; pts[4] = groundY(ex, ez) + 0.03; pts[5] = ez;
      objs.aimLine.geometry.attributes.position.needsUpdate = true;
      objs.aimLine.computeLineDistances();
      objs.aimLine.visible = true;
    } else { objs.marker.visible = false; objs.aimLine.visible = false; }

    // カメラ
    const tgt = objs.tmp;
    if (G.phase === 'intro') {
      const k = Math.min(1, (now - G.t0) / 2400);
      const e = k * k * (3 - 2 * k);
      const hy = groundY(G.pin.x, G.pin.z);
      const p0 = { x: G.pin.x - d.x * 20, y: hy + 55, z: G.pin.z - d.z * 20 };
      const p1 = aimCam(d, b);
      cam.position.set(p0.x + (p1.x - p0.x) * e, p0.y + (p1.y - p0.y) * e, p0.z + (p1.z - p0.z) * e);
      objs.look.set(G.pin.x + (b.x + d.x * 22 - G.pin.x) * e, hy + (b.y - 3.2 - hy) * e, G.pin.z + (b.z + d.z * 22 - G.pin.z) * e);
      if (k >= 1) G.phase = 'aim';
    } else if (aiming || G.phase === 'swing') {
      const p = aimCam(d, b);
      tgt.set(p.x, p.y, p.z);
      cam.position.lerp(tgt, ease(G.phase === 'aim' ? 6 : 10));
      const lk = G.club.putter ? Math.min(dist2(G.ball, G.pin), 8) * 0.6 : 22;
      const sd = objs.golfer.model ? -BALL_AT[clubKind(G.club)][1] * 0.45 : 0;
      tgt.set(b.x + d.x * lk - d.z * sd, b.y + (G.club.putter ? -0.8 : -4.2), b.z + d.z * lk + d.x * sd);
      objs.look.lerp(tgt, ease(8));
    } else if (G.phase === 'flight' || G.phase === 'roll' || G.phase === 'rest-wait' || G.phase === 'holed') {
      if (!G.putt) {
        const f = G.flight;
        const vx = f ? f.d.x : d.x, vz = f ? f.d.z : d.z;
        const back = G.phase === 'flight' ? 11 : 9;
        tgt.set(b.x - vx * back, Math.max(b.y, groundY(b.x - vx * back, b.z - vz * back)) + 4.2, b.z - vz * back);
        cam.position.lerp(tgt, ease(2.6));
      }
      objs.look.lerp(b, ease(6));
    }
    cam.lookAt(objs.look);
    updateWind();
    updateGauge();
  }

  function aimCam(d, b) {
    const putt = G.club.putter;
    // ゴルファーとボールの中間の後ろから映す（右打ちのゴルファーは目標線の左側に立つ）
    const model = objs && objs.golfer && objs.golfer.model;
    const oz = model ? BALL_AT[clubKind(G.club)][1] : 0.7;
    const back = putt ? 3.6 : 5.4, up = putt ? 1.8 : 2.3, side = model ? -oz * 0.45 : (putt ? 1.0 : 1.1);
    const x = b.x - d.x * back - d.z * side, z = b.z - d.z * back + d.x * side;
    return { x, y: Math.max(b.y + up, groundY(x, z) + 1.2), z };
  }

  /* ---------- HUD ---------- */
  function showMsg(title, sub, kind, ms) {
    if (!ui) return;
    ui.msg.className = `g-msg ${kind || ''} ${reduced() ? '' : 'pop'}`;
    ui.msg.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
    ui.msg.hidden = false;
    clearTimeout(ui.msgT);
    if (ms) ui.msgT = setTimeout(hideMsg, ms);
  }
  function hideMsg() { if (ui) ui.msg.hidden = true; }
  function showOverlay(html) { if (!ui) return; ui.ov.innerHTML = `<div class="g-ov-card">${html}</div>`; ui.ov.hidden = false; const b = ui.ov.querySelector('button'); if (b) b.focus(); }
  function hideOverlay() { if (ui) ui.ov.hidden = true; }

  function renderHud() {
    if (!ui || !G) return;
    const h = G.hole;
    const dPin = dist2(G.ball, G.pin);
    const putt = G.club.putter;
    ui.hole.innerHTML = G.mode === 'round'
      ? `<b>HOLE ${h.n}</b><span>PAR ${h.par} ・ ${yds(G.length)}y</span>`
      : `<b>${G.mode === 'nearpin' ? 'ニアピン' : 'ドラコン'}</b><span>${Math.min(G.attempts.length + 1, G.tries)} / ${G.tries} 球目</span>`;
    ui.stroke.textContent = G.mode === 'round' ? `${G.strokes + 1}打目` : '';
    ui.lie.textContent = (LIE[G.lie] || LIE.fairway).name + ((LIE[G.lie] || {}).note ? `（${LIE[G.lie].note}）` : '');
    ui.dist.innerHTML = putt ? `カップまで <b>${dPin.toFixed(1)}</b>m` : `ピンまで <b>${yds(dPin)}</b>y`;
    ui.club.innerHTML = putt ? `<b>PT</b><small>MAX ${G.puttMax}m</small>` : `<b>${G.club.id}</b><small>${yds(clubMax(G.club, G.lie))}y</small>`;
    ui.clubName.textContent = G.club.name;
    const zone = putt ? 0 : G.skill.meet;
    ui.zone.style.width = `${zone * 2 * 82}%`;
    ui.zone.style.left = `${(0.18 - zone * 0.82) * 100}%`;
    ui.zone.hidden = putt;
    ui.shot.textContent = G.phase === 'aim' ? 'ショット' : G.phase === 'power' ? (putt ? 'ストップ' : 'パワー決定') : G.phase === 'return' ? 'インパクト！' : 'ショット';
    // パットのときは傾斜のヒント
    if (putt) {
      const d = dirOf(G.yaw);
      const mid = { x: G.ball.x + d.x * Math.min(dPin, 6) / 2, z: G.ball.z + d.z * Math.min(dPin, 6) / 2 };
      const sl = slopeAt(mid.x, mid.z);
      const along = sl.x * d.x + sl.z * d.z;
      const cross = sl.x * -d.z + sl.z * d.x;
      const rise = Math.round((groundY(G.pin.x, G.pin.z) - groundY(G.ball.x, G.ball.z)) * 100);
      const brk = Math.abs(cross) < 0.004 ? 'ほぼまっすぐ' : cross > 0 ? '左に曲がる' : '右に曲がる';
      ui.slope.textContent = `${rise >= 0 ? '上り' : '下り'} ${Math.abs(rise)}cm ・ ${brk}`;
      ui.slope.hidden = false;
      void along;
    } else ui.slope.hidden = true;
  }

  function updateGauge() {
    if (!ui) return;
    const p = G.phase === 'power' || G.phase === 'return' ? G.p : 0;
    const x = (0.18 + p * 0.82) * 100;
    ui.marker.style.left = `${Math.max(0, x)}%`;
    const pw = G.phase === 'return' || G.phase === 'swing' ? G.power : G.phase === 'power' ? G.p : 0;
    ui.fill.style.width = `${pw * 82}%`;
    ui.pmark.hidden = !(G.phase === 'return');
    ui.pmark.style.left = `${(0.18 + G.power * 0.82) * 100}%`;
    ui.shot.textContent = G.phase === 'aim' || G.phase === 'intro' ? 'ショット' : G.phase === 'power' ? (G.club.putter ? 'ストップ' : 'パワー決定') : G.phase === 'return' ? 'インパクト！' : '…';
    ui.shot.disabled = !(G.phase === 'aim' || G.phase === 'intro' || G.phase === 'power' || G.phase === 'return');
    ui.pct.textContent = G.club.putter ? `${(pw * G.puttMax).toFixed(1)}m` : `${Math.round(pw * 100)}%`;
  }

  function updateWind() {
    const cam = W.camera;
    const fx = objs.look.x - cam.position.x, fz = objs.look.z - cam.position.z;
    const fl = Math.hypot(fx, fz) || 1;
    const f = { x: fx / fl, z: fz / fl }, r = { x: -f.z, z: f.x };
    const up = G.wind.x * f.x + G.wind.z * f.z, rt = G.wind.x * r.x + G.wind.z * r.z;
    const deg = Math.atan2(rt, up) * 180 / Math.PI;
    ui.windArrow.style.transform = `rotate(${deg.toFixed(0)}deg)`;
    ui.windSp.textContent = `${G.wind.sp.toFixed(1)}m`;
    ui.wx.textContent = W.weather.name;
  }

  /* ---------- マウント ---------- */
  function hudHTML() {
    return `
    <div class="g-hud">
      <div class="g-top">
        <div class="g-card g-hole"><div id="g-hole"></div><div class="g-stroke" id="g-stroke"></div></div>
        <div class="g-card g-wind" aria-label="風"><span class="g-wx" id="g-wx"></span><svg viewBox="0 0 24 24" id="g-wind-arrow" aria-hidden="true"><path d="M12 3l6 9h-4v9h-4v-9H6z" fill="currentColor"/></svg><span id="g-wind-sp"></span></div>
      </div>
      <div class="g-msg" id="g-msg" hidden></div>
      <div class="g-bottom">
        <div class="g-info"><span class="g-chip" id="g-lie"></span><span class="g-chip" id="g-dist"></span><span class="g-chip" id="g-slope" hidden></span></div>
        <div class="g-row">
          <div class="g-club"><button type="button" data-g="club-" aria-label="前のクラブ">‹</button><div class="g-club-v" id="g-club"></div><button type="button" data-g="club+" aria-label="次のクラブ">›</button><span class="sr-only" id="g-club-name"></span></div>
          <div class="g-aim"><button type="button" data-g="aim-" aria-label="左を狙う">◀</button><button type="button" data-g="aim+" aria-label="右を狙う">▶</button></div>
        </div>
        <div class="g-gauge" aria-hidden="true">
          <div class="g-fill" id="g-fill"></div><div class="g-zone" id="g-zone"></div><div class="g-imp"></div>
          <div class="g-pmark" id="g-pmark" hidden></div><div class="g-marker" id="g-marker"></div><span class="g-pct" id="g-pct"></span>
        </div>
        <button type="button" class="g-shot" id="g-shot">ショット</button>
      </div>
      <div class="g-ov" id="g-ov" hidden></div>
    </div>`;
  }

  function onKey(e) {
    if (!G) return;
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      if (e.target.closest && e.target.closest('.g-ov')) return;
      if (e.target.closest && e.target.closest('button') && !e.target.closest('#g-shot')) return;
      e.preventDefault(); tap();
    }
    if (e.code === 'ArrowLeft') { e.preventDefault(); aim(-0.012); }
    if (e.code === 'ArrowRight') { e.preventDefault(); aim(0.012); }
    if (e.code === 'ArrowUp') { e.preventDefault(); changeClub(-1); }
    if (e.code === 'ArrowDown') { e.preventDefault(); changeClub(1); }
  }

  let drag = null;
  function onDown(e) { if (G && G.phase === 'aim' && e.target.tagName === 'CANVAS') drag = { x: e.clientX }; }
  function onMove(e) { if (drag) { aim((e.clientX - drag.x) * 0.0025); drag.x = e.clientX; } }
  function onUp() { drag = null; }

  let holdTimer = 0;
  function onClick(e) {
    const t = e.target.closest('[data-g]');
    if (!t) return;
    const a = t.dataset.g;
    if (a === 'club-') changeClub(-1);
    if (a === 'club+') changeClub(1);
    if (a === 'next-hole') nextHole();
    if (a === 'again') { hideOverlay(); newGame(G.mode); }
    if (a === 'exit' && opts.onExit) opts.onExit();
    if (a === 'tutorial-ok') { hideOverlay(); if (opts.onTutorialSeen) opts.onTutorialSeen(); }
  }
  function aimHold(e) {
    const t = e.target.closest('[data-g="aim-"],[data-g="aim+"]');
    if (!t) return;
    e.preventDefault();
    const step = t.dataset.g === 'aim-' ? -0.006 : 0.006;
    aim(step);
    clearInterval(holdTimer);
    holdTimer = setInterval(() => aim(step), 40);
  }
  function aimRelease() { clearInterval(holdTimer); }

  function mount(container, o) {
    opts = o;
    container.insertAdjacentHTML('beforeend', hudHTML());
    const $ = (id) => container.querySelector('#' + id);
    ui = {
      root: container, hole: $('g-hole'), stroke: $('g-stroke'), windArrow: $('g-wind-arrow'), windSp: $('g-wind-sp'),
      msg: $('g-msg'), lie: $('g-lie'), dist: $('g-dist'), slope: $('g-slope'), club: $('g-club'), clubName: $('g-club-name'),
      wx: $('g-wx'), fill: $('g-fill'), zone: $('g-zone'), pmark: $('g-pmark'), marker: $('g-marker'), pct: $('g-pct'), shot: $('g-shot'), ov: $('g-ov'),
    };
    ui.shot.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
    ui.shot.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); tap(); } });
    container.addEventListener('click', onClick);
    container.addEventListener('pointerdown', aimHold);
    container.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', aimRelease);
    window.addEventListener('pointercancel', aimRelease);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);

    window.GolfScene.mount(container.querySelector('.scene-host'), {
      mode: 'play',
      course: o.course === 'all' ? 'hills' : o.course,
      weather: o.weather,
      onFrame: frame,
      onReady: () => {
        W = window.GolfScene.world();
        if (!W) return;
        if (objs) { W.scene.remove(objs.group); }
        objs = buildObjects();
        W.camera.position.set(0, 60, 0);
        newGame(o.mode);
        if (o.showTutorial) {
          showOverlay(`
            <div class="g-ov-eyebrow">HOW TO PLAY</div>
            <h2 style="font-size:22px;font-weight:900">3回タップでショット</h2>
            <ol class="g-how"><li><b>1回目</b>：スイング開始。ゲージが右へ伸びる</li><li><b>2回目</b>：パワー決定。ゲージが左へ戻ってくる</li><li><b>3回目</b>：白いゾーンでタップするとナイスショット。ずれると左右に曲がる</li></ol>
            <p class="g-ov-note">パターは2回タップ（開始・強さ）。◀▶で狙いを調整、‹ ›でクラブを変えられます。キーボードならスペースキーと矢印キー。</p>
            <p class="g-ov-note">練習アプリでレベルが上がると、ゴルファーのパワーと白いゾーンの幅が大きくなります。</p>
            <button class="btn btn-primary btn-block" data-g="tutorial-ok">はじめる</button>`);
        }
      },
    });
  }

  function unmount() {
    window.removeEventListener('pointerup', aimRelease);
    window.removeEventListener('pointercancel', aimRelease);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    clearInterval(holdTimer);
    if (objs && W) { W.scene.remove(objs.group); }
    objs = null; G = null; ui = null;
  }

  window.GolfGame = { mount, unmount, CLUBS };
})();
