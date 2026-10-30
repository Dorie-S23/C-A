import { OPENING_SLEEP_SECONDS, OPENING_WAKE_SECONDS } from '../cinematics/pomniOpening.js';
/** Captions follow the same paused clocks as the action; no extra timers/input. */
export function actionCaption({ opening, jaxPass, hidden = false }) {
  if (hidden) return '';
  if (jaxPass?.active) return '';
  if (opening?.phase === 'playing') {
    if (opening.elapsed < OPENING_SLEEP_SECONDS) return 'Snoring…';
    if (opening.elapsed < OPENING_WAKE_SECONDS + 1.2) return 'Knock, knock, knock.';
  }
  return '';
}

export function createActionCaptions({ root } = {}) {
  if (!root) {
    const style = document.createElement('style');
    style.textContent = `.opening-action-caption { position:fixed; z-index:12; left:50%; bottom:clamp(1.5rem,8vh,5rem);
      transform:translateX(-50%); width:max-content; max-width:calc(100vw - 3rem); box-sizing:border-box;
      padding:.7rem 1.1rem; margin:0; border:1px solid #e8bd61; border-radius:10px;
      color:#fff4df; background:rgba(31,17,30,.92); box-shadow:0 3px 15px #0007;
      font:italic clamp(.85rem,1.7vw,1rem)/1.5 system-ui,sans-serif; text-align:center; pointer-events:none; }
      .opening-action-caption[hidden] { display:none; }`;
    document.head.appendChild(style);
    root = document.createElement('p'); root.className = 'opening-action-caption'; root.id = 'action-caption';
    root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite'); root.setAttribute('aria-atomic', 'true');
    root.hidden = true; document.body.appendChild(root);
  }
  return {
    update(context) {
      const text = actionCaption(context);
      root.hidden = !text;
      if (root.textContent !== text) root.textContent = text;
    },
  };
}
