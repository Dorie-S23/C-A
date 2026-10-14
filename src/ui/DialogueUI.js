import { createDialogueEngine } from '../dialogue/dialogueEngine.js';

const TYPE_SPEED_MS = 22;

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
  let leftSpeaker = null;
  let rightSpeaker = null;
  let typeTimer = null;
  let typing = false;
  let fullText = '';

  function renderPortrait(el, speakerId, active) {
    const speaker = speakerId ? speakers[speakerId] : null;
    el.classList.toggle('dialogue-portrait-empty', !speaker);
    el.classList.toggle('dialogue-portrait-active', !!speaker && active);
    el.innerHTML = '';
    if (!speaker) return;
    el.style.setProperty('--portrait-color', speaker.color);
    const initials = document.createElement('div');
    initials.className = 'dialogue-portrait-initials';
    initials.textContent = speaker.initials;
    const label = document.createElement('div');
    label.className = 'dialogue-portrait-label';
    label.textContent = speaker.name;
    el.append(initials, label);
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

  function renderOptions(options) {
    optionsEl.innerHTML = '';
    options.forEach((option, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dialogue-option';
      button.textContent = option.text;
      button.addEventListener('click', () => selectOption(i));
      optionsEl.appendChild(button);
    });
  }

  function renderNode() {
    const node = engine.current;
    if (!node) {
      finish();
      return;
    }

    if (node.type === 'line' && node.side) {
      if (node.side === 'left') leftSpeaker = node.speaker;
      else rightSpeaker = node.speaker;
    }

    const activeSide = node.type === 'line' ? node.side : null;
    renderPortrait(portraitLeft, leftSpeaker, activeSide === 'left');
    renderPortrait(portraitRight, rightSpeaker, activeSide === 'right');

    box.classList.toggle('dialogue-box-beat', node.type === 'beat');
    optionsEl.hidden = true;
    continueEl.hidden = false;

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
      continueEl.hidden = true;
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

  function finish() {
    root.classList.add('hidden');
    stopTyping();
    const callback = onComplete;
    engine = null;
    onComplete = null;
    onChoice = null;
    if (callback) callback();
  }

  function handleKeydown(event) {
    if (root.classList.contains('hidden')) return;
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      advance();
    }
  }

  box.addEventListener('click', advance);
  window.addEventListener('keydown', handleKeydown);

  return {
    /**
     * @param {Array} script - see src/data/dialogues.js for node shapes
     * @param {{ onComplete?: () => void, onChoice?: (option, nextNode) => void }} [handlers]
     */
    play(script, { onComplete: complete, onChoice: choice } = {}) {
      engine = createDialogueEngine(script);
      onComplete = complete ?? null;
      onChoice = choice ?? null;
      leftSpeaker = null;
      rightSpeaker = null;
      root.classList.remove('hidden');
      renderNode();
    },
    get isActive() {
      return engine !== null;
    },
  };
}
