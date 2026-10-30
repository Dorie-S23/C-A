import * as THREE from 'three';
import { loadPomni } from '../characters/pomni.js';
import { loadJax } from '../characters/jax.js';
import { loadRibbit } from '../characters/ribbit.js';
import { loadRagatha } from '../characters/ragatha.js';
import { loadKaufmoTalk } from '../characters/kaufmoTalk.js';
import { loadCaine } from '../characters/caine.js';

// The ending (KAN-89, KAN-95): the clearing outside the maze entrance, the
// cast waiting in it, and the camera. Unlike the hallway cutscenes this
// isn't staged in a loaded room: it's its own small set and scene, built
// here, and main.js (playEnding) plays endingSavedDialogue or
// endingAbstractedDialogue over it, feeding each node to onNode.
//
// The maze wall runs along x at z = GATE_Z with its gate at x = 0, facing
// +Z into the clearing, where the others stand facing it.

const GATE_Z = -8;
const WALK_SPEED = { saved: 1.25, abstracted: 0.8 }; // metres per second
const WALK_CLIP_RATE = { saved: 0.95, abstracted: 0.7 }; // her Walk clip's timeScale at that speed
const WALK_OUT_HOLD = 0.7; // after she stops, before the first line
const GRIEF_SECONDS = 3;
const CAINE_FLIGHT_SECONDS = 2.4;
const ACTION_FADE = 0.3;

const v = (x, y, z) => new THREE.Vector3(x, y, z);

/** Everyone's marks and the shots, in the clearing's own coordinates. */
export function endingPlan(variant) {
  return {
    gateZ: GATE_Z,
    // Out of the dark of the gate to where the path meets the clearing.
    pomniWalk: [v(0, 0, GATE_Z - 1.6), v(0, 0, -3.2)],
    // Beside her on her right (stage left), a pace behind.
    jaxWalk: [v(-0.95, 0, GATE_Z - 2.1), v(-1.05, 0, -3.5)],
    ragatha: v(1.4, 0, -0.5),
    ragathaRush: v(1.05, 0, -2.35), // up to Pomni on groupReacts
    kaufmo: v(-1.6, 0, 0.1),
    ribbit: v(-3.0, 0, -0.9),
    // Marks for the cast whose models don't exist yet (KAN-90). Nothing
    // stands on them; the shots leave room for them.
    reserved: {
      gangle: v(2.9, 0, -0.1),
      zooble: v(4.0, 0, -1.4),
      kinger: v(-4.3, 0, -2.1),
    },
    // A little apart from the group, floating, once he's flown in.
    caine: v(5.2, 0.6, -4.8),
    caineFrom: v(7.5, 9, -7.5),
    // Where the camera looks while each kind of line plays (cameraFor).
    shots: {
      // Low behind the group, through them at the gate; it pushes in slowly.
      walkOut: { position: v(0.3, 2.1, 5.4), target: v(0, 1.3, -7), drift: v(-0.1, -0.1, -1.6) },
      // Over Pomni's shoulder at the group.
      group: { position: v(1.7, 1.9, -5.9), target: v(-1.3, 1.15, -0.4), drift: v(0.2, 0, 0.2) },
      // On Pomni (and Jax beside her), from just in front of the group.
      pomni: variant === 'saved'
        ? { position: v(-0.35, 1.55, -0.45), target: v(-0.5, 1.15, -3.4), drift: v(0, 0, -0.25) }
        : { position: v(-1.1, 1.5, -0.7), target: v(0.15, 1.15, -3.2), drift: v(0, 0, -0.25) },
      // From the group's side, up at Caine.
      caine: { position: v(1.9, 1.7, -0.9), target: v(5.2, 2.1, -4.8), drift: v(0.1, 0.05, 0) },
      // Pulling back and up over everyone, the gate behind them.
      closing: { position: v(2.4, 3.6, 7.5), target: v(0, 1.4, -4.5), drift: v(0.6, 1.4, 3) },
    },
  };
}

// --- The set: the clearing outside the maze entrance (KAN-89) -------------

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

