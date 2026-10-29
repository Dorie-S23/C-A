import * as THREE from 'three';

/**
 * Abstraction: what happens to someone in the circus who finally breaks.
 * One effect for everyone it happens to (Kaufmo when the photos fall
 * short, Jax in Level 3, …): createAbstractionEffect() on the character's
 * root group, update() it every frame, and drive it with two numbers:
 *
 *   distress (0-1)  how close to the edge they are. Static clings to their
 *                   silhouette, the body swells in slow lumps, and slices
 *                   of them tear sideways. Follows the dialogue: a line's
 *                   `distress` (0-3) through distressFromDialogue().
 *   progress (0-1)  how much of them is gone. A ragged front creeps down
 *                   from the head; behind it they're a dark, churning void
 *                   with a hot edge where it meets what's left. abstract()
 *                   plays it through.
 *
 * How: every visible mesh in the character gets a "shell", a second mesh
 * drawing the same geometry with the shader below, bound to the same
 * skeleton so it holds every pose, and pushed a few millimetres out along
 * its normals so it lies over the body. The character's own materials are
 * never touched: the shell is see-through where they're still themselves
 * and opaque where they're gone, so it works on any model, and dispose()
 * leaves them exactly as they were. While distress and progress are both 0
 * the shells are hidden and cost nothing.
 *
 * Try it outside the game: npm run dev, then open
 * http://localhost:5173/tools/abstraction-preview.html
 */

// --- The shader -----------------------------------------------------------
// Attributes (per vertex, from the character's own geometry): position,
// normal, and on rigged meshes skinIndex/skinWeight (which bones move the
// vertex, and how much). three.js's skinning chunks apply those exactly as
// the character's own material does, so the shell holds the same pose.
//
// Uniforms (the same for every vertex and pixel of a frame, set from JS):
//   uTime         seconds the effect has been showing: everything that moves
//   uDistress     0-1, see above
//   uProgress     0-1, see above
//   uRestToBody   takes this mesh's unposed vertices into "body space":
//                 metres, origin at the character's root, y up. Noise and
//                 the front are measured there, so they stay on the same
//                 spot of skin however the character moves (a world-space
//                 pattern would slide over them as they walked).
//   uFloor, uHeight  the body's lowest point and height in that space, so
//                 "how far up the body" is 0 at the feet and 1 at the crown
//   uVoidColor, uEdgeColor, uStaticColorA/B  the palette
//
// Varyings (worked out per vertex, blended across each triangle for the
// fragment stage):
//   vBody         the point in body space
//   vViewNormal   which way the surface faces, in camera space
//   vViewDir      from the surface towards the camera
//
// Nothing flashes: brightness only ever changes smoothly, and the one
// stepped change, the tears, re-rolls TEAR_HZ = 2.5 times a second, under
// the 3 a second that WCAG 2.3.1 counts as flashing.
//
// Borrowed: value noise and fBm (octaves of it, layered) are the standard
// construction, here in 3D, with the same sin/fract hash as the sky in
// titleScreen.js; the cosine palette is Inigo Quilez's
// (https://iquilezles.org/articles/palettes/).

