import * as THREE from 'three';

// The maze's two hidden keepsakes (see src/state/mazeItems.js). Simple
// procedural props, same house style as the maze's own exit/hazard
// markers — no modeled asset exists for either, and the maze is dark
// enough that a plain unlit shape would be nearly invisible, so both glow
// gently like Level 2's photos (see officePicture.js's own pulseGlow,
// which this mirrors rather than imports — tied to a different
// userData.glow convention isn't worth sharing across two different prop
// shapes for two lines of code).
const GLOW_COLOR = 0xfff2c0;
const GLOW_PULSE_HZ = 0.6;
const GLOW_EMISSIVE_BASE = 0.4;
const GLOW_EMISSIVE_SWING = 0.5;
// Metres from a keepsake that "close enough to pick up" means. Pickup also
// needs the crosshair on the prop itself (aimOnly), so she has to walk up
// to it and look at it rather than just pass the pocket.
const PICKUP_RADIUS = 1.6;

function glowMaterial(color, { roughness = 0.5, metalness = 0.1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness, metalness,
    emissive: new THREE.Color(GLOW_COLOR), emissiveIntensity: GLOW_EMISSIVE_BASE,
  });
}

const BALL_VERTEX_SHADER = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vPosition = position / 0.34;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -viewPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const BALL_FRAGMENT_SHADER = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  uniform float uGlow;
  // three.js prepends tonemapping_pars/colorspace_pars to every
  // ShaderMaterial; including them again redefines them and fails to compile.
  float hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash3(i);
    float b = hash3(i + vec3(1.0, 0.0, 0.0));
    float c = hash3(i + vec3(0.0, 1.0, 0.0));
    float d = hash3(i + vec3(1.0, 1.0, 0.0));
    float e = hash3(i + vec3(0.0, 0.0, 1.0));
    float f1 = hash3(i + vec3(1.0, 0.0, 1.0));
    float g = hash3(i + vec3(0.0, 1.0, 1.0));
    float h = hash3(i + vec3(1.0, 1.0, 1.0));
    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
               mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise3(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }
  void main() {
    vec3 p = vPosition * 3.2;
    vec3 warp = vec3(
      fbm(p + vec3(5.2, 1.3, 2.7)),
      fbm(p + vec3(1.7, 8.1, 3.4)),
      fbm(p + vec3(4.3, 2.8, 9.2))
    );
    float clouds = fbm(p + (warp - 0.5) * 3.0);
    float ribbon = sin(p.x * 1.7 + p.y * 2.4 + p.z * 1.3 + clouds * 12.0) * 0.055;
    float pattern = clouds + ribbon;
    float whiteMarble = smoothstep(0.36, 0.60, pattern);
    vec3 blue = vec3(0.015, 0.50, 0.92);
    vec3 ivory = vec3(0.88, 0.97, 1.0);
    vec3 color = mix(blue, ivory, whiteMarble);

    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(vec3(-0.35, 0.72, 0.62));
    vec3 viewDir = normalize(vViewPosition);
    float diffuse = max(dot(normal, lightDir), 0.0);
    float specular = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 72.0);
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    color *= 0.62 + diffuse * 0.55;
    color += vec3(0.55, 0.82, 1.0) * (specular * 0.48 + rim * 0.11);
    color += vec3(0.015, 0.07, 0.13) * uGlow;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createBowlingHole(normal, radius) {
  const group = new THREE.Group();
  const direction = normal.clone().normalize();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  group.position.copy(direction).multiplyScalar(radius + 0.001);
  const holeRadius = radius * 0.105;
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(holeRadius, 32),
    new THREE.MeshStandardMaterial({ color: 0x06164e, roughness: 0.92, metalness: 0.02 }),
  );
  group.add(hole);
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(holeRadius * 0.96, radius * 0.012, 6, 32),
    new THREE.MeshStandardMaterial({ color: 0x0c3c92, roughness: 0.45, metalness: 0.12 }),
  );
  lip.position.z = 0.001;
  group.add(lip);
  return group;
}

