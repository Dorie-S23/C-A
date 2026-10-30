import * as THREE from 'three';

/**
 * Height maps: a greyscale image where brightness is height (black = the
 * lowest point, white = the highest). One image does three jobs here:
 *
 *   displacementMap  moves each vertex out along its normal by its height,
 *                    so the surface really is lumpy (silhouette, parallax).
 *                    Only vertices move, so the mesh is subdivided first:
 *                    a 4-corner rug would just rise or sink as a whole.
 *   bumpMap          tilts the lighting normal per pixel by the image's
 *                    slope, so detail finer than the vertex grid still
 *                    catches the light. (displacementMap alone keeps the
 *                    original flat normals, and would light as flat.)
 *   aoMap            darkens the low parts, the crevices light can't reach.
 *
 * The rugs use it for a fluffy pile: soft round tufts, with fibres on top.
 */

const PILE_SIZE = 512;        // texture pixels per tile
const PILE_TILE_METRES = 0.5; // one tile covers half a metre of rug
const GRID_SPACING = 0.025;   // metres between vertices after subdividing
const MAX_TRIANGLES = 160000; // per rug, however big it is

let pileTexture = null;

/** Seeded so every rug, and every load, gets the same pile. */
function seededRandom(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * Draws `paint(x, y)` at (x, y) and at its copies across the tile's
 * edges, so a shape hanging off one side carries on at the other and the
 * texture tiles seamlessly.
 */
function wrapped(x, y, reach, paint) {
  for (const dx of [-PILE_SIZE, 0, PILE_SIZE]) {
    for (const dy of [-PILE_SIZE, 0, PILE_SIZE]) {
      const px = x + dx, py = y + dy;
      if (px + reach < 0 || px - reach > PILE_SIZE || py + reach < 0 || py - reach > PILE_SIZE) continue;
      paint(px, py);
    }
  }
}

/** The pile's height map: overlapping domed tufts, then short fibres over them. */
function createPileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PILE_SIZE;
  const context = canvas.getContext('2d');
  context.fillStyle = '#1a1a1a';
  context.fillRect(0, 0, PILE_SIZE, PILE_SIZE);
  const random = seededRandom(90210);

  // 'lighten' keeps the taller of two overlapping tufts, rather than
  // adding them into a plateau.
  context.globalCompositeOperation = 'lighten';
  for (let i = 0; i < 420; i++) {
    const x = random() * PILE_SIZE, y = random() * PILE_SIZE;
    const radius = 14 + random() * 22;
    const peak = 150 + random() * 105 | 0;
    wrapped(x, y, radius, (px, py) => {
      const dome = context.createRadialGradient(px, py, 0, px, py, radius);
      dome.addColorStop(0, `rgb(${peak},${peak},${peak})`);
      dome.addColorStop(0.55, `rgb(${peak * 0.7 | 0},${peak * 0.7 | 0},${peak * 0.7 | 0})`);
      dome.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = dome;
      context.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    });
  }

  // Fibres: thin strokes, light or dark, that the bump map turns into a
  // fine nap and the displacement mostly ignores (too small for the grid).
  context.globalCompositeOperation = 'source-over';
  context.lineCap = 'round';
  for (let i = 0; i < 5000; i++) {
    const x = random() * PILE_SIZE, y = random() * PILE_SIZE;
    const angle = random() * Math.PI * 2, length = 3 + random() * 7;
    const shade = random() < 0.5 ? 255 : 0;
    context.strokeStyle = `rgba(${shade},${shade},${shade},${0.08 + random() * 0.12})`;
    context.lineWidth = 0.8 + random();
    wrapped(x, y, length, (px, py) => {
      context.beginPath();
      context.moveTo(px, py);
      context.lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length);
      context.stroke();
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace; // data, not colour
  texture.anisotropy = 8;
  return texture;
}

/**
 * Splits every triangle into n×n smaller ones (n per triangle from its
 * longest edge, `spacing` apart), interpolating every attribute. Points
 * along an edge two triangles share come out identical from both, so the
 * displaced surface has no cracks.
 */
function subdivide(geometry, spacing, worldScale) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.attributes.position;
  const triangles = position.count / 3;
  const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const sizes = [];
  let total = 0;
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) corner[k].fromBufferAttribute(position, t * 3 + k);
    const longest = Math.max(corner[0].distanceTo(corner[1]), corner[1].distanceTo(corner[2]), corner[2].distanceTo(corner[0]));
    sizes.push(Math.max(1, Math.ceil((longest * worldScale) / spacing)));
    total += sizes[t] ** 2;
  }
  // Too big for the budget: coarsen every triangle by the same factor.
  const shrink = Math.min(1, Math.sqrt(MAX_TRIANGLES / total));
  const steps = sizes.map((n) => Math.max(1, Math.floor(n * shrink)));

  const names = Object.keys(source.attributes);
  const data = Object.fromEntries(names.map((name) => [name, []]));
  const indices = [];
  let base = 0;
  for (let t = 0; t < triangles; t++) {
    const n = steps[t];
    const row = (i) => base + (i * (2 * n + 3 - i)) / 2; // first vertex of row i
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const wb = i / n, wc = j / n, wa = 1 - wb - wc;
        for (const name of names) {
          const attribute = source.attributes[name];
          for (let c = 0; c < attribute.itemSize; c++) {
            data[name].push(wa * attribute.getComponent(t * 3, c)
              + wb * attribute.getComponent(t * 3 + 1, c)
              + wc * attribute.getComponent(t * 3 + 2, c));
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        const a = row(i) + j, b = row(i + 1) + j;
        indices.push(a, b, a + 1);
        if (j < n - i - 1) indices.push(a + 1, b, b + 1);
      }
    }
    base += ((n + 1) * (n + 2)) / 2;
  }

  const result = new THREE.BufferGeometry();
  for (const name of names) {
    const attribute = source.attributes[name];
    result.setAttribute(name, new THREE.Float32BufferAttribute(data[name], attribute.itemSize, attribute.normalized));
  }
  result.setIndex(indices);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** True when every normal points the same way: a flat sheet, safe to displace. */
