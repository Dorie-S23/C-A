import * as THREE from 'three';
import { loadPomni } from '../characters/pomni.js';
import { loadJax } from '../characters/jax.js';
import { loadRibbit } from '../characters/ribbit.js';
import { loadRagatha } from '../characters/ragatha.js';
import { loadKaufmoTalk } from '../characters/kaufmoTalk.js';
import { loadCaine } from '../characters/caine.js';

// The ending (KAN-85, KAN-89, KAN-95), in two parts. main.js (playEnding)
// runs them in turn, playing a conversation over each and feeding its
// nodes to onNode, whose `action`s these act out.
//
// 1. The Circus Lobby, just outside the maze door (the real, loaded room):
//    Pomni walks out, with Jax if he was saved, to the others waiting
//    there. They talk it over, then Kaufmo says he's found the exit.
// 2. A space of its own: the exit door at the edge of the circus, light
//    pouring through it. Caine says goodbye and they leave one by one,
//    Pomni last. What's on the other side is never shown.
//
// The same cast plays both: loaded once, staged in the Lobby, then moved
// into the exit door's scene. Gangle, Zooble and Kinger aren't in it yet:
// they have no models (KAN-90).

const GATE_Z = -8; // the exit door's wall, along x; the door at x = 0, facing +Z
const POMNI_WALK = { saved: 1.5, abstracted: 0.9 }; // m/s out of the maze, by variant
const GRIEF_SECONDS = 3;
const CAINE_FLIGHT_SECONDS = 2.4;
const LEAVE_SPEED = 1.4;   // m/s, walking to the exit door
const MAZE_DOOR_ARRIVAL = 2.4; // lobbyMazeDoor.js ARRIVAL_DISTANCE: its spawn, this far out of the doorway
const ACTION_FADE = 0.3;

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

/** Loads everyone in the ending: Jax only if he was saved; a Pomni of its own for the exit door. */
export async function loadEndingCast(variant) {
  const [pomni, jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi] = await Promise.all([
    loadPomni(), variant === 'saved' ? loadJax() : null, loadRibbit(), loadRagatha(), loadKaufmoTalk(), loadCaine(),
  ]);
  return { pomni, jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi };
}

// --- Part 1: the Lobby, outside the maze door ------------------------------

/**
 * Everyone's marks and the shots in the Lobby, measured off the maze door
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
  return {
    out,
    door: at(0, 0),
    pomniWalk: [at(-0.3, 0), at(2.6, 0)],
    jaxWalk: [at(-0.5, -1.0), at(2.4, -1.1)],
    ragatha: at(6.0, 1.5),
    ragathaRush: at(3.7, 1.0),
    kaufmo: at(6.5, -1.2),
    ribbit: at(5.8, -2.8),
    shots: {
      // From among the group, back at the maze door as she comes out.
      walkOut: { position: at(9.5, 0.6, 2.0), target: at(0, 0, 1.3) },
      // Over Pomni's shoulder at the others.
      group: { position: at(1.3, -1.7, 1.95), target: at(6.2, 0.4, 1.1) },
      // On Pomni (and Jax beside her), from the group's side.
      pomni: { position: at(5.6, -2.0, 1.55), target: at(2.5, -0.4, 1.15) },
      // Side on to everyone, for Kaufmo's news.
      kaufmo: { position: at(4.4, 5.2, 2.0), target: at(4.4, -0.6, 1.2) },
    },
  };
}

/**
 * Puts the cast on their marks in the loaded Lobby and returns its driver:
 * onNode(node) acts out each node of endingLobby*Dialogue, detach() takes
 * the cast back out of the room for the exit door. `stage` is main.js's
 * (place, walkTo, frame, lookAt, lookWithHead, wait).
 */
