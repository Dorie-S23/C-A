// The cast, animated along the bottom of the loading screen (the overlay
// while it has its `loading` class). Each is a sprite sheet in
// public/models/game screens/sprites, a grid of equal frames read left to
// right, top to bottom; `frames` can stop short of a full grid (an
// unfinished last row). `sequence`, if given, is the order to play frames
// in (numbered from 0 the same way): a frame can repeat to hold it, or be
// left out. To add a character, drop its sheet in that folder and add a
// line here.

const DIR = './models/game%20screens/sprites/';

const CAST = [
  // Hold the speaking-arm pose for a few extra beats so Caine's short sheet
  // doesn't snap through the gesture while the rest of the cast is running.
  { sheet: 'caine.png', columns: 3, rows: 3, frames: 8, sequence: [0, 1, 2, 3, 4, 4, 4, 5, 6, 7] },
  { sheet: 'pomni.png', columns: 5, rows: 4, frames: 17 },
  // Frame 1 is drawn smaller and lower than the rest: a dip that read as a
  // second jump each loop. Skipped.
  { sheet: 'ragatha.png', columns: 3, rows: 3, frames: 9, sequence: [0, 2, 3, 4, 5, 6, 7, 8] },
  { sheet: 'jax-spritesheet.png', columns: 5, rows: 5, frames: 22 },
  { sheet: 'gangle.png', columns: 4, rows: 3, frames: 12 },
  { sheet: 'zooble.png', columns: 4, rows: 3, frames: 10 },
  { sheet: 'kinger.png', columns: 4, rows: 3, frames: 11 },
];

const FPS = 12;
const HEIGHT = 'min(20vh, 170px)'; // every character drawn this tall

/** Adds the parade to the overlay and runs it while the overlay is loading. */
export function createLoadingSprites(overlay) {
  const parade = document.createElement('div');
  parade.id = 'loading-parade';
  parade.classList.add('around-screen');
  parade.setAttribute('aria-hidden', 'true');
  overlay.append(parade);

  const actors = CAST.map((entry, index) => {
    const el = document.createElement('div');
    el.className = 'loading-sprite';
    parade.append(el);
    const sequence = entry.sequence ?? Array.from({ length: entry.frames }, (_, i) => i);
    // Start each runner on a different part of its cycle so the whole row
    // doesn't march in sync.
    const step = (index * 2) % sequence.length;
    const actor = { ...entry, el, sequence, step, frame: sequence[step] };
    // Sized from the sheet itself, once it's loaded: each frame keeps its
    // own proportions at the shared height.
    const image = new Image();
    image.onload = () => {
      const cellWidth = image.naturalWidth / entry.columns;
      const cellHeight = image.naturalHeight / entry.rows;
      el.style.aspectRatio = `${cellWidth} / ${cellHeight}`;
      el.style.backgroundImage = `url("${DIR}${entry.sheet}")`;
      el.style.backgroundSize = `${entry.columns * 100}% ${entry.rows * 100}%`;
      show(actor);
    };
    image.src = `${DIR}${entry.sheet}`;
    return actor;
  });
  parade.style.setProperty('--sprite-height', HEIGHT);

  function show(actor) {
    const column = actor.frame % actor.columns;
    const row = Math.floor(actor.frame / actor.columns);
    // Percentages in background-position count across the leftover space,
    // so frame n of N sits at n / (N - 1).
    const x = actor.columns > 1 ? (column / (actor.columns - 1)) * 100 : 0;
    const y = actor.rows > 1 ? (row / (actor.rows - 1)) * 100 : 0;
    actor.el.style.backgroundPosition = `${x}% ${y}%`;
  }

  // Only ticks while the loading screen is actually up.
  let last = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (!overlay.classList.contains('loading') || overlay.classList.contains('hidden')) return;
    if (now - last < 1000 / FPS) return;
    last = now;
    for (const actor of actors) {
      actor.step = (actor.step + 1) % actor.sequence.length;
      actor.frame = actor.sequence[actor.step];
      show(actor);
    }
  }
  requestAnimationFrame(tick);
}
