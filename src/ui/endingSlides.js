// The images the ending's conversation plays over (index.html's
// #ending-slides, src/data/endingSlides.js says which is up when). It sits
// under #scene-fade and the dialogue box, so the fades and the text work as
// they do over a room. Two stacked images crossfade, because a cut to the
// next slide mid-conversation reads as a mistake rather than a scene change.
//
// A click anywhere moves the conversation on, as in the intro story.

const PRELOAD_LIMIT_MS = 5000; // a slow download shows late rather than holding the ending on black

/**
 * @param {{ root: HTMLElement, onAdvance: () => void, onSkip: () => void }} options
 * @returns {{ preload: (urls: string[]) => Promise<void>, open: () => void,
 *   show: (url: string) => void, close: () => void }}
 */
export function createEndingSlides({ root, onAdvance, onSkip }) {
  const images = [...root.querySelectorAll('.ending-image')];
  const skipButton = root.querySelector('.ending-skip');
  let front = 0;
  let current = null;

  root.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target === skipButton) onSkip();
    else onAdvance();
  });

  return {
    /** Resolves once they're decoded (or failed, or it's taken too long), so no slide pops in. */
    async preload(urls) {
      const decoded = urls.map((url) => {
        const image = new Image();
        image.src = url;
        return image.decode().catch(() => {}); // a missing slide isn't worth stopping the ending for
      });
      await Promise.race([
        Promise.all(decoded),
        new Promise(resolve => setTimeout(resolve, PRELOAD_LIMIT_MS)),
      ]);
    },

    open() {
      root.hidden = false;
    },

    /** Crossfades to `url`, drifting slowly so a slide held through a long exchange isn't a still. */
    show(url) {
      if (url === current) return;
      current = url;
      const outgoing = images[front];
      front = 1 - front;
      const incoming = images[front];
      incoming.src = url;
      // Restart the drift. The outgoing image keeps its own while it fades out.
      incoming.classList.remove('ending-drift');
      void root.offsetWidth;
      incoming.classList.add('ending-drift', 'ending-shown');
      outgoing.classList.remove('ending-shown');
    },

    close() {
      root.hidden = true;
      current = null;
      for (const image of images) {
        image.classList.remove('ending-drift', 'ending-shown');
        image.removeAttribute('src');
      }
    },
  };
}
