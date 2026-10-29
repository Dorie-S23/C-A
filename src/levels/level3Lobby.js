import * as THREE from 'three';

// Level 3's way in, in the Lobby (KAN-54, KAN-55). Jax has bolted out of
// the Dorm Hall ahead of Pomni (level3Hallway.js); she finds him alone in
// the corner by the toy blocks (tadcRoom.js puts him there), back turned
// and glitching. Walking up to him starts level3Jax, which acts out its
// stage directions (dialogues.js `action`s): he turns, a glitch tears
// across him, and he runs off along the wall of bedroom doors. The camera
// cuts away before he reaches them, so which one leads into the maze is
// Pomni's to find out. Once he's gone, it does (lobbyMazeDoor.js).

const TALK_RADIUS = 6;            // metres from Jax that starts the talk
const REARM_RADIUS = 8;           // after an interrupted talk: step back out this far first
const TALK_DISTANCE = 3.1;        // where Pomni stops, behind him
const RUN_SPEED = 7;              // m/s
const RUN_WATCHED_SECONDS = 1.4;  // the shot follows him this long before cutting away
const UP = new THREE.Vector3(0, 1, 0);

/**
 * @param {object} game main.js's missionApi
 * @param {object} room the loaded Lobby, with jaxCorner and mazeDoor
 * @param {{ onGone?: () => void }} [options] called once the talk is over
 *   and he's gone through the maze door (however it ended, once he ran)
 */
export function runLobbyScene(game, room, { onGone } = {}) {
  const { stage } = game;
  const token = game.token;
  const live = () => game.token === token && game.isRoom(room);
  const { jaxApi, spot, facing, runTo } = room.jaxCorner;
  const jax = jaxApi.jax;
  const intoCorner = facing.clone().sub(spot).setY(0).normalize();
  const pomniMark = spot.clone().addScaledVector(intoCorner, -TALK_DISTANCE);
  const shots = lobbyShots({ spot, pomniMark, runTo, intoCorner });

  let phase = 'standing'; // standing -> talking -> done (or rearming)
  let gone = false;       // run off through the maze door

  const actions = {
    jaxTurns() {
      jaxApi.faceTowards(pomniMark);
    },
    jaxGlitches() {
      jaxApi.glitch();
    },
    async jaxRunsOff() {
      stage.frame(shots.runOff);
      jaxApi.setGlitching(false);
      jaxApi.playPassBy(jax.position.clone(), runTo, jax.position.distanceTo(runTo) / RUN_SPEED, { stay: true });
      stage.lookWithHead(runTo);
      if (!await stage.wait(RUN_WATCHED_SECONDS) || !live() || phase === 'done') return;
      // Cut to Pomni before he reaches the doors: which one he takes isn't seen.
      vanish();
      stage.lookWithHead(null);
      stage.lookAt(runTo);
      stage.frame(shots.alone);
      await stage.wait(0.6);
    },
  };

  function talk() {
    phase = 'talking';
    stage.place({ x: pomniMark.x, z: pomniMark.z, lookAt: spot });
    stage.frame(shots.talk);
    const started = game.playDialogue('level3Jax', {
      onNode: (node) => actions[node.action]?.(),
      distressFor: (node) => node.distress ?? 0,
      onComplete: finish,
      onCancel: interrupted,
    });
    if (!started) {
      stage.releaseCamera();
      phase = 'rearming';
    }
  }

  function finish() {
    if (!live() || phase === 'done') return;
    phase = 'done';
    if (!gone) vanish();
    stage.lookWithHead(null);
    stage.releaseCamera();
    room.mazeDoor?.arm();
    onGone?.();
  }

  // Leaving the conversation early. Once he's run, the talk has done its
  // job; before that he's still in his corner, and walking back up to him
  // plays it again.
  function interrupted() {
    if (!live()) return;
    if (gone || jaxApi.isRunning()) { finish(); return; }
    stage.lookWithHead(null);
    stage.releaseCamera();
    jaxApi.faceTowards(facing);
    phase = 'rearming';
  }

  function vanish() {
    gone = true;
    jaxApi.setShown(false);
  }

  room.storyUpdate = (deltaSeconds, playerPosition) => {
    if (!live() || !playerPosition) return;
    const apart = Math.hypot(playerPosition.x - spot.x, playerPosition.z - spot.z);
    if (phase === 'rearming' && apart > REARM_RADIUS) phase = 'standing';
    if (phase === 'standing' && apart < TALK_RADIUS && game.playing) talk();
  };
}

/** The scene's camera shots, from where the two of them stand. */
function lobbyShots({ spot, pomniMark, runTo, intoCorner }) {
  const at = (point, offset) => point.clone().add(offset).toArray();
  // Side on to the pair, from the side away from the toy blocks.
  const side = new THREE.Vector3(-intoCorner.z, 0, intoCorner.x);
  const middle = spot.clone().lerp(pomniMark, 0.5);
  // Watching him go: from back over Pomni's shoulder, up the line of doors.
  const along = runTo.clone().sub(spot).setY(0).normalize();
  const away = new THREE.Vector3(along.z, 0, -along.x); // out from the wall (the corner's side), into the Lobby
  if (away.dot(intoCorner) > 0) away.negate();
  // Then on her, from the way he went, so he's behind the camera.
  const watching = runTo.clone().sub(pomniMark).setY(0).normalize();
  return {
    talk: {
      position: at(middle, side.clone().multiplyScalar(3.4).addScaledVector(UP, 1.9)),
      target: at(middle, UP.clone().multiplyScalar(1.2)),
    },
    runOff: {
      position: at(spot, along.clone().multiplyScalar(-2).addScaledVector(away, 3.6).addScaledVector(UP, 2.3)),
      target: at(spot, along.clone().multiplyScalar(16).addScaledVector(UP, 1.2)),
    },
    alone: {
      position: at(pomniMark, watching.clone().multiplyScalar(2.6).addScaledVector(UP, 1.75)),
      target: at(pomniMark, UP.clone().multiplyScalar(1.45)),
    },
  };
}
