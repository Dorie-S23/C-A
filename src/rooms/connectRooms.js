import * as THREE from 'three';

/**
 * Physically joins a second room onto this one: `guest` is moved and turned
 * so its doorway sits exactly in `host`'s doorway, facing out of the far
 * side of the wall, then merged in — its meshes join host.group (so it
 * renders, and floor/wall raycasts against the room hit it), and its
 * collision, interactables and update join the host's. Walking through the
 * doorway is then just walking; no portal, no loading screen.
 *
 * The guest's own door (the far face of the same doorway) should already
 * be hidden and out of its collisionMeshes — the host's door is the one
 * that opens and shuts.
 *
 * @param {{ group: THREE.Group, collisionMeshes: Array, interactables?: Array,
 *   update?: Function }} host the room being loaded (e.g. Dorm Hall)
 * @param {{ group: THREE.Group, collisionMeshes: Array, interactables?: Array,
 *   update?: Function }} guest an already-loaded room, still at its own origin
 * @param {{ frameBox: THREE.Box3, intoRoom: THREE.Vector3 }} hostDoor the
 *   host's door frame bounds, and which way is "into the host" through it
 * @param {{ frameBox: THREE.Box3, intoRoom: THREE.Vector3 }} guestDoor the
 *   same for the guest's door, in the guest's own coordinates
 * @returns {{ bounds: THREE.Box3 }} the guest's bounds, now in host coordinates
 */
export function attachRoomBehindDoor(host, guest, hostDoor, guestDoor) {
  // Turn the guest so "into the guest" points out the back of the host's
  // doorway (yaw 0 is +Z; atan2(x, z) is a direction's yaw)...
  const yawOf = (v) => Math.atan2(v.x, v.z);
  const yaw = yawOf(hostDoor.intoRoom.clone().negate()) - yawOf(guestDoor.intoRoom);
  const rotation = new THREE.Matrix4().makeRotationY(yaw);

  // ...then slide it so the two doorways' floor centres meet.
  const hostSill = sill(hostDoor.frameBox);
  const guestSill = sill(guestDoor.frameBox).applyMatrix4(rotation);
  const placement = new THREE.Matrix4()
    .makeTranslation(hostSill.x - guestSill.x, hostSill.y - guestSill.y, hostSill.z - guestSill.z)
    .multiply(rotation);

  host.group.updateMatrixWorld(true);
  guest.group.applyMatrix4(placement);
  guest.group.updateMatrixWorld(true);
  separateSharedWall(host, guest, hostDoor);
  host.group.attach(guest.group);
  host.group.updateMatrixWorld(true);

  // HemisphereLights light the whole scene, not just their room — the
  // host already has one, and two would wash everything out.
  const hemispheres = [];
  guest.group.traverse((child) => { if (child.isHemisphereLight) hemispheres.push(child); });
  for (const light of hemispheres) light.removeFromParent();

  // Collision boxes are world-space, measured where the guest used to be.
  for (const entry of guest.collisionMeshes) entry.box.setFromObject(entry.mesh);
  host.collisionMeshes.push(...guest.collisionMeshes);
  host.interactables = [...(host.interactables ?? []), ...(guest.interactables ?? [])];
  if (guest.update) {
    const hostUpdate = host.update;
    const guestUpdate = guest.update;
    host.update = (...args) => {
      hostUpdate?.(...args);
      guestUpdate(...args);
    };
  }

  return { bounds: new THREE.Box3().setFromObject(guest.group) };
}

// How far either side of the doorway's wall plane a surface still counts
// as part of that wall, and how far out around the door to sample it.
const WALL_PLANE_TOLERANCE = 0.2;
const WALL_SAMPLE_OFFSETS = [0.4, 1.2, 2.5];
const WALL_SAMPLE_HEIGHTS = [0.5, 1.3, 2.2, 3.0];
// How far behind the host's wall surface the guest's wall goes.
const WALL_SETBACK = 0.004;

/**
 * Lining the doorways up puts the two rooms' walls within millimetres of
 * each other, and not necessarily in the right order: Pomni's wall came
 * out 6 mm on the hall side of the hall's, so the hall's pilasters poked
 * through into her room and the ends of her walls showed in the hall.
 * So the guest is slid back until its wall surface is just behind the
 * host's — then each room's wall hides the other's stray edges.
 *
 * Both walls are double-sided, though, and that close the depth buffer
 * can't tell them apart from far off (the hall is 120 m long), so they'd
 * flicker through each other. Each surface facing into its own room is
 * made one-sided, so from the other room it simply isn't drawn.
 *
 * Call with `guest` placed but not yet attached to `host`.
 */
function separateSharedWall(host, guest, hostDoor) {
  const into = hostDoor.intoRoom; // into the host, through the doorway
  const axis = Math.abs(into.x) > Math.abs(into.z) ? 'x' : 'z';
  const wide = axis === 'x' ? 'z' : 'x';
  const plane = sill(hostDoor.frameBox);
  const halfWidth = (hostDoor.frameBox.max[wide] - hostDoor.frameBox.min[wide]) / 2;
  const depth = (point) => point.dot(into); // further into the host = larger

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const normal = new THREE.Vector3();
  // Surfaces facing into their own room — the walls themselves, as
  // opposed to the backs of trim or frames, which face the other way.
  const wallHits = (group, ownSide) => {
    const hits = [];
    for (const height of WALL_SAMPLE_HEIGHTS) {
      for (const offset of WALL_SAMPLE_OFFSETS) {
        for (const sideSign of [-1, 1]) {
          origin.copy(plane);
          origin[wide] += sideSign * (halfWidth + offset);
          origin.y = plane.y + height;
          for (const direction of [into, into.clone().negate()]) {
            raycaster.set(origin.clone().addScaledVector(direction, -WALL_PLANE_TOLERANCE), direction);
            raycaster.far = WALL_PLANE_TOLERANCE * 2;
            for (const hit of raycaster.intersectObject(group, true)) {
              if (!hit.object.isMesh || !hit.face) continue;
              normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
              if (normal.dot(ownSide) >= 0.9) hits.push(hit);
            }
          }
        }
      }
    }
    return hits;
  };

  const hostHits = wallHits(host.group, into);
  const guestHits = wallHits(guest.group, into.clone().negate());
  if (hostHits.length > 0 && guestHits.length > 0) {
    // The host's wall is its deepest surface facing into it; the guest's,
    // the one of its own nearest the host.
    const hostWall = Math.min(...hostHits.map((hit) => depth(hit.point)));
    const guestWall = Math.max(...guestHits.map((hit) => depth(hit.point)));
    const overlap = guestWall - (hostWall - WALL_SETBACK);
    if (overlap > 0) {
      guest.group.position.addScaledVector(into, -overlap);
      guest.group.updateMatrixWorld(true);
    }
  }

  for (const object of new Set([...hostHits, ...guestHits].map((hit) => hit.object))) {
    faceOwnRoomOnly(object);
  }
}

function faceOwnRoomOnly(mesh) {
  const fix = (material) => {
    if (material.side !== THREE.DoubleSide) return material;
    const copy = material.clone();
    copy.side = THREE.FrontSide;
    copy.shadowSide = THREE.DoubleSide; // still blocks light from either room
    return copy;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material);
}

/** The doorway's floor, centred. */
export function sill(frameBox) {
  const point = frameBox.getCenter(new THREE.Vector3());
  point.y = frameBox.min.y;
  return point;
}
