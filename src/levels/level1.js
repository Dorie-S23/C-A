import * as THREE from 'three';
import { createChoiceTally } from '../dialogue/choiceTally.js';
import { level1RibbitDialogue } from '../data/dialogues.js';
import {
  ESCAPE_MAX, ESCAPE_PASS_MARK, getEscapeTotal, getLevelPoints, setLevelPoints,
} from '../state/escapeThreshold.js';

/**
 * Level 1, "Talk Her Down" — the mission, as opposed to the rooms it
 * happens in (which can also be visited on their own, just to explore).
 * Staged from Dorsa's script (level1RibbitDialogue):
 *
 *   1. Dorm Hall, in front of Ribbit's door. E knocks: Pomni raps, the door
 *      rattles, and the conversation starts through the shut door.
 *   2. "…Door's open." — the script reaches 'l1_inside' and the mission
 *      travels into Ribbit's room: Pomni arrives in the open doorway and
 *      walks in to the bedside; Ribbit is curled up on the bed.
 *   3. The rest plays there: Pomni may sit down beside her (choice 2 B),
 *      and Ribbit sits up slowly before the end.
 *
 * Each pick is checked against the correct answer as it's made and its
 * points go straight into the hidden Escape Threshold; wrong answers score
 * 0, still advance, and visibly shake Ribbit (her next line trembles and
 * runs red; her model hunches). Finishing completes the level whatever the
 * score. Escape mid-conversation restarts the mission at her door, with
 * Level 1's points put back as they were.
 *
 * Run straight on from the story (Caine has just warned Pomni in the
 * hall), `hall` is the Dorm Hall she's already standing in: the knock is
 * set up there, without reloading it or moving her to the door.
 *
 * @param {object} game the mission API from main.js (see `missionApi`)
 * @param {{ hall?: object }} [options] the already-loaded Dorm Hall, if any
 */
export function runLevel1(game, { hall: startingHall = null } = {}) {
  const { stage } = game;
  const pointsBefore = getLevelPoints('level1');
  let tally = null;
  let distress = 0;
  let reactNextLine = false;
  let ribbitScene = null; // set once we're in her room

  // Scoring, shared by both halves of the conversation.
  const scoring = {
    onChoice: (option) => {
      const correct = tally.record(option);
      if (correct === null) return;
      // Good picks add their points at once; bad ones add 0, and the
      // conversation carries on either way — no retries.
      setLevelPoints('level1', tally.points);
      distress = Math.max(0, Math.min(3, distress + (correct ? -1 : 1)));
      reactNextLine = !correct;
      ribbitScene?.setDistress(distress);
    },
    distressFor: (line) => {
      if (!reactNextLine || line.speaker !== 'ribbit') return 0;
      reactNextLine = false;
      return distress;
    },
    onCancel: () => {
      setLevelPoints('level1', pointsBefore);
      atTheDoor();
    },
  };

  /** Part 1: Pomni in the Dorm Hall at Ribbit's shut door. */
  async function atTheDoor() {
    ribbitScene = null;
    // Only the first time: a retry after Escape starts over at her door.
    const alreadyHere = startingHall;
    startingHall = null;
    const hall = alreadyHere ?? await game.enterRoom('dorm');
    // Her door normally stands open as the way into her room; for the
    // knock it's shut (and its doorway won't carry Pomni through) until
    // the script lets her in.
    hall.hallDoors?.ribbit?.shut();
    const door = ribbitsDormDoor(hall.group);
    if (!alreadyHere) stage.place({ ...KNOCK_SPOT, lookAt: RIBBIT_DOOR });
    game.addInteractable({
      objects: door.meshes,
      anchor: door.knockSpot,
      radius: KNOCK_RADIUS,
      prompt: () => 'Knock',
      interact: () => knock(door),
    });
  }

  function knock(door) {
    tally = createChoiceTally(level1RibbitDialogue);
    distress = 0;
    reactNextLine = false;
    game.playDialogue(SCRIPT_KEY, {
      ...scoring,
      stopAt: INSIDE,
      lookAt: RIBBIT_DOOR,
      onNode: (node) => {
        if (node.action !== 'knock') return;
        // Framed from behind her right shoulder (she faces -X here, so
        // that's the -Z side): straight from behind, her body hides the arm.
        stage.setCamera({ yaw: KNOCK_CAMERA_YAW, pitch: 0.15 });
        stage.gesture('knock', { onTap: door.rattle });
      },
      onComplete: goInside,
    });
  }

  /** Part 2: in through the door, the rest of the conversation in her room. */
  async function goInside() {
    const room = await game.travel('ribbit');
    ribbitScene = room.ribbitScene;
    const { door, points, seatY, setPose, setDistress } = ribbitScene;
    setDistress(distress);
    door.open({ immediate: true });
    stage.place({ ...points.DOORWAY, lookAt: points.BEDSIDE });

    const actions = {
      enterRoom: () => {
        stage.walkTo([points.BEDSIDE]).then(() => {
          stage.lookAt(points.RIBBIT_ON_BED);
          door.close();
        });
      },
      sitBesideRibbit: () => {
        stage.walkTo([points.SEAT], { speed: 1.0 }).then(() => {
          stage.sit(seatY, { lookAt: points.SEAT_FACING });
          // Frame the two of them from the room, looking toward the bed.
          const dx = points.RIBBIT_ON_BED.x - points.SEAT.x;
          const dz = points.RIBBIT_ON_BED.z - points.SEAT.z;
          stage.setCamera({ yaw: Math.atan2(-dx, -dz), pitch: 0.3 });
        });
      },
      ribbitSitsUp: () => {
        setDistress(0);
        setPose('sitting');
      },
    };

    game.playDialogue(SCRIPT_KEY, {
      ...scoring,
      startAt: INSIDE,
      lookAt: points.BEDSIDE,
      onNode: (node) => actions[node.action]?.(),
      onComplete: async () => {
        logEscapeProgress(tally);
        // The story continues straight into Level 2 instead of stopping
        // here on an end screen — the same "chain the next beat onto
        // onComplete" pattern Pre-Level 1 already uses to lead into this
        // mission (see caineConversation.js). The score-reactive line that
        // used to be the end screen's subtitle still shows, just as a
        // brief hint instead of a hard stop. Kaufmo's "hurries past,
        // mumbling" scene is written for this exact spot: the Dorm Hall,
        // right outside Ribbit's door, the moment Pomni steps back out.
        game.showHint(LEVEL1_OUTCOME[tally.correct] ?? LEVEL1_OUTCOME[0], 6000);
        await game.travel('dorm');
        stage.place({ ...KNOCK_SPOT, lookAt: RIBBIT_DOOR });
        game.playDialogue('level2Opening');
      },
    });
  }

  atTheDoor();
}

