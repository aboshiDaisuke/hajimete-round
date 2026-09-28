/* =========================================================
   パター距離感ゲーム（Three.js）
   振り幅（cm）を決めて打つ。5球でカップにどれだけ寄せられるか。
   ========================================================= */
(function () {
  'use strict';

  const SPEEDS = [
    { name: '遅め', k: 0.85 },
    { name: 'ふつう', k: 1.0 },
    { name: '速め', k: 1.15 },
  ];
  const DECEL = 0.9;          // 減速度 m/s²
  const CUP_R = 0.054;        // カップ半径 m
  const CAPTURE_V = 1.4;      // これより遅ければカップに落ちる m/s
  const BALL_R = 0.02135;

  const st = { built: false, renderer: null, scene: null, camera: null, ball: null, cup: null, running: false };
  let ui = null, game = null;

  function greenTexture(THREE) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        x.fillStyle = (i + j) % 2 ? '#6fb654' : '#63aa4b';
        x.fillRect(i * 64, j * 64, 64, 64);
      }
    }
    const img = x.getImageData(0, 0, 512, 512);
    for (let p = 0; p < img.data.length; p += 4) {
      const n = (Math.random() - 0.5) * 14;
      img.data[p] += n; img.data[p + 1] += n; img.data[p + 2] += n;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    return t;
  }

  function build() {
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbcdcea);
    scene.fog = new THREE.Fog(0xbcdcea, 30, 90);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 200);

    scene.add(new THREE.HemisphereLight(0xdff0ff, 0x456b3a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2da, 2.2);
    sun.position.set(-6, 12, 4);
    sun.target.position.set(0, 0, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -14, near: 1, far: 40 });
    sun.shadow.bias = -0.0003;
    scene.add(sun, sun.target);

    // ラフ → カラー → グリーン
    const rough = new THREE.Mesh(new THREE.CircleGeometry(120, 48), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }));
    rough.rotation.x = -Math.PI / 2; rough.position.y = -0.02; rough.receiveShadow = true;
    const collar = new THREE.Mesh(new THREE.CircleGeometry(15.2, 64), new THREE.MeshStandardMaterial({ color: 0x5a9a48, roughness: 1 }));
    collar.rotation.x = -Math.PI / 2; collar.position.set(0, -0.01, -5); collar.receiveShadow = true;
    const green = new THREE.Mesh(new THREE.CircleGeometry(14, 72), new THREE.MeshStandardMaterial({ map: greenTexture(THREE), roughness: 0.95 }));
    green.rotation.x = -Math.PI / 2; green.position.set(0, 0, -5); green.receiveShadow = true;
    scene.add(rough, collar, green);

    // 周りの木
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2c5b2c, roughness: 0.9, flatShading: true });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + Math.random() * 0.1;
      const R = 26 + Math.random() * 18;
      const s = 2.2 + Math.random() * 2.2;
      const t = new THREE.Mesh(geo, leaf);
      t.position.set(Math.cos(a) * R, s * 1.3, Math.sin(a) * R - 8);
      t.scale.set(s, s * 1.2, s);
      scene.add(t);
    }

    // カップとピン
    const cup = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 40), new THREE.MeshBasicMaterial({ color: 0x0a0d0b }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.002;
    const liner = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.006, 40), new THREE.MeshStandardMaterial({ color: 0xf2f2ee }));
    liner.rotation.x = -Math.PI / 2; liner.position.y = 0.003;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 2.1, 10), new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.4 }));
    pole.position.y = 1.05; pole.castShadow = true;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), new THREE.MeshStandardMaterial({ color: 0xf2b705, side: THREE.DoubleSide }));
    flag.position.set(0.25, 1.9, 0); flag.castShadow = true;
    cup.add(hole, liner, pole, flag);
    scene.add(cup);

    const ball = window.GolfMakeBall(THREE, BALL_R);
    ball.position.set(0, BALL_R, 0);
    scene.add(ball);

    Object.assign(st, { built: true, renderer, scene, camera, ball, cup, pole, flag, THREE });
    return true;
  }

  function size() {
    if (!ui || !st.renderer) return;
    const w = ui.stage.clientWidth || 1, h = ui.stage.clientHeight || 1;
    st.renderer.setSize(w, h, false);
    st.camera.aspect = w / h;
    st.camera.updateProjectionMatrix();
    placeCamera();
    render();
  }

  function placeCamera() {
    if (!game) return;
    const D = game.target;
    const portrait = st.camera.aspect < 0.9;
    st.camera.position.set(0.28, 1.05 + D * 0.07 + (portrait ? 0.3 : 0), 1.25 + (portrait ? 0.4 : 0));
    st.camera.lookAt(0, 0, -D * 0.62);
  }

  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  function newRound() {
    const base = [1.5, 3, 5, 7, 10].sort(() => Math.random() - 0.5);
    game = {
      targets: base.map(d => Math.round((d + (Math.random() - 0.5) * 0.8) * 10) / 10),
      speed: SPEEDS[Math.floor(Math.random() * SPEEDS.length)],
      i: 0, score: 0, results: [], phase: 'aim',
    };
    setupBall();
  }

  function setupBall() {
    game.target = game.targets[game.i];
    game.phase = 'aim';
    st.ball.position.set(0, BALL_R, 0);
    st.ball.rotation.set(0, 0, 0);
    st.ball.visible = true;
    st.cup.position.set(0, 0, -game.target);
    st.pole.visible = st.flag.visible = true;
    placeCamera();
    renderHud();
    ui.result.hidden = true;
    ui.go.textContent = '打つ';
    ui.go.disabled = false;
    ui.amp.disabled = false;
    render();
  }

  function renderHud() {
    ui.dist.innerHTML = `<b>${game.target.toFixed(1)}</b>m`;
    ui.speed.textContent = `グリーン：${game.speed.name}`;
    ui.balls.innerHTML = game.targets.map((_, k) => `<i class="${k < game.i || (k === game.i && game.phase !== 'aim') ? 'used' : ''}"></i>`).join('');
    ui.score.textContent = `${game.score} 点`;
  }

  function shoot() {
    if (!game || game.phase !== 'aim') return;
    const amp = Number(ui.amp.value);
    const roll = Math.max(0.2, amp / 6 * game.speed.k * (1 + gauss() * 0.045));
    const lateral = gauss() * 0.028 * game.target;
    const v0 = Math.sqrt(2 * DECEL * roll);
    const D = game.target;
    const vAtCup = roll >= D ? Math.sqrt(Math.max(0, v0 * v0 - 2 * DECEL * D)) : 0;
    const latAtCup = lateral * Math.min(1, D / roll);
    const holed = roll >= D - 0.01 && Math.abs(latAtCup) < CUP_R && vAtCup < CAPTURE_V;
    game.shot = { roll, lateral, v0, holed, start: performance.now(), stopT: v0 / DECEL, holeT: holed ? (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * DECEL * D))) / DECEL : null };
    game.phase = 'rolling';
    ui.go.disabled = true;
    ui.amp.disabled = true;
    renderHud();
    st.pole.visible = st.flag.visible = !(D < 3.5); // 近いときはピンを抜く
    loop();
  }

  function loop() {
    if (!game || game.phase !== 'rolling') return;
    const s = game.shot;
    const t = (performance.now() - s.start) / 1000;
    let tt = Math.min(t, s.holed ? s.holeT : s.stopT);
    const dist = s.v0 * tt - DECEL * tt * tt / 2;
    const prevZ = -st.ball.position.z;
    st.ball.position.z = -dist;
    st.ball.position.x = s.lateral * (dist / s.roll);
    st.ball.rotation.x -= (dist - prevZ) / BALL_R;
    if (s.holed && t >= s.holeT) {
      const k = Math.min(1, (t - s.holeT) / 0.25);
      st.ball.position.set(0, BALL_R - k * 0.06, -game.target);
      if (k >= 1) { st.ball.visible = false; finishShot(); render(); return; }
    } else if (!s.holed && t >= s.stopT) {
      finishShot(); render(); return;
    }
    render();
    requestAnimationFrame(loop);
  }

  function finishShot() {
    const s = game.shot;
    const D = game.target;
    const along = s.roll - D;
    const off = Math.sqrt(along * along + s.lateral * s.lateral);
    let pts = 0, title, sub;
    if (s.holed) { pts = 3; title = 'カップイン！'; sub = '+3点'; }
    else {
      const cm = Math.round(Math.abs(along) * 100);
      const dir = along >= 0 ? 'オーバー' : 'ショート';
      if (off <= 0.5) { pts = 2; title = `お見事！ ${cm}cm ${dir}`; sub = 'OK圏内（50cm以内） +2点'; }
      else if (off <= 1.0) { pts = 1; title = `${cm}cm ${dir}`; sub = '1m以内 +1点'; }
      else { title = `${(Math.abs(along)).toFixed(1)}m ${dir}`; sub = along >= 0 ? '次は振り幅を小さく' : '次は振り幅を大きく'; }
      if (!s.holed && along > 0 && along <= 0.5) sub += '（理想の強さです）';
    }
    game.score += pts;
    game.results.push({ target: D, roll: s.roll, pts });
    game.phase = 'done';
    ui.result.innerHTML = `${title}<small>${sub}</small>`;
    ui.result.hidden = false;
    renderHud();
    const last = game.i >= game.targets.length - 1;
    ui.go.textContent = last ? '結果を見る' : '次のボールへ';
    ui.go.disabled = false;
  }

  function next() {
    if (game.phase !== 'done') return;
    if (game.i >= game.targets.length - 1) {
      game.phase = 'over';
      if (ui.onRoundEnd) ui.onRoundEnd(game.score, game.results, game.speed.name);
      ui.go.textContent = 'もう1ラウンド';
      ui.go.disabled = false;
      return;
    }
    game.i++;
    setupBall();
  }

  function onGo() {
    if (!game) return;
    if (game.phase === 'aim') shoot();
    else if (game.phase === 'done') next();
    else if (game.phase === 'over') newRound();
  }

  function render() { if (st.built) st.renderer.render(st.scene, st.camera); }

  function mount(u) {
    ui = u;
    const go = () => {
      if (!st.built && !build()) { ui.stage.classList.add('scene-failed'); ui.fallback && (ui.fallback.hidden = false); return; }
      ui.stage.prepend(st.renderer.domElement);
      if (st.ball.userData.mat) st.ball.userData.mat.color.set(window.GOLF_BALL_COLOR || '#f8f8f4');
      ui.go.addEventListener('click', onGo);
      ui.amp.addEventListener('input', () => { ui.ampOut.textContent = `${ui.amp.value}cm`; });
      ui.ampOut.textContent = `${ui.amp.value}cm`;
      newRound();
      size();
    };
    if (window.THREE) go(); else window.addEventListener('three-ready', go, { once: true });
  }

  function unmount() { ui = null; game = null; }

  window.addEventListener('resize', size);
  window.GolfPutting = { mount, unmount };
})();