/** A glossy cloud-blue bowling ball with three visible finger holes. */
export function createBowlingBall() {
  const group = new THREE.Group();
  group.name = 'MazeFindable';
  const radius = 0.34;
  const material = new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: GLOW_EMISSIVE_BASE } },
    vertexShader: BALL_VERTEX_SHADER,
    fragmentShader: BALL_FRAGMENT_SHADER,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), material);
  ball.position.y = radius;
  ball.castShadow = true;
  ball.receiveShadow = true;
  group.add(ball);
  for (const normal of [
    new THREE.Vector3(-0.29, 0.32, 0.90),
    new THREE.Vector3(0.29, 0.32, 0.90),
    new THREE.Vector3(0, 0.76, 0.65),
  ]) {
    const hole = createBowlingHole(normal, radius);
    hole.position.y += radius;
    group.add(hole);
  }
  group.userData.glow = { material };
  return group;
}

// The mug's outer silhouette (radius, height), bottom to lip: a small foot
// under a round, bellied bowl that tucks back in at the mouth.
const MUG_PROFILE = [
  [0.001, 0], [0.105, 0], [0.118, 0.012], [0.15, 0.03], [0.2, 0.075],
  [0.236, 0.14], [0.25, 0.215], [0.244, 0.285], [0.226, 0.345], [0.206, 0.39], [0.2, 0.405],
].map(([x, y]) => new THREE.Vector2(x, y));
const MUG_OUTLINE = new THREE.SplineCurve(MUG_PROFILE).getPoints(60);

/** The outer radius of the mug at height `y`, read off its smoothed outline. */
function mugRadiusAt(y) {
  for (let i = 1; i < MUG_OUTLINE.length; i++) {
    const a = MUG_OUTLINE[i - 1], b = MUG_OUTLINE[i];
    if (y <= b.y) return THREE.MathUtils.lerp(a.x, b.x, (y - a.y) / Math.max(b.y - a.y, 1e-6));
  }
  return MUG_OUTLINE.at(-1).x;
}

/** A strip of the mug's own surface from y0 to y1, lifted off it by `lift`, for decals that hug the belly. */
function mugShell(y0, y1, lift, phiStart, phiLength, rows = 24) {
  const points = [];
  for (let i = 0; i <= rows; i++) {
    const y = THREE.MathUtils.lerp(y0, y1, i / rows);
    points.push(new THREE.Vector2(mugRadiusAt(y) + lift, y));
  }
  return new THREE.LatheGeometry(points, 48, phiStart, phiLength);
}

function goldGradient(context, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#ffd27a');
  gradient.addColorStop(0.45, '#e0892c');
  gradient.addColorStop(0.6, '#ffc35c');
  gradient.addColorStop(1, '#b85a17');
  return gradient;
}

/** Gold brush-script "Café Cirque", the two words stepping down to the right. */
function createMugLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const context = canvas.getContext('2d');
  context.fillStyle = context.strokeStyle = goldGradient(context, canvas.height);
  context.lineWidth = 9;
  context.lineJoin = 'round';
  context.textBaseline = 'alphabetic';
  context.font = 'italic 250px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
  context.save();
  context.translate(512, 288);
  context.rotate(-0.14);
  context.textAlign = 'center';
  for (const [word, x, y] of [['Café', -110, -20], ['Cirque', 50, 230]]) {
    context.strokeText(word, x, y);
    context.fillText(word, x, y);
  }
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The little gold Eiffel Tower on the back of the mug. */
function createTowerDecal() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = goldGradient(context, canvas.height);
  context.beginPath();
  context.moveTo(128, 20);
  context.lineTo(140, 150); context.lineTo(158, 280); context.lineTo(200, 480);
  context.lineTo(160, 480); context.quadraticCurveTo(128, 380, 96, 480);
  context.lineTo(56, 480); context.lineTo(98, 280); context.lineTo(116, 150);
  context.closePath();
  context.fill();
  context.fillRect(88, 270, 80, 14); // the two viewing decks
  context.fillRect(106, 150, 44, 10);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Cocoa powder dusted over the cream: a scatter of small brown flecks. */
