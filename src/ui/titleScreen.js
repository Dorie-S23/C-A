import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const TITLE_URL = './models/game%20screens/TADC%20Intro%20Animation%20V2.glb';

// The three blocks of the menu stack, top to bottom. Each block's label is
// a separate mesh, so both are hit-tested.
const BUTTONS = [
  { action: 'play', block: 'Cube010', label: 'Text' },
  { action: 'options', block: 'Cube011', label: 'Text002' },
  { action: 'quit', block: 'Cube012', label: 'Text001' },
];

// The PLAY and OPTIONS labels were exported 3 cm *inside* their blocks
// (QUIT's sits just in front of its own), so they never render. Pull them
// forward to the block faces.
const BURIED_LABELS = ['Text', 'Text002'];
const LABEL_NUDGE_Z = 0.15;
const HOVER_SCALE = 1.2;
const HOVER_EASE = 12; // per second; how quickly a block grows/shrinks

// "CIRCUS" was laid out by a Lattice modifier, which glTF can't export: the
// six letter meshes arrive stacked on one spot at scale 0, all plain white.
// They're placed here instead, styled after the show's logo: big glossy
// red/yellow/blue balloon letters with white polka dots, bunched together
// and overlapping the bottom of DIGITAL. The meshes aren't in spelling
// order (two C's, then I R U S), hence the names list.
const CIRCUS_LETTERS = [
  { name: 'Text013_Remeshed_Remeshed', color: 0xe8141c }, // C
  { name: 'Text013_Remeshed001_Remeshed', color: 0xffd400 }, // I
  { name: 'Text013_Remeshed002_Remeshed', color: 0xe8141c }, // R
  { name: 'Text013_Remeshed_Remeshed001', color: 0xffd400 }, // C
  { name: 'Text013_Remeshed004_Remeshed', color: 0x1f63e0 }, // U
  { name: 'Text013_Remeshed005_Remeshed', color: 0x1f63e0 }, // S
];
const CIRCUS_CENTER = new THREE.Vector3(0, 35.8, 201.9);
const CIRCUS_SCALE = 0.9;
const CIRCUS_GAP = -0.22; // between letters, in world units after scaling; negative = overlapping
const CIRCUS_ARC = 0.35; // how much higher the end letters sit than the middle
const CIRCUS_TILTS = [0.12, -0.08, 0.06, -0.1, 0.07, -0.12]; // playful per-letter roll, radians
const CIRCUS_BOUNCE = [0, 0.12, -0.08, 0.06, -0.1, 0.08]; // per-letter height jitter, world units
// Polka dots, in the letter meshes' own units (a letter is ~1.8 tall).
const DOT_SPACING = 0.42;
const DOT_RADIUS = 0.3; // as a fraction of DOT_SPACING
// The letters pop in one after another, starting as DIGITAL finishes.
const CIRCUS_POP_START = 7.2; // seconds into the intro
const CIRCUS_POP_STAGGER = 0.09;
const CIRCUS_POP_DURATION = 0.45;

// The logo — THE AMAZING, DIGITAL and CIRCUS — is gathered into one group
// so it can be enlarged and lifted clear of the menu as a whole. Scaling is
// about the bottom-centre of DIGITAL.
const DIGITAL_ROOT = 'Empty004'; // parent of the seven DIGITAL letters
const AMAZING_LETTERS = ['Text003', 'Text004', 'Text005', 'Text006', 'Text007',
  'Text008', 'Text009', 'Text010', 'Text011', 'Text012'];
const LOGO_SCALE = 1.35;
const LOGO_LIFT = 1.9; // world units upward, after scaling
// THE AMAZING was exported small and far behind DIGITAL; it's brought
// forward to sit on DIGITAL's top edge, like the show's logo.
const AMAZING_WIDTH = 0.62; // as a fraction of DIGITAL's width
const AMAZING_OVERLAP = 1.65; // how far its bounding box dips into DIGITAL (the box runs well above the visible text), logo units

