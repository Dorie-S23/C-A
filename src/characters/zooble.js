import * as THREE from 'three';
import { addEye, addPart, addPivot, characterMaterial } from './proceduralCharacter.js';

export const ZOOBLE_HEIGHT = 1.75;

/** Zooble's interchangeable-looking toy parts remain separately posable meshes. */
export async function loadZooble() {
  const zooble = new THREE.Group();
  zooble.name = 'Zooble';
  const body = addPivot(zooble, 'ZoobleBody');
  const magenta = characterMaterial(0xa83f83);
  const purple = characterMaterial(0x6650a5);
  const blue = characterMaterial(0x558ba5);
  const coral = characterMaterial(0xd46670);
  const yellow = characterMaterial(0xe5bc57);
  const dark = characterMaterial(0x30243f);

  const chest = addPivot(body, 'ZoobleChest', [0, 0.83, 0]);
  const torso = addPart(chest, 'ZoobleTorso', new THREE.CylinderGeometry(0.25, 0.3, 0.55, 6), purple);
  torso.rotation.y = Math.PI / 6;
  addPart(chest, 'ZoobleChestBadge', new THREE.TorusGeometry(0.12, 0.035, 7, 16), blue, [0, 0.04, 0.26]);

  const head = addPivot(chest, 'ZoobleHead', [0, 0.48, 0]);
  const headBlock = addPart(head, 'ZoobleHeadBlock', new THREE.BoxGeometry(0.55, 0.36, 0.36), magenta);
  headBlock.rotation.z = -0.06;
  addEye(head, 'ZoobleEyeL', [-0.14, 0.01, 0.19], { size: 0.085, pupil: 0x3b2939 });
  addEye(head, 'ZoobleEyeR', [0.14, 0.01, 0.19], { size: 0.085, pupil: 0x3b2939 });
  addPart(head, 'ZoobleMouth', new THREE.BoxGeometry(0.18, 0.025, 0.025), dark, [0, -0.11, 0.2]);
  for (const side of [-1, 1]) {
    addPart(head, 'ZoobleAntenna', new THREE.CylinderGeometry(0.018, 0.018, 0.35, 7), dark, [side * 0.18, 0.32, 0]);
    addPart(head, 'ZoobleAntennaTip', new THREE.SphereGeometry(0.055, 10, 8), side < 0 ? yellow : coral, [side * 0.18, 0.51, 0]);
  }

  const arms = [-1, 1].map((side, index) => {
    const arm = addPivot(chest, index === 0 ? 'ZoobleArmL' : 'ZoobleArmR', [side * 0.32, 0.13, 0]);
    addPart(arm, 'ZoobleUpperArm', new THREE.CylinderGeometry(0.055, 0.055, 0.32, 8), side < 0 ? blue : coral, [0, -0.16, 0]);
    addPart(arm, 'ZoobleHand', side < 0 ? new THREE.BoxGeometry(0.16, 0.16, 0.16) : new THREE.SphereGeometry(0.1, 12, 8), yellow, [0, -0.38, 0]);
    return arm;
  });
  const legs = [-1, 1].map((side, index) => {
    const leg = addPivot(body, index === 0 ? 'ZoobleLegL' : 'ZoobleLegR', [side * 0.14, 0.57, 0]);
    addPart(leg, 'ZoobleLegPart', new THREE.CylinderGeometry(0.065, 0.075, 0.42, 7), side < 0 ? coral : blue, [0, -0.21, 0]);
    addPart(leg, 'ZoobleFoot', side < 0 ? new THREE.BoxGeometry(0.18, 0.12, 0.3) : new THREE.CylinderGeometry(0.11, 0.13, 0.13, 10), side < 0 ? yellow : magenta, [0, -0.48, 0.07]);
    return leg;
  });

  return {
    zooble,
    rig: { body, head, chest, arms, legs, propAnchor: chest },
    height: ZOOBLE_HEIGHT,
  };
}
