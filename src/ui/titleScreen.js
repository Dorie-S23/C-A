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

// The tent's dark doorway. The authored fly-in swings in an S (about a
// width left, then two right) and ends in the striped wall beside it, so
// from the bottom of the hill on its sideways drift is replaced by one
// smooth glide onto the doorway's centre line, and the shot fades to black
// as the camera reaches it.
const DOORWAY = 'Plane014';
const STEER_FROM = 38; // take over this many doorway-widths away, as the descent begins…
const STEER_TO = 6;    // …and be on the centre line, looking straight in, by this many
const FADE_FROM = 3;   // fade to black over the last this-many widths…
const FADE_TO = 0.3;   // …fully black this far out, before the frame's edges fill the view
const HOVER_SCALE = 1.08;
const HOVER_EASE = 12; // per second; how quickly a block grows/shrinks

// The glove's hop between buttons. Lengths are in "button spacings" (the
// distance from PLAY to OPTIONS), so they hold whatever the scene's scale.
const GLOVE_HOP_TIME = 0.3;       // seconds for a one-button hop; longer hops take a little longer
const GLOVE_ARC = 0.3;            // how far the path bows out sideways, per spacing travelled
const GLOVE_LEAN = 0.07;          // radians of tilt per spacing/second of vertical speed
const GLOVE_MAX_LEAN = 0.35;
const GLOVE_LEAN_SHARPNESS = 10;  // per second; how quickly the tilt follows (and settles back)
const GLOVE_BOB = 0.04;           // resting bob height, in spacings
const GLOVE_BOB_PERIOD = 1.6;     // seconds
const GLOVE_FOLLOW_SHARPNESS = 30; // per second; how tightly the glove trails the mouse
const GLOVE_LAYER = 1;             // drawn in its own pass, over the buttons (see render())