// The Blender camera wasn't exported, so this framing is reconstructed:
// high enough that "THE AMAZING" sits above "DIGITAL", with the menu below.
const CAMERA_POSITION = new THREE.Vector3(0, 41.5, 216);
const CAMERA_TARGET = new THREE.Vector3(0, 36, 199);
const CAMERA_FOV = 46;
// Horizontal angle that must always stay on screen (the DIGITAL logo), so
// portrait windows widen the vertical FOV instead of cropping the logo.
const MIN_HORIZONTAL_FOV = 72;

/**
 * The animated title screen: plays the intro from the GLB once, then turns
 * the PLAY / OPTIONS / QUIT blocks into buttons (mouse hover + click, or
 * arrow keys + Enter); the selected block grows. Clicking or pressing a
 * key during the intro skips it.
 *
 * Owns its own scene and camera; main.js renders it while `active`.
 *
 * @param {{ renderer: THREE.WebGLRenderer, onAction: (action: string) => void,
 *   isBlocked?: () => boolean }} options  isBlocked: true while a panel covers the menu
 */
export function createTitleScreen({ renderer, onAction, isBlocked = () => false }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07072e);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(0, 50, 300);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 2000);
  camera.position.copy(CAMERA_POSITION);
  camera.lookAt(CAMERA_TARGET);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = renderer.domElement;

  let mixer = null;
  let actions = [];
  let introDuration = 0;
  let introTime = 0;
  let introDone = false;
  let buttons = [];
  let selected = -1;
  let active = false;
  let buriedLabels = [];
  let labelsNudged = false;
  let circusLetters = [];
  let circusTime = 0; // on the intro's clock; drives the letters' pop-in

  /**
   * Advances the intro to `time` (absolute) or by `delta`. The label
   * positions have animation tracks, which may or may not rewrite them on
   * a given step, so the nudge is taken off before stepping and put back
   * after — it never compounds either way.
   */
  function stepIntro({ time, delta }) {
    if (labelsNudged) for (const label of buriedLabels) label.position.z -= LABEL_NUDGE_Z;
    if (time !== undefined) mixer.setTime(time);
    else mixer.update(delta);
    for (const label of buriedLabels) label.position.z += LABEL_NUDGE_Z;
    labelsNudged = true;
  }

  const ready = new GLTFLoader().loadAsync(TITLE_URL).then((gltf) => {
    scene.add(gltf.scene);
    buriedLabels = BURIED_LABELS.map((name) => gltf.scene.getObjectByName(name)).filter(Boolean);

    mixer = new THREE.AnimationMixer(gltf.scene);
    actions = gltf.animations.map((clip) => {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      introDuration = Math.max(introDuration, clip.duration);
      return action;
    });

    buttons = BUTTONS.map(({ action, block, label }) => ({
      action,
      block: gltf.scene.getObjectByName(block),
      objects: [block, label].map((name) => gltf.scene.getObjectByName(name)).filter(Boolean),
      baseScales: [],
      hover: 0,
    })).filter((button) => button.block);

    circusLetters = CIRCUS_LETTERS.map(({ name, color }, i) => {
      const letter = gltf.scene.getObjectByName(name);
      if (letter) letter.material = createPolkaDotMaterial(letter.material, color, i);
      return letter;
    }).filter(Boolean);
    layOutCircus();
    groupLogo(gltf.scene);

    renderer.compile(scene, camera);
  });

  /**
   * Moves THE AMAZING onto DIGITAL's top edge and puts the whole logo in a
   * group that's scaled up and lifted. The letters keep their animation:
   * the mixer writes their local transforms, which the groups then carry.
   */
  function groupLogo(root) {
    const digital = root.getObjectByName(DIGITAL_ROOT);
    const amazing = AMAZING_LETTERS.map((name) => root.getObjectByName(name)).filter(Boolean);
    if (!digital) return;

    // Measure the logo as it looks at the end of the intro. show() rewinds
    // the intro afterwards, so this leaves no trace.
    mixer.setTime(introDuration);
    root.updateMatrixWorld(true);
    const digitalBox = new THREE.Box3().setFromObject(digital);
    const amazingBox = new THREE.Box3();
    for (const letter of amazing) amazingBox.expandByObject(letter);

    // The letters were root nodes and the GLB root has no transform, so
    // their local coordinates are already world coordinates; a group's
    // transform is a straight remap of them.
    const logo = new THREE.Group();
    root.add(logo);
    logo.add(digital, ...circusLetters);

    if (amazing.length > 0 && !amazingBox.isEmpty()) {
      const amazingGroup = new THREE.Group();
      logo.add(amazingGroup);
      amazingGroup.add(...amazing);
      const from = amazingBox.getCenter(new THREE.Vector3());
      const size = amazingBox.getSize(new THREE.Vector3());
      const scale = (AMAZING_WIDTH * (digitalBox.max.x - digitalBox.min.x)) / size.x;
      const to = new THREE.Vector3(
        (digitalBox.min.x + digitalBox.max.x) / 2,
        digitalBox.max.y - AMAZING_OVERLAP + (size.y * scale) / 2,
        digitalBox.max.z,
      );
      amazingGroup.scale.setScalar(scale);
      amazingGroup.position.copy(to).addScaledVector(from, -scale);
    }

    const pivot = new THREE.Vector3(
      (digitalBox.min.x + digitalBox.max.x) / 2,
      digitalBox.min.y,
      (digitalBox.min.z + digitalBox.max.z) / 2,
    );
    logo.scale.setScalar(LOGO_SCALE);
    logo.position.copy(pivot).multiplyScalar(1 - LOGO_SCALE).add(new THREE.Vector3(0, LOGO_LIFT, 0));
  }

  /** Places the CIRCUS letters side by side, centred on CIRCUS_CENTER. */
  function layOutCircus() {
    const size = new THREE.Vector3();
    const widths = circusLetters.map((letter) => {
      letter.geometry.computeBoundingBox();
      return letter.geometry.boundingBox.getSize(size).x * CIRCUS_SCALE;
    });
    const total = widths.reduce((sum, w) => sum + w, 0) + CIRCUS_GAP * (widths.length - 1);
    let x = -total / 2;
    circusLetters.forEach((letter, i) => {
      // Each letter's geometry is centred on its own origin.
      const centerX = x + widths[i] / 2;
      const along = centerX / (total / 2); // -1 at the left end, 1 at the right
      letter.position.set(
        CIRCUS_CENTER.x + centerX,
        CIRCUS_CENTER.y + CIRCUS_ARC * along * along + (CIRCUS_BOUNCE[i] ?? 0),
        // Alternate depth slightly so overlapping neighbours don't z-fight.
        CIRCUS_CENTER.z + (i % 2) * 0.15,
      );
      // Lean with the arc, plus a little individual wobble.
      letter.rotation.set(0, 0, -along * CIRCUS_ARC * 0.5 + (CIRCUS_TILTS[i] ?? 0));
      letter.scale.setScalar(0);
      x += widths[i] + CIRCUS_GAP;
    });
  }

  /** Scales each CIRCUS letter in with a small overshoot, staggered. */
  function updateCircus() {
    circusLetters.forEach((letter, i) => {
      const t = THREE.MathUtils.clamp(
        (circusTime - CIRCUS_POP_START - i * CIRCUS_POP_STAGGER) / CIRCUS_POP_DURATION,
        0,
        1,
      );
      letter.scale.setScalar(CIRCUS_SCALE * easeOutBack(t));
    });
  }

  /** Jumps to the intro's last frame and switches the menu on. */
  function finishIntro() {
    if (introDone || !mixer) return;
    // Not mixer.setTime(): it rewinds every action to 0 before advancing,
    // and clips that already finished are paused, so they'd stay rewound.
    for (const action of actions) {
      action.paused = false;
      action.time = action.getClip().duration;
    }
    stepIntro({ delta: 0 });
    introDone = true;
    // The mixer is never updated again, so every animated transform stays
    // at its final value and the hover effects below can take over.
    for (const button of buttons) button.baseScales = button.objects.map((object) => object.scale.clone());
    selected = 0;
    // Skipping the intro still lets CIRCUS pop in, just straight away.
    circusTime = Math.max(circusTime, CIRCUS_POP_START);
  }

  function activate(index) {
    const button = buttons[index];
    if (button) onAction(button.action);
  }

  function buttonAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(buttons.flatMap((b) => b.objects), false)[0];
    return hit ? buttons.findIndex((b) => b.objects.includes(hit.object)) : -1;
  }

  function onPointerMove(event) {
    if (!active || !introDone) return;
    const index = buttonAt(event.clientX, event.clientY);
    canvas.style.cursor = index >= 0 ? 'pointer' : '';
    if (index >= 0) selected = index;
  }

  function onClick(event) {
    if (!active) return;
    if (!introDone) {
      finishIntro();
      return;
    }
    const index = buttonAt(event.clientX, event.clientY);
    if (index >= 0) activate(index);
  }

  function onKeyDown(event) {
    if (!active || event.repeat || isBlocked()) return;
    if (!introDone) {
      finishIntro();
      return;
    }
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        selected = (selected - 1 + buttons.length) % buttons.length;
        break;
      case 'ArrowDown':
      case 'KeyS':
        selected = (selected + 1) % buttons.length;
        break;
      case 'Enter':
      case 'Space':
        event.preventDefault();
        activate(selected);
        break;
    }
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);

  function resize(width, height) {
    camera.aspect = width / height;
    const minVerticalFov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(MIN_HORIZONTAL_FOV / 2)) / camera.aspect),
    );
    camera.fov = Math.max(CAMERA_FOV, minVerticalFov);
    camera.updateProjectionMatrix();
  }

  return {
    scene,
    camera,
    ready,
    resize,
    get active() {
      return active;
    },

    /** Shows the title screen; `playIntro: false` goes straight to the menu. */
    show({ playIntro = true } = {}) {
      active = true;
      if (playIntro && mixer) {
        introDone = false;
        introTime = 0;
        circusTime = 0;
        selected = -1;
        for (const button of buttons) button.hover = 0;
        // Finished one-shot actions stay paused on their last frame; reset
        // them so the whole intro runs again from the top.
        for (const action of actions) action.reset().play();
        stepIntro({ time: 0 });
      } else {
        finishIntro();
        circusTime = Infinity; // already fully in, no pop
        updateCircus();
      }
    },

    hide() {
      active = false;
      canvas.style.cursor = '';
    },

    update(delta) {
      if (!active || !mixer) return;
      circusTime += delta;
      updateCircus();
      if (!introDone) {
        introTime += delta;
        if (introTime >= introDuration) finishIntro();
        else stepIntro({ delta });
        return;
      }

      const ease = 1 - Math.exp(-HOVER_EASE * delta);
      buttons.forEach((button, index) => {
        button.hover += ((index === selected ? 1 : 0) - button.hover) * ease;
        const scale = 1 + (HOVER_SCALE - 1) * button.hover;
        button.objects.forEach((object, i) => object.scale.copy(button.baseScales[i]).multiplyScalar(scale));
      });
    },
  };
}

