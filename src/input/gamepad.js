/**
 * Controller support, layered on top of the keyboard and mouse.
 *
 * Buttons are translated into the key events the game already listens for
 * (A = Space, X = E, ...), so every existing handler (dialogue choices, the
 * title menu, interact, jump, the hint panel) works with a controller
 * without knowing it exists. Only what keys can't express goes through this
 * module's own state: analog movement and look from the sticks, sprint, and
 * moving focus between the buttons of the HTML menus.
 *
 * The Gamepad API has no events for buttons, so `update` polls it once a
 * frame from the main loop.
 */

// Standard Gamepad mapping (w3c.github.io/gamepad/#remapping), Xbox names.
// PlayStation pads report the same indices: A = Cross, X = Square.
const BUTTON = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, BACK: 8, START: 9, L3: 10,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

// Worn sticks rest a little off centre; anything inside this is ignored.
const DEADZONE = 0.18;
// In menus a stick counts as a d-pad press once pushed this far.
const NAV_THRESHOLD = 0.6;
// Holding a direction in a menu repeats it, like a held arrow key.
const NAV_REPEAT_DELAY = 0.4;
const NAV_REPEAT_INTERVAL = 0.12;

// Which key each button stands in for, per mode (see createGamepadInput).
// In play the d-pad steers like the arrow keys, held for as long as it is.
const KEY_BINDINGS = {
  play: {
    [BUTTON.A]: 'Space',
    [BUTTON.X]: 'KeyE',
    [BUTTON.Y]: 'KeyV',
    [BUTTON.B]: 'KeyX',
    [BUTTON.RB]: 'KeyT',
    [BUTTON.BACK]: 'KeyH',
    [BUTTON.UP]: 'ArrowUp',
    [BUTTON.DOWN]: 'ArrowDown',
    [BUTTON.LEFT]: 'ArrowLeft',
    [BUTTON.RIGHT]: 'ArrowRight',
  },
  dialogue: { [BUTTON.A]: 'Space', [BUTTON.B]: 'Escape' },
  title: { [BUTTON.A]: 'Enter', [BUTTON.B]: 'Escape' },
  cinematic: {},
  menu: { [BUTTON.B]: 'Escape' },
};

const KEY_VALUES = {
  Space: ' ', Enter: 'Enter', Escape: 'Escape', KeyE: 'e', KeyV: 'v', KeyX: 'x', KeyT: 't', KeyH: 'h',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
};

// What each stood-in key is called on the pad, for on-screen prompts:
// [Xbox, PlayStation]. Keys missing here are shown as themselves.
const BUTTON_LABELS = {
  Space: ['A', '✕'], KeyE: ['X', '□'], KeyV: ['Y', '△'], KeyX: ['B', '○'],
  KeyT: ['RB', 'R1'], KeyH: ['View', 'Create'], Escape: ['B', '○'], ShiftLeft: ['LB', 'L1'],
};

const NAV_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const NAV_VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * @param {{
 *   mode: () => 'play' | 'dialogue' | 'title' | 'cinematic' | 'menu',
 *   onStart: () => void,
 *   onConfirm?: () => boolean,
 *   onConnect?: (pad: Gamepad) => void,
 * }} options
 *   mode: what the controller is driving this frame.
 *   onStart: the Start button (pause / resume).
 *   onConfirm: A in a menu with no button focused; return true if handled.
 * @returns {{
 *   update: (dt: number) => void,
 *   resetSprint: () => void,
 *   readonly moveX: number, readonly moveY: number,
 *   readonly lookX: number, readonly lookY: number,
 *   readonly sprint: boolean,
 *   readonly active: boolean,
 *   label: (code: string) => string,
 * }} moveX/moveY and lookX/lookY are -1..1 (+Y = stick pulled down), zero
 *   outside play. `active` is true while the controller was the last thing used.
 */
