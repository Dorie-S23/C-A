// A lightweight 2D-canvas minimap — not a second 3D camera/render pass,
// just the known door positions (from the room's own portals list) drawn
// as a flat north-up schematic. Cheap enough to redraw every frame.

const SIZE = 180; // px
const PADDING_PX = 16;
const WORLD_PADDING = 2.5; // metres of margin around the furthest point
const DOOR_RADIUS = 5;
const PLAYER_RADIUS = 5;
const FACING_LENGTH = 10;

const ROOM_LABELS = {
  pomni: 'Pomni',
  kaufmo: 'Kaufmo',
  ribbit: 'Ribbit',
  tadc: 'Lobby',
  dorm: 'Dorm Hall',
};

/** @returns {{ show: (portals: Array) => void, hide: () => void, update: (x: number, z: number, yaw: number) => void }} */
export function createMinimap() {
  const canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  canvas.width = SIZE;
  canvas.height = SIZE;
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '1em',
    right: '1em',
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    background: 'rgba(10, 8, 14, 0.75)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '8px',
    zIndex: 5,
    display: 'none',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let points = [];
  let minX = -WORLD_PADDING;
  let maxX = WORLD_PADDING;
  let minZ = -WORLD_PADDING;
  let maxZ = WORLD_PADDING;
  let scale = 1;

  function worldToCanvas(x, z) {
    return {
      x: PADDING_PX + (x - minX) * scale,
      y: PADDING_PX + (z - minZ) * scale,
    };
  }

  return {
    /** @param {Array<{ to: string, box: { min: {x,z}, max: {x,z} } }>} portals */
    show(portals) {
      points = portals.map((portal) => ({
        x: (portal.box.min.x + portal.box.max.x) / 2,
        z: (portal.box.min.z + portal.box.max.z) / 2,
        label: ROOM_LABELS[portal.to] ?? portal.to,
      }));

      minX = Math.min(0, ...points.map((p) => p.x)) - WORLD_PADDING;
      maxX = Math.max(0, ...points.map((p) => p.x)) + WORLD_PADDING;
      minZ = Math.min(0, ...points.map((p) => p.z)) - WORLD_PADDING;
      maxZ = Math.max(0, ...points.map((p) => p.z)) + WORLD_PADDING;
      const drawable = SIZE - PADDING_PX * 2;
      scale = Math.min(drawable / Math.max(maxX - minX, 1e-3), drawable / Math.max(maxZ - minZ, 1e-3));

      canvas.style.display = 'block';
    },

    hide() {
      canvas.style.display = 'none';
    },

    update(playerX, playerZ, playerYaw) {
      if (canvas.style.display === 'none') return;
      ctx.clearRect(0, 0, SIZE, SIZE);

      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      for (const point of points) {
        const { x, y } = worldToCanvas(point.x, point.z);
        ctx.beginPath();
        ctx.arc(x, y, DOOR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd27a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(point.label, x, y - DOOR_RADIUS - 4);
      }

      // Player marker: a dot with a short line showing which way they're facing.
      // Yaw 0 faces -Z (see main.js), matching this canvas's +Z-is-down layout.
      const player = worldToCanvas(playerX, playerZ);
      const dx = -Math.sin(playerYaw);
      const dz = -Math.cos(playerYaw);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + dx * FACING_LENGTH, player.y + dz * FACING_LENGTH);
      ctx.strokeStyle = '#ff5a7a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a7a';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
  };
}
