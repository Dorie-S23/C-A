import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Exported from "TADC Intro Animation V2.blend" by
// tools/blender/export_title_screen.py — re-run that after editing the .blend.
const TITLE_URL = './models/game%20screens/title-screen.glb';
const SKY_URL = './models/game%20screens/title-sky.jpg';

// The .blend's timeline (24 fps) is one continuous sequence: the logo and
// menu assemble, Kinger's glove comes to rest on PLAY, clicks it, and the
// camera flies down the hill into the tent. The game plays it in two parts,
// holding at HOLD_TIME while the menu is live and finishing the rest only
// once PLAY is chosen.
const FPS = 24;
const HOLD_TIME = 175 / FPS;
const END_TIME = 275 / FPS;

// The three blocks of the menu stack, top to bottom. Each block's label is
// a separate mesh, so both are hit-tested.
const BUTTONS = [
  { action: 'play', block: 'Cube010', label: 'Text' },
  { action: 'options', block: 'Cube011', label: 'Text002' },
  { action: 'quit', block: 'Cube012', label: 'Text001' },
];
const GLOVE = 'Cursor_Rig';
const HOVER_SCALE = 1.08;
const HOVER_EASE = 12; // per second; how quickly a block grows/shrinks and the glove moves

// Lighting, matched to the .blend: one sun (strength 6.22, aimed as below
// after converting Blender's Z-up to three's Y-up) plus the world's dim
// white fill (0.07) for everything that isn't a camera ray. three's ambient
// light is divided by π in the shader, Blender's world colour isn't.
const SUN_STRENGTH = 6.22;
const SUN_DIRECTION = new THREE.Vector3(-0.57, -0.532, -0.626).normalize();
const AMBIENT_STRENGTH = 0.07 * Math.PI;

/**
 * The animated title screen: plays the intro from the GLB, then holds with
 * PLAY / OPTIONS / QUIT live (mouse hover + click, or arrow keys + Enter);
 * Kinger's glove points at the selected button. Clicking or pressing a key
 * during the intro skips it. Choosing PLAY plays the rest of the animation
 * — the glove's click and the fly-in to the tent — before reporting it.
 *
 * Owns its own scene and camera; main.js calls render() while `active`.
 *
 * @param {{ renderer: THREE.WebGLRenderer, onAction: (action: string) => void,
 *   isBlocked?: () => boolean }} options  isBlocked: true while a panel covers the menu
 */
