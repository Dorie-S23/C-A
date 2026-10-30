import * as THREE from 'three';
import { loadPomni } from '../characters/pomni.js';
import { loadJax } from '../characters/jax.js';
import { loadRibbit } from '../characters/ribbit.js';
import { loadRagatha } from '../characters/ragatha.js';
import { loadKaufmoTalk } from '../characters/kaufmoTalk.js';
import { loadCaine } from '../characters/caine.js';
import { loadKinger } from '../characters/kinger.js';
import { loadGangle } from '../characters/gangle.js';
import { loadZooble } from '../characters/zooble.js';
import { createCharacterPerformance } from '../cinematics/characterPerformance.js';

// NOT PLAYED: the game's ending now runs over slides (ui/endingSlides.js, see
// playEnding in main.js). This 3D staging is kept, and still checked by
// test/_verify_ending_cast.mjs, in case the team wants it back.
//
// The ending (Dorsa's "End of game script"), in two parts. main.js
// (playEnding) ran them in turn, playing a conversation over each
// (endingLobby*Dialogue, then exitDoor*Dialogue) and feeding its nodes to
// onNode, whose `action`s these act out.
//
// 1. The maze entrance: the Circus Lobby, just outside the maze door (the
//    real, loaded room). Pomni walks out, with Jax if he was won over, to
//    everyone waiting there, Caine a little apart. They talk, then Kaufmo
//    leads them off at a run.
// 2. A space of its own: a quiet corridor at the far edge of the circus,
//    a single red door at its end. They go through one by one, then
//    Pomni says goodbye to Caine and follows. The other side is never shown.
//
// The same cast plays both: loaded once, staged in the Lobby, then moved
// into the corridor. Gangle, Zooble and Kinger are procedural rigs (KAN-90)
// driven by cinematics/characterPerformance.js.

const GATE_Z = -8; // the red door's end wall, along x; the door at x = 0, facing +Z
const POMNI_WALK = { saved: 1.5, abstracted: 0.9 }; // m/s out of the maze, by variant
const RUN_SPEED = 4.2;     // m/s, everyone after Kaufmo
const RUN_DISTANCE = 13;   // metres on from the group, out into the Lobby
const CAINE_DRIFT_SECONDS = 1.6;
const LEAVE_SPEED = 1.4;   // m/s, walking to the red door
const DOOR_SWING_SECONDS = 1.1;
const MAZE_DOOR_ARRIVAL = 2.4; // lobbyMazeDoor.js ARRIVAL_DISTANCE: its spawn, this far out of the doorway
const ACTION_FADE = 0.3;
const SPEAKING_EXTRAS = ['gangle', 'zooble', 'kinger'];
// The Lobby's one camera (lobbyEndingPlan wideAround): how far out to the
// side of the group, back toward the maze wall, and up.
const WIDE_SIDE = 6.5;
const WIDE_BACK = 4.5;
const WIDE_HEIGHT = 4.2;

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

/** Loads everyone in the ending: Jax only if he was saved; a Pomni of its own for the corridor. */
export async function loadEndingCast(variant) {
  const [pomni, jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi, kingerApi, gangleApi, zoobleApi] = await Promise.all([
    loadPomni(), variant === 'saved' ? loadJax() : null, loadRibbit(), loadRagatha(), loadKaufmoTalk(), loadCaine(),
    loadKinger(), loadGangle(), loadZooble(),
  ]);
  // The procedural Kinger, Gangle and Zooble (KAN-90), driven by the
  // shared performance system.
  const extras = [
    { key: 'kinger', root: kingerApi.kinger, rig: { ...kingerApi.rig, prop: kingerApi.pillow } },
    { key: 'gangle', root: gangleApi.gangle, rig: gangleApi.rig },
    { key: 'zooble', root: zoobleApi.zooble, rig: zoobleApi.rig },
  ].map(({ key, root, rig }) => ({ key, root, performance: createCharacterPerformance({ root, rig }) }));
  extras[0].performance.clutch(); // Kinger holds his pillow through both scenes
  return { pomni, jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi, extras };
}

/** Speaking, listening and a little gesture for whoever has the line (both parts). */
function castSpeaks(cast, speaker, listenTo) {
  const { ragathaApi, kaufmoApi, caineApi, extras } = cast;
  ragathaApi.setSpeaking(speaker === 'ragatha');
  kaufmoApi.setSpeaking(speaker === 'kaufmo');
  kaufmoApi.setListening(Boolean(speaker) && speaker !== 'kaufmo');
  caineApi.setSpeaking(speaker === 'caine');
  const extra = SPEAKING_EXTRAS.includes(speaker) && extras.find(entry => entry.key === speaker);
  if (extra) {
    void extra.performance.lookTowards(listenTo);
    // Kinger keeps hold of his pillow while he talks.
    if (speaker !== 'kinger') void extra.performance.gesture('talk');
  }
}

