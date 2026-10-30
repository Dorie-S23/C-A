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

// Paintings (by their photo's name in the .glb) with googly eyes to push out.
const EYED_PAINTINGS = ['Photo 14', 'Photo 4'];
const EYE_MAP_SIZE = 512;
const EYE_GRID_SPACING = 0.012; // eyes are small: a finer grid than the rugs
const eyeMaps = new Map(); // photo image -> its height map, worked out once

/** Labels the 4-connected blobs of a size×size `mask`; returns [labels, blob areas]. */
function labelBlobs(mask, size) {
  const count = size * size;
  const labels = new Int32Array(count).fill(-1), areas = [], stack = [];
  for (let start = 0; start < count; start++) {
    if (!mask[start] || labels[start] >= 0) continue;
    const id = areas.length;
    let area = 0;
    labels[start] = id; stack.push(start);
    while (stack.length) {
      const i = stack.pop(); area++;
      const x = i % size, y = (i / size) | 0;
      const near = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1, y < size - 1 ? i + size : -1];
      for (const j of near) if (j >= 0 && mask[j] && labels[j] < 0) { labels[j] = id; stack.push(j); }
    }
    areas.push(area);
  }
  return [labels, areas];
}

/** Each set pixel's distance in from the mask's edge, in pixels (two-pass chamfer). */
function distanceInside(mask, size) {
  const d = new Float32Array(size * size);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  const pass = (y, x, dx, dy) => {
    const i = y * size + x;
    if (!d[i]) return;
    const step = (nx, ny, cost) => {
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) d[i] = Math.min(d[i], d[ny * size + nx] + cost);
    };
    step(x - dx, y, 1); step(x, y - dy, 1);
    step(x - dx, y - dy, Math.SQRT2); step(x + dx, y - dy, Math.SQRT2);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) pass(y, x, 1, 1);
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) pass(y, x, -1, -1);
  return d;
}

/**
 * A height map of a photo's eyes, worked out from the photo itself: its eye
 * whites (bright, colourless pixels, in blobs too big to be glints), with
 * the pupils they surround filled in, each domed like an eyeball: highest
 * at its middle, falling away in a circle's curve to its rim.
 */
function createEyeHeightMap(image) {
  const size = EYE_MAP_SIZE, count = size * size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size);
  const rgba = pixels.data;

  // 1. Eye whites.
  const eye = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    eye[i] = max > 200 && (max - min) / max < 0.18 ? 1 : 0;
  }
  // 2. Glints and specks are far smaller than an eye.
  const [whiteLabels, whiteAreas] = labelBlobs(eye, size);
  for (let i = 0; i < count; i++) if (eye[i] && whiteAreas[whiteLabels[i]] < count * 0.002) eye[i] = 0;
  // 3. Pupils: whatever the white closes all the way round (a blob of
  //    not-eye that never reaches the picture's edge).
  const [holeLabels, holeAreas] = labelBlobs(eye.map((v) => 1 - v), size);
  const reachesEdge = new Uint8Array(holeAreas.length);
  for (let k = 0; k < size; k++) {
    for (const i of [k, count - size + k, k * size, k * size + size - 1]) {
      if (holeLabels[i] >= 0) reachesEdge[holeLabels[i]] = 1;
    }
  }
  for (let i = 0; i < count; i++) {
    const hole = holeLabels[i];
    if (hole >= 0 && !reachesEdge[hole] && holeAreas[hole] < count * 0.05) eye[i] = 1;
  }
  // 4. Domes: sqrt(1 - (1 - d/R)^2) across each eye, d in from its rim and
  //    R its deepest point.
  const distance = distanceInside(eye, size);
  const [eyeLabels, eyeAreas] = labelBlobs(eye, size);
  const radius = new Float32Array(eyeAreas.length);
  for (let i = 0; i < count; i++) if (eye[i]) radius[eyeLabels[i]] = Math.max(radius[eyeLabels[i]], distance[i]);
  for (let i = 0; i < count; i++) {
    const v = eye[i] ? Math.sqrt(Math.max(0, 1 - (1 - distance[i] / radius[eyeLabels[i]]) ** 2)) * 255 : 0;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  // A touch of blur rounds off the pixel steps at each rim.
  context.filter = 'blur(3px)';
  context.drawImage(canvas, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace; // data, not colour
  return texture;
}

/** Pushes a flat painting's eyes `height` metres out of the canvas. */
export function bulgeEyes(mesh, { height = 0.06 } = {}) {
  const map = mesh.material?.map;
  if (typeof document === 'undefined' || !map?.image || !isFlatSheet(mesh.geometry) || !mesh.geometry.attributes.uv) return false;
  if (!eyeMaps.has(map.image)) eyeMaps.set(map.image, createEyeHeightMap(map.image));
  const heightMap = eyeMaps.get(map.image).clone();
  // Laid on the mesh exactly as the photo is.
  for (const key of ['flipY', 'wrapS', 'wrapT', 'channel', 'rotation', 'matrixAutoUpdate']) heightMap[key] = map[key];
  heightMap.offset.copy(map.offset); heightMap.repeat.copy(map.repeat); heightMap.center.copy(map.center);
  heightMap.matrix.copy(map.matrix);
  heightMap.needsUpdate = true;
  displaceSheet(mesh, heightMap, { height, spacing: EYE_GRID_SPACING, bumpScale: 2 });
  return true;
}

/** Bulges the eyes of every googly-eyed painting (EYED_PAINTINGS) in a loaded room. */
export function bulgePaintingEyes(root, options) {
  const paintings = [];
  root.traverse((object) => {
    if (object.isMesh && EYED_PAINTINGS.includes(object.material?.map?.name)) paintings.push(object);
  });
  return paintings.filter((painting) => bulgeEyes(painting, options)).length;
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