function createCocoaDust() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 256, 256);
  let seed = 4127;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 900; i++) {
    context.fillStyle = `rgba(${90 + random() * 40 | 0}, ${45 + random() * 20 | 0}, 25, ${0.25 + random() * 0.5})`;
    context.beginPath();
    context.arc(random() * 256, random() * 256, 0.6 + random() * 1.6, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A thick piped swirl: one fat tube spiralling in and up, its coils overlapping into soft-serve ridges. */
function createWhippedCream() {
  const points = [];
  for (let index = 0; index <= 96; index++) {
    const t = index / 96;
    const angle = t * Math.PI * 2 * 3.2;
    const radius = 0.128 * (1 - t) ** 0.9 + 0.004;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.43 + t * 0.2, Math.sin(angle) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = 160;
  const sides = 16;
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    // Stays plump almost to the top, then rounds off into a soft peak.
    const tubeRadius = 0.058 * (1 - t) ** 0.55 + 0.012;
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const normal = frames.normals[i].clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(frames.binormals[i], Math.sin(angle));
      positions.push(center.x + normal.x * tubeRadius, center.y + normal.y * tubeRadius, center.z + normal.z * tubeRadius);
      uvs.push(t * 8, j / sides);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Jax's Café Cirque mug: a round sage-green bowl with a wide gold band at
 * the lip, a flat ring handle edged in gold, gold script on the front and
 * a tiny Eiffel Tower on the back, heaped with a mocha whipped-cream swirl,
 * cocoa dust and marshmallows.
 */
export function createHotChocolateMug() {
  const group = new THREE.Group();
  group.name = 'MazeFindable';
  // Its own sage glow rather than the shared warm one, which reads as cream.
  const mugMaterial = glowMaterial(0x9cc7a6, { roughness: 0.14, metalness: 0.03 });
  mugMaterial.emissive.set(0x86b892);
  mugMaterial.side = THREE.DoubleSide;
  const gold = new THREE.MeshStandardMaterial({
    color: 0xe9a446, roughness: 0.22, metalness: 0.85, emissive: 0x6b3a0c, emissiveIntensity: 0.6,
  });

  // The wall turns over the lip and runs a little way down inside.
  const wall = [...MUG_OUTLINE, new THREE.Vector2(0.186, 0.405), new THREE.Vector2(0.184, 0.36)];
  const body = new THREE.Mesh(new THREE.LatheGeometry(wall, 64), mugMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Wide gold band round the mouth, folding over the lip.
  const bandPoints = [];
  for (let i = 0; i <= 10; i++) {
    const y = THREE.MathUtils.lerp(0.352, 0.405, i / 10);
    bandPoints.push(new THREE.Vector2(mugRadiusAt(y) + 0.0025, y));
  }
  bandPoints.push(new THREE.Vector2(0.193, 0.409), new THREE.Vector2(0.185, 0.4));
  group.add(new THREE.Mesh(new THREE.LatheGeometry(bandPoints, 64), gold));

  // Flat ring handle: a short open band, sage outside, gold along both edges.
  const handleY = 0.22, ringRadius = 0.078, ringDepth = 0.07;
  const handleX = mugRadiusAt(handleY) + ringRadius - 0.012;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(ringRadius, ringRadius, ringDepth, 40, 1, true), mugMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(handleX, handleY, 0);
  ring.castShadow = true;
  group.add(ring);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.0055, 8, 40), gold);
    edge.position.set(handleX, handleY, side * ringDepth / 2);
    group.add(edge);
  }

  const chocolate = new THREE.Mesh(
    new THREE.CircleGeometry(0.186, 48),
    new THREE.MeshStandardMaterial({ color: 0x5a2c1a, roughness: 0.3, metalness: 0.02 }),
  );
  chocolate.rotation.x = -Math.PI / 2;
  chocolate.position.y = 0.392;
  group.add(chocolate);

  // Gold decals hug the belly; the script faces front (+z), handle to the right.
  const decal = (map) => new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const scriptArc = 1.7;
  group.add(new THREE.Mesh(mugShell(0.105, 0.335, 0.0015, -scriptArc / 2, scriptArc), decal(createMugLabel())));
  const towerArc = 0.42;
  group.add(new THREE.Mesh(mugShell(0.11, 0.31, 0.0015, Math.PI - towerArc / 2, towerArc), decal(createTowerDecal())));

  // A low dome of cream fills the mouth under the piped swirl.
  const dust = createCocoaDust();
  const cream = new THREE.MeshStandardMaterial({ color: 0xe2bf9c, roughness: 0.7, map: dust });
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.175, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), cream);
  mound.scale.y = 0.45;
  mound.position.y = 0.39;
  group.add(mound);
  const topping = new THREE.Mesh(createWhippedCream(), cream);
  topping.castShadow = true;
  group.add(topping);

  // Lying half-sunk in the lower coils, pointing round the swirl.
  const marshmallow = new THREE.MeshStandardMaterial({ color: 0xd9c4ad, roughness: 0.9 });
  for (const [angle, y] of [[0.6, 0.465], [2.5, 0.455], [4.3, 0.475]]) {
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 16), marshmallow);
    piece.position.set(Math.cos(angle) * 0.14, y, Math.sin(angle) * 0.14);
    piece.rotation.set(0, -angle, Math.PI / 2 - 0.25);
    group.add(piece);
  }

  group.userData.glow = { material: mugMaterial };
  return group;
}

