import * as THREE from 'three';
import { createChoiceTally } from '../dialogue/choiceTally.js';
import { level1RibbitDialogue } from '../data/dialogues.js';
import { getLevelPoints, setLevelPoints } from '../state/escapeThreshold.js';

/** A door/bedroom encounter. Session and room tokens guard every async handoff. */
export async function runLevel1(game, { hall, onComplete, story = false } = {}) {
  const { stage } = game;
  const session = game.session;
  const pointsBefore = getLevelPoints('level1');
  let token = game.token;
  let tally = createChoiceTally(level1RibbitDialogue);
  let distress = 1;
  let reactNextLine = false;
  let ribbitScene = null;
  const live = () => game.session === session && game.token === token;

  const scoring = {
    onChoice(option) {
      if (!live()) return;
      const correct = tally.record(option);
      if (correct === null) return;
      setLevelPoints('level1', tally.points);
      distress = Math.max(0, Math.min(3, distress + (correct ? -1 : 1)));
      reactNextLine = !correct;
      ribbitScene?.setDistress(distress);
    },
    distressFor(line) {
      if (!reactNextLine || line.speaker !== 'ribbit') return 0;
      reactNextLine = false;
      return distress;
    },
    onCancel() {
      if (!live()) return;
      setLevelPoints('level1', pointsBefore);
      stage.reset();
      if (story) {
        game.showHint('Conversation interrupted. Knock on Ribbit’s door to try again.', 6000);
        if (ribbitScene) game.travel('dorm');
      } else {
        atTheDoor();
      }
    },
  };

  async function atTheDoor() {
    ribbitScene = null;
    const room = await game.enterRoom('dorm');
    if (!room || game.session !== session || !game.isRoom(room)) return;
    token = game.token;
    room.hallDoors?.ribbit?.shut();
    const door = ribbitsDormDoor(room.group);
    stage.place({ ...KNOCK_SPOT, lookAt: RIBBIT_DOOR });
    game.addInteractable({
      objects: door.meshes, anchor: door.knockSpot, radius: 2.2,
      prompt: () => 'Knock on Ribbit’s door', interact: () => knock(door),
    });
  }

  function knock(door) {
    if (!live()) return;
    tally = createChoiceTally(level1RibbitDialogue);
    distress = 1;
    reactNextLine = false;
    game.playDialogue('level1Ribbit', {
      ...scoring, stopAt: 'l1_inside', lookAt: RIBBIT_DOOR,
      onNode(node) {
        if (node.action !== 'knock') return;
        stage.setCamera({ yaw: Math.atan2(0.6, -0.8), pitch: 0.15 });
        return stage.gesture('knock', { onTap: door.rattle }).then(() => {
          if (live()) door.restore();
        });
      },
      onComplete: goInside,
    });
  }

  async function goInside() {
    if (!live()) return;
    const room = await game.travel('ribbit');
    if (!room || game.session !== session || !game.isRoom(room)) return;
    token = game.token;
    ribbitScene = room.ribbitScene;
    const { door, points, seatY, setPose, setDistress, shots } = ribbitScene;
    setDistress(distress);
    door.open({ immediate: true });
    stage.place({ ...points.DOORWAY, lookAt: points.BEDSIDE });

    const actions = {
      async enterRoom() {
        if (!await stage.walkTo([points.BEDSIDE]) || !live()) return;
        stage.lookAt(points.RIBBIT_ON_BED);
        door.close();
        stage.frame(shots.bedside);
      },
      async sitBesideRibbit() {
        if (!await stage.walkTo([points.SEAT], { speed: 1 }) || !live()) return;
        stage.sit(seatY, { lookAt: points.RIBBIT_ON_BED });
        stage.frame(shots.seated);
        await stage.wait(0.65);
      },
      async ribbitSitsUp() {
        setDistress(tally.correct >= 2 ? 0 : 1);
        setPose('sitting');
        stage.frame(shots.seated);
        await stage.wait(1.5);
      },
    };

    game.playDialogue('level1Ribbit', {
      ...scoring, startAt: 'l1_inside',
      lineFor: node => node.id === 'l1_recovery' && tally.correct < 2
        ? { ...node, text: 'I’m still a mess. But… it helps that you stayed. I think I can sit up for a bit.' }
        : node,
      onNode: node => actions[node.action]?.(),
      async onComplete() {
        if (!live()) return;
        onComplete?.(tally.points);
        stage.hold(true);
        stage.stand();
        if (!await stage.walkTo([points.BEDSIDE]) || !live()) return;
        stage.releaseCamera();
        stage.lookAt(points.DOORWAY);
        stage.hold(false);
        door.open();
        game.showHint(story
          ? 'Ribbit is steadier. Leave her room and look for Kaufmo.'
          : 'Ribbit is steadier. You can leave through the door.', 6500);
      },
    });
  }

  if (hall) {
    hall.hallDoors?.ribbit?.shut();
    const door = ribbitsDormDoor(hall.group);
    stage.place({ ...KNOCK_SPOT, lookAt: RIBBIT_DOOR });
    knock(door);
  } else {
    await atTheDoor();
  }
}

const RIBBIT_DOOR = { x: -3.6, z: -110.31 };
const KNOCK_SPOT = { x: -2.2, z: -110.31 };

function ribbitsDormDoor(group) {
  const parts = ['Door_Slab089', 'Ribbit'].map(name => group.getObjectByName(name)).filter(Boolean);
  const meshes = [];
  for (const part of parts) part.traverse(child => { if (child.isMesh) meshes.push(child); });
  const knockSpot = new THREE.Object3D();
  knockSpot.position.set(KNOCK_SPOT.x, 0, KNOCK_SPOT.z);
  group.add(knockSpot);
  return {
    meshes, knockSpot,
    restore() {
      for (const part of parts) if (part.userData.knockBaseX !== undefined) part.position.x = part.userData.knockBaseX;
    },
    rattle(tap) {
      for (const part of parts) {
        part.userData.knockBaseX ??= part.position.x;
        part.position.x = part.userData.knockBaseX + (tap % 2 ? -0.012 : 0.012);
      }
    },
  };
}
