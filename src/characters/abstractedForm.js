import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createAbstractionEffect } from '../effects/abstraction.js';

// What's left of someone once they've abstracted (failing a level: Pomni in
// the maze, Kaufmo, Jax). The shared abstraction effect eats them away from
// the head down (effects/abstraction.js), then this, the abstracted form,
// rises up where they stood (its "spawn" animation) and stays, idling.
const FORM_URL = './models/characters/abstracted%20form/abstracted_kaufmo.glb';
const SPAWN = 'ABS_Rig|spawn';
const IDLE = 'Idle';
const ATTACK = 'Attack';
export const FORM_HEIGHT = 3.4;   // metres: towering over any of them
const VOID_SECONDS = 1.8;         // the effect eating them away, by default
const IDLE_BLEND = 0.5;
// The model's head end is its -Z; the characters face +Z. Turned this much
// inside its root, it faces the way they did.
const FORM_TURN = Math.PI;
// Its eyes, rebuilt (see rebuildEyes): how much smaller than the export's
// eye geometry, and how far out from the skin (as a fraction of the eye's
// size), so none of it sinks in.
const EYE_SCALE = 0.03;
const EYE_LIFT = 0.35;
// Eye pieces this close together (export units) belong to one eye.
const EYE_CLUSTER = 20;
// Its pieces are stacked almost touching; shrunk, they'd flicker through
// one another. Each, smaller in front of bigger, stands this far (as a
// fraction of the eye's size) in front of the one behind.
const EYE_LAYER_GAP = 0.05;

/**
 * Starts loading a fresh copy of the form, for one transformation. Each
 * is its own (rooms free their GPU resources and images when they go, so
 * one shared between visits wouldn't survive them): load it on entering a
 * room where someone may abstract, so it's ready when they do.
 * @returns {Promise<object | null>} the parsed glTF (null if it failed)
 */
export function loadAbstractedForm() {
  return new GLTFLoader().loadAsync(FORM_URL).then((gltf) => {
    if (prepareForm(gltf)) return gltf;
    console.warn('The abstracted form model has no body to show; abstraction will only show the void effect.');
    return null;
  }, (error) => {
    console.warn('The abstracted form could not be loaded; abstraction will only show the void effect.', error);
    return null;
  });
}

/**
 * Readies the export: its body (the biggest mesh: the black, four-legged
 * shape) as it is, and its eyes rebuilt onto their bones (rebuildEyes).
 * Returns whether there was a body to show (and an Idle to play).
 */
export function prepareForm(gltf) {
  const meshes = [];
  gltf.scene.traverse((child) => { if (child.isMesh) meshes.push(child); });
  const size = mesh => mesh.geometry.attributes.position.count;
  const body = meshes.reduce((biggest, mesh) => (!biggest || size(mesh) > size(biggest) ? mesh : biggest), null);
  if (!body) return false;
  rebuildEyes(gltf.scene, body, meshes.filter((mesh) => mesh !== body));
  return gltf.animations.some(clip => clip.name === IDLE);
}

/**
 * Puts the form's many eyes back on it. In this export (an FBX conversion)
 * each eye's pieces (its black lid, its white or coloured iris, its pupil
 * rings) are skinned in their own lost frame: blown up and scattered far
 * off the body. Its eye bones, though, sit at the body's skin, two to an
 * eye. So each eye's pieces, kept together as they were modelled, are
 * shrunk by EYE_SCALE and seated on the skin over its bone (found by a ray
 * in toward the bone, from out the way the bone hangs off the body), facing
 * out along the skin there, and fixed to the bone as ordinary meshes, so it
 * moves with the body.
 */
