/**
 * The game's background music, written out as data: a few short original
 * scores, and per-room arrangements of them that src/audio/music.js renders
 * into seamless loops. Pure (no Web Audio), so test/_verify_music.mjs can
 * check every bar adds up in Node.
 *
 * A score is one chord per bar plus a melody, bars separated by `|`. Melody
 * tokens are `<note>:<beats>` (`E5:1.5`, `Bb4:.5`) or rests (`r:1`), and each
 * bar's beats must add up to the score's `beatsPerBar`.
 */
export const SCORES = {
  // The main theme: a lopsided big-top waltz in C. A, A' (wandering off into
  // a wistful F minor), a darker B in A minor, then A again with a turnaround
  // that leads straight back into bar 1, so the loop never cadences to a stop.
  circus: {
    beatsPerBar: 3,
    chords: `
      C C G7 G7 G7 G7 C C
      C C C7 F F Fm C G7
      Am Am E7 E7 Dm Am Dm G7
      C C G7 G7 G7 G7 C G7`,
    melody: `
      E5:1.5 D#5:.5 E5:1 | G5:2 E5:1 | F5:1.5 E5:.5 F5:1 | D5:2 G4:1 |
      F5:1.5 E5:.5 F5:1 | A5:2 F5:1 | E5:1 G5:1 C6:1 | C6:2 r:1 |
      E5:1.5 D#5:.5 E5:1 | G5:2 E5:1 | G5:1 Bb5:1 G5:1 | A5:2 F5:1 |
      A5:1 G#5:1 A5:1 | Ab5:2 F5:1 | E5:1.5 D5:.5 C5:1 | D5:2 r:1 |
      A5:1.5 G#5:.5 A5:1 | C6:2 A5:1 | B5:1.5 A5:.5 G#5:1 | E5:2 D5:1 |
      F5:1.5 E5:.5 F5:1 | E5:1 A5:1 C6:1 | D6:1 C6:1 A5:1 | B5:1 G5:1 F5:1 |
      E5:1.5 D#5:.5 E5:1 | G5:2 E5:1 | F5:1.5 E5:.5 F5:1 | D5:2 G4:1 |
      B4:1 D5:1 F5:1 | A5:1 G5:1 F5:1 | E5:1 G5:1 C6:1 | B5:1 G5:1 F5:.5 D5:.5`,
  },
  // The same theme gone wrong, for the maze: C minor, and the second half
  // drifts somewhere it shouldn't (B natural over A flat).
  circusMinor: {
    beatsPerBar: 3,
    chords: `
      Cm Cm G7 G7 G7 G7 Cm Cm
      Ab Ab Fm Fm Cm Ab G7 G7`,
    melody: `
      Eb5:1.5 D5:.5 Eb5:1 | G5:2 Eb5:1 | F5:1.5 Eb5:.5 F5:1 | D5:2 G4:1 |
      F5:1.5 Eb5:.5 F5:1 | Ab5:2 F5:1 | Eb5:1 G5:1 C6:1 | C6:2 r:1 |
      C6:1.5 B5:.5 C6:1 | Ab5:2 Eb5:1 | F5:1.5 E5:.5 F5:1 | Ab5:2 F5:1 |
      G5:1 Eb5:1 C5:1 | C5:1 Eb5:1 Ab5:1 | G5:1 F5:1 D5:1 | B4:2 D5:1`,
  },
  // Ribbit's room: a slow music-box lullaby in A minor, ending on the
  // dominant so it rocks straight back to the start.
  lullaby: {
    beatsPerBar: 3,
    chords: `
      Am F C G Am F E E
      F G Em Am Dm E Am E`,
    melody: `
      A4:1 C5:1 E5:1 | F5:2 E5:1 | E5:1.5 D5:.5 C5:1 | D5:3 |
      A4:1 C5:1 E5:1 | A5:2 G5:1 | G#5:1.5 F#5:.5 E5:1 | E5:3 |
      A5:1.5 G5:.5 F5:1 | G5:1.5 F5:.5 D5:1 | E5:1.5 D5:.5 B4:1 | C5:2 A4:1 |
      D5:1 F5:1 A5:1 | G#5:2 B5:1 | A5:2 E5:1 | D5:1 B4:1 G#4:1`,
  },
  // Kaufmo's room (Level 2's timed photo search): a hurried, fidgety polka
  // in D minor, all staccato eighths and chromatic slips.
  polka: {
    beatsPerBar: 2,
    chords: `
      Dm Dm A7 A7 A7 A7 Dm Dm
      Dm Dm Gm Gm Dm A7 Dm Dm
      F F C7 C7 F F A7 A7
      Dm Dm A7 A7 Gm A7 Dm A7`,
    melody: `
      A4:.5 D5:.5 F5:.5 D5:.5 | A5:.5 G#5:.5 A5:.5 r:.5 | G5:.5 E5:.5 C#5:.5 E5:.5 | A4:.5 r:.5 A4:.5 r:.5 |
      G5:.5 F5:.5 E5:.5 C#5:.5 | E5:.5 D5:.5 C#5:.5 A4:.5 | D5:.5 F5:.5 A5:.5 D6:.5 | D6:.5 C#6:.5 D6:.5 r:.5 |
      A4:.5 D5:.5 F5:.5 D5:.5 | A5:.5 G#5:.5 A5:.5 r:.5 | Bb5:.5 A5:.5 G5:.5 D5:.5 | G5:.5 Bb4:.5 D5:.5 G5:.5 |
      F5:.5 E5:.5 D5:.5 A4:.5 | C#5:.5 E5:.5 G5:.5 Bb5:.5 | A5:.5 F5:.5 D5:.5 F5:.5 | D5:.5 r:1.5 |
      C5:.5 F5:.5 A5:.5 F5:.5 | C6:.5 B5:.5 C6:.5 r:.5 | Bb5:.5 G5:.5 E5:.5 G5:.5 | C5:.5 r:.5 C5:.5 r:.5 |
      A5:.5 G5:.5 F5:.5 A5:.5 | C6:.5 A5:.5 F5:.5 C5:.5 | E5:.5 F5:.5 G5:.5 A5:.5 | Bb5:.5 A5:.5 G5:.5 E5:.5 |
      A4:.5 D5:.5 F5:.5 D5:.5 | A5:.5 G#5:.5 A5:.5 r:.5 | G5:.5 E5:.5 C#5:.5 E5:.5 | A4:.5 r:.5 A4:.5 r:.5 |
      Bb4:.5 D5:.5 G5:.5 Bb5:.5 | A5:.5 G5:.5 E5:.5 C#5:.5 | D5:.5 F5:.5 A5:.5 F5:.5 | E5:.5 G5:.5 E5:.5 C#5:.5`,
  },
};

