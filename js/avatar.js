/* =========================================================
   キャラ紹介（プレー・マイページ）：選んだゴルファーが立って息づかいをする
   - ドラッグで左右に回せる（手を離すと、少しあとで正面に戻る）
   - タップすると喜ぶ。ページを開いたときにも一度あいさつ（喜び）をする
   - 画面外・タブが裏のときは止める
   ========================================================= */
(function () {
  const W = window;
  const S = { renderer: null, raf: 0, host: null, running: false, visible: true, token: 0 };
  const YAW0 = 0.3, YAW_MAX = 1.15;

  function reduced() { return W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function unmount() {
    S.token++;
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    S.running = false;
    if (S.obs) { S.obs.disconnect(); S.obs = null; }
    if (S.off) { S.off(); S.off = null; }
    if (S.renderer) {
      const el = S.renderer.domElement;
      if (el.parentNode) el.parentNode.removeChild(el);
      S.renderer.dispose();
      if (S.renderer.forceContextLoss) S.renderer.forceContextLoss();
      S.renderer = null;
    }
    S.host = null;
  }

  function mount(host, opts) {
    opts = opts || {};
    unmount();
    const token = S.token;
    const go = () => {
      if (token !== S.token || !W.GolferKit) return;
      const THREE = W.THREE;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return; }
      S.renderer = renderer; S.host = host;
      renderer.setPixelRatio(Math.min(W.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = 'avatar-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
      camera.position.set(0, 0.95, 4.6);
      camera.lookAt(0, 0.93, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 1));

      // 足もとの丸い芝
      const stage = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 40), new THREE.MeshBasicMaterial({ color: 0x4f9f64 }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.77, 40), new THREE.MeshBasicMaterial({ color: 0xf2b705 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003;
      stage.add(disc, ring);
      scene.add(stage);

      const size = () => {
        const w = host.clientWidth || 360, h = host.clientHeight || 420;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
        camera.aspect = w / h; camera.fov = w / h < 1.4 ? 27 : 22; camera.updateProjectionMatrix();
      };
      size();
      const onResize = () => size();
      W.addEventListener('resize', onResize);

      W.GolferKit.load(THREE, { character: opts.character, wear: opts.wear }, (g) => {
        if (token !== S.token) return;
        g.setClub('Iron');
        scene.add(g.root);
        host.classList.add('is-3d');
        let yaw = YAW0, last = performance.now(), idleFor = 0, drag = null;
        if (!reduced()) g.react('cheer');
        const frame = (now) => {
          S.raf = 0;
          if (token !== S.token) return;
          const dt = Math.min(0.05, (now - last) / 1000); last = now;
          if (g.mode === 'cheer' || g.mode === 'sad') { g.tick(dt); if (g.done) g.stand(0); } else g.stand(dt);
          // ドラッグしていないときは、少しずつ正面寄りに戻る
          if (!drag) { idleFor += dt; if (idleFor > 2) yaw += (YAW0 - yaw) * Math.min(1, dt * 2.5); }
          g.root.rotation.y = yaw;
          renderer.render(scene, camera);
          if (S.running && S.visible && !reduced()) S.raf = requestAnimationFrame(frame);
        };
        const kick = () => { if (!S.raf) { last = performance.now(); S.raf = requestAnimationFrame(frame); } };
        S.kick = kick;
        S.running = true;
        kick();
        // ドラッグで回す／タップで喜ぶ
        const down = (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; idleFor = 0; try { host.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } };
        const move = (e) => {
          if (!drag) return;
          const dx = e.clientX - drag.x;
          if (Math.abs(dx) > 3) drag.moved = true;
          yaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, yaw + dx * 0.012));
          drag.x = e.clientX; idleFor = 0; kick();
          if (reduced()) renderer.render(scene, camera);
        };
        const up = () => {
          if (drag && !drag.moved && g.mode !== 'cheer') g.react('cheer');
          drag = null; idleFor = 0; kick();
        };
        host.addEventListener('pointerdown', down);
        host.addEventListener('pointermove', move);
        host.addEventListener('pointerup', up);
        host.addEventListener('pointercancel', up);
        S.off = () => {
          W.removeEventListener('resize', onResize);
          host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
          host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up);
        };
        S.obs = new IntersectionObserver((es) => { S.visible = es[0].isIntersecting; if (S.visible) kick(); });
        S.obs.observe(host);
        if (reduced()) { g.stand(0); g.root.rotation.y = yaw; renderer.render(scene, camera); }
      });
    };
    const whenThree = () => {
      if (W.THREE) go();
      else W.addEventListener('three-ready', whenThree, { once: true });
    };
    whenThree();
  }

  document.addEventListener('visibilitychange', () => {
    S.visible = !document.hidden;
    if (S.visible && S.kick) S.kick();
  });

  W.GolfAvatar = { mount, unmount };
})();
