import { shouldShowObjective } from './objectiveHUD.js';

const LABELS = { move: 'WASD — Move', look: 'Mouse — Look around',
  run: 'Hold Shift — Run', interact: 'Press E — Interact' };

export function createTutorialHUD({ tutorial, root, portraits = [] }) {
  const lines = root.querySelector('[data-tutorial-lines]');
  const portrait = root.querySelector('[data-tutorial-portrait]');
  let portraitIndex = 0;
  let previous = '';
  return {
    update(context, nearDoor) {
      const hints = shouldShowObjective(context) ? tutorial.hints(nearDoor) : [];
      root.hidden = !hints.length;
      const next = hints.join(',');
      if (next === previous) return;
      previous = next;
      if (portrait && portraits.length) {
        portrait.src = portraits[portraitIndex % portraits.length];
        portraitIndex++;
      }
      lines.replaceChildren(...hints.map(id => {
        const line = document.createElement('p');
        line.textContent = LABELS[id];
        return line;
      }));
    },
    hide() { root.hidden = true; },
  };
}
