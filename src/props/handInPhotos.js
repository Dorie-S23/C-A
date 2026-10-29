import * as THREE from 'three';

// The office photos as Pomni hands them in (level2Return /
// level2Abstraction): a little stack of prints that rides in her hand,
// passes to Kaufmo's, gets spread across the floor between them, and is
// gathered back up against his chest. Each card eases toward wherever its
// current mode puts it, so a beat skipped early just hurries them along.
const CARD_WIDTH = 0.26;
const CARD_HEIGHT = 0.16;
const BORDER = 0.012;
const STACK_GAP = 0.004; // between cards in a stack
const FOLLOW_SHARPNESS = 10;
const SPREAD_STAGGER = 0.14; // seconds between cards landing on the floor
const ARC_HEIGHT = 0.18;     // how high a card lifts on its way to or from the floor

// Where the cards lie on the floor, in front of whoever spread them (his
// frame: +X his left, +Z ahead; metres, radians): fanned out in a
// shallow arc where his hands can reach.
const FLOOR_FAN = [
  { x: -0.42, z: 0.5, turn: 0.35 },
  { x: -0.2, z: 0.66, turn: 0.12 },
  { x: 0.05, z: 0.7, turn: -0.05 },
  { x: 0.29, z: 0.62, turn: -0.2 },
  { x: 0.48, z: 0.46, turn: -0.42 },
  { x: 0.0, z: 0.9, turn: 0.04 },
];
// When they slip from his hands: wider, rougher.
const DROP_SCATTER = [
  { x: -0.5, z: 0.35, turn: 1.1 }, { x: 0.35, z: 0.55, turn: -0.6 }, { x: -0.1, z: 0.8, turn: 2.2 },
  { x: 0.55, z: 0.2, turn: 0.4 }, { x: -0.3, z: 0.6, turn: -1.4 }, { x: 0.15, z: 0.3, turn: 2.8 },
];

const textureLoader = new THREE.TextureLoader();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * @param {string[]} urls the photos being handed in
 * @param {{ kaufmo: THREE.Object3D, kaufmoHands: { left: THREE.Object3D, right: THREE.Object3D },
 *   pomniHands: () => [THREE.Object3D, THREE.Object3D] | null, floorY: number }} actors
 * @returns {{ group: THREE.Group, setMode: (mode: string) => void, mode: string,
 *   tap: (index?: number) => void, after: (seconds: number, run: () => void) => void,
 *   update: (deltaSeconds: number) => void, dispose: () => void }}
 */