export function isFlatSheet(geometry) {
  const normal = geometry.attributes.normal;
  if (!normal || normal.count < 3) return false;
  const first = new THREE.Vector3().fromBufferAttribute(normal, 0);
  const other = new THREE.Vector3();
  for (let i = 1; i < normal.count; i++) {
    if (other.fromBufferAttribute(normal, i).dot(first) < 0.98) return false;
  }
  return true;
}

/** How big the mesh is in the world: per local unit along its normal, and across it. */
function sheetScales(mesh) {
  const normal = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 0);
  const normalScale = normal.applyMatrix3(new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld)).length();
  const worldScale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  return { normalScale, sheetScale: Math.max(worldScale.x, worldScale.y, worldScale.z) };
}

/**
 * Raises a flat mesh by `heightMap`, up to `height` metres where it's white:
 * subdivided `spacing` metres apart, displaced, and lit by the same map as
 * a bump map. Raycasts (the floor follow, interaction) still hit the
 * original flat sheet, so the dense copy costs nothing to walk on or aim at.
 */
function displaceSheet(mesh, heightMap, { height, spacing, bumpScale, material: extra = {} }) {
  const { normalScale, sheetScale } = sheetScales(mesh);
  const flat = mesh.geometry;
  const material = mesh.material.clone();
  material.displacementMap = heightMap;
  material.displacementScale = height / normalScale;
  // Only ever out: rugs lie right on top of other rugs and floors, and
  // paintings against walls; anything sunk below the sheet would poke
  // through whatever is behind it.
  material.displacementBias = 0;
  material.bumpMap = heightMap;
  material.bumpScale = bumpScale;
  Object.assign(material, extra);
  material.needsUpdate = true;
  mesh.material = material;

  const proxy = new THREE.Mesh(flat, material);
  const hits = [];
  mesh.raycast = (raycaster, intersects) => {
    proxy.matrixWorld.copy(mesh.matrixWorld);
    hits.length = 0;
    THREE.Mesh.prototype.raycast.call(proxy, raycaster, hits);
    for (const hit of hits) { hit.object = mesh; intersects.push(hit); }
  };
  mesh.geometry = subdivide(flat, spacing, sheetScale);
}

