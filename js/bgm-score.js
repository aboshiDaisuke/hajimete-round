/* オリジナルの16bitゴルフ・サウンドトラック。1小節は16分音符16個。 */
(function () {
  const bars = s => s.split('|').map(x => x.trim());
  const titleA = bars(`
    r:2 D5:2 G5:3 A5:1 B5:4 A5:2 G5:2 |
    F#5:3 E5:1 D5:4 A4:4 r:4 |
    E5:2 G5:2 B5:4 A5:2 G5:2 E5:4 |
    F#5:4 D5:2 F#5:2 A5:4 r:4 |
    E5:2 G5:2 C6:4 B5:2 A5:2 G5:4 |
    B5:3 A5:1 G5:4 D5:4 r:4 |
    A5:2 G5:2 E5:4 C5:2 E5:2 G5:4 |
    F#5:4 A5:4 D5:6 r:2`);
  const titleVariation = bars(`
    D5:2 G5:2 B5:3 A5:1 G5:4 D6:4 |
    C6:2 A5:2 F#5:4 E5:4 D5:4 |
    G5:2 B5:2 E6:4 D6:2 B5:2 G5:4 |
    F#5:4 A5:4 D6:4 B5:4 |
    C6:3 B5:1 A5:4 G5:2 E5:2 G5:4 |
    B5:4 A5:2 G5:2 D5:6 r:2 |
    C6:2 B5:2 A5:4 G5:2 E5:2 C5:4 |
    D5:2 F#5:2 A5:4 G5:4 F#5:4`);
  const titleBridge = bars(`
    E5:4 G5:4 C6:6 B5:2 |
    Eb6:4 D6:4 C6:4 G5:4 |
    D6:4 B5:2 A5:2 F#5:4 D5:4 |
    E5:2 G#5:2 B5:4 D6:4 B5:4 |
    C6:4 A5:4 E5:4 G5:4 |
    F#5:2 A5:2 C6:4 B5:2 A5:2 F#5:4 |
    G5:4 B5:4 D6:4 B5:4 |
    A5:4 F#5:4 D5:4 r:4`);
  const titleChords = 'Gmaj7 D7 Em7 Bm7 Cmaj7 Gmaj7 Am7 D7'.split(' ');
  window.GOLF_MUSIC = {
    songs: {
      title: {
        title: 'きょうの、はじめの一打', bpm: 108, style: 'pop', swing: 0.12, mix: 0.86,
        chords: [...titleChords, ...titleChords, ...'Cmaj7 Cm7 Bm7 E7 Am7 D7 Gmaj7 D7'.split(' '), ...titleChords],
        melody: [...titleA, ...titleVariation, ...titleBridge, ...titleVariation],
        counter: bars(`r:8 B4:4 D5:4 | r:8 A4:4 C5:4 | r:8 B4:4 G4:4 | r:8 D5:4 F#5:4 | r:8 E5:4 G5:4 | r:8 D5:4 B4:4 | r:8 C5:4 E5:4 | r:8 C5:4 A4:4`),
        sections: [
          { from: 0, lead: [['flute', 0.23]], pad: 0.028, arp: ['epiano', 0.050, 0], stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.62 },
          { from: 8, lead: [['brass', 0.17], ['marimba', 0.055]], pad: 0.030, arp: ['epiano', 0.05, 0], stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.72, counter: ['flute', 0.085] },
          { from: 16, lead: [['marimba', 0.20]], pad: 0.035, arp: ['harp', 0.040, 0], stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.48 },
          { from: 24, lead: [['flute', 0.17], ['brass', 0.08]], pad: 0.03, arp: ['epiano', 0.05, 0], stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.70, counter: ['marimba', 0.075] },
        ],
      },
      menu: {
        title: '木もれ日のクラブハウス', bpm: 94, style: 'bossa', swing: 0.08, mix: 0.86,
        chords: 'Gmaj7 Em7 Am7 D7 Gmaj7 Bm7 Cmaj7 D7 Gmaj7 Em7 Am7 D7 Bm7 E7 Am7 D7sus Cmaj7 Cm7 Bm7 E7 Am7 D7 Gmaj7 D7'.split(' '),
        melody: bars(`
          r:2 B4:2 D5:4 G5:6 F#5:2 | E5:4 D5:2 B4:2 G4:4 r:4 |
          C5:4 E5:4 A5:4 G5:4 | F#5:6 E5:2 D5:4 r:4 |
          B4:2 D5:2 G5:4 A5:4 B5:4 | A5:4 F#5:4 D5:6 r:2 |
          E5:6 D5:2 C5:4 G4:4 | A4:4 C5:4 D5:6 r:2 |
          D5:6 B4:2 G4:4 B4:4 | E5:4 G5:4 B5:4 A5:4 |
          G5:4 E5:4 C5:4 E5:4 | D5:6 F#5:2 A5:6 r:2 |
          B4:4 D5:4 F#5:4 D5:4 | G#4:4 B4:4 E5:6 D5:2 |
          C5:4 E5:4 A5:4 E5:4 | D5:8 C5:4 A4:4 |
          E5:4 G5:4 C6:6 B5:2 | Eb5:4 G5:4 C6:4 Bb5:4 |
          D5:4 F#5:4 B5:6 A5:2 | G#5:4 E5:4 B4:6 r:2 |
          C5:4 E5:4 A5:4 C6:4 | B5:4 A5:4 F#5:4 D5:4 |
          B4:4 D5:4 G5:8 | F#5:4 E5:4 D5:4 r:4`),
        sections: [
          { from: 0, lead: [['epiano', 0.22]], pad: 0.025, arp: null, stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.65 },
          { from: 8, lead: [['flute', 0.17]], pad: 0.028, arp: null, stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.70 },
          { from: 16, lead: [['marimba', 0.16], ['epiano', 0.07]], pad: 0.030, arp: null, stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.60 },
        ],
      },
      result: {
        title: 'ナイスラウンド！', bpm: 92, style: 'bossa', mix: 0.9,
        chords: 'Gmaj7 Bm7 Cmaj7 D7 Gmaj7 Em7 Am7 D7 Cmaj7 Cm7 Bm7 E7 Am7 D7 Gmaj7 D7'.split(' '),
        melody: [...titleA, ...titleBridge],
        sections: [
          { from: 0, lead: [['epiano', 0.19], ['glock', 0.045]], pad: 0.03, arp: null, stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.45 },
          { from: 8, lead: [['flute', 0.15], ['epiano', 0.07]], pad: 0.03, arp: null, stabs: 0, drums: 1, bass: 'softbass', drumLevel: 0.50 },
        ],
      },
    },
    refinements: {
      course: { title: 'フェアウェイ・クルージング', melodyShift: -12, mix: 0.85 },
      challenge: { title: 'ピンをねらえ！', melodyShift: -12, mix: 0.78 },
      putt: { title: 'グリーンのそよ風', melodyShift: -12, mix: 0.88 },
    },
  };
})();
