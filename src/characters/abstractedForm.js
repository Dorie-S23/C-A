import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createAbstractionEffect } from '../effects/abstraction.js';

// What's left of someone once they've abstracted (failing a level: Pomni in
// the maze, Kaufmo, Jax). The shared abstraction effect eats them away from
// the head down (effects/abstraction.js), then this, the abstracted form,
// rises up where they stood (its "spawn" animation) and stays, idling.
const FORM_URL = './models/characters/abstracted form/abstracted_kaufmo.glb';
const SPAWN = 'ABS_Rig|spawn';
const IDLE = 'Idle';
export const FORM_HEIGHT = 2.6;   // metres: a good head taller than any of them
const VOID_SECONDS = 1.8;         // the effect eating them away, by default
const IDLE_BLEND = 0.5;

/**
 * Starts loading a fresh copy of the form, for one transformation. Each
 * is its own (rooms free their GPU resources and images when they go, so
 * one shared between visits wouldn't survive them): load it on entering a
 * room where someone may abstract, so it's ready when they do.
 * @returns {Promise<object | null>} the parsed glTF (null if it failed)
 */
export function loadAbstractedForm() {
  return new GLTFLoader().loadAsync(encodeURI(FORM_URL)).then((gltf) => {
    if (keepBody(gltf)) return gltf;
    console.warn('The abstracted form model has no body to show; abstraction will only show the void effect.');
    return null;
  }, (error) => {
    console.warn('The abstracted form could not be loaded; abstraction will only show the void effect.', error);
    return null;
  });
}

/**
 * Keeps only the form's body (its biggest mesh: the black, four-legged
 * shape), and drops the rest. In this export the many eyes are skinned at
 * a different scale from the body (an FBX conversion: their nodes carry
 * scales that glTF viewers ignore but three.js applies), so they'd float
 * metres away, scattered. Re-exported with transforms applied, they could
 * stay. Returns whether there was a body to keep (and an Idle to play).
 */
export function keepBody(gltf) {
  const meshes = [];
  gltf.scene.traverse((child) => { if (child.isMesh) meshes.push(child); });
  const size = mesh => mesh.geometry.attributes.position.count;
  const body = meshes.reduce((biggest, mesh) => (!biggest || size(mesh) > size(biggest) ? mesh : biggest), null);
  for (const mesh of meshes) {
    if (mesh === body) continue;
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  return Boolean(body) && gltf.animations.some(clip => clip.name === IDLE);
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
      root.add(model);
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
      return {
        form: root,
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