export function stageLobbyEnding(room, stage, variant, cast, plan) {
  const { jaxApi, ribbitApi, ragathaApi, kaufmoApi } = cast;
  const { ribbit } = ribbitApi;
  const { ragatha } = ragathaApi;
  const { kaufmo } = kaufmoApi;
  const sad = variant === 'abstracted';
  const pomniAt = plan.pomniWalk[1];

  ribbit.position.copy(plan.ribbit);
  ragatha.position.copy(plan.ragatha);
  kaufmo.position.copy(plan.kaufmo);
  ribbit.rotation.y = yawTo(plan.ribbit, plan.door);
  ragatha.rotation.y = yawTo(plan.ragatha, plan.door);
  kaufmo.rotation.y = yawTo(plan.kaufmo, plan.door);
  ribbitApi.setPose('standing', { immediate: true });
  ragathaApi.setPose('watch');
  kaufmoApi.setPose('worried');
  room.group.add(ribbit, ragatha, kaufmo);
  if (jaxApi) {
    jaxApi.jax.visible = false;
    room.group.add(jaxApi.jax);
  }

  const frame = (name) => {
    const shot = plan.shots[name];
    stage.frame({ position: shot.position.toArray(), target: shot.target.toArray() });
  };
  // Pomni just inside the doorway, out of sight until she walks out.
  stage.place({ x: plan.pomniWalk[0].x, z: plan.pomniWalk[0].z, lookAt: pomniAt });
  frame('walkOut');
  const bowHead = () => stage.lookWithHead(pomniAt.clone().addScaledVector(plan.out, 1.2).setY(pomniAt.y - 0.6));

  async function walkOut() {
    if (sad) bowHead();
    if (jaxApi) {
      const [from, to] = plan.jaxWalk;
      jaxApi.playPassBy(from, to, from.distanceTo(to) / POMNI_WALK[variant] * 1.08, { style: 'sly', stay: true });
    }
    await stage.walkTo([pomniAt], { speed: POMNI_WALK[variant] });
    await stage.wait(0.6);
  }

  function onNode(node) {
    const speaker = node.type === 'line' ? node.speaker : null;
    ragathaApi.setSpeaking(speaker === 'ragatha');
    kaufmoApi.setSpeaking(speaker === 'kaufmo');
    kaufmoApi.setListening(Boolean(speaker) && speaker !== 'kaufmo');
    if (speaker === 'pomni' || speaker === 'jax') frame('pomni');
    else if (speaker) frame('group');

    switch (node.action) {
      case 'walkOut':
        return walkOut();
      case 'groupReacts':
        ragathaApi.setPose(sad ? 'chatty' : 'wave');
        ragathaApi.walkTo(plan.ragathaRush, () => ragathaApi.faceTowards(pomniAt));
        kaufmoApi.setPose('happy');
        kaufmoApi.faceTowards(pomniAt);
        ribbitApi.faceTowards(pomniAt);
        break;
      case 'groupRealises':
        ragathaApi.setPose('worried');
        kaufmoApi.setPose('shocked');
        break;
      case 'grief':
        frame('group');
        ragathaApi.setPose('worried');
        kaufmoApi.setPose('sad');
        ribbitApi.setDistress(2);
        bowHead();
        return stage.wait(GRIEF_SECONDS);
      case 'jaxLooksAway':
        jaxApi?.faceTowards(plan.ribbit.clone().addScaledVector(plan.out, -6));
        break;
      case 'kaufmoExit':
        frame('kaufmo');
        kaufmoApi.setPose(sad ? 'sad' : 'happy');
        stage.lookWithHead(null);
        stage.lookAt(plan.kaufmo);
        for (const api of [ragathaApi, ribbitApi, jaxApi]) api?.faceTowards(plan.kaufmo);
        break;
      default:
    }
    if (speaker === 'pomni' && !sad) stage.lookWithHead(null);
    return undefined;
  }

  room.storyUpdate = (deltaSeconds) => {
    jaxApi?.update(deltaSeconds);
    ribbitApi.update(deltaSeconds);
    ragathaApi.update(deltaSeconds);
    kaufmoApi.update(deltaSeconds);
  };

  return {
    plan,
    onNode,
    detach() {
      room.storyUpdate = null;
      ragathaApi.setSpeaking(false);
      kaufmoApi.setSpeaking(false);
      kaufmoApi.setListening(false);
      for (const object of [ribbit, ragatha, kaufmo, jaxApi?.jax]) object?.removeFromParent();
    },
  };
}

