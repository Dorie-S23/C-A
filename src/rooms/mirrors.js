import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

// Mirror pieces this close to a shared plane (metres) share one reflection,
// e.g. the three panels of a vanity mirror.
const SAME_PLANE_TOLERANCE = 0.02;
// Skip anything bumpier than this fraction of its size: a Reflector only
// shows a correct reflection on a flat surface.
const MAX_THICKNESS_RATIO = 0.08;
const REFLECTION_RESOLUTION = 1024;
const MIRROR_TINT = 0xd8dde0; // a little darker than white, like real glass

/**
 * Turns every mesh using `materialName` into a live mirror. Each group of
 * coplanar pieces gets one THREE.Reflector, which re-renders the scene from
 * the mirrored viewpoint — only on frames where that mirror is on screen.
 * The original meshes are hidden but stay in place, so they still collide.
 *
 * @param {THREE.Object3D} group the loaded room
 * @param {THREE.Vector3} viewpoint a point in the room (mirrors face it)
 * @returns {THREE.Mesh[]} the reflectors added to the group
 */
export function addMirrorReflections(group, viewpoint, materialName = 'Mirror Glass') {
  group.updateMatrixWorld(true);
  const pieces = [];
  group.traverse((child) => {
    if (child.isMesh && child.material?.name === materialName) {
      pieces.push(worldTriangles(child));
    }
  });

  const planes = [];
  for (const piece of pieces) {
    const plane = fitPlane(piece.positions, viewpoint);
    const match = planes.find(
      (p) => p.normal.dot(plane.normal) > 0.999
        && Math.abs(p.normal.dot(plane.center.clone().sub(p.center))) < SAME_PLANE_TOLERANCE,
    );
    if (match) match.pieces.push(piece);
    else planes.push({ ...plane, pieces: [piece] });
  }

  const reflectors = [];
  for (const plane of planes) {
    const reflector = createReflector(plane);
    if (!reflector) continue;
    for (const piece of plane.pieces) piece.mesh.visible = false;
    group.add(reflector);
    reflectors.push(reflector);
  }
  return reflectors;
}

/** The mesh's triangles as a flat world-space position array. */
function worldTriangles(mesh) {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const positions = geometry.attributes.position.clone().applyMatrix4(mesh.matrixWorld).array;
  return { mesh, positions };
}

/**
 * Best-fit plane by area-weighted triangle normals, each flipped to agree
 * with the first so a mirror's front and back faces don't cancel out (and
 * its thin rim barely counts). The normal is turned to face `viewpoint`.
 */
function fitPlane(positions, viewpoint) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  let reference = null;
  let totalArea = 0;

  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i);
    b.fromArray(positions, i + 3);
    c.fromArray(positions, i + 6);
    cross.subVectors(b, a).cross(c.clone().sub(a));
    const area = cross.length() / 2;
    if (area < 1e-10) continue;
    if (!reference) reference = cross.clone();
    if (cross.dot(reference) < 0) cross.negate();
    normal.add(cross);
    center.addScaledVector(a.add(b).add(c), area / 3);
    totalArea += area;
  }
  normal.normalize();
  center.divideScalar(totalArea);
  if (normal.dot(viewpoint.clone().sub(center)) < 0) normal.negate();
  return { normal, center };
}

/** One Reflector covering every piece of a plane, or null if they aren't flat. */
function createReflector({ normal, center, pieces }) {
  // Reflector reflects in its local XY plane (normal +Z), so build that frame.
  const helper = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const xAxis = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis);
  const frame = new THREE.Matrix4().makeBasis(xAxis, yAxis, normal).setPosition(center);
  const toLocal = frame.clone().invert();

  const local = [];
  const point = new THREE.Vector3();
  let thickness = 0;
  const box = new THREE.Box3();
  for (const { positions } of pieces) {
    for (let i = 0; i < positions.length; i += 3) {
      point.fromArray(positions, i).applyMatrix4(toLocal);
      thickness = Math.max(thickness, Math.abs(point.z));
      box.expandByPoint(point);
      local.push(point.x, point.y, 0);
    }
  }
  const size = box.getSize(new THREE.Vector3());
  if (thickness > MAX_THICKNESS_RATIO * Math.max(size.x, size.y)) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(local, 3));
  const reflector = new Reflector(geometry, {
    textureWidth: REFLECTION_RESOLUTION,
    textureHeight: REFLECTION_RESOLUTION,
    color: MIRROR_TINT,
    clipBias: 0.003,
  });
  reflector.name = 'MirrorReflector';
  reflector.material.side = THREE.DoubleSide;
  // Sit a hair in front of the glass so the hidden original can't poke through.
  frame.decompose(reflector.position, reflector.quaternion, reflector.scale);
  reflector.position.addScaledVector(normal, 0.002);
  return reflector;
}
