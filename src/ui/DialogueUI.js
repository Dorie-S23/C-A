import { createDialogueEngine } from '../dialogue/dialogueEngine.js';
import { SPRITES } from './portraitSprites.js';
import { ICONS } from './portraitIcons.js';

const TYPE_SPEED_MS = 22;
// With the pointer locked there's no cursor, so mouse movement steps the
// highlighted option instead: one step per this many pixels of travel.
const OPTION_STEP_PX = 60;
const CONTINUE_HINT = 'click or press Space to continue ▾';
const CHOICE_HINT = 'move the mouse or ↑/↓ to pick · click or press Space to choose';

/**
 * Drives the #dialogue overlay in index.html from a script (see
 * src/data/dialogues.js for the node shapes). One instance is created
 * once and reused for every script played during the session — `play()`
 * resets its state each time.
 *
 * Persona-style layout: two portrait slots (left/right) stay populated
 * with whichever speaker last occupied that side, dimming the one not
 * currently talking, with a name + text box anchored at the bottom.
 * Typing reveals text a character at a time; advancing mid-type snaps
 * straight to the full line instead of queuing another step, so mashing
 * the advance key never skips a line.
 */
export function createDialogueUI({ speakers }) {
  const root = document.getElementById('dialogue');
  const box = document.getElementById('dialogue-box');
  const portraitLeft = document.getElementById('dialogue-portrait-left');
  const portraitRight = document.getElementById('dialogue-portrait-right');
  const nameEl = document.getElementById('dialogue-name');
  const directionEl = document.getElementById('dialogue-direction');
  const textEl = document.getElementById('dialogue-text');
  const optionsEl = document.getElementById('dialogue-options');
  const continueEl = document.getElementById('dialogue-continue');

  let engine = null;
  let onComplete = null;
  let onChoice = null;
  let onCancel = null;
  let distressFor = null;
  let onNode = null;
  let leftSpeaker = null;
  let rightSpeaker = null;
  let leftMood = 'neutral';
  let rightMood = 'neutral';
  let typeTimer = null;
  let typing = false;
  let fullText = '';
  let optionButtons = [];
  let highlightedIndex = 0;
  let pointerTravel = 0;

  /**
   * Fills a portrait slot with whichever speaker last occupied that side.
   * Characters with an entry in ICONS show their 2D icon; failing that, an
   * entry in SPRITES gets a drawn face that swaps per line's mood; anyone
   * else falls back to the plain initials circle.
   */
  function renderPortrait(el, speakerId, mood, active) {
    const speaker = speakerId ? speakers[speakerId] : null;
    el.classList.toggle('dialogue-portrait-empty', !speaker);
    el.classList.toggle('dialogue-portrait-active', !!speaker && active);
    el.innerHTML = '';
    if (!speaker) return;
    el.style.setProperty('--portrait-color', speaker.color);

    const icon = ICONS[speakerId];
    const sprite = SPRITES[speakerId];
    const face = document.createElement('div');
    face.className = 'dialogue-portrait-initials';
    if (icon) {
      face.classList.add('dialogue-portrait-icon');
      const img = document.createElement('img');
      img.src = icon;
      img.alt = speaker.name;
      face.append(img);
    } else if (sprite) {
      face.classList.add('dialogue-portrait-sprite');
      face.innerHTML = sprite(mood ?? 'neutral');
    } else {
      face.textContent = speaker.initials;
    }

    const label = document.createElement('div');
    label.className = 'dialogue-portrait-label';
    label.textContent = speaker.name;
    el.append(face, label);
  }

  function stopTyping() {
    clearInterval(typeTimer);
    typeTimer = null;
    typing = false;
  }

  function startTyping(text) {
    stopTyping();
    fullText = text ?? '';
    textEl.textContent = '';
    if (fullText.length === 0) return;
    typing = true;
    let i = 0;
    typeTimer = setInterval(() => {
      i++;
      textEl.textContent = fullText.slice(0, i);
      if (i >= fullText.length) stopTyping();
    }, TYPE_SPEED_MS);
  }

  function highlightOption(i) {
    highlightedIndex = i;
    optionButtons.forEach((button, idx) => {
      button.classList.toggle('dialogue-option-highlighted', idx === i);
    });
  }

  function renderOptions(options) {
    optionsEl.innerHTML = '';
    optionButtons = options.map((option, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dialogue-option';
      button.textContent = option.text;
      button.addEventListener('click', () => selectOption(i));
      button.addEventListener('focus', () => highlightOption(i));
      optionsEl.appendChild(button);
      return button;
    });
    highlightOption(0);
    pointerTravel = 0;
    // Keyboard users land on an already-focused option instead of needing
    // an extra Tab press; mouse users are unaffected since this only moves
    // the invisible focus ring until something is clicked.
    optionButtons[0]?.focus();
  }

  function renderNode() {
    const node = engine.current;
    if (!node) {
      finish();
      return;
    }
    onNode?.(node);

    if (node.type === 'line' && node.side) {
      if (node.side === 'left') {
        leftSpeaker = node.speaker;
        leftMood = node.mood ?? 'neutral';
      } else {
        rightSpeaker = node.speaker;
        rightMood = node.mood ?? 'neutral';
      }
    }

    const activeSide = node.type === 'line' ? node.side : null;
    renderPortrait(portraitLeft, leftSpeaker, leftMood, activeSide === 'left');
    renderPortrait(portraitRight, rightSpeaker, rightMood, activeSide === 'right');

    box.classList.toggle('dialogue-box-beat', node.type === 'beat');
    setDistress(node.type === 'line' && distressFor ? distressFor(node) : 0);
    optionsEl.hidden = true;
    continueEl.textContent = CONTINUE_HINT;

    if (node.type === 'beat') {
      nameEl.textContent = '';
      directionEl.textContent = '';
      startTyping(node.text);
      return;
    }

    if (node.type === 'choice') {
      const speaker = node.speaker ? speakers[node.speaker] : null;
      nameEl.textContent = speaker ? speaker.name : '';
      directionEl.textContent = '';
      stopTyping();
      textEl.textContent = node.text ?? '';
      continueEl.textContent = CHOICE_HINT;
      optionsEl.hidden = false;
      renderOptions(node.options);
      return;
    }

    // node.type === 'line'
    const speaker = speakers[node.speaker];
    nameEl.textContent = speaker ? speaker.name : '';
    directionEl.textContent = node.direction ? `(${node.direction})` : '';
    startTyping(node.text);
  }

  function selectOption(i) {
    const option = engine.choose(i);
    if (option && onChoice) onChoice(option, engine.current);
    renderNode();
  }

  function advance() {
    if (!engine) return;
    const node = engine.current;
    if (!node || node.type === 'choice') return;
    if (typing) {
      stopTyping();
      textEl.textContent = fullText;
      return;
    }
    engine.advance();
    renderNode();
  }

  /**
   * 0 = calm; 1-3 = how shaken the speaker sounds on this line: the box
   * trembles and the name/text/portrait tint red, harder at each level
   * (see .dialogue-distress-N in index.html).
   */
  function setDistress(level) {
    const clamped = Math.max(0, Math.min(3, Math.round(level || 0)));
    for (let i = 1; i <= 3; i++) root.classList.toggle(`dialogue-distress-${i}`, i === clamped);
  }

  function finish() {
    root.classList.add('hidden');
    stopTyping();
    const callback = onComplete;
    engine = null;
    onComplete = null;
    onChoice = null;
    onCancel = null;
    distressFor = null;
    onNode = null;
    setDistress(0);
    if (callback) callback();
  }

  /**
   * Stops the script early (Escape) without treating it as a finished
   * conversation: no onComplete, so a caller can't mistake a bailed-out
   * script for one that actually resolved. onCancel lets the caller
   * restore whatever state it suspended for the dialogue (e.g. return to
   * the home screen) instead of leaving the game stuck with no overlay.
   */
  function cancelDialogue() {
    if (!engine) return;
    root.classList.add('hidden');
    stopTyping();
    const callback = onCancel;
    engine = null;
    onComplete = null;
    onChoice = null;
    onCancel = null;
    distressFor = null;
    onNode = null;
    setDistress(0);
    if (callback) callback();
  }

  function handleKeydown(event) {
    if (root.classList.contains('hidden')) return;

    if (event.code === 'Escape') {
      event.preventDefault();
      cancelDialogue();
      return;
    }

    const choosing = engine?.current?.type === 'choice';
    if (choosing) {
      const count = optionButtons.length;
      if (event.code === 'ArrowDown' || event.code === 'ArrowRight' || event.code === 'KeyS') {
        event.preventDefault();
        highlightOption((highlightedIndex + 1) % count);
        optionButtons[highlightedIndex].focus();
      } else if (event.code === 'ArrowUp' || event.code === 'ArrowLeft' || event.code === 'KeyW') {
        event.preventDefault();
        highlightOption((highlightedIndex - 1 + count) % count);
        optionButtons[highlightedIndex].focus();
      } else if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        selectOption(highlightedIndex);
      } else {
        const digit = Number(event.key);
        if (Number.isInteger(digit) && digit >= 1 && digit <= count) {
          event.preventDefault();
          selectOption(digit - 1);
        }
      }
      return;
    }

    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      advance();
    }
  }

  box.addEventListener('click', advance);

  // In-world conversations keep the pointer locked (see playRoomDialogue in
  // main.js), so clicks land on the game canvas rather than the box or the
  // option buttons. Handle them here instead: moving the mouse steps the
  // highlight, and a click anywhere picks it or continues.
  document.addEventListener('mousemove', (event) => {
    if (!document.pointerLockElement || engine?.current?.type !== 'choice') return;
    pointerTravel += event.movementY;
    const steps = Math.trunc(pointerTravel / OPTION_STEP_PX);
    if (steps === 0) return;
    pointerTravel -= steps * OPTION_STEP_PX;
    const last = optionButtons.length - 1;
    const target = highlightedIndex + steps;
    // Pushing past the first/last option shouldn't bank travel that then
    // has to be undone before moving back.
    if (target <= 0 || target >= last) pointerTravel = 0;
    highlightOption(Math.min(last, Math.max(0, target)));
    optionButtons[highlightedIndex].focus(); // keep the focus ring on the same option, as the arrow keys do
  });
  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !document.pointerLockElement || !engine) return;
    if (engine.current?.type === 'choice') selectOption(highlightedIndex);
    else advance();
  });
  window.addEventListener('keydown', handleKeydown);

  return {
    /**
     * @param {Array} script - see src/data/dialogues.js for node shapes
     * @param {{ onComplete?: () => void, onChoice?: (option, nextNode) => void, onCancel?: () => void,
     *   distressFor?: (lineNode) => number }} [handlers] distressFor: 0-3 per
     *   line as it's shown (see setDistress), for reactions that depend on
     *   the player's earlier picks rather than on the script itself.
     *   onNode: every node as it's shown — e.g. to act out a node's
     *   `action` (a stage direction) in the 3D scene. startAt/stopAt play
     *   just part of the script (see createDialogueEngine)
     */
    play(script, {
      onComplete: complete, onChoice: choice, onCancel: cancel, distressFor: distress, onNode: node,
      startAt, stopAt,
    } = {}) {
      engine = createDialogueEngine(script, { startAt, stopAt });
      onComplete = complete ?? null;
      onChoice = choice ?? null;
      onCancel = cancel ?? null;
      distressFor = distress ?? null;
      onNode = node ?? null;
      leftSpeaker = null;
      rightSpeaker = null;
      leftMood = 'neutral';
      rightMood = 'neutral';
      root.classList.remove('hidden');
      renderNode();
    },
    // Lets a caller bail out of a conversation it started (e.g. the room
    // unloading from under it) without faking a normal completion.
    cancel: cancelDialogue,
    get isActive() {
      return engine !== null;
    },
  };
}