// Once the menu is live the sky drifts sideways and its clouds billow a
// little (see createSkyBackdrop). The intro keeps the still, authored shot.
const SKY_DRIFT_SPEED = 0.008;  // texture widths per second (the view spans ~0.8)
const SKY_EASE_IN = 2.5;        // seconds for the motion to build up to full speed

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
  const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_STRENGTH);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, SUN_STRENGTH);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(-100);
  scene.add(sun);
  // Lit the same in the glove's own pass (see render()).
  ambient.layers.enable(GLOVE_LAYER);
  sun.layers.enable(GLOVE_LAYER);

  // Replaced by the GLB's own camera once loaded.
  let camera = new THREE.PerspectiveCamera(31.4, 4 / 3, 0.1, 1000);
  let authoredFov = camera.fov;
  let authoredAspect = camera.aspect;
  let viewport = { width: 4, height: 3 };

  const sky = createSkyBackdrop();
  scene.add(sky);
  let skyMotion = 0; // 0 = the authored still sky, 1 = drifting at full speed
  let skyTime = 0;
  const fade = createFade();
  // Drawn in the glove's pass, the last one, so the fade covers it too.
  fade.layers.set(GLOVE_LAYER);
  scene.add(fade);

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
  let doorway = null;
  const doorwayCenter = new THREE.Vector3();
  const doorwayNormal = new THREE.Vector3(); // out of the tent, toward the camera's approach
  let doorwayWidth = 1;
  const steeredPosition = new THREE.Vector3();
  const doorwaySide = new THREE.Vector3(); // level, across the doorway
  let startSide = null; // sideways offset (in widths) when steering took over
  const authoredQuaternion = new THREE.Quaternion();
  const gloveRest = new THREE.Vector3(); // its position at HOLD_TIME, pointing at PLAY
  const gloveTarget = new THREE.Vector3();
  const gloveRestQuaternion = new THREE.Quaternion();
  const gloveFrom = new THREE.Vector3();
  const glovePath = new THREE.Vector3(); // where the hop has it this frame, before the bob
  const glovePrevPath = new THREE.Vector3();
  const gloveStep = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const leanRotation = new THREE.Quaternion();
  let gloveHop = 1; // 0 → 1 through the current hop; 1 = resting on a button
  let gloveHopTime = GLOVE_HOP_TIME;
  let gloveLean = 0;
  let gloveSettled = 1; // eases the resting bob in after a hop
  let gloveBobTime = 0;
  let buttonSpacing = 1;
  // The glove stands in for the mouse cursor: once the mouse moves, the
  // glove follows it with its fingertip on the pointer. Arrow keys switch
  // back to hopping between buttons.
  let followPointer = false;
  const pointerTarget = new THREE.Vector3(); // where the glove goes to put its fingertip on the pointer
  const fingertipOffset = new THREE.Vector3(); // glove origin minus fingertip, in its plane
  const glovePlane = new THREE.Plane();
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
      label: gltf.scene.getObjectByName(label),
      restScale: null, // the block's scale once it has settled, at HOLD_TIME
      objects: [block, label].map((name) => gltf.scene.getObjectByName(name)).filter(Boolean),
      baseScales: [],
      basePositions: [],
      pivots: [], // the block's centre, in each object's parent space
      offset: new THREE.Vector3(), // from PLAY's centre to this button's, for the glove
      hover: 0,
    })).filter((button) => button.block);
    glove = gltf.scene.getObjectByName(GLOVE);
    // Also on its own layer, for the pass that keeps it over the buttons.
    glove?.traverse((part) => part.layers.enable(GLOVE_LAYER));
    doorway = gltf.scene.getObjectByName(DOORWAY);

    for (const button of buttons) {
      // OPTIONS and QUIT share a material; each label toggles its own.
      if (button.label) button.label.material = button.label.material.clone();
    }
    seek(HOLD_TIME);
    for (const button of buttons) button.restScale = button.block.scale.clone();
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
    keepLabelsInFront();
  }

  /**
   * As each block pops in it overshoots, bulging deeper and wider than it
   * settles at while its label stays put, so for a moment the block's
   * surface swallows the lettering. Until a block has settled, draw its
   * label over it; after that, back to normal depth so the glove can still
   * pass in front.
   */
  function keepLabelsInFront() {
    for (const button of buttons) {
      if (!button.label || !button.restScale) continue;
      const popping = button.block.scale.distanceToSquared(button.restScale) > 1e-8;
      button.label.material.depthTest = !popping;
      button.label.renderOrder = popping ? 1 : 0; // after its block
    }
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
      button.basePositions = button.objects.map((object) => object.position.clone());
      const center = blockCenter(button);
      button.pivots = button.objects.map((object) => object.parent.worldToLocal(center.clone()));
      button.offset.subVectors(blockCenter(button), playCenter);
      button.hover = 0;
    }
    if (glove) {
      gloveRest.copy(glove.position);
      gloveRestQuaternion.copy(glove.quaternion);
      glovePath.copy(gloveRest);
      glovePrevPath.copy(gloveRest);
      gloveLean = 0;
      gloveSettled = 1;
    }
    if (buttons.length > 1) buttonSpacing = buttons[1].offset.length() || 1;
    camera.updateMatrixWorld();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    cameraForward.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate();
    if (glove) measureFingertip();
    followPointer = false;
    select(0);
  }

  function blockCenter(button) {
    return new THREE.Box3().setFromObject(button.block).getCenter(new THREE.Vector3());
  }

  function select(index, { moveGlove = true } = {}) {
    selected = index;
    // The glove is a root node, so its position is in world space.
    if (!glove || !moveGlove) return;
    followPointer = false;
    gloveTarget.copy(gloveRest).add(buttons[index].offset);
    gloveFrom.copy(glovePath);
    const hops = gloveFrom.distanceTo(gloveTarget) / buttonSpacing;
    gloveHop = hops < 0.01 ? 1 : 0;
    gloveHopTime = GLOVE_HOP_TIME * (0.7 + 0.3 * hops);
  }

  function activate(index) {
    const button = buttons[index];
    if (!button) return;
    if (button.action === 'play') {
      // The rest of the timeline is the glove clicking PLAY and the camera
      // flying into the tent; report PLAY once it's over.
      select(0);
      // Hand the glove back to the timeline upright and on PLAY.
      if (glove) glove.quaternion.copy(gloveRestQuaternion);
      state = 'outro';
      measureDoorway();
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
    const index = buttonAt(event.clientX, event.clientY); // also aims raycaster at the pointer
    if (glove && raycaster.ray.intersectPlane(glovePlane, pointerTarget)) {
      pointerTarget.add(fingertipOffset);
      followPointer = true;
    }
    if (index >= 0 && index !== selected) select(index, { moveGlove: !followPointer });
  }

  /**
   * Works out where the glove's fingertip is, relative to the glove, so the
   * fingertip can sit on the pointer. The glove points up and to the left,
   * so its fingertip is the top-left corner of its on-screen bounds. The
   * glove then moves in the plane through its resting spot, facing the
   * camera.
   */
  function measureFingertip() {
    glove.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(glove, true);
    let left = Infinity;
    let top = -Infinity;
    const corner = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      left = Math.min(left, corner.x);
      top = Math.max(top, corner.y);
    }
    glovePlane.setFromNormalAndCoplanarPoint(cameraForward, gloveRest);
    raycaster.setFromCamera(pointer.set(left, top), camera);
    const fingertip = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(glovePlane, fingertip)) fingertipOffset.subVectors(gloveRest, fingertip);
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

  /** Builds the sky's motion up from still once the menu is live. */
  function updateSky(delta) {
    if (state !== 'intro') skyMotion = Math.min(1, skyMotion + delta / SKY_EASE_IN);
    const eased = skyMotion * skyMotion * (3 - 2 * skyMotion);
    // Advancing by the eased rate (not scaling the clock) ramps the speed
    // up without the clouds jumping.
    skyTime += delta * eased;
    sky.material.uniforms.time.value = skyTime;
    sky.material.uniforms.drift.value = skyTime * SKY_DRIFT_SPEED;
    sky.material.uniforms.motion.value = eased;
  }

  function update(delta) {
    if (!active || !mixer) return;
    updateSky(delta);

    if (state === 'intro') {
      time += delta;
      if (time >= HOLD_TIME) enterMenu();
      else seek(time);
      return;
    }

    if (state === 'outro') {
      time += delta;
      seek(Math.min(time, END_TIME));
      steerIntoDoorway();
      if (time >= END_TIME) {
        state = 'done';
        setFade(1); // finish in the dark whatever the timing
        onAction('play');
      }
      return;
    }

    if (state !== 'menu') return;
    const ease = 1 - Math.exp(-HOVER_EASE * delta);
    buttons.forEach((button, index) => {
      button.hover += ((index === selected ? 1 : 0) - button.hover) * ease;
      const scale = 1 + (HOVER_SCALE - 1) * button.hover;
      // Grow the block and its label about the block's centre together. Each
      // around its own origin, the block's front face would push out past
      // the label sitting on it and swallow the lettering.
      button.objects.forEach((object, i) => {
        object.scale.copy(button.baseScales[i]).multiplyScalar(scale);
        object.position.copy(button.basePositions[i]).sub(button.pivots[i]).multiplyScalar(scale).add(button.pivots[i]);
      });
    });
    if (glove) updateGlove(delta, ease);
  }

  /** Finds the doorway's centre, size and outward facing, in world space. */
  function measureDoorway() {
    if (!doorway) return;
    doorway.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(doorway);
    box.getCenter(doorwayCenter);
    const size = box.getSize(new THREE.Vector3());
    doorwayWidth = Math.max(size.x, size.y, size.z) || 1;
    // The panel curves with the tent, so average all its normals for the
    // way it faces as a whole.
    const normals = doorway.geometry.attributes.normal;
    const normal = new THREE.Vector3();
    doorwayNormal.set(0, 0, 0);
    for (let i = 0; i < normals.count; i++) doorwayNormal.add(normal.fromBufferAttribute(normals, i));
    doorwayNormal.transformDirection(doorway.matrixWorld);
    // It leans back with the tent's slope; the way in is level, or the
    // centre line would come up out of the grass.
    doorwayNormal.y = 0;
    doorwayNormal.normalize();
    camera.updateWorldMatrix(true, false);
    const toCamera = camera.getWorldPosition(new THREE.Vector3()).sub(doorwayCenter);
    if (toCamera.dot(doorwayNormal) < 0) doorwayNormal.negate();
    doorwaySide.set(-doorwayNormal.z, 0, doorwayNormal.x);
    startSide = null;
  }

  /**
   * After the timeline has posed the camera, pulls it onto the doorway's
   * centre line and turns it to look straight in, more so the closer it
   * gets; then fades to black as it reaches the doorway.
   */
  function steerIntoDoorway() {
    if (!doorway) return;
    const position = camera.position; // the camera is a root node: world space
    const distance = position.distanceTo(doorwayCenter) / doorwayWidth;
    const steer = THREE.MathUtils.smoothstep(STEER_FROM - distance, 0, STEER_FROM - STEER_TO);

    const offset = steeredPosition.copy(position).sub(doorwayCenter);
    const along = offset.dot(doorwayNormal);
    const authoredSide = offset.dot(doorwaySide) / doorwayWidth;
    if (steer > 0) {
      // Ignore the authored drift from here: glide from where it was when
      // steering took over straight to the centre line, never past it.
      startSide ??= authoredSide;
      const side = startSide * (1 - steer);
      position.addScaledVector(doorwaySide, (side - authoredSide) * doorwayWidth);
      position.y += (doorwayCenter.y - position.y) * steer;
    }

    authoredQuaternion.copy(camera.quaternion);
    camera.lookAt(doorwayCenter);
    camera.quaternion.copy(authoredQuaternion).slerp(camera.quaternion, steer);
    camera.updateMatrixWorld();

    const outside = along / doorwayWidth;
    setFade(state === 'done' ? 1 : 1 - THREE.MathUtils.clamp((outside - FADE_TO) / (FADE_FROM - FADE_TO), 0, 1));
  }

  function setFade(opacity) {
    fade.material.uniforms.opacity.value = opacity;
    fade.visible = opacity > 0;
  }

  /**
   * Moves the glove along its hop like a hand rather than a slider: eased
   * in and out, bowing out sideways on the way, tilting into the direction
   * it's going, then bobbing gently while it rests on the button.
   */
  function updateGlove(delta, ease) {
    if (delta <= 0) return;
    glovePrevPath.copy(glovePath);
    if (followPointer) {
      glovePath.lerp(pointerTarget, 1 - Math.exp(-GLOVE_FOLLOW_SHARPNESS * delta));
    } else {
      gloveHop = Math.min(1, gloveHop + delta / gloveHopTime);
      const p = gloveHop < 0.5 ? 4 * gloveHop ** 3 : 1 - (-2 * gloveHop + 2) ** 3 / 2; // ease in-out
      const hopLength = gloveFrom.distanceTo(gloveTarget);
      glovePath.lerpVectors(gloveFrom, gloveTarget, p)
        .addScaledVector(cameraRight, Math.sin(Math.PI * p) * GLOVE_ARC * hopLength);
    }

    // Moving down the menu tips the fingers forward; moving up, back.
    const upSpeed = gloveStep.subVectors(glovePath, glovePrevPath).dot(cameraUp) / delta / buttonSpacing;
    const leanTarget = THREE.MathUtils.clamp(upSpeed * GLOVE_LEAN, -GLOVE_MAX_LEAN, GLOVE_MAX_LEAN);
    gloveLean += (leanTarget - gloveLean) * (1 - Math.exp(-GLOVE_LEAN_SHARPNESS * delta));
    glove.quaternion.copy(gloveRestQuaternion).premultiply(leanRotation.setFromAxisAngle(cameraForward, gloveLean));

    // Bob only while resting on a button, not while standing in for the cursor.
    gloveSettled += ((!followPointer && gloveHop >= 1 ? 1 : 0) - gloveSettled) * ease;
    gloveBobTime += delta;
    const bob = Math.sin((gloveBobTime / GLOVE_BOB_PERIOD) * Math.PI * 2) * GLOVE_BOB * buttonSpacing * gloveSettled;
    glove.position.copy(glovePath).addScaledVector(cameraUp, bob);
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
      const autoClear = renderer.autoClear;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.render(scene, camera);
      // The glove is the cursor, so it goes over the buttons: the buttons'
      // raised lettering would otherwise poke through the hand. A second
      // pass with the depth cleared draws it (and the fade) on top, while
      // its fingers still hide each other properly.
      renderer.autoClear = false;
      renderer.clearDepth();
      camera.layers.set(GLOVE_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(0);
      renderer.autoClear = autoClear;
      renderer.toneMapping = toneMapping;
    },

    /** Shows the title screen; `playIntro: false` goes straight to the menu. */
    show({ playIntro = true } = {}) {
      active = true;
      setFade(0);
      canvas.style.cursor = 'none'; // Kinger's glove is the cursor here
      if (!mixer) return;
      if (playIntro) {
        state = 'intro';
        time = 0;
        skyMotion = 0; // back to the authored still sky
        skyTime = 0;
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

/** A full-screen black layer drawn over the scene, for the fade into the tent. */
function createFade() {
  const material = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 } },
    vertexShader: `
      void main() {
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform float opacity;
      void main() {
        gl_FragColor = vec4(0.0, 0.0, 0.0, opacity);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quad.renderOrder = Infinity; // after everything else
  quad.visible = false;
  return quad;
}

/**
 * The .blend's sky isn't a skybox: its world shader maps the image by
 * *camera* coordinates (Mapping: scale 0.8 × 2.32, offset 0.35, 0.06, then
 * a flat projection), so the clouds stay put on screen as the camera moves,
 * like a painted backdrop. This reproduces that mapping per pixel, along
 * with the world's saturation ×2 and strength 1.6, on a full-screen quad
 * drawn behind everything. On top of that the menu adds motion the .blend
 * doesn't have: a sideways drift and a faint noise billow (time, drift and
 * motion uniforms, driven by updateSky).
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
      time: { value: 0 },   // seconds of sky motion, for the billow
      drift: { value: 0 },  // how far the clouds have slid, in texture widths
      motion: { value: 0 }, // 0..1 strength of the billow (0 = the still shot)
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
      uniform float time;
      uniform float drift;
      uniform float motion;
      varying vec2 vNdc;

      // Smooth value noise, a few octaves deep, for the billow.
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float sum = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          sum += amplitude * noise(p);
          p *= 2.0;
          amplitude *= 0.5;
        }
        return sum;
      }

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

        // Wind: the clouds slide right. The texture repeats mirrored, so
        // scrolling past its edge shows no seam.
        uv.x -= drift;
        // Billow: nudge each pixel by a slowly evolving noise field that
        // rides along with the clouds, so they churn as they drift
        // instead of sliding by like a flat picture.
        vec2 field = vec2(uv.x * 6.0, uv.y * 1.5);
        vec2 warp = vec2(
          fbm(field + vec2(0.0, time * 0.04)),
          fbm(field + vec2(5.2, 1.3) - vec2(time * 0.03, 0.0))) - 0.5;
        uv += warp * vec2(0.006, 0.012) * motion;

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
