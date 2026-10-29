import * as THREE from 'three';

// Level 2 into 3, in the Dorm Hall (Dorsa's transition script, KAN-54).
// Pomni comes out of Kaufmo's room as Jax bolts past her, up the hall and
// out through the entrance arch; Ribbit walks up, and Pomni sends her for
// the others rather than let her follow (level3Hallway in dialogues.js,
// its `action`s acted out here). dormHallRoom.js loads the two of them.

const JAX_RUN_SPEED = 7.5;       // m/s: gone up the hall in a flash
const BOLT_WATCH_SECONDS = 2.1;  // the shot follows him this long before "Jax, wait!"
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
  const upHall = new THREE.Vector3(marks.pomni.x, marks.pomni.y, marks.jaxTo.z);
  const shots = hallwayShots(marks);

  let phase = 'waiting'; // waiting -> playing -> done
  let running = false;   // Jax on his way up the hall
  let step = null;       // { from, to, elapsed } while Ribbit steps after him

  const actions = {
    async jaxBolts() {
      stage.frame(shots.bolt);
      jaxApi.setShown(true);
      jaxApi.playPassBy(marks.jaxFrom, marks.jaxTo, marks.jaxFrom.distanceTo(marks.jaxTo) / JAX_RUN_SPEED, { stay: true });
      running = true;
      stage.lookWithHead(marks.jaxTo);
      await stage.wait(BOLT_WATCH_SECONDS);
    },
    async ribbitArrives() {
      ribbit.position.copy(marks.ribbit);
      ribbit.visible = true;
      ribbitApi.faceTowards(marks.pomni);
      stage.lookWithHead(null);
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
    stage.place({ x: marks.pomni.x, z: marks.pomni.z, lookAt: upHall });
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
    // Still on his way up the hall, he's hidden once he's through the arch.
    if (!running) jaxApi.setShown(false);
    stage.lookWithHead(null);
    stage.releaseCamera();
    stage.lookAt(upHall);
    onDone?.();
  }

  room.storyUpdate = (deltaSeconds) => {
    if (!live()) return;
    if (running && !jaxApi.isRunning()) {
      running = false;
      jaxApi.setShown(false);
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
function hallwayShots({ pomni, ribbit }) {
  const at = (point, height) => point.clone().addScaledVector(UP, height).toArray();
  const shot = (position, target) => ({ position: position.toArray(), target: target.toArray() });
  // Behind her, down the hall, looking up it: Jax comes past on the right.
  const behind = pomni.clone().add(new THREE.Vector3(-0.7, 2.0, -4.3));
  const upTheHall = pomni.clone().add(new THREE.Vector3(2.2, 1.3, 18));
  // Side on to the two of them, from the open middle of the hall.
  const middle = pomni.clone().lerp(ribbit, 0.5);
  const across = ribbit.clone().sub(pomni).setY(0).normalize();
  const side = new THREE.Vector3(-across.z, 0, across.x);
  if (side.x < 0) side.negate();
  const twoShot = middle.clone().addScaledVector(side, 3.2).addScaledVector(UP, 1.8);
  return {
    bolt: shot(behind, upTheHall),
    ribbit: { position: twoShot.toArray(), target: at(middle, 1.15) },
    alone: shot(pomni.clone().add(new THREE.Vector3(-0.4, 1.9, -3.6)), pomni.clone().add(new THREE.Vector3(1.2, 1.4, 20))),
  };
}
