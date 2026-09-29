/* =========================================================
   ゴルファー（設定画から作った男女2人）の読み込みと動かし方（ゲームとキャラ紹介で共通）
   - モデルは assets/golfer-<female|male>-glb.js を、必要になったときだけ読み込む
   - 体・顔・服のテクスチャは設定画そのもの。ふだんの見た目はそのまま、着せ替えのときだけシャツの色を変える
   - アニメーション：Swing / Putt（時間を外から指定）、Idle / Cheer / Sad（自動再生）
   - 表情：まばたき・喜び（^ ^ ＋大きな口）・落ち込み（顔の上に部品を重ねて切り替える）
   ========================================================= */
(function () {
  const W = window;
  const SCALE = 1;
  const FPS = 30;
  const FLAT = new Set(['Eye', 'MouthIn', 'Tongue', 'SkinPatch', 'Brim']);   // 陰影をつけない素材（色そのまま）
  // 着せ替えでシャツの色を変えるときに、テクスチャのどの色を「シャツ」とみなすか
  const TINT_MASK = {
    female: 'smoothstep(0.06, 0.14, tc.g - max(tc.r, tc.b))',                         // 緑
    male: 'smoothstep(0.45, 0.58, tc.r - tc.g) * (1.0 - smoothstep(0.10, 0.2, tc.b))', // オレンジ
  };
  const TINT_BASE_LUM = { female: 0.28, male: 0.3 };

  const bufCache = {};
  function glbBuffer(ch) {
    if (bufCache[ch]) return bufCache[ch];
    const b64 = W.GOLFER_GLBS && W.GOLFER_GLBS[ch];
    if (!b64) return null;
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    bufCache[ch] = buf.buffer;
    return bufCache[ch];
  }
  // モデルのデータ（大きいので、選ばれたキャラの分だけ読み込む）
  const pending = {};
  function loadScript(src, done) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => done(true);
    s.onerror = () => done(false);
    document.head.appendChild(s);
  }
  function ensureData(ch, cb) {
    if (W.GOLFER_GLBS && W.GOLFER_GLBS[ch]) return cb(true);
    if (pending[ch]) { pending[ch].push(cb); return; }
    pending[ch] = [cb];
    // 表情の絵（なくても動く）を先に読んでから、モデルを読む
    loadScript(`assets/golfer-${ch}-face.js`, () => {
      loadScript(`assets/golfer-${ch}-glb.js`, (ok) => pending[ch].splice(0).forEach(f => f(ok)));
    });
  }

  // opts: { character: 'female' | 'male', wear: 色 または null（null なら設定画のまま） }
  function load(THREE, opts, onReady) {
    opts = opts || {};
    const ch = opts.character === 'male' ? 'male' : 'female';
    const Loader = W.THREE_ADDONS && W.THREE_ADDONS.GLTFLoader;
    if (!Loader) return;
    ensureData(ch, (ok) => {
      const buf = ok && glbBuffer(ch);
      if (!buf) return;
      try {
        new Loader().parse(buf.slice(0), '', (gltf) => build(THREE, gltf, ch, opts, onReady), () => {});
      } catch (e) { /* 読み込めなければ簡易モデルのまま */ }
    });
  }

  function build(THREE, gltf, ch, opts, onReady) {
    const root = new THREE.Group();
    const model = gltf.scene;
    model.scale.setScalar(SCALE);
    root.add(model);
    const clubs = {}, parts = {}, skels = [];
    const wearU = { value: new THREE.Color(opts.wear || 0xffffff) };
    const useTint = opts.wear != null;
    // 表情：目・口のところだけ、描き替えた絵（tools/face_states.py）に差し替える
    const FACE = W.GOLFER_FACES && W.GOLFER_FACES[ch];
    const eyeU = { uEye: { value: null }, uRect: { value: new THREE.Vector4(...(FACE ? FACE.rect : [0, 0, 1, 1])) }, uState: { value: 0 }, uMix: { value: 0 } };
    if (FACE) {
      const img = new Image();
      img.onload = () => {
        const t = new THREE.Texture(img);
        t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
        eyeU.uEye.value = t; eyeU.ready = true;
        if (api && api.refreshFace) api.refreshFace();
      };
      img.src = 'data:image/png;base64,' + FACE.png;
    }
    model.traverse((o) => {
      if (/^Club(Iron|Driver|Putter)$/.test(o.name)) clubs[o.name.slice(4)] = o;
      parts[o.name] = parts[o.name] || o;
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) skels.push(o.skeleton);
      o.castShadow = true; o.frustumCulled = false;
      const old = o.material;
      if (old.map) {
        // 体：設定画のテクスチャをそのまま見せる（絵にすでに陰影があるので、光の計算はしない）
        // 3つの UV（正面・背面・横の絵。tools/sheet_uv.py）があれば、面の向きでなめらかに混ぜる
        const has3 = !!(o.geometry && o.geometry.attributes.uv1 && o.geometry.attributes.uv2);
        const m = new THREE.MeshBasicMaterial({ map: old.map });
        m.map.anisotropy = 4;
        m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, eyeU);
          if (useTint) sh.uniforms.uWear = wearU;
          sh.uniforms.uBlend = { value: has3 ? 1 : 0 };
          // 向きは、スイングで体が動いても変わらないよう、骨で動かす前の法線（objectNormal）で決める
          sh.vertexShader = 'attribute vec2 uv1;\nattribute vec2 uv2;\nvarying vec2 vUvB;\nvarying vec2 vUvS;\nvarying vec3 vObjN;\nvarying vec3 vShadeN;\n' + sh.vertexShader
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vObjN = objectNormal; vUvB = uv1; vUvS = uv2;')
            .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n  vShadeN = normalize(transformedNormal);');
          sh.fragmentShader = 'varying vec2 vUvB;\nvarying vec2 vUvS;\nvarying vec3 vObjN;\nvarying vec3 vShadeN;\nuniform float uBlend;\nuniform sampler2D uEye; uniform vec4 uRect; uniform float uState; uniform float uMix;\n' + (useTint ? 'uniform vec3 uWear;\n' : '') +
            sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
              if (uBlend > 0.5) {
                vec3 on = normalize(vObjN);
                // 前を向く面ほど正面の絵、後ろを向く面ほど背面の絵（頭は uvF と uvB が同じなので変わらない）
                float wB = 1.0 - smoothstep(-0.28, 0.28, on.z);
                if (wB > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, vUvB).rgb, wB);
                // 横の絵の重み：水平方向の向き（左右と前後の比）で決める。上下を向く成分は数えない。
                // 上下の成分を入れると、あごの下など斜め下を向く面が、正面の絵のいちばん端（髪の輪郭）を拾って線になる。
                // 真上・真下を向く面（頭のてっぺん）は水平の向きがあいまいなので、正面・背面の絵のままにする
                if (vUvS.x < 1.5) {
                  float hl = length(on.xz);
                  vec2 h = abs(on.xz) / max(hl, 1e-4);
                  float ps = pow(h.x, 5.0), pp = pow(h.y, 5.0);
                  float wS = ps / max(ps + pp, 1e-5) * smoothstep(0.12, 0.35, hl);
                  if (wS > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, vUvS).rgb, wS);
                }
              }
              if (uMix > 0.0) {
                vec2 ep = (vMapUv - uRect.xy) / uRect.zw;
                if (ep.x > 0.0 && ep.x < 1.0 && ep.y > 0.0 && ep.y < 1.0) {
                  vec4 ef = texture2D(uEye, vec2((ep.x + uState) / 3.0, ep.y));
                  diffuseColor.rgb = mix(diffuseColor.rgb, ef.rgb, ef.a * uMix);
                }
              }` + (useTint ? `
              vec3 tc = diffuseColor.rgb;
              float tl = dot(tc, vec3(0.2126, 0.7152, 0.0722));
              float tm = ${TINT_MASK[ch]};
              diffuseColor.rgb = mix(tc, uWear * clamp(tl / ${TINT_BASE_LUM[ch].toFixed(3)}, 0.0, 1.7), tm);` : ''));
          sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
              { vec3 sn = normalize(vShadeN);
                float facing = clamp(sn.z + 0.22 * sn.y, 0.0, 1.0);
                diffuseColor.rgb *= mix(0.70, 1.0, smoothstep(0.08, 0.62, facing)); }`);
        };
        o.material = m;
      } else if (FLAT.has(old.name)) {
        o.material = new THREE.MeshBasicMaterial({ color: old.color.clone() });
      } else {
        old.roughness = Math.min(1, Math.max(0.35, old.roughness));
        old.envMapIntensity = 0.6;
      }
    });

    // ---- アニメーション ----
    const mixer = new THREE.AnimationMixer(model);
    const clip = (n) => gltf.animations.find(a => a.name === n || a.name.endsWith('|' + n));
    const acts = {};
    for (const n of ['Swing', 'Putt', 'Idle', 'Cheer', 'Sad', 'Stand']) {
      const c = clip(n);
      if (!c) continue;
      const a = mixer.clipAction(c);
      a.play(); a.paused = true; a.setEffectiveWeight(0);
      acts[n] = a;
    }
    const LOOP = { Idle: [0, 2], Cheer: [40 / FPS, 50 / FPS], Sad: [14 / FPS, 2] };   // 待機中にくり返す区間（秒）
    let cur = null, kind = 'Iron', mode = 'swing', t = 0, el = 0, dir = 1, blink = 0, nextBlink = 2 + Math.random() * 2, expr = '';

    function use(name) {
      if (!acts[name] || cur === name) return;
      Object.entries(acts).forEach(([k, a]) => a.setEffectiveWeight(k === name ? 1 : 0));
      cur = name;
    }
    function set(name, time) {
      const a = acts[name];
      if (!a) return;
      use(name);
      a.time = Math.max(0, Math.min(a.getClip().duration, time));
      mixer.update(0);
    }
    // 表情：目・口の絵を差し替える（blink / happy / sad / それ以外は元の顔）
    const FACE_STATE = { blink: 0, happy: 1, sad: 2 };
    function face(name) {
      if (expr === name) return;
      expr = name;
      const st = FACE_STATE[name];
      if (st == null || !eyeU.ready) { eyeU.uMix.value = 0; return; }
      eyeU.uState.value = st; eyeU.uMix.value = 1;
    }

    const api = {
      root, model: true, scale: SCALE, parts, character: ch, setFace(n) { expr = ''; face(n); },
      refreshFace() { const e = expr; expr = ''; face(e); },
      get mode() { return mode; },
      setClub(k) {
        kind = k;
        Object.entries(clubs).forEach(([n, o]) => { o.visible = n === k; });
        if (mode === 'swing') use(k === 'Putter' ? 'Putt' : 'Swing');
      },
      setWear(hex) { wearU.value.set(hex); },
      // スイング：時間は外から指定（ゲームのゲージに合わせて動かす）
      pose(theta, time) {
        if (mode === 'stand') { model.scale.setScalar(SCALE); Object.entries(clubs).forEach(([n, o]) => { o.visible = n === kind; }); }
        mode = 'swing';
        const n = kind === 'Putter' ? 'Putt' : 'Swing';
        face('normal');
        set(n, time || 0);
      },
      // 待機：息づかいとクラブのちょんちょん。ときどきまばたき
      idle(dt) {
        if (mode === 'stand') { model.scale.setScalar(SCALE); Object.entries(clubs).forEach(([n, o]) => { o.visible = n === kind; }); }
        if (mode !== 'idle') { mode = 'idle'; t = 0; dir = 1; }
        t += dt;
        if (kind === 'Putter') set('Putt', 0); else set('Idle', t % acts.Idle.getClip().duration);
        this.blinkStep(dt, 'normal');
      },
      // 立ちポーズ（キャラ紹介用）：設定画と同じ姿勢（骨の初期姿勢）で、クラブなし。息づかいだけ動く
      stand(dt, mood) {
        if (mode !== 'stand') {
          mode = 'stand'; t = 0;
          Object.values(acts).forEach(a => a.setEffectiveWeight(0));
          cur = null;
          skels.forEach(sk => sk.pose());
          Object.values(clubs).forEach(o => { o.visible = false; });
        }
        t += dt;
        const k = Math.sin(t * 2.2);
        model.scale.set(SCALE * (1 - 0.003 * k), SCALE * (1 + 0.005 * k), SCALE * (1 - 0.003 * k));
        this.blinkStep(dt, mood || 'normal');
      },
      blinkStep(dt, base) {
        nextBlink -= dt;
        if (nextBlink <= 0 && blink <= 0) { blink = 0.13; nextBlink = 2.2 + Math.random() * 3; }
        if (blink > 0 && base !== 'happy') { blink -= dt; face('blink'); } else { blink = Math.max(0, blink - dt); face(base); }
      },
      // 喜ぶ・落ち込む：動きが終わったら、最後の区間をゆらゆらくり返す
      react(which) {
        if (mode === 'stand') { model.scale.setScalar(SCALE); Object.entries(clubs).forEach(([n, o]) => { o.visible = n === kind; }); }
        mode = which; t = 0; el = 0; dir = 1;
      },
      tick(dt) {
        const name = mode === 'cheer' ? 'Cheer' : mode === 'sad' ? 'Sad' : null;
        if (!name || !acts[name]) return;
        const dur = acts[name].getClip().duration;
        const [a, b] = LOOP[name];
        t += dt * dir; el += dt;
        let time = t;
        if (t > b) {                                   // 区間の終わりまで来たら往復する
          if (name === 'Cheer') { dir = -1; t = b; time = b; }
          else { t = a + ((t - a) % (dur - a)); time = t; }
        } else if (t < a && dir < 0) { dir = 1; t = a; time = a; }
        set(name, Math.min(time, dur));
        this.blinkStep(dt, name === 'Cheer' ? 'happy' : 'sad');
      },
      get done() { return (mode === 'cheer' || mode === 'sad') && el > (mode === 'cheer' ? 3.2 : 4); },
    };
    // 以前の「部品を重ねる」表情は使わない（モデルに残っている部品は非表示のまま）
    Object.values(parts).forEach((o) => { if (/^(Eye(Cover|Happy|Closed)|Mouth(Cover|Open|Sad)|Tongue)/.test(o.name)) o.visible = false; });
    api.setClub('Iron');
    api.pose(0, 0);
    onReady(api);
  }

  W.GolferKit = { load, SCALE, characters: ['female', 'male'] };
})();