/**
 * A glossy balloon-plastic copy of a letter's material in `color`, with
 * white polka dots drawn in the shader: a hex grid of circles projected
 * onto the letter's front (local XY), faded out on the sides where the
 * projection would smear into stripes. `seed` shifts the grid so no two
 * letters share the same dot pattern.
 */
function createPolkaDotMaterial(source, color, seed) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    side: source.side,
  });
  const offset = new THREE.Vector2(seed * 0.37, seed * 0.61);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.dotOffset = { value: offset };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDotPos;\nvarying vec3 vDotNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDotPos = position;\nvDotNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vDotPos;\nvarying vec3 vDotNormal;\nuniform vec2 dotOffset;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vDotPos.xy / ${DOT_SPACING.toFixed(3)} + dotOffset;
          vec2 r = vec2(1.0, 1.7320508);
          vec2 h = r * 0.5;
          vec2 a = mod(p, r) - h;
          vec2 b = mod(p - h, r) - h;
          float d = length(dot(a, a) < dot(b, b) ? a : b);
          float edge = fwidth(d);
          float dotMask = 1.0 - smoothstep(${DOT_RADIUS.toFixed(3)} - edge, ${DOT_RADIUS.toFixed(3)} + edge, d);
          dotMask *= smoothstep(0.35, 0.65, abs(normalize(vDotNormal).z));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), dotMask);
        }`,
      );
  };
  return material;
}

/** 0 → 1 with a slight overshoot past 1 before settling, for a "pop". */
function easeOutBack(t) {
  const overshoot = 1.70158;
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}
