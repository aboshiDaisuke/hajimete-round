/* =========================================================
   BGM（Web Audio で演奏するオリジナル曲）
   - course : ラウンド中。明るいシャッフルのポップ（F メジャー / 124 BPM）
   - menu   : プレー画面。ゆったりしたボサノバ（C メジャー / 100 BPM）
   - jingle : バーディー・レベルアップのファンファーレ、カップイン
   ========================================================= */
(function () {
  'use strict';

  const N = (name) => {
    const m = /^([A-G])(#|b)?(\d)$/.exec(name);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (Number(m[3]) + 1) + base;
  };
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  // メロディ表記: "音名 開始拍 長さ" を空白区切りで
  const mel = (bars) => bars.map(b => b.trim().split(/\s*,\s*/).filter(Boolean).map(s => { const [n, t, d] = s.split(' '); return [N(n), Number(t), Number(d)]; }));
  const CH = {
    Fmaj7: ['F2', ['A3', 'C4', 'E4', 'G4']], Dm7: ['D2', ['F3', 'A3', 'C4', 'E4']], Gm7: ['G2', ['F3', 'Bb3', 'D4', 'A4']],
    C7: ['C2', ['E3', 'Bb3', 'D4', 'G4']], Am7: ['A2', ['G3', 'C4', 'E4', 'B4']], D7: ['D2', ['F#3', 'C4', 'E4', 'A4']],
    Bbmaj7: ['Bb1', ['A3', 'D4', 'F4', 'C5']], C7sus: ['C2', ['F3', 'Bb3', 'D4', 'G4']],
    Cmaj7: ['C2', ['E3', 'G3', 'B3', 'D4']], G7: ['G1', ['F3', 'B3', 'D4', 'E4']], Em7: ['E2', ['D3', 'G3', 'B3', 'F#4']],
    A7: ['A1', ['G3', 'C#4', 'E4', 'B4']], Dm7b: ['D2', ['C4', 'F4', 'A4', 'E5']],
  };

  const SONGS = {
    course: {
      bpm: 124, swing: 0.62, style: 'shuffle',
      chords: ['Fmaj7', 'Dm7', 'Gm7', 'C7', 'Am7', 'D7', 'Gm7', 'C7', 'Bbmaj7', 'C7', 'Am7', 'Dm7', 'Gm7', 'C7', 'Fmaj7', 'C7sus'],
      melody: mel([
        'C5 0 0.5, F5 0.5 0.5, A5 1 1, G5 2 0.5, A5 2.5 0.5, C6 3 1',
        'A5 0 1.5, F5 1.5 0.5, D5 2 1.5',
        'Bb5 0 0.5, A5 0.5 0.5, G5 1 0.5, F5 1.5 0.5, G5 2 1, D5 3 1',
        'E5 0 1, G5 1 0.5, Bb5 1.5 0.5, C6 2 1.5',
        'C6 0 0.5, A5 0.5 0.5, G5 1 1, E5 2 0.5, G5 2.5 0.5, A5 3 1',
        'F#5 0 1, A5 1 0.5, C6 1.5 0.5, D6 2 1.5',
        'Bb5 0 0.5, A5 0.5 0.5, G5 1 1, F5 2 0.5, E5 2.5 0.5, D5 3 1',
        'C5 0 0.5, E5 0.5 0.5, G5 1 0.5, Bb5 1.5 0.5, A5 2 2',
        'D6 0 1, C6 1 0.5, A5 1.5 0.5, F5 2 1, D5 3 1',
        'E5 0 0.5, F5 0.5 0.5, G5 1 1, C6 2 2',
        'C6 0 1, A5 1 0.5, G5 1.5 0.5, E5 2 1, C5 3 1',
        'D5 0 0.5, E5 0.5 0.5, F5 1 1, A5 2 1.5',
        'G5 0 0.5, A5 0.5 0.5, Bb5 1 1, D6 2 1, C6 3 0.5, Bb5 3.5 0.5',
        'A5 0 1, G5 1 1, E5 2 1, C5 3 1',
        'F5 0 0.5, G5 0.5 0.5, A5 1 0.5, C6 1.5 0.5, F6 2 1.5',
        'G5 2 0.5, A5 2.5 0.5, Bb5 3 0.5, C6 3.5 0.5',
      ]),
    },
    menu: {
      bpm: 100, swing: 0.5, style: 'bossa',
      chords: ['Cmaj7', 'Am7', 'Dm7b', 'G7', 'Em7', 'A7', 'Dm7b', 'Cmaj7'],
      melody: mel([
        'E5 0 1.5, G5 1.5 0.5, B5 2 1.5, A5 3.5 0.5',
        'G5 0 1, E5 1 1, C5 2 2',
        'D5 0 0.5, F5 0.5 0.5, A5 1 1, C6 2 1, B5 3 0.5, A5 3.5 0.5',
        'G5 0 2, F5 2 0.5, E5 2.5 0.5, D5 3 1',
        'E5 0 1, G5 1 1, B5 2 1, D6 3 1',
        'C#6 0 1.5, A5 1.5 0.5, E5 2 2',
        'F5 0 1, A5 1 0.5, C6 1.5 0.5, B5 2 1, G5 3 1',
        'C6 0 3',
      ]),
    },
  };

  let ctx = null, master = null, bus = null, drumBus = null, noiseBuf = null;
  let song = null, songName = null, nextBar = 0, barIdx = 0, timer = 0;
  let volume = 0.6, enabled = true, pending = null, gen = 0, stopping = false;
  // まだページが一度も触られていないと、ブラウザが音を出させてくれない
  const canStart = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    master = ctx.createGain(); master.gain.value = 0;
    bus = ctx.createGain(); bus.gain.value = 1;
    drumBus = ctx.createGain(); drumBus.gain.value = 0.8;
    // 軽いリバーブ（短いディレイの重ね）
    const dly = ctx.createDelay(); dly.delayTime.value = 0.19;
    const fb = ctx.createGain(); fb.gain.value = 0.22;
    const wet = ctx.createGain(); wet.gain.value = 0.18;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2400;
    bus.connect(comp); drumBus.connect(comp);
    bus.connect(dly); dly.connect(damp); damp.connect(fb); fb.connect(dly); damp.connect(wet); wet.connect(comp);
    comp.connect(master); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  /* ---------- 楽器 ---------- */
  function env(g, t, a, peak, dec, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, dec);
    g.gain.setTargetAtTime(0.0001, end, rel);
  }
  function lead(t, midi, dur, vol) {
    const f = hz(midi), end = t + dur * 0.92;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = f; o2.frequency.value = f * 2.001;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    // ビブラート
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur));
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(3200, t + 0.05); lp.frequency.setTargetAtTime(1800, t + 0.06, 0.2);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(bus);
    env(g, t, 0.02, vol, 0.15, 0.7, 0.06, end);
    [o1, o2, lfo].forEach(o => { o.start(t); o.stop(end + 0.4); });
  }
  function epiano(t, midi, dur, vol) {
    const f = hz(midi), end = t + dur;
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.type = 'sine'; m.type = 'sine';
    c.frequency.value = f; m.frequency.value = f * 7;
    mg.gain.setValueAtTime(f * 1.4, t); mg.gain.setTargetAtTime(f * 0.1, t, 0.08);
    m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(bus);
    env(g, t, 0.005, vol, 0.35, 0.35, 0.08, end);
    [c, m].forEach(o => { o.start(t); o.stop(end + 0.5); });
  }
  function bass(t, midi, dur, vol) {
    const f = hz(midi), end = t + dur * 0.9;
    const o = ctx.createOscillator(), s = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; s.type = 'sine'; o.frequency.value = f; s.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(lp); s.connect(lp); lp.connect(g); g.connect(bus);
    env(g, t, 0.01, vol, 0.2, 0.6, 0.05, end);
    [o, s].forEach(x => { x.start(t); x.stop(end + 0.3); });
  }
  function bell(t, midi, vol) {
    const f = hz(midi);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.76;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(bus);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    [o, o2].forEach(x => { x.start(t); x.stop(t + 1.3); });
  }
  function noise(t, len, type, freq, vol, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    s.connect(f); f.connect(g); g.connect(drumBus);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }
  function kick(t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g); g.connect(drumBus);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t); o.stop(t + 0.32);
  }
  function snare(t, vol) {
    noise(t, 0.16, 'bandpass', 1900, vol, 0.8);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    o.connect(g); g.connect(drumBus);
    g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t); o.stop(t + 0.12);
  }
  const hat = (t, vol, open) => noise(t, open ? 0.22 : 0.045, 'highpass', 7500, vol);
  const rim = (t, vol) => noise(t, 0.03, 'bandpass', 3200, vol, 4);
  const shaker = (t, vol) => noise(t, 0.06, 'bandpass', 6000, vol, 1.5);

  /* ---------- 1小節ぶんを予約 ---------- */
  function scheduleBar(t0, i) {
    const s = song, beat = 60 / s.bpm;
    const at = (b) => {
      const whole = Math.floor(b), frac = b - whole;
      const f = Math.abs(frac - 0.5) < 1e-6 ? s.swing : frac;   // 裏拍をハネさせる
      return t0 + (whole + f) * beat;
    };
    const bar = i % s.chords.length;
    const [root, voicing] = CH[s.chords[bar]];
    const r = N(root);
    if (s.style === 'shuffle') {
      // ドラム
      kick(at(0), 0.9); kick(at(2), 0.8); if (bar % 4 === 3) kick(at(3.5), 0.5);
      snare(at(1), 0.55); snare(at(3), 0.6);
      for (let k = 0; k < 8; k++) hat(at(k / 2), k % 2 ? 0.12 : 0.2, bar % 8 === 7 && k === 7);
      // ベース（ルート・5度・オクターブ・経過音）
      bass(at(0), r, beat * 1.2, 0.5); bass(at(1.5), r + 7, beat * 0.5, 0.35);
      bass(at(2), r + 12, beat * 0.9, 0.4); bass(at(3), r + 7, beat * 0.5, 0.35);
      const nx = N(CH[s.chords[(bar + 1) % s.chords.length]][0]);
      bass(at(3.5), nx + (nx > r ? -1 : 1), beat * 0.5, 0.35);
      // エレピのバッキング（裏拍）
      for (const b of [0.5, 1.5, 2.5, 3.5]) {
        if (b === 2.5 && bar % 2) continue;
        voicing.forEach(n => epiano(at(b), N(n), beat * 0.45, 0.07));
      }
      if (bar % 4 === 0) [0, 4, 7, 12].forEach((d, k) => bell(at(k * 0.25), r + 36 + d, 0.05));
    } else {
      // ボサノバ：クラーベ風のリム、シェイカー、やわらかいキック
      [0, 1.5, 3].forEach(b => rim(at(b), 0.25));
      if (bar % 2) [1, 2.5].forEach(b => rim(at(b), 0.2));
      for (let k = 0; k < 8; k++) shaker(at(k / 2), k % 2 ? 0.06 : 0.1);
      kick(at(0), 0.5); kick(at(2), 0.35);
      bass(at(0), r, beat * 1.4, 0.45); bass(at(1.5), r + 7, beat * 0.45, 0.3); bass(at(2), r + 7, beat * 1.4, 0.35); bass(at(3.5), r, beat * 0.45, 0.3);
      for (const b of [0, 1.5, 2.5, 3]) voicing.forEach(n => epiano(at(b), N(n), beat * 0.6, 0.055));
    }
    // メロディ（最初の2小節はイントロとして休む）
    if (i >= 2) (s.melody[bar] || []).forEach(([m, b, d]) => lead(at(b), m, d * beat, s.style === 'bossa' ? 0.09 : 0.11));
  }

  function tick() {
    if (!song || !ctx) return;
    const beat = 60 / song.bpm;
    while (nextBar < ctx.currentTime + 0.3) {
      scheduleBar(nextBar, barIdx);
      barIdx++;
      nextBar += beat * 4;
    }
  }

  function fadeTo(v, sec) {
    if (!master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(v, t + sec);
  }

  function play(name) {
    if (!enabled || !SONGS[name]) return;
    if (songName === name && song && !stopping) return;
    if (!canStart()) { pending = name; return; }
    pending = null;
    if (!ensure()) return;
    const my = ++gen;
    const start = () => {
      if (my !== gen) return;
      stopping = false;
      song = SONGS[name]; songName = name;
      barIdx = 0; nextBar = ctx.currentTime + 0.1;
      clearInterval(timer); timer = setInterval(tick, 50); tick();
      fadeTo(volume * 0.5, 1.2);
    };
    if (song) { fadeTo(0, 0.4); setTimeout(start, 420); } else start();
  }

  function stop() {
    pending = null;
    const my = ++gen;
    if (!song) return;
    stopping = true;
    fadeTo(0, 0.5);
    setTimeout(() => { if (my === gen) { song = null; songName = null; stopping = false; clearInterval(timer); } }, 520);
  }

  function duck(on) { if (song) fadeTo(on ? volume * 0.18 : volume * 0.5, on ? 0.15 : 0.8); }

  function jingle(kind) {
    if (!enabled || !canStart() || !ensure()) return;
    const t = ctx.currentTime + 0.05;
    if (song) { duck(true); setTimeout(() => duck(false), 2200); }
    else { fadeTo(volume * 0.5, 0.02); setTimeout(() => { if (!song) fadeTo(0, 0.3); }, 2600); }
    if (kind === 'fanfare') {
      ['F4', 'A4', 'C5', 'F5'].forEach((n, k) => lead(t + k * 0.11, N(n), 0.13, 0.16));
      ['A4', 'C5', 'F5', 'A5'].forEach(n => lead(t + 0.48, N(n), 0.9, 0.09));
      ['F2'].forEach(n => bass(t + 0.48, N(n), 0.9, 0.5));
      snare(t + 0.36, 0.4); snare(t + 0.42, 0.4); kick(t + 0.48, 0.9);
      [0, 4, 7, 12, 16].forEach((d, k) => bell(t + 0.55 + k * 0.07, N('F6') + d, 0.07));
    }
    if (kind === 'cupin') {
      ['C6', 'E6', 'G6', 'C7'].forEach((n, k) => bell(t + k * 0.08, N(n), 0.12));
    }
    if (kind === 'miss') {
      ['E4', 'Eb4', 'D4', 'Db4'].forEach((n, k) => lead(t + k * 0.22, N(n), k === 3 ? 0.6 : 0.2, 0.09));
    }
  }

  // ページを触ったら（自動再生の制限で止まっていた）音を再開する
  const wake = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (pending) { const n = pending; pending = null; setTimeout(() => play(n), 0); }
  };
  document.addEventListener('pointerdown', wake, { passive: true });
  document.addEventListener('keydown', wake);

  window.GolfBGM = {
    play, stop, duck, jingle,
    setEnabled(v) { enabled = v; if (!v) stop(); },
    setVolume(v) { volume = v; if (song) fadeTo(volume * 0.5, 0.2); },
    get playing() { return songName; },
  };
})();