// --- Part 1: the maze entrance, in the Lobby ------------------------------

/**
 * Everyone's marks and the camera in the Lobby, measured off the maze door
 * from its portal's arrival ({ spawn, facing }, lobbyMazeDoor.js): 2.4 m
 * out of the doorway, facing out into the Lobby.
 */
export function lobbyEndingPlan({ spawn, facing }) {
  // Yaw 0 faces -Z, so out of the doorway is the way she faces on arrival.
  const out = v(-Math.sin(facing), 0, -Math.cos(facing));
  const across = v(-out.z, 0, out.x);
  const centre = spawn.clone().addScaledVector(out, -MAZE_DOOR_ARRIVAL);
  const at = (distance, side, up = 0) => centre.clone()
    .addScaledVector(out, distance).addScaledVector(across, side).setY(spawn.y + up);
  const runEnd = RUN_DISTANCE + 6;
  return {
    out,
    across,
    door: at(0, 0),
    pomniWalk: [at(-0.3, 0), at(2.6, 0)],
    jaxWalk: [at(-0.5, 1.0), at(2.4, 1.1)], // on her other side from the maze door as it swings open
    // Ribbit and Kaufmo at the front, the others behind them.
    ribbit: at(5.2, -1.6),
    kaufmo: at(5.6, 0.6),
    kaufmoForward: at(4.3, 0.4),
    ragatha: at(6.6, 1.9),
    ragathaHold: at(5.2, -0.8), // beside Ribbit, an arm round her
    gangle: at(7.0, -3.0),
    zooble: at(7.5, -0.6),
    kinger: at(7.9, 2.8),
    // A little apart, floating; in the sad variant he drifts closer.
    caine: at(5.2, 4.6, 0.5),
    caineCloser: at(4.0, 2.6, 0.4),
    // Where everyone runs to, after Kaufmo, out across the Lobby.
    run: {
      kaufmo: at(runEnd + 1.5, 0.2),
      ribbit: at(runEnd, -1.4),
      jax: at(runEnd - 0.6, -2.6),
      ragatha: at(runEnd - 0.4, 1.4),
      gangle: at(runEnd - 1.8, -0.4),
      zooble: at(runEnd - 2.2, 1.2),
      kinger: at(runEnd - 3.4, 0.4),
      pomni: at(runEnd - 2.6, -1.4),
    },
    // The one camera: wide and side on, a little above them, far enough out
    // to keep everyone in view (the maze door too, before the run). It
    // follows them on the run, at the same angle.
    wideAround(centre) {
      return {
        position: centre.clone().addScaledVector(across, -WIDE_SIDE).addScaledVector(out, WIDE_BACK).setY(spawn.y + WIDE_HEIGHT),
        target: centre.clone().setY(spawn.y + 0.95),
      };
    },
    gatherCentre: at(4.0, 0.8),
  };
}

/**
 * Puts the cast on their marks in the loaded Lobby and returns its driver:
 * onNode(node) acts out each node of endingLobby*Dialogue, detach() takes
 * the cast back out of the room for the corridor. `stage` is main.js's
 * (place, walkTo, frame, lookAt, lookWithHead, wait).
 */
