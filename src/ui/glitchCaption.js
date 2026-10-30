// Jax's glitch fragments in the maze: a short line that stutters onto the
// screen (letters skipping, repeating, flashing as garbage) and breaks up
// again, magenta and cyan split. No dialogue box, no name: just the words.
// Built here rather than in index.html so it carries its own look.

const GARBAGE = '#%&/\\|<>_=+*?01';
const STYLE_ID = 'glitch-caption-style';
const CSS = `
#glitch-caption{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);max-width:min(720px,90vw);
  font:600 1.15rem/1.4 ui-monospace,Consolas,monospace;letter-spacing:.06em;color:#e9e4f2;text-align:center;
  text-shadow:-2px 0 rgba(255,46,200,.75),2px 0 rgba(40,240,255,.7);pointer-events:none;z-index:6;opacity:0;
  transition:opacity .25s}
#glitch-caption.is-on{opacity:.92;animation:glitch-caption-jitter .13s steps(2) infinite}
@keyframes glitch-caption-jitter{0%{transform:translate(-50%,0)}50%{transform:translate(calc(-50% + 2px),-1px)}100%{transform:translate(calc(-50% - 1px),1px)}}
`;

/** @returns {{ show(text: string, seconds?: number): void, hide(): void, readonly text: string }} */
export function createGlitchCaption(doc = document) {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID; style.textContent = CSS;
    doc.head.append(style);
  }
  const element = doc.createElement('div');
  element.id = 'glitch-caption';
  element.setAttribute('aria-live', 'polite');
  doc.body.append(element);
  let timer = null, text = '';
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  return {
    get text() { return text; },
    /** Stutters `line` on, holds it, and breaks it up again over `seconds`. */
    show(line, seconds = 3.2) {
      stop();
      text = line;
      element.classList.add('is-on');
      const start = performance.now();
      timer = setInterval(() => {
        const t = (performance.now() - start) / 1000;
        if (t >= seconds) { stop(); element.textContent = ''; element.classList.remove('is-on'); text = ''; return; }
        // On over the first 40%, held, then dropping out over the last 15%.
        const shown = Math.min(1, t / (seconds * 0.4));
        const fading = Math.max(0, (t - seconds * 0.85) / (seconds * 0.15));
        let out = '';
        const count = Math.floor(line.length * shown);
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (i >= count) break;
          if (char === ' ') { out += ' '; continue; }
          const roll = Math.random();
          if (roll < 0.04 + fading * 0.5) out += GARBAGE[Math.floor(Math.random() * GARBAGE.length)];
          else if (roll < 0.06 + fading * 0.3) out += ' ';
          else if (roll < 0.08 && i === count - 1) out += char + char; // a stutter on the newest letter
          else out += char;
        }
        element.textContent = out;
      }, 45);
    },
    hide() { stop(); text = ''; element.textContent = ''; element.classList.remove('is-on'); },
  };
}
