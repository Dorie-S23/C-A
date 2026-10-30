// Builds public/models/characters/Ribbit/ribbit-mixamo.glb, the Ribbit the
// game loads, from Mixamo's downloads in assets-src/ribbit-mixamo/:
//   ribbit-sleeping.fbx      "With Skin": her mesh on Mixamo's skeleton
//                            plus the lying-asleep loop
//   ribbit-sitting.fbx       "Without Skin": sitting, legs hanging
//   ribbit-standing-sad.fbx  "Without Skin": a slumped standing idle
// (The mesh Mixamo rigged came from tools/exportRibbitForMixamo.mjs.)
//
// Why convert rather than load the FBXs in the game: three files would be
// ~3 MB, FBX comes back unwelded (≈90k vertices for her 14k), with Phong
// stand-ins for her materials and each bone duplicated once per mesh. One
// GLB is a single, much smaller download that GLTFLoader already handles.
//
// Run from the repo root after replacing any of the downloads:
//     node tools/buildRibbitMixamo.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'assets-src/ribbit-mixamo');
const SKIN_FILE = 'ribbit-sleeping.fbx';
// Clip name in the GLB -> Mixamo download. src/characters/ribbit.js plays
// them by these names.
const CLIPS = {
  Sleeping: 'ribbit-sleeping.fbx',
  Sitting: 'ribbit-sitting.fbx',
  SadIdle: 'ribbit-standing-sad.fbx',
};
// Her flat-coloured materials, by name, from the model Mixamo was given.
const MATERIALS_FROM = path.join(ROOT, 'public/models/characters/Ribbit/ribbit-rigged.glb');
const OUTPUT = path.join(ROOT, 'public/models/characters/Ribbit/ribbit-mixamo.glb');
// Mixamo works in centimetres; the game in metres.
const SCALE = 0.01;

// GLTFExporter's binary output reads its Blob back with a FileReader, which
// Node doesn't have.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); });
  }
};

const arrayBuffer = (file) => {
  const bytes = fs.readFileSync(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
// FBXLoader warns once per vertex with over four weights; it keeps the
// four heaviest, which is all a GPU skin takes anyway.
const warn = console.warn;
console.warn = (...args) => { if (!String(args[0]).includes('more than 4 skinning weights')) warn(...args); };
const loadFbx = (file) => new FBXLoader().parse(arrayBuffer(path.join(SOURCE_DIR, file)), '');

const model = loadFbx(SKIN_FILE);
model.name = 'RibbitMixamo';
collapseDuplicateBones(model);

const materials = new Map();
(await new GLTFLoader().parseAsync(arrayBuffer(MATERIALS_FROM), '')).scene.traverse((child) => {
  if (child.isMesh) materials.set(child.material.name, child.material);
});

let vertices = 0;
model.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  // Mixamo appends "mat" to every material name: mat12 comes back mat12mat.
  const name = mesh.material.name.replace(/mat$/, '');
  const material = materials.get(name);
  if (!material) throw new Error(`No material ${name} in ${path.basename(MATERIALS_FROM)}`);
  mesh.material = material;
  mesh.name = `Ribbit_${name}`;

  // FBX gives every triangle corner its own vertex; weld them back up.
  const geometry = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    geometry.setAttribute(key, mesh.geometry.attributes[key]);
  }
  mesh.geometry = mergeVertices(geometry);
  vertices += mesh.geometry.attributes.position.count;
});

const animations = Object.entries(CLIPS).map(([name, file]) => {
  const clip = (file === SKIN_FILE ? { animations: model.animations } : loadFbx(file)).animations[0];
  clip.name = name;
  clip.optimize();
  return clip;
});

model.scale.setScalar(SCALE);
model.updateMatrixWorld(true);

const glb = await new GLTFExporter().parseAsync(model, { binary: true, animations });
fs.writeFileSync(OUTPUT, Buffer.from(glb));
console.log(`${path.relative(ROOT, OUTPUT)}  ${(glb.byteLength / 1e6).toFixed(2)} MB`);
console.log(`  ${vertices} vertices; clips ${animations.map((c) => `${c.name} ${c.duration.toFixed(1)}s`).join(', ')}`);

/**
 * FBXLoader makes one Bone per bone per skinned mesh that uses it, each
 * nested inside the last at no offset (mixamorigHead holds 15 more
 * mixamorigHeads). Animation tracks only reach the outermost, so this
 * points every mesh's skeleton at that one and drops the copies.
 */
function collapseDuplicateBones(root) {
  const canonical = new Map();
  root.traverse((child) => {
    if (child.isBone && !canonical.has(child.name)) canonical.set(child.name, child);
  });
  root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const bones = mesh.skeleton.bones.map((bone) => canonical.get(bone.name));
    mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
  });
  const isCopyOf = (bone) => (child) => child.isBone && child.name === bone.name;
  for (const bone of canonical.values()) {
    // Each copy's own copies come up a level as it goes, so repeat.
    for (let copy; (copy = bone.children.find(isCopyOf(bone)));) {
      // Safe only because a copy sits exactly on its bone.
      if (copy.position.length() > 1e-4 || Math.abs(copy.quaternion.w) < 1 - 1e-6) {
        throw new Error(`Duplicate ${bone.name} is offset from the original`);
      }
      for (const child of [...copy.children]) bone.add(child);
      bone.remove(copy);
    }
  }
}