export function stageLobbyEnding(room, stage, variant, cast, plan) {
  const { jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi, extras } = cast;
  const { ribbit } = ribbitApi;
  const { ragatha } = ragathaApi;
  const { kaufmo } = kaufmoApi;
  const { caine } = caineApi;
  const sad = variant === 'abstracted';
  const pomniAt = plan.pomniWalk[1];
  const extra = key => extras.find(entry => entry.key === key);

  const place = (object, mark, lookAt = plan.door) => {
    object.position.copy(mark);
    object.rotation.y = yawTo(mark, lookAt);
    object.visible = true;
    room.group.add(object);
  };
  place(ribbit, plan.ribbit);
  place(ragatha, plan.ragatha);
  place(kaufmo, plan.kaufmo);
  place(caine, plan.caine);
  for (const entry of extras) place(entry.root, plan[entry.key]);
  ribbitApi.setPose('standing', { immediate: true });
  ragathaApi.setPose('watch');
  kaufmoApi.setPose('worried');
  caineApi.setPose(sad ? 'sad' : 'worried');
  if (jaxApi) {
    jaxApi.jax.visible = false;
    room.group.add(jaxApi.jax);
  }

  // One steady camera on everyone (see wideAround), moved along with them on the run.
  const frameAround = (centre) => {
    const shot = plan.wideAround(centre);
    stage.frame({ position: shot.position.toArray(), target: shot.target.toArray() });
  };
  const runCentre = new THREE.Vector3();
  let detached = false;
  // Pomni just inside the doorway, out of sight until she walks out.
  stage.place({ x: plan.pomniWalk[0].x, z: plan.pomniWalk[0].z, lookAt: pomniAt });
  frameAround(plan.gatherCentre);
  const bowHead = () => stage.lookWithHead(pomniAt.clone().addScaledVector(plan.out, 1.2).setY(pomniAt.y - 0.6));

  async function walkOut() {
    if (sad) { bowHead(); stage.lowerArms?.(true); }
    if (jaxApi) {
      const [from, to] = plan.jaxWalk;
      jaxApi.playPassBy(from, to, from.distanceTo(to) / POMNI_WALK[variant] * 1.08, { style: 'sly', stay: true });
    }
    const arrived = await stage.walkTo([pomniAt], { speed: POMNI_WALK[variant] });
    if (!arrived) return false;
    for (const api of [ribbitApi, ragathaApi, kaufmoApi]) api.faceTowards(pomniAt);
    for (const entry of extras) void entry.performance.turnTowards(pomniAt);
    return stage.wait(0.6);
  }

  // Everyone after Kaufmo, out across the Lobby. Resolves once they're there.
  let runners = null; // [{ object, to, onStep }]
  let runDone = null;
  async function run() {
    if (sad) {
      // She lingers a second, looking back at the maze entrance.
      stage.lookAt(plan.door);
      if (!await stage.wait(1.2) || detached) return false;
    }
    stage.lookWithHead(null);
    stage.lowerArms?.(false);
    kaufmoApi.setPose(sad ? 'sad' : 'happy');
    kaufmoApi.setActivity('walk');
    ragathaApi.setPose('idle');
    runners = [
      { object: kaufmo, to: plan.run.kaufmo, speed: RUN_SPEED * 1.05 },
      { object: ribbit, to: plan.run.ribbit, speed: RUN_SPEED },
      { object: ragatha, to: plan.run.ragatha, speed: RUN_SPEED * 0.97 },
    ];
    for (const entry of extras) void entry.performance.runTo(plan.run[entry.key], { speed: RUN_SPEED * 0.92 });
    if (jaxApi) {
      const from = jaxApi.jax.position.clone();
      jaxApi.playPassBy(from, plan.run.jax, from.distanceTo(plan.run.jax) / RUN_SPEED, { stay: true });
    }
    caine.visible = false; // he doesn't come along; he's at the red door when they get there
    const pomniRun = stage.walkTo([plan.run.pomni], { speed: RUN_SPEED * 0.95 });
    await Promise.all([pomniRun, new Promise((resolve) => { runDone = resolve; })]);
    kaufmoApi.setActivity(null);
  }
  function stepRunners(deltaSeconds) {
    if (!runners) return;
    let moving = false;
    for (const runner of runners) {
      const { object, to } = runner;
      const gap = Math.hypot(to.x - object.position.x, to.z - object.position.z);
      const step = runner.speed * deltaSeconds;
      if (gap <= step) { object.position.x = to.x; object.position.z = to.z; continue; }
      moving = true;
      object.rotation.y = yawTo(object.position, to);
      object.position.x += (to.x - object.position.x) / gap * step;
      object.position.z += (to.z - object.position.z) / gap * step;
    }
    if (runners.length > 1) {
      runCentre.set(0, 0, 0);
      for (const { object } of runners) runCentre.add(object.position);
      frameAround(runCentre.divideScalar(runners.length));
    }
    if (!moving) {
      runners = null;
      const finish = runDone;
      runDone = null;
      finish?.(true);
    }
  }

  function onNode(node) {
    const speaker = node.type === 'line' ? node.speaker : null;
    castSpeaks(cast, speaker, pomniAt);

    switch (node.action) {
      case 'walkOut':
        return walkOut();
      case 'ribbitToJax':
        ribbitApi.faceTowards(plan.jaxWalk[1]);
        jaxApi?.faceTowards(plan.ribbit);
        break;
      case 'kaufmoOffers':
        kaufmoApi.faceTowards(plan.jaxWalk[1]);
        break;
      case 'caineSpots':
        caineApi.faceTowards(pomniAt);
        break;
      case 'caineFreezes':
        for (const entry of extras) void entry.performance.turnTowards(plan.caine);
        break;
      case 'kaufmoSteps':
        kaufmoApi.setActivity('walk');
        return stage.wait(0.1).then(completed => {
          if (!completed || detached) return false;
          return new Promise((resolve) => {
            runners = [{ object: kaufmo, to: plan.kaufmoForward, speed: 1.2 }];
            runDone = completed => {
              runDone = null;
              kaufmoApi.setActivity(null);
              kaufmoApi.faceTowards(pomniAt);
              resolve(completed);
            };
          });
        });
      case 'jaxToKaufmo':
        jaxApi?.faceTowards(plan.kaufmoForward);
        kaufmoApi.faceTowards(plan.jaxWalk[1]);
        break;
      case 'ribbitLooks':
        ribbitApi.faceTowards(plan.door);
        return stage.wait(1.4).then(completed => {
          if (!completed || detached) return false;
          ribbitApi.faceTowards(pomniAt);
          return true;
        });
      case 'grief':
        ribbitApi.setDistress(2);
        kaufmoApi.setPose('sad');
        ragathaApi.setPose('worried');
        bowHead();
        break;
      case 'ragathaHolds':
        ragathaApi.walkTo(plan.ragathaHold, () => ragathaApi.faceTowards(plan.ribbit));
        void extra('gangle')?.performance.comfort();
        return stage.wait(2.2);
      case 'kaufmoStares':
        kaufmoApi.faceTowards(plan.door);
        return stage.wait(1.6);
      case 'caineDrifts':
        caineApi.flyTo(plan.caineCloser, CAINE_DRIFT_SECONDS, () => {
          if (!detached) caineApi.faceTowards(pomniAt);
        });
        return stage.wait(CAINE_DRIFT_SECONDS + 0.3);
      case 'run':
        return run();
      case 'montageGangle':
        void extra('gangle')?.performance.react('shock');
        void extra('zooble')?.performance.gesture('reach');
        return stage.wait(1);
      case 'montageGlance':
        jaxApi?.faceTowards(plan.run.ribbit);
        ribbitApi.faceTowards(plan.run.jax);
        return stage.wait(1);
      case 'montageKinger':
        void extra('kinger')?.performance.react('surprise');
        return stage.wait(1);
      default:
    }
    if (speaker === 'pomni' && !sad) stage.lookWithHead(null);
    return undefined;
  }

  room.storyUpdate = (deltaSeconds) => {
    stepRunners(deltaSeconds);
    jaxApi?.update(deltaSeconds);
    ribbitApi.update(deltaSeconds);
    ragathaApi.update(deltaSeconds);
    kaufmoApi.update(deltaSeconds);
    caineApi.update(deltaSeconds);
    for (const entry of extras) entry.performance.update(deltaSeconds);
  };

  return {
    plan,
    onNode,
    detach() {
      if (detached) return;
      detached = true;
      room.storyUpdate = null;
      runners = null;
      runDone?.(false);
      runDone = null;
      castSpeaks(cast, null);
      kaufmoApi.setActivity(null);
      ragathaApi.stopMovement();
      stage.lowerArms?.(false);
      for (const object of [ribbit, ragatha, kaufmo, caine, jaxApi?.jax]) object?.removeFromParent();
      for (const entry of extras) {
        entry.performance.cancel();
        entry.root.removeFromParent();
      }
    },
  };
}

