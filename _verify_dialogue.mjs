// Node verification harness for the dialogue engine's branching logic.
// Run with `node _verify_dialogue.mjs`.
import { createDialogueEngine } from './src/dialogue/dialogueEngine.js';
import { createLevel1Attempt } from './src/state/level1Attempt.js';
import { createChoiceTally } from './src/dialogue/choiceTally.js';
import {
  ESCAPE_MAX, ESCAPE_PASS_MARK, LEVEL_MAX_POINTS, getEscapeTotal, getLevelPoints,
  passesEscapeGate, resetEscapeThreshold, setLevelPoints,
} from './src/state/escapeThreshold.js';
import {
  SPEAKERS, preLevel1Dialogue, level1OpenDialogue, level2OpeningDialogue, level1RibbitDialogue,
  level2HallwayDialogue, ribbitFollowupDialogue,
  level2IdleDialogue, level2CompleteDialogue, level2ReturnDialogue, level2SendoffDialogue,
  level2ReturnAndSendoffDialogue, level2AbstractionDialogue, level3HallwayDialogue, level3JaxDialogue,
} from './src/data/dialogues.js';
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
for (const [name, script] of [
  ['preLevel1', preLevel1Dialogue], ['level1Open', level1OpenDialogue],
  ['level2Hallway', level2HallwayDialogue], ['ribbitFollowup', ribbitFollowupDialogue],
  ['level2Idle', level2IdleDialogue], ['level2Complete', level2CompleteDialogue],
  ['level2Return', level2ReturnDialogue], ['level2Sendoff', level2SendoffDialogue],
  ['level2ReturnAndSendoff', level2ReturnAndSendoffDialogue], ['level2Abstraction', level2AbstractionDialogue],
  ['level3Hallway', level3HallwayDialogue], ['level3Jax', level3JaxDialogue],
]) {
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

// The way into Level 3: the stage directions levels/level3Hallway.js and
// level3Lobby.js act out, each once; anything else would silently do nothing.
for (const [name, script, known] of [
  ['level3Hallway', level3HallwayDialogue, ['jaxBolts', 'ribbitArrives', 'pomniStopsRibbit', 'ribbitLeaves']],
  ['level3Jax', level3JaxDialogue, ['jaxTurns', 'jaxGlitches', 'jaxRunsOff']],
]) {
  const actions = script.filter((n) => n.action).map((n) => n.action);
  check(`${name}: every stage-direction action is one its scene plays, each used once`,
    actions.length === known.length && known.every((a) => actions.includes(a)), actions.join());
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

// Level 1 (Ribbit): walk every combination of answers through the engine
// with a live tally, the way ribbitRoom.js drives it. A path that picks a
// choice's game-over option (D, -1) must play its lines and stop on a
// `gameOver` beat; every other path must reach the end and score exactly
// the points of the options it picked.
{
  const script = level1RibbitDialogue;
  const choices = script.filter((n) => n.type === 'choice');
  check('level1Ribbit: has four choices of four options', choices.length === 4
    && choices.every((c) => c.options.length === 4), `choices=${choices.length}`);

  // The script's own answer key (Dorsa's +1 options): A, B, A, A.
  const key = choices.map((c) => c.options.findIndex((o) => o.points === 1));
  check('level1Ribbit: correct answers are A, B, A, A', key.join() === '0,1,0,0', `key=${key.join()}`);
  check('level1Ribbit: per choice one +1 answer, two 0s, and a -1 game-over option last', choices.every(
    (c) => c.options.map((o) => o.points).sort().join() === '-1,0,0,1' && c.options[3].points === -1));

  const paths = [];
  const walk = (picks) => {
    if (picks.length === choices.length) { paths.push(picks); return; }
    for (let i = 0; i < 4; i++) walk([...picks, i]);
  };
  walk([]);

  let failed = null;
  for (const picks of paths) {
    const engine = createDialogueEngine(script);
    const tally = createLevel1Attempt();
    const seen = [];
    let verdicts = [];
    let expected = 0;
    try {
      let c = 0;
      for (let steps = 0; !engine.done && !tally.failed && steps < 500; steps++) {
        const node = engine.current;
        seen.push(node);
        if (node.type === 'choice') {
          const option = engine.choose(picks[c]);
          expected += option.points;
          verdicts.push(tally.record(option));
          c++;
        } else {
          engine.advance();
        }
      }
    } catch (e) {
      failed = `${picks.join('')}: threw ${e.message}`;
      break;
    }
    const quit = picks.slice(0, verdicts.length).indexOf(3);
    const last = seen[seen.length - 1];
    const problem = quit >= 0
      ? (!engine.done ? 'game-over path never ended'
        : !last.gameOver || !last.text?.trim() ? 'game-over path does not end on a gameOver beat with a message'
        : verdicts.length !== quit + 1 ? 'kept asking after the game-over pick'
        : tally.distress !== 3 ? 'game-over pick did not max distress'
        : null)
      : seen.some((n) => n.gameOver) ? 'reached a gameOver beat without picking D'
      : tally.distress >= 3 ? 'distress reached the limit without a game-over pick'
      : !engine.done ? 'never ended'
      : tally.answered !== 4 ? `answered ${tally.answered} choices`
      : tally.points !== Math.max(0, expected) ? `points ${tally.points} != ${expected}`
      : verdicts.some((v, i) => v !== (picks[i] === key[i])) ? `verdicts ${verdicts.join()}`
      : seen.find((n) => n.type === 'line' && !SPEAKERS[n.speaker]) ? 'unknown speaker'
      : seen.find((n) => n.type === 'line' && SPRITES[n.speaker] && !MOODS.includes(n.mood)) ? 'missing/unknown mood'
      : seen.find((n) => (n.type === 'line' || n.type === 'beat') && !n.text?.trim()) ? 'empty text'
      : seen[seen.length - 1].text !== script[script.length - 1].text ? 'ends somewhere else'
      : null;
    if (problem) { failed = `${picks.map((p) => 'ABCD'[p]).join('')}: ${problem}`; break; }
  }
  check(`level1Ribbit: all ${paths.length} answer paths either end on their game over or finish and score correctly`, !failed, failed ?? '');

  const best = createChoiceTally(script);
  choices.forEach((c, i) => best.record(c.options[key[i]]));
  check('level1Ribbit: all-correct run scores 4/4 points, 4/4 right', best.points === 4 && best.correct === 4
    && best.maxPoints === 4 && best.totalChoices === 4);

  const worst = createChoiceTally(script);
  choices.forEach((c, i) => worst.record(c.options[(key[i] + 1) % 3]));
  check('level1Ribbit: all-wrong run scores 0 points, 0 right, still 4 answered',
    worst.points === 0 && worst.correct === 0 && worst.answered === 4);

  // Stage directions ribbitRoom.js acts out; anything else would silently do nothing.
  const KNOWN_ACTIONS = ['knock', 'enterRoom', 'sitBesideRibbit', 'ribbitSitsUp'];
  const actions = script.filter((n) => n.action).map((n) => n.action);
  check('level1Ribbit: every stage-direction action is one the room plays, each used once',
    actions.length === KNOWN_ACTIONS.length && KNOWN_ACTIONS.every((a) => actions.includes(a)), actions.join());

  // Level 1 is played in two parts (src/levels/level1.js): at the door in
  // the Dorm Hall until 'l1_inside', then from 'l1_inside' in her room.
  for (let pick = 0; pick < 3; pick++) {
    const door = createDialogueEngine(script, { stopAt: 'l1_inside' });
    const shown = [];
    for (let steps = 0; !door.done && steps < 50; steps++) {
      shown.push(door.current);
      if (door.current.type === 'choice') door.choose(pick); else door.advance();
    }
    check(`level1Ribbit at the door, option ${'ABC'[pick]}: ends just before 'l1_inside'`,
      door.done && !shown.some((n) => n.id === 'l1_inside') && shown[0].action === 'knock');
  }
  const inside = createDialogueEngine(script, { startAt: 'l1_inside' });
  check("level1Ribbit in her room: starts on 'l1_inside' (the walk-in)",
    inside.current.id === 'l1_inside' && inside.current.action === 'enterRoom');
  {
    const split = createChoiceTally(script);
    const doorPart = createDialogueEngine(script, { stopAt: 'l1_inside' });
    while (!doorPart.done) {
      if (doorPart.current.type === 'choice') split.record(doorPart.choose(0)); else doorPart.advance();
    }
    const roomPart = createDialogueEngine(script, { startAt: 'l1_inside' });
    let c = 1;
    while (!roomPart.done) {
      if (roomPart.current.type === 'choice') split.record(roomPart.choose(key[c++])); else roomPart.advance();
    }
    check('level1Ribbit: one tally across both parts scores all four choices (4/4)', split.points === 4 && split.answered === 4);
  }

  check('choiceTally: an option from another script is ignored',
    createChoiceTally(script).record({ text: 'x', points: 1 }) === null);
}

// Escape Threshold (KAN-32): per-level points that replace rather than
// stack, a 9-point maximum, Gate 1 at the pass mark, and a clean reset.
{
  resetEscapeThreshold();
  check('escape: max is 9 (Level 1: 4, Level 2: 5), pass mark 6',
    ESCAPE_MAX === 9 && LEVEL_MAX_POINTS.level1 === 4 && LEVEL_MAX_POINTS.level2 === 5 && ESCAPE_PASS_MARK === 6);
  check('escape: a fresh run starts at 0 and fails the gate', getEscapeTotal() === 0 && !passesEscapeGate());

  setLevelPoints('level1', 2);
  setLevelPoints('level1', 3); // replaying Level 1 replaces its score
  check('escape: replaying a level replaces its points instead of adding', getLevelPoints('level1') === 3
    && getEscapeTotal() === 3);
  setLevelPoints('level2', 1);
  check('escape: levels add up across the run; 4 < 6 fails the gate', getEscapeTotal() === 4 && !passesEscapeGate());
  setLevelPoints('level2', 3);
  check('escape: reaching the pass mark (6) clears the gate', getEscapeTotal() === 6 && passesEscapeGate());

  setLevelPoints('level1', 99);
  setLevelPoints('level2', -4);
  check("escape: points are clamped to each level's range",getLevelPoints('level1') === 4 && getLevelPoints('level2') === 0);

  let threw = false;
  try { setLevelPoints('level9', 1); } catch { threw = true; }
  check('escape: an unknown level is rejected loudly', threw);

  resetEscapeThreshold();
  check('escape: reset clears the whole run', getEscapeTotal() === 0 && getLevelPoints('level1') === 0);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