// --- Part 2's set: the circus wall and its exit door ---------------------

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function signTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3b1450';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#f7c948';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = '#f7c948';
  ctx.font = 'bold 64px "Luckiest Guy", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The clearing, the circus's outer wall and its exit door, trees and lights: a Group. */
export function buildExitDoorSet() {
  const set = new THREE.Group();
  set.name = 'ExitDoorSet';
  const random = seeded(89);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const add = (mesh, { cast = true, receive = true } = {}) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    set.add(mesh);
    return mesh;
  };

  // Dusk sky: a big sphere shaded from the horizon up.
  const skyGeometry = new THREE.SphereGeometry(80, 32, 16);
  const horizon = new THREE.Color('#f2a36b');
  const zenith = new THREE.Color('#2c2160');
  const colors = [];
  const position = skyGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp(position.getY(i) / 80, 0, 1) ** 0.6;
    const c = horizon.clone().lerp(zenith, t);
    colors.push(c.r, c.g, c.b);
  }
  skyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  add(new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })),
    { cast: false, receive: false });

  // Grass, and a trodden dirt path from the gate into the middle.
  const ground = add(new THREE.Mesh(new THREE.CircleGeometry(60, 48), mat('#4f7f35')), { cast: false });
  ground.rotation.x = -Math.PI / 2;
  const path = add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 9), mat('#a8875a')), { cast: false });
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, GATE_Z + 4.5);
  const patch = add(new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), mat('#9c7d52')), { cast: false });
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(0, 0.012, -1.6);

  // The circus's outer wall: red-and-cream stripes, a gold trim on top,
  // and a gap for the gate.
  const WALL_HEIGHT = 4;
  const stripe = [mat('#b3202d'), mat('#efe3c8')];
  const trim = mat('#d9ab30',{ metalness: 0.3, roughness: 0.5 });
  for (let x = -16; x < 16; x++) {
    if (x >= -2 && x < 2) continue; // the door
    const block = add(new THREE.Mesh(new THREE.BoxGeometry(1, WALL_HEIGHT, 1), stripe[(x + 100) % 2]));
    block.position.set(x + 0.5, WALL_HEIGHT / 2, GATE_Z - 0.5);
    const cap = add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 1.2), trim));
    cap.position.set(x + 0.5, WALL_HEIGHT + 0.12, GATE_Z - 0.5);
  }

  // The exit: striped pillars, an arch, a sign, a door swung open, and
  // nothing but light through it. What's on the other side isn't shown.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), stripe[k % 2]));
      band.position.set(side * 2.2, 0.5 + k, GATE_Z - 0.5);
    }
    const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12), trim));
    ball.position.set(side * 2.2, 5.5, GATE_Z - 0.5);
  }
  const arch = add(new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 12, 40, Math.PI), trim));
  arch.position.set(0, 4.6, GATE_Z + 0.1);
  const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75),
    new THREE.MeshStandardMaterial({ map: signTexture('EXIT'), roughness: 0.6, emissive: '#3b1450', emissiveIntensity: 0.25 })),
  { cast: false });
  sign.position.set(0, 5.6, GATE_Z + 0.2);
  const light = new THREE.MeshBasicMaterial({ color: '#fff6e0', fog: false });
  const doorway = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.9), light), { cast: false, receive: false });
  doorway.position.set(0, 2.35, GATE_Z - 0.9);
  // The light's floor too, so no grass shows through the doorway.
  const threshold = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), light), { cast: false, receive: false });
  threshold.rotation.x = -Math.PI / 2;
  threshold.position.set(0, 0.03, GATE_Z - 0.3);
  // The door itself, swung open toward the clearing on its left hinge.
  const hinge = new THREE.Group();
  hinge.position.set(-1.7, 0, GATE_Z - 0.05);
  hinge.rotation.y = -1.9;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.3, 4.5, 0.14), mat('#6b3f22'));
  leaf.position.set(1.65, 2.25, 0);
  leaf.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), trim);
  knob.position.set(3.0, 2.1, 0.12);
  hinge.add(leaf, knob);
  set.add(hinge);
  // Light spilling out of it across the ground.
  const spill = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6),
    new THREE.MeshBasicMaterial({ color: '#fff1c9', transparent: true, opacity: 0.35, depthWrite: false, fog: false })),
  { cast: false, receive: false });
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.02, GATE_Z + 3);
  // Above the doorway, under the arch.
  const lintel = add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 0.9), stripe[0]));
  lintel.position.set(0, 4.6 + 1.1, GATE_Z - 0.5);

  // Trees and bushes round the edge, never on the path or behind the gate.
  const leaves = [mat('#2f5a2a'), mat('#3d6b2e'), mat('#27482a')];
  const bark = mat('#5a3b24');
  for (let i = 0; i < 46; i++) {
    const angle = random() * Math.PI * 2;
    const r = 12 + random() * 16;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r + 2;
    if (z < GATE_Z + 1.5) continue;
    const h = 3.5 + random() * 3;
    const trunk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, h * 0.35, 8), bark));
    trunk.position.set(x, h * 0.175, z);
    const crown = add(new THREE.Mesh(new THREE.ConeGeometry(1 + random() * 0.6, h * 0.8, 9), leaves[i % 3]));
    crown.position.set(x, h * 0.35 + h * 0.4, z);
  }
  for (let i = 0; i < 18; i++) {
    const x = (i < 9 ? -1 : 1) * (3.2 + random() * 11);
    const bush = add(new THREE.Mesh(new THREE.SphereGeometry(0.5 + random() * 0.45, 12, 8), leaves[i % 3]));
    bush.position.set(x, 0.35, GATE_Z + 0.6 + random() * 0.8);
    bush.scale.y = 0.75;
  }

  // Festoon lights from the pillar tops out to two poles in the clearing.
  const bulbColors = ['#ffd27a', '#ff7aa8', '#8fd3ff', '#b4ff8a'];
  const pole = mat('#3a2a20');
  for (const side of [-1, 1]) {
    const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8), pole));
    post.position.set(side * 7, 2.1, -1.5);
    const from = v(side * 2.2, 5.3, GATE_Z - 0.3);
    const to = v(side * 7, 4.1, -1.5);
    for (let k = 1; k < 14; k++) {
      const t = k / 14;
      const p = from.clone().lerp(to, t);
      p.y -= Math.sin(t * Math.PI) * 0.9; // the wire sags
      const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: bulbColors[k % bulbColors.length], fog: false })), { cast: false, receive: false });
      bulb.position.copy(p);
    }
  }

  // Dusk light: a low warm sun, a cool sky fill, and a glow at the gate.
  set.add(new THREE.HemisphereLight('#a9b8ff', '#4d3a28', 1.1));
  const sun = new THREE.DirectionalLight('#ffc89a', 2.2);
  sun.position.set(-9, 12, 10);
  sun.target.position.set(0, 0, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  set.add(sun, sun.target);
  const gateGlow = new THREE.PointLight('#fff0cf', 26, 14, 2);
  gateGlow.position.set(0, 2.4, GATE_Z + 1.2);
  set.add(gateGlow);
  const groupFill = new THREE.PointLight('#ffe2c4', 10, 10, 2);
  groupFill.position.set(0.5, 3, 2.5);
  set.add(groupFill);

  return set;
}