export function createTitleScreen({ renderer, onAction, isBlocked = () => false }) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_STRENGTH));
  const sun = new THREE.DirectionalLight(0xffffff, SUN_STRENGTH);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(-100);
  scene.add(sun);

  // Replaced by the GLB's own camera once loaded.
  let camera = new THREE.PerspectiveCamera(31.4, 4 / 3, 0.1, 1000);
  let authoredFov = camera.fov;
  let authoredAspect = camera.aspect;
  let viewport = { width: 4, height: 3 };

  const sky = createSkyBackdrop();
  scene.add(sky);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = renderer.domElement;

  let mixer = null;
  let actions = [];
  let state = 'intro'; // 'intro' → 'menu' → 'outro' (after PLAY)
  let time = 0;
  let buttons = [];
  let selected = 0;
  let glove = null;
  const gloveRest = new THREE.Vector3(); // its position at HOLD_TIME, pointing at PLAY
  const gloveTarget = new THREE.Vector3();
  let active = false;

  const ready = new GLTFLoader().loadAsync(TITLE_URL).then((gltf) => {
    scene.add(gltf.scene);

    if (gltf.cameras.length > 0) {
      camera = gltf.cameras[0];
      authoredFov = camera.fov;
      authoredAspect = camera.aspect;
      resize(viewport.width, viewport.height);
    }

    mixer = new THREE.AnimationMixer(gltf.scene);
    actions = gltf.animations.map((clip) => {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      return action;
    });

    buttons = BUTTONS.map(({ action, block, label }) => ({
      action,
      block: gltf.scene.getObjectByName(block),
      objects: [block, label].map((name) => gltf.scene.getObjectByName(name)).filter(Boolean),
      baseScales: [],
      offset: new THREE.Vector3(), // from PLAY's centre to this button's, for the glove
      hover: 0,
    })).filter((button) => button.block);
    glove = gltf.scene.getObjectByName(GLOVE);

    seek(0);
    renderer.compile(scene, camera);
  });

  /**
   * Poses everything at `t` seconds on the .blend's timeline. The clips'
   * keyframes keep their absolute times, so every clip is simply set to the
   * same moment (clamped to its own length).
   */
  function seek(t) {
    for (const action of actions) {
      action.enabled = true;
      action.paused = false;
      action.time = Math.min(t, action.getClip().duration);
    }
    mixer.update(0);
  }

  /** Holds on the menu pose and switches the buttons on. */
  function enterMenu() {
    time = HOLD_TIME;
    seek(HOLD_TIME);
    state = 'menu';
    scene.updateMatrixWorld(true);
    const playCenter = blockCenter(buttons[0]);
    for (const button of buttons) {
      button.baseScales = button.objects.map((object) => object.scale.clone());
      button.offset.subVectors(blockCenter(button), playCenter);
      button.hover = 0;
    }
    if (glove) gloveRest.copy(glove.position);
    select(0);
  }

  function blockCenter(button) {
    return new THREE.Box3().setFromObject(button.block).getCenter(new THREE.Vector3());
  }

  function select(index) {
    selected = index;
    // The glove is a root node, so its position is in world space.
    if (glove) gloveTarget.copy(gloveRest).add(buttons[index].offset);
  }

  function activate(index) {
    const button = buttons[index];
    if (!button) return;
    if (button.action === 'play') {
      // The rest of the timeline is the glove clicking PLAY and the camera
      // flying into the tent; report PLAY once it's over.
      select(0);
      state = 'outro';
      canvas.style.cursor = '';
      return;
    }
    onAction(button.action);
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
    if (!active || state !== 'menu') return;
    const index = buttonAt(event.clientX, event.clientY);
    canvas.style.cursor = index >= 0 ? 'pointer' : '';
    if (index >= 0 && index !== selected) select(index);
  }

  function onClick(event) {
    if (!active || !mixer) return;
    if (state === 'intro') {
      enterMenu();
      return;
    }
    if (state !== 'menu') return;
    const index = buttonAt(event.clientX, event.clientY);
    if (index >= 0) activate(index);
  }

  function onKeyDown(event) {
    if (!active || !mixer || event.repeat || isBlocked()) return;
    if (state === 'intro') {
      enterMenu();
      return;
    }
    if (state !== 'menu') return;
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        select((selected - 1 + buttons.length) % buttons.length);
        break;
      case 'ArrowDown':
      case 'KeyS':
        select((selected + 1) % buttons.length);
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

  /**
   * The .blend frames the shot for 4:3. Wider windows keep its vertical
   * field of view and see more to the sides; narrower ones keep its
   * horizontal one, so the logo and menu are never cropped.
   */
  function resize(width, height) {
    viewport = { width, height };
    camera.aspect = width / height;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(authoredFov / 2));
    const neededHalfHeight = (halfHeight * authoredAspect) / camera.aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(halfHeight, neededHalfHeight)));
    camera.updateProjectionMatrix();
  }

  function update(delta) {
    if (!active || !mixer) return;

    if (state === 'intro') {
      time += delta;
      if (time >= HOLD_TIME) enterMenu();
      else seek(time);
      return;
    }

    if (state === 'outro') {
      time += delta;
      seek(Math.min(time, END_TIME));
      if (time >= END_TIME) {
        state = 'done';
        onAction('play');
      }
      return;
    }

    if (state !== 'menu') return;
    const ease = 1 - Math.exp(-HOVER_EASE * delta);
    buttons.forEach((button, index) => {
      button.hover += ((index === selected ? 1 : 0) - button.hover) * ease;
      const scale = 1 + (HOVER_SCALE - 1) * button.hover;
      button.objects.forEach((object, i) => object.scale.copy(button.baseScales[i]).multiplyScalar(scale));
    });
    if (glove) glove.position.lerp(gloveTarget, ease);
  }

  return {
    scene,
    get camera() {
      return camera;
    },
    ready,
    resize,
    update,
    get active() {
      return active;
    },

    /**
     * Renders with the .blend's view transform (Khronos PBR Neutral), then
     * restores the renderer's own settings for the rest of the game.
     */
    render() {
      sky.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      const toneMapping = renderer.toneMapping;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.render(scene, camera);
      renderer.toneMapping = toneMapping;
    },

    /** Shows the title screen; `playIntro: false` goes straight to the menu. */
    show({ playIntro = true } = {}) {
      active = true;
      if (!mixer) return;
      if (playIntro) {
        state = 'intro';
        time = 0;
        seek(0);
      } else {
        enterMenu();
      }
    },

    hide() {
      active = false;
      canvas.style.cursor = '';
    },
  };
}

/**
 * The .blend's sky isn't a skybox: its world shader maps the image by
 * *camera* coordinates (Mapping: scale 0.8 × 2.32, offset 0.35, 0.06, then
 * a flat projection), so the clouds stay put on screen as the camera moves,
 * like a painted backdrop. This reproduces that mapping per pixel, along
 * with the world's saturation ×2 and strength 1.6, on a full-screen quad
 * drawn behind everything.
 */
function createSkyBackdrop() {
  const texture = new THREE.TextureLoader().load(SKY_URL);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Blender repeats the image, but the shot only ever showed its 4:3 middle;
  // widescreen windows see past that, where a repeat shows a hard seam.
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      inverseProjection: { value: new THREE.Matrix4() },
    },
    vertexShader: `
      varying vec2 vNdc;
      void main() {
        vNdc = position.xy;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform mat4 inverseProjection;
      varying vec2 vNdc;

      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
      }
      vec3 hsv2rgb(vec3 c) {
        vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
        return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
      }

      void main() {
        vec4 view = inverseProjection * vec4(vNdc, 1.0, 1.0);
        vec3 dir = normalize(view.xyz / view.w); // camera space, like Blender's
        vec2 uv = vec2(0.35, 0.06) + vec2(0.8, 2.32) * dir.xy;
        vec3 hsv = rgb2hsv(texture2D(map, uv).rgb);
        hsv.y = clamp(hsv.y * 2.0, 0.0, 1.0);
        gl_FragColor = vec4(hsv2rgb(hsv) * 1.6, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quad.renderOrder = -1; // before the scene, which then draws over it
  return quad;
}
