import * as THREE from 'three';
import { addPart, addPivot, characterMaterial } from './proceduralCharacter.js';

export const GANGLE_HEIGHT = 1.35;

function ribbon(points, radius = 0.045) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 20, radius, 7, false);
}

/** Gangle's mask and ribbons are geometry, never a dialogue-sprite plane. */
export async function loadGangle() {
  const gangle = new THREE.Group();
  gangle.name = 'Gangle';
  const body = addPivot(gangle, 'GangleBody');
  const red = characterMaterial(0xb92f50, { roughness: 0.8 });
  const white = characterMaterial(0xfff7e9, { roughness: 0.64 });
  const dark = characterMaterial(0x2b2029, { roughness: 0.7 });

  addPart(body, 'GangleRibbonTorso', ribbon([[0, 0.35, 0], [-0.09, 0.58, 0], [0.08, 0.78, 0], [0, 0.98, 0]], 0.075), red);
  const head = addPivot(body, 'GangleHead', [0, 1.04, 0.03]);
  const mask = addPart(head, 'GangleComedyMask', new THREE.SphereGeometry(0.3, 24, 16), white, [0, 0, 0.04]);
  mask.scale.set(0.9, 1.08, 0.36);
  for (const side of [-1, 1]) {
    const eye = addPart(head, 'GangleMaskEye', new THREE.SphereGeometry(0.065, 12, 8), dark, [side * 0.1, 0.055, 0.145]);
    eye.scale.set(0.75, 1.35, 0.25);
  }
  const smile = addPart(head, 'GangleMaskSmile', new THREE.TorusGeometry(0.105, 0.014, 6, 18, Math.PI), dark, [0, -0.045, 0.15]);
  smile.rotation.z = Math.PI;

  const arms = [-1, 1].map((side, index) => {
    const arm = addPivot(body, index === 0 ? 'GangleArmL' : 'GangleArmR', [side * 0.18, 0.87, 0]);
    addPart(arm, 'GangleRibbonArm', ribbon([[0, 0, 0], [side * 0.2, -0.12, 0], [side * 0.23, -0.4, 0.03], [side * 0.14, -0.55, 0.06]], 0.04), red);
    return arm;
  });
  const legs = [-1, 1].map((side, index) => {
    const leg = addPivot(body, index === 0 ? 'GangleLegL' : 'GangleLegR', [side * 0.09, 0.4, 0]);
    addPart(leg, 'GangleRibbonLeg', ribbon([[0, 0, 0], [side * 0.08, -0.15, 0], [side * 0.04, -0.34, 0.04], [side * 0.13, -0.38, 0.14]], 0.045), red);
    return leg;
  });

  return {
    gangle,
    rig: { body, head, chest: body, arms, legs, propAnchor: body },
    height: GANGLE_HEIGHT,
  };
}
