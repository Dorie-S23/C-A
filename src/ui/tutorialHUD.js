import { shouldShowObjective } from './objectiveHUD.js';

const LABELS = { move: 'WASD — Move', look: 'Mouse — Look around',
  run: 'Hold Shift — Run', interact: 'Press E — Interact' };

/**
 * @param {{ tutorial: object, root: HTMLElement, labelFor?: (id: string) => string | null }} options
 *   labelFor: replacement wording for a line (e.g. controller buttons), or
 *   null to keep the keyboard one.
 */
export function createTutorialHUD({ tutorial, root, labelFor = () => null }) {
  const lines = root.querySelector('[data-tutorial-lines]');
  let previous = '';
  return {
    update(context, nearDoor) {
      const hints = shouldShowObjective(context) ? tutorial.hints(nearDoor) : [];
      root.hidden = !hints.length;
      const labels = hints.map(id => labelFor(id) ?? LABELS[id]);
      // Keyed on the wording too, so picking up the controller mid-tutorial
      // swaps the lines over straight away.
      const next = labels.join('\n');
      if (next === previous) return;
      previous = next;
      lines.replaceChildren(...labels.map(text => {
        const line = document.createElement('p');
        line.textContent = text;
        return line;
      }));
    },
    hide() { root.hidden = true; },
  };
}
