import * as THREE from 'three';
import { loadKaufmoTalk } from '../characters/kaufmoTalk.js';
import { loadRibbit } from '../characters/ribbit.js';
import { loadJax } from '../characters/jax.js';

// After Level 2: Pomni, Ribbit and Kaufmo gather in the Dorm Hall between
// Kaufmo's and Ribbit's doors and find Jax further down it, for
// level3JaxDialogue. He bolts back up the hall past them, toward the Lobby
// and the maze, and the three talk it over. Staged in the real, loaded
// hall like Kaufmo's hallway run (kaufmoHallwayCutscene.js); main.js
// (playHallwayGathering) plays the dialogue, feeds each node to onNode
// and drives update.

const JAX_RUN_SPEED = 5.5;
const RUN_HOLD = 0.35; // after he's out of the shot, before the beat's caption

export async function loadHallwayGatheringCast() {
  const [kaufmoApi, ribbitApi, jaxApi] = await Promise.all([loadKaufmoTalk(), loadRibbit(), loadJax()]);
  return { kaufmoApi, ribbitApi, jaxApi };
}

/** Everyone's mark and the two shots, measured off the real doors (hall down -Z, centred on x = 0). */
export function hallwayGatheringPlan(room) {
  room.group.updateMatrixWorld(true);
  const centre = (name) => {
    const frame = room.group.getObjectByName(name);
    if (!frame) throw new Error(`Missing hallway door: ${name}`);
    return new THREE.Box3().setFromObject(frame).getCenter(new THREE.Vector3());
  };
  const ribbitDoor = centre('Door_Frame089');
  const kaufmoDoor = centre('Door_Frame087');
  const y = room.spawn.y;
  // Metres back up the hall (toward Kaufmo's door) from Ribbit's.
  const up = Math.sign(kaufmoDoor.z - ribbitDoor.z);
  if (!up) throw new Error('Hallway doors unavailable');
  const at = (x, back, height = y) => new THREE.Vector3(x, height, ribbitDoor.z + up * back);
  const jax = at(-1.6, -0.7);
  return {
    // Pomni a step ahead of the other two, all three facing Jax.
    pomni: at(0.8, 3.9),
    ribbit: at(-1.4, 5.9),
    kaufmo: at(2.2, 6.1),
    jax,
    // Past them up the hall's left side, clear of Ribbit, and on out of sight.
    jaxRun: [jax, at(-2.9, 3.2), at(-2.9, 30)],
    // Between the three once Jax has gone, for them to turn to.
    huddle: at(0.3, 5.3),
    shots: {
      // Behind them on the right, down the hall at Jax, with nobody in
      // front of him: his run goes past on the left.
      approach: { position: at(2.4, 10.3, y + 1.7), target: at(-0.6, 0.8, y + 1.1) },
      // From the left wall, a little down the hall: Ribbit's and Kaufmo's
      // faces, Pomni side-on between them.
      huddle: { position: at(-3.2, 2.0, y + 1.6), target: at(0.1, 5.2, y + 1.0) },
    },
  };
}

/**
 * Puts the cast on their marks in the room and returns the scene's driver:
 * onNode(node) answers each dialogue node with what main.js should do
 * ({ shot, pomniLooksAt, wait }), update(deltaSeconds) runs every frame.
 */
export function stageHallwayGathering(room, { kaufmoApi, ribbitApi, jaxApi }, plan) {
  const { kaufmo } = kaufmoApi;
  const { ribbit } = ribbitApi;
  const { jax } = jaxApi;
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  kaufmo.position.copy(plan.kaufmo);
  ribbit.position.copy(plan.ribbit);
  jax.position.copy(plan.jax);
  kaufmo.rotation.y = yawTo(plan.kaufmo, plan.jax);
  ribbit.rotation.y = yawTo(plan.ribbit, plan.jax);
  jax.rotation.y = yawTo(plan.pomni, plan.jax); // back turned to them
  jax.visible = true;
  ribbitApi.setPose('standing', { immediate: true });
  kaufmoApi.setPose('worried');
  room.group.add(kaufmo, ribbit, jax);

  let run = null; // { leg, hold, resolve } while Jax is running off
  let regrouped = false;

  function bolt() {
    return new Promise((resolve) => {
      run = { leg: 0, hold: RUN_HOLD, resolve };
      startLeg();
    });
  }
  function startLeg() {
    const [from, to] = [plan.jaxRun[run.leg], plan.jaxRun[run.leg + 1]];
    jaxApi.playPassBy(from, to, from.distanceTo(to) / JAX_RUN_SPEED);
  }

  function onNode(node) {
    const speaking = node.type === 'line' ? node.speaker : null;
    kaufmoApi.setSpeaking(speaking === 'kaufmo');
    kaufmoApi.setListening(Boolean(speaking) && speaking !== 'kaufmo');
    if (regrouped && speaking === 'pomni') ribbitApi.faceTowards(plan.pomni);
    // Pomni telling Ribbit he's found the missing pieces.
    if (regrouped && speaking === 'pomni' && node.mood === 'happy') kaufmoApi.setPose('happy');

    if (node.id === 'jaxStiffens') jaxApi.faceTowards(plan.pomni);
    if (node.id === 'jaxBolts') {
      kaufmoApi.setPose('shocked');
      return { wait: bolt() };
    }
    if (node.id === 'regroup') {
      regrouped = true;
      kaufmoApi.setPose('worried');
      kaufmoApi.faceTowards(plan.pomni);
      ribbitApi.faceTowards(plan.pomni);
      return { shot: plan.shots.huddle, pomniLooksAt: plan.huddle };
    }
    return {};
  }

  function update(deltaSeconds) {
    kaufmoApi.update(deltaSeconds);
    ribbitApi.update(deltaSeconds);
    jaxApi.update(deltaSeconds);
    // Each leg hides him as it ends (jax.js playPassBy): on to the next.
    if (!run || jax.visible) return;
    if (run.leg < plan.jaxRun.length - 2) {
      run.leg++;
      startLeg();
    } else if ((run.hold -= deltaSeconds) <= 0) {
      run.resolve();
      run = null;
    }
  }

  return { onNode, update };
}