export function createGamepadInput({ mode, onStart, onConfirm = () => false, onConnect }) {
  const previous = [];
  // Button index -> key code it sent a keydown for, so the keyup matches
  // even if the mode changed while the button was held.
  const heldKeys = new Map();
  const move = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  let sprintHeld = false;
  let sprintLatched = false; // clicking the left stick runs until she stops
  let navDirection = null;
  let navTimer = 0;
  let active = false;
  let sony = false;

  window.addEventListener('gamepadconnected', (event) => onConnect?.(event.gamepad));
  window.addEventListener('gamepaddisconnected', () => releaseAll());
  // Back to keyboard prompts as soon as the keyboard or mouse is used.
  const useKeyboard = (event) => { if (event.isTrusted) active = false; };
  window.addEventListener('keydown', useKeyboard, true);
  window.addEventListener('mousedown', useKeyboard, true);

  function connectedPad() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) if (pad?.connected) return pad;
    return null;
  }

  function sendKey(type, code) {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent(type, {
      code, key: KEY_VALUES[code] ?? code, bubbles: true, cancelable: true,
    }));
  }

  function releaseAll() {
    for (const code of heldKeys.values()) sendKey('keyup', code);
    heldKeys.clear();
    previous.length = 0;
    move.x = move.y = look.x = look.y = 0;
    sprintHeld = sprintLatched = false;
    navDirection = null;
  }

  /** Radial deadzone, rescaled so movement starts from zero just outside it. */
  function readStick(x, y, out, curve) {
    const length = Math.hypot(x, y);
    if (length < DEADZONE) {
      out.x = out.y = 0;
      return;
    }
    let scaled = Math.min(1, (length - DEADZONE) / (1 - DEADZONE));
    // Look uses a squared response: small tilts aim finely, full tilt turns fast.
    if (curve) scaled *= scaled;
    out.x = (x / length) * scaled;
    out.y = (y / length) * scaled;
  }

  function isReachable(element) {
    if (element.disabled) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    // Only what is actually on top: a panel covering the menu (credits,
    // options) hides the buttons underneath it from the d-pad too.
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit) && (hit === element || element.contains(hit)
      || (hit.tagName === 'LABEL' && hit.contains(element)));
  }

  function focusElement(element) {
    element.focus({ focusVisible: true });
  }

  /** Moves focus to the nearest reachable control in the pushed direction. */
  function moveFocus(direction) {
    const current = document.activeElement;
    const [dx, dy] = NAV_VECTORS[direction];
    // Sliders take left/right as a value change, as they do with arrow keys.
    if (current?.type === 'range' && dx !== 0 && isReachable(current)) {
      if (dx > 0) current.stepUp(); else current.stepDown();
      current.dispatchEvent(new Event('input', { bubbles: true }));
      current.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const items = [...document.querySelectorAll(FOCUSABLE)].filter(isReachable);
    if (items.length === 0) return;
    if (!items.includes(current)) {
      focusElement(items[0]);
      return;
    }
    const from = current.getBoundingClientRect();
    const fromX = from.left + from.width / 2;
    const fromY = from.top + from.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const item of items) {
      if (item === current) continue;
      const rect = item.getBoundingClientRect();
      const offsetX = rect.left + rect.width / 2 - fromX;
      const offsetY = rect.top + rect.height / 2 - fromY;
      const along = offsetX * dx + offsetY * dy;
      if (along <= 1) continue;
      // Prefer controls straight ahead over closer ones off to the side.
      const score = along + Math.abs(offsetX * dy - offsetY * dx) * 2;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (best) focusElement(best);
  }

  function confirmInMenu() {
    const current = document.activeElement;
    if (current && current !== document.body && current.matches(FOCUSABLE) && isReachable(current)) {
      current.click();
      return;
    }
    if (onConfirm()) return;
    moveFocus('down'); // nothing focused yet: highlight the first control
  }

  function nav(direction, currentMode) {
    if (currentMode === 'menu') moveFocus(direction);
    else if (currentMode === 'dialogue' || currentMode === 'title') {
      sendKey('keydown', NAV_KEYS[direction]);
      sendKey('keyup', NAV_KEYS[direction]);
    }
  }

  function readNavDirection(pad) {
    const pressed = (index) => pad.buttons[index]?.pressed;
    if (pressed(BUTTON.UP)) return 'up';
    if (pressed(BUTTON.DOWN)) return 'down';
    if (pressed(BUTTON.LEFT)) return 'left';
    if (pressed(BUTTON.RIGHT)) return 'right';
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (Math.max(Math.abs(x), Math.abs(y)) < NAV_THRESHOLD) return null;
    if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'up' : 'down';
    return x < 0 ? 'left' : 'right';
  }

  function update(dt) {
    const pad = connectedPad();
    if (!pad) {
      if (heldKeys.size > 0 || previous.length > 0) releaseAll();
      return;
    }
    sony = /054c|playstation|dualsense|dualshock|wireless controller/i.test(pad.id);
    const currentMode = mode();
    const bindings = KEY_BINDINGS[currentMode];

    for (let index = 0; index < pad.buttons.length; index++) {
      const pressed = pad.buttons[index].pressed;
      const was = previous[index] ?? false;
      previous[index] = pressed;
      if (pressed === was) continue;
      if (pressed) active = true;

      if (!pressed) {
        const code = heldKeys.get(index);
        if (code) {
          heldKeys.delete(index);
          sendKey('keyup', code);
        }
        continue;
      }
      if (index === BUTTON.START) {
        onStart();
        continue;
      }
      if (index === BUTTON.L3 && currentMode === 'play') {
        sprintLatched = true;
        continue;
      }
      if (index === BUTTON.A && currentMode === 'menu') {
        confirmInMenu();
        continue;
      }
      const code = bindings[index];
      if (code) {
        heldKeys.set(index, code);
        sendKey('keydown', code);
      }
    }

    if (currentMode === 'play') {
      readStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, move, false);
      readStick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, look, true);
      if (move.x !== 0 || move.y !== 0 || look.x !== 0 || look.y !== 0) active = true;
      sprintHeld = pad.buttons[BUTTON.LB]?.pressed ?? false;
      if (move.x === 0 && move.y === 0) sprintLatched = false;
      navDirection = null;
      return;
    }

    move.x = move.y = look.x = look.y = 0;
    sprintHeld = sprintLatched = false;
    const direction = readNavDirection(pad);
    if (direction !== navDirection) {
      navDirection = direction;
      navTimer = NAV_REPEAT_DELAY;
      if (direction) {
        active = true;
        nav(direction, currentMode);
      }
    } else if (direction) {
      navTimer -= dt;
      if (navTimer <= 0) {
        navTimer = NAV_REPEAT_INTERVAL;
        nav(direction, currentMode);
      }
    }
  }

  return {
    update,
    resetSprint() { sprintLatched = false; },
    get moveX() { return move.x; },
    get moveY() { return move.y; },
    get lookX() { return look.x; },
    get lookY() { return look.y; },
    get sprint() { return sprintHeld || sprintLatched; },
    get active() { return active; },
    /**
     * The name to show for a key in prompts: the key itself ('E', 'T') while
     * the keyboard is in use, or the pad button standing in for it ('X' /
     * '□') once the controller is.
     */
    label(code) {
      const names = active ? BUTTON_LABELS[code] : null;
      if (names) return names[sony ? 1 : 0];
      return code.replace(/^Key/, '');
    },
  };
}