// --- Part 2's set: the corridor and its red door --------------------------

function checkerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#1c1424' : '#efe6d4';
      ctx.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 13);
  return texture;
}

/**
 * A quiet corridor at the far edge of the circus, carnival-striped walls
 * and a checkered floor, and at its end a single red door, out of place
 * against the colours. Returns the set's Group and the door
 * ({ setOpen(open), update(deltaSeconds) }), which swings open into the
 * light behind it and closes again.
 */
export function buildExitCorridor() {
  const set = new THREE.Group();
  set.name = 'ExitCorridor';
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const add = (mesh, { cast = true, receive = true } = {}) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    set.add(mesh);
    return mesh;
  };
  const LENGTH = 26;
  const HALF_WIDTH = 3;
  const HEIGHT = 5.2;
  const middleZ = GATE_Z + LENGTH / 2;

  // Above it, a dim dusky sky: the very edge of the big top.
  const sky = new THREE.SphereGeometry(60, 24, 12);
  const colors = [];
  const horizon = new THREE.Color('#5a3456');
  const zenith = new THREE.Color('#140c24');
  for (let i = 0; i < sky.attributes.position.count; i++) {
    const c = horizon.clone().lerp(zenith, THREE.MathUtils.clamp(sky.attributes.position.getY(i) / 60, 0, 1) ** 0.5);
    colors.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })),
    { cast: false, receive: false });

  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, LENGTH),
    mat('#ffffff', { map: checkerTexture(), roughness: 0.55 })), { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, middleZ);

  // Carnival stripes down both walls, a gold rail along the top.
  const stripes = [mat('#c8203a'), mat('#f2c230'), mat('#2a5fc4'), mat('#efe3c8')];
  const trim = mat('#d9ab30', { metalness: 0.3, roughness: 0.5 });
  for (const side of [-1, 1]) {
    for (let k = 0; k < LENGTH; k++) {
      const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, HEIGHT, 1), stripes[(k + (side > 0 ? 2 : 0)) % 4]));
      panel.position.set(side * (HALF_WIDTH + 0.15), HEIGHT / 2, GATE_Z + 0.5 + k);
    }
    const rail = add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, LENGTH), trim));
    rail.position.set(side * (HALF_WIDTH + 0.1), HEIGHT + 0.11, middleZ);
  }

  // The end wall, dark, so the red door stands out against it.
  const endWall = add(new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 2 + 0.6, HEIGHT, 0.4), mat('#2a1b33')));
  endWall.position.set(0, HEIGHT / 2, GATE_Z - 0.2);
  // Its doorway: light, and a light floor, behind the door.
  const light = new THREE.MeshBasicMaterial({ color: '#fff8ea', fog: false });
  const DOOR_W = 1.3;
  const DOOR_H = 2.5;
  const doorway = add(new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), light), { cast: false, receive: false });
  doorway.position.set(0, DOOR_H / 2, GATE_Z - 0.405);
  const threshold = add(new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, 0.6), light), { cast: false, receive: false });
  threshold.rotation.x = -Math.PI / 2;
  threshold.position.set(0, 0.01, GATE_Z - 0.1);
  // Cut the doorway into the wall: two jambs and a lintel over a gap.
  endWall.geometry.dispose();
  endWall.removeFromParent();
  const wallMat = mat('#2a1b33');
  const sideWidth = HALF_WIDTH + 0.3 - DOOR_W / 2;
  for (const side of [-1, 1]) {
    const piece = add(new THREE.Mesh(new THREE.BoxGeometry(sideWidth, HEIGHT, 0.4), wallMat));
    piece.position.set(side * (DOOR_W / 2 + sideWidth / 2), HEIGHT / 2, GATE_Z - 0.2);
  }
  const lintel = add(new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, HEIGHT - DOOR_H, 0.4), wallMat));
  lintel.position.set(0, DOOR_H + (HEIGHT - DOOR_H) / 2, GATE_Z - 0.2);
  const frameMat = mat('#7a0d14');
  for (const side of [-1, 1]) {
    const jamb = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, DOOR_H + 0.12, 0.5), frameMat));
    jamb.position.set(side * (DOOR_W / 2 + 0.06), (DOOR_H + 0.12) / 2, GATE_Z - 0.18);
  }
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.24, 0.12, 0.5), frameMat));
  head.position.set(0, DOOR_H + 0.06, GATE_Z - 0.18);

  // The door: plain, red, hinged on its left, opening toward the corridor.
  const hinge = new THREE.Group();
  hinge.position.set(-DOOR_W / 2, 0, GATE_Z - 0.02);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.08), mat('#b3121d', { roughness: 0.5 }));
  leaf.position.set(DOOR_W / 2, DOOR_H / 2, 0);
  leaf.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), trim);
  knob.position.set(DOOR_W - 0.14, 1.05, 0.07);
  hinge.add(leaf, knob);
  set.add(hinge);

  // Festoon lights zigzagging overhead.
  const bulbColors = ['#ffd27a', '#ff7aa8', '#8fd3ff', '#b4ff8a'];
  for (let k = 0; k < 40; k++) {
    const t = k / 39;
    const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: bulbColors[k % 4], fog: false })), { cast: false, receive: false });
    bulb.position.set(Math.sin(t * Math.PI * 9) * (HALF_WIDTH - 0.2), HEIGHT - 0.4 - Math.abs(Math.cos(t * Math.PI * 9)) * 0.5,
      GATE_Z + 1 + t * (LENGTH - 2));
  }

  set.add(new THREE.HemisphereLight('#c9b8ff', '#3a2a28', 1.0));
  const key = new THREE.DirectionalLight('#ffd9b0', 1.6);
  key.position.set(-4, 10, 8);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 14, bottom: -14, near: 1, far: 40 });
  key.shadow.bias = -0.0005;
  set.add(key, key.target);
  for (const z of [-4, 2, 8]) {
    const lamp = new THREE.PointLight('#ffcf8f', 8, 9, 2);
    lamp.position.set(0, HEIGHT - 0.8, z);
    set.add(lamp);
  }
  // The light through the door, only while it's open.
  const spill = new THREE.PointLight('#fff4dc', 0, 9, 2);
  spill.position.set(0, 1.4, GATE_Z + 0.8);
  set.add(spill);

  let openness = 0; // 0 shut .. 1 wide open
  let target = 0;
  const door = {
    setOpen(open) { target = open ? 1 : 0; },
    get settled() { return openness === target; },
    update(deltaSeconds) {
      const step = deltaSeconds / DOOR_SWING_SECONDS;
      openness = target > openness ? Math.min(target, openness + step) : Math.max(target, openness - step);
      const eased = THREE.MathUtils.smootherstep(openness, 0, 1);
      hinge.rotation.y = eased * 1.75;
      spill.intensity = eased * 16;
    },
  };
  return { set, door };
}

