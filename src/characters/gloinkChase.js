import * as THREE from 'three';
import { findMazePath } from '../maze/mazePlacements.js';

// How a maze Gloink notices and follows Pomni. Tuned against her speeds in
// main.js (walk 4.2 m/s, sprint 8.4): even chasing, a Gloink is slower than
// her walk, so getting out of its sight is always possible.
const SIGHT_RANGE = 14;          // metres it can spot her from (about 3 maze cells)
const KEEP_SIGHT_RANGE = 20;     // once chasing, it keeps her in sight this far
const VIEW_HALF_ANGLE = THREE.MathUtils.degToRad(70); // spotting cone either side of where it faces
const EYE_HEIGHT = 1.0;
const SEARCH_SECONDS = 1.5;      // how long it looks round where it lost her
const ARRIVE_DISTANCE = 0.15;

/**
 * Patrol-and-chase for one maze Gloink. It walks its patrol stretch back
 * and forth (or, with `circuit`, round and round a closed ring of cells
 * whose last cell neighbours its first) until it spots her: close enough, roughly ahead of it, and no
 * wall between them. Then it follows her through the corridors (the maze's
 * own cell graph, so it never cuts through a wall) for as long as it can
 * still see her. When it loses sight it goes to where she was last seen,
 * looks around, and goes back to its patrol.
 *
 * Only moves the group; the Gloink's own update() turns and waddles it
 * from that movement.
 *
 * @param {{
 *   mesh: THREE.Object3D, patrol: THREE.Vector3[], circuit?: boolean, speed: number, chaseSpeed: number,
 *   maze: object, cellCenter: (r: number, c: number) => THREE.Vector3,
 *   cellOf: (position: {x: number, z: number}) => object | null, walls: THREE.Box3[],
 * }} options
 */
export function createGloinkChase({ mesh, patrol, circuit = false, speed, chaseSpeed, maze, cellCenter, cellOf, walls }) {
  let state = 'patrol'; // 'patrol' | 'chase' | 'search' | 'return'
  let patrolIndex = 1;
  let patrolDirection = 1;
  const lastSeen = new THREE.Vector3();
  let searchLeft = 0;

  const ray = new THREE.Ray();
  const eye = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();
  const hit = new THREE.Vector3();

  /** Whether a straight line from its eyes to her crosses no wall. */
  function clearLine(player, distance) {
    eye.set(mesh.position.x, EYE_HEIGHT, mesh.position.z);
    toPlayer.set(player.x - eye.x, 0, player.z - eye.z).normalize();
    ray.set(eye, toPlayer);
    return !walls.some((box) => ray.intersectBox(box, hit) && hit.distanceTo(eye) < distance);
  }

  function sees(player, { needsToFace }) {
    const dx = player.x - mesh.position.x;
    const dz = player.z - mesh.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > (needsToFace ? SIGHT_RANGE : KEEP_SIGHT_RANGE)) return false;
    if (needsToFace && distance > 1) {
      const facing = mesh.rotation.y; // its model faces +Z, turned by yaw
      const angle = Math.atan2(dx, dz) - facing;
      if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > VIEW_HALF_ANGLE) return false;
    }
    return clearLine(player, distance);
  }

  /** Moves straight toward a point; true on arrival. */
  function stepTo(target, rate, dt) {
    const dx = target.x - mesh.position.x;
    const dz = target.z - mesh.position.z;
    const distance = Math.hypot(dx, dz);
    const step = rate * dt;
    if (distance <= Math.max(step, ARRIVE_DISTANCE)) {
      mesh.position.x = target.x;
      mesh.position.z = target.z;
      return true;
    }
    mesh.position.x += (dx / distance) * step;
    mesh.position.z += (dz / distance) * step;
    return false;
  }

  /**
   * Heads for a point through the corridors: to the next cell's centre on
   * the way, or straight at it once in the same or the neighbouring cell.
   * True on arrival.
   */
  function walkTowards(target, rate, dt) {
    const from = cellOf(mesh.position);
    const to = cellOf(target);
    const path = from && to ? findMazePath(maze, from, to) : null;
    if (!path || path.length <= 2) return stepTo(target, rate, dt);
    const next = cellCenter(path[1].r, path[1].c);
    stepTo(next, rate, dt);
    return false;
  }

  function nearestPatrolIndex() {
    let best = 0;
    patrol.forEach((point, i) => {
      if (point.distanceTo(mesh.position) < patrol[best].distanceTo(mesh.position)) best = i;
    });
    return best;
  }

  function stepPatrol(dt) {
    if (!stepTo(patrol[patrolIndex], speed, dt)) return;
    if (circuit) { patrolIndex = (patrolIndex + 1) % patrol.length; return; }
    patrolIndex += patrolDirection;
    if (patrolIndex >= patrol.length) { patrolIndex = patrol.length - 2; patrolDirection = -1; }
    else if (patrolIndex < 0) { patrolIndex = 1; patrolDirection = 1; }
  }

  return {
    get state() { return state; },

    /**
     * @param {number} dt seconds
     * @param {{x: number, z: number} | null} player her position, or null
     *   while she isn't in play (menus, dialogue): it then can't see her.
     */
    update(dt, player) {
      if (player && sees(player, { needsToFace: state !== 'chase' })) {
        state = 'chase';
        lastSeen.set(player.x, 0, player.z);
      } else if (state === 'chase') {
        state = 'search'; // lost her: go to where she was last seen
      }

      if (state === 'chase') {
        walkTowards(lastSeen, chaseSpeed, dt);
      } else if (state === 'search') {
        if (walkTowards(lastSeen, chaseSpeed, dt)) {
          state = 'return';
          searchLeft = SEARCH_SECONDS;
          patrolIndex = nearestPatrolIndex();
        }
      } else if (state === 'return') {
        if (searchLeft > 0) {
          // Looking round where it lost her: a slow turn on the spot.
          searchLeft -= dt;
          mesh.rotation.y += dt * 2.2;
          return;
        }
        if (walkTowards(patrol[patrolIndex], speed, dt)) state = 'patrol';
      } else {
        stepPatrol(dt);
      }
    },
  };
}
