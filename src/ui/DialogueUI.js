import { createDialogueEngine } from '../dialogue/dialogueEngine.js';
import { SPRITES } from './portraitSprites.js';
import { ICONS } from './portraitIcons.js';
import { speechText } from '../audio/voiceKey.js';

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
 *
 * `voice` (optional, see audio/voicePlayer.js) speaks each line as it
 * appears. Snapping a line to full text leaves its clip playing; moving to
 * the next node, pausing, cancelling or finishing stops or pauses it.
 *
 * A picked choice option is then shown (and voiced) as its speaker's own
 * line, and the next advance brings in the reply — see selectOption.
 */
export function createDialogueUI({ speakers, voice = null }) {
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
  let paused = false;
  let onComplete = null;
  let onChoice = null;
  let onCancel = null;
  let distressFor = null;
  let onNode = null;
  let lineFor = null;
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
  let awaitingNode = false;
  let nodeGeneration = 0;
  // skipToEnd renders every remaining node in one go; voicing each would
  // just fire off a burst of clip downloads that are cut off immediately.
  let skipping = false;
  // The option just picked, shown as its speaker's line before the reply.
  // While set, engine.current is already the reply — not yet rendered, so
  // its onNode hasn't fired.
  let echo = null;
  let pendingVoice = null; // an awaited scene revealed this line while paused

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
      if (paused) return;
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
    const generation = ++nodeGeneration;
    const pending = onNode?.(node);
    if (pending && typeof pending.then === 'function') {
      // Scene actions own this beat until they arrive. Escape still cancels.
      awaitingNode = true;
      stopTyping();
      voice?.stop();
      root.style.visibility = 'hidden';
      Promise.resolve(pending).then(() => {
        if (!engine || generation !== nodeGeneration) return;
        awaitingNode = false;
        root.style.visibility = paused ? 'hidden' : '';
        displayNode(node);
      }).catch(error => {
        if (!engine || generation !== nodeGeneration) return;
        console.error('Dialogue scene action failed', error);
        cancelDialogue();
      });
      return;
    }
    displayNode(node);
  }

  function displayNode(node) {
    if (node !== echo) node = lineFor?.(node) ?? node;

    // A silent sync point for the scene behind the dialogue (e.g. cueing a
    // background animation) rather than anything the player reads — skip
    // it with no visible change and no click required, instead of making
    // them advance past an empty box.
    if (node.type === 'cue') {
      engine.advance();
      renderNode();
      return;
    }

    const spoken = node.type === 'line' || (node.type === 'choice' && node.speaker && node.text);
    pendingVoice = null;
    if (spoken && !skipping) {
      const text = node.voiceText ?? node.text;
      if (paused) {
        voice?.stop();
        pendingVoice = { speaker: node.speaker, text };
      } else voice?.play(node.speaker, text);
    } else voice?.stop();

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
    setDistress(node.type === 'line' && node !== echo && distressFor ? distressFor(node) : 0);
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
    if (!engine || paused || awaitingNode || echo) return;
    const choice = engine.current;
    const option = engine.choose(i);
    if (option && onChoice) onChoice(option, engine.current);
    if (!engine) return; // A choice can synchronously fail and cancel the level.
    // Have the speaker actually say what was picked, as a line of their own,
    // instead of jumping straight to the reply (which would cut the voice
    // off at once). Action-only options like "(Sit down next to her and
    // wait.)" have nothing to say and go straight on, as before.
    const said = option && choice.speaker ? speechText(option.text) : '';
    if (said) {
      const side = rightSpeaker === choice.speaker ? 'right' : 'left';
      echo = {
        type: 'line', speaker: choice.speaker, side, mood: side === 'left' ? leftMood : rightMood,
        text: said, voiceText: option.text, // the clip is named after the option as written
      };
      displayNode(echo);
      return;
    }
    renderNode();
  }

  function advance() {
    if (!engine || paused || awaitingNode) return;
    const node = engine.current;
    if (!echo && (!node || node.type === 'choice')) return;
    if (typing) {
      stopTyping();
      textEl.textContent = fullText;
      return;
    }
    if (echo) echo = null; // on to the reply, which choose() already moved to
    else engine.advance();
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
    nodeGeneration++; awaitingNode = false; echo = null; pendingVoice = null;
    paused = false; root.style.visibility = '';
    root.classList.add('hidden');
    stopTyping();
    voice?.stop();
    const callback = onComplete;
    engine = null;
    onComplete = null;
    onChoice = null;
    onCancel = null;
    distressFor = null;
    onNode = null;
    lineFor = null;
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
    nodeGeneration++; awaitingNode = false; echo = null; pendingVoice = null;
    paused = false; root.style.visibility = '';
    root.classList.add('hidden');
    stopTyping();
    voice?.stop();
    const callback = onCancel;
    engine = null;
    onComplete = null;
    onChoice = null;
    onCancel = null;
    distressFor = null;
    onNode = null;
    lineFor = null;
    setDistress(0);
    if (callback) callback();
  }

  function handleKeydown(event) {
    if (paused || root.classList.contains('hidden')) return;

    if (event.code === 'Escape') {
      event.preventDefault();
      cancelDialogue();
      return;
    }
    if (awaitingNode) { event.preventDefault(); return; }

    const choosing = !echo && engine?.current?.type === 'choice';
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
    if (paused || awaitingNode || echo || !document.pointerLockElement || engine?.current?.type !== 'choice') return;
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
    if (engine.current?.type === 'choice' && !echo) selectOption(highlightedIndex);
    else advance();
  });
  window.addEventListener('keydown', handleKeydown);

  return {
    /**
     * @param {Array} script - see src/data/dialogues.js for node shapes
     * @param {{ onComplete?: () => void, onChoice?: (option, nextNode) => void, onCancel?: () => void,
     *   onNode?: (node) => void, distressFor?: (lineNode) => number,
     *   startAt?: string, stopAt?: string }} [handlers] onNode fires for every node as it
     *   becomes current — including 'cue' nodes, which otherwise never render anything, so a
     *   caller can sync scene-level side effects (e.g. cueing a background animation, or
     *   acting out a node's `action` stage direction) to a specific point in the script
     *   without the player seeing a dialogue line for it. distressFor: 0-3 per line as it's
     *   shown (see setDistress), for reactions that depend on the player's earlier picks
     *   rather than on the script itself. startAt/stopAt play just part of the script (see
     *   createDialogueEngine).
     */
    play(script, {
      onComplete: complete, onChoice: choice, onCancel: cancel, distressFor: distress, onNode: node, lineFor: transform,
      startAt, stopAt,
    } = {}) {
      nodeGeneration++; awaitingNode = false; echo = null; pendingVoice = null;
      paused = false; root.style.visibility = '';
      engine = createDialogueEngine(script, { startAt, stopAt });
      onComplete = complete ?? null;
      onChoice = choice ?? null;
      onCancel = cancel ?? null;
      distressFor = distress ?? null;
      onNode = node ?? null;
      lineFor = transform ?? null;
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
    /**
     * Runs the rest of the script at once, as if played through: every node
     * still reaches onNode (so the scene's cues and actions happen), each
     * choice takes its best (highest-points) answer through onChoice, and it
     * ends in onComplete — unlike cancel(), it counts as finished.
     */
    skipToEnd() {
      if (!engine || paused || awaitingNode) return;
      const running = engine;
      stopTyping();
      voice?.stop();
      skipping = true;
      try {
        if (echo) {
          // The reply to a picked option hasn't been shown yet: show it first
          // (so its onNode runs), then skip on from it like any other node.
          echo = null;
          renderNode();
          stopTyping();
        }
        for (let guard = 0; engine === running && engine.current && guard < 1000; guard++) {
          if (awaitingNode) return;
          const node = engine.current;
          if (node.type === 'choice') {
            const best = node.options.reduce((top, option, i) =>
              ((option.points ?? 0) > (node.options[top].points ?? 0) ? i : top), 0);
            const option = engine.choose(best);
            if (option && onChoice) onChoice(option, engine.current);
          } else {
            engine.advance();
          }
          if (engine !== running) return;
          renderNode(); // Runs each new cue once and honours awaited scene actions.
          stopTyping();
        }
      } finally {
        skipping = false;
      }
    },
    setPaused(value) {
      paused = value;
      if (!value && pendingVoice) {
        const { speaker, text } = pendingVoice;
        pendingVoice = null;
        voice?.play(speaker, text);
      } else voice?.setPaused(value);
      root.style.visibility = value || awaitingNode ? 'hidden' : '';
    },
    get isActive() {
      return engine !== null;
    },
    get currentSpeaker() {
      if (echo) return echo.speaker;
      return engine?.current?.type === 'line' ? engine.current.speaker ?? null : null;
    },
    get isWaiting() { return awaitingNode; },
  };
}
