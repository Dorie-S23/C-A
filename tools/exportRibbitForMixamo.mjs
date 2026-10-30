// Writes Ribbit as a zip Mixamo's auto-rigger accepts (OBJ + MTL), so her
// sleeping/waking animations can come from Mixamo.
//
// Why not upload ribbit-rigged.glb itself: Mixamo only takes FBX, OBJ or a
// zip of OBJ + MTL + textures, and Blender isn't on every teammate's
// machine. Why not the source ribbit.glb: it has two heads and 140k
// triangles; ribbit-rigged.glb is the cleaned-up one (bow head upright,
// 30k triangles, 2.2 m, feet at the origin, facing +Z), and its bind pose
// is the source's T-pose, which is what the auto-rigger wants.
//
// Material names (mat0...mat22) and colours are kept in the MTL so the
// FBX Mixamo hands back can be recoloured to match by name.
//
// Run from the repo root:
//     node tools/exportRibbitForMixamo.mjs
// Output: assets-src/ribbit-mixamo/ribbit-for-mixamo.zip (upload that).
// Mixamo's downloads go back in the same folder, as the game's source.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'public/models/characters/Ribbit/ribbit-rigged.glb');
const OUT_DIR = path.join(ROOT, 'assets-src/ribbit-mixamo');
const ZIP = path.join(OUT_DIR, 'ribbit-for-mixamo.zip');
// Mixamo's rigs come back in centimetres; giving it centimetres to begin
// with keeps its preview and the downloaded skeleton at a sensible size.
const SCALE = 100;

const bytes = fs.readFileSync(SOURCE);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
gltf.scene.updateMatrixWorld(true);

let obj = '# Ribbit, bind (T-) pose, centimetres, +Y up, facing +Z\nmtllib ribbit.mtl\n';
let mtl = '';
const materials = new Map();
const bounds = new THREE.Box3();
const point = new THREE.Vector3();
const normal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
let vertexBase = 1;

gltf.scene.traverse((mesh) => {
  if (!mesh.isMesh) return;
  // At rest every bone sits at its bind pose, so a skinned vertex renders
  // exactly where matrixWorld puts its unskinned position.
  normalMatrix.getNormalMatrix(mesh.matrixWorld);
  const { position, normal: normals } = mesh.geometry.attributes;
  const index = mesh.geometry.index;
  const name = mesh.material.name || `material${materials.size}`;
  materials.set(name, mesh.material.color);

  obj += `o ${mesh.name || name}\n`;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(SCALE);
    bounds.expandByPoint(point);
    obj += `v ${point.x.toFixed(4)} ${point.y.toFixed(4)} ${point.z.toFixed(4)}\n`;
  }
  for (let i = 0; i < position.count; i++) {
    normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
    obj += `vn ${normal.x.toFixed(4)} ${normal.y.toFixed(4)} ${normal.z.toFixed(4)}\n`;
  }
  obj += `usemtl ${name}\n`;
  const triangles = index ? index.count / 3 : position.count / 3;
  for (let t = 0; t < triangles; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k) + vertexBase);
    obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
  }
  vertexBase += position.count;
});

for (const [name, color] of materials) {
  // MTL colours are linear, like three.js's internal Color values.
  mtl += `newmtl ${name}\nKd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}\nKs 0 0 0\nd 1\nillum 1\n\n`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeStoredZip(ZIP, { 'ribbit.obj': Buffer.from(obj), 'ribbit.mtl': Buffer.from(mtl) });

const size = bounds.getSize(new THREE.Vector3());
console.log(`${path.relative(ROOT, ZIP)}  ${(fs.statSync(ZIP).size / 1e6).toFixed(1)} MB`);
console.log(`  ${vertexBase - 1} vertices, ${materials.size} materials`);
console.log(`  ${size.x.toFixed(0)} wide (arm span) x ${size.y.toFixed(0)} tall x ${size.z.toFixed(0)} deep, cm`);

// --- a minimal zip writer (stored, no compression; see tools/package.mjs) ---

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeStoredZip(zipPath, files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [fileName, data] of Object.entries(files)) {
    const name = Buffer.from(fileName, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...parts, ...central, end]));
}
