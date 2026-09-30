/* Blenderのジオラマと既存のゴルファーで、起動・ホーム共通の小さなコースを描く。 */
(function () {
  'use strict';
  const W = window;
  let active = null;
  const reduced = () => W.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function disposeTree(root) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m) continue;
        materials.add(m);
        for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) textures.add(u.value);
      }
      if (o.skeleton) o.skeleton.dispose();
    });
    geometries.forEach(g => g.dispose());
    textures.forEach(t => t.dispose());
    materials.forEach(m => m.dispose());
  }

  function unmount() {
    if (!active) return;
    const s = active;
    active = null;
    cancelAnimationFrame(s.raf);
    clearTimeout(s.timeout);
    s.cleanup.forEach(fn => fn());
    Object.values(s.golfers).forEach(g => { if (g.dispose) g.dispose(); });
    if (s.scene) disposeTree(s.scene);
    if (s.renderer) {
      s.renderer.dispose();
      s.renderer.forceContextLoss();
      s.renderer.domElement.remove();
    }
  }

  function mount(host, opts) {
    unmount();
    opts = opts || {};
    const s = { host, opts, selected: opts.character || 'female', cleanup: [], golfers: {}, raf: 0, yaw: 0, targetYaw: 0, joy: 1.5, visible: true, ready: false };
    active = s;
    const live = () => active === s;
    const status = (text) => { if (live() && opts.onStatus) opts.onStatus(text); };
    const listen = (el, name, fn, options) => {
      el.addEventListener(name, fn, options);
      s.cleanup.push(() => el.removeEventListener(name, fn, options));
    };
    status('コースを準備しています…');
    s.timeout = setTimeout(() => { if (!s.ready) status('準備OK。さあ、はじめよう'); }, 12000);

    function init() {
      if (!live() || s.renderer || !W.THREE || !W.THREE_ADDONS) return;
      const T = W.THREE;
      let renderer;
      try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); }
      catch (e) { status('準備OK。さあ、はじめよう'); return; }
      s.renderer = renderer;
      renderer.setPixelRatio(Math.min(W.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.domElement.className = 'lobby-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host.appendChild(renderer.domElement);
      const scene = s.scene = new T.Scene();
      const world = new T.Group();
      scene.add(world);
      const camera = new T.OrthographicCamera(-7, 7, 5.5, -5.5, 0.1, 80);
      camera.position.set(6.6, 8.0, 13.5);
      camera.lookAt(0, 0.55, 0);
      scene.add(new T.HemisphereLight(0xfff9dd, 0x6b9d82, 1.3));
      const sun = new T.DirectionalLight(0xffedd3, 2.0);
      sun.position.set(-4, 9, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 30 });
      sun.shadow.normalBias = 0.04;
      scene.add(sun);

      const size = () => {
        if (!live()) return;
        const w = host.clientWidth || 480, h = host.clientHeight || 370;
        renderer.setSize(w, h, false);
        const aspect = w / h;
        const halfWidth = Math.max(6.9, aspect * 4.9);
        camera.left = -halfWidth; camera.right = halfWidth;
        camera.top = halfWidth / aspect; camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
        draw();
      };
      const resize = new ResizeObserver(size);
      resize.observe(host);
      s.cleanup.push(() => resize.disconnect());
      let elapsed = 0, last = performance.now(), flag = null, flagBase = null;
      const marker = new T.Mesh(new T.RingGeometry(0.55, 0.61, 48), new T.MeshBasicMaterial({ color: 0xd8b550, side: T.DoubleSide }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(-1.2, 0.175, 2.15);
      world.add(marker);
      const clouds = [];
      const cloudMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.78 });
      for (let i = 0; i < 3; i++) {
        const cloud = new T.Group();
        for (let j = 0; j < 3; j++) {
          const puff = new T.Mesh(new T.SphereGeometry(0.37 + j * 0.10, 12, 8), cloudMat);
          puff.position.set(j * 0.42, j === 1 ? 0.13 : 0, 0);
          puff.scale.y = 0.58;
          cloud.add(puff);
        }
        cloud.position.set(-5 + i * 4.0, 3.4 + (i % 2) * 0.7, -2.1 - i * 0.4);
        clouds.push(cloud); world.add(cloud);
      }

      function draw() { if (live()) renderer.render(scene, camera); }
      function frame(now) {
        s.raf = 0;
        if (!live()) return;
        const dt = reduced() ? 0 : Math.min((now - last) / 1000, 0.05);
        last = now; elapsed += dt;
        s.yaw += (s.targetYaw - s.yaw) * (reduced() ? 1 : Math.min(1, dt * 5));
        world.rotation.y = s.yaw + (reduced() ? 0 : Math.sin(elapsed * 0.23) * 0.028);
        world.position.y = reduced() ? 0 : Math.sin(elapsed * 0.9) * 0.035;
        s.joy = Math.max(0, s.joy - dt);
        for (const [ch, g] of Object.entries(s.golfers)) {
          const selected = ch === s.selected;
          g.stand(dt, selected && s.joy > 0 ? 'happy' : 'normal');
          g.root.position.y = 0.17 + (selected && s.joy > 0 && !reduced() ? Math.abs(Math.sin(s.joy * 7)) * 0.12 : 0);
          g.root.rotation.y = -0.10 + (selected ? 0.14 : -0.08);
          g.root.scale.setScalar(selected ? 1.40 : 1.13);
        }
        const current = s.golfers[s.selected];
        if (current) marker.position.x = current.root.position.x;
        if (flag && flagBase) {
          const pos = flag.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = flagBase[i * 3];
            pos.setZ(i, flagBase[i * 3 + 2] + Math.sin(elapsed * 2.6 + x * 4) * 0.08 * Math.max(0, x - 1.8));
          }
          pos.needsUpdate = true;
        }
        clouds.forEach((c, i) => { c.position.x = -5 + i * 4 + Math.sin(elapsed * 0.18 + i) * 0.35; });
        draw();
        if (s.visible && !document.hidden && !reduced()) s.raf = requestAnimationFrame(frame);
      }
      function kick() {
        if (!live() || s.raf || !s.visible || document.hidden) return;
        last = performance.now(); s.raf = requestAnimationFrame(frame);
      }
      s.kick = kick;
      size();
      const loader = new W.THREE_ADDONS.GLTFLoader();
      if (W.LOBBY_GLB_BASE64) {
        const bin = atob(W.LOBBY_GLB_BASE64);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        loader.parse(bytes.buffer, '', gltf => {
          if (!live()) { disposeTree(gltf.scene); return; }
          gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            o.castShadow = o.receiveShadow = true;
            if (o.material) o.material.roughness = Math.max(0.45, o.material.roughness);
            if (o.name === 'LobbyFlag') { flag = o; flag.material.side = T.DoubleSide; flagBase = new Float32Array(o.geometry.attributes.position.array); }
          });
          world.add(gltf.scene);
          s.ready = true; clearTimeout(s.timeout);
          host.classList.add('is-3d');
          status('ドラッグで見渡す · キャラをタップでごあいさつ');
          kick();
        }, () => status('準備OK。さあ、はじめよう'));
      }
      const characters = opts.pair ? ['female', 'male'] : [s.selected];
      characters.forEach(ch => W.GolferKit.load(T, { character: ch, wear: opts.wear }, g => {
        if (!live()) { if (g.dispose) g.dispose(); disposeTree(g.root); return; }
        s.golfers[ch] = g;
        g.root.traverse(o => { if (o.isMesh && o.material.isMeshBasicMaterial) o.material.toneMapped = false; });
        g.stand(0);
        g.root.position.set(opts.pair ? (ch === 'female' ? -1.2 : 0.65) : -0.6, 0.17, 2.15);
        world.add(g.root); kick();
      }));

      let drag = null;
      const raycaster = new T.Raycaster(), pointer = new T.Vector2();
      listen(host, 'pointerdown', e => {
        drag = { x: e.clientX, startX: e.clientX, startY: e.clientY, yaw: s.targetYaw, moved: false };
        if (e.pointerType === 'mouse') host.setPointerCapture(e.pointerId);
      });
      listen(host, 'pointermove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        if (Math.abs(dx) > 6 || Math.abs(e.clientY - drag.startY) > 6) drag.moved = true;
        s.targetYaw = Math.max(-0.40, Math.min(0.40, drag.yaw + dx * 0.004)); kick();
      });
      listen(host, 'pointerup', e => {
        if (drag && !drag.moved) {
          const rect = host.getBoundingClientRect();
          pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(Object.values(s.golfers).map(g => g.root), true)[0];
          if (hit) {
            const found = Object.entries(s.golfers).find(([, g]) => { let o = hit.object; while (o) { if (o === g.root) return true; o = o.parent; } return false; });
            if (found && opts.onSelect) opts.onSelect(found[0]);
          }
          s.joy = 1.5; kick();
        }
        drag = null;
      });
      listen(host, 'pointercancel', () => { drag = null; });
      listen(renderer.domElement, 'webglcontextlost', e => {
        e.preventDefault(); s.ready = false; cancelAnimationFrame(s.raf); s.raf = 0;
        host.classList.remove('is-3d'); status('準備OK。さあ、はじめよう');
      });
      listen(document, 'visibilitychange', () => { if (!document.hidden) kick(); else { cancelAnimationFrame(s.raf); s.raf = 0; } });
      const observer = new IntersectionObserver(es => {
        s.visible = es[0].isIntersecting;
        if (s.visible) kick(); else { cancelAnimationFrame(s.raf); s.raf = 0; }
      });
      observer.observe(host);
      s.cleanup.push(() => observer.disconnect());
      const motion = W.matchMedia('(prefers-reduced-motion: reduce)');
      listen(motion, 'change', () => { cancelAnimationFrame(s.raf); s.raf = 0; kick(); });
      kick();
    }
    listen(W, 'three-ready', init);
    init();
  }

  function select(character) {
    if (!active || !['female', 'male'].includes(character)) return;
    active.selected = character;
    active.joy = 1.5;
    if (active.kick) active.kick();
  }
  W.GolfLobby = { mount, unmount, select };
})();
