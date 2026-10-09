/**
 * Placeholder expression sprites for the dialogue overlay: simple vector
 * faces, swapped per line by mood, standing in for real character art.
 * Only characters with an entry in SPRITES get a drawn face — anyone else
 * (Ragatha, for now) keeps DialogueUI's plain initials-circle fallback.
 *
 * Every mood shares one coordinate system (a 100x100 local face space) so
 * brow/mouth shapes defined once in MOOD_SHAPES work for any character's
 * sprite function, even though each character draws its own head/eyes/hat
 * around them.
 */

const MOOD_SHAPES = {
  neutral: {
    browLeft: 'M24,32 L40,32',
    browRight: 'M60,32 L76,32',
    mouth: 'M38,68 Q50,68 62,68',
    eyeScale: 1,
  },
  happy: {
    browLeft: 'M24,30 L40,33',
    browRight: 'M60,33 L76,30',
    mouth: 'M36,66 Q50,78 64,66',
    eyeScale: 1,
  },
  worried: {
    // Inner corners raised — classic "concerned" brow.
    browLeft: 'M24,34 L40,28',
    browRight: 'M60,28 L76,34',
    mouth: 'M40,70 Q50,66 60,70',
    eyeScale: 1,
  },
  annoyed: {
    // Inner corners lowered, outer corners raised — a "V" toward the nose.
    browLeft: 'M24,28 L40,34',
    browRight: 'M60,34 L76,28',
    mouth: 'M38,70 L62,70',
    eyeScale: 0.85,
  },
  sad: {
    browLeft: 'M24,33 L40,29',
    browRight: 'M60,29 L76,33',
    mouth: 'M38,72 Q50,64 62,72',
    eyeScale: 0.9,
  },
  shocked: {
    browLeft: 'M24,26 L40,24',
    browRight: 'M60,24 L76,26',
    mouth: '', // drawn as an ellipse per-character instead of a stroked path
    eyeScale: 1.3,
  },
};

function shapesFor(mood) {
  return MOOD_SHAPES[mood] ?? MOOD_SHAPES.neutral;
}

/** Pomni: pale jester face, big round goggle-like eyes, dark fringe. */
export function pomniSprite(mood) {
  const f = shapesFor(mood);
  const eyeR = 13 * f.eyeScale;
  const pupilR = mood === 'shocked' ? 3 : 5;
  const mouth = mood === 'shocked'
    ? '<ellipse cx="50" cy="73" rx="7" ry="9" fill="#7a4040"/>'
    : `<path d="${f.mouth}" stroke="#7a4040" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M16,42 Q24,14 50,16 Q76,14 84,42 Q70,22 50,22 Q30,22 16,42 Z" fill="#5a3a2e"/>
    <circle cx="50" cy="54" r="36" fill="#fdfaf5" stroke="#2a2a2a" stroke-width="2.5"/>
    <circle cx="35" cy="48" r="${eyeR}" fill="#fff" stroke="#2a2a2a" stroke-width="2"/>
    <circle cx="65" cy="48" r="${eyeR}" fill="#fff" stroke="#2a2a2a" stroke-width="2"/>
    <circle cx="35" cy="48" r="${pupilR}" fill="#2a2a2a"/>
    <circle cx="65" cy="48" r="${pupilR}" fill="#2a2a2a"/>
    <path d="${f.browLeft}" stroke="#2a2a2a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="${f.browRight}" stroke="#2a2a2a" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${mouth}
  </svg>`;
}

function caineMouth(mood) {
  switch (mood) {
    case 'happy':
      return `<path d="M18,64 Q50,98 82,64 Q50,82 18,64 Z" fill="#7a1020"/>
        <path d="M26,67 L74,67" stroke="#fff" stroke-width="4" stroke-dasharray="6,5" stroke-linecap="round"/>`;
    case 'shocked':
      return '<ellipse cx="50" cy="75" rx="17" ry="19" fill="#7a1020"/>';
    case 'worried':
    case 'sad':
      return '<path d="M30,71 Q50,61 70,71" stroke="#7a1020" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
    case 'annoyed':
      return '<path d="M28,65 Q50,71 72,59" stroke="#7a1020" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
    default:
      return '<path d="M26,66 Q50,78 74,66 Q50,73 26,66 Z" fill="#7a1020"/>';
  }
}

/** Caine: top hat, mismatched round eyes, and a mouth that dominates the face. */
export function caineSprite(mood) {
  const f = shapesFor(mood);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="32" y="1" width="36" height="19" fill="#1a1414"/>
    <rect x="23" y="18" width="54" height="7" rx="2" fill="#1a1414"/>
    <circle cx="50" cy="57" r="37" fill="#e7b8c4" stroke="#2a1414" stroke-width="2.5"/>
    <circle cx="36" cy="45" r="${8 * f.eyeScale}" fill="#fff" stroke="#2a1414" stroke-width="2"/>
    <circle cx="64" cy="45" r="${8 * f.eyeScale}" fill="#fff" stroke="#2a1414" stroke-width="2"/>
    <circle cx="36" cy="45" r="4" fill="#3f7fd9"/>
    <circle cx="64" cy="45" r="4" fill="#3fbf6f"/>
    <path d="${f.browLeft}" stroke="#2a1414" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="${f.browRight}" stroke="#2a1414" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${caineMouth(mood)}
  </svg>`;
}

export const SPRITES = {
  pomni: pomniSprite,
  caine: caineSprite,
};

export const MOODS = Object.keys(MOOD_SHAPES);
