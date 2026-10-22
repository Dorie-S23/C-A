import * as THREE from 'three';

// A lightweight 2D-canvas minimap — not a second 3D camera/render pass.
// When a room is shown, its floor is traced once from above into an
// offscreen floor plan (every upward-facing triangle near Pomni's floor
// height), and each frame just draws a window of that plan centred on her,
// north-up, with the known doors (from the room's portals and map markers)
// on top. Doors outside the window are pinned to the rim, pointing the way.

const SIZE = 180;              // CSS px; index.html's objective HUD makes room for this
const PX_PER_METRE = 1.7;      // map zoom: the window spans ~105 m
const PLAN_PX_PER_METRE = 6;   // floor plan resolution (it's scaled down to draw)
const PLAN_MAX_PX = 4096;
const FLOOR_BELOW = 0.6;       // metres under the floor height still counted as floor
const FLOOR_ABOVE = 0.45;      // ...and over it (steps, the dorm arch's dais)
const MIN_FLOOR_NORMAL_Y = 0.7;
const RIM_INSET = 14;          // px from the edge for off-map door pins
const PIN_MERGE_PX = 10;       // rim pins closer than this share one pin and label
const DOOR_RADIUS = 5;
const LABEL_HEIGHT = 14;
const LABEL_PAD_X = 4;
const LABEL_GAP = 8;            // px between a marker and its label
const LABEL_FONT = '600 10px system-ui, sans-serif';

const COLORS = {
  background: '#140f1f',
  floor: '#5b3b63',
  floorEdge: '#ffd27a',
  door: '#ffd27a',
  doorRing: '#2a1a35',
  label: '#fff8e9',
  labelBackground: 'rgba(20, 15, 31, 0.82)',
  leader: 'rgba(255, 210, 122, 0.55)',
  player: '#ff5a7a',
  playerEdge: '#fff8e9',
  view: 'rgba(255, 210, 122, 0.16)',
};

const ROOM_LABELS = {
  pomni: 'Pomni',
  kaufmo: 'Kaufmo',
  ribbit: 'Ribbit',
  tadc: 'Lobby',
  dorm: 'Dorm Hall',
};

// Tracing a room's floor walks every triangle, so do it once per room.
const planCache = new WeakMap();

/**
 * Traces the floor of `group` from above into a canvas: every triangle
 * that faces up and sits near `floorY` is filled in, so the plan shows the
 * corridors and rooms as they're actually laid out.
 *
 * @returns {{ canvas: HTMLCanvasElement, minX: number, minZ: number } | null}
 */
function traceFloorPlan(group, floorY) {
  group.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const triangles = []; // flat x,z triples
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  group.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || !mesh.visible) return;
    const position = mesh.geometry?.attributes.position;
    if (!position) return;
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      const y = (a.y + b.y + c.y) / 3;
      if (y < floorY - FLOOR_BELOW || y > floorY + FLOOR_ABOVE) continue;
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const length = normal.length();
      // Either winding: a floor exported double-sided still counts.
      if (length < 1e-9 || Math.abs(normal.y) / length < MIN_FLOOR_NORMAL_Y) continue;
      triangles.push(a.x, a.z, b.x, b.z, c.x, c.z);
      minX = Math.min(minX, a.x, b.x, c.x);
      maxX = Math.max(maxX, a.x, b.x, c.x);
      minZ = Math.min(minZ, a.z, b.z, c.z);
      maxZ = Math.max(maxZ, a.z, b.z, c.z);
    }
  });
  if (triangles.length === 0) return null;

  const pxPerMetre = Math.min(PLAN_PX_PER_METRE, PLAN_MAX_PX / Math.max(maxX - minX, maxZ - minZ));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * pxPerMetre) + 2;
  canvas.height = Math.ceil((maxZ - minZ) * pxPerMetre) + 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.floor;
  // Each triangle on its own path: one big nonzero-filled path would cut
  // holes wherever floor meshes overlap with opposite windings.
  for (let i = 0; i < triangles.length; i += 6) {
    ctx.beginPath();
    ctx.moveTo((triangles[i] - minX) * pxPerMetre + 1, (triangles[i + 1] - minZ) * pxPerMetre + 1);
    ctx.lineTo((triangles[i + 2] - minX) * pxPerMetre + 1, (triangles[i + 3] - minZ) * pxPerMetre + 1);
    ctx.lineTo((triangles[i + 4] - minX) * pxPerMetre + 1, (triangles[i + 5] - minZ) * pxPerMetre + 1);
    ctx.closePath();
    ctx.fill();
    // Hairline cracks between neighbouring triangles otherwise show through.
    ctx.strokeStyle = COLORS.floor;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  return { canvas, minX: minX - 1 / pxPerMetre, minZ: minZ - 1 / pxPerMetre, pxPerMetre };
}

