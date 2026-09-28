/* =========================================================
   テンポ練習（イチ・ニ・サン）
   振り上げ3 : 振り下ろし1 のリズムを音と時計の針で示す
   ========================================================= */
(function () {
  'use strict';

  const PRESETS = { slow: { name: 'ゆっくり', unit: 0.32 }, normal: { name: 'ふつう', unit: 0.26 }, fast: { name: 'はやい', unit: 0.21 } };
  const REST = 2.6; // 1回ごとの休み（秒）
  let ui = null, audio = null, run = null, raf = 0;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function beep(at, freq, len, vol) {
    if (!audio || !ui.sound.checked) return;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(audio.destination);
    o.start(at); o.stop(at + len + 0.02);
  }

  const now = () => audio ? audio.currentTime : performance.now() / 1000;

  function schedule(start, unit) {
    beep(start, 660, 0.12, 0.35);
    beep(start + unit * 3, 880, 0.12, 0.35);
    beep(start + unit * 4, 1320, 0.18, 0.5);
  }

  // 時計の角度（12時から時計回り、度）
  function angleAt(t, unit) {
    const back = unit * 3, down = unit, follow = unit * 0.8;
    const ease = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    if (t < 0) return 180;
    if (t < back) return 180 + 135 * ease(t / back);                     // 6時 → 10時半
    if (t < back + down) { const k = (t - back) / down; return 315 - 135 * k * k; } // 加速して 6時へ
    if (t < back + down + follow) { const k = (t - back - down) / follow; return 180 - 130 * (1 - Math.pow(1 - k, 3)); } // 2時手前まで
    const rest = t - back - down - follow;
    if (rest < 0.6) return 50;
    const k = Math.min(1, (rest - 0.6) / 1.0);
    return 50 + 130 * ease(k);
  }

  function beatAt(t, unit) {
    if (t < 0) return -1;
    if (t < unit * 3) return 0;
    if (t < unit * 4) return 1;
    if (t < unit * 5.2) return 2;
    return -1;
  }

  function draw(angle, beat) {
    const r = angle * Math.PI / 180;
    const cx = 160, cy = 160, L = 118;
    const x = cx + Math.sin(r) * L, y = cy - Math.cos(r) * L;
    ui.club.setAttribute('x2', x.toFixed(1));
    ui.club.setAttribute('y2', y.toFixed(1));
    ui.head.setAttribute('cx', x.toFixed(1));
    ui.head.setAttribute('cy', y.toFixed(1));
    ui.beats.forEach((b, i) => b.classList.toggle('on', i === beat));
  }

  function frame() {
    if (!run || !ui) return;
    const unit = run.unit;
    const cycle = unit * 4 + REST;
    const t = now() - run.start;
    const idx = Math.floor(t / cycle);
    const local = t - idx * cycle;
    if (idx >= run.total) { stop(true); return; }
    // 次の1回分を先に予約しておく
    while (run.scheduled <= idx + 1 && run.scheduled < run.total) {
      schedule(run.start + run.scheduled * cycle, unit);
      run.scheduled++;
    }
    const beat = beatAt(local, unit);
    draw(reduced() ? 180 : angleAt(local, unit), beat);
    const done = Math.min(run.total, idx + (local > unit * 4 ? 1 : 0));
    if (done !== run.done) {
      run.done = done;
      ui.count.textContent = `${done} / ${run.total}`;
      if (ui.onRep) ui.onRep();
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (run) { stop(false); return; }
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
    const preset = PRESETS[ui.getPreset()] || PRESETS.normal;
    run = { unit: preset.unit, start: now() + 0.5, total: Number(ui.reps.value) || 10, scheduled: 0, done: 0 };
    ui.btn.textContent = 'ストップ';
    ui.btn.classList.replace('btn-primary', 'btn-pine');
    ui.count.textContent = `0 / ${run.total}`;
    frame();
  }

  function stop(finished) {
    cancelAnimationFrame(raf);
    const done = run ? run.done : 0;
    run = null;
    if (!ui) return;
    ui.btn.textContent = 'スタート';
    ui.btn.classList.replace('btn-pine', 'btn-primary');
    draw(180, -1);
    if (finished && ui.onFinish) ui.onFinish(done);
  }

  function mount(u) {
    ui = u;
    draw(180, -1);
    ui.btn.addEventListener('click', start);
  }
  function unmount() { if (run) stop(false); ui = null; }

  window.GolfTempo = { mount, unmount, PRESETS };
})();
