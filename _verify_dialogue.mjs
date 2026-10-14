// Node verification harness for the dialogue engine's branching logic.
// Run with `node _verify_dialogue.mjs`.
import { createDialogueEngine } from './src/dialogue/dialogueEngine.js';
import { SPEAKERS, preLevel1Dialogue, level1OpenDialogue, level2OpeningDialogue } from './src/data/dialogues.js';
import { SPRITES, MOODS } from './src/ui/portraitSprites.js';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

function runLinear(script) {
  const engine = createDialogueEngine(script);
  const seen = [];
  while (!engine.done) {
    seen.push(engine.current);
    engine.advance();
  }
  return seen;
}

// 1) both real scripts play start-to-end without throwing, visit every
// node exactly once (pure linear, no branching), and reference only
// speakers that exist in the registry.
for (const [name, script] of [['preLevel1', preLevel1Dialogue], ['level1Open', level1OpenDialogue]]) {
  const seen = runLinear(script);
  check(`${name}: visits every node once, in order`, seen.length === script.length
    && seen.every((n, i) => n === script[i]), `visited=${seen.length}/${script.length}`);

  const missingSpeaker = seen.find((n) => n.type === 'line' && !SPEAKERS[n.speaker]);
  check(`${name}: every line's speaker exists in SPEAKERS`, !missingSpeaker,
    missingSpeaker ? `unknown speaker "${missingSpeaker.speaker}"` : '');

  const missingSide = seen.find((n) => n.type === 'line' && n.side !== 'left' && n.side !== 'right');
  check(`${name}: every line has a left/right side`, !missingSide);

  const emptyText = seen.find((n) => (n.type === 'line' || n.type === 'beat') && !n.text?.trim());
  check(`${name}: no node has empty text`, !emptyText);

  // Every line whose speaker has a sprite should carry a recognized mood,
  // so DialogueUI never silently falls back to 'neutral' by typo. Lines for
  // speakers without a sprite (Ragatha) aren't required to set one.
  const badMood = seen.find((n) => n.type === 'line' && SPRITES[n.speaker]
    && (!n.mood || !MOODS.includes(n.mood)));
  check(`${name}: every sprite-speaker line has a recognized mood`, !badMood,
    badMood ? `node text "${badMood.text.slice(0, 30)}..." has mood "${badMood.mood}"` : '');
}

// 1b) a branching real script (level2Opening): walk every path through its
// choice nodes (branching breadth-first at the first unresolved choice per
// path) and run the same content checks across every node reachable by any
// combination of choices, not just whichever one a single playthrough hits.
function collectAllReachableNodes(script, maxPaths = 64) {
  const visited = new Set();
  const queue = [[]];
  let pathsExplored = 0;
  while (queue.length > 0 && pathsExplored < maxPaths) {
    const choices = queue.shift();
    pathsExplored++;
    const engine = createDialogueEngine(script);
    let cursor = 0;
    while (!engine.done) {
      const node = engine.current;
      visited.add(node);
      if (node.type === 'choice') {
        if (cursor < choices.length) {
          engine.choose(choices[cursor]);
          cursor++;
        } else {
          for (let i = 0; i < node.options.length; i++) queue.push([...choices, i]);
          break;
        }
      } else {
        engine.advance();
      }
    }
  }
  return [...visited];
}

{
  const name = 'level2Opening';
  let seen = [];
  let threw = null;
  try {
    seen = collectAllReachableNodes(level2OpeningDialogue);
  } catch (e) {
    threw = e;
  }
  check(`${name}: every branch resolves without an unknown-id error`, !threw, threw?.message);

  const choiceCount = seen.filter((n) => n.type === 'choice').length;
  check(`${name}: both choice points are reachable`, choiceCount === 2, `found=${choiceCount}`);

  const missingSpeaker = seen.find((n) => n.type === 'line' && !SPEAKERS[n.speaker]);
  check(`${name}: every line's speaker exists in SPEAKERS`, !missingSpeaker,
    missingSpeaker ? `unknown speaker "${missingSpeaker.speaker}"` : '');

  const missingSide = seen.find((n) => n.type === 'line' && n.side !== 'left' && n.side !== 'right');
  check(`${name}: every line has a left/right side`, !missingSide);

  const emptyText = seen.find((n) => (n.type === 'line' || n.type === 'beat') && !n.text?.trim());
  check(`${name}: no node has empty text`, !emptyText);

  const badMood = seen.find((n) => n.type === 'line' && SPRITES[n.speaker]
    && (!n.mood || !MOODS.includes(n.mood)));
  check(`${name}: every sprite-speaker line has a recognized mood`, !badMood,
    badMood ? `node text "${badMood.text.slice(0, 30)}..." has mood "${badMood.mood}"` : '');

  const emptyOption = seen.find((n) => n.type === 'choice' && n.options.some((o) => !o.text?.trim()));
  check(`${name}: every choice option has text`, !emptyOption);
}

// 2) a synthetic branching script: choice nodes only advance via choose(),
// advance() on them is a no-op, and options can jump to an arbitrary id
// (including skipping nodes, including ending the script early).
{
  const script = [
    { id: 'start', type: 'line', speaker: 'pomni', side: 'left', text: 'Hi' },
    {
      type: 'choice',
      options: [
        { text: 'Be nice', next: 'nice' },
        { text: 'Be mean', next: 'mean' },
      ],
    },
    { id: 'nice', type: 'line', speaker: 'pomni', side: 'left', text: 'Nice branch', next: 'end' },
    { id: 'mean', type: 'line', speaker: 'pomni', side: 'left', text: 'Mean branch', next: null },
    { id: 'end', type: 'line', speaker: 'pomni', side: 'left', text: 'Shared ending', next: null },
  ];

  const e1 = createDialogueEngine(script);
  e1.advance(); // past the line -> lands on the choice node
  check('advance() on a line moves forward', e1.current.type === 'choice');
  const before = e1.current;
  e1.advance(); // choice nodes ignore advance()
  check('advance() on a choice node is a no-op', e1.current === before);

  const picked = e1.choose(0); // "Be nice"
  check('choose() returns the picked option', picked?.text === 'Be nice');
  check('choosing "nice" jumps to the nice branch', e1.current.id === 'nice');
  e1.advance();
  check('nice branch flows into the shared ending', e1.current.id === 'end');
  e1.advance();
  check('shared ending terminates the script', e1.done);

  const e2 = createDialogueEngine(script);
  e2.advance();
  e2.choose(1); // "Be mean"
  check('choosing "mean" jumps to the mean branch', e2.current.id === 'mean');
  e2.advance();
  check('mean branch ends the script early (does not reach shared ending)', e2.done);
}

// 3) unknown node id in `next` throws immediately, loudly, rather than
// silently stalling or crashing somewhere unrelated later.
{
  const script = [{ type: 'line', speaker: 'pomni', side: 'left', text: 'x', next: 'nope' }];
  const engine = createDialogueEngine(script);
  let threw = false;
  try {
    engine.advance();
  } catch (e) {
    threw = /Unknown dialogue node id/.test(e.message);
  }
  check('advancing into an unknown id throws', threw);
}

// 4) empty script is immediately done, never current.
{
  const engine = createDialogueEngine([]);
  check('empty script starts done', engine.done && engine.current === null);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
