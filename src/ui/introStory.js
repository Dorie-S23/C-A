import { INTRO_PANELS } from '../data/introStory.js';

// The intro story's player: one panel at a time, full screen, drifting
// slowly while the narrator reads its caption, with a glitch cut between
// panels (index.html's #intro-story styles). It starts and ends on black,
// so it slots between the title screen's fade into the tent and the dark
// bedroom of Pomni's opening.
//
// The caption types along with the narration clip when there is one
// (voicePlayer.progress), and at TYPE_CPS otherwise — clips not recorded
// yet, or voice volume at 0 — so the story never waits on audio. Each
// panel moves on by itself once its line has been said (or had time to be
// read); Space, Enter or a click finishes the caption, then turns the
// page. Escape or the Skip button ends the whole story.

const FADE_IN = 1;        // seconds from black to the first panel
const GLITCH = 0.45;      // the cut between panels (index.html's intro-glitch keyframes)
const FADE_OUT = 1.4;     // seconds back to black after the last panel
const TYPE_CPS = 32;      // typing speed, characters per second, without a clip to follow
const READ_CPS = 14;      // reading speed: how long an unvoiced caption stays up
const MIN_READ = 4.5;     // …but never less than this, seconds
const HOLD = 1.2;         // seconds a panel stays after its line ends
// Each panel drifts from a different corner (percent of the frame).
const DRIFTS = [[-3, 2], [3, -2], [-2, -3], [3, 2], [0, -3]];

/** Seconds an unvoiced caption stays up before the next panel. */
export function readSeconds(text) {
  return Math.max(MIN_READ, text.length / READ_CPS);
}

/**
 * @param {{ root: HTMLElement, voice: ReturnType<import('../audio/voicePlayer.js').createVoicePlayer>,
 *   panels?: readonly { image: string, text: string, speaker: string }[] }} options
 */
export function createIntroStory({ root, voice, panels = INTRO_PANELS }) {
  const frame = root.querySelector('.intro-frame');
  const image = root.querySelector('.intro-image');
  const caption = root.querySelector('.intro-caption');
  const captionText = root.querySelector('.intro-caption-text');
  const skipButton = root.querySelector('.intro-skip');

  let active = false;
  let onDone = null;
  let index = 0;
  let phase = 'idle'; // enter → telling → hold, per panel; then ending
  let time = 0;       // seconds into the current phase
  let shown = 0;      // fraction of the caption typed so far
  let voiced = false; // whether a clip is playing for this panel

  // Fetched up front, so each panel is there the moment it's cut to.
  if (typeof Image === 'function') for (const panel of panels) new Image().src = panel.image;

  function enter(next) {
    index = next;
    const panel = panels[index];
    const [dx, dy] = DRIFTS[index % DRIFTS.length];
    image.src = panel.image;
    image.style.setProperty('--dx', `${dx}%`);
    image.style.setProperty('--dy', `${dy}%`);
    // Restart the drift (and the glitch) from the top for this panel.
    image.classList.remove('intro-drift');
    frame.classList.remove('intro-glitch');
    void root.offsetWidth;
    image.classList.add('intro-drift');
    if (index > 0) frame.classList.add('intro-glitch');
    caption.hidden = true;
    captionText.textContent = '';
    phase = 'enter';
    time = 0;
  }

  function tell() {
    const panel = panels[index];
    voiced = voice.play(panel.speaker, panel.text);
    caption.hidden = false;
    shown = 0;
    phase = 'telling';
    time = 0;
  }

  function turnPage() {
    voice.stop();
    if (index + 1 < panels.length) {
      enter(index + 1);
    } else {
      phase = 'ending';
      time = 0;
      root.classList.add('intro-dark');
    }
  }

  function finish() {
    if (!active) return;
    active = false;
    phase = 'idle';
    voice.stop();
    root.hidden = true;
    const done = onDone;
    onDone = null;
    done?.();
  }

  /** Space/Enter/click: finish typing the caption, or go on to the next panel. */
  function advance() {
    if (!active) return;
    if (phase === 'telling' && shown < 1) {
      shown = 1;
      captionText.textContent = panels[index].text;
    } else if (phase === 'telling' || phase === 'hold') {
      turnPage();
    }
  }

  function onKeyDown(event) {
    if (!active) return;
    // The game's own keys (the title menu, pause, movement) wait until it's over.
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      advance();
    }
  }

  root.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target.closest?.('.intro-skip')) finish();
    else advance();
  });
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown, true);
  if (typeof document !== 'undefined') {
    // A hidden tab stops the frame loop; keep the narration in step with it.
    document.addEventListener('visibilitychange', () => {
      if (active) voice.setPaused(document.hidden);
    });
  }

  return {
    get active() { return active; },

    /** Plays the story from the first panel; `done` runs when it ends or is skipped. */
    play(done) {
      onDone = done;
      active = true;
      root.hidden = false;
      root.classList.add('intro-dark');
      skipButton.hidden = false;
      enter(0);
    },

    /** Ends the story now, as Escape and the Skip button do. */
    skip: finish,

    /** Advances the story by `delta` seconds; called every frame from main.js. */
    update(delta) {
      if (!active) return;
      time += delta;
      const panel = panels[index];

      if (phase === 'enter') {
        if (index === 0) root.classList.remove('intro-dark'); // fades up from black
        if (time >= (index === 0 ? FADE_IN : GLITCH)) {
          frame.classList.remove('intro-glitch');
          tell();
        }
        return;
      }

      if (phase === 'telling') {
        const progress = voiced ? voice.progress() : null;
        shown = Math.max(shown, progress ?? Math.min(1, (time * TYPE_CPS) / panel.text.length));
        captionText.textContent = panel.text.slice(0, Math.round(shown * panel.text.length));
        // A clip that never got going (still null after the reading time) counts as said.
        const said = voiced
          ? progress === 1 || (progress === null && time >= readSeconds(panel.text))
          : time >= readSeconds(panel.text);
        if (shown >= 1 && said) {
          phase = 'hold';
          time = 0;
        }
        return;
      }

      if (phase === 'hold') {
        if (time >= HOLD) turnPage();
        return;
      }

      if (phase === 'ending' && time >= FADE_OUT) finish();
    },
  };
}