/**
 * How each score is played. Parts: `instrument` (see INSTRUMENTS in
 * music.js), `play` (the melody or an accompaniment pattern below), `gain`
 * (balance within the track; music.js levels whole tracks against each
 * other), `transpose` in semitones, `length` (fraction of each note's
 * written length actually held, < 1 for detached playing), `bars` ([from,
 * to) to play only part of the loop), and `tone` (overrides for the
 * instrument's settings). `reverb` is [seconds, wet mix]; `wobble` is a slow
 * whole-track pitch drift, [cycles per second, cents].
 */
export const TRACKS = {
  // Pomni's room: the theme on a music box, as if it had always been hers.
  musicBox: {
    score: 'circus', bpm: 104, reverb: [1.6, .2],
    parts: [
      { instrument: 'musicBox', play: 'melody', transpose: 12, gain: .55 },
      { instrument: 'musicBox', play: 'oom', transpose: 12, gain: .32 },
      { instrument: 'musicBox', play: 'pah', transpose: 12, gain: .12 },
    ],
  },
  // The Dorm Hall: a lonely organ a long way down the corridor.
  hall: {
    score: 'circus', bpm: 116, reverb: [3, .38],
    parts: [
      { instrument: 'organ', play: 'melody', gain: .36, length: .95 },
      { instrument: 'glock', play: 'melody', transpose: 12, gain: .12, bars: [16, 24] },
      { instrument: 'tuba', play: 'oom', gain: .3 },
      { instrument: 'pad', play: 'pad', gain: .1 },
    ],
  },
  // The Circus Lobby: the full calliope, oom-pah-pah and all.
  bigTop: {
    score: 'circus', bpm: 152, reverb: [2.2, .24],
    parts: [
      { instrument: 'calliope', play: 'melody', gain: .42, length: .9 },
      { instrument: 'glock', play: 'melody', transpose: 12, gain: .15, bars: [24, 32] },
      { instrument: 'tuba', play: 'oom', gain: .5 },
      { instrument: 'reed', play: 'pah', gain: .13, length: .5 },
    ],
  },
  // The maze: the theme in minor, slowed down, its pipes badly out of tune
  // and the whole thing sagging in pitch like a stretched tape.
  maze: {
    score: 'circusMinor', bpm: 88, reverb: [3.2, .45], wobble: [.21, 28],
    parts: [
      { instrument: 'calliope', play: 'melody', gain: .36, tone: { detune: 22 } },
      { instrument: 'musicBox', play: 'melody', transpose: 12, gain: .18, bars: [8, 16] },
      { instrument: 'tuba', play: 'oom', gain: .26 },
      { instrument: 'pad', play: 'pad', gain: .1 },
      { instrument: 'drone', play: 'drone', notes: [36, 43], gain: .2 },
    ],
  },
  lullaby: {
    score: 'lullaby', bpm: 72, reverb: [2.4, .3],
    parts: [
      { instrument: 'musicBox', play: 'melody', transpose: 12, gain: .5 },
      { instrument: 'pluck', play: 'arp', gain: .45 },
      { instrument: 'pad', play: 'pad', gain: .08 },
    ],
  },
  // Kaufmo's room, with his clock ticking along in time.
  polka: {
    score: 'polka', bpm: 138, reverb: [1.2, .16],
    parts: [
      { instrument: 'reed', play: 'melody', gain: .4, length: .55 },
      { instrument: 'pluck', play: 'melody', transpose: -12, gain: .16, bars: [16, 32] },
      { instrument: 'tuba', play: 'oom', gain: .45 },
      { instrument: 'pluck', play: 'pah', gain: .2, length: .4 },
      // Clicks are brief, so this measures quiet even when it's clearly heard.
      { instrument: 'tick', play: 'tickTock', gain: 2.5 },
    ],
  },
};