export function createHandInPhotos(urls, { kaufmo, kaufmoHands, pomniHands, floorY }) {
  const group = new THREE.Group();
  group.name = 'HandInPhotos';
  const back = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 });
  const cards = urls.map((url) => {
    const map = textureLoader.load(url);
    map.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, 0.002), back);
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH - BORDER * 2, CARD_HEIGHT - BORDER * 2),
      new THREE.MeshStandardMaterial({ map, roughness: 0.75 }),
    );
    photo.position.z = 0.0015;
    paper.castShadow = true;
    card.add(paper, photo);
    card.visible = false;
    group.add(card);
    return { card, from: new THREE.Vector3(), delay: 0, travel: 1, hop: 0 };
  });

  let mode = 'hidden';
  let timers = []; // { left, run }: see after()
  let tapped = -1;
  let tapTime = 0;
  const target = new THREE.Vector3();
  const targetQuat = new THREE.Quaternion();
  const facing = new THREE.Quaternion();

  /**
   * hidden; pomni (in her hand); kaufmo (held out in his hands); chest
   * (flat against his chest); floor (fanned out in front of him); dropped
   * (scattered round his feet).
   */
  function setMode(next) {
    if (next === mode) return;
    const toFloor = next === 'floor' || next === 'dropped';
    const fromFloor = mode === 'floor' || mode === 'dropped';
    cards.forEach((entry, i) => {
      if (mode === 'hidden') entry.card.visible = false;
      entry.from.copy(entry.card.position);
      // On to the floor one at a time; back up all together.
      entry.delay = toFloor ? i * SPREAD_STAGGER * (next === 'dropped' ? 0.3 : 1) : 0;
      entry.travel = toFloor || fromFloor ? 0 : 1;
    });
    if (mode === 'hidden') snapNext = true;
    mode = next;
  }
  let snapNext = false;

  /** A quick tap on one card (Kaufmo's finger), a little hop. */
  function tap(index = 2) {
    tapped = Math.min(index, cards.length - 1);
    tapTime = 0;
  }

  function placeFor(i) {
    kaufmo.getWorldQuaternion(facing);
    switch (mode) {
      case 'pomni': {
        const hands = pomniHands();
        if (!hands) return false;
        hands[0].getWorldPosition(_a);
        hands[1].getWorldPosition(_b);
        // Held out flat between her hands.
        target.copy(_a).add(_b).multiplyScalar(0.5);
        target.y += 0.03 + i * STACK_GAP;
        targetQuat.setFromEuler(_e.set(-Math.PI / 2 + 0.75, kaufmo.rotation.y + Math.PI, 0, 'YXZ')); // tipped up to show him
        return true;
      }
      case 'kaufmo':
      case 'chest': {
        const { left, right } = kaufmoHands;
        if (!left || !right) return false;
        left.getWorldPosition(_a);
        right.getWorldPosition(_b);
        target.copy(_a).add(_b).multiplyScalar(0.5);
        if (mode === 'kaufmo') {
          // Tipped up toward his face so he can look at them.
          target.add(_a.set(0, 0.06 + i * STACK_GAP, 0.08).applyQuaternion(facing));
          targetQuat.copy(facing).multiply(_q.setFromEuler(_e.set(-Math.PI / 2 + 0.6, 0, 0, 'XYZ')));
        } else {
          // Upright, picture to his chest, under his hands.
          target.add(_a.set(0, 0.07, 0.03 - i * STACK_GAP).applyQuaternion(facing));
          targetQuat.copy(facing).multiply(_q.setFromEuler(_e.set(0, Math.PI, 0, 'XYZ')));
        }
        return true;
      }
      case 'floor':
      case 'dropped': {
        const spot = (mode === 'floor' ? FLOOR_FAN : DROP_SCATTER)[i % FLOOR_FAN.length];
        kaufmo.getWorldPosition(target);
        target.add(_a.set(spot.x, 0, spot.z).applyQuaternion(facing));
        target.y = floorY + 0.003 + i * 0.001;
        // Flat on the floor, the picture the right way up for him.
        targetQuat.copy(facing)
          .multiply(_q.setFromAxisAngle(UP, spot.turn))
          .multiply(_q.clone().setFromEuler(_e.set(-Math.PI / 2, 0, Math.PI, 'XYZ')));
        if (i === tapped && mode === 'floor') target.y += 0.025 * Math.max(0, Math.sin(tapTime * 9)) * Math.max(0, 1 - tapTime / 1.5);
        return true;
      }
      default:
        return false;
    }
  }

  /** Runs `run` this many seconds of update() from now (so it waits out a pause too). */
  function after(seconds, run) {
    timers.push({ left: seconds, run });
  }

  function update(deltaSeconds) {
    tapTime += deltaSeconds;
    if (timers.length) {
      const due = [];
      timers = timers.filter((timer) => {
        timer.left -= deltaSeconds;
        if (timer.left > 0) return true;
        due.push(timer);
        return false;
      });
      for (const timer of due) timer.run();
    }
    const ease = 1 - Math.exp(-FOLLOW_SHARPNESS * deltaSeconds);
    cards.forEach((entry, i) => {
      const { card } = entry;
      if (!placeFor(i)) { card.visible = false; return; }
      if (snapNext || !card.visible) {
        card.position.copy(target);
        card.quaternion.copy(targetQuat);
        card.visible = true;
        entry.travel = 1;
        return;
      }
      if (entry.delay > 0) { entry.delay -= deltaSeconds; return; }
      if (entry.travel < 1) {
        // Between hands and floor: a short arc, not a slide.
        entry.travel = Math.min(1, entry.travel + deltaSeconds / 0.45);
        const t = THREE.MathUtils.smootherstep(entry.travel, 0, 1);
        card.position.lerpVectors(entry.from, target, t);
        card.position.y += Math.sin(t * Math.PI) * ARC_HEIGHT;
        card.quaternion.slerp(targetQuat, Math.min(1, ease * 1.5));
        return;
      }
      card.position.lerp(target, ease);
      card.quaternion.slerp(targetQuat, ease);
    });
    snapNext = false;
  }

  function dispose() {
    timers = [];
    group.removeFromParent();
    back.dispose();
    for (const { card } of cards) {
      card.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry.dispose();
        if (child.material !== back) {
          child.material.map?.dispose();
          child.material.dispose();
        }
      });
    }
  }

  return { group, setMode, tap, after, update, dispose, get mode() { return mode; } };
}