function rebuildEyes(root, body, pieces) {
  root.updateMatrixWorld(true);
  root.traverse((child) => { if (child.isSkinnedMesh) child.skeleton.update(); });
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector3();
  const parts = pieces.filter((mesh) => mesh.isSkinnedMesh).map((mesh) => {
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    // The bone with most of its weight.
    const weight = new Map();
    for (let i = 0; i < skinIndex.count; i++) {
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > 0) weight.set(skinIndex.getComponent(i, k), (weight.get(skinIndex.getComponent(i, k)) ?? 0) + w);
      }
    }
    const top = [...weight].sort((a, b) => b[1] - a[1])[0];
    const centre = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) centre.add(point.fromBufferAttribute(position, i));
    return { mesh, bone: top ? mesh.skeleton.bones[top[0]] : null, centre: centre.divideScalar(Math.max(1, position.count)), count: position.count };
  });

  // Pieces of one eye share a centre; different eyes are far apart.
  const eyes = [];
  for (const part of parts) {
    const eye = eyes.find((candidate) => candidate[0].centre.distanceTo(part.centre) < EYE_CLUSTER);
    if (eye) eye.push(part); else eyes.push([part]);
  }

  for (const eye of eyes) {
    const main = eye.reduce((biggest, part) => (part.count > biggest.count ? part : biggest));
    const bone = main.bone;
    let anchor = bone?.parent;
    while (anchor?.isBone && /^Eye/.test(anchor.name)) anchor = anchor.parent; // past its pupil's bone
    if (!bone || !anchor) { for (const part of eye) part.mesh.removeFromParent(); continue; }

    // Its pieces are stacked flat, like coins: their thinnest direction is
    // the way it looks, toward the smaller pieces (the pupil on top).
    const centre = new THREE.Vector3();
    let total = 0;
    for (const part of eye) { centre.addScaledVector(part.centre, part.count); total += part.count; }
    centre.divideScalar(total);
    const look = thinnestAxis(eye.map((part) => part.mesh.geometry.attributes.position), centre);
    const front = new THREE.Vector3();
    for (const part of eye) if (part !== main) front.add(part.centre).sub(main.centre);
    if (front.dot(look) < 0) look.negate();
    const radius = eyeRadius(eye, centre) * EYE_SCALE;

    let at = bone.getWorldPosition(new THREE.Vector3());
    let out = at.clone().sub(anchor.getWorldPosition(new THREE.Vector3())).normalize();
    // The skin over the bone, from outside: there, and its own facing.
    raycaster.set(at.clone().addScaledVector(out, 50), out.clone().negate());
    const hit = raycaster.intersectObject(body, false)[0];
    if (hit?.face) {
      at = hit.point;
      const normal = hit.face.normal.clone().transformDirection(body.matrixWorld);
      if (normal.dot(out) < 0) normal.negate(); // double-sided: the outward side
      out = normal;
    }
    const place = new THREE.Matrix4().compose(
      at.clone().addScaledVector(out, radius * EYE_LIFT),
      new THREE.Quaternion().setFromUnitVectors(look, out),
      new THREE.Vector3().setScalar(EYE_SCALE),
    ).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
    const intoBone = bone.matrixWorld.clone().invert().multiply(place);
    const rawRadius = radius / EYE_SCALE;
    const layers = eye.map((part) => ({ part, reach: eyeRadius([part], part.centre) })).sort((a, b) => b.reach - a.reach);
    for (const [index, { part: { mesh } }] of layers.entries()) {
      const geometry = mesh.geometry.clone();
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      const lift = look.clone().multiplyScalar(index * rawRadius * EYE_LAYER_GAP);
      geometry.applyMatrix4(intoBone.clone().multiply(new THREE.Matrix4().makeTranslation(lift.x, lift.y, lift.z)));
      const fixed = new THREE.Mesh(geometry, mesh.material);
      fixed.name = `${mesh.name}_eye`;
      bone.add(fixed);
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
}

/** The direction a set of points is spread least along, about `centre`. */
function thinnestAxis(positions, centre) {
  // Covariance, then the eigenvector of its smallest eigenvalue: power
  // iteration on (trace·I − C), whose largest eigenvector that is.
  const c = [0, 0, 0, 0, 0, 0]; // xx yy zz xy xz yz
  const p = new THREE.Vector3();
  for (const position of positions) {
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).sub(centre);
      c[0] += p.x * p.x; c[1] += p.y * p.y; c[2] += p.z * p.z;
      c[3] += p.x * p.y; c[4] += p.x * p.z; c[5] += p.y * p.z;
    }
  }
  const trace = c[0] + c[1] + c[2];
  const m = new THREE.Matrix3().set(
    trace - c[0], -c[3], -c[4],
    -c[3], trace - c[1], -c[5],
    -c[4], -c[5], trace - c[2],
  );
  const v = new THREE.Vector3(0.3, 0.5, 0.8);
  for (let i = 0; i < 50; i++) v.applyMatrix3(m).normalize();
  return v;
}

/** How far an eye's pieces reach from its centre (export units). */
function eyeRadius(eye, centre) {
  let reach = 0;
  const p = new THREE.Vector3();
  for (const { mesh } of eye) {
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) reach = Math.max(reach, p.fromBufferAttribute(position, i).distanceTo(centre));
  }
  return reach;
}

/**
 * Turns characters into the form, and keeps everything it's playing moving
 * (update() it every frame).
 */