// --- Part 2: the red door ---------------------------------------------------

/** Everyone's marks and the camera in the corridor, in its set's own coordinates. */
export function exitDoorPlan() {
  return {
    // Just in front of the door, then into the light past it, where each of them is gone.
    approach: v(0, 0, GATE_Z + 1.1),
    through: v(0, 0, GATE_Z - 0.7),
    // Stopped in front of it, Kaufmo nearest.
    kaufmo: v(-0.4, 0, -5.6),
    ribbit: v(-1.6, 0, -4.7),
    ragatha: v(1.3, 0, -4.7),
    jax: v(-0.9, 0, -3.5),
    pomni: v(0.3, 0, -3.1),
    kinger: v(-1.9, 0, -2.6),
    gangle: v(1.9, 0, -3.5),
    zooble: v(1.1, 0, -2.2),
    // Pomni, alone at the door, and Caine a few feet behind her.
    pomniAtDoor: v(0, 0, GATE_Z + 1.2),
    caine: v(-1.5, 0.5, -4.6),
    // The one camera: from behind and above them, down the corridor, wide
    // enough for everyone, the red door and Caine.
    camera: { position: v(2.0, 3.8, 3.2), target: v(-0.1, 0.9, -5.6) },
  };
}

/** Her own copy of Pomni (the player's stays in the Lobby) with Idle/Walk and a bow of the head. */
function stagePomni({ pomni: model, animations }) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of animations) actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
  let current = null;
  const play = (name, rate = 1) => {
    const next = actions[name];
    if (!next) return;
    next.timeScale = rate;
    if (next === current) return;
    next.reset().fadeIn(current ? ACTION_FADE : 0).play();
    current?.fadeOut(ACTION_FADE);
    current = next;
  };
  let head = null;
  let neck = null;
  model.traverse((child) => {
    if (child.name === 'mixamorigHead') head = child;
    if (child.name === 'mixamorigNeck') neck = child;
  });
  let droop = 0;      // 0 head up .. 1 hung low, eased toward droopTarget
  let droopTarget = 0;
  return {
    model,
    play,
    setDroop(value) { droopTarget = value; },
    update(deltaSeconds) {
      mixer.update(deltaSeconds);
      droop += (droopTarget - droop) * Math.min(1, deltaSeconds * 1.5);
      // On top of the clip, which resets the bones each frame.
      if (neck) neck.rotation.x += droop * 0.25;
      if (head) head.rotation.x += droop * 0.35;
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); },
  };
}

