import * as THREE from 'three';
import { JAX_RUN_SPEED } from '../cutscenes/hallwayGatheringCutscene.js';

// Level 2 into 3, in the Dorm Hall (Dorsa's transition script, KAN-54).
// Pomni comes out of Kaufmo's room to find Jax down the hall by Ribbit's
// door, and he bolts back up it past her and out of sight, on the hall
// gathering's route (dormHallRoom.js marks it from hallwayGatheringPlan).
// Ribbit walks up, and Pomni sends her for the others rather than let her
// follow (level3Hallway in dialogues.js, its `action`s acted out here).
// dormHallRoom.js loads the two of them.

const RUN_HOLD = 0.35;           // after he's out of the shot, before "Jax, wait!"
const RIBBIT_STEP = 0.6;         // metres she steps after him before Pomni stops her
const RIBBIT_STEP_SECONDS = 0.45;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * @param {object} game main.js's missionApi
 * @param {object} room the loaded Dorm Hall, with jaxHallway
 * @param {{ onDone?: () => void }} [options] called once the scene is over, however it ended
 */
export function runHallwayScene(game, room, { onDone } = {}) {
  const { stage } = game;
  const token = game.token;
  const live = () => game.token === token && game.isRoom(room);
  const { jaxApi, ribbitApi, marks } = room.jaxHallway;
  const ribbit = ribbitApi.ribbit;
  // Up the hall from her: where Jax goes, and where Pomni goes after him.
  const upHall = new THREE.Vector3(marks.pomni.x, marks.pomni.y, marks.jaxRun.at(-1).z);
  const shots = hallwayShots(marks);

  let phase = 'waiting'; // waiting -> playing -> done
  let run = null;        // { leg, resolve } while Jax runs the route, a leg at a time
  let step = null;       // { from, to, elapsed } while Ribbit steps after him

  function startLeg() {
    const [from, to] = [marks.jaxRun[run.leg], marks.jaxRun[run.leg + 1]];
    jaxApi.playPassBy(from, to, from.distanceTo(to) / JAX_RUN_SPEED, { stay: true });
  }

  /** Off up the hall and out of sight; resolves once he's gone. */
  function bolt() {
    jaxApi.setGlitching(false);
    return new Promise((resolve) => {
      run = { leg: 0, resolve };
      startLeg();
    });
  }

  function endRun() {
    jaxApi.setShown(false);
    const pending = run;
    run = null;
    pending?.resolve();
  }

  const actions = {
    async jaxBolts() {
      stage.frame(shots.bolt);
      await bolt();
      if (!live() || phase === 'done') return;
      if (!await stage.wait(RUN_HOLD) || !live()) return;
      // Shouting after him, up the hall where he went.
      stage.lookAt(upHall);
      stage.frame(shots.alone);
    },
    async ribbitArrives() {
      ribbit.position.copy(marks.ribbit);
      ribbit.visible = true;
      ribbitApi.faceTowards(marks.pomni);
      stage.lookAt(marks.ribbit);
      stage.frame(shots.ribbit);
      await stage.wait(0.4);
    },
    async pomniStopsRibbit() {
      const toward = upHall.clone().sub(ribbit.position).setY(0).normalize();
      ribbitApi.faceTowards(upHall);
      step = { from: ribbit.position.clone(), to: ribbit.position.clone().addScaledVector(toward, RIBBIT_STEP), elapsed: 0 };
      if (!await stage.wait(RIBBIT_STEP_SECONDS) || !live()) return;
      stage.lookAt(ribbit.position);
      void stage.gesture('armOut');
      ribbitApi.faceTowards(marks.pomni);
      await stage.wait(0.5);
    },
    async ribbitLeaves() {
      ribbit.visible = false;
      stage.lookAt(upHall);
      stage.frame(shots.alone);
      await stage.wait(0.6);
    },
  };

  function start() {
    phase = 'playing';
    // Kaufmo's door swings shut behind her: his part's done, and it no
    // longer stands open across the hall while Jax runs past.
    room.hallDoors?.kaufmo?.control.close();
    // She's just seen him, down the hall.
    stage.place({ x: marks.pomni.x, z: marks.pomni.z, lookAt: marks.jax });
    const started = game.playDialogue('level3Hallway', {
      onNode: (node) => actions[node.action]?.(),
      onComplete: finish,
      // Leaving the room ends it with nothing done (the next visit plays it
      // again); otherwise Jax has been and gone, which is the scene's job.
      onCancel: finish,
    });
    if (!started) phase = 'waiting';
  }

  function finish() {
    if (!live() || phase === 'done') return;
    phase = 'done';
    step = null;
    ribbit.visible = false;
    endRun();
    stage.releaseCamera();
    stage.lookAt(upHall);
    onDone?.();
  }

  room.storyUpdate = (deltaSeconds) => {
    if (!live()) return;
    // Each leg stops him at its end: on to the next, or gone after the last.
    if (run && !jaxApi.isRunning()) {
      if (run.leg < marks.jaxRun.length - 2) {
        run.leg++;
        startLeg();
      } else {
        endRun();
      }
    }
    if (step) {
      step.elapsed += deltaSeconds;
      const t = Math.min(step.elapsed / RIBBIT_STEP_SECONDS, 1);
      ribbit.position.lerpVectors(step.from, step.to, t * t * (3 - 2 * t));
      if (t >= 1) step = null;
    }
    // Not until the player has control: after a load, "Click to Play" is up.
    if (phase === 'waiting' && game.playing) start();
  };
}

/** The scene's camera shots, from where everyone stands. */
function hallwayShots({ pomni, jax, ribbit }) {
  const at = (point, height) => point.clone().addScaledVector(UP, height).toArray();
  // Over her left shoulder (by the wall) from up the hall, down it at Jax:
  // his run comes back up the middle, past her right, so the camera isn't
  // in his way.
  const overShoulder = pomni.clone().add(new THREE.Vector3(-1, 1.8, 3.4));
  // Behind her, down the hall, looking up it after him.
  const behind = pomni.clone().add(new THREE.Vector3(-0.4, 1.9, -3.6));
  const upTheHall = pomni.clone().add(new THREE.Vector3(1.2, 1.4, 20));
  // Side on to her and Ribbit, from the open middle of the hall.
  const middle = pomni.clone().lerp(ribbit, 0.5);
  const across = ribbit.clone().sub(pomni).setY(0).normalize();
  const side = new THREE.Vector3(-across.z, 0, across.x);
  if (side.x < 0) side.negate();
  const twoShot = middle.clone().addScaledVector(side, 3.2).addScaledVector(UP, 1.8);
  return {
    bolt: { position: overShoulder.toArray(), target: at(jax, 1.1) },
    ribbit: { position: twoShot.toArray(), target: at(middle, 1.15) },
    alone: { position: behind.toArray(), target: upTheHall.toArray() },
  };
}