const SCRIPT_KEY = 'level1Ribbit';
const INSIDE = 'l1_inside'; // the script's first line inside her room

// Ribbit's door in the Dorm Hall: the last one on the left of the main
// hallway ("Door Slab.089", her icon on it), facing into the hall (+X).
const RIBBIT_DOOR = { x: -3.6, z: -110.31 };
const KNOCK_SPOT = { x: -2.2, z: -110.31 }; // where Pomni stands to knock
const KNOCK_RADIUS = 2.2;
const KNOCK_CAMERA_YAW = Math.atan2(0.6, -0.8);
const RATTLE_OFFSET = 0.012; // metres a rap shakes the door
const RATTLE_MS = 70;

/**
 * Ribbit's door in the Dorm Hall: its slab and her icon (the meshes the
 * crosshair can aim at), a spot to measure "close enough to knock" from,
 * and a little shake for each rap.
 */
function ribbitsDormDoor(group) {
  const parts = ['Door_Slab089', 'Ribbit'].map((name) => group.getObjectByName(name)).filter(Boolean);
  const meshes = [];
  for (const part of parts) part.traverse((child) => { if (child.isMesh) meshes.push(child); });

  const knockSpot = new THREE.Object3D();
  knockSpot.position.set(KNOCK_SPOT.x, 0, KNOCK_SPOT.z);
  group.add(knockSpot);

  return {
    meshes,
    knockSpot,
    rattle() {
      for (const part of parts) part.position.x -= RATTLE_OFFSET;
      setTimeout(() => { for (const part of parts) part.position.x += RATTLE_OFFSET; }, RATTLE_MS);
    },
  };
}

// What the end screen says, by how many of the four choices were right:
// a hint at how it went without showing the hidden Escape Threshold.
const LEVEL1_OUTCOME = [
  'Ribbit is holding on — but only just.',
  'Ribbit is holding on — but only just.',
  'Ribbit is okay. For now.',
  'Ribbit seems a little steadier.',
  'Ribbit is steadier than she’s been in days.',
];

/** Dev builds only: the hidden meter in the console, for testing balance. */
function logEscapeProgress(tally) {
  if (!import.meta.env?.DEV) return;
  console.info(`[Escape Threshold] Level 1: ${tally.points}/${tally.maxPoints} points, `
    + `${tally.correct}/${tally.totalChoices} right — run total ${getEscapeTotal()}/${ESCAPE_MAX} `
    + `(escape needs ${ESCAPE_PASS_MARK})`);
}