/**
 * Builds the corridor's scene around the cast (taken back out of the
 * Lobby) and returns its driver: onNode(node) acts out each node of
 * exitDoor*Dialogue (returning a promise for the beats the dialogue waits
 * on), update(deltaSeconds) animates and renders a frame, dispose() frees
 * the set and the cast.
 */
export function createExitDoorScene(renderer, variant, cast) {
  const plan = exitDoorPlan();
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#2a1830', 18, 60);
  const { set, door } = buildExitCorridor();
  scene.add(set);

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  const { jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi, extras } = cast;
  const pomni = stagePomni(cast.pomni);
  const sad = variant === 'abstracted';
  let disposed = false;
  const doorAt = v(0, 0, GATE_Z);

  // Everyone on their marks, slowing to a stop in front of the door.
  const place = (object, mark) => {
    object.position.copy(mark);
    object.rotation.set(0, yawTo(mark, doorAt), 0);
    object.visible = true;
    scene.add(object);
  };
  place(pomni.model, plan.pomni);
  pomni.play('idle');
  pomni.setDroop(sad ? 0.4 : 0);
  place(ribbitApi.ribbit, plan.ribbit);
  // Her Lobby rush may still own a world-space target from the previous room.
  ragathaApi.stopMovement();
  place(ragathaApi.ragatha, plan.ragatha);
  place(kaufmoApi.kaufmo, plan.kaufmo);
  ribbitApi.setDistress(sad ? 1 : 0);
  ribbitApi.faceTowards(doorAt);
  ragathaApi.setPose(sad ? 'worried' : 'listen');
  ragathaApi.faceTowards(doorAt);
  kaufmoApi.setPose(sad ? 'sad' : 'happy');
  kaufmoApi.faceTowards(doorAt);
  if (jaxApi) {
    place(jaxApi.jax, plan.jax);
    jaxApi.setShown(true);
    jaxApi.faceTowards(doorAt);
  }
  for (const entry of extras) place(entry.root, plan[entry.key]);
  extras.find(entry => entry.key === 'kinger')?.performance.clutch();
  // Caine isn't with them until Pomni's alone at the door.
  const { caine } = caineApi;
  caine.position.copy(plan.caine);
  caine.rotation.set(0, yawTo(plan.caine, plan.pomniAtDoor), 0);
  caine.visible = false;
  scene.add(caine);
  caineApi.setPose('sad');

  // One steady camera on everyone (plan.camera).
  camera.position.copy(plan.camera.position);
  camera.lookAt(plan.camera.target);

  // --- beats the dialogue waits on
  let timer = null; // { left, resolve }
  let jaxDeparture = null;
  function wait(seconds) {
    if (disposed) return Promise.resolve(false);
    return new Promise((resolve) => { timer = { left: seconds, resolve }; });
  }

  // Walking up to the door and on into the light, where they're gone.
  const walkers = new Set(); // { object, points, speed, onStep, resolve }
  function walkTo(object, points, { speed = LEAVE_SPEED, onStep } = {}) {
    if (disposed) return Promise.resolve(false);
    return new Promise((resolve) => {
      walkers.add({ object, points: [...points], speed, onStep, resolve });
    });
  }
  const walkThrough = (object, options) => walkTo(object, [plan.approach, plan.through], options).then((completed) => {
      if (!completed || disposed) return false;
      object.visible = false;
      return wait(0.5);
  });
  function stepWalkers(deltaSeconds) {
    for (const walker of walkers) {
      const { object, points } = walker;
      let step = walker.speed * deltaSeconds;
      while (points.length && step > 0) {
        const to = points[0];
        const gap = Math.hypot(to.x - object.position.x, to.z - object.position.z);
        if (gap > step) {
          object.rotation.y = yawTo(object.position, to);
          object.position.x += (to.x - object.position.x) / gap * step;
          object.position.z += (to.z - object.position.z) / gap * step;
          step = 0;
        } else {
          object.position.x = to.x;
          object.position.z = to.z;
          step -= gap;
          points.shift();
        }
      }
      walker.onStep?.(deltaSeconds);
      if (!points.length) {
        walkers.delete(walker);
        walker.resolve(true);
      }
    }
  }

  // Caine's bow: hat to his chest, as far as his model allows (his hat is
  // part of his head mesh, so he bows over it rather than taking it off).
  let bow = 0;
  let bowTarget = 0;
  let ribbitStep = 0;

  function onNode(node) {
    if (disposed) return Promise.resolve(false);
    const speaker = node.type === 'line' ? node.speaker : null;
    castSpeaks(cast, speaker, plan.pomni);
    if (speaker === 'caine' && node.mood) caineApi.setPose(node.mood);

    switch (node.action) {
      case 'gathered':
        return wait(1.4);
      case 'hush':
        return wait(1.6);
      case 'pomniLooksRound':
        pomni.model.rotation.y = yawTo(plan.pomni, v(plan.pomni.x - 1, 0, plan.pomni.z - 2));
        break;
      case 'doorOpens':
        door.setOpen(true);
        return wait(DOOR_SWING_SECONDS + 0.4);
      case 'kaufmoLeaves':
        kaufmoApi.setActivity('walk');
        return walkThrough(kaufmoApi.kaufmo);
      case 'ribbitLeaves':
        // No walk of her own: a bob in step.
        return walkThrough(ribbitApi.ribbit, {
          speed: LEAVE_SPEED * 0.9,
          onStep: (dt) => { ribbitStep += dt; ribbitApi.ribbit.position.y = Math.abs(Math.sin(ribbitStep * 6)) * 0.05; },
        });
      case 'ragathaLeaves':
        ragathaApi.faceTowards(null);
        ragathaApi.setPose('idle');
        return walkThrough(ragathaApi.ragatha);
      case 'gangleLeaves':
      case 'zoobleLeaves':
      case 'kingerLeaves': {
        const extra = extras.find(entry => entry.key === node.action.replace('Leaves', '').toLowerCase());
        if (!extra) return undefined;
        return extra.performance.walkTo(plan.approach, { speed: LEAVE_SPEED * 0.9 })
          .then(completed => completed && !disposed
            ? walkThrough(extra.root, { speed: LEAVE_SPEED * 0.75 }) : false);
      }
      case 'jaxLeaves': {
        if (!jaxApi) return undefined;
        // He pauses to nod at her, then strolls through, and is gone.
        jaxApi.faceTowards(plan.pomni);
        return wait(1.2).then(completed => {
          if (!completed || disposed) return false;
          const from = jaxApi.jax.position.clone();
          jaxApi.playPassBy(from, plan.through, from.distanceTo(plan.through) / LEAVE_SPEED, { style: 'sly' });
          return new Promise(resolve => { jaxDeparture = resolve; }).then(done => done ? wait(0.4) : false);
        });
      }
      case 'pomniStops':
        // The door swings shut behind the last of them; she walks up to it,
        // reaches for the handle, and stops. Caine is behind her.
        door.setOpen(false);
        pomni.setDroop(0);
        pomni.play('walk', 0.8);
        return walkTo(pomni.model, [plan.pomniAtDoor], { speed: 1.1 }).then(completed => {
          if (!completed || disposed) return false;
          pomni.play('idle');
          pomni.model.rotation.y = yawTo(plan.pomniAtDoor, doorAt);
          caine.visible = true;
          caineApi.faceTowards(plan.pomniAtDoor);
          return wait(1.2);
        });
      case 'pomniTurns':
        pomni.model.rotation.y = yawTo(plan.pomniAtDoor, plan.caine);
        break;
      case 'caineHat':
        caineApi.setPose('sad');
        bowTarget = 1;
        return wait(2.2);
      case 'pomniLeaves':
        // She turns, opens the door, steps into the light; it closes behind her.
        pomni.model.rotation.y = yawTo(plan.pomniAtDoor, doorAt);
        door.setOpen(true);
        return wait(DOOR_SWING_SECONDS).then(completed => {
          if (!completed || disposed) return false;
          pomni.play('walk', 0.8);
          return walkTo(pomni.model, [plan.through], { speed: 1.0 });
        }).then(completed => {
          if (!completed || disposed) return false;
          pomni.model.visible = false;
          door.setOpen(false);
          return wait(DOOR_SWING_SECONDS + 0.3);
        });
      case 'caineAlone':
        return wait(2.5);
      default:
    }
    return undefined;
  }

  function update(deltaSeconds) {
    if (disposed) return;
    stepWalkers(deltaSeconds);
    door.update(deltaSeconds);
    if (timer && (timer.left -= deltaSeconds) <= 0) {
      const { resolve } = timer;
      timer = null;
      resolve(true);
    }
    pomni.update(deltaSeconds);
    jaxApi?.update(deltaSeconds);
    if (jaxDeparture && !jaxApi.isRunning()) {
      const resolve = jaxDeparture;
      jaxDeparture = null;
      resolve(true);
    }
    ribbitApi.update(deltaSeconds);
    ragathaApi.update(deltaSeconds);
    kaufmoApi.update(deltaSeconds);
    caineApi.update(deltaSeconds);
    for (const entry of extras) entry.performance.update(deltaSeconds);
    // The bow, on top of whatever pose he's in.
    bow += (bowTarget - bow) * Math.min(1, deltaSeconds * 1.6);
    caine.rotation.x = bow * 0.2;

    const size = renderer.getSize(new THREE.Vector2());
    if (size.y > 0 && Math.abs(camera.aspect - size.x / size.y) > 1e-3) {
      camera.aspect = size.x / size.y;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const walker of walkers) walker.resolve(false);
    walkers.clear();
    timer?.resolve(false);
    timer = null;
    jaxDeparture?.(false);
    jaxDeparture = null;
    pomni.dispose();
    for (const extra of extras) extra.performance.dispose();
    scene.traverse((child) => {
      child.geometry?.dispose();
      for (const material of [child.material].flat()) {
        if (!material) continue;
        material.map?.dispose();
        material.dispose();
      }
    });
    scene.clear();
  }

  return { scene, camera, plan, onNode, update, dispose };
}