/** Advances every still-placed findable's glow, same contract as
 * officePicture.js's pulseGlow — skips anything already picked up
 * (removed from the scene, so `.parent` is null) rather than needing the
 * caller to filter its own list as pickups happen. */
export function pulseGlow(findables, elapsedSeconds) {
  const wave = 0.5 + 0.5 * Math.sin(elapsedSeconds * GLOW_PULSE_HZ * Math.PI * 2);
  for (const findable of findables) {
    if (!findable.parent) continue;
    const material = findable.userData.glow.material;
    const intensity = GLOW_EMISSIVE_BASE + GLOW_EMISSIVE_SWING * wave;
    if (material.emissive) material.emissiveIntensity = intensity;
    if (material.uniforms?.uGlow) material.uniforms.uGlow.value = intensity;
  }
}

/**
 * Places one findable on the floor and wires it into the E-interact
 * system, same shape as officePicture.js's placeOfficePicture: picking it
 * up removes it from the scene and records it in the shared maze item
 * state, and does nothing if it was already collected on a previous visit.
 * Anchored like an NPC, so it's offered within PICKUP_RADIUS without aiming.
 *
 * @param {{ group: THREE.Group, interactables?: Array, colliders?: THREE.Box3[] }} room
 * @param {{ hasCollected: (id: string) => boolean, collect: (id: string) => void }} items
 * @param {string} itemId
 * @param {string} label shown in the pickup prompt ("Pick up <label>")
 * @param {() => THREE.Group} createMesh
 * @param {THREE.Vector3} position floor position; the mesh sits a little above it
 * @param {() => number} [rng] Optional seeded stream for repeatable prop rotation.
 * @returns {THREE.Group | null} the placed mesh (for pulseGlow), or null
 *   if it was already collected and nothing was placed
 */
export function placeMazeFindable(room, items, itemId, label, createMesh, position, rng = Math.random) {
  if (items.hasCollected(itemId)) return null;

  const mesh = createMesh();
  mesh.position.copy(position);
  mesh.rotation.y = rng() * Math.PI * 2;
  room.group.add(mesh);
  mesh.updateMatrixWorld(true);

  const objects = [];
  mesh.traverse((child) => { if (child.isMesh) objects.push(child); });

  // Solid until picked up. Raised well past STEP_HEIGHT so she can't step
  // or hop onto a prop this small; the room's live collider list is what
  // main.js checks each frame.
  let collider = null;
  if (room.colliders) {
    collider = new THREE.Box3().setFromObject(mesh);
    collider.max.y = Math.max(collider.max.y, collider.min.y + 2.5);
    room.colliders.push(collider);
  }

  const pickup = {
    objects,
    anchor: mesh,
    radius: PICKUP_RADIUS,
    aimOnly: true,
    enabled: () => Boolean(mesh.parent) && !items.hasCollected(itemId),
    prompt: () => `Pick up ${label}`,
    interact: () => {
      if (!mesh.parent || items.hasCollected(itemId)) return;
      mesh.removeFromParent();
      if (collider) {
        const at = room.colliders.indexOf(collider);
        if (at !== -1) room.colliders.splice(at, 1);
      }
      items.collect(itemId);
      const list = room.interactables;
      const index = list.indexOf(pickup);
      if (index !== -1) list.splice(index, 1);
    },
  };
  room.interactables = [...(room.interactables ?? []), pickup];
  return mesh;
}