/** The clearing, the maze wall and its gate, trees and lights: a Group. */
export function buildEndingClearing() {
  const set = new THREE.Group();
  set.name = 'EndingClearing';
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

  // The maze's outer wall: red-and-cream circus stripes, a gold trim on top,
  // and a gap for the gate.
  const WALL_HEIGHT = 4;
  const stripe = [mat('#b3202d'), mat('#efe3c8')];
  const trim = mat('#d9ab30',{ metalness: 0.3, roughness: 0.5 });
  for (let x = -16; x < 16; x++) {
    if (x >= -2 && x < 2) continue; // the gate
    const block = add(new THREE.Mesh(new THREE.BoxGeometry(1, WALL_HEIGHT, 1), stripe[(x + 100) % 2]));
    block.position.set(x + 0.5, WALL_HEIGHT / 2, GATE_Z - 0.5);
    const cap = add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 1.2), trim));
    cap.position.set(x + 0.5, WALL_HEIGHT + 0.12, GATE_Z - 0.5);
  }
  // Behind the wall, the maze's own walls peeking over it.
  for (let i = 0; i < 26; i++) {
    const x = -15 + random() * 30;
    if (Math.abs(x) < 3) continue;
    const h = 4.5 + random() * 2.5;
    const inner = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, h, 2 + random() * 3), stripe[i % 2]));
    inner.position.set(x, h / 2, GATE_Z - 3 - random() * 8);
  }

  // The gate: striped pillars, an arch, a sign, and darkness inside.
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
    new THREE.MeshStandardMaterial({ map: signTexture('THE MAZE'), roughness: 0.6, emissive: '#3b1450', emissiveIntensity: 0.25 })),
  { cast: false });
  sign.position.set(0, 5.6, GATE_Z + 0.2);
  // Two planes: you walk out of the dark, and nothing behind the gate shows.
  const dark = new THREE.MeshBasicMaterial({ color: '#0d0618', fog: false });
  const doorway = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.6), dark), { cast: false, receive: false });
  doorway.position.set(0, 2.3, GATE_Z - 1.4);
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
  const gateGlow = new THREE.PointLight('#ffb36b', 14, 12, 2);
  gateGlow.position.set(0, 3.5, GATE_Z + 1.8);
  set.add(gateGlow);
  const groupFill = new THREE.PointLight('#ffe2c4', 10, 10, 2);
  groupFill.position.set(0.5, 3, 2.5);
  set.add(groupFill);

  return set;
}

// --- The cast -------------------------------------------------------------

/** Loads everyone in the scene: Jax only walks out with her if he was saved. */
export async function loadEndingCast(variant) {
  const [pomni, jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi] = await Promise.all([
    loadPomni(), variant === 'saved' ? loadJax() : null, loadRibbit(), loadRagatha(), loadKaufmoTalk(), loadCaine(),
  ]);
  return { pomni, jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi };
}

/** Her own copy of Pomni (the player's stays with the player) with Idle/Walk. */
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
      // On top of the clip: her head bowed (the clip resets it each frame).
      if (neck) neck.rotation.x += droop * 0.25;
      if (head) head.rotation.x += droop * 0.35;
    },
  };
}

const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

/**
 * Builds the ending's scene for `variant` around a loaded cast and returns
 * its driver: onNode(node) acts out each dialogue node (returning a promise
 * for the beats the dialogue waits on), update(deltaSeconds) animates and
 * renders a frame, dispose() frees the set.
 */