/**
 * @returns {{
 *   show: (portals: Array, room?: { group: THREE.Object3D, floorY: number }) => void,
 *   hide: () => void,
 *   update: (x: number, z: number, yaw: number) => void,
 * }}
 */
export function createMinimap() {
  const canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    borderRadius: '50%',
    border: '2px solid rgba(255, 210, 122, 0.75)',
    boxShadow: '0 5px 20px rgba(0, 0, 0, 0.35), inset 0 0 0 3px rgba(20, 15, 31, 0.9)',
    zIndex: 5,
    pointerEvents: 'none',
    display: 'none',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let pixelRatio = 1;

  let doors = [];
  let plan = null;

  function fitToScreen() {
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    if (ratio === pixelRatio && canvas.width) return;
    pixelRatio = ratio;
    canvas.width = Math.round(SIZE * ratio);
    canvas.height = Math.round(SIZE * ratio);
  }

  function labelWidth(lines) {
    ctx.font = LABEL_FONT;
    return Math.max(...lines.map((line) => ctx.measureText(line).width)) + LABEL_PAD_X * 2;
  }

  /** A pill holding one or more lines, vertically centred on y. */
  function drawLabel(lines, left, y) {
    const height = lines.length * LABEL_HEIGHT;
    const top = y - height / 2;
    ctx.font = LABEL_FONT;
    ctx.fillStyle = COLORS.labelBackground;
    ctx.beginPath();
    ctx.roundRect(left, top, labelWidth(lines), height, LABEL_HEIGHT / 2);
    ctx.fill();
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, left + LABEL_PAD_X, top + (i + 0.5) * LABEL_HEIGHT + 0.5));
  }

  /**
   * Finds a spot for each label beside its marker, stepping up or down
   * past other labels and markers (doors along one corridor line up, and
   * those beyond the map's edge all pin to the same spot on the rim), and
   * pulled in so it fits inside the round frame.
   */
  function layOutLabels(labels, centre, radius) {
    const placed = [];
    const overlaps = (r, q) => r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom;
    const markerBoxes = labels.map(({ x, y }) => ({
      left: x - DOOR_RADIUS - 1, right: x + DOOR_RADIUS + 1, top: y - DOOR_RADIUS - 1, bottom: y + DOOR_RADIUS + 1,
    }));
    // Doors on the map first: they keep their label right beside them, and
    // the rim pins (already pointing the way) make room.
    labels.sort((p, q) => (p.pinned - q.pinned) || (p.y - q.y));
    for (const label of labels) {
      const width = labelWidth(label.lines);
      const height = label.lines.length * LABEL_HEIGHT;
      // On the side facing the map's middle, so it doesn't run off the edge.
      const toRight = label.x < centre;
      let best = null;
      for (let step = 0; step < 16 && !best; step++) {
        const shift = Math.ceil(step / 2) * (step % 2 ? 1 : -1) * (LABEL_HEIGHT / 2 + 1);
        const y = label.y + shift;
        // Widest the frame is across this label's top or bottom edge.
        const edge = Math.max(Math.abs(y - height / 2 - centre), Math.abs(y + height / 2 - centre));
        if (edge > radius - 3) continue;
        const half = Math.sqrt((radius - 3) ** 2 - edge ** 2);
        let left = toRight ? label.x + LABEL_GAP : label.x - LABEL_GAP - width;
        left = Math.min(Math.max(left, centre - half), centre + half - width);
        const box = { left, right: left + width, top: y - height / 2, bottom: y + height / 2 };
        if (placed.some((other) => overlaps(box, other))) continue;
        if (markerBoxes.some((marker) => overlaps(box, marker))) continue;
        best = { box, y, left };
      }
      if (!best) continue; // nowhere free: leave it to its marker alone
      placed.push(best.box);
      // A label moved off its marker gets a thin leader line back to it.
      if (Math.abs(best.y - label.y) > 1) {
        ctx.beginPath();
        ctx.moveTo(label.x, label.y);
        ctx.lineTo(Math.min(Math.max(label.x, best.box.left), best.box.right), best.y);
        ctx.strokeStyle = COLORS.leader;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      drawLabel(label.lines, best.left, best.y);
    }
  }

  return {
    /**
     * @param {Array<{ to: string, box: { min: {x,z}, max: {x,z} } }>} portals
     * @param {{ group: THREE.Object3D, floorY: number }} [room] whose floor to draw
     */
    show(portals, room) {
      const seen = new Set();
      doors = [];
      for (const portal of portals) {
        // A door can be both a portal and a marker; show it once.
        if (seen.has(portal.to)) continue;
        seen.add(portal.to);
        doors.push({
          x: (portal.box.min.x + portal.box.max.x) / 2,
          z: (portal.box.min.z + portal.box.max.z) / 2,
          label: ROOM_LABELS[portal.to] ?? portal.to,
        });
      }

      plan = null;
      if (room?.group) {
        if (!planCache.has(room.group)) planCache.set(room.group, traceFloorPlan(room.group, room.floorY));
        plan = planCache.get(room.group);
      }

      fitToScreen();
      canvas.style.display = 'block';
    },

    hide() {
      canvas.style.display = 'none';
    },

    update(playerX, playerZ, playerYaw) {
      if (canvas.style.display === 'none') return;
      fitToScreen();
      const centre = SIZE / 2;
      const radius = SIZE / 2;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);

      ctx.save();
      ctx.beginPath();
      ctx.arc(centre, centre, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // World → map: Pomni at the centre, -Z (yaw 0, see main.js) up.
      const toMap = (x, z) => ({
        x: centre + (x - playerX) * PX_PER_METRE,
        y: centre + (z - playerZ) * PX_PER_METRE,
      });

      if (plan) {
        const topLeft = toMap(plan.minX, plan.minZ);
        const scale = PX_PER_METRE / plan.pxPerMetre;
        // A thin gold glow round the floor's edge reads as the walls.
        ctx.shadowColor = COLORS.floorEdge;
        ctx.shadowBlur = 3;
        ctx.drawImage(plan.canvas, topLeft.x, topLeft.y, plan.canvas.width * scale, plan.canvas.height * scale);
        ctx.shadowBlur = 0;
      }

      // View cone: which way the camera's looking.
      const facing = Math.atan2(-Math.cos(playerYaw), -Math.sin(playerYaw));
      const cone = Math.PI / 5;
      const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, 46);
      gradient.addColorStop(0, COLORS.view);
      gradient.addColorStop(1, 'rgba(255, 210, 122, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(centre, centre);
      ctx.arc(centre, centre, 46, facing - cone, facing + cone);
      ctx.closePath();
      ctx.fill();

      // Doors: on the map where they are, or pinned to the rim pointing the
      // way when they're further off than the map shows. Doors further along
      // the same corridor pin to the same spot, so they share one pin.
      const rimRadius = radius - RIM_INSET;
      const labels = [];
      for (const door of doors) {
        let { x, y } = toMap(door.x, door.z);
        const dx = x - centre;
        const dy = y - centre;
        const distance = Math.hypot(dx, dy);
        if (distance <= rimRadius) {
          labels.push({ lines: [door.label], x, y, pinned: false });
          continue;
        }
        x = centre + (dx / distance) * rimRadius;
        y = centre + (dy / distance) * rimRadius;
        const metres = Math.round(Math.hypot(door.x - playerX, door.z - playerZ));
        const line = `${door.label} · ${metres} m`;
        const shared = labels.find((other) => other.pinned && Math.hypot(other.x - x, other.y - y) < PIN_MERGE_PX);
        if (shared) {
          shared.lines.push(line);
          shared.order.push(metres);
        } else {
          labels.push({ lines: [line], order: [metres], x, y, pinned: true, angle: Math.atan2(dy, dx) });
        }
      }
      for (const label of labels) {
        if (label.pinned) {
          // Nearest first within a shared pin.
          label.lines = label.lines.map((line, i) => [label.order[i], line]).sort((p, q) => p[0] - q[0]).map(([, line]) => line);
          ctx.save();
          ctx.translate(label.x, label.y);
          ctx.rotate(label.angle);
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-3, -5);
          ctx.lineTo(-3, 5);
          ctx.closePath();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(label.x, label.y, DOOR_RADIUS, 0, Math.PI * 2);
        }
        ctx.fillStyle = COLORS.door;
        ctx.strokeStyle = COLORS.doorRing;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fill();
      }

      layOutLabels(labels, centre, radius);

      // Pomni: an arrowhead pointing the way the camera faces.
      ctx.save();
      ctx.translate(centre, centre);
      ctx.rotate(facing + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fillStyle = COLORS.player;
      ctx.fill();
      ctx.strokeStyle = COLORS.playerEdge;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    },
  };
}