/** Which track plays in each room (the keys of ROOM_LOADERS in main.js). */
export const ROOM_TRACKS = {
  pomni: 'musicBox',
  dorm: 'hall',
  tadc: 'bigTop',
  ribbit: 'lullaby',
  kaufmo: 'polka',
  maze: 'maze',
};

const PITCH_CLASSES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTALS = { '#': 1, b: -1, '': 0 };
const CHORD_SHAPES = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6],
};

/** `'C#5'` -> 73 (MIDI note number), or null if it isn't a note. */
export function parseNote(name) {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!match) return null;
  return 12 * (Number(match[3]) + 1) + PITCH_CLASSES[match[1]] + ACCIDENTALS[match[2] ?? ''];
}

/** `'G7'` -> { root: 7, intervals: [0, 4, 7, 10] }, or null. */
export function parseChord(symbol) {
  const match = /^([A-G])(#|b)?(maj7|m7|dim|m|7)?$/.exec(symbol);
  if (!match) return null;
  return {
    root: (PITCH_CLASSES[match[1]] + ACCIDENTALS[match[2] ?? ''] + 12) % 12,
    intervals: CHORD_SHAPES[match[3] ?? ''],
  };
}

/**
 * A score split into bars: `[{ chord, notes: [{ beat, beats, midi|null }] }]`
 * (beat counted from the start of the bar, midi null for a rest), plus any
 * mistakes found, so a mistyped edit shows up in the test rather than as a
 * bar that silently drifts out of time.
 */
export function parseScore(score) {
  const problems = [];
  const chords = score.chords.trim().split(/\s+/);
  const melodyBars = score.melody.trim().split('|').map((bar) => bar.trim()).filter(Boolean);
  if (chords.length !== melodyBars.length) {
    problems.push(`${chords.length} chords but ${melodyBars.length} melody bars`);
  }
  const bars = chords.map((symbol, index) => {
    const chord = parseChord(symbol);
    if (!chord) problems.push(`bar ${index + 1}: unknown chord "${symbol}"`);
    let beat = 0;
    const notes = (melodyBars[index] ?? '').split(/\s+/).filter(Boolean).map((token) => {
      const [name, length] = token.split(':');
      const beats = Number(length);
      const midi = name === 'r' ? null : parseNote(name);
      if (name !== 'r' && midi === null) problems.push(`bar ${index + 1}: unknown note "${name}"`);
      if (!(beats > 0)) problems.push(`bar ${index + 1}: bad length in "${token}"`);
      const note = { beat, beats, midi };
      beat += beats;
      return note;
    });
    if (Math.abs(beat - score.beatsPerBar) > 1e-9) {
      problems.push(`bar ${index + 1}: ${beat} beats, expected ${score.beatsPerBar}`);
    }
    return { chord: chord ?? { root: 0, intervals: [0] }, notes };
  });
  return { bars, problems };
}

// The lowest MIDI note at or above `low` with this pitch class, which keeps
// each accompaniment part in its own register whatever the chord's root.
const above = (pitchClass, low) => low + ((((pitchClass - low) % 12) + 12) % 12);
const chordTones = ({ root, intervals }, low) => intervals.map((step) => above(root + step, low)).sort((a, b) => a - b);

// Each returns the notes one accompaniment part plays over one bar:
// [{ beat, beats, midi, velocity }], beat counted from the start of the bar.
const PATTERNS = {
  melody: (bar) => bar.notes.filter((note) => note.midi !== null).map((note) => ({ ...note, velocity: 1 })),
  // The "oom": bass on the downbeat, root and fifth on alternate bars (in
  // 2/4, both in every bar, polka style).
  oom: (bar, index, beatsPerBar) => {
    const root = above(bar.chord.root, 40);
    const fifth = above(bar.chord.root + 7, 40);
    if (beatsPerBar === 2) {
      return [{ beat: 0, beats: .45, midi: root, velocity: 1 }, { beat: 1, beats: .45, midi: fifth, velocity: .85 }];
    }
    return [{ beat: 0, beats: .9, midi: index % 2 ? fifth : root, velocity: 1 }];
  },
  // The "pah-pah": short chords on the offbeats.
  pah: (bar, index, beatsPerBar) => {
    const beats = beatsPerBar === 2 ? [.5, 1.5] : [1, 2];
    return beats.flatMap((beat, i) => chordTones(bar.chord, 55)
      .map((midi) => ({ beat, beats: .9, midi, velocity: i ? .7 : .8 })));
  },
  pad: (bar, index, beatsPerBar) => chordTones(bar.chord, 52)
    .map((midi) => ({ beat: 0, beats: beatsPerBar, midi, velocity: .8 })),
  // A rocking broken chord in eighths: low root, fifth, then the chord an
  // octave up, peaking on the fifth and falling back to the third.
  arp: (bar, index, beatsPerBar) => {
    const root = above(bar.chord.root, 45);
    const third = root + bar.chord.intervals[1];
    const fifth = root + 7;
    const shape = [root, fifth, root + 12, third + 12, fifth + 12, third + 12];
    return Array.from({ length: beatsPerBar * 2 }, (_, i) => ({
      beat: i / 2, beats: .5, midi: shape[i % shape.length], velocity: i ? .7 : 1,
    }));
  },
  // A clock: a higher "tick" on even beats, a lower "tock" on odd ones.
  tickTock: (bar, index, beatsPerBar) => Array.from({ length: beatsPerBar }, (_, beat) => ({
    beat, beats: .1, midi: (index * beatsPerBar + beat) % 2 ? 95 : 100, velocity: 1,
  })),
};

/**
 * Lays a track out as timed notes, ready to synthesize.
 * @param {string} key - a key of TRACKS
 * @returns {{ loopSeconds: number, reverb: [number, number], wobble?: [number, number],
 *   parts: object[], notes: { part: number, time: number, duration: number, midi: number, velocity: number }[],
 *   problems: string[] }}
 */
export function arrangeTrack(key) {
  const track = TRACKS[key];
  const score = SCORES[track.score];
  const { bars, problems } = parseScore(score);
  const secondsPerBeat = 60 / track.bpm;
  const loopSeconds = bars.length * score.beatsPerBar * secondsPerBeat;
  const notes = [];
  track.parts.forEach((part, partIndex) => {
    if (part.play === 'drone') {
      // Held for the whole loop; music.js makes it wrap without a seam.
      for (const midi of part.notes) notes.push({ part: partIndex, time: 0, duration: loopSeconds, midi, velocity: 1 });
      return;
    }
    const pattern = PATTERNS[part.play];
    if (!pattern) {
      problems.push(`${key}: unknown pattern "${part.play}"`);
      return;
    }
    const [from, to] = part.bars ?? [0, bars.length];
    for (let index = from; index < to && index < bars.length; index++) {
      for (const note of pattern(bars[index], index, score.beatsPerBar)) {
        notes.push({
          part: partIndex,
          time: (index * score.beatsPerBar + note.beat) * secondsPerBeat,
          duration: note.beats * (part.length ?? .92) * secondsPerBeat,
          midi: note.midi + (part.transpose ?? 0),
          velocity: note.velocity,
        });
      }
    }
  });
  return { loopSeconds, reverb: track.reverb, wobble: track.wobble, parts: track.parts, notes, problems };
}
