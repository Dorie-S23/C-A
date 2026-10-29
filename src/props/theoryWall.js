import * as THREE from 'three';

// Kaufmo's theory wall: weeks of marker scrawled over one wall of his
// room — counts, arrows, a map of where things were, question marks —
// that he keeps adding to while Pomni's around (draw(), fed his marker's
// tip each frame). A transparent canvas on a plane just off the wall,
// so the wallpaper shows through between the lines.
const WIDTH = 3.2;  // metres along the wall
const HEIGHT = 1.5;
const BOTTOM = 0.75; // its bottom edge above the floor
const PIXELS_PER_METRE = 400;
const STANDOFF = 0.012; // off the wall, so it never z-fights it
const INK = '#17161c';
const RED = '#b3161f';
const PEN_WIDTH = 4;
const MAX_PEN_JUMP = 0.06; // metres: a longer step than this between frames is the pen lifting, not a line
const UPLOAD_SECONDS = 1 / 12; // the canvas goes up to the GPU at most this often while he writes
const FONT = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';

// His notes so far, in canvas pixels (0,0 top left). From what he tells
// Pomni: the counting, "five on the left wall, one by the stage", the
// door that wasn't a door, Caine and his pictures, the exit.
const NOTES = [
  { text: 'EXIT ??', x: 120, y: 120, size: 64, color: RED },
  { text: '5 — left wall', x: 90, y: 230, size: 34 },
  { text: '1 — by the stage', x: 90, y: 285, size: 34 },
  { text: 'door ≠ door', x: 420, y: 200, size: 40 },
  { text: 'count AGAIN', x: 470, y: 330, size: 30 },
  { text: 'Caine — pictures??', x: 820, y: 110, size: 38, color: RED },
  { text: 'where does the void end', x: 760, y: 420, size: 30 },
  { text: 'not a set. REAL?', x: 900, y: 250, size: 34 },
  { text: '3 days? 4?', x: 150, y: 470, size: 28 },
  { text: 'OUT', x: 1120, y: 520, size: 70, color: RED },
];

/**
 * @param {{ position: THREE.Vector3, rotationY: number }} spot a point on
 *   the wall at floor level, the wall facing rotationY (see findWallSpot)
 * @returns {{ group: THREE.Group, draw: (tip: THREE.Vector3, down: boolean) => void,
 *   update: (deltaSeconds: number) => void, pin: (urls: string[]) => void, dispose: () => void }}
 */
export function createTheoryWall(spot) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WIDTH * PIXELS_PER_METRE);
  canvas.height = Math.round(HEIGHT * PIXELS_PER_METRE);
  const context = canvas.getContext('2d');
  drawNotes(context);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    map: texture, transparent: true, roughness: 0.6, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), material);
  sheet.name = 'TheoryWall';
  sheet.position.y = BOTTOM + HEIGHT / 2;
  sheet.renderOrder = 1;

  const group = new THREE.Group();
  group.name = 'TheoryWallGroup';
  group.position.copy(spot.position);
  group.rotation.y = spot.rotationY;
  group.add(sheet);
  group.translateZ(STANDOFF);
  group.updateMatrixWorld(true);

  const local = new THREE.Vector3();
  let last = null; // the last point drawn to, in canvas pixels
  let dirty = false;
  let sinceUpload = 0;

  /** Where the marker is: inks a line from the last point while `down`. */
  function draw(tip, down) {
    sheet.worldToLocal(local.copy(tip));
    const x = (local.x / WIDTH + 0.5) * canvas.width;
    const y = (0.5 - local.y / HEIGHT) * canvas.height;
    const inside = x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height;
    if (!down || !inside) { last = null; return; }
    if (last && Math.hypot(x - last.x, y - last.y) <= MAX_PEN_JUMP * PIXELS_PER_METRE) {
      context.strokeStyle = INK;
      context.lineWidth = PEN_WIDTH;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(x, y);
      context.stroke();
      dirty = true;
    }
    last = { x, y };
  }

  function update(deltaSeconds) {
    sinceUpload += deltaSeconds;
    if (dirty && sinceUpload >= UPLOAD_SECONDS) {
      texture.needsUpdate = true;
      dirty = false;
      sinceUpload = 0;
    }
  }

  /** The office photos, pinned up among the notes once he has them. */
  function pin(urls) {
    const loader = new THREE.TextureLoader();
    urls.forEach((url, i) => {
      const map = loader.load(url);
      map.colorSpace = THREE.SRGBColorSpace;
      const photo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.19),
        new THREE.MeshStandardMaterial({ map, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }),
      );
      photo.name = 'TheoryWallPhoto';
      photo.position.set(-1.1 + i * 0.55, BOTTOM + HEIGHT * (i % 2 ? 0.42 : 0.66), 0.004);
      photo.rotation.z = (i % 2 ? 1 : -1) * 0.06 * (1 + (i % 3));
      group.add(photo);
    });
  }

  function dispose() {
    texture.dispose();
    group.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      child.material.map?.dispose();
      child.material.dispose();
    });
  }

  return { group, draw, update, pin, dispose };
}

function drawNotes(context) {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const note of NOTES) {
    context.fillStyle = note.color ?? INK;
    context.font = `${note.size}px ${FONT}`;
    context.save();
    context.translate(note.x, note.y);
    context.rotate(((note.x * 7 + note.y * 3) % 9 - 4) * 0.01); // never quite level
    context.fillText(note.text, 0, 0);
    context.restore();
  }
  context.strokeStyle = INK;
  context.lineWidth = PEN_WIDTH;
  // Circled, and arrows between the ideas.
  ring(context, 205, 100, 150, 62);
  arrow(context, 320, 110, 410, 175);
  arrow(context, 640, 190, 800, 120);
  arrow(context, 640, 320, 880, 240);
  context.strokeStyle = RED;
  arrow(context, 1050, 270, 1150, 470);
  ring(context, 1180, 500, 110, 70);
  context.strokeStyle = INK;
  // A map of the tent: the ring, the stage, crosses where things were.
  context.strokeRect(470, 400, 210, 150);
  context.beginPath();
  context.arc(575, 475, 45, 0, Math.PI * 2);
  context.stroke();
  for (const [x, y] of [[495, 425], [495, 525], [655, 430], [640, 525], [600, 415]]) cross(context, x, y);
  // Tallies.
  for (let group = 0; group < 4; group++) {
    const x0 = 120 + group * 70;
    for (let i = 0; i < 4; i++) line(context, x0 + i * 12, 520, x0 + i * 12 - 3, 570);
    line(context, x0 - 8, 560, x0 + 48, 528);
  }
  // Question marks wherever there was room.
  context.font = `44px ${FONT}`;
  context.fillStyle = INK;
  for (const [x, y] of [[360, 80], [720, 560], [1000, 160], [1240, 120], [60, 400]]) context.fillText('?', x, y);
}

function line(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function arrow(context, x1, y1, x2, y2) {
  line(context, x1, y1, x2, y2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  for (const side of [-1, 1]) {
    line(context, x2, y2, x2 - 22 * Math.cos(angle + side * 0.45), y2 - 22 * Math.sin(angle + side * 0.45));
  }
}

function ring(context, x, y, rx, ry) {
  context.beginPath();
  context.ellipse(x, y, rx, ry, -0.05, 0.2, Math.PI * 2.1);
  context.stroke();
}

function cross(context, x, y) {
  line(context, x - 9, y - 9, x + 9, y + 9);
  line(context, x - 9, y + 9, x + 9, y - 9);
}