/**
 * Gives a flat rug a fluffy pile `height` metres deep, from the pile height
 * map, its tufts the same size on every rug. The mesh's matrixWorld must be
 * current. Does nothing outside a browser, where there's no canvas to draw on.
 */
export function makeFluffy(mesh, { height = 0.025 } = {}) {
  if (typeof document === 'undefined' || !isFlatSheet(mesh.geometry) || !mesh.geometry.attributes.uv) return false;
  pileTexture ??= createPileTexture();

  // How many tiles fit across the rug: its UV range, in metres.
  const { sheetScale } = sheetScales(mesh);
  const flat = mesh.geometry;
  flat.computeBoundingBox();
  const size = flat.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(sheetScale);
  const [across, along] = [size.x, size.y, size.z].sort((a, b) => b - a);
  const uv = flat.attributes.uv;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i));
  }
  const spanU = Math.max(maxU - minU, 1e-3), spanV = Math.max(maxV - minV, 1e-3);
  const pile = pileTexture.clone();
  // The longer UV direction runs along the rug's longer side.
  const [longSpan, shortSpan] = spanU >= spanV ? [spanU, spanV] : [spanV, spanU];
  const tilesLong = across / PILE_TILE_METRES / longSpan, tilesShort = along / PILE_TILE_METRES / shortSpan;
  pile.repeat.set(spanU >= spanV ? tilesLong : tilesShort, spanU >= spanV ? tilesShort : tilesLong);
  pile.needsUpdate = true;

  displaceSheet(mesh, pile, {
    height, spacing: GRID_SPACING, bumpScale: 4,
    // The low gaps between tufts are where light can't reach.
    material: { aoMap: pile, aoMapIntensity: 0.65, roughness: 1, metalness: 0 },
  });
  return true;
}

// --- Bulging eyes in paintings ---------------------------------------------

// Paintings (by their photo's name in the .glb) with googly eyes to push out,
// and each eye's circle: its centre and radius as fractions of the photo's
// width and height, from the top left. Measured off the photos, shaded rim
// included, so the whole eyeball comes out rather than only its bright part.
const EYED_PAINTINGS = {
  'Photo 14': [
    { x: 227 / 540, y: 305 / 750, radius: 104 / 540 },
    { x: 411 / 540, y: 343 / 750, radius: 105 / 540 },
  ],
  'Photo 4': [
    { x: 223 / 540, y: 360 / 750, radius: 64 / 540 },
    { x: 316 / 540, y: 362 / 750, radius: 64 / 540 },
  ],
};
const EYE_MAP_SIZE = 512;
const EYE_GRID_SPACING = 0.012; // eyes are small: a finer grid than the rugs
// How far an eye stands out, against its radius: most of a half ball.
const EYE_DEPTH = 0.75;
const eyeMaps = new Map(); // photo image -> its height and gloss maps, worked out once

/**
 * Height and gloss maps of a painting's `eyes`: each a dome, highest at its
 * middle and falling away in a circle's curve to its rim, the bigger eyes
 * standing further out (white is the biggest). The photo's aspect is
 * `aspect` (width / height), so the circles stay round on it.
 */
