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
// Metres from a keepsake that "close enough to pick up" means. Both are
// tiny floor props at the back of a side pocket, too small to aim the
// crosshair at, so being near one with it in sight is enough: this covers
// the whole pocket from the corridor outside it (cells are 4.5 m, so the
// pocket's mouth is 2.25 m away), and main.js's line-of-sight check keeps
// it from reaching through a wall.
const PICKUP_RADIUS = 3;

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
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
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

function createMugLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#bd7447';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'italic 54px Georgia, serif';
  context.fillText('Café Circus', 256, 130);
  context.font = '24px Georgia, serif';
  context.fillText('✦  HOT CHOCOLATE  ✦', 256, 190);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWhippedCream() {
  const points = [];
  for (let index = 0; index <= 64; index++) {
    const t = index / 64;
    const angle = t * Math.PI * 5.4;
    const radius = 0.105 * (1 - t) + 0.002;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.415 + t * 0.19, Math.sin(angle) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = 80;
  const sides = 10;
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const tubeRadius = 0.043 * (1 - t) + 0.003;
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const normal = frames.normals[i].clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(frames.binormals[i], Math.sin(angle));
      positions.push(center.x + normal.x * tubeRadius, center.y + normal.y * tubeRadius, center.z + normal.z * tubeRadius);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Large celadon Café Circus mug with a gold rim and whipped hot chocolate. */
export function createHotChocolateMug() {
  const group = new THREE.Group();
  group.name = 'MazeFindable';
  const mugMaterial = glowMaterial(0xd8e4d8, { roughness: 0.22, metalness: 0.04 });
  const profile = [
    new THREE.Vector2(0.13, 0.015), new THREE.Vector2(0.18, 0.025),
    new THREE.Vector2(0.225, 0.07), new THREE.Vector2(0.245, 0.15),
    new THREE.Vector2(0.245, 0.29), new THREE.Vector2(0.225, 0.38),
    new THREE.Vector2(0.21, 0.405),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), mugMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.031, 12, 32), mugMaterial);
  handle.position.set(0.275, 0.215, 0);
  handle.castShadow = true;
  group.add(handle);

  const chocolate = new THREE.Mesh(
    new THREE.CircleGeometry(0.204, 48),
    new THREE.MeshStandardMaterial({ color: 0x4a2118, roughness: 0.24, metalness: 0.02 }),
  );
  chocolate.rotation.x = -Math.PI / 2;
  chocolate.position.y = 0.397;
  group.add(chocolate);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.214, 0.019, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0xd89b45, roughness: 0.26, metalness: 0.72 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.4;
  group.add(rim);

  const cream = new THREE.MeshStandardMaterial({ color: 0xf6e4c7, roughness: 0.64 });
  const topping = new THREE.Mesh(createWhippedCream(), cream);
  topping.castShadow = true;
  group.add(topping);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.11),
    new THREE.MeshBasicMaterial({ map: createMugLabel(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  label.position.set(0, 0.22, 0.246);
  group.add(label);

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
 * @param {{ group: THREE.Group, interactables?: Array }} room
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

  const pickup = {
    objects,
    anchor: mesh,
    radius: PICKUP_RADIUS,
    // The line-of-sight check's own default aims at head height above the
    // anchor (right for an NPC, whose anchor is its feet) — for a prop
    // already sitting right at that height, that reads as "blocked" under
    // any overhang the prop itself is in plain view under.
    sightHeight: 0.3,
    enabled: () => Boolean(mesh.parent) && !items.hasCollected(itemId),
    prompt: () => `Pick up ${label}`,
    interact: () => {
      if (!mesh.parent || items.hasCollected(itemId)) return;
      mesh.removeFromParent();
      items.collect(itemId);
      const list = room.interactables;
      const index = list.indexOf(pickup);
      if (index !== -1) list.splice(index, 1);
    },
  };
  room.interactables = [...(room.interactables ?? []), pickup];
  return mesh;
}
