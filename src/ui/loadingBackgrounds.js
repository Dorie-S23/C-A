// The loading screen's background picture: a different one from
// public/models/game screens/Loading screen each time the loading screen
// comes up, and the next one every CHANGE_SECONDS while it stays up (long
// loads). Each drifts in its own random
// direction. index.html's #overlay.loading::before draws --loading-image,
// moving it by --drift-x/--drift-y.
//
// The pictures are simply every image in that folder (listed by the
// loading-pictures plugin in vite.config.js): add or delete files there and
// they're in or out, no code change. One that fails to load is skipped
// rather than leaving the screen blank. On a light
// picture the text goes dark (the overlay's `loading-dark-text` class):
// each picture's brightness is measured once, as it loads.

import PICTURES from 'virtual:loading-pictures'; // full URLs, in file-name order

const CHANGE_SECONDS = 6;
const DRIFT = 8; // percent of the screen each way; index.html's inset (-16%) leaves room for it
const LIGHT_ABOVE = 0.6; // average brightness (0 black - 1 white) past which a picture gets dark text

/** Average perceived brightness of an image, 0-1, from a small copy of it. */
function brightness(image) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 24, 24);
  const data = ctx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 4) / 255;
}

export function createLoadingBackgrounds(overlay) {
  // Fetched up front, so a picture is ready the moment it's shown; only the
  // ones that actually load are used.
  const ready = [];
  const light = new Set();
  for (const picture of PICTURES) {
    const image = new Image();
    image.onload = () => {
      ready.push(picture);
      if (brightness(image) > LIGHT_ABOVE) light.add(picture);
    };
    image.onerror = () => console.warn(`Loading screen picture missing: ${picture}`);
    image.src = picture;
  }

  // In the list's order, from a random start: every picture comes round in
  // turn, skipping any that failed.
  let last = null;
  let index = Math.floor(Math.random() * PICTURES.length);
  const showNext = () => {
    if (!ready.length) return; // nothing loaded (yet): the overlay's plain background
    for (let tries = 0; tries < PICTURES.length; tries++) {
      index = (index + 1) % PICTURES.length;
      if (ready.includes(PICTURES[index])) break;
    }
    last = PICTURES[index];
    overlay.style.setProperty('--loading-image', `url("${last}")`);
    overlay.classList.toggle('loading-dark-text', light.has(last));
    const angle = Math.random() * Math.PI * 2;
    overlay.style.setProperty('--drift-x', `${(Math.cos(angle) * DRIFT).toFixed(2)}%`);
    overlay.style.setProperty('--drift-y', `${(Math.sin(angle) * DRIFT).toFixed(2)}%`);
  };

  let timer = null;
  const loading = () => overlay.classList.contains('loading') && !overlay.classList.contains('hidden');
  new MutationObserver(() => {
    if (loading() && timer === null) {
      showNext();
      timer = setInterval(showNext, CHANGE_SECONDS * 1000);
    } else if (!loading() && timer !== null) {
      clearInterval(timer);
      timer = null;
      overlay.classList.remove('loading-dark-text'); // the room picker, pause menu etc. stay light-on-dark
    }
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

}