// --- Part 2: the exit door -------------------------------------------------

/** Everyone's marks and the shots at the exit door, in its set's own coordinates. */
export function exitDoorPlan() {
  return {
    // Just in front of the door, then into the light past it, where each of them is gone.
    approach: v(0, 0, GATE_Z + 1.4),
    through: v(0, 0, GATE_Z - 0.7),
    // In front of the door, facing it: Kaufmo, who found it, nearest.
    kaufmo: v(-0.5, 0, -5.0),
    ribbit: v(-2.2, 0, -4.2),
    ragatha: v(1.7, 0, -4.1),
    jax: v(-1.3, 0, -3.2),
    pomni: v(0.4, 0, -2.8),
    // A little apart from them, floating, once he's popped in.
    caine: v(4.0, 0.6, -4.2),
    caineFrom: v(6.5, 8, -6),
    shots: {
      // Wide from behind them: the wall, the open door, the light.
      gathered: { position: v(2.8, 2.6, 5.0), target: v(0, 1.6, -7), drift: v(-0.6, -0.2, -1.6) },
      // From beside the door, back at their faces.
      faces: { position: v(3.7, 1.8, -7.3), target: v(-0.8, 1.3, -3.2), drift: v(0.2, 0, 0.3) },
      // Up at Caine, from among them.
      caine: { position: v(0.4, 1.7, -2.0), target: v(4.0, 2.1, -4.2), drift: v(0.1, 0.05, 0) },
      // Behind them, the door ahead: they go one by one.
      leaving: { position: v(0.9, 1.9, 2.4), target: v(0, 1.5, -8), drift: v(-0.2, 0, -0.8) },
      // Last: just behind Pomni as she walks into the light.
      pomniLast: { position: v(0.7, 1.6, 0.2), target: v(0, 1.4, -8), drift: v(-0.4, -0.1, -2.6) },
    },
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
  };
}