export function createEndingScene(renderer, variant, cast) {
  const plan = endingPlan(variant);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#d99a72', 28, 75);
  const set = buildEndingClearing();
  scene.add(set);

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  const { jaxApi, ribbitApi, ragathaApi, kaufmoApi, caineApi } = cast;
  const pomni = stagePomni(cast.pomni);
  const sad = variant === 'abstracted';

  // On their marks, everyone watching the gate.
  const gate = v(0, 0, plan.gateZ);
  pomni.model.position.copy(plan.pomniWalk[0]);
  pomni.model.rotation.y = 0;
  pomni.play('idle');
  scene.add(pomni.model);
  const { ribbit } = ribbitApi;
  const { ragatha } = ragathaApi;
  const { kaufmo } = kaufmoApi;
  const { caine } = caineApi;
  ribbit.position.copy(plan.ribbit);
  ragatha.position.copy(plan.ragatha);
  kaufmo.position.copy(plan.kaufmo);
  ribbit.rotation.y = yawTo(plan.ribbit, gate);
  ragatha.rotation.y = yawTo(plan.ragatha, gate);
  kaufmo.rotation.y = yawTo(plan.kaufmo, gate);
  ribbitApi.setPose('standing', { immediate: true });
  ragathaApi.setPose('watch');
  kaufmoApi.setPose('worried');
  scene.add(ribbit, ragatha, kaufmo);
  // Caine waits up out of shot until his entrance.
  caine.position.copy(plan.caineFrom);
  caine.visible = false;
  scene.add(caine);
  if (jaxApi) {
    jaxApi.jax.position.copy(plan.jaxWalk[0]);
    jaxApi.jax.visible = false;
    scene.add(jaxApi.jax);
  }

  // --- camera
  let shot = null;
  let shotTime = 0;
  function cut(name) {
    const next = plan.shots[name];
    if (!next || next === shot) return;
    shot = next;
    shotTime = 0;
  }
  const lookTarget = new THREE.Vector3();
  function placeCamera() {
    const t = THREE.MathUtils.smootherstep(Math.min(shotTime / 9, 1), 0, 1);
    camera.position.copy(shot.position).addScaledVector(shot.drift ?? v(0, 0, 0), t);
    lookTarget.copy(shot.target);
    camera.lookAt(lookTarget);
  }
  cut('walkOut');

  // --- beats the dialogue waits on
  let walk = null; // { points, index, speed, resolve, hold }
  let timer = null; // { left, resolve }
  let flight = null; // resolve once Caine lands
  const pomniPosition = () => pomni.model.position;

  function walkOut() {
    pomni.setDroop(sad ? 0.8 : 0);
    pomni.play('walk', WALK_CLIP_RATE[variant]);
    const [from, to] = plan.pomniWalk;
    pomni.model.rotation.y = yawTo(from, to);
    if (jaxApi) {
      const [jaxFrom, jaxTo] = plan.jaxWalk;
      const seconds = from.distanceTo(to) / WALK_SPEED[variant];
      jaxApi.playPassBy(jaxFrom, jaxTo, seconds * 1.08, { style: 'sly', stay: true });
    }
    return new Promise((resolve) => {
      walk = { to, speed: WALK_SPEED[variant], hold: WALK_OUT_HOLD, resolve };
    });
  }
  function wait(seconds) {
    return new Promise((resolve) => { timer = { left: seconds, resolve }; });
  }
  function caineArrives() {
    caine.visible = true;
    caineApi.setPose(sad ? 'worried' : 'happy');
    for (const api of [ragathaApi, kaufmoApi, ribbitApi]) api.faceTowards(plan.caine);
    jaxApi?.faceTowards(plan.caine);
    return new Promise((resolve) => {
      flight = resolve;
      caineApi.flyTo(plan.caine, CAINE_FLIGHT_SECONDS, () => {
        caineApi.faceTowards(v(0, 0, -1.5));
        flight = null;
        setTimeout(resolve, 300);
      });
    });
  }

  function onNode(node) {
    const speaker = node.type === 'line' ? node.speaker : null;
    ragathaApi.setSpeaking(speaker === 'ragatha');
    kaufmoApi.setSpeaking(speaker === 'kaufmo');
    kaufmoApi.setListening(Boolean(speaker) && speaker !== 'kaufmo');
    caineApi.setSpeaking(speaker === 'caine');
    if (speaker === 'caine') cut('caine');
    else if (speaker === 'pomni' || speaker === 'jax') cut('pomni');
    else if (speaker) cut('group');

    switch (node.action) {
      case 'walkOut':
        cut('walkOut');
        return walkOut();
      case 'groupReacts':
        ragathaApi.setPose(sad ? 'chatty' : 'wave');
        ragathaApi.walkTo(plan.ragathaRush, () => ragathaApi.faceTowards(pomniPosition()));
        kaufmoApi.setPose('happy');
        kaufmoApi.faceTowards(pomniPosition());
        ribbitApi.faceTowards(pomniPosition());
        break;
      case 'groupRealises':
        ragathaApi.setPose('worried');
        kaufmoApi.setPose('shocked');
        break;
      case 'grief':
        cut('group');
        ragathaApi.setPose('worried');
        kaufmoApi.setPose('sad');
        ribbitApi.setDistress(2);
        pomni.setDroop(1);
        return wait(GRIEF_SECONDS);
      case 'jaxLooksAway':
        jaxApi?.faceTowards(v(-4, 0, -2.5));
        break;
      case 'caineArrives':
        cut('caine');
        return caineArrives();
      case 'closing':
        cut('closing');
        if (jaxApi) jaxApi.faceTowards(pomniPosition());
        if (sad) pomni.setDroop(1);
        break;
      default:
    }
    if (speaker === 'pomni' && !sad) pomni.setDroop(0);
    return undefined;
  }

  function update(deltaSeconds) {
    shotTime += deltaSeconds;
    if (walk) {
      const position = pomni.model.position;
      const step = walk.speed * deltaSeconds;
      const remaining = position.distanceTo(walk.to);
      if (remaining > step) {
        position.addScaledVector(walk.to.clone().sub(position).normalize(), step);
      } else {
        position.copy(walk.to);
        pomni.play('idle');
        if ((walk.hold -= deltaSeconds) <= 0) {
          const { resolve } = walk;
          walk = null;
          resolve();
        }
      }
    }
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
    walk = null;
    timer = null;
    flight = null;
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