export function createAbstractions() {
  const running = new Set(); // each: (deltaSeconds) => void
  return {
    update(deltaSeconds) { for (const tick of running) tick(deltaSeconds); },

    /**
     * Eats `character` away and raises the form in its place.
     *
     * @param {THREE.Object3D} character its root group, feet at its origin
     * @param {{ parent: THREE.Object3D, form: Promise<object | null>,
     *   effect?: object, voidSeconds?: number, height?: number }} options
     *   parent: where the form goes (the room). form: from loadAbstractedForm().
     *   effect: the character's own abstraction effect, if it has one (Kaufmo);
     *   otherwise one is made for it. voidSeconds 0: no void first (it
     *   happens out of sight, under a flash). setShown: how to hide them and
     *   bring them back, if something else also sets their visibility
     *   (Pomni's, by the follow camera).
     * @returns {Promise<{ form: THREE.Group | null, undo(): void }>} once the
     *   form has risen (form null if there's no usable one: then they've only
     *   gone to the void). undo() brings them back either way.
     */
    async transform(character, { parent, form, effect = null, voidSeconds = VOID_SECONDS, height = FORM_HEIGHT,
      setShown = (shown) => { character.visible = shown; } }) {
      const ownEffect = voidSeconds > 0 && !effect;
      const abstraction = voidSeconds > 0 ? effect ?? createAbstractionEffect(character) : null;
      const tickEffect = (dt) => abstraction?.update(dt);
      if (ownEffect) running.add(tickEffect);
      if (abstraction) {
        abstraction.setDistress(1);
        await abstraction.abstract(voidSeconds);
      }
      const gltf = await form;

      // Where they stood, facing the way they faced.
      character.updateMatrixWorld(true);
      const feet = character.getWorldPosition(new THREE.Vector3());
      const facing = new THREE.Euler().setFromQuaternion(character.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      setShown(false);
      if (ownEffect) { running.delete(tickEffect); abstraction.dispose(); }
      const restore = () => { setShown(true); if (!ownEffect) abstraction?.reset(); };
      if (!gltf || !parent) return { form: null, undo: restore };

      const model = cloneSkinned(gltf.scene);
      model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.frustumCulled = false; } });
      const mixer = new THREE.AnimationMixer(model);
      const clip = name => gltf.animations.find(animation => animation.name === name);
      // Sized and grounded from its standing pose.
      const idle = clip(IDLE) && mixer.clipAction(clip(IDLE));
      idle?.play(); mixer.update(0);
      model.updateMatrixWorld(true);
      model.traverse((child) => { if (child.isSkinnedMesh) child.skeleton.update(); });
      const box = new THREE.Box3().setFromObject(model, true);
      const size = box.getSize(new THREE.Vector3());
      const scale = height / Math.max(size.y, 1e-6);
      const centre = box.getCenter(new THREE.Vector3());
      model.scale.multiplyScalar(scale);
      model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
      const root = new THREE.Group();
      root.name = 'AbstractedForm';
      const turn = new THREE.Group();
      turn.rotation.y = FORM_TURN;
      turn.add(model);
      root.add(turn);
      root.position.copy(parent.worldToLocal(feet.clone()));
      root.rotation.y = facing;
      parent.add(root);

      // Rising up out of the floor, then idling.
      const spawn = clip(SPAWN) && mixer.clipAction(clip(SPAWN));
      let rising = 0;
      if (spawn) {
        idle?.stop();
        spawn.setLoop(THREE.LoopOnce, 1); spawn.clampWhenFinished = true; spawn.play();
        rising = clip(SPAWN).duration;
      }
      const tickForm = (dt) => mixer.update(dt);
      running.add(tickForm);
      await new Promise((resolve) => {
        if (!rising) { resolve(); return; }
        const wait = (dt) => {
          rising -= dt;
          if (rising > IDLE_BLEND) return;
          running.delete(wait);
          if (idle) { idle.reset().play(); spawn.crossFadeTo(idle, IDLE_BLEND, false); }
          resolve();
        };
        running.add(wait);
      });
      const attack = clip(ATTACK) && mixer.clipAction(clip(ATTACK));
      return {
        form: root,
        /**
         * Leaps onto `target` (a world point on the floor): turns to it,
         * lunges (its Attack) and arcs through the air `height` metres high,
         * landing on it after `seconds`.
         */
        leap(target, { seconds = 0.8, height = 1.8 } = {}) {
          const from = root.position.clone();
          const to = parent.worldToLocal(target.clone());
          root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
          if (attack) {
            attack.reset();
            attack.setLoop(THREE.LoopOnce, 1);
            attack.clampWhenFinished = true;
            // Its lunge, stretched over the whole leap.
            attack.timeScale = clip(ATTACK).duration / seconds;
            attack.play();
            idle?.crossFadeTo(attack, 0.12, false);
          }
          return new Promise((resolve) => {
            let t = 0;
            const fly = (dt) => {
              t = Math.min(seconds, t + dt);
              const f = t / seconds;
              root.position.lerpVectors(from, to, f);
              root.position.y = from.y + (to.y - from.y) * f + height * 4 * f * (1 - f);
              if (t < seconds) return;
              running.delete(fly);
              resolve();
            };
            running.add(fly);
          });
        },
        /** Gone again, and them back (a retry). */
        undo() {
          running.delete(tickForm);
          mixer.stopAllAction();
          root.removeFromParent();
          // Its own copy (loadAbstractedForm), so all of it can go.
          root.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry.dispose();
            for (const material of [child.material].flat()) {
              for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
              material.dispose();
            }
          });
          restore();
        },
      };
    },
  };
}