/**
 * Builds the exit door's scene around the cast (taken back out of the
 * Lobby) and returns its driver: onNode(node) acts out each node of
 * exitDoor*Dialogue (returning a promise for the beats the dialogue waits
 * on), update(deltaSeconds) animates and renders a frame, dispose() frees
 * the set and the cast.
 */
export function createExitDoorScene(renderer, variant, cast) {
  const plan = exitDoorPlan();
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#d99a72', 28, 75);
  scene.add(buildExitDoorSet());

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  const { jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi } = cast;
  const pomni = stagePomni(cast.pomni);
  const sad = variant === 'abstracted';
  const door = v(0, 0, GATE_Z);

  // Everyone on their marks, facing the door.
  const place = (object, mark) => {
    object.position.copy(mark);
    object.rotation.set(0, yawTo(mark, door), 0);
    object.visible = true;
    scene.add(object);
  };
  place(pomni.model, plan.pomni);
  pomni.play('idle');
  pomni.setDroop(sad ? 0.5 : 0);
  place(ribbitApi.ribbit, plan.ribbit);
  place(ragathaApi.ragatha, plan.ragatha);
  place(kaufmoApi.kaufmo, plan.kaufmo);
  ribbitApi.setDistress(sad ? 1 : 0);
  ribbitApi.faceTowards(door);
  ragathaApi.setPose(sad ? 'worried' : 'listen');
  ragathaApi.faceTowards(door);
  kaufmoApi.setPose(sad ? 'sad' : 'happy');
  kaufmoApi.faceTowards(door);
  if (jaxApi) {
    place(jaxApi.jax, plan.jax);
    jaxApi.setShown(true);
    jaxApi.faceTowards(door);
  }
  // Caine waits up out of shot until he pops in.
  caineApi.caine.position.copy(plan.caineFrom);
  caineApi.caine.visible = false;
  scene.add(caineApi.caine);

  // --- camera
  let shot = null;
  let shotTime = 0;
  function cut(name) {
    const next = plan.shots[name];
    if (!next || next === shot) return;
    shot = next;
    shotTime = 0;
  }
  function placeCamera() {
    const t = THREE.MathUtils.smootherstep(Math.min(shotTime / 9, 1), 0, 1);
    camera.position.copy(shot.position).addScaledVector(shot.drift, t);
    camera.lookAt(shot.target);
  }
  cut('gathered');

  // --- beats the dialogue waits on
  let timer = null; // { left, resolve }
  function wait(seconds) {
    return new Promise((resolve) => { timer = { left: seconds, resolve }; });
  }

  // Walking up to the door and on into the light, where they're gone.
  const walkers = new Set(); // { object, points, speed, onStep, resolve }
  function walkThrough(object, { speed = LEAVE_SPEED, onStep } = {}) {
    const points = [plan.approach, plan.through];
    return new Promise((resolve) => {
      walkers.add({ object, points, speed, onStep, resolve });
    }).then(() => {
      object.visible = false;
      return wait(0.5);
    });
  }
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
        walker.resolve();
      }
    }
  }

  function caineArrives() {
    caineApi.caine.visible = true;
    caineApi.setPose(sad ? 'worried' : 'shocked');
    for (const api of [ragathaApi, kaufmoApi, ribbitApi, jaxApi]) api?.faceTowards(plan.caine);
    return new Promise((resolve) => {
      caineApi.flyTo(plan.caine, CAINE_FLIGHT_SECONDS, () => {
        caineApi.faceTowards(plan.pomni);
        setTimeout(resolve, 300);
      });
    });
  }

  let ribbitStep = 0;
  function onNode(node) {
    const speaker = node.type === 'line' ? node.speaker : null;
    ragathaApi.setSpeaking(speaker === 'ragatha');
    kaufmoApi.setSpeaking(speaker === 'kaufmo');
    caineApi.setSpeaking(speaker === 'caine');
    if (speaker === 'caine') cut('caine');
    else if (speaker) cut('faces');
    if (speaker === 'caine' && node.mood) caineApi.setPose(node.mood);

    switch (node.action) {
      case 'gathered':
        cut('gathered');
        return wait(1.2);
      case 'caineArrives':
        cut('caine');
        return caineArrives();
      case 'kaufmoLeaves':
        cut('leaving');
        kaufmoApi.setPose('happy');
        kaufmoApi.setActivity('walk');
        return walkThrough(kaufmoApi.kaufmo);
      case 'ribbitLeaves':
        cut('leaving');
        // No walk of her own: a bob in step.
        return walkThrough(ribbitApi.ribbit, {
          speed: LEAVE_SPEED * 0.9,
          onStep: (dt) => { ribbitStep += dt; ribbitApi.ribbit.position.y = Math.abs(Math.sin(ribbitStep * 6)) * 0.05; },
        });
      case 'ragathaLeaves':
        cut('leaving');
        ragathaApi.faceTowards(null);
        ragathaApi.setPose('idle');
        return walkThrough(ragathaApi.ragatha);
      case 'jaxLeaves': {
        if (!jaxApi) return undefined;
        cut('leaving');
        // His own stroll, which hides him at the end of it.
        const from = jaxApi.jax.position.clone();
        jaxApi.playPassBy(from, plan.through, from.distanceTo(plan.through) / LEAVE_SPEED, { style: 'sly' });
        return new Promise((resolve) => {
          const check = () => (jaxApi.isRunning() ? setTimeout(check, 100) : resolve());
          check();
        }).then(() => wait(0.5));
      }
      case 'pomniLooksBack':
        cut('faces');
        // Over her shoulder, back toward the circus.
        pomni.model.rotation.y = yawTo(plan.pomni, v(plan.pomni.x + 3, 0, plan.pomni.z + 6));
        pomni.setDroop(0.2);
        return wait(2);
      case 'pomniLeaves':
        cut('pomniLast');
        pomni.setDroop(0);
        pomni.play('walk', 0.8);
        return walkThrough(pomni.model, { speed: 1.1 });
      default:
    }
    return undefined;
  }

  function update(deltaSeconds) {
    shotTime += deltaSeconds;
    stepWalkers(deltaSeconds);
    if (timer && (timer.left -= deltaSeconds) <= 0) {
      const { resolve } = timer;
      timer = null;
      resolve();
    }
    pomni.update(deltaSeconds);
    jaxApi?.update(deltaSeconds);
    ribbitApi.update(deltaSeconds);
    ragathaApi.update(deltaSeconds);
    kaufmoApi.update(deltaSeconds);
    caineApi.update(deltaSeconds);

    const size = renderer.getSize(new THREE.Vector2());
    if (size.y > 0 && Math.abs(camera.aspect - size.x / size.y) > 1e-3) {
      camera.aspect = size.x / size.y;
      camera.updateProjectionMatrix();
    }
    placeCamera();
    renderer.render(scene, camera);
  }

  function dispose() {
    walkers.clear();
    timer = null;
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
