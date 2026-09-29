/* =========================================================
   BGM（スーパーファミコン風・すべてコードで演奏するオリジナル曲）
   音のつくり：
   - SPC700 と同じ考え方。32kHz の小さな波形（サンプル）をコードで作り、粗く量子化して、ピッチを変えて鳴らす
   - 楽器：パルス・ブラス・フルート・ストリングス・ギター・ハープ・マリンバ・オルゴール・グロッケン・ベース・ドラム
   - スーファミ特有のエコー（左右に跳ね返る、こもったフィードバック）と、こもった出力
   曲：
   - course    ラウンド中（ハ長調・128BPM・32小節：A→A'→B→ニ長調に転調のサビ）
   - challenge ニアピン／ドラコン（イ短調・152BPM・16小節のロック）
   - menu      プレー画面（ト長調・96BPM・24小節のボサノバ）
   - putt      パター（ヘ長調・80BPM・16小節のゆったりした曲）
   ジングル：fanfare（バーディー）/ cupin / miss / levelup
   ========================================================= */
(function () {
  'use strict';

  const SR = 32000;                                   // SNES の DSP と同じサンプルレート
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (n) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- コード（和音） ---------- */
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7sus': [0, 5, 7, 10], sus: [0, 5, 7], dim: [0, 3, 6] };
  const chordCache = {};
  function chord(sym) {
    if (chordCache[sym]) return chordCache[sym];
    const m = /^([A-G])(#|b)?(maj7|m7|7sus|sus|dim|m|7)?$/.exec(sym);
    const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    const ivs = QUAL[m[3] || ''];
    const tones = ivs.map(i => { const p = (pc + i) % 12; return 55 + (((p - 55) % 12) + 12) % 12; }).sort((a, b) => a - b);
    return (chordCache[sym] = { pc, ivs, bass: 36 + pc, tones, arp: [...tones, tones[0] + 12, tones[1] + 12, tones[2] + 12] });
  }
  // メロディ：「音名:長さ（16分音符の数）」を空白区切りで。r は休み
  const phraseCache = {};
  function phrase(str) {
    if (phraseCache[str]) return phraseCache[str];
    let s = 0; const out = [];
    for (const tk of str.trim().split(/\s+/)) {
      if (!tk) continue;
      const [n, l] = tk.split(':'); const len = Number(l);
      if (n !== 'r') out.push([midi(n), s, len]);
      s += len;
    }
    return (phraseCache[str] = out);
  }

  /* ---------- サンプルの合成（BRR のような粗い音色） ---------- */
  let seed = 12345;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lp1 = (d, a) => { let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; } return d; };
  const hp1 = (d, a) => { let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] -= y; } return d; };
  function norm(d, peak) { let m = 1e-9; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; return d; }
  function quant(d, lv) { for (let i = 0; i < d.length; i++) d[i] = Math.round(d[i] * lv) / lv; return d; }   // ビット数を落として、ざらっとした質感に

  // ループする音色：1周期の波形（倍音の並べ方で音色が決まる）を数回くり返す
  function loopTone(P, ampFn) {
    const K = Math.floor(P / 2) - 1, one = new Float32Array(P);
    for (let k = 1; k <= K; k++) {
      const a = ampFn(k); if (!a) continue;
      const ph = k * 0.9;
      for (let i = 0; i < P; i++) one[i] += a * Math.sin(2 * Math.PI * k * i / P + ph);
    }
    const d = new Float32Array(P * 8);
    for (let r = 0; r < 8; r++) d.set(one, r * P);
    quant(norm(d, 0.85), 60);
    return { data: d, loop: [0, d.length], ref: SR / P };
  }
  // 弦をはじく音（Karplus-Strong）
  function pluck(f, dur, decay, bright) {
    const N = Math.round(SR / f), len = Math.floor(SR * dur), y = new Float32Array(len);
    for (let i = 0; i < N; i++) y[i] = rnd() * 2 - 1;
    lp1(y.subarray(0, N), bright);
    for (let i = N + 1; i < len; i++) y[i] = decay * 0.5 * (y[i - N] + y[i - N - 1]);
    hp1(y, 0.004);
    quant(norm(y, 0.9), 70);
    return { data: y, loop: null, ref: SR / (N + 0.5) };
  }
  // 叩く音（いくつかの倍音が、それぞれの速さで減衰する）
  function modal(f, dur, parts) {
    const len = Math.floor(SR * dur), y = new Float32Array(len);
    for (const [ratio, amp, dec] of parts) {
      const w = 2 * Math.PI * f * ratio / SR; if (f * ratio > SR / 2.2) continue;
      for (let i = 0; i < len; i++) y[i] += amp * Math.sin(w * i) * Math.exp(-i / SR * dec);
    }
    for (let i = 0; i < Math.min(60, len); i++) y[i] *= i / 60;
    quant(norm(y, 0.9), 70);
    return { data: y, loop: null, ref: f };
  }

  const INSTS = {
    // ---- ループする音色 ----
    pulse:   { k: 'loop', amp: (k) => (Math.sin(k * Math.PI * 0.25) / k) * (k > 14 ? 0.5 : 1), env: [0.004, 0.12, 0.7, 0.05], vib: 9 },
    brass:   { k: 'loop', amp: (k) => Math.pow(k, -0.85) * (k < 7 ? 1 : 0.8) * (k === 2 ? 1.25 : 1), env: [0.035, 0.12, 0.85, 0.08], vib: 7 },
    flute:   { k: 'loop', amp: (k) => [0, 1, 0.42, 0.16, 0.08, 0.05, 0.03][k] || 0, env: [0.06, 0.1, 0.9, 0.1], vib: 10 },
    strings: { k: 'loop', amp: (k) => Math.pow(k, -1.05) * Math.exp(-k / 14), env: [0.22, 0.2, 1, 0.4], chorus: 7 },
    organ:   { k: 'loop', amp: (k) => [0, 1, 0.55, 0.35, 0.18, 0.1, 0.06, 0.03][k] || 0, env: [0.01, 0.1, 0.9, 0.06] },
    gtr:     { k: 'loop', amp: (k) => Math.pow(k, -0.7) * Math.exp(-k / 12), env: [0.003, 0.09, 0.1, 0.04] },
    bass:    { k: 'loop', amp: (k) => Math.pow(k, -1.25) * (k > 9 ? 0 : 1), env: [0.004, 0.09, 0.55, 0.05] },
    softbass:{ k: 'loop', amp: (k) => [0, 1, 0.4, 0.14, 0.05][k] || 0, env: [0.01, 0.15, 0.7, 0.1] },
    // ---- 一度だけ鳴る音色 ----
    nylon:   { k: 'shot', gen: (f) => pluck(f, 1.3, 0.9955, 0.5), env: [0.002, 0, 1, 0.08] },
    harp:    { k: 'shot', gen: (f) => pluck(f, 1.8, 0.9985, 0.72), env: [0.002, 0, 1, 0.5], ring: true },
    marimba: { k: 'shot', gen: (f) => modal(f, 1.1, [[1, 1, 3.4], [3.92, 0.45, 11], [9.3, 0.12, 24]]), env: [0.002, 0, 1, 0.06] },
    glock:   { k: 'shot', gen: (f) => modal(f, 1.6, [[1, 1, 2.6], [2.76, 0.55, 4.5], [5.4, 0.3, 8], [8.93, 0.15, 12]]), env: [0.002, 0, 1, 0.3], ring: true },
    musicbox:{ k: 'shot', gen: (f) => modal(f, 1.7, [[1, 1, 2.2], [2.5, 0.32, 5], [4.1, 0.22, 7], [6.3, 0.12, 10]]), env: [0.002, 0, 1, 0.3], ring: true },
  };
  const LOOP_P = [256, 181, 128, 90, 64, 45, 32, 22, 16];                // 音域ごとに用意する波形の長さ
  const SHOT_REF = [110, 165, 220, 330, 440, 660, 880, 1320];
  const zoneCache = {};
  function sampleFor(name, f) {
    const inst = INSTS[name];
    let best, bd = 1e9, key;
    const list = inst.k === 'loop' ? LOOP_P.map(P => SR / P) : SHOT_REF;
    list.forEach((r, i) => { const d = Math.abs(Math.log(f / r)); if (d < bd) { bd = d; best = i; } });
    key = name + ':' + best;
    if (!zoneCache[key]) zoneCache[key] = inst.k === 'loop' ? loopTone(LOOP_P[best], inst.amp) : inst.gen(SHOT_REF[best]);
    return zoneCache[key];
  }

  // ドラム（低いサンプルレートで、ざらっとした音）
  const DRUMS = {};
  function drum(name) {
    if (DRUMS[name]) return DRUMS[name];
    const mk = (dur, fn, q) => { const n = Math.floor(SR * dur), d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = fn(i / SR, i); return quant(norm(d, 0.9), q || 40); };
    let d;
    if (name === 'kick') { let ph = 0; d = mk(0.3, (t, i) => { ph += 2 * Math.PI * (44 + 120 * Math.exp(-t * 30)) / SR; return Math.sin(ph) * Math.exp(-t * 11) + (i < 60 ? (rnd() - 0.5) * 0.6 : 0); }); }
    else if (name === 'snare') { const nz = hp1(Float32Array.from({ length: SR * 0.25 }, () => rnd() * 2 - 1), 0.12); d = mk(0.25, (t, i) => nz[i] * Math.exp(-t * 20) * 0.9 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 34) * 0.55, 32); }
    else if (name === 'hat') { const nz = hp1(Float32Array.from({ length: SR * 0.1 }, () => rnd() * 2 - 1), 0.45); d = mk(0.09, (t, i) => nz[i] * Math.exp(-t * 85), 24); }
    else if (name === 'ohat') { const nz = hp1(Float32Array.from({ length: SR * 0.4 }, () => rnd() * 2 - 1), 0.4); d = mk(0.38, (t, i) => nz[i] * Math.exp(-t * 11), 24); }
    else if (name === 'crash') { const nz = hp1(Float32Array.from({ length: SR * 1.6 }, () => rnd() * 2 - 1), 0.3); d = mk(1.6, (t, i) => nz[i] * Math.exp(-t * 2.8), 24); }
    else if (name === 'rim') { d = mk(0.05, (t) => (Math.sin(2 * Math.PI * 1750 * t) + (rnd() - 0.5) * 0.8) * Math.exp(-t * 90), 32); }
    else if (name === 'shaker') { const nz = hp1(Float32Array.from({ length: SR * 0.12 }, () => rnd() * 2 - 1), 0.3); d = mk(0.1, (t, i) => nz[i] * Math.min(1, t * 160) * Math.exp(-t * 38), 24); }
    else if (name === 'tom') { let ph = 0; d = mk(0.4, (t) => { ph += 2 * Math.PI * (95 + 90 * Math.exp(-t * 14)) / SR; return Math.sin(ph) * Math.exp(-t * 8); }); }
    else if (name === 'tom2') { let ph = 0; d = mk(0.35, (t) => { ph += 2 * Math.PI * (150 + 110 * Math.exp(-t * 14)) / SR; return Math.sin(ph) * Math.exp(-t * 9); }); }
    return (DRUMS[name] = { data: d, loop: null, ref: 1 });
  }

  /* ---------- 曲のデータ ---------- */
  const bars = (a) => a.split('|').map(s => s.trim());
  const SONGS = {
    course: {
      bpm: 128, style: 'pop',
      chords: 'C G Am F C G F G  C G Am F Dm G C C  F G Em Am Dm G C G  D A Bm G D A Em G7'.split(/\s+/),
      melody: bars(`E5:2 G5:2 C6:3 B5:1 G5:2 E5:2 G5:4 | D5:2 G5:2 B5:3 A5:1 G5:2 D5:2 B4:4 | E5:2 A5:2 C6:3 B5:1 A5:2 E5:2 A5:4 | F5:2 A5:2 C6:2 A5:2 F5:4 G5:2 A5:2
      | E5:2 G5:2 C6:3 D6:1 E6:4 C6:4 | D6:2 B5:2 G5:4 B5:2 D6:2 G6:4 | A5:2 C6:2 F6:4 E6:2 D6:2 C6:2 A5:2 | B5:2 D6:2 G6:4 F6:2 D6:2 B5:4
      | E5:2 G5:2 C6:3 B5:1 G5:2 E5:2 G5:4 | D5:2 G5:2 B5:3 A5:1 G5:2 D5:2 B4:4 | E5:2 A5:2 C6:3 B5:1 A5:2 E5:2 A5:4 | F5:2 A5:2 C6:2 A5:2 F5:4 G5:2 A5:2
      | F5:2 A5:2 D6:4 C6:2 A5:2 F5:4 | G5:2 B5:2 D6:4 B5:2 G5:2 D5:4 | C6:4 E6:4 G6:4 E6:2 C6:2 | C6:8 G5:2 A5:2 B5:2 C6:2
      | A5:4 C6:4 F6:4 E6:2 D6:2 | D6:4 B5:4 G5:4 B5:4 | G5:4 B5:4 E6:4 D6:2 B5:2 | C6:4 E6:4 A6:4 G6:2 E6:2
      | D6:4 F6:4 A6:4 G6:2 F6:2 | G6:4 D6:4 B5:4 D6:2 G6:2 | E6:4 C6:2 E6:2 G6:4 E6:2 C6:2 | D6:2 B5:2 G5:2 B5:2 D6:2 F6:2 D6:2 B5:2
      | F#5:2 A5:2 D6:3 C#6:1 A5:2 F#5:2 A5:4 | E5:2 A5:2 C#6:3 B5:1 A5:2 E5:2 C#6:4 | D5:2 F#5:2 B5:3 A5:1 F#5:2 D5:2 F#5:4 | B5:2 D6:2 G6:4 F#6:2 E6:2 D6:2 B5:2
      | F#5:2 A5:2 D6:2 F#6:2 A6:4 F#6:2 D6:2 | E6:2 C#6:2 A5:2 C#6:2 E6:4 A5:2 C#6:2 | G5:2 B5:2 E6:4 D6:2 B5:2 G5:2 B5:2 | G5:2 B5:2 D6:2 F6:2 G6:8`),
      sections: [
        { from: 0, lead: [['pulse', 0.15]], pad: 0.05, arp: ['harp', 0.075, 0], stabs: 0, drums: 1, bass: 'bass' },
        { from: 8, lead: [['pulse', 0.13], ['flute', 0.1]], pad: 0.06, arp: ['harp', 0.075, 1], stabs: 0, drums: 1, bass: 'bass' },
        { from: 16, lead: [['flute', 0.15], ['glock', 0.07]], pad: 0.085, arp: ['harp', 0.08, 12], stabs: 1, drums: 2, bass: 'bass' },
        { from: 24, lead: [['brass', 0.13], ['pulse', 0.1], ['glock', 0.045]], pad: 0.075, arp: ['nylon', 0.075, 0], stabs: 1, drums: 1, bass: 'bass' },
      ],
    },
    challenge: {
      bpm: 152, style: 'rock',
      chords: 'Am F C G Am F C G  Dm F G Am Dm F E7 E7'.split(/\s+/),
      melody: bars(`A5:2 C6:2 E6:4 D6:2 C6:2 A5:4 | F5:2 A5:2 C6:4 A5:2 F5:2 A5:4 | G5:2 C6:2 E6:4 D6:2 C6:2 G5:4 | B5:2 D6:2 G6:4 F6:2 D6:2 B5:4
      | A5:2 C6:2 E6:2 A6:2 G6:4 E6:4 | A5:2 C6:2 F6:2 A6:2 G6:4 F6:4 | E6:2 G6:2 C7:4 B6:2 G6:2 E6:4 | D6:4 G6:4 B6:4 D7:2 B6:2
      | D6:4 F6:4 A6:4 F6:4 | C6:4 F6:4 A6:4 C7:4 | B5:4 D6:4 G6:4 B6:4 | A6:6 E6:2 C6:4 A5:4
      | F6:2 A6:2 D7:4 C7:2 A6:2 F6:4 | A6:2 C7:2 F7:4 E7:2 C7:2 A6:4 | G#6:4 B6:4 E7:6 D7:2 | B6:4 G#6:4 E6:8`),
      sections: [
        { from: 0, lead: [['pulse', 0.15]], pad: 0.04, arp: null, stabs: 0, drums: 1, bass: 'bass' },
        { from: 8, lead: [['brass', 0.14], ['pulse', 0.1]], pad: 0.06, arp: null, stabs: 1, drums: 2, bass: 'bass' },
      ],
    },
    menu: {
      bpm: 96, style: 'bossa',
      chords: 'Gmaj7 Em7 Am7 D7 Gmaj7 Bm7 Cmaj7 D7  Gmaj7 Em7 Am7 D7 Bm7 E7 Am7 D7sus  Cmaj7 D7 Bm7 Em7 Am7 D7 Gmaj7 D7'.split(/\s+/),
      melody: bars(`B5:4 D6:4 G6:6 F#6:2 | E6:4 D6:2 B5:2 G5:8 | C6:4 E6:4 A6:6 G6:2 | F#6:6 E6:2 D6:4 A5:4
      | B5:2 D6:2 G6:4 A6:4 B6:4 | A6:4 F#6:4 D6:4 B5:4 | E6:6 D6:2 C6:4 G5:4 | A5:4 C6:4 D6:4 F#6:4
      | D6:6 B5:2 G5:4 B5:4 | E6:4 G6:4 B6:4 A6:4 | G6:4 E6:4 C6:4 E6:4 | D6:6 F#6:2 A6:8
      | B5:4 D6:4 F#6:4 D6:4 | G#5:4 B5:4 E6:6 D6:2 | C6:4 E6:4 A6:4 E6:4 | D6:8 C6:4 A5:4
      | E6:4 G6:4 C7:6 B6:2 | A6:6 F#6:2 D6:8 | D6:4 F#6:4 B6:6 A6:2 | G6:4 E6:4 B5:8
      | C6:4 E6:4 A6:4 C7:4 | B6:4 A6:4 F#6:4 D6:4 | B5:4 D6:4 G6:8 | F#6:4 A6:4 C7:4 A6:4`),
      sections: [
        { from: 0, lead: [['marimba', 0.16]], pad: 0.045, arp: null, stabs: 0, drums: 1, bass: 'softbass' },
        { from: 8, lead: [['flute', 0.13], ['marimba', 0.1]], pad: 0.055, arp: null, stabs: 0, drums: 1, bass: 'softbass' },
        { from: 16, lead: [['musicbox', 0.13], ['flute', 0.09]], pad: 0.06, arp: null, stabs: 0, drums: 1, bass: 'softbass' },
      ],
    },
    putt: {
      bpm: 80, style: 'calm',
      chords: 'Fmaj7 Dm7 Gm7 C7  Fmaj7 Dm7 Gm7 C7  Bbmaj7 Am7 Gm7 C7  Fmaj7 Dm7 Gm7 C7sus'.split(/\s+/),
      melody: bars(`A5:4 C6:4 F6:8 | D6:4 A5:4 F5:8 | Bb5:4 D6:4 G6:4 F6:4 | E6:8 C6:4 Bb5:4
      | A5:4 C6:4 F6:6 G6:2 | A6:4 F6:4 D6:8 | D6:4 G6:4 Bb6:4 A6:4 | G6:8 E6:4 C6:4
      | D6:4 F6:4 Bb6:8 | C6:4 E6:4 A6:8 | Bb5:4 D6:4 G6:4 D6:4 | E6:4 G6:4 Bb6:8
      | A5:4 C6:4 F6:4 A6:4 | F6:4 D6:4 A5:8 | G5:4 Bb5:4 D6:4 F6:4 | E6:8 F6:4 E6:4`),
      sections: [
        { from: 0, lead: [['musicbox', 0.16]], pad: 0.05, arp: ['harp', 0.06, 0], stabs: 0, drums: 0, bass: 'softbass' },
        { from: 8, lead: [['musicbox', 0.14], ['flute', 0.08]], pad: 0.065, arp: ['harp', 0.065, 0], stabs: 0, drums: 0, bass: 'softbass' },
      ],
    },
  };

  /* ---------- 伴奏のパターン（16分音符 16 個で 1 小節） ---------- */
  const BASSP = {
    pop: [
      [[0, 0, 2], [3, 0, 1], [4, 0, 2], [6, 12, 1], [8, 0, 2], [10, 0, 1], [11, 7, 1], [12, 0, 2], [14, 12, 1], [15, 7, 1]],
      [[0, 0, 3], [3, 12, 1], [4, 7, 2], [6, 0, 1], [8, 0, 2], [10, 12, 1], [11, 0, 1], [12, 7, 2], [14, 5, 1], [15, 7, 1]],
    ],
    rock: [[[0, 0, 1], [2, 0, 1], [4, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [12, 0, 1], [14, 12, 1]]],
    bossa: [[[0, 0, 5], [6, 7, 3], [8, 0, 3], [12, 7, 3]], [[0, 0, 5], [6, 7, 3], [10, 12, 2], [12, 7, 3]]],
    calm: [[[0, 0, 8], [8, 7, 6]]],
  };
  const ARPP = ['0123210123210123', '0121232101212323'];
  const DR = {
    pop: {
      kick: ['x.....x.x.x.....', 'x.......x.x..x..'], snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      fill: '....x...x.x.xxxx',
    },
    rock: { kick: ['x..x..x...x.x...', 'x.x...x.x..x..x.'], snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', fill: 'x.x.x.x.xxxxxxxx' },
    bossa: { rim: '..x..x..x...x...', shaker: 'x.x.x.x.x.x.x.x.', kick: 'x.......x.......' },
  };

  /* ---------- エンジン（本番の AudioContext でも、書き出し用の OfflineAudioContext でも動く） ---------- */
  function Engine(ctx) {
    const E = this;
    E.ctx = ctx;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    const dac = ctx.createBiquadFilter(); dac.type = 'lowpass'; dac.frequency.value = 8200; dac.Q.value = 0.6;   // スーファミのこもった出力
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;   // 音割れ防止
    E.master = g(0.8);
    const clip = ctx.createWaveShaper(), curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) { const x = (i / 1024 - 1) * 1.6; curve[i] = 0.97 * Math.tanh(x) / Math.tanh(1.6); }   // ごく軽いソフトクリップ
    clip.curve = curve;
    comp.connect(dac); dac.connect(lim); lim.connect(clip); clip.connect(E.master); E.master.connect(ctx.destination);
    E.musicBus = g(1); E.echoBus = g(1); E.jingleBus = g(1);
    E.musicBus.connect(comp); E.jingleBus.connect(comp);
    // エコー：左右に跳ね返り、返るたびにこもる（SNES の FIR エコーの雰囲気）
    const d1 = ctx.createDelay(1), d2 = ctx.createDelay(1), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    E.d1 = d1; E.d2 = d2;
    d1.delayTime.value = 0.24; d2.delayTime.value = 0.36;
    f1.type = f2.type = 'lowpass'; f1.frequency.value = f2.frequency.value = 3000;
    const fb1 = g(0.42), fb2 = g(0.38), wet = g(0.5);
    const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(); pl.pan.value = -0.75; pr.pan.value = 0.75;
    E.echoBus.connect(d1); d1.connect(f1); f1.connect(fb1); fb1.connect(d2); d2.connect(f2); f2.connect(fb2); fb2.connect(d1);
    d1.connect(pl); d2.connect(pr); pl.connect(wet); pr.connect(wet); wet.connect(comp);
    // チャンネル（楽器のグループ）：出力・エコーの送り・定位
    const chan = (out, vol, send, pan) => { const o = g(vol), s = g(send), p = ctx.createStereoPanner(); p.pan.value = pan; o.connect(p); p.connect(out); o.connect(s); s.connect(E.echoBus); return o; };
    E.ch = {
      lead: chan(E.musicBus, 1, 0.34, 0), pad: chan(E.musicBus, 1, 0.5, -0.15), arp: chan(E.musicBus, 1, 0.42, 0.28),
      bass: chan(E.musicBus, 1, 0.02, 0), drums: chan(E.musicBus, 1, 0.1, -0.05), stab: chan(E.musicBus, 1, 0.3, -0.25),
      fx: chan(E.jingleBus, 1, 0.3, 0),
    };
    E.live = [];
    E.bufs = new Map();
  }
  Engine.prototype.buf = function (s) {
    let b = this.bufs.get(s);
    if (!b) { b = this.ctx.createBuffer(1, s.data.length, SR); b.copyToChannel(s.data, 0); this.bufs.set(s, b); }
    return b;
  };
  // 1 つの音を鳴らす（エンベロープ = 立ち上がり・減衰・保持レベル・余韻）
  Engine.prototype.note = function (name, m, t, dur, vel, ch, o) {
    o = o || {};
    const E = this, ctx = E.ctx, inst = INSTS[name], f = hz(m + (o.shift || 0));
    const smp = sampleFor(name, f), buf = E.buf(smp), rate = f / smp.ref;
    const env = o.env || inst.env, [a, d, s, r] = env;
    const voices = inst.chorus ? [-inst.chorus, inst.chorus] : [0];
    voices.forEach((cents, vi) => {
      const src = ctx.createBufferSource(), gn = ctx.createGain();
      src.buffer = buf; src.playbackRate.value = rate; src.detune.value = cents;
      if (smp.loop) { src.loop = true; src.loopStart = smp.loop[0] / SR; src.loopEnd = smp.loop[1] / SR; }
      const v = vel / voices.length;
      const end = t + Math.max(dur, a + 0.02);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.linearRampToValueAtTime(v, t + a);
      if (smp.loop || d) gn.gain.setTargetAtTime(v * s, t + a, Math.max(0.01, d / 3));
      if (!inst.ring || smp.loop) gn.gain.setTargetAtTime(0.0001, end, Math.max(0.01, r / 3));
      // ビブラート（すこし遅れてかかる）
      if (inst.vib && dur > 0.25) {
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(inst.vib, t + Math.min(0.5, dur * 0.9));
        lfo.connect(lg); lg.connect(src.detune); lfo.start(t); lfo.stop(end + r * 2);
      }
      src.connect(gn);
      if (voices.length > 1) { const p = ctx.createStereoPanner(); p.pan.value = vi ? 0.45 : -0.45; gn.connect(p); p.connect(E.ch[ch]); } else gn.connect(E.ch[ch]);
      const stopAt = smp.loop ? end + r * 2.5 + 0.05 : t + smp.data.length / SR / rate + 0.05;
      src.start(t); src.stop(stopAt);
      E.live.push(src); src.onended = () => { const i = E.live.indexOf(src); if (i >= 0) E.live.splice(i, 1); };
    });
  };
  Engine.prototype.drum = function (name, t, vel) {
    const E = this, smp = drum(name), src = E.ctx.createBufferSource(), gn = E.ctx.createGain();
    src.buffer = E.buf(smp); gn.gain.value = vel; src.connect(gn); gn.connect(E.ch.drums);
    src.start(t); E.live.push(src); src.onended = () => { const i = E.live.indexOf(src); if (i >= 0) E.live.splice(i, 1); };
  };
  Engine.prototype.stopLive = function () { this.live.splice(0).forEach(s => { try { s.stop(); } catch (e) { /* noop */ } }); };

  /* ---------- 1 小節ぶんを予約 ---------- */
  const grid = (str, i) => str[i] === 'x' || str[i] === 'o';
  Engine.prototype.scheduleBar = function (S, b, t0) {
    const E = this, N = S.chords.length, bar = b % N, step = 60 / S.bpm / 4, at = (s) => t0 + s * step;
    const sec = S.sections.slice().reverse().find(x => bar >= x.from);
    const c = chord(S.chords[bar]), nc = chord(S.chords[(bar + 1) % N]), first = bar === sec.from, lastOf4 = bar % 4 === 3;
    // メロディ（楽器を重ねて厚みを出す）
    phrase(S.melody[bar] || '').forEach(([m, s, len]) => {
      sec.lead.forEach(([inst, vel], k) => {
        const legato = inst === 'flute' || inst === 'brass' || inst === 'strings';
        E.note(inst, m, at(s), len * step * (legato ? 0.98 : 0.9), vel * (s % 4 === 0 ? 1.08 : 0.94), 'lead', k ? { shift: 0 } : null);
      });
    });
    // パッド（ストリングス）
    if (sec.pad) c.tones.forEach(m => E.note('strings', m, at(0), 16 * step * 0.985, sec.pad, 'pad'));
    // アルペジオ
    if (sec.arp) {
      const [inst, vel, sh] = sec.arp, pat = ARPP[(bar % 2 && S.style === 'pop') ? 1 : 0];
      for (let i = 0; i < 16; i++) { const k = Number(pat[i]); E.note(inst, c.arp[k], at(i), step * 2.4, vel * (i % 4 === 0 ? 1.15 : 0.9), 'arp', { shift: sh > 1 ? sh : 0 }); }
    }
    // ベース
    const bp = BASSP[S.style === 'pop' || S.style === 'rock' ? S.style : S.style];
    const pat = bp[bar % bp.length];
    pat.forEach(([s, off, len]) => E.note(sec.bass, c.bass + off, at(s), len * step * 0.92, S.style === 'calm' ? 0.2 : S.style === 'bossa' ? 0.24 : 0.26, 'bass'));
    if (S.style === 'pop' && lastOf4) E.note(sec.bass, nc.bass + (nc.bass > c.bass ? -1 : 1), at(15), step * 0.9, 0.22, 'bass');
    // ブラスのスタブ（Bメロ・サビ）
    if (sec.stabs) [0, 6, 10].forEach((s, i) => c.tones.slice(0, 3).forEach(m => E.note('brass', m + 12, at(s), step * (i === 2 ? 3 : 1.6), 0.05, 'stab')));
    // スタイル別
    if (S.style === 'pop' || S.style === 'rock') {
      const D = DR[S.style], kk = D.kick[bar % D.kick.length];
      const fill = lastOf4 && sec.drums;
      for (let i = 0; i < 16; i++) {
        if (grid(kk, i) && !(fill && i > 11)) E.drum('kick', at(i), i % 8 === 0 ? 0.85 : 0.6);
        if (grid(D.snare, i) && !(fill && i >= 12)) E.drum('snare', at(i), 0.6);
        if (grid(D.hat, i) && !(fill && i > 11)) E.drum(bar % 8 === 7 && i === 14 ? 'ohat' : 'hat', at(i), i % 4 === 0 ? 0.22 : 0.14);
        if (fill && grid(D.fill, i) && i >= 8) E.drum(i < 12 ? 'snare' : (i % 2 ? 'tom2' : 'tom'), at(i), 0.5);
      }
      if (first || (sec.drums === 2 && bar % 4 === 0)) E.drum('crash', at(0), 0.4);
      if (S.style === 'rock') {
        // パワーコードのギター（8分）
        for (let i = 0; i < 16; i += 2) [0, 7, 12].forEach(off => E.note('gtr', c.bass + 12 + off, at(i), step * 1.6, 0.05, 'stab'));
      }
    } else if (S.style === 'bossa') {
      const D = DR.bossa;
      for (let i = 0; i < 16; i++) {
        if (grid(D.rim, i)) E.drum('rim', at(i), 0.3);
        if (grid(D.shaker, i)) E.drum('shaker', at(i), i % 4 === 0 ? 0.16 : 0.1);
        if (grid(D.kick, i)) E.drum('kick', at(i), 0.4);
      }
      // ナイロンギターのボサノバ・コンピング（ストラム）
      [0, 3, 6, 10, 13].forEach(s => c.tones.forEach((m, i) => E.note('nylon', m, at(s) + i * 0.013, step * 3, 0.085, 'arp')));
    } else if (S.style === 'calm') {
      if (bar % 2 === 0) E.drum('shaker', at(0), 0.08);
      for (let i = 2; i < 16; i += 4) E.drum('shaker', at(i), 0.05);
    }
    if (first && sec.glock !== 0 && S.style === 'pop') E.note('glock', c.tones[2] + 24, at(0), 1, 0.05, 'arp');
  };

  /* ---------- ジングル（短い曲） ---------- */
  Engine.prototype.jingle = function (kind, t) {
    const E = this, n = midi, B = 0.13;
    const N = (inst, name, at, dur, vel) => E.note(inst, n(name), t + at, dur, vel, 'fx');
    if (kind === 'fanfare') {                       // バーディーなど
      ['G4', 'C5', 'E5', 'G5'].forEach((x, i) => { N('brass', x, i * B * 0.75, B * 0.9, 0.16); N('pulse', x, i * B * 0.75, B * 0.9, 0.06); });
      ['C5', 'E5', 'G5', 'C6'].forEach(x => { N('brass', x, 0.5, 1.1, 0.13); N('strings', x, 0.5, 1.4, 0.06); });
      N('bass', 'C3', 0.5, 1.1, 0.3);
      ['E6', 'G6', 'C7', 'E7', 'G6', 'C7'].forEach((x, i) => N('glock', x, 0.55 + i * 0.09, 0.4, 0.09));
      E.drum('tom', t + 0.34, 0.6); E.drum('tom2', t + 0.4, 0.55); E.drum('snare', t + 0.44, 0.5); E.drum('crash', t + 0.5, 0.5); E.drum('kick', t + 0.5, 0.9);
    } else if (kind === 'levelup') {                // レベルアップ：長めのファンファーレ
      const mel = [['C5', 0], ['E5', 1], ['G5', 2], ['C6', 3], ['G5', 4.5], ['C6', 5], ['E6', 6]];
      mel.forEach(([x, k]) => { N('pulse', x, k * 0.16, 0.16, 0.13); N('brass', x, k * 0.16, 0.16, 0.09); });
      ['C5', 'E5', 'G5', 'C6', 'E6'].forEach(x => { N('brass', x, 1.2, 1.3, 0.12); N('strings', x, 1.2, 1.6, 0.06); });
      ['C3', 'G2'].forEach((x, i) => N('bass', x, i * 0.6 + 0.02, 0.5, 0.3));
      N('bass', 'C3', 1.2, 1.3, 0.3);
      [0, 2, 4, 5, 7, 9].forEach((k, i) => N('glock', ['C6', 'E6', 'G6', 'C7', 'E7', 'G7'][i], 1.25 + i * 0.09, 0.5, 0.08));
      E.drum('tom', t + 0.9, 0.6); E.drum('tom2', t + 1.0, 0.55); E.drum('snare', t + 1.08, 0.5); E.drum('crash', t + 1.2, 0.55); E.drum('kick', t + 1.2, 0.9);
    } else if (kind === 'cupin') {                  // カップイン
      ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((x, i) => N('glock', x, i * 0.075, 0.9, 0.3));
      ['C5', 'G5', 'C6'].forEach(x => N('strings', x, 0.3, 0.9, 0.14));
      N('musicbox', 'C7', 0.42, 0.9, 0.2);
    } else if (kind === 'miss') {                   // ミス・OB・池
      ['E4', 'Eb4', 'D4', 'Db4', 'C4'].forEach((x, i) => N('flute', x, i * 0.2, i === 4 ? 0.7 : 0.19, 0.24));
      N('softbass', 'C2', 0.8, 0.7, 0.35);
    }
  };

  /* ---------- 再生の制御 ---------- */
  let E = null, songName = null, S = null, nextBar = 0, barIdx = 0, timer = 0, gen = 0, stopping = false;
  let volume = 0.6, enabled = true, pending = null;
  const canStart = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
  function ensure() {
    if (E) { if (E.ctx.state === 'suspended') E.ctx.resume(); return true; }
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    E = new Engine(ctx);
    E.master.gain.value = volume * 0.95;
    return true;
  }
  function fadeMusic(v, sec) {
    if (!E) return;
    const t = E.ctx.currentTime;
    [E.musicBus, E.echoBus].forEach(n => { n.gain.cancelScheduledValues(t); n.gain.setValueAtTime(n.gain.value, t); n.gain.linearRampToValueAtTime(v, t + sec); });
  }
  function tick() {
    if (!S || !E) return;
    const bd = 60 / S.bpm * 4;
    while (nextBar < E.ctx.currentTime + 0.35) { E.scheduleBar(S, barIdx, nextBar); barIdx++; nextBar += bd; }
  }
  function play(name) {
    if (!enabled || !SONGS[name]) return;
    if (songName === name && S && !stopping) return;
    if (!canStart()) { pending = name; return; }
    pending = null;
    if (!ensure()) return;
    const my = ++gen;
    const start = () => {
      if (my !== gen) return;
      stopping = false;
      S = SONGS[name]; songName = name;
      const step = 60 / S.bpm / 4;
      E.d1.delayTime.value = step * 2; E.d2.delayTime.value = step * 3;     // エコーの間隔を曲のテンポに合わせる
      barIdx = 0; nextBar = E.ctx.currentTime + 0.12;
      clearInterval(timer); timer = setInterval(tick, 50); tick();
      fadeMusic(1, 0.6);
    };
    if (S) { fadeMusic(0, 0.35); setTimeout(() => { if (my === gen) E.stopLive(); start(); }, 380); } else start();
  }
  function stop() {
    pending = null;
    const my = ++gen;
    if (!S) return;
    stopping = true;
    fadeMusic(0, 0.45);
    setTimeout(() => { if (my === gen) { S = null; songName = null; stopping = false; clearInterval(timer); E.stopLive(); } }, 500);
  }
  function duck(on) { if (S) fadeMusic(on ? 0.2 : 1, on ? 0.15 : 0.8); }
  function jingle(kind) {
    if (!enabled || !canStart() || !ensure()) return;
    if (S) { duck(true); setTimeout(() => duck(false), kind === 'levelup' ? 3200 : 2400); }
    E.jingle(kind, E.ctx.currentTime + 0.05);
  }
  // ページを触ったら（自動再生の制限で止まっていた）音を再開する
  const wake = () => {
    if (E && E.ctx.state === 'suspended') E.ctx.resume();
    if (pending) { const n = pending; pending = null; setTimeout(() => play(n), 0); }
  };
  document.addEventListener('pointerdown', wake, { passive: true });
  document.addEventListener('keydown', wake);

  // 書き出し（確認用）：曲を WAV にするための PCM を返す
  async function render(name, nBars, kind) {
    const s = SONGS[name], bd = kind ? 0 : 60 / s.bpm * 4, secs = kind ? 4 : bd * nBars + 2.5;
    const oc = new OfflineAudioContext(2, Math.ceil(secs * 44100), 44100), e = new Engine(oc);
    e.master.gain.value = 0.57;
    if (kind) e.jingle(kind, 0.05);
    else {
      const step = 60 / s.bpm / 4; e.d1.delayTime.value = step * 2; e.d2.delayTime.value = step * 3;
      for (let b = 0; b < nBars; b++) e.scheduleBar(s, b, 0.05 + b * bd);
    }
    const out = await oc.startRendering();
    return { l: Array.from(out.getChannelData(0)), r: Array.from(out.getChannelData(1)), sr: 44100 };
  }

  window.GolfBGM = {
    play, stop, duck, jingle, render,
    setEnabled(v) { enabled = v; if (!v) stop(); },
    setVolume(v) { volume = v; if (E) E.master.gain.value = volume * 0.95; },
    get playing() { return songName; },
    songs: Object.keys(SONGS),
  };
})();
