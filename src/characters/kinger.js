import * as THREE from 'three';
import { addEye, addGlove, addPart, addPivot, characterMaterial } from './proceduralCharacter.js';

export const KINGER_HEIGHT = 2.25;

/** An original, fully three-dimensional Kinger with a chest-owned pillow. */
export async function loadKinger() {
  const kinger = new THREE.Group();
  kinger.name = 'Kinger';
  const body = addPivot(kinger, 'KingerBody');
  const ivory = characterMaterial(0xeadfbf);
  const ivoryLight = characterMaterial(0xfff4d6, { roughness: 0.7 });
  const gold = characterMaterial(0xc99b3f, { roughness: 0.58, metalness: 0.12 });

  const profile = [
    [0.38, 0.02], [0.48, 0.1], [0.48, 0.18], [0.35, 0.25],
    [0.27, 0.48], [0.2, 0.95], [0.29, 1.35], [0.36, 1.48],
    [0.33, 1.6], [0.22, 1.72],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  addPart(body, 'KingerChessBody', new THREE.LatheGeometry(profile, 28), ivory);
  addPart(body, 'KingerBaseBand', new THREE.TorusGeometry(0.43, 0.035, 8, 28).rotateX(Math.PI / 2), gold, [0, 0.16, 0]);
  addPart(body, 'KingerCollar', new THREE.TorusGeometry(0.31, 0.045, 8, 28).rotateX(Math.PI / 2), ivoryLight, [0, 1.5, 0]);

  const head = addPivot(body, 'KingerHead', [0, 1.55, 0]);
  addPart(head, 'KingerCrownStem', new THREE.CylinderGeometry(0.13, 0.18, 0.3, 16), ivoryLight, [0, 0.18, 0]);
  addPart(head, 'KingerCrownCrossVertical', new THREE.BoxGeometry(0.12, 0.42, 0.12), ivoryLight, [0, 0.51, 0]);
  addPart(head, 'KingerCrownCrossHorizontal', new THREE.BoxGeometry(0.36, 0.12, 0.12), ivoryLight, [0, 0.54, 0]);
  addEye(head, 'KingerEyeL', [-0.13, -0.12, 0.24], { size: 0.13 });
  addEye(head, 'KingerEyeR', [0.13, -0.12, 0.24], { size: 0.13 });

  const arms = [-1, 1].map((side, index) => {
    const arm = addPivot(body, index === 0 ? 'KingerArmL' : 'KingerArmR', [side * 0.35, 1.25, 0]);
    addPart(arm, 'KingerForearm', new THREE.CylinderGeometry(0.045, 0.055, 0.46, 10), ivoryLight, [0, -0.23, 0]);
    addGlove(arm, 'KingerGlove', [0, -0.51, 0], 0.13);
    return arm;
  });

  const chest = addPivot(body, 'KingerChest', [0, 1.08, 0.25]);
  const pillow = addPivot(chest, 'KingerPillow', [0, 0, 0.08]);
  const pillowMat = characterMaterial(0x5068b8, { roughness: 0.92 });
  const cushion = addPart(pillow, 'KingerPillowCushion', new THREE.BoxGeometry(0.58, 0.44, 0.18, 3, 3, 1), pillowMat);
  cushion.rotation.z = -0.06;
  addPart(pillow, 'KingerPillowButton', new THREE.SphereGeometry(0.045, 12, 8), gold, [0, 0, 0.115]);
  for (const x of [-0.25, 0.25]) for (const y of [-0.18, 0.18]) {
    addPart(pillow, 'KingerPillowCorner', new THREE.SphereGeometry(0.035, 8, 6), gold, [x, y, 0]);
  }

  return {
    kinger,
    rig: { body, head, chest, arms, legs: [], propAnchor: chest },
    pillow,
    height: KINGER_HEIGHT,
  };
}