// Used by both stages, so the vertex stage swells exactly what the
// fragment stage paints as gone, and tears exactly the slices it fills.
const SHARED_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uDistress;
  uniform float uProgress;
  uniform float uFloor;
  uniform float uHeight;

  const float FRONT_SCALE = 3.0;      // grain of the front's raggedness: about a third of a metre
  const float FRONT_ROUGHNESS = 0.45; // 0 = a level line down the body, 1 = random patches
  const float EDGE_WIDTH = 0.08;      // the glowing band just ahead of the front
  const float TEAR_SLICES = 14.0;     // slices of the body that tear independently
  const float TEAR_HZ = 2.5;          // re-rolls a second (see the flashing note in abstraction.js)
  const float TEAR_CHANCE = 0.22;     // share of slices torn at full distress

  float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x),
          mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
      mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x),
          mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
      u.z);
  }
  // Three octaves, rescaled to 0-1.
  float fbm3(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      sum += amplitude * noise3(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return sum / 0.875;
  }

  // 0 at the feet, 1 at the crown.
  float heightUp(vec3 body) {
    return clamp((body.y - uFloor) / uHeight, 0.0, 1.0);
  }

  // How far past the front this point is: 0 or more means it's gone. The
  // head goes first (it starts in the mind), the feet last, and noise
  // makes the front ragged. At progress 0 the front sits above even the
  // highest point, glow included; at 1 it's below the lowest.
  float pastFront(vec3 body) {
    float takenAt = mix(heightUp(body), fbm3(body * FRONT_SCALE), FRONT_ROUGHNESS);
    return takenAt - mix(1.0 + EDGE_WIDTH, 0.0, uProgress);
  }

  // A random 0-1 for this slice of the body, the same across the whole
  // slice until the next re-roll. The tick wraps so the hash's input
  // stays small (sin loses precision on big numbers).
  float sliceRoll(vec3 body, float salt) {
    float slice = floor(heightUp(body) * TEAR_SLICES);
    return hash3(vec3(slice, mod(floor(uTime * TEAR_HZ), 251.0), salt));
  }
  // 1 if this slice is torn right now: more of them the more distressed.
  float torn(vec3 body) {
    return step(1.0 - uDistress * TEAR_CHANCE, sliceRoll(body, 0.0));
  }
`;

const VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>
  #include <clipping_planes_pars_vertex>

  uniform mat4 uRestToBody;

  varying vec3 vBody;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  ${SHARED_GLSL}

  const float SHELL_GAP = 0.008;      // metres off the skin, so the shell never z-fights the body
  const float SWELL_DISTRESS = 0.025; // how far the lumps push out at full distress
  const float SWELL_GONE = 0.045;     // and how far what's gone bulges (much more and buttons balloon into spheres)
  const float STRETCH = 0.15;         // what's gone is drawn upward by this share of their height, at full progress
  const float TEAR_REACH = 0.1;       // furthest a torn slice slides sideways, in metres

  void main() {
    // Measured from the unposed vertex, so it's fixed to the skin.
    vBody = (uRestToBody * vec4(position, 1.0)).xyz;

    // Pose it like the character: three.js's own chunks, in the order its
    // built-in materials use them: morph targets (face shapes), then
    // skinning, for the normal and then the position.
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>

    vec3 viewNormal = normalize(normalMatrix * objectNormal);
    vec3 worldNormal = inverseTransformDirection(viewNormal, viewMatrix);
    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);

    // Swell: out along the normal by slow, drifting lumps (a little when
    // distressed, a lot where they're already gone), on top of the gap.
    // Done in world space so it's in metres whatever the model's scale.
    float lumps = fbm3(vBody * 2.5 + vec3(0.0, uTime * 0.5, 0.0));
    float gone = smoothstep(-EDGE_WIDTH, 0.0, pastFront(vBody));
    worldPosition.xyz += worldNormal * (SHELL_GAP + lumps * (uDistress * SWELL_DISTRESS + gone * SWELL_GONE));
    // Stretch: what's gone is drawn upward, the higher up it is the more.
    worldPosition.y += gone * heightUp(vBody) * uProgress * STRETCH * uHeight;

    // Tear: a torn slice slides sideways across the screen (camera space).
    vec4 mvPosition = viewMatrix * worldPosition;
    mvPosition.x += torn(vBody) * (sliceRoll(vBody, 1.0) * 2.0 - 1.0) * TEAR_REACH;

    vViewNormal = viewNormal;
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    // Clipped wherever the character's own materials are (main.js clips
    // Pomni's room to her doorway when it's seen from the hall). The chunk
    // reads mvPosition, three.js's name for the camera-space position.
    #include <clipping_planes_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uVoidColor;
  uniform vec3 uEdgeColor;
  uniform vec3 uStaticColorA;
  uniform vec3 uStaticColorB;

  varying vec3 vBody;
  varying vec3 vViewNormal;
  varying vec3 vViewDir;

  #include <clipping_planes_pars_fragment>

  ${SHARED_GLSL}

  const float TEAR_FILL = 0.55; // how solid the static across a torn slice is

  // Inigo Quilez's cosine palette, phased to run through every hue: red at 0, blue at 1/3, green at 2/3.
  vec3 circusPalette(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }

  void main() {
    #include <clipping_planes_fragment>

    // How edge-on the surface is to the camera: 0 facing it, 1 at the silhouette.
    float rim = pow(1.0 - clamp(dot(normalize(vViewNormal), normalize(vViewDir)), 0.0, 1.0), 3.0);
    // Static: grain fine enough to read as noise, crawling up the body. It
    // drifts rather than re-rolling every frame, so it never strobes.
    float grain = noise3(vBody * 70.0 + vec3(0.0, -uTime * 1.5, 0.0));
    vec3 staticColor = mix(uStaticColorA, uStaticColorB, grain);

    // Still themselves: static only at the silhouette, thicker the more
    // distressed, and across the whole of any slice that's torn.
    vec3 color = staticColor * (0.6 + rim);
    float alpha = rim * uDistress * (0.4 + 0.6 * grain);
    alpha = max(alpha, torn(vBody) * TEAR_FILL * (0.3 + 0.7 * grain));

    // The edge: a hot band just ahead of the front.
    float past = pastFront(vBody);
    float edge = smoothstep(-EDGE_WIDTH, 0.0, past) * (1.0 - step(0.0, past));
    color = mix(color, uEdgeColor, edge);
    alpha = max(alpha, edge);

    // Gone: a near-black void with thin lines of colour churning slowly
    // through it, and static round its silhouette so it still reads in a
    // dark room. The lines are a sine wave raised to a high power: mostly
    // 0 with narrow peaks, so the void stays dark between them (these are
    // linear values, and the screen's sRGB brightens small ones a lot).
    if (past >= 0.0) {
      float swirl = fbm3(vBody * 1.8 + vec3(fbm3(vBody * 1.2 + uTime * 0.1) * 3.0, -uTime * 0.2, 0.0));
      float lines = pow(0.5 + 0.5 * sin(swirl * 30.0 - uTime * 1.2), 8.0);
      color = uVoidColor + circusPalette(swirl * 3.0 + uTime * 0.03) * lines * 0.3 + staticColor * rim * 0.8;
      alpha = 1.0;
    }

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DEFAULT_COLORS = {
  void: 0x08040f,
  edge: 0xff9ce9,
  staticA: 0xff2fd0,
  staticB: 0x3ff6ff,
};
const DISTRESS_SHARPNESS = 3; // how fast distress eases to a new level: a new line ramps it rather than snapping
const DIALOGUE_DISTRESS_MAX = 3; // a dialogue line's `distress` runs 0-3 (DialogueUI's shake levels)
export const ABSTRACT_SECONDS = 4; // abstract()'s default: the front from crown to feet

/** A dialogue line's `distress` (0-3, see DialogueUI) as the effect's 0-1. */
export function distressFromDialogue(level) {
  return THREE.MathUtils.clamp((level ?? 0) / DIALOGUE_DISTRESS_MAX, 0, 1);
}

/**
 * Gives a character the abstraction effect (see the top of this file).
 * Make it once the character is loaded and posed as it will stand; it's
 * hidden until setDistress(), setProgress() or abstract() bring it in.
 *
 * abstract() resolves true once they're completely gone, or false if
 * reset(), setProgress(), another abstract() or dispose() cut it short.
 *
 * @param {THREE.Object3D} character the character's root group
 * @param {{ colors?: { void?: THREE.ColorRepresentation, edge?: THREE.ColorRepresentation,
 *   staticA?: THREE.ColorRepresentation, staticB?: THREE.ColorRepresentation } }} [options]
 * @returns {{ update: (deltaSeconds: number) => void,
 *   setDistress: (value: number, options?: { immediate?: boolean }) => void,
 *   setProgress: (value: number) => void,
 *   abstract: (seconds?: number) => Promise<boolean>,
 *   reset: () => void, dispose: () => void,
 *   readonly distress: number, readonly progress: number, shells: THREE.Mesh[] }}
 */
export function createAbstractionEffect(character, { colors = {} } = {}) {
  character.updateMatrixWorld(true);
  const worldToBody = character.matrixWorld.clone().invert();
  const palette = { ...DEFAULT_COLORS, ...colors };
  // One set of uniform objects shared by every shell's material, so a
  // single write reaches them all; only uRestToBody is each shell's own.
  const shared = {
    uTime: { value: 0 },
    uDistress: { value: 0 },
    uProgress: { value: 0 },
    uFloor: { value: 0 },
    uHeight: { value: 1 },
    uVoidColor: { value: new THREE.Color(palette.void) },
    uEdgeColor: { value: new THREE.Color(palette.edge) },
    uStaticColorA: { value: new THREE.Color(palette.staticA) },
    uStaticColorB: { value: new THREE.Color(palette.staticB) },
  };

  // Hidden meshes (like Kaufmo's leftover Cube and Icosphere) are skipped,
  // and so is anything without normals: the shell swells along them.
  const meshes = [];
  character.traverse((child) => {
    if (child.isMesh && child.visible && child.geometry.attributes.normal && !child.userData.abstractionShell) {
      meshes.push(child);
    }
  });

  const bounds = new THREE.Box3();
  const shells = meshes.map((mesh) => {
    const restToBody = worldToBody.clone().multiply(mesh.matrixWorld);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(restToBody));

    const material = new THREE.ShaderMaterial({
      name: 'Abstraction',
      uniforms: { ...shared, uRestToBody: { value: restToBody } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      clipping: true, // takes clipping planes like a built-in material (see clipping_planes_vertex above)
    });
    const shell = mesh.isSkinnedMesh
      ? new THREE.SkinnedMesh(mesh.geometry, material)
      : new THREE.Mesh(mesh.geometry, material);
    if (mesh.isSkinnedMesh) {
      shell.bindMode = mesh.bindMode;
      shell.bind(mesh.skeleton, mesh.bindMatrix);
    }
    // The same arrays, not copies, so face shapes stay in step.
    shell.morphTargetInfluences = mesh.morphTargetInfluences;
    shell.morphTargetDictionary = mesh.morphTargetDictionary;
    shell.name = `${mesh.name || 'Mesh'} abstraction`;
    shell.userData.abstractionShell = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    // Never something to aim at, click or bump into.
    shell.raycast = () => {};
    // Its swell and tears reach past the body's own bounds, which three.js
    // would otherwise use to decide it's off screen.
    shell.frustumCulled = false;
    shell.visible = false;
    // A child of the mesh it covers: the same transform, and it goes
    // wherever that mesh goes.
    mesh.add(shell);
    return shell;
  });
  if (!bounds.isEmpty()) {
    shared.uFloor.value = bounds.min.y;
    shared.uHeight.value = Math.max(bounds.max.y - bounds.min.y, 0.01);
  }

  let time = 0;
  let distress = 0;
  let targetDistress = 0;
  let progress = 0;
  let playing = null; // { seconds, resolve } while abstract() runs

  function stopPlaying(finished) {
    if (!playing) return;
    const { resolve } = playing;
    playing = null;
    resolve(finished);
  }

  function sync() {
    const showing = distress > 0 || progress > 0;
    for (const shell of shells) shell.visible = showing;
    shared.uTime.value = time;
    shared.uDistress.value = distress;
    shared.uProgress.value = progress;
  }

  function update(deltaSeconds) {
    distress += (targetDistress - distress) * (1 - Math.exp(-DISTRESS_SHARPNESS * deltaSeconds));
    // Settle onto 0 rather than creeping at it forever, so the shells hide.
    if (targetDistress === 0 && distress < 0.001) distress = 0;
    if (playing) {
      progress = Math.min(1, progress + deltaSeconds / playing.seconds);
      if (progress >= 1) stopPlaying(true);
    }
    if (distress > 0 || progress > 0) time += deltaSeconds;
    sync();
  }

  /** 0-1 (see distressFromDialogue); eased in by update() unless immediate. */
  function setDistress(value, { immediate = false } = {}) {
    targetDistress = THREE.MathUtils.clamp(value, 0, 1);
    if (immediate) {
      distress = targetDistress;
      sync();
    }
  }

  /** Jumps straight to how much of them is gone, 0-1. */
  function setProgress(value) {
    stopPlaying(false);
    progress = THREE.MathUtils.clamp(value, 0, 1);
    sync();
  }

  /** Plays the front from wherever it is down to the feet, at full distress. */
  function abstract(seconds = ABSTRACT_SECONDS) {
    stopPlaying(false);
    targetDistress = 1;
    return new Promise((resolve) => { playing = { seconds, resolve }; });
  }

  /** Back to themselves at once: no distress, nothing gone, shells hidden. */
  function reset() {
    stopPlaying(false);
    time = 0;
    distress = targetDistress = 0;
    progress = 0;
    sync();
  }

  /** Takes the shells off the character for good (its geometry is the character's own, so it's left alone). */
  function dispose() {
    reset();
    for (const shell of shells) {
      shell.removeFromParent();
      shell.material.dispose();
    }
    shells.length = 0;
  }

  return {
    update, setDistress, setProgress, abstract, reset, dispose,
    get distress() { return distress; },
    get progress() { return progress; },
    shells,
  };
}