function createEyeMaps(eyes, aspect) {
  const size = EYE_MAP_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(size, size);
  const rgba = pixels.data;
  const biggest = Math.max(...eyes.map((eye) => eye.radius));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size, v = (py + 0.5) / size;
      // Where eyes overlap, the one standing further out shows.
      let height = 0;
      for (const eye of eyes) {
        const dx = (u - eye.x) / eye.radius, dy = (v - eye.y) / aspect / eye.radius;
        const r2 = dx * dx + dy * dy;
        if (r2 < 1) height = Math.max(height, Math.sqrt(1 - r2) * eye.radius / biggest);
      }
      const i = (py * size + px) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = height * 255;
      rgba[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);

  // Gloss: a roughness map, white (the painting's own roughness) everywhere
  // but the eyes, which go glossy towards their tops like googly-eye plastic.
  const glossCanvas = document.createElement('canvas');
  glossCanvas.width = glossCanvas.height = size;
  const gloss = glossCanvas.getContext('2d');
  gloss.fillStyle = '#fff';
  gloss.fillRect(0, 0, size, size);
  gloss.globalCompositeOperation = 'difference';
  gloss.globalAlpha = 0.85;
  gloss.drawImage(canvas, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace; // data, not colour
  const glossTexture = new THREE.CanvasTexture(glossCanvas);
  glossTexture.colorSpace = THREE.NoColorSpace;
  return { height: texture, gloss: glossTexture };
}

/** A copy of `texture` laid on the mesh exactly as the photo `map` is. */
function laidLike(texture, map) {
  const copy = texture.clone();
  for (const key of ['flipY', 'wrapS', 'wrapT', 'channel', 'rotation', 'matrixAutoUpdate']) copy[key] = map[key];
  copy.offset.copy(map.offset); copy.repeat.copy(map.repeat); copy.center.copy(map.center);
  copy.matrix.copy(map.matrix);
  copy.needsUpdate = true;
  return copy;
}

/**
 * Pushes a flat painting's `eyes` (see EYED_PAINTINGS) out of the canvas as
 * whole eyeballs, the biggest standing `depth` × its radius proud.
 */
export function bulgeEyes(mesh, eyes, { depth = EYE_DEPTH } = {}) {
  const map = mesh.material?.map;
  if (typeof document === 'undefined' || !map?.image || !isFlatSheet(mesh.geometry) || !mesh.geometry.attributes.uv) return false;
  const aspect = map.image.width / map.image.height;
  if (!eyeMaps.has(map.image)) eyeMaps.set(map.image, createEyeMaps(eyes, aspect));
  const maps = eyeMaps.get(map.image);
  // The photo spans the painting's width: its widest flat side, in metres.
  const { sheetScale } = sheetScales(mesh);
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(sheetScale);
  const [long, short] = [size.x, size.y, size.z].sort((a, b) => b - a);
  const width = aspect < 1 ? short : long;
  const height = depth * Math.max(...eyes.map((eye) => eye.radius)) * width;
  displaceSheet(mesh, laidLike(maps.height, map), {
    height, spacing: EYE_GRID_SPACING, bumpScale: 4,
    material: { roughnessMap: laidLike(maps.gloss, map) },
  });
  return true;
}

/** Bulges the eyes of every googly-eyed painting (EYED_PAINTINGS) in a loaded room. */
export function bulgePaintingEyes(root, options) {
  const paintings = [];
  root.traverse((object) => {
    if (object.isMesh && EYED_PAINTINGS[object.material?.map?.name]) paintings.push(object);
  });
  return paintings.filter((painting) => bulgeEyes(painting, EYED_PAINTINGS[painting.material.map.name], options)).length;
}

/**
 * Fluffs every rug in a loaded room: flat meshes named like a rug (or
 * inside a node that is), apart from their cloth edging.
 */
export function fluffRugs(root, options) {
  const rugs = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const named = /rug/i.test(object.name) || /rug/i.test(object.parent?.name ?? '');
    // The edging is a plain "Cloth" material; Ribbit's top is "Textured Cloth".
    if (named && !/^cloth(\.\d+)?$/i.test(object.material?.name ?? '')) rugs.push(object);
  });
  return rugs.filter((rug) => makeFluffy(rug, options)).length;
}
