import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { loadPomniRoom } from './rooms/pomniRoom.js';
import { loadDormHallRoom } from './rooms/dormHallRoom.js';
import { loadRibbitRoom } from './rooms/ribbitRoom.js';
import { loadTadcRoom } from './rooms/tadcRoom.js';
import { loadMazeRoom } from './rooms/mazeRoom.js';
import { loadKaufmoRoom } from './rooms/kaufmoRoom.js';
import { loadPomni } from './characters/pomni.js';
import { createPomniSpeaking } from './characters/pomniSpeaking.js';
import { OPENING_HANDOFF } from './cinematics/pomniOpening.js';
import { createOpeningAudio } from './cinematics/openingAudio.js';
import { createRagathaEntrance } from './cinematics/ragathaEntrance.js';
import { createJaxBedroomPass, JAX_PASS_BEAT, JAX_PASS_RESUME } from './cinematics/jaxBedroomPass.js';
import { POMNI_INVITATION, POMNI_SEATED_DIALOGUE, RAGATHA_ENTRANCE_EVENT } from './cinematics/pomniInvitation.js';
import { bendBone, SIDEWAYS } from './characters/bendBone.js';
import { preloadJaxHallwayCutscene, playJaxHallwayCutscene } from './cutscenes/jaxHallwayCutscene.js';
import { createCaineApproachCutscene } from './cutscenes/caineApproachCutscene.js';
import { preloadKaufmoHallwayCutscene, playKaufmoHallwayCutscene } from './cutscenes/kaufmoHallwayCutscene.js';
import { createDialogueUI } from './ui/DialogueUI.js';
import { createTitleScreen } from './ui/titleScreen.js';
import { resetEscapeThreshold } from './state/escapeThreshold.js';
import { createStoryProgress } from './game/storyProgress.js';
import { installGltfBlobCleanup, releaseTextures } from './rooms/assetLifecycle.js';
import { createLevel2Items, pickKaufmoScript, PHOTO_COUNT } from './state/level2Items.js';
import { runLevel1 } from './levels/level1.js';
import { runLevel2 } from './levels/level2.js';
import { createMinimap } from './ui/minimap.js';
import { createObjectiveController } from './game/objectives.js';
import { createObjectiveHUD } from './ui/objectiveHUD.js';
import { shouldShowObjective } from './ui/objectiveHUD.js';
import { createControlsTutorial } from './game/controlsTutorial.js';
import { createTutorialHUD } from './ui/tutorialHUD.js';
import { createActionCaptions } from './ui/actionCaptions.js';
import { createCaineConversation } from './game/caineConversation.js';
import {
  SPEAKERS, preLevel1Dialogue, level1OpenDialogue, level2OpeningDialogue, level1RibbitDialogue,
  level2HandIn1Dialogue, level2HandIn2Dialogue, level2HandIn3Dialogue, level2HandIn4Dialogue, level2HandIn5Dialogue,
  level2IdleDialogue, level2CompleteDialogue, level2PayoffDialogue,
  level2HallwayDialogue, level2RoomOpeningDialogue, ribbitFollowupDialogue,
} from './data/dialogues.js';

// Collision fires dozens of short rays a frame (wall probe, floor probes,
// body-overlap rings). Plain three.js tests a ray against every triangle of
// each candidate mesh, which makes walking crawl in dense rooms like Pomni's
// (~120k triangles, almost all of it around the player). A BVH per mesh lets
// each ray test only the handful of triangles near it. Meshes without one
// (skinned meshes) fall back to the regular raycast.
THREE.Mesh.prototype.raycast = acceleratedRaycast;
installGltfBlobCleanup(THREE.DefaultLoadingManager);

// Each preview plays over whichever room backdrop its own scene is set in.
const DIALOGUE_SCRIPTS = {
  preLevel1: { script: preLevel1Dialogue, room: 'pomni' },
  level1Open: { script: level1OpenDialogue, room: 'pomni' },
  level2Opening: { script: level2OpeningDialogue, room: 'kaufmo' },
  level2Hallway: { script: level2HallwayDialogue, room: 'dorm' },
  level2RoomOpening: { script: level2RoomOpeningDialogue, room: 'kaufmo' },
  ribbitFollowup: { script: ribbitFollowupDialogue, room: 'ribbit' },
  level1Ribbit: { script: level1RibbitDialogue, room: 'ribbit' },
  level2HandIn1: { script: level2HandIn1Dialogue, room: 'kaufmo' },
  level2HandIn2: { script: level2HandIn2Dialogue, room: 'kaufmo' },
  level2HandIn3: { script: level2HandIn3Dialogue, room: 'kaufmo' },
  level2HandIn4: { script: level2HandIn4Dialogue, room: 'kaufmo' },
  level2HandIn5: { script: level2HandIn5Dialogue, room: 'kaufmo' },
  level2Idle: { script: level2IdleDialogue, room: 'kaufmo' },
  level2Complete: { script: level2CompleteDialogue, room: 'kaufmo' },
  level2Payoff: { script: level2PayoffDialogue, room: 'kaufmo' },
};

const ROOM_LOADERS = {
  pomni: loadPomniRoom,
  tadc: loadTadcRoom,
  dorm: loadDormHallRoom,
  ribbit: loadRibbitRoom,
  maze: loadMazeRoom,
  kaufmo: loadKaufmoRoom,
};

const PLAYER_HEIGHT = 1.7;
// A dialogue preview's camera looks over Pomni's shoulder at whoever she's
// talking to; straight from behind, her hat hides them.
const PREVIEW_CAMERA_OFFSET = 0.5;
const PLAYER_RADIUS = 0.35;
// Faster than her Walk/Run clips are authored at (WALK_CLIP_SPEED/RUN_CLIP_SPEED);
// updatePomniWalk speeds the clips up to match, so her feet stay planted.
const WALK_SPEED = 4.2; // metres per second
const SPRINT_MULTIPLIER = 2.0; // running speed = WALK_SPEED × this
const WALL_MARGIN = 0.4; // keep the camera this far from any wall
const STEP_HEIGHT = 0.4; // ledges up to this tall are stepped onto; taller ones block
const PROBE_HEIGHT = STEP_HEIGHT + 0.05; // height of the wall-probe ray above the feet
// Body-overlap rings, above the feet. Only the shin ring lets ramp-like
// faces through: a ramp the player can really walk up is always further
// than PLAYER_RADIUS away at chest/head height, so anything that close up
// there is solid — like the steep lip around the lobby stage, which is
// sloped enough to pass as a "ramp" but far too high to step onto.
const BODY_RINGS = [
  { height: PROBE_HEIGHT, skipRamps: true },
  { height: 1.0, skipRamps: false },
  { height: PLAYER_HEIGHT - 0.1, skipRamps: false },
];
// The wall probe holds the player exactly PLAYER_RADIUS off walls; anything
// nearer than this means the body is overlapping geometry.
const BODY_CLEARANCE = PLAYER_RADIUS * 0.8;
// The wall probe must lead a full PLAYER_RADIUS of clearance *along its own
// ray*; for an oblique approach that lead is PLAYER_RADIUS / |dir·normal|,
// so this reach keeps everything down to about 70° off a wall's normal
// stopping cleanly (grazing steps change clearance only in millimetres).
const PROBE_LEAD = PLAYER_RADIUS / 0.35;
const GROUND_RAY_FAR = 24; // how far below the player a floor still counts as "under" them
const WALKABLE_NORMAL_Y = 0.6; // faces tilted further than this are ramps, not walls
const INTERACT_DISTANCE = 4.5; // how far away a door etc. can be used from
// A stalled tab or a slow asset decode can hand the next frame a multi-second
// delta; letting movement/collision use that raw value lets the player (or a
// hazard) cross a whole wall in one step. Clamping the step length is the
// standard fix — it trades perfect timing during a stall for never tunnelling.
const MAX_DELTA = 1 / 15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1d);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
const openingAudio = createOpeningAudio(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// For Pomni's room seen from the hall (bedroomClip, below).
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

// Generic studio reflections for rooms that ask for them (room.environment):
// metallic materials render black with nothing to reflect.
const environmentMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

// --- Player (Pomni) ---
// Stands in for the old first-person camera: position.y = feet + PLAYER_HEIGHT,
// so all the collision code below works unchanged.
const player = new THREE.Object3D();
scene.add(player);

let pomni = null;
let pomniMixer = null;
let pomniSpeaking = null;
const pomniActions = {}; // lower-cased clip name -> AnimationAction
let currentAction = null;
const pomniReady = loadPomni().then(({ pomni: model, animations }) => {
  pomni = model;
  pomniSpeaking = createPomniSpeaking(pomni);
  pomni.position.y = -PLAYER_HEIGHT; // feet on the floor
  player.add(pomni);

  if (animations.length > 0) {
    pomniMixer = new THREE.AnimationMixer(pomni);
    for (const clip of animations) pomniActions[clip.name.toLowerCase()] = pomniMixer.clipAction(clip);
    playAction('idle');
  }

  // Bones the staged gestures/poses bend (see applyStagePose); Mixamo's
  // "mixamorig:Name" loads as "mixamorigName".
  for (const name of Object.keys(pomniBones)) pomniBones[name] = pomni.getObjectByName(`mixamorig${name}`) ?? null;
  if (pomniBones.Hips) {
    pomni.updateMatrixWorld(true);
    pomniHipsHeight = pomniBones.Hips.getWorldPosition(new THREE.Vector3()).y - pomni.position.y;
  }
});
const pomniBones = {
  Hips: null, RightArm: null, RightForeArm: null,
  LeftUpLeg: null, RightUpLeg: null, LeftLeg: null, RightLeg: null,
};
let pomniHipsHeight = 0.8; // hips above her feet when standing; measured on load

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const roomPicker = document.getElementById('room-picker');
const dialoguePicker = document.getElementById('dialogue-picker');
const pauseMenu = document.getElementById('pause-menu');
const btnResume = document.getElementById('btn-resume');
const btnHome = document.getElementById('btn-home');
const btnTitle = document.getElementById('btn-title');
const crosshair = document.getElementById('crosshair');
const hint = document.getElementById('hint');
const interactPrompt = document.getElementById('prompt');
const cinematicSkip = document.getElementById('cinematic-skip');
const levelCompletePanel = document.getElementById('level-complete-panel');
const levelCompleteTitle = document.getElementById('level-complete-title');
const levelCompleteSubtitle = document.getElementById('level-complete-subtitle');
const btnLevelCompleteContinue = document.getElementById('btn-level-complete-continue');

const pictureCounter = document.getElementById('picture-counter');
const searchTimer = document.getElementById('search-timer');
const dialogueUI = createDialogueUI({ speakers: SPEAKERS });
const actionCaptions = createActionCaptions();
const minimap = createMinimap();
const objectives = createObjectiveController();
const objectiveHUD = createObjectiveHUD({ objectives, root: document.getElementById('objective-hud') });
const controlsTutorial = createControlsTutorial();
const tutorialHUD = createTutorialHUD({ tutorial: controlsTutorial, root: document.getElementById('tutorial-hud') });
let preLevel1Session = false;
let storySessionId = 0;
let morningDialoguePending = false;
const caineConversation = createCaineConversation({
  objectives, isStorySession: () => preLevel1Session,
  playDialogue: playRoomDialogue, showHint,
});
let currentRoom = null;
let currentRoomKey = null;
let currentRoomInfo = null; // the current room loader's full result (hallDoors etc.)
let roomPreload = null; // the room loading behind the open bedroom doorway (see updateHallLink)
let readyToPlay = false;
let hintTimeout = null;
// True only while the pause menu is actually up (pointer unlocked mid-room).
// Dialogue previews also run unlocked but aren't "paused" — their room's
// ambient animation (e.g. Caine's idle) should keep going.
let paused = false;
// Bumped on every selectRoom()/returnToHome() call so a load that finishes
// after the player has already moved on (or started another load) can tell
// it's stale and dispose itself instead of overwriting newer state.
let loadToken = 0;
let activeOpening = null;
let activeEntrance = null;
let activeJaxPass = null;
const activeCinematic = () => activeJaxPass?.active ? activeJaxPass : activeEntrance?.active ? activeEntrance : activeOpening;
let openingCompleted = false; // per new game; room previews do not start a game
let skipIntroRequested = false; // the Skip intro button, until play starts
let openingFrameProfile = { frames: 0, seconds: 0, maxSeconds: 0 };

const skippingCutscenes = () => skipIntroRequested || devSkipCutscenesInput.checked;

/**
 * While skipping, finishes whatever's playing as if it had played out:
 * a conversation runs to its end (cues, best answers, onComplete), and a
 * skippable cinematic skips its current part. Run every frame, so each
 * next part of a chain (opening -> dialogue -> entrance -> ...) goes too.
 */
function fastForwardCutscenes() {
  if (!skippingCutscenes() || paused) return;
  if (skipIntroRequested) cinematicSkip.hidden = true;
  if (dialogueUI.isActive) {
    dialogueUI.skipToEnd();
    return;
  }
  const cinematic = activeCinematic();
  if (cinematic?.active && cinematic.skippable) cinematic.skip();
}

function showHint(text, durationMs = 3000) {
  hint.textContent = text;
  hint.classList.add('visible');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => hint.classList.remove('visible'), durationMs);
}

roomPicker.querySelectorAll('button[data-room]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // don't also trigger the overlay's lock-on-click
    openingCompleted = false;
    resetObjectiveSession();
    selectRoom(button.dataset.room);
  });
});

dialoguePicker.querySelectorAll('button:not(#btn-level2)').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    // The story runs for real from the start; levels are played for real
    // (src/levels/); the rest are text previews.
    if ('story' in button.dataset) startNewGame();
    else if (button.dataset.mission) startMission(button.dataset.mission);
    else playDialoguePreview(button.dataset.dialogue);
  });
});

// Jumps straight to Level 2 for playtesting, skipping Level 1. Primes
// storyProgress through the same calls the real flow makes (Ribbit done)
// and then runs the real mission from its actual first beat — Kaufmo
// hurrying past in the Dorm Hall — rather than faking any later state.
document.getElementById('btn-level2').addEventListener('click', (event) => {
  event.stopPropagation();
  openingCompleted = false;
  resetObjectiveSession(true);
  itemState.reset();
  objectives.activate('find-ribbit');
  storyProgress.finishRibbit(4);
  titleScreen.hide();
  selectRoom('dorm', { onReady: () => playKaufmoHallway() });
});

btnResume.addEventListener('click', (event) => {
  event.stopPropagation();
  if (activeCinematic()?.active) { pauseOpening(false); return; }
  if (readyToPlay && currentRoom) renderer.domElement.requestPointerLock();
});

btnHome.addEventListener('click', (event) => {
  event.stopPropagation();
  returnToHome({ toRoomPicker: true });
});

btnTitle.addEventListener('click', (event) => {
  event.stopPropagation();
  returnToHome();
});

// --- Title screen ---
const titleOptions = document.getElementById('title-options');
const titleQuit = document.getElementById('title-quit');
const sensitivityInput = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivity-value');
const SENSITIVITY_KEY = 'tadc.mouseSensitivity';

const titleScreen = createTitleScreen({
  renderer,
  // Keys shouldn't drive the menu hidden behind an open panel.
  isBlocked: () => !titleOptions.hidden || !titleQuit.hidden || !creditsPanel.classList.contains('hidden'),
  onAction: (action) => {
    if (action === 'play') {
      startNewGame();
    } else if (action === 'options') {
      titleOptions.hidden = false;
    } else if (action === 'quit') {
      // Browsers only let a page close a tab that a script opened, so this
      // usually does nothing — the panel below is the real "quit" screen.
      window.close();
      titleQuit.hidden = false;
    }
  },
});
titleScreen.resize(window.innerWidth, window.innerHeight);

// Multiplies MOUSE_SENSITIVITY in the mouse-look handler.
let mouseSensitivityScale = 1;

function setSensitivity(value) {
  mouseSensitivityScale = value;
  sensitivityInput.value = value;
  sensitivityValue.textContent = `${value.toFixed(1)}×`;
}
try {
  setSensitivity(Number(localStorage.getItem(SENSITIVITY_KEY)) || 1);
} catch {
  setSensitivity(1);
}
sensitivityInput.addEventListener('input', () => {
  setSensitivity(Number(sensitivityInput.value));
  try {
    localStorage.setItem(SENSITIVITY_KEY, sensitivityInput.value);
  } catch {
    // Storage blocked (private window etc.) — the setting just won't persist.
  }
});
// Dev mode: open straight onto the room picker instead of playing the
// title intro every reload. Ticked in Options, or ?dev=1 / ?dev=0 in the URL; either
// way it's remembered in this browser.
const DEV_SKIP_INTRO_KEY = 'tadc.devSkipIntro';
const devSkipIntroInput = document.getElementById('dev-skip-intro');

function setDevSkipIntro(on) {
  devSkipIntroInput.checked = on;
  try {
    if (on) localStorage.setItem(DEV_SKIP_INTRO_KEY, '1');
    else localStorage.removeItem(DEV_SKIP_INTRO_KEY);
  } catch {
    // Storage blocked — it just won't persist past this page.
  }
}
const devParam = new URLSearchParams(window.location.search).get('dev');
if (devParam !== null) {
  setDevSkipIntro(devParam !== '0');
} else {
  try {
    devSkipIntroInput.checked = localStorage.getItem(DEV_SKIP_INTRO_KEY) === '1';
  } catch {
    devSkipIntroInput.checked = false;
  }
}
devSkipIntroInput.addEventListener('change', () => setDevSkipIntro(devSkipIntroInput.checked));

// Dev mode: fast-forward every cutscene and story conversation (see
// fastForwardCutscenes), straight to the gameplay after it. Remembered in
// this browser like the setting above.
const DEV_SKIP_CUTSCENES_KEY = 'tadc.devSkipCutscenes';
const devSkipCutscenesInput = document.getElementById('dev-skip-cutscenes');
try {
  devSkipCutscenesInput.checked = localStorage.getItem(DEV_SKIP_CUTSCENES_KEY) === '1';
} catch {
  devSkipCutscenesInput.checked = false;
}
devSkipCutscenesInput.addEventListener('change', () => {
  try {
    if (devSkipCutscenesInput.checked) localStorage.setItem(DEV_SKIP_CUTSCENES_KEY, '1');
    else localStorage.removeItem(DEV_SKIP_CUTSCENES_KEY);
  } catch {
    // Storage blocked — it just won't persist past this page.
  }
});

document.getElementById('btn-replay-intro').addEventListener('click', () => {
  titleOptions.hidden = true;
  titleScreen.show({ playIntro: true });
});
document.getElementById('btn-new-game').addEventListener('click', (event) => {
  event.stopPropagation();
  titleOptions.hidden = true;
  startNewGame();
});
document.getElementById('btn-room-previews').addEventListener('click', () => {
  titleOptions.hidden = true;
  titleScreen.hide();
  showRoomPicker();
});
// Skips the whole intro, not just the shot on screen: the opening, its
// dialogue, Ragatha's entrance and the morning conversation all
// fast-forward (completed, not cancelled) until play starts.
cinematicSkip.addEventListener('click', () => {
  if (paused) return;
  skipIntroRequested = true;
  cinematicSkip.hidden = true;
  fastForwardCutscenes();
});
document.getElementById('btn-options-credits').addEventListener('click', () => {
  creditsPanel.classList.remove('hidden');
});
document.getElementById('btn-options-back').addEventListener('click', () => {
  titleOptions.hidden = true;
});
document.getElementById('btn-quit-back').addEventListener('click', () => {
  titleQuit.hidden = true;
});

// Start on the title screen; fall back to the room picker if it can't load.
overlay.classList.add('loading');
overlayTitle.textContent = 'Loading…';
overlaySubtitle.textContent = '';
roomPicker.hidden = true;
dialoguePicker.hidden = true;
btnTitle.hidden = true;
// Dev mode skips the title screen altogether (it still loads behind, for
// the picker's "Back to title" button).
if (devSkipIntroInput.checked) showRoomPicker();
titleScreen.ready
  .then(() => {
    if (loadToken !== 0) return; // a room/new game has already superseded the title load
    if (devSkipIntroInput.checked) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('loading');
    titleScreen.show({ playIntro: true });
  })
  .catch((err) => {
    console.error('Failed to load title screen', err);
    if (loadToken === 0) showRoomPicker();
  });

/** The room/dialogue picker the PLAY button leads to. */
function showRoomPicker() {
  overlay.classList.remove('hidden');
  overlay.classList.remove('loading');
  overlayTitle.textContent = 'Choose a room';
  overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
  roomPicker.hidden = false;
  dialoguePicker.hidden = false;
  btnTitle.hidden = false;
  pauseMenu.hidden = true;
  crosshair.hidden = true;
}

/**
 * Tears down the current room and backs out of it — to the room picker
 * (pause menu's "Back to Home", since that's the hub a player actually
 * wants mid-session) or all the way to the title screen (the room
 * picker's own "Title screen" button, and the dialogue-preview escape
 * hatch below, which can fire before any room's ever been picked).
 */
function returnToHome({ toRoomPicker = false } = {}) {
  skipIntroRequested = false;
  dropRoomPreload();
  resetObjectiveSession();
  loadToken++; // invalidate dialogue callbacks before cancelling the old UI
  activeJaxPass?.dispose(); activeJaxPass = null;
  cancelCutscene();
  cancelLevelComplete();
  activeEntrance?.dispose(); activeEntrance = null;
  activeOpening = null;
  cinematicSkip.hidden = true;
  if (isLocked) document.exitPointerLock();
  if (dialogueUI.isActive) dialogueUI.cancel();
  minimap.hide();
  paused = false;
  caineArrivalIn = null;
  resetMoveState();
  resetStage();

  if (currentRoom) {
    scene.remove(currentRoom);
    disposeObject3D(currentRoom);
    currentRoom = null;
    currentRoomInfo = null;
    bounds = null;
  }

  // Reset all room state
  readyToPlay = false;
  colliders = [];
  collisionMeshes = [];
  dynamicCollisionMeshes = [];
  triggers = null;
  movers = [];
  hazards = [];
  roomUpdate = null;
  roomDialogueCue = null;
  roomTalkPartner = null;
  interactables = [];
  portals = [];
  focusedInteractable = null;
  interactPrompt.hidden = true;
  foundJax = false;
  reachedExit = false;
  caught = false;
  scene.environment = null;

  pauseMenu.hidden = true;
  crosshair.hidden = true;
  if (toRoomPicker) {
    showRoomPicker();
  } else {
    overlay.classList.add('hidden');
    titleScreen.show({ playIntro: false });
  }
}

/**
 * A fresh story run: the waking opening, Ragatha's morning conversation,
 * the Dorm Hall until Caine swoops in, then the knock at Ribbit's door.
 * PLAY, Options > New Game and the room picker's story
 * button all start here.
 */
function startNewGame() {
  skipIntroRequested = false;
  // Hidden score and Level 2's photos start over too.
  resetEscapeThreshold();
  itemState.reset();
  resetObjectiveSession(true);
  openingAudio.unlock();
  if (isLocked) document.exitPointerLock();
  titleScreen.hide();
  openingCompleted = false;
  selectRoom('pomni', { openingMode: 'play' });
}

function resetObjectiveSession(active = false) {
  storySessionId++;
  storyProgress.reset();
  cancelLevelComplete();
  caineConversation.cancelPending();
  preLevel1Session = active;
  morningDialoguePending = false;
  objectives.reset(); objectiveHUD.hide();
  controlsTutorial.reset(); tutorialHUD.hide();
}

/** Only story conversations use this: preview completion never awards progress. */
function playMorningDialogue(finish) {
  const token = loadToken, room = currentRoom;
  const valid = () => preLevel1Session && token === loadToken && room === currentRoom;
  const handlers = {
    onNode: node => room.userData.ragathaEntrance?.dialogueNode(node),
    onComplete: () => {
      if (!valid()) return;
      morningDialoguePending = false;
      objectives.activate('find-caine');
      controlsTutorial.unlock();
      finish();
    },
    onCancel: () => {
      if (!valid()) return;
      morningDialoguePending = true;
      showHint('Morning conversation interrupted. Press T in Pomni\'s room to retry.', 8000);
      finish();
    },
  };
  const canPass = room.userData.jaxCast && room.userData.dormHallPreview?.group.visible;
  function continueMorning() {
    if (!valid()) return;
    activeJaxPass = null; cinematicSkip.hidden = true;
    playRoomDialogue('preLevel1', { ...handlers, startAt: JAX_PASS_RESUME });
  }
  playRoomDialogue('preLevel1', { ...handlers, startAt: 'ragathaMorningGreeting',
    ...(canPass ? { stopAt: JAX_PASS_BEAT, onComplete: () => {
      if (!valid()) return;
      if (room.userData.jaxMorningPassed) { continueMorning(); return; }
      let audio;
      try {
        audio = openingAudio.createEntranceSession(room, { manual: true });
        activeJaxPass = createJaxBedroomPass({ room, cast: room.userData.jaxCast,
          audio, onComplete: continueMorning });
        room.userData.jaxMorningPassed = true;
        cinematicSkip.hidden = false;
      } catch (error) {
        audio?.dispose();
        console.warn('Jax pass unavailable; continuing morning conversation.', error);
        continueMorning();
      }
    } } : {}),
  });
}

function pauseOpening(value) {
  const cinematic = activeCinematic();
  if (!cinematic?.active) return;
  paused = value;
  activeOpening?.setPaused(value);
  activeEntrance?.setPaused(value);
  activeJaxPass?.setPaused(value);
  dialogueUI.setPaused(value);
  if (!value) clock.getDelta(); // a background-tab pause must not fast-forward on resume
  resetMoveState();
  cinematicSkip.hidden = value || !(cinematic.skippable ?? cinematic.phase === 'playing');
  overlay.classList.toggle('hidden', !value);
  overlayTitle.textContent = 'Paused';
  overlaySubtitle.textContent = 'Resume the opening or return to the title screen';
  pauseMenu.hidden = !value;
}

function handoffOpening() {
  const { x, y, z, yaw, idleTime } = OPENING_HANDOFF;
  openingCompleted = true;
  resetMoveState();
  floorY = y;
  player.position.set(x, y + PLAYER_HEIGHT, z);
  player.visible = true;
  pomni.position.set(0, -PLAYER_HEIGHT, 0);
  pomni.rotation.set(0, yaw, 0);
  pomni.visible = true;
  animSpeed = walkPhase = walkAmount = 0;
  pomniMixer?.stopAllAction();
  const idle = pomniActions.idle;
  if (idle) {
    idle.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    idle.time = idleTime; currentAction = idle; pomniMixer.update(0);
  }
  cameraYaw = yaw - Math.PI;
  cameraPitch = DEFAULT_PITCH;
  currentCameraDistance = CAMERA_DISTANCE;
  cinematicSkip.hidden = true;
}

function completeOpening() {
  const coordinated = activeOpening?.coordinated;
  activeOpening = null;
  if (currentRoom?.userData.afterPomniStanding) {
    currentRoom.userData.afterPomniStanding();
    return;
  }
  if (coordinated) {
    cinematicSkip.hidden = !activeEntrance?.skippable;
    return; // Ragatha retains the camera and owns the eventual gameplay release.
  }
  readyToPlay = false;
  paused = false;
  resetMoveState();
  overlay.classList.add('hidden');
  const token = loadToken;
  if (currentRoom?.userData.openingInvitationCancelled) {
    resumeOpeningGameplay(token);
    showHint('Morning conversation interrupted. Press T to continue.', 8000);
    return;
  }
  dialogueUI.play(POMNI_INVITATION, {
    onComplete: () => finishOpeningInvitation(token, false),
    onCancel: () => finishOpeningInvitation(token, true),
  });
}

function seatedOpeningDialogue() {
  const token = loadToken;
  readyToPlay = false; resetMoveState();
  dialogueUI.play(POMNI_SEATED_DIALOGUE, {
    onComplete: () => finishOpeningInvitation(token, false),
    onCancel: () => finishOpeningInvitation(token, true),
  });
}

function finishOpeningInvitation(token, cancelled) {
  if (token !== loadToken || currentRoomKey !== 'pomni') return;
  if (cancelled && activeOpening?.phase === 'seated') {
    currentRoom.userData.openingInvitationCancelled = true;
    morningDialoguePending = true;
    activeOpening.skip(); // Stand and blend to gameplay before offering T retry.
    cinematicSkip.hidden = true;
    return;
  }
  if (cancelled) {
    morningDialoguePending = true;
    showHint('Morning conversation interrupted. Press T to continue.', 8000);
  }
  // The active bedroom entrance claims this hook; cancellation resumes play.
  if (!cancelled) {
    const event = new CustomEvent(RAGATHA_ENTRANCE_EVENT, { cancelable: true,
      detail: { resumeGameplay: () => resumeOpeningGameplay(token) } });
    if (!window.dispatchEvent(event)) return;
  }
  resumeOpeningGameplay(token);
}

function resumeOpeningGameplay(token) {
  if (token !== loadToken || currentRoomKey !== 'pomni') return;
  skipIntroRequested = false;
  readyToPlay = true;
  paused = false;
  resetMoveState();
  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'Click to Play';
  overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact';
}

window.addEventListener(RAGATHA_ENTRANCE_EVENT, (event) => {
  if (currentRoomKey !== 'pomni' || !currentRoom || readyToPlay
    || !['done', 'seated'].includes(currentRoom.userData.pomniOpening?.phase)
    || currentRoom.userData.ragathaEntranceStarted) return;
  event.preventDefault(); // Claim synchronously before the invitation falls through.
  const token = loadToken, room = currentRoom;
  room.userData.ragathaEntranceStarted = true;
  const stillHere = () => token === loadToken && currentRoom === room;
  const resume = () => {
    if (!stillHere()) return;
    activeEntrance = null; cinematicSkip.hidden = true;
    event.detail.resumeGameplay();
  };
  const dialogue = (finish) => {
    if (!stillHere()) return;
    cinematicSkip.hidden = true;
    playMorningDialogue(() => {
      if (!stillHere()) return;
      finish(); cinematicSkip.hidden = !activeEntrance?.skippable;
    });
  };
  readyToPlay = false; resetMoveState();
  try {
    let audio = null;
    try { audio = openingAudio.createEntranceSession(room, { manual: Boolean(room.userData.ragathaCast) }); }
    catch (error) { console.warn('Temporary entrance audio unavailable.', error); }
    try {
      activeEntrance = createRagathaEntrance({
        room: { group: room, spawn: new THREE.Vector3(OPENING_HANDOFF.x, OPENING_HANDOFF.y, OPENING_HANDOFF.z), collisionMeshes, interactables },
        camera, resolveCamera: resolveOpeningCamera, audio, cast: room.userData.ragathaCast,
        ...(activeOpening?.phase === 'seated' ? {
          onDoorOpening: () => activeOpening?.resumeForEntrance(),
          canStartDialogue: () => !activeOpening?.active,
          onSkipOpening: () => activeOpening?.skip(),
          advanceOpening: dt => activeOpening?.update(dt),
        } : {}),
        onDialogue: dialogue, onComplete: resume,
      });
    } catch (error) { audio?.dispose(); throw error; }
    room.userData.ragathaEntrance = activeEntrance;
    dynamicCollisionMeshes = collisionMeshes.filter(entry => entry.dynamic);
    cinematicSkip.hidden = false;
    clock.getDelta();
  } catch (error) {
    console.warn('Staged entrance unavailable; continuing with morning dialogue.', error);
    if (activeOpening?.phase === 'seated') {
      room.userData.afterPomniStanding = () => { delete room.userData.afterPomniStanding; if (stillHere()) dialogue(resume); };
      activeOpening.skip();
    } else dialogue(resume);
  }
});

// While set, animate() renders this instead of the normal scene/camera —
// see runCutscene() and the render branch below.
let activeCutscene = null;

/**
 * Hands the render loop over to a cutscene (e.g. Jax's hallway run) until
 * it reports itself done, then calls onDone — typically to resume
 * whatever dialogue/preview was paused for it.
 */
function runCutscene(cutscene, onDone) {
  cancelCutscene();
  if (skippingCutscenes()) {
    cutscene.cleanup?.();
    onDone();
    return;
  }
  activeCutscene = { update: cutscene.update, onDone, cancel: cutscene.cancel ?? cutscene.cleanup };
}

function cancelCutscene() {
  const previous = activeCutscene;
  activeCutscene = null;
  previous?.cancel?.();
}

/** An awaited hallway cutaway, cancelled with its owning dialogue or room. */
function withHallwayCutscene(key, baseOnNode) {
  const jax = key === 'preLevel1';
  if (!jax && key !== 'level2Opening' && key !== 'level2Hallway') return baseOnNode;
  const token = loadToken;
  let triggered = false;
  return (node) => {
    const base = baseOnNode?.(node);
    if (skippingCutscenes()) return base;
    if (triggered || node.id !== (jax ? 'jaxPassByText' : 'kaufmoHurriesBy')) return base;
    triggered = true;
    const dialogue = dialogueGeneration;
    return (async () => {
      await base;
      let assets;
      try { assets = await (jax ? preloadJaxHallwayCutscene() : preloadKaufmoHallwayCutscene()); }
      catch (error) { console.warn('Hallway scene unavailable; continuing dialogue.', error); return; }
      if (!assets) return;
      if (token !== loadToken || dialogue !== dialogueGeneration || !dialogueUI.isActive) {
        disposeObject3D(assets.scene); return;
      }
      await new Promise(resolve => {
        const finish = () => { disposeObject3D(assets.scene); resolve(); };
        const cutscene = jax ? playJaxHallwayCutscene(renderer, assets) : playKaufmoHallwayCutscene(renderer, assets);
        runCutscene({ ...cutscene, cancel: finish }, finish);
      });
    })();
  };
}

/**
 * Loads a room as a backdrop and plays a dialogue script over it instead
 * of the usual "Click to Play" prompt. The pointer is never locked during
 * this, so WASD/mouse-look stay inert for free — the same "locks movement"
 * behaviour the plan calls for NPC interaction, achieved without a
 * separate guard.
 *
 * The Pre-Level-1/Level-1 scripts preview over Pomni's Room rather than the
 * circus map they're actually set in: the circus map currently takes 60+
 * seconds to become responsive (tracked separately, unrelated to dialogue),
 * which made every preview click look hung. Swap back once that's fixed.
 *
 * The room is told which script it's backing (`preview`), so it can stage
 * the scene for it: Pomni's Room swaps Caine for Ragatha in Pre-Level 1.
 * A room that does returns `onDialogueNode`, which follows the script's
 * `anim` cues, and `talkPartner`, who Pomni turns to face.
 */
function playDialoguePreview(key) {
  const entry = DIALOGUE_SCRIPTS[key];
  if (!entry) return;
  resetObjectiveSession();
  titleScreen.hide();
  openingCompleted = false;
  selectRoom(entry.room, {
    preview: key,
    onReady() {
      overlay.classList.add('hidden');
      readyToPlay = false;
      if (roomTalkPartner) turnPomniTowards(roomTalkPartner, PREVIEW_CAMERA_OFFSET);
      playRoomDialogue(key, {
        onNode: roomDialogueCue,
        onComplete() {
          roomDialogueCue?.(null);
          readyToPlay = true;
          overlay.classList.remove('hidden');
          overlayTitle.textContent = 'Click to Play';
          overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
        },
        onCancel: () => returnToHome(),
      });
    },
  });
}

// Pre-Level 1 in the story: once Pomni's in the Dorm Hall looking for
// Caine, she gets this long to look around before he swoops in (counted
// only while she's actually free to roam: not paused, talking or staged).
const CAINE_ARRIVAL_SECONDS = 10;
let caineArrivalIn = null; // seconds left, or null when he isn't due

function caineArrivesInHall() {
  return preLevel1Session && objectives.active?.id === 'find-caine';
}

function armCaineArrival() {
  caineArrivalIn = caineArrivesInHall() ? CAINE_ARRIVAL_SECONDS : null;
}

function updateCaineArrival(deltaSeconds) {
  if (caineArrivalIn === null) return;
  if (currentRoomKey !== 'dorm' || !caineArrivesInHall()) { caineArrivalIn = null; return; }
  if (!isLocked || !readyToPlay || paused || dialogueUI.isActive || activeCutscene || stageBusy()) return;
  caineArrivalIn -= deltaSeconds;
  if (caineArrivalIn <= 0) {
    caineArrivalIn = null;
    triggerCaineArrival();
  }
}

/**
 * Caine swoops in to Pomni, gives his warning (level1Open) and flies off;
 * that completes "Find Caine" and enables the knock at Ribbit's door.
 * Backing out of his warning with Escape just sends him
 * off for now: he comes back after another CAINE_ARRIVAL_SECONDS.
 */
function triggerCaineArrival() {
  const token = loadToken;
  const stillHere = () => token === loadToken && currentRoomKey === 'dorm' && caineArrivesInHall();
  const warned = () => {
    objectives.complete('find-caine');
    objectives.activate('find-ribbit');
    showHint('Knock on Ribbit’s door at the far end of the hall, on the left.', 6500);
  };
  if (skippingCutscenes()) {
    warned();
    return;
  }
  stage.hold(true);
  resetMoveState();
  const cutscene = createCaineApproachCutscene({
    scene,
    camera,
    player,
    pomni,
    renderer,
    dialogueUI,
    dispose: disposeObject3D,
    clearance: cameraCollisionDistance,
    onComplete: () => {
      stage.hold(false);
      if (stillHere()) warned();
    },
    onCancel: () => {
      stage.hold(false);
      if (stillHere()) armCaineArrival();
    },
  });
  runCutscene(cutscene, () => {});
}

/**
 * Plays a dialogue script as an in-world NPC conversation, triggered by a
 * room's own interactable (see kaufmoRoom.js). Unlike playDialoguePreview,
 * the pointer stays locked the whole time — movement and look are frozen
 * by the dialogueUI.isActive checks in animate()/updateInteractionFocus()/
 * the mousemove listener instead of actually releasing the pointer, so
 * control comes back the instant the conversation ends or is cancelled
 * with no extra state to restore.
 *
 * With `lookAt` (the NPC's position), Pomni turns to face whoever she's
 * talking to, with the camera swung round behind her. The callbacks pass
 * straight through to DialogueUI: onComplete for a finished conversation,
 * onCancel for one abandoned with Escape, onChoice for each option picked,
 * distressFor to shake/tint a line by how upset its speaker is (0-3),
 * onNode for each node as it's shown (to act out its `action`), and
 * startAt/stopAt to play only part of the script (see createDialogueEngine).
 *
 * @param {string} key a DIALOGUE_SCRIPTS key
 * @param {{ lookAt?: THREE.Vector3, onChoice?: (option, nextNode) => void,
 *   onComplete?: () => void, onCancel?: () => void,
 *   distressFor?: (lineNode) => number, onNode?: (node) => void,
 *   startAt?: string, stopAt?: string }} [options]
 */
let dialogueGeneration = 0;
function playRoomDialogue(key, {
  lookAt, onChoice, onComplete, onCancel, distressFor, lineFor, onNode, startAt, stopAt,
} = {}) {
  const entry = DIALOGUE_SCRIPTS[key];
  if (!entry || dialogueUI.isActive) return false;
  const generation = ++dialogueGeneration;
  const token = loadToken;
  const finish = callback => () => {
    if (generation !== dialogueGeneration) return;
    dialogueGeneration++;
    cancelCutscene();
    if (token === loadToken) callback?.();
  };
  resetMoveState();
  if (lookAt) turnPomniTowards(lookAt);
  dialogueUI.play(entry.script, {
    onChoice, onComplete: finish(onComplete), onCancel: finish(onCancel), distressFor, lineFor, startAt, stopAt,
    onNode: withHallwayCutscene(key, onNode),
  });
  return true;
}

// --- Missions: levels that run across rooms (src/levels/) ---
// A room picked from the list is just a place to explore; a mission is the
// level played for real, moving through whichever rooms its story needs
// and driving them with the API below.

const MISSIONS = {
  level1: runLevel1,
  level2: runLevel2,
};

const missionApi = {
  /** Loads a room from the menus (Click to Play); resolves with the loaded room. */
  enterRoom(roomKey) {
    return selectRoom(roomKey, {
        from: currentRoomKey,
        onReady: (room) => {
          if (isLocked) {
            overlay.classList.add('hidden');
          } else {
            overlayTitle.textContent = 'Click to Play';
            overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
          }
        },
      });
  },
  /** Moves to another room mid-mission, keeping the mouse captured (like a portal). */
  travel(roomKey) {
    overlay.classList.remove('hidden');
    return missionApi.enterRoom(roomKey);
  },
  /** Adds an E-interaction to the current room (cleared on the next room change). */
  addInteractable(interactable) {
    interactables.push(interactable);
  },
  playDialogue: playRoomDialogue,
  endLevel: (title, subtitle) => endLevel(title, subtitle),
  showHint,
  showLevelComplete,
  isRoom: room => currentRoom === room.group,
  get token() { return loadToken; },
  get session() { return storySessionId; },
  get stage() {
    return stage;
  },
};

function startMission(key) {
  resetObjectiveSession();
  titleScreen.hide();
  MISSIONS[key]?.(missionApi);
}

function attachStoryInteractions(room, roomKey, token) {
  if (!preLevel1Session || roomKey !== 'dorm') return;
  const control = room.hallDoors?.ribbit?.control;
  if (!control) return;
  room.interactables = room.interactables.filter(i => !i.storyKnock);
  const current = () => token === loadToken && preLevel1Session;
  // The ordinary door remains operable after this encounter is complete.
  control.interactable.enabled = () => current() && storyProgress.ribbitComplete;
  if (room.hallDoors.ribbit.portal) {
    room.hallDoors.ribbit.portal.enabled = () => storyProgress.ribbitComplete;
  }
  room.interactables.push({
    storyKnock: true,
    objects: control.interactable.objects, anchor: control.interactable.anchor,
    radius: control.interactable.radius,
    enabled: () => current() && !storyProgress.ribbitComplete,
    prompt: () => objectives.active?.id === 'find-ribbit' ? 'Knock on Ribbit’s door' : 'Ribbit’s room',
    interact() {
      if (!current()) return;
      if (objectives.active?.id !== 'find-ribbit') {
        showHint('Speak with Caine before checking on Ribbit.', 4000);
        return;
      }
      runLevel1(missionApi, { hall: room, story: true, onComplete: points => storyProgress.finishRibbit(points) });
    },
  });
}

function playKaufmoHallway() {
  overlay.classList.add('hidden');
  runLevel2(missionApi, {
    onHallway: () => storyProgress.finishHallway(),
    onIntroduced: () => storyProgress.finishKaufmoIntro(),
  });
}

function talkToKaufmo(lookAt, token) {
  if (token !== loadToken || currentRoomKey !== 'kaufmo' || dialogueUI.isActive) return false;
  const valid = () => token === loadToken && currentRoomKey === 'kaufmo';
  if (preLevel1Session && !storyProgress.ribbitComplete) {
    showHint('Check on Ribbit first. Kaufmo can wait here.', 4500);
    return false;
  }
  if (preLevel1Session && !storyProgress.kaufmoIntroduced) {
    return playRoomDialogue('level2RoomOpening', {
      lookAt,
      async onComplete() {
        if (!valid() || !storyProgress.finishKaufmoIntro()) return;
        if (itemState.heldCount()) showHint('You already have a photo. Talk to Kaufmo again to show him.', 6000);
        // The search starts in the Dorm Hall, not wherever Kaufmo's room
        // door happens to leave her — missionApi.travel already shows the
        // normal "Loading…" overlay while the room comes in.
        await missionApi.travel('dorm');
      },
    });
  }
  const key = pickKaufmoScript(itemState);
  storyProgress.presentedPhotos(itemState.totalPresented());
  if (key.startsWith('level2HandIn')) openingAudio.playChime('handIn');
  return playRoomDialogue(key === 'level2Opening' ? 'level2RoomOpening' : key, {
    lookAt,
    onComplete() {
      if (!valid()) return;
      if (key === 'level2Payoff' && !itemState.isDone()) {
        if (preLevel1Session) objectives.complete('check-kaufmo');
        itemState.markDone();
        void finishKaufmoLevel(token);
      }
    },
  });
}

async function finishKaufmoLevel(token) {
  const title = 'Level 2 Complete';
  const subtitle = "Five photos, one real room — and a door that isn't what it says it is. More coming soon — thanks for playing!";
  if (!await showLevelComplete(title, subtitle, { resume: false }) || token !== loadToken) return;
  endLevel(title, subtitle);
}

/**
 * Turns Pomni to face a point, with the camera swung round behind her —
 * or, with `cameraOffset` (radians), round that far to one side of her.
 */
function turnPomniTowards(point, cameraOffset = 0) {
  const dx = point.x - player.position.x;
  const dz = point.z - player.position.z;
  pomni.rotation.y = Math.atan2(dx, dz);           // her model faces +Z
  cameraYaw = Math.atan2(-dx, -dz) + cameraOffset; // camera behind her, looking the same way
  cameraPitch = DEFAULT_PITCH;
}

// --- Level 2 item collection -------------------------------------------
// One shared instance survives room changes and menu visits; PLAY resets it.
const itemState = createLevel2Items({
  onCollect: (count) => {
    showHint(`Picked up a photo. (${count}/${PHOTO_COUNT})`);
    // The clock is for finding them, not for the walk back to hand them
    // in — once all of them are actually in hand, stop it right there.
    if (count >= PHOTO_COUNT) searchTimeLeft = null;
  },
});
const storyProgress = createStoryProgress({ objectives, isStorySession: () => preLevel1Session });

// The photo search times out before all 3 are found and handed in: a
// "LEVEL 2 FAILED" card (see restartPhotoSearch) and a restart (new spots,
// same objective, back to Kaufmo's door) — not yet the real "abstraction"
// fail effect, which is a later pass. Armed/disarmed reactively off the
// objective itself, rather than at each of the several places
// 'collect-photos' starts or ends, so it can't drift out of sync with it.
const SEARCH_TIMER_SECONDS = 180;
let searchTimeLeft = null; // seconds left, or null while it isn't the active objective
objectives.subscribe((active) => {
  searchTimeLeft = active?.id === 'collect-photos' ? SEARCH_TIMER_SECONDS : null;
});

function updateSearchTimer(deltaSeconds) {
  if (searchTimeLeft === null) return;
  if (!isLocked || !readyToPlay || paused || dialogueUI.isActive || activeCutscene || stageBusy()) return;
  searchTimeLeft -= deltaSeconds;
  if (searchTimeLeft <= 0) {
    searchTimeLeft = null;
    restartPhotoSearch();
  }
}

async function restartPhotoSearch() {
  const token = loadToken;
  const continued = await showLevelComplete(
    'LEVEL 2 FAILED',
    "Time's up — the photos are still out there, and Kaufmo's done waiting. The search starts over.",
    { resume: false, chime: 'fail' },
  );
  if (!continued || token !== loadToken) return; // the player had already moved on by the time this landed
  itemState.reset();
  await missionApi.travel('kaufmo');
}

function updatePictureCounter() {
  // Only free exploration shows the HUD, including between room visits.
  const visible = (!preLevel1Session || storyProgress.kaufmoIntroduced)
    && isLocked && readyToPlay && !paused && !dialogueUI.isActive
    && !activeCutscene && !activeCinematic()?.active && !stageBusy() && !titleScreen.active
    && overlay.classList.contains('hidden') && controlsPanel.hidden
    && creditsPanel.classList.contains('hidden');
  if (pictureCounter.hidden === visible) pictureCounter.hidden = !visible;

  // Handed-in pictures still count as found. Only update the live region
  // when its text changes, rather than announcing it every animation frame.
  const text = `Pictures found: ${itemState.totalFound()}/${PHOTO_COUNT}`;
  if (pictureCounter.textContent !== text) pictureCounter.textContent = text;

  const timerVisible = visible && searchTimeLeft !== null;
  if (searchTimer.hidden === timerVisible) searchTimer.hidden = !timerVisible;
  if (timerVisible) {
    const seconds = Math.max(0, Math.ceil(searchTimeLeft));
    const timerText = `Time left: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (searchTimer.textContent !== timerText) searchTimer.textContent = timerText;
  }
}

function leaveCurrentRoom({ keepMoving = false, keepRoom = false } = {}) {
  objectiveHUD.hide();
  caineConversation.cancelPending();
  activeJaxPass?.dispose(); activeJaxPass = null;
  dropRoomPreload();

  activeEntrance?.dispose(); activeEntrance = null;
  // Invalidate callbacks before cancelling a dialogue owned by the old room.
  cancelLevelComplete();
  const myToken = ++loadToken; // any older in-flight load becomes stale the instant this fires
  cancelCutscene();
  if (dialogueUI.isActive) dialogueUI.cancel();
  activeOpening = null;
  cinematicSkip.hidden = true;
  paused = false;
  if (!keepMoving) resetMoveState();
  resetStage();

  if (currentRoom) {
    scene.remove(currentRoom);
    if (!keepRoom) disposeObject3D(currentRoom);
    currentRoom = null;
    currentRoomInfo = null;
    bounds = null;
  }

  readyToPlay = false;
  colliders = [];
  collisionMeshes = [];
  triggers = null;
  movers = [];
  hazards = [];
  roomUpdate = null;
  roomDialogueCue = null;
  roomTalkPartner = null;
  interactables = [];
  portals = [];
  focusedInteractable = null;
  interactPrompt.hidden = true;
  foundJax = false;
  reachedExit = false;
  caught = false;
  return myToken;
}

/** What every room loader is handed. */
function roomLoadOptions(roomKey, { from, preview, openingMode }) {
  return {
    from, playDialogue: playRoomDialogue, preview, endLevel, stage, items: itemState, travel: travelTo,
    objectives, showLevelComplete, playChime: openingAudio.playChime,
    ribbitStory: {
      complete: () => storyProgress.ribbitComplete,
      points: () => storyProgress.ribbitPoints,
    },
    kaufmoStory: {
      introduced: () => !preLevel1Session || storyProgress.kaufmoIntroduced,
      talk: lookAt => talkToKaufmo(lookAt, loadToken),
    },
    openingMode: openingMode ?? (roomKey === 'pomni' && from && openingCompleted ? 'settled' : undefined),
  };
}

function selectRoom(roomKey, { onReady, from, openingMode, preview } = {}) {
  const loadRoom = ROOM_LOADERS[roomKey];
  if (!loadRoom) return;
  const myToken = leaveCurrentRoom();
  roomPicker.hidden = true;
  dialoguePicker.hidden = true;
  btnTitle.hidden = false; // allow cancellation even while the GLBs are loading
  pauseMenu.hidden = true;
  overlay.classList.add('loading');
  overlay.classList.remove('hidden');
  // Otherwise she stands alone in the void behind the loading screen.
  player.visible = false;
  overlayTitle.textContent = 'Loading…';
  overlaySubtitle.textContent = 'Fetching room model (0%)';

  return Promise.all([
    loadRoom((ratio, stage) => {
      if (myToken !== loadToken) return; // a newer selectRoom()/returnToHome() superseded this one
      overlaySubtitle.textContent = `Fetching ${stage === 'opening' ? 'opening animation' : 'room model'} (${Math.round(ratio * 100)}%)`;
    }, roomLoadOptions(roomKey, { from, preview, openingMode })),
    pomniReady,
  ])
    .then(([result]) => {
      if (myToken !== loadToken) {
        // Something else was picked (or Home was hit) before this load
        // finished. Attaching it now would silently resurrect a room over
        // whatever the player actually asked for, so throw it away instead.
        disposeObject3D(result.group);
        return null;
      }
      currentRoomInfo = result;
      applyLoadedRoom(result, onReady && (() => onReady(result)), roomKey, openingMode === 'play');
      if (roomKey === 'dorm') armCaineArrival();
      if (preLevel1Session && roomKey === 'dorm' && from === 'ribbit' && storyProgress.hallwayPending) {
        playKaufmoHallway(myToken);
      }
      return result;
    })
    .catch((err) => {
      if (myToken !== loadToken) return; // superseded — the active room already shows its own state
      console.error('Failed to load room model', err);
      overlayTitle.textContent = 'Failed to load room';
      overlaySubtitle.textContent = 'Check the browser console for details.';
      roomPicker.hidden = false;
      dialoguePicker.hidden = false;
      btnTitle.hidden = false;
      overlay.classList.remove('loading');
      return null;
    });
}

function applyLoadedRoom({
  group,
  bounds: box,
  spawn,
  spawnFacing,
  colliders: roomColliders,
  collisionMeshes: roomCollisionMeshes,
  triggers: roomTriggers,
  movers: roomMovers,
  hazards: roomHazards,
  update: roomUpdateFn,
  onDialogueNode,
  talkPartner,
  interactables: roomInteractables,
  portals: roomPortals,
  mapMarkers,
  warmUp,
  environment: wantsEnvironment,
  lighting: roomLighting,
  opening: roomOpening,
  openingError,
}, onReady, roomKey, playOpening = false) {
  attachStoryInteractions(currentRoomInfo, roomKey, loadToken);
  roomInteractables = currentRoomInfo.interactables;
  currentRoom = group;
  currentRoomKey = roomKey;
  controlsTutorial.enterRoom(roomKey);
  player.visible = true;
  scene.add(group);
  // Before anything compiles: see bedroomClip.
  if (roomKey === 'pomni') clipToBedroomDoor(group);

  floorY = spawn.y;
  bounds = {
    minX: box.min.x + WALL_MARGIN,
    maxX: box.max.x - WALL_MARGIN,
    minZ: box.min.z + WALL_MARGIN,
    maxZ: box.max.z - WALL_MARGIN,
  };
  colliders = roomColliders ?? [];
  // GLB rooms' meshes: the wall probes and floor raycast only test the
  // few entries whose boxes the query overlaps, padded by the player
  // radius so a mesh the player is touching is never skipped.
  collisionMeshes = (roomCollisionMeshes ?? []).map((entry) => ({
    mesh: entry.mesh,
    box: entry.box,
    paddedBox: entry.box.clone().expandByScalar(PLAYER_RADIUS),
    dynamic: entry.dynamic ?? false,
  }));
  dynamicCollisionMeshes = collisionMeshes.filter((entry) => entry.dynamic);
  for (const { mesh } of collisionMeshes) {
    // BVHs are in the mesh's local space, so swinging doors keep theirs.
    if (!mesh.isSkinnedMesh && !mesh.geometry.boundsTree) computeBoundsTree.call(mesh.geometry);
  }
  triggers = roomTriggers ?? null;
  movers = roomMovers ?? [];
  hazards = roomHazards ?? [];
  roomUpdate = roomUpdateFn ?? null;
  roomDialogueCue = onDialogueNode ?? null;
  roomTalkPartner = talkPartner ?? null;
  interactables = roomInteractables ?? [];
  portals = roomPortals ?? [];
  scene.environment = wantsEnvironment ? environmentMap : null;
  // Only meaningful in the hub with multiple unmarked doors — every other
  // room either has no portals or just the one obvious way back.
  // Rooms built onto the hall (see rooms/connectRooms.js) have no portal,
  // just a marker.
  if (roomKey === 'dorm' && portals.length > 0) {
    minimap.show([...portals, ...(mapMarkers ?? [])], { group, floorY: spawn.y });
  }
  else minimap.hide();
  roomLighting?.attach(scene);

  if (playOpening && roomOpening) {
    activeOpening = roomOpening;
    player.visible = false;
    roomOpening.start({ camera, resolveCamera: resolveOpeningCamera,
      onHandoff: handoffOpening, onComplete: completeOpening, onSeated: seatedOpeningDialogue });
  }

  player.position.set(spawn.x, floorY + PLAYER_HEIGHT, spawn.z);
  // Rooms can request a starting yaw (the maze points the player down
  // whichever side of the start cell is actually open); anything that
  // doesn't specify one keeps the default of facing -Z.
  cameraYaw = spawnFacing ?? 0;
  pomni.rotation.y = cameraYaw + Math.PI; // her model faces +Z
  cameraPitch = DEFAULT_PITCH;
  currentCameraDistance = CAMERA_DISTANCE;

  // three.js compiles each material's shader the first time it comes
  // into view, which hitches mid-walk; compile them all up front instead,
  // now that the room's lights and environment are in place.
  renderer.compile(scene, camera);
  // Anything the room only switches on later (a connected room's mirrors
  // and shadows) builds its shaders now, under the loading screen.
  warmUp?.(renderer, scene, camera);

  readyToPlay = true;
  overlay.classList.remove('loading');
  if (activeOpening?.active) {
    openingFrameProfile = { frames: 0, seconds: 0, maxSeconds: 0 };
    clock.getDelta(); // loading/compile time is not cinematic playback time
    try { activeOpening.setAudio(openingAudio.createSession(currentRoom)); }
    catch (error) { console.warn('Temporary opening audio unavailable; continuing silently.', error); }
    readyToPlay = false;
    overlay.classList.add('hidden');
    btnTitle.hidden = true;
    cinematicSkip.hidden = false;
    return;
  }
  if (playOpening && openingError) {
    openingCompleted = true;
    morningDialoguePending = preLevel1Session;
    showHint('Opening could not load. You can explore, or press T to continue the morning conversation.', 9000);
  }
  if (onReady) {
    onReady();
  } else {
    overlayTitle.textContent = 'Click to Play';
    overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
  }
  if (roomKey === 'pomni' && morningDialoguePending) {
    showHint('Press T to retry the morning conversation with Ragatha.', 8000);
  }
}

function disposeObject3D(root) {
  root.userData.ragathaEntrance?.dispose();
  root.userData.pomniOpening?.dispose();
  root.userData.bedroomLighting?.dispose();
  root.userData.dormHallPreview?.dispose(); // removes its exclusively owned meshes before generic disposal
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse((child) => {
    child.shadow?.dispose();
    if (!child.isMesh) return;
    child.dispose?.(); // e.g. a mirror's Reflector frees its render target
    if (child.skeleton) skeletons.add(child.skeleton);
    if (child.geometry) geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) { disposeBoundsTree.call(geometry); geometry.dispose(); }
  for (const skeleton of skeletons) skeleton.dispose();
  releaseTextures(textures);
}

// --- Credits panel ---
const creditsPanel = document.getElementById('credits');
document.getElementById('credits-btn').addEventListener('click', () => {
  creditsPanel.classList.remove('hidden');
});
document.getElementById('credits-close').addEventListener('click', () => {
  creditsPanel.classList.add('hidden');
});

// --- Controls panel ---
const controlsPanel = document.getElementById('controls');
document.getElementById('controls-btn').addEventListener('click', () => {
  controlsPanel.hidden = false;
});
document.getElementById('controls-close').addEventListener('click', () => {
  controlsPanel.hidden = true;
});
controlsPanel.addEventListener('click', (e) => {
  if (e.target === controlsPanel) controlsPanel.hidden = true; // clicked the backdrop
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') controlsPanel.hidden = true;
});

// --- Keyboard movement ---
const move = { forward: false, back: false, left: false, right: false, sprint: false };

window.addEventListener('keydown', (e) => {
  if (activeCinematic()?.active) {
    if (e.code === 'KeyP' && !e.repeat) { e.preventDefault(); pauseOpening(!paused); }
    if (e.code === 'Escape' && !e.repeat && !e.defaultPrevented) { e.preventDefault(); pauseOpening(!paused); }
    return;
  }
  setMove(e.code, true);
  if (e.code === 'KeyX' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey
    && shouldShowObjective(gameplayHUDContext())) controlsTutorial.dismiss();
  if (e.code === 'KeyT' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey
    && isLocked && readyToPlay && !paused && !dialogueUI.isActive
    && currentRoomKey === 'pomni' && morningDialoguePending && preLevel1Session) {
    e.preventDefault(); resetMoveState();
    playMorningDialogue(() => resetMoveState());
    return;
  }
  if (e.code === 'KeyE' && !e.repeat && isLocked && readyToPlay && !dialogueUI.isActive && focusedInteractable) {
    if (shouldShowObjective(gameplayHUDContext()) && focusedBedroomDoor()) controlsTutorial.interact();
    focusedInteractable.interact(interactionContext);
  }
  if (e.code === 'KeyV' && !e.repeat && isLocked && readyToPlay && !paused && !dialogueUI.isActive
    && !activeCutscene && !stageBusy()) {
    firstPerson = !firstPerson;
  }
});
window.addEventListener('keyup', (e) => setMove(e.code, false));

// Bedroom lighting previews never ship as active player controls.
if (import.meta.env.DEV) {
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !isLocked || !readyToPlay
      || paused || dialogueUI.isActive || currentRoomKey !== 'pomni') return;
    const lighting = currentRoom?.userData.bedroomLighting;
    if (!lighting) return;
    if (event.code === 'KeyL') {
      const next = { GAMEPLAY: 'SLEEPING', SLEEPING: 'WAKING', WAKING: 'GAMEPLAY' }[lighting.state];
      lighting.setState(next);
      showHint(`Lighting preview: ${next} · L: next state · R: reset`, 4500);
    } else if (event.code === 'KeyR') {
      lighting.reset();
      showHint('Lighting preview reset: GAMEPLAY', 3000);
    }
  });
}
// A keyup can be missed entirely (Alt-tabbing away, the OS eating a key
// combo), which leaves that direction stuck "held" until the same key is
// pressed again. Clear all of them on blur and on every transition that
// suspends normal play, so a stale flag never survives into the next state.
window.addEventListener('blur', () => {
  resetMoveState();
  if (activeCinematic()?.active) pauseOpening(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && activeCinematic()?.active) pauseOpening(true);
});

function resetMoveState() {
  move.forward = false;
  move.back = false;
  move.left = false;
  move.right = false;
  move.sprint = false;
}

function setMove(code, value) {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      move.forward = value;
      break;
    case 'KeyS':
    case 'ArrowDown':
      move.back = value;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      move.left = value;
      break;
    case 'KeyD':
    case 'ArrowRight':
      move.right = value;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      move.sprint = value;
      break;
  }
}

const velocity = new THREE.Vector3();
const triggerProbe = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const moveForward = new THREE.Vector3();
const moveDelta = new THREE.Vector3();
const probeOrigin = new THREE.Vector3();
const slideDelta = new THREE.Vector3();
const faceNormal = new THREE.Vector3();
const hitNormal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const DOWN = new THREE.Vector3(0, -1, 0);
const wallRaycaster = new THREE.Raycaster();
const groundRaycaster = new THREE.Raycaster();
// A small ring of floor probes around the player position tolerates seams
// between separate floor meshes; each entry is an XZ offset.
const GROUND_PROBES = [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]];
// Body-overlap check (see acceptMove): rays fanned around the player.
const BODY_RAY_DIRECTIONS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
});
const bodyRaycaster = new THREE.Raycaster();
const moveStart = new THREE.Vector3();
const partDirection = new THREE.Vector3();

// Populated once a room model has loaded and its real bounding box is known.
let bounds = null;
let floorY = 0;
// --- Pointer lock + third-person mouse look ---
const MOUSE_SENSITIVITY = 0.0025;
const PITCH_MIN = -0.4; // radians; below 0 = camera under her head looking up
const PITCH_MAX = 1.2;  // looking down from above
const DEFAULT_PITCH = 0.25;

let isLocked = false;
let cameraYaw = 0; // 0 = looking toward -Z, the spawn facing
let cameraPitch = DEFAULT_PITCH;
let firstPerson = false; // toggled with V (see updateCamera and the keydown handler)
let lastLookInputMs = -Infinity; // performance.now() of the last mouse-look, for the auto-correct below

// Third-person follow camera (see updateCamera).
const CAMERA_DISTANCE = 3.2;        // how far behind Pomni
const CAMERA_TARGET_DROP = 0.3;     // aim at her shoulders, a bit below PLAYER_HEIGHT
const CAMERA_COLLISION_PAD = 0.25;  // stay this far in front of any wall
const CAMERA_RETURN_SHARPNESS = 6;  // how fast it eases back out after a wall
const MIN_VISIBLE_DISTANCE = 0.7;   // hide Pomni if the camera is inside her
// Walking in a new direction (not actively mouse-looking) eases the camera
// back in behind her, even if a scroll/drag had swung it off to one side.
const LOOK_IDLE_MS = 500;           // how long since the last mouse-look counts as "not looking around"
const CAMERA_AUTO_CORRECT_SHARPNESS = 2; // gentler than TURN_SHARPNESS — this is the camera settling, not her body turning
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const cameraHitPoint = new THREE.Vector3();
const cameraRaycaster = new THREE.Raycaster();
let currentCameraDistance = CAMERA_DISTANCE;

// Pomni turning and her walk animation (see updatePomniWalk).
const TURN_SHARPNESS = 14;     // higher = snappier turning
// Ground speed each clip's feet move at, measured at POMNI_HEIGHT; the clip
// is sped up/slowed down by actual speed ÷ this so her feet stay planted.
const WALK_CLIP_SPEED = 1.1; // Retain the R5-compatible 1.6 m character scale.
const RUN_CLIP_SPEED = 2.85;
const RUN_THRESHOLD = WALK_SPEED * 1.4; // above this she's sprinting
const ACTION_FADE = 0.2;       // seconds to cross-fade between clips
let animSpeed = 0;             // smoothed ground speed, so clips don't flicker
// Fallback hop-and-waddle for a model without clips (e.g. the placeholder).
const STEPS_PER_METRE = 1.4;
const WALK_BOB_HEIGHT = 0.06;  // metres of hop per step
const WALK_SWAY = 0.08;        // radians of side-to-side waddle
const wishDirection = new THREE.Vector3();
let walkPhase = 0;
let walkAmount = 0;

overlay.addEventListener('click', (e) => {
  // Only resume when clicking the overlay background itself (not a button inside it)
  if (e.target !== overlay && e.target !== overlayTitle && e.target !== overlaySubtitle) return;
  if (!readyToPlay) return;
  if (!currentRoom) return; // on home screen, must pick a room first
  renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('click', () => {
  if (readyToPlay && !isLocked && !dialogueUI.isActive && !stageBusy() && currentRoom) {
    renderer.domElement.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === renderer.domElement;
  crosshair.hidden = !isLocked;
  if (isLocked) {
    overlay.classList.add('hidden');
    pauseMenu.hidden = true;
    paused = false;
    return;
  }
  // A keyup can be missed while the pointer is unlocked (e.g. the browser
  // ate the key combo that released it), so clear held movement here too,
  // not just on blur.
  resetMoveState();
  if (!levelCompletePanel.hidden) return;
  if (!currentRoom || !readyToPlay) return; // home screen, loading or endLevel — handled elsewhere
  // Esc mid-game: show the pause menu
  paused = true;
  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'Paused';
  overlaySubtitle.textContent = 'Press Esc or click Resume to continue';
  roomPicker.hidden = true;
  dialoguePicker.hidden = true;
  btnTitle.hidden = true;
  pauseMenu.hidden = false;
});
document.addEventListener('mousemove', (e) => {
  // Frozen during an in-room conversation (e.g. talking to Kaufmo), same as
  // movement below — looking around while portraits/text are up is just
  // disorienting, and nothing stops the mouse once the pointer is locked.
  if (!isLocked || !readyToPlay || activeCinematic()?.active || dialogueUI.isActive || stageBusy() || activeCutscene) return;
  const sensitivity = MOUSE_SENSITIVITY * mouseSensitivityScale;
  const oldYaw = cameraYaw, oldPitch = cameraPitch;
  cameraYaw -= e.movementX * sensitivity;
  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + e.movementY * sensitivity, PITCH_MIN, PITCH_MAX,
  );
  lastLookInputMs = performance.now(); // see the third-person auto-correct in updateCamera
  if (shouldShowObjective(gameplayHUDContext())) {
    controlsTutorial.look(Math.hypot(cameraYaw - oldYaw, cameraPitch - oldPitch));
  }
});

// Two collision systems, picked by what the loaded room supplies:
//  - colliders: exact wall Box3s (the maze), resolved circle-vs-box below.
//  - collisionMeshes: the GLB rooms' render meshes with their world boxes.
//    Wall probes and the floor raycast test only the few meshes whose boxes
//    the query touches and collide against the rendered triangles — so
//    doors, corridors and irregular walls block exactly where they look
//    like they should, unlike per-mesh boxes, which would seal off whole
//    chunks of these rooms (the ceiling box alone spans the spawn area).
// Rooms with objective callouts (find Jax / reach the exit) also fill
// triggers/movers/hazards; rooms without leave those empty/null.
let colliders = [];
let collisionMeshes = [];
let triggers = null;
let movers = [];
let hazards = [];
// Per-frame hook for room-specific animation (e.g. Caine's idle in Pomni's room),
// called with (deltaSeconds, playerPosition).
let roomUpdate = null;
// Set by rooms that stage a dialogue preview (see playDialoguePreview):
// called with each node as it comes up, then null once the script ends,
// and the point Pomni turns to face while it plays.
let roomDialogueCue = null;
let roomTalkPartner = null;
// Moving collision meshes (e.g. swinging doors): their boxes are refreshed every frame.
let dynamicCollisionMeshes = [];
// Things the player can use with E: { objects: Mesh[], prompt(): string,
// interact(context), anchor?: Object3D, radius?: number }. Aiming at
// `objects` focuses one; anchored ones (NPCs) also focus when Pomni stands
// within `radius` of the anchor (see nearestInRange). interact() gets
// interactionContext, e.g. so an NPC can turn toward Pomni as she talks.
let interactables = [];
const interactionContext = { playerPosition: player.position };
const NPC_TALK_RADIUS = 2.5;  // metres from an NPC's feet that "close enough to talk" means
const STOREY_TOLERANCE = 1.5; // ignore NPCs on a different floor level
const anchorPosition = new THREE.Vector3();
const sightOrigin = new THREE.Vector3();
const sightTarget = new THREE.Vector3();
const sightDirection = new THREE.Vector3();
const sightRaycaster = new THREE.Raycaster();
const sightCandidates = [];
// Archways that lead to another room: { box, to } (see rooms/portals.js).
let portals = [];
let focusedInteractable = null;
const interactRaycaster = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0, 0);
let foundJax = false;
let reachedExit = false;
let caught = false;

/**
 * Steps every patrolling NPC/hazard along its waypoint loop, ping-ponging
 * between the first and last waypoint. Runs every frame regardless of
 * pointer lock so patrols stay alive while the player is looking at a menu.
 */
function updateMovers(deltaSeconds) {
  for (const mover of movers) {
    const target = mover.waypoints[mover.targetIndex];
    const dx = target.x - mover.mesh.position.x;
    const dz = target.z - mover.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const step = mover.speed * deltaSeconds;

    if (dist <= step || dist < 1e-6) {
      mover.mesh.position.x = target.x;
      mover.mesh.position.z = target.z;
      mover.targetIndex += mover.direction;
      if (mover.targetIndex >= mover.waypoints.length) {
        mover.targetIndex = mover.waypoints.length - 2;
        mover.direction = -1;
      } else if (mover.targetIndex < 0) {
        mover.targetIndex = 1;
        mover.direction = 1;
      }
    } else {
      mover.mesh.position.x += (dx / dist) * step;
      mover.mesh.position.z += (dz / dist) * step;
    }

    if (mover.spin) {
      mover.mesh.rotation.x += deltaSeconds * 1.5;
      mover.mesh.rotation.y += deltaSeconds * 2.1;
    }
  }
}

/**
 * Pushes the player's XZ position out of any wall box it has walked into.
 * Treated as a circle (radius PLAYER_RADIUS) vs. axis-aligned box test since
 * every maze wall is axis-aligned — cheap and exact for this case, unlike
 * the outer bounding-box clamp which can't express interior geometry.
 */
function resolveWallCollisions(position) {
  const feetY = position.y - PLAYER_HEIGHT;
  for (const box of colliders) {
    // Walls only block over the player's body height: boxes entirely below
    // a steppable ledge or entirely above the head are not walls.
    if (box.max.y <= feetY + STEP_HEIGHT || box.min.y >= position.y) continue;

    const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
    const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
    const dx = position.x - closestX;
    const dz = position.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= PLAYER_RADIUS * PLAYER_RADIUS || distSq < 1e-9) continue;

    const dist = Math.sqrt(distSq);
    const overlap = PLAYER_RADIUS - dist;
    position.x += (dx / dist) * overlap;
    position.z += (dz / dist) * overlap;
  }
}

/**
 * Casts a short horizontal ray from the player and returns the first hit
 * that is genuinely wall-like, or null. Faces tilted mostly up/down are
 * ramps and ledges — the floor follow already handles those, so they must
 * not stop the player here, hence the walkable-slope check.
 */
function firstWallHit(origin, direction, distance) {
  wallRaycaster.set(origin, direction);
  wallRaycaster.far = distance;

  const candidates = [];
  for (const entry of collisionMeshes) {
    if (wallRaycaster.ray.intersectsBox(entry.paddedBox)) candidates.push(entry.mesh);
  }
  if (candidates.length === 0) return null;

  for (const hit of wallRaycaster.intersectObjects(candidates, false)) {
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    faceNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
    // three reports the raw geometric normal even on back-face hits (the
    // player walking into the far side of a double-sided wall), which
    // would point along the movement and push the player *through* the
    // wall — reorient it to face the probe before doing any math.
    if (faceNormal.dot(direction) > 0) faceNormal.negate();
    if (Math.abs(faceNormal.y) > WALKABLE_NORMAL_Y) continue;
    hitNormal.set(faceNormal.x, 0, faceNormal.z).normalize();
    return { distance: hit.distance, normal: hitNormal };
  }
  return null;
}

/**
 * Moves the player `distance` along `direction` without passing through a
 * wall: the step is clipped at the first hit (stopping PLAYER_RADIUS short
 * of it) and the leftover distance is redirected along the wall face, so
 * the player slides instead of sticking. A hit closer than PLAYER_RADIUS
 * means the player is somehow inside the wall — then the step just backs
 * them out.
 */
function moveWithCollisions(player, direction, distance) {
  probeOrigin.set(
    player.position.x,
    player.position.y - PLAYER_HEIGHT + PROBE_HEIGHT,
    player.position.z,
  );

  const hit = firstWallHit(probeOrigin, direction, distance + PROBE_LEAD);
  if (!hit) {
    player.position.addScaledVector(direction, distance);
    return;
  }

  const approach = -(direction.x * hit.normal.x + direction.z * hit.normal.z);
  if (approach < 1e-4) {
    // The face runs parallel to the step, yet the probe caught it within
    // reach: the step is already inside this wall — push straight out.
    player.position.addScaledVector(hit.normal, PLAYER_RADIUS);
    return;
  }

  // Perpendicular distance from the player to the wall face. The probe
  // measures along `direction`, which only equals the true clearance on a
  // head-on approach, hence the approach factor.
  const clearance = hit.distance * approach;
  if (clearance < PLAYER_RADIUS) {
    // Already within a radius of the face: back straight out along its
    // normal (exactly to the radius) and leave sliding to the next frame.
    player.position.addScaledVector(hit.normal, PLAYER_RADIUS - clearance);
    return;
  }

  const allowed = Math.min(distance, (clearance - PLAYER_RADIUS) / approach);
  player.position.addScaledVector(direction, allowed);

  const leftover = distance - allowed;
  if (leftover < 1e-4) return;

  // Retry the leftover along the wall face.
  slideDelta.set(direction.x * leftover, 0, direction.z * leftover);
  slideDelta.addScaledVector(hit.normal, -slideDelta.dot(hit.normal));
  const slideLength = slideDelta.length();
  if (slideLength < 1e-4) return;
  slideDelta.divideScalar(slideLength);

  probeOrigin.set(
    player.position.x,
    player.position.y - PLAYER_HEIGHT + PROBE_HEIGHT,
    player.position.z,
  );
  const slideHit = firstWallHit(probeOrigin, slideDelta, slideLength + PROBE_LEAD);
  let slideAllowed = slideLength;
  if (slideHit) {
    const slideApproach = -(slideDelta.x * slideHit.normal.x + slideDelta.z * slideHit.normal.z);
    slideAllowed = slideApproach < 1e-4
      ? 0
      : Math.max(0, Math.min(slideLength, (slideHit.distance * slideApproach - PLAYER_RADIUS) / slideApproach));
  }
  player.position.addScaledVector(slideDelta, slideAllowed);
}

/**
 * The highest surface under (x, z) that can be stood on: the nearest hit
 * at or below a step above the feet. Hits above that belong to geometry
 * the body probe should have blocked, so the search skips past them.
 * Returns null when no floor exists under the point.
 */
function findGroundY(x, z, originY, feetY) {
  groundRaycaster.set(probeOrigin.set(x, originY, z), DOWN);
  groundRaycaster.far = GROUND_RAY_FAR;

  const candidates = [];
  for (const entry of collisionMeshes) {
    const { box } = entry;
    if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
    if (box.min.y > originY || box.max.y < originY - GROUND_RAY_FAR) continue;
    candidates.push(entry.mesh);
  }
  if (candidates.length === 0) return null;

  for (const hit of groundRaycaster.intersectObjects(candidates, false)) {
    if (hit.point.y <= feetY + STEP_HEIGHT) return hit.point.y;
  }
  return null;
}

/**
 * Pins the player to the floor directly under them. Returns false when no
 * probe finds any floor at all — the caller then rejects the frame's move,
 * which is exactly what bounds the player to the walkable surface instead
 * of letting them walk off its edge into the void.
 */
function settleOnGround(player) {
  const feetY = player.position.y - PLAYER_HEIGHT;
  const originY = player.position.y + 0.2;
  for (const [dx, dz] of GROUND_PROBES) {
    const groundY = findGroundY(player.position.x + dx, player.position.z + dz, originY, feetY);
    if (groundY !== null) {
      player.position.y = groundY + PLAYER_HEIGHT;
      return true;
    }
  }
  return false;
}

/**
 * Finishes a GLB-room step: clamps to the room, follows the floor, and
 * checks the whole body is clear of geometry. The wall probe is a single
 * ray at shin height, so on its own it lets the player's sides squeeze
 * into gaps narrower than they are (between the toy blocks by the stage),
 * or drop from a ledge into geometry — and these rooms' double-sided
 * meshes then wall them in from every side. A step that leaves the body
 * overlapping something is refused — unless the player already overlapped
 * (a door swung into them) and the step doesn't make it worse, so they can
 * always walk back out.
 */
function acceptMove(player, startClearance) {
  if (bounds) {
    player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
  }
  // No floor anywhere under the new position: the walkable surface itself
  // keeps the player in bounds.
  if (!settleOnGround(player)) return false;

  const clearance = bodyClearance(player);
  return clearance >= BODY_CLEARANCE || clearance >= startClearance - 1e-3;
}

/**
 * How close the player's body is to any non-floor geometry: the shortest
 * hit of rings of short horizontal rays at shin, chest and head height, or
 * Infinity when nothing is within PLAYER_RADIUS.
 */
function bodyClearance(player) {
  const feetY = player.position.y - PLAYER_HEIGHT;
  const { x, z } = player.position;

  const candidates = [];
  for (const entry of collisionMeshes) {
    const box = entry.paddedBox;
    if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
    if (box.max.y < feetY + PROBE_HEIGHT || box.min.y > feetY + PLAYER_HEIGHT) continue;
    candidates.push(entry.mesh);
  }
  if (candidates.length === 0) return Infinity;

  let closest = Infinity;
  bodyRaycaster.far = PLAYER_RADIUS;
  for (const { height, skipRamps } of BODY_RINGS) {
    probeOrigin.set(x, feetY + height, z);
    for (const direction of BODY_RAY_DIRECTIONS) {
      bodyRaycaster.set(probeOrigin, direction);
      for (const hit of bodyRaycaster.intersectObjects(candidates, false)) {
        if (skipRamps) {
          normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          faceNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
          if (Math.abs(faceNormal.y) > WALKABLE_NORMAL_Y) continue; // floor/ramp, not a wall
        }
        closest = Math.min(closest, hit.distance);
        break;
      }
    }
  }
  return closest;
}

function endLevel(title, subtitle) {
  readyToPlay = false;
  document.exitPointerLock();
  overlay.classList.remove('hidden');
  overlayTitle.textContent = title;
  overlaySubtitle.textContent = subtitle;
  roomPicker.hidden = false;
  dialoguePicker.hidden = false;
  btnTitle.hidden = false;
  pauseMenu.hidden = true;
}

/**
 * A brief "Level N Complete" (or, with `chime: 'fail'`, a failure) beat
 * with a Continue button, for missions that chain straight into the next
 * one rather than stopping the story (see level1.js) — unlike endLevel(),
 * this doesn't drop to the room picker, just pauses on a card until the
 * player dismisses it themselves. Same card either way; only the text and
 * chime change.
 * @returns {Promise<void>} resolves once Continue is clicked
 */
let cancelLevelComplete = () => {};
function showLevelComplete(title, subtitle, { resume = true, chime = 'complete' } = {}) {
  cancelLevelComplete();
  const token = loadToken;
  resetMoveState();
  stage.hold(true);
  // The pointer-lock event must see the card, so it never opens Pause over it.
  levelCompleteTitle.textContent = title;
  levelCompleteSubtitle.textContent = subtitle;
  levelCompletePanel.hidden = false;
  paused = false;
  pauseMenu.hidden = true;
  document.exitPointerLock();
  levelCompletePanel.classList.remove('level-complete-pop');
  void levelCompletePanel.offsetWidth;
  levelCompletePanel.classList.add('level-complete-pop');
  openingAudio.playChime(chime);
  return new Promise(resolve => {
    function finish(continued) {
      btnLevelCompleteContinue.removeEventListener('click', onContinue);
      levelCompletePanel.hidden = true;
      cancelLevelComplete = () => {};
      stage.hold(false);
      resolve(continued && token === loadToken);
    }
    function onContinue() {
      if (token !== loadToken) { finish(false); return; }
      finish(true);
      if (resume) renderer.domElement.requestPointerLock();
    }
    cancelLevelComplete = () => finish(false);
    btnLevelCompleteContinue.addEventListener('click', onContinue);
  });
}

/** Walking into an archway/** Walking into an archway's portal loads the room it leads to. */
function checkPortals() {
  if (portals.length === 0) return;
  // Her actual feet, not floorY: the dorm arch stands on a few steps.
  triggerProbe.set(player.position.x, player.position.y - PLAYER_HEIGHT + 0.5, player.position.z);
  // A door portal (see rooms/doors.js) only leads anywhere once it's open.
  const portal = portals.find((p) => p.box.containsPoint(triggerProbe) && !p.disabled && (p.enabled?.() ?? true));
  if (portal) travelTo(portal.to);
}

// --- Walking between Pomni's room and the Dorm Hall --------------------
// The two are really side by side: her room shows the real hall through
// its open door (rooms/dormHallPreview.js), and that placement says where
// her room sits behind the hall's door too. So whichever one Pomni's in,
// the other loads quietly in the background, and walking through the open
// doorway swaps it in where she stands — no loading screen.
//   - Out of her room: the door's open once Ragatha's been (pomniRoom.js's
//     createHallLink has the doorway and the change of coordinates).
//   - Into it: E opens her door in the hall like any other; the preloaded
//     room is shown behind it, and stepping in swaps it in.
// The room she walks out of isn't thrown away: it's parked as the room
// behind the door (parkRoom), so walking back is instant too.

const ROOM_PREP_BUDGET_MS = 4; // per frame, uploading textures and building collision trees

// Her room is bigger than the slot behind the hall's wall, so seen from
// the hall its outer walls would poke out into the corridor. Every one of
// its materials clips against this plane: the hall's wall line at her
// door while it's shown there, and nothing (KEEP_ALL) once she's inside.
// It's on her materials from the start, so moving it never rebuilds a
// shader.
const KEEP_ALL = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e9);
const bedroomClip = KEEP_ALL.clone();

function clipToBedroomDoor(group) {
  group.traverse((object) => {
    if (!object.isMesh || object.isReflector) return;
    for (const material of [object.material].flat()) {
      if (material && !material.clippingPlanes) material.clippingPlanes = [bedroomClip];
    }
  });
}

function updateHallLink() {
  const link = currentRoomInfo?.hallLink;
  if (currentRoomKey !== 'pomni' || !link?.isOpen()) return;
  if (!roomPreload) preloadRoom('dorm', 'pomni');
  prepareRoom(roomPreload);
  if (link.crossed(player.position)) walkIntoHall(link);
}

function updatePomniDoorway() {
  const doorway = currentRoomInfo?.pomniDoorway;
  if (currentRoomKey !== 'dorm' || !doorway) return;
  if (!roomPreload) preloadRoom('pomni', 'dorm');
  prepareRoom(roomPreload);
  const entry = roomPreload;
  const showing = doorway.control.isOpen && roomReady(entry) && Boolean(entry.result.hallLink);
  if (showing !== entry.peeking) showRoomBehindDoor(entry, showing);
  if (doorway.crossed(player.position)) walkIntoPomniRoom(entry, doorway);
}

const roomReady = (entry) => Boolean(entry?.result && entry.compiled && !entry.trees.length && !entry.textures.length);

/**
 * Loads a room, then gets it ready to step into — the work a loading
 * screen would otherwise hide: its shaders compile in the background
 * (against its own lights, plus Pomni's materials against them), and its
 * textures are uploaded and collision trees built a few each frame in
 * prepareRoom(). Pomni's room also has its doorway opened, and is compiled
 * a second time lit only by the hall's lights, as it's seen from there.
 */
function preloadRoom(key, from) {
  const entry = {
    key, result: null, failed: false, compiled: false, trees: [], textures: [], peeking: false, hidden: [],
  };
  roomPreload = entry;
  entry.settled = ROOM_LOADERS[key](null, roomLoadOptions(key, { from }))
    .then((result) => {
      if (roomPreload !== entry) {
        disposeObject3D(result.group); // she left another way first
        return null;
      }
      entry.result = result;
      result.openDoorway?.();
      if (key === 'pomni') clipToBedroomDoor(result.group);
      entry.trees = result.collisionMeshes.map(({ mesh }) => mesh)
        .filter((mesh) => !mesh.isSkinnedMesh && !mesh.geometry.boundsTree);
      const textures = new Set();
      result.group.traverse((object) => {
        for (const material of [object.material].flat()) {
          for (const value of Object.values(material ?? {})) if (value?.isTexture) textures.add(value);
        }
      });
      entry.textures = [...textures];
      // Lit and reflected as it will be: the scene's ambient, the room's own
      // lights, with whatever it only shows later (her room's hall preview)
      // switched on — compile skips anything hidden.
      const staging = new THREE.Scene();
      staging.background = scene.background;
      staging.environment = result.environment ? environmentMap : null;
      staging.add(new THREE.AmbientLight(), result.group);
      const preview = result.group.userData.dormHallPreview?.group;
      if (preview) preview.visible = true;
      const compiling = [renderer.compileAsync(staging, camera), renderer.compileAsync(player, camera, staging)];
      // A mirror draws the room into its own texture, which needs its own
      // build of every material (compileAsync sets its programs up at once).
      const target = renderer.getRenderTarget();
      result.group.traverse((object) => {
        if (!object.isReflector) return;
        renderer.setRenderTarget(object.getRenderTarget());
        compiling.push(renderer.compileAsync(staging, camera));
      });
      renderer.setRenderTarget(target);
      if (preview) preview.visible = false;
      return Promise.all(compiling)
        .finally(() => staging.remove(result.group))
        .then(() => {
          if (key !== 'pomni' || roomPreload !== entry) return null;
          // Seen from the hall: its own lights and mirrors stay off, so
          // showing it never changes the scene's light count (which would
          // rebuild every material's shader), and only the hall's light it.
          result.group.traverse((object) => {
            if ((object.isLight || object.isReflector) && object.visible) entry.hidden.push(object);
          });
          for (const object of entry.hidden) object.visible = false;
          return renderer.compileAsync(result.group, camera, scene);
        })
        .then(() => { entry.compiled = true; });
    })
    .catch((error) => {
      console.warn(`${key} could not preload; its doorway falls back to a normal trip.`, error);
      entry.failed = true;
    });
}

function prepareRoom(entry) {
  if (!entry || (!entry.textures.length && !entry.trees.length)) return;
  const start = performance.now();
  while (performance.now() - start < ROOM_PREP_BUDGET_MS) {
    if (entry.textures.length) renderer.initTexture(entry.textures.pop());
    else if (entry.trees.length) {
      const mesh = entry.trees.pop();
      if (!mesh.geometry.boundsTree) computeBoundsTree.call(mesh.geometry);
    } else break;
  }
}

/**
 * Throws away a preloaded room nobody walked into. One still compiling
 * waits for that to finish first: three.js keeps checking its shaders
 * until they're ready, and would trip over them disposed.
 */
function dropRoomPreload() {
  const entry = roomPreload;
  roomPreload = null;
  if (!entry?.result) return; // still loading: it disposes itself on arrival
  entry.result.group.removeFromParent();
  if (entry.compiled || entry.failed) disposeObject3D(entry.result.group);
  else entry.settled.then(() => disposeObject3D(entry.result.group));
}

/** Puts the preloaded bedroom behind the hall's open door (or takes it away). */
function showRoomBehindDoor(entry, show) {
  entry.peeking = show;
  const { group, hallLink } = entry.result;
  if (!show) {
    group.removeFromParent();
    bedroomClip.copy(KEEP_ALL);
    return;
  }
  bedroomClip.copy(currentRoomInfo.pomniDoorway.wallPlane);
  hallLink.toHall.decompose(group.position, group.quaternion, group.scale);
  currentRoom.add(group);
  group.updateMatrixWorld(true);
}

const HALL_DOOR_CLEARANCE = PLAYER_RADIUS + 0.15; // metres out from the hall's door
const BEDROOM_DOOR_CLEARANCE = PLAYER_RADIUS + 0.25; // metres into her room

/** Pomni's pose now, for carrying across into the next room through `toNext`. */
function carryPose(toNext, yawOffset) {
  const feet = player.position.clone();
  feet.y -= PLAYER_HEIGHT;
  return {
    feet: feet.applyMatrix4(toNext),
    yaw: cameraYaw + yawOffset,
    pomniYaw: pomni.rotation.y + yawOffset,
    pitch: cameraPitch,
    distance: currentCameraDistance,
  };
}

/**
 * Swaps a preloaded room in where Pomni stands, mid-step. The room she's
 * leaving is parked behind the doorway (parkRoom) rather than thrown away.
 */
function enterPreloadedRoom(entry, pose) {
  roomPreload = null; // it's becoming the room, not to be thrown away
  const room = entry.result;
  const leaving = { key: currentRoomKey, result: currentRoomInfo };
  room.group.removeFromParent();
  room.group.position.set(0, 0, 0);
  room.group.quaternion.identity();
  room.group.scale.set(1, 1, 1);
  room.group.updateMatrixWorld(true);
  bedroomClip.copy(KEEP_ALL);
  for (const object of entry.hidden) object.visible = true;
  leaveCurrentRoom({ keepMoving: true, keepRoom: true });
  room.spawn = pose.feet;
  room.spawnFacing = pose.yaw;
  currentRoomInfo = room;
  applyLoadedRoom(room, () => {}, entry.key);
  pomni.rotation.y = pose.pomniYaw;
  cameraPitch = pose.pitch;
  currentCameraDistance = pose.distance;
  parkRoom(leaving.key, leaving.result);
}

/**
 * Keeps the room Pomni just walked out of as the next room behind the
 * doorway, in the state she left it, ready to walk back into: no reload.
 * The hall's copy of her door is shut behind her (walkIntoHall brings her
 * out just clear of it). Her room, seen from the hall, has its own lights
 * and mirrors off and is lit by the hall's, so it builds those shaders
 * once in the background before it's shown there.
 */
function parkRoom(key, result) {
  const entry = {
    key, result, failed: false, compiled: key !== 'pomni', trees: [], textures: [], peeking: false, hidden: [],
  };
  roomPreload = entry;
  if (key === 'dorm') {
    const door = result.hallDoors?.pomni?.control;
    door?.close({ immediate: true });
    door?.update(0);
    return;
  }
  result.lighting?.detach();
  // The hall itself is right there now; its stand-in through her doorway
  // would only sit on top of it.
  result.group.userData.dormHallPreview?.setVisible(false);
  clipToBedroomDoor(result.group);
  result.group.traverse((object) => {
    if ((object.isLight || object.isReflector) && object.visible) entry.hidden.push(object);
  });
  for (const object of entry.hidden) object.visible = false;
  entry.settled = renderer.compileAsync(result.group, camera, scene)
    .catch((error) => console.warn('Could not pre-build her room as seen from the hall.', error))
    .then(() => { entry.compiled = true; });
}

function walkIntoHall(link) {
  const entry = roomPreload;
  if (entry?.failed) {
    dropRoomPreload();
    travelTo('dorm');
    return;
  }
  // Still getting ready: the widened bounds hold her at the threshold.
  if (!roomReady(entry)) return;

  // The hall's own copy of her door is shut, so she comes out just clear
  // of it — it reads as having closed behind her.
  const past = link.depthPast(player.position);
  const pose = carryPose(link.toHall, link.yawToHall);
  pose.feet.addScaledVector(link.outward, Math.max(0, HALL_DOOR_CLEARANCE - past));
  enterPreloadedRoom(entry, pose);
  armCaineArrival();
}

function walkIntoPomniRoom(entry, doorway) {
  if (entry?.failed || (roomReady(entry) && !entry.result.hallLink)) {
    dropRoomPreload();
    travelTo('pomni');
    return;
  }
  if (!entry?.peeking) return; // not ready yet: she's at the edge of the hall's floor

  const link = entry.result.hallLink;
  const past = doorway.depthPast(player.position);
  const pose = carryPose(link.toHall.clone().invert(), -link.yawToHall);
  // Just clear of her (open) door's leaf and the doorway, inside.
  pose.feet.addScaledVector(link.outward, -Math.max(0, BEDROOM_DOOR_CLEARANCE - past));
  enterPreloadedRoom(entry, pose);
  // Looking back out, the hall's right there through the open door.
  currentRoom.userData.dormHallPreview?.setVisible(true);
}

/**
 * Switches rooms mid-game, keeping the mouse captured: the loading screen
 * shows over the game and play carries straight on once the room is in.
 */
function travelTo(roomKey) {
  if (!readyToPlay) return; // Ignore further interaction while a transition is loading.
  overlay.classList.remove('hidden');
  selectRoom(roomKey, {
    from: currentRoomKey,
    onReady: () => {
      if (isLocked) {
        overlay.classList.add('hidden');
      } else {
        overlayTitle.textContent = 'Click to Play';
        overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
      }
    },
  });
}

function checkTriggers(player) {
  if (reachedExit || caught) return;

  for (const hazard of hazards) {
    const dx = player.position.x - hazard.mesh.position.x;
    const dz = player.position.z - hazard.mesh.position.z;
    if (Math.hypot(dx, dz) < hazard.radius + PLAYER_RADIUS) {
      caught = true;
      endLevel('Abstracted!', 'A patrolling hazard caught you — try again.');
      return;
    }
  }

  if (!triggers) return;
  triggerProbe.set(player.position.x, floorY + 0.5, player.position.z);

  if (!foundJax && triggers.jax.containsPoint(triggerProbe)) {
    foundJax = true;
    showHint('You found Jax. (Dialogue goes here.)');
  }

  if (triggers.exit.containsPoint(triggerProbe)) {
    reachedExit = true;
    endLevel(
      'Maze Complete!',
      foundJax ? 'You found Jax and the exit.' : 'You reached the exit — but never found Jax.',
    );
  }
}

function updateMovement(deltaSeconds) {
  const speed = WALK_SPEED * (move.sprint ? SPRINT_MULTIPLIER : 1);

  velocity.x = Number(move.right) - Number(move.left);
  velocity.z = Number(move.back) - Number(move.forward);
  if (velocity.lengthSq() > 0) velocity.normalize();
  velocity.multiplyScalar(speed * deltaSeconds);

  // Camera-relative basis: W always walks "into the screen".
  moveForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  moveRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

  // Turn Pomni toward the direction she's being steered.
  wishDirection.set(0, 0, 0)
    .addScaledVector(moveRight, velocity.x)
    .addScaledVector(moveForward, -velocity.z);
  if (wishDirection.lengthSq() > 1e-8) {
    const targetYaw = Math.atan2(wishDirection.x, wishDirection.z);
    pomni.rotation.y = dampAngle(pomni.rotation.y, targetYaw, TURN_SHARPNESS, deltaSeconds);
  }

  const frameStartX = player.position.x;
  const frameStartZ = player.position.z;

  if (collisionMeshes.length > 0) {
    // GLB rooms: pass the frame's displacement through the wall probes and
    // the floor follow before it is applied.
    moveDelta
      .set(0, 0, 0)
      .addScaledVector(moveRight, velocity.x)
      .addScaledVector(moveForward, -velocity.z);

    const distance = moveDelta.length();
    if (distance > 1e-6) {
      moveDelta.divideScalar(distance);
      moveStart.copy(player.position);
      const startClearance = bodyClearance(player);

      moveWithCollisions(player, moveDelta, distance);
      if (!acceptMove(player, startClearance)) {
        // Blocked as a whole: try the X and Z parts on their own, so the
        // player still slides past instead of sticking.
        moveDelta.subVectors(player.position, moveStart).setY(0);
        const parts = [[moveDelta.x, 0], [0, moveDelta.z]];
        let accepted = false;
        for (const [dx, dz] of parts) {
          const length = Math.hypot(dx, dz);
          if (length < 1e-6) continue;
          player.position.copy(moveStart);
          moveWithCollisions(player, partDirection.set(dx / length, 0, dz / length), length);
          if (acceptMove(player, startClearance)) {
            accepted = true;
            break;
          }
        }
        if (!accepted) player.position.copy(moveStart);
      }
    }
  } else {
    player.position.addScaledVector(moveRight, velocity.x).addScaledVector(moveForward, -velocity.z);

    resolveWallCollisions(player.position);

    if (bounds) {
      player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
      player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
      player.position.y = floorY + PLAYER_HEIGHT;
    }
  }

  // Animate from how far she actually got, so walking into a wall doesn't bob.
  const moved = Math.hypot(player.position.x - frameStartX, player.position.z - frameStartZ);
  if (shouldShowObjective(gameplayHUDContext()) && (move.forward || move.back || move.left || move.right)) {
    controlsTutorial.move(moved, move.sprint);
  }
  updatePomniWalk(deltaSeconds, deltaSeconds > 0 ? moved / deltaSeconds : 0);

  checkTriggers(player);
  checkPortals();
  updateHallLink();
  updatePomniDoorway();
}

/** Frame-rate-independent turn toward `target`, always taking the short way round. */
function dampAngle(current, target, sharpness, dt) {
  const diff = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + diff * (1 - Math.exp(-sharpness * dt));
}

/**
 * Plays Idle/Walk/Run from her real ground speed, scaling the clip's
 * playback so her feet match how fast she's actually moving. Without
 * clips (the placeholder), walking is faked: a small hop per step plus a
 * side-to-side waddle, faded in and out with her speed.
 */
function updatePomniWalk(dt, speed) {
  if (paused) dt = 0;
  if (pomniMixer) {
    pomniSpeaking?.remove();
    animSpeed = THREE.MathUtils.damp(animSpeed, speed, 12, dt);
    if (animSpeed < 0.2) {
      playAction('idle');
    } else if (animSpeed > RUN_THRESHOLD && pomniActions.run) {
      playAction('run');
      pomniActions.run.timeScale = animSpeed / RUN_CLIP_SPEED;
    } else {
      playAction('walk');
      pomniActions.walk.timeScale = animSpeed / WALK_CLIP_SPEED;
    }
    pomniMixer.update(dt);
    applyStagePose(dt);
    pomniSpeaking?.update(dt, dialogueUI.currentSpeaker === 'pomni' && player.visible
      && !activeOpening?.active && !stageWalk && !stageGesture && stageSeatY === null && animSpeed < .2);
    return;
  }

  walkAmount = THREE.MathUtils.damp(walkAmount, speed > 0.1 ? 1 : 0, 10, dt);
  walkPhase += speed * dt * STEPS_PER_METRE * Math.PI;

  pomni.position.y = -PLAYER_HEIGHT + Math.abs(Math.sin(walkPhase)) * WALK_BOB_HEIGHT * walkAmount;
  pomni.rotation.z = Math.sin(walkPhase) * WALK_SWAY * walkAmount;
}

/** Cross-fades from whatever Pomni is playing to the named clip. */
function playAction(name) {
  const next = pomniActions[name];
  if (!next || next === currentAction) return;
  next.reset().fadeIn(ACTION_FADE).play();
  currentAction?.fadeOut(ACTION_FADE);
  currentAction = next;
}

// --- Staging: scripted moves for a room's story beats ---
// Rooms get `stage` (via selectRoom's loader options) to act out what a
// dialogue script describes — Pomni knocking, walking through a door,
// sitting down — instead of the player doing it. While any of it runs the
// player's own movement, mouse-look and E prompts are frozen (stageBusy).

const STAGE_WALK_SPEED = 1.6;   // m/s: an unhurried walk
const KNOCK_DURATION = 1.4;     // seconds: raise, three taps, lower
const KNOCK_TAPS = 3;
const SEAT_CLEARANCE = 0.06;    // her hips this far above the seat
const SIT_SHARPNESS = 6;

let stageWalk = null;    // { points: Vector3[], index, speed, resolve }
let stageGesture = null; // { name, time, taps, onTap, resolve }
let stageSeatY = null;   // world height of the seat she's sitting on, or null
let stageDelay = null;
let stageCamera = null;
let stageHold = false;   // a room asked to keep control frozen (between beats)
let sitAmount = 0;       // 0 standing .. 1 seated, eased
const stageHeading = new THREE.Vector3();

function stageBusy() {
  return stageHold || stageWalk !== null || stageGesture !== null || stageSeatY !== null || stageDelay !== null;
}

/** Turns Pomni to face (x, z) and swings the camera round behind her. */
function facePomni(x, z) {
  const facing = Math.atan2(x - player.position.x, z - player.position.z);
  pomni.rotation.y = facing;    // her model faces +Z
  cameraYaw = facing + Math.PI; // behind her, looking the same way
  cameraPitch = DEFAULT_PITCH;
}

const stage = {
  /** Puts Pomni at (x, z) — feet on `y`, or on whatever floor is there — facing `lookAt`. */
  place({ x, z, y, lookAt }) {
    player.position.set(x, (y ?? floorY) + PLAYER_HEIGHT, z);
    if (y === undefined) settleOnGround(player);
    if (lookAt) facePomni(lookAt.x, lookAt.z);
  },

  /** Walks her through each point in turn (no collision); resolves on arrival. */
  walkTo(points, { speed = STAGE_WALK_SPEED } = {}) {
    stageWalk?.resolve(false);
    return new Promise((resolve) => {
      stageWalk = { points: points.map((p) => new THREE.Vector3(p.x, 0, p.z)), index: 0, speed, resolve };
    });
  },

  /** Plays a gesture on top of her idle. 'knock' calls onTap at each rap. */
  gesture(name, { onTap } = {}) {
    stageGesture?.resolve(false);
    return new Promise((resolve) => {
      stageGesture = { name, time: 0, taps: 0, onTap, resolve };
    });
  },

  /** Sits her down where she stands on a seat at world height seatY, facing lookAt. */
  sit(seatY, { lookAt } = {}) {
    if (lookAt) facePomni(lookAt.x, lookAt.z);
    stageSeatY = seatY;
  },

  stand() {
    stageSeatY = null;
  },

  wait(seconds) {
    stageDelay?.resolve(false);
    return new Promise(resolve => { stageDelay = { remaining: seconds, resolve }; });
  },

  frame({ position, target }) {
    stageCamera = { position: new THREE.Vector3(...position), target: new THREE.Vector3(...target) };
  },

  releaseCamera() { stageCamera = null; },

  /** Frames the shot: the follow camera's yaw (0 looks toward -Z) and pitch. */
  setCamera({ yaw, pitch = DEFAULT_PITCH }) {
    cameraYaw = yaw;
    cameraPitch = pitch;
  },

  /** Keeps the player's controls frozen (true) between staged beats. */
  hold(frozen) {
    stageHold = frozen;
  },

  lookAt(point) {
    facePomni(point.x, point.z);
  },
};

/** Cancels anything staged; on room change and when a room resets its scene. */
function resetStage() {
  pomniSpeaking?.reset();
  stageWalk?.resolve(false);
  stageGesture?.resolve(false);
  stageDelay?.resolve(false);
  stageWalk = null;
  stageGesture = null;
  stageSeatY = null;
  stageDelay = null;
  stageCamera = null;
  stageHold = false;
  sitAmount = 0;
}
stage.reset = resetStage;

/** One frame of a scripted walk: straight lines between the points, following the floor. */
function updateStageWalk(dt) {
  const walk = stageWalk;
  const target = walk.points[walk.index];
  stageHeading.set(target.x - player.position.x, 0, target.z - player.position.z);
  const distance = stageHeading.length();
  const step = walk.speed * dt;

  if (distance <= step) {
    player.position.x = target.x;
    player.position.z = target.z;
    walk.index++;
  } else {
    stageHeading.divideScalar(distance);
    player.position.x += stageHeading.x * step;
    player.position.z += stageHeading.z * step;
    const facing = Math.atan2(stageHeading.x, stageHeading.z);
    pomni.rotation.y = dampAngle(pomni.rotation.y, facing, TURN_SHARPNESS, dt);
    cameraYaw = dampAngle(cameraYaw, facing + Math.PI, 3, dt);
  }
  settleOnGround(player);
  updatePomniWalk(dt, walk.speed);

  if (walk.index >= walk.points.length) {
    stageWalk = null;
    walk.resolve(true);
  }
}

/**
 * Layers the staged gesture/seat on the clip pose updatePomniWalk just
 * played (see bendBone for the axes). Knock: right arm raised forward,
 * forearm rapping KNOCK_TAPS times. Sit: hips lowered onto the seat,
 * thighs forward, shins hanging.
 */
function applyStagePose(dt) {
  sitAmount = THREE.MathUtils.damp(sitAmount, stageSeatY === null ? 0 : 1, SIT_SHARPNESS, dt);
  const feetY = player.position.y - PLAYER_HEIGHT;
  const drop = stageSeatY === null ? 0 : Math.max(0, pomniHipsHeight - (stageSeatY - feetY) - SEAT_CLEARANCE);
  pomni.position.y = -PLAYER_HEIGHT - drop * sitAmount;
  if (sitAmount > 0.001) {
    const thigh = -1.45 * sitAmount; // forward
    bendBone(pomniBones.LeftUpLeg, pomni, SIDEWAYS, thigh);
    bendBone(pomniBones.RightUpLeg, pomni, SIDEWAYS, thigh);
    bendBone(pomniBones.LeftLeg, pomni, SIDEWAYS, -thigh);
    bendBone(pomniBones.RightLeg, pomni, SIDEWAYS, -thigh);
  }

  const gesture = stageGesture;
  if (!gesture) return;
  gesture.time += dt;
  if (gesture.name === 'knock') {
    const t = gesture.time;
    const raise = THREE.MathUtils.smoothstep(t, 0, 0.3) * (1 - THREE.MathUtils.smoothstep(t, KNOCK_DURATION - 0.3, KNOCK_DURATION));
    // Three raps in the middle of the gesture; each peak is a knock.
    const rapPhase = THREE.MathUtils.clamp((t - 0.3) / (KNOCK_DURATION - 0.6), 0, 1) * KNOCK_TAPS;
    const rap = Math.max(0, Math.sin(rapPhase * Math.PI * 2));
    if (rapPhase > gesture.taps + 0.25 && gesture.taps < KNOCK_TAPS) {
      gesture.taps++;
      gesture.onTap?.(gesture.taps);
    }
    bendBone(pomniBones.RightArm, pomni, SIDEWAYS, -1.25 * raise);
    bendBone(pomniBones.RightForeArm, pomni, SIDEWAYS, (-0.9 + 0.35 * rap) * raise);
  }
  if (gesture.time >= KNOCK_DURATION) {
    stageGesture = null;
    gesture.resolve(true);
  }
}

// --- Third-person follow camera ---

function updateCamera(dt) {
  if (stageCamera) {
    camera.position.copy(stageCamera.position);
    camera.lookAt(stageCamera.target);
    pomni.visible = true;
    return;
  }
  if (firstPerson) {
    camera.position.copy(player.position);
    cameraOffset.set(
      -Math.sin(cameraYaw) * Math.cos(cameraPitch),
      -Math.sin(cameraPitch),
      -Math.cos(cameraYaw) * Math.cos(cameraPitch),
    ); // unit vector pointing where she's looking (the third-person offset, reversed)
    camera.lookAt(cameraTarget.copy(player.position).add(cameraOffset));
    currentCameraDistance = 0;
    pomni.visible = false;
    return;
  }

  // Walking in a direction, without actively mouse-looking right now,
  // gradually turns the camera itself in behind wherever that leaves her
  // facing — so swinging the view out to one side and then just walking is
  // what brings it back, not a separate button.
  const steering = move.forward || move.back || move.left || move.right;
  if (steering && performance.now() - lastLookInputMs > LOOK_IDLE_MS) {
    cameraYaw = dampAngle(cameraYaw, pomni.rotation.y + Math.PI, CAMERA_AUTO_CORRECT_SHARPNESS, dt);
  }

  cameraTarget.set(player.position.x, player.position.y - CAMERA_TARGET_DROP, player.position.z);
  cameraOffset.set(
    Math.sin(cameraYaw) * Math.cos(cameraPitch),
    Math.sin(cameraPitch),
    Math.cos(cameraYaw) * Math.cos(cameraPitch),
  ); // unit vector pointing from Pomni back toward the camera

  // Snap in instantly when a wall gets in the way (so it never clips through),
  // but ease back out smoothly once it's clear.
  const allowed = cameraCollisionDistance(cameraTarget, cameraOffset, CAMERA_DISTANCE);
  currentCameraDistance = allowed < currentCameraDistance
    ? allowed
    : THREE.MathUtils.damp(currentCameraDistance, allowed, CAMERA_RETURN_SHARPNESS, dt);

  camera.position.copy(cameraTarget).addScaledVector(cameraOffset, currentCameraDistance);
  camera.lookAt(cameraTarget);

  pomni.visible = currentCameraDistance > MIN_VISIBLE_DISTANCE;
}

/** The cinematic uses the same exact room-ray camera collision as gameplay. */
function resolveOpeningCamera(target, desired) {
  const offset = desired.clone().sub(target);
  const length = offset.length();
  if (length < 1e-6) return desired.clone();
  offset.divideScalar(length);
  return target.clone().addScaledVector(offset, cameraCollisionDistance(target, offset, length));
}

/** How far the camera can sit along `direction` before hitting the room. */
function cameraCollisionDistance(origin, direction, maxDistance) {
  const reach = maxDistance + CAMERA_COLLISION_PAD;
  cameraRaycaster.set(origin, direction);
  cameraRaycaster.far = reach;
  let nearest = reach;

  // GLB rooms: same box broad-phase as firstWallHit, then exact triangles.
  const candidates = [];
  for (const entry of collisionMeshes) {
    if (cameraRaycaster.ray.intersectsBox(entry.box)) candidates.push(entry.mesh);
  }
  const hit = cameraRaycaster.intersectObjects(candidates, false)[0];
  if (hit) nearest = Math.min(nearest, hit.distance);

  // Maze: walls are plain Box3s, not meshes.
  for (const box of colliders) {
    if (cameraRaycaster.ray.intersectBox(box, cameraHitPoint)) {
      nearest = Math.min(nearest, cameraHitPoint.distanceTo(origin));
    }
  }
  return Math.max(0, nearest - CAMERA_COLLISION_PAD);
}

function refreshDynamicColliders() {
  for (const entry of dynamicCollisionMeshes) {
    entry.box.setFromObject(entry.mesh);
    entry.paddedBox.copy(entry.box).expandByScalar(PLAYER_RADIUS);
  }
}

/**
 * Finds the interactable under the crosshair, if it's within reach, and
 * shows its prompt. Only interactables are tested, so a door behind a
 * thin prop still counts — fine at this short range.
 *
 * Interactables with an `anchor` (NPCs) are also usable just by standing
 * near them: talking to someone shouldn't need pixel-aiming at them. The
 * crosshair still wins, so pointing at a door beside an NPC uses the door.
 */
function updateInteractionFocus() {
  let focused = null;
  if (isLocked && readyToPlay && !dialogueUI.isActive && !stageBusy() && !activeCutscene && interactables.length > 0) {
    // The crosshair ray starts behind Pomni, so reach is measured from her.
    interactRaycaster.setFromCamera(SCREEN_CENTER, camera);
    interactRaycaster.far = INTERACT_DISTANCE + currentCameraDistance;
    const available = interactables.filter(isInteractionAvailable);
    const hit = interactRaycaster.intersectObjects(available.flatMap((i) => i.objects), false)[0];
    if (hit && hit.point.distanceTo(player.position) <= INTERACT_DISTANCE) {
      focused = available.find((i) => i.objects.includes(hit.object));
    }
    focused ??= nearestInRange(available);
  }

  focusedInteractable = focused;
  interactPrompt.hidden = !focused;
  if (focused) interactPrompt.textContent = `E — ${focused.prompt()}`;
}

/** Optional room-specific enable/range gates also apply to direct ray hits. */
function isInteractionAvailable(interactable) {
  if (interactable.enabled?.() === false) return false;
  if (!interactable.anchor || interactable.radius == null) return true;
  interactable.anchor.getWorldPosition(anchorPosition);
  return Math.abs(anchorPosition.y - (player.position.y - PLAYER_HEIGHT)) <= STOREY_TOLERANCE
    && Math.hypot(anchorPosition.x - player.position.x, anchorPosition.z - player.position.z) <= interactable.radius;
}

/**
 * The closest anchored interactable within its `radius` of Pomni (on the
 * floor plane, and roughly the same storey) that she can actually see —
 * so an NPC on the far side of a wall never offers to talk.
 */
function nearestInRange(available = interactables) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const interactable of available) {
    if (!interactable.anchor) continue;
    interactable.anchor.getWorldPosition(anchorPosition);
    const feetY = player.position.y - PLAYER_HEIGHT;
    if (Math.abs(anchorPosition.y - feetY) > STOREY_TOLERANCE) continue;
    const distance = Math.hypot(anchorPosition.x - player.position.x, anchorPosition.z - player.position.z);
    const radius = interactable.radius ?? NPC_TALK_RADIUS;
    if (distance > radius || distance >= nearestDistance) continue;
    if (!hasLineOfSight(interactable)) continue;
    nearest = interactable;
    nearestDistance = distance;
  }
  return nearest;
}

/** Chest-height ray from Pomni to anchorPosition, ignoring the target's own meshes. */
function hasLineOfSight(interactable) {
  sightOrigin.set(player.position.x, player.position.y - 0.5, player.position.z);
  sightTarget.set(anchorPosition.x, anchorPosition.y + PLAYER_HEIGHT - 0.5, anchorPosition.z);
  sightDirection.subVectors(sightTarget, sightOrigin);
  const distance = sightDirection.length();
  if (distance < 1e-6) return true;
  sightDirection.divideScalar(distance);
  sightRaycaster.set(sightOrigin, sightDirection);
  sightRaycaster.far = distance;

  sightCandidates.length = 0;
  for (const entry of collisionMeshes) {
    if (interactable.objects.includes(entry.mesh)) continue;
    if (sightRaycaster.ray.intersectsBox(entry.box)) sightCandidates.push(entry.mesh);
  }
  if (sightRaycaster.intersectObjects(sightCandidates, false).length > 0) return false;
  for (const box of colliders) {
    if (sightRaycaster.ray.intersectBox(box, cameraHitPoint) && cameraHitPoint.distanceTo(sightOrigin) < distance) {
      return false;
    }
  }
  return true;
}

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  titleScreen.resize(window.innerWidth, window.innerHeight);
});

// --- Main loop ---
const clock = new THREE.Clock();

function animate() {
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, MAX_DELTA);
  // Hazards/doors/room idle animation stay live through a dialogue preview
  // (the pointer is unlocked there too, but it's not a pause) — only the
  // actual pause menu freezes them, so a patrolling hazard can't close in
  // on a player who is sitting in the pause menu.
  updateCaineArrival(delta);
  updateSearchTimer(delta);
  fastForwardCutscenes();
  if (!paused) {
    updateMovers(delta);
    if (!activeOpening?.active) roomUpdate?.(delta, player.position);
    refreshDynamicColliders();
  }
  if (!paused && stageDelay) {
    stageDelay.remaining -= delta;
    if (stageDelay.remaining <= 0) {
      const delay = stageDelay;
      stageDelay = null;
      delay.resolve(true);
    }
  }
  if (pomni && !paused) {
    if (activeEntrance?.active) {
      if (!paused) {
        updatePomniWalk(delta, 0);
        let follow;
        if (activeEntrance.phase === 'returning') {
          updateCamera(delta);
          follow = { position: camera.position.clone(), target: cameraTarget.clone() };
        }
        activeEntrance.update(rawDelta, follow);
      }
    } else if (activeOpening?.active) {
      if (!paused) {
        openingFrameProfile.frames++;
        openingFrameProfile.seconds += rawDelta;
        openingFrameProfile.maxSeconds = Math.max(openingFrameProfile.maxSeconds, rawDelta);
        let follow;
        if (activeOpening.phase === 'blending') {
          updateCamera(delta);
          follow = { position: camera.position.clone(), target: cameraTarget.clone() };
        }
        activeOpening.update(rawDelta, follow); // animation clock is not the movement/collision step clamp
      }
    } else {
      if (stageWalk && !paused) updateStageWalk(delta);
      else if (isLocked && readyToPlay && !dialogueUI.isActive && !activeJaxPass?.active && !stageBusy() && !activeCutscene) updateMovement(delta);
      else updatePomniWalk(delta, 0); // settle the waddle while paused/talking
      if (!activeCutscene) updateCamera(delta);
    }
  }
  // Background room compilation can stall a frame; keep the brief visible
  // crossing from completing between two renders on slower machines.
  if (!paused) activeJaxPass?.update(Math.min(rawDelta, .1));
  minimap.update(player.position.x, player.position.z, cameraYaw);
  updateInteractionFocus();
  const hudContext = gameplayHUDContext();
  actionCaptions.update({ opening: activeOpening, jaxPass: activeJaxPass,
    hidden: hudContext.paused || hudContext.menu || dialogueUI.isActive });
  objectiveHUD.update(hudContext, currentRoomKey === 'dorm' && portals.length > 0);
  tutorialHUD.update(hudContext, focusedBedroomDoor());
  updatePictureCounter();
  if (activeCutscene) {
    const finished = activeCutscene.update(paused ? 0 : delta);
    if (finished) {
      const { onDone } = activeCutscene;
      activeCutscene = null;
      onDone();
    }
  } else if (titleScreen.active) {
    titleScreen.update(delta);
    titleScreen.render();
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}

animate();

// Share the existing HUD policy so tips never learn from suspended controls.
function gameplayHUDContext() {
  return {
    session: preLevel1Session, room: currentRoom, ready: readyToPlay, locked: isLocked,
    paused, cinematic: activeCinematic()?.active || Boolean(activeCutscene) || stageBusy(), dialogue: dialogueUI.isActive,
    menu: titleScreen.active || !overlay.classList.contains('hidden') || !controlsPanel.hidden
      || !creditsPanel.classList.contains('hidden') || !titleOptions.hidden || !titleQuit.hidden,
  };
}

function focusedBedroomDoor() {
  return currentRoomKey === 'pomni' && focusedInteractable?.prompt() === 'Exit to Hallway';
}

/** Development-only A/B review: no gameplay/input settings or production API. */
export function setDormHallPreviewForReview(visible) {
  if (!import.meta.env.DEV) return false;
  const preview = currentRoom?.userData.dormHallPreview;
  preview?.setVisible(Boolean(visible));
  return Boolean(preview);
}

/** Read-only development diagnostics for the opening's browser regressions. */
export function getOpeningDiagnostics() {
  if (!import.meta.env.DEV) return null;
  const opening = currentRoom?.userData.pomniOpening;
  let cover, actorMeshes = 0, mirrorCount = 0;
  const jaxNodes = new Set();
  currentRoom?.userData.jaxCast?.jax.traverse(o => jaxNodes.add(o));
  currentRoom?.traverse((o) => {
    if (o.userData.name === 'Plane.003') cover = o;
    if (o.isSkinnedMesh && o.parent && o.name !== 'Caine' && !jaxNodes.has(o)) actorMeshes++;
    if (o.isReflector) mirrorCount++;
  });
  return {
    room: currentRoomKey, phase: opening?.phase ?? null, time: opening?.time ?? null,
    dialogueWaiting: dialogueUI.isWaiting,
    stagedWalk: Boolean(stageWalk), stagedSeat: stageSeatY !== null,
    stagedDelay: stageDelay?.remaining ?? null, stagedCamera: Boolean(stageCamera),
    cutsceneActive: Boolean(activeCutscene),
    ribbitComplete: storyProgress.ribbitComplete, ribbitPoints: storyProgress.ribbitPoints,
    hallwayPending: storyProgress.hallwayPending, kaufmoIntroduced: storyProgress.kaufmoIntroduced,
    picturesHeld: itemState.heldCount(), picturesPresented: itemState.totalPresented(),
    objective: objectives.active, objectiveVisible: !document.getElementById('objective-hud').hidden,
    tutorial: controlsTutorial.state, tutorialVisible: !document.getElementById('tutorial-hud').hidden,
    morningDialoguePending, preLevel1Session,
    completionCardVisible: !levelCompletePanel.hidden, caineArrivalIn,
    caineConversationBusy: caineConversation.busy,
    caineCount: scene.children.filter(child => child.name === 'Caine').length,
    pomniSpeaking: pomniSpeaking?.diagnostics ?? null, dialogueSpeaker: dialogueUI.currentSpeaker,
    caineWarningComplete: objectives.isComplete('find-caine'),
    focusedPrompt: focusedInteractable?.prompt() ?? null,
    openingElapsed: opening?.elapsed ?? null, dialogueActive: dialogueUI.isActive,
    openingCoordinated: opening?.coordinated ?? false,
    jaxPass: activeJaxPass?.diagnostics ?? null,
    jaxLoaded: Boolean(currentRoom?.userData.jaxCast),
    dialogueText: document.getElementById('dialogue-text').textContent,
    entrancePhase: currentRoom?.userData.ragathaEntrance?.phase ?? null,
    ragatha: currentRoom?.userData.ragathaEntrance?.diagnostics ?? null,
    ragathaCount: currentRoom?.children.filter(child => child.name === 'Ragatha').length ?? 0,
    entranceElapsed: currentRoom?.userData.ragathaEntrance?.elapsed ?? null,
    entranceStarted: currentRoom?.userData.ragathaEntranceStarted ?? false,
    doorAngle: currentRoom?.getObjectByName('Door_Frame024Hinge')?.rotation.y ?? 0,
    entranceSounds: currentRoom?.getObjectByName('TemporaryEntranceAudio')?.children.map(s => ({
      name: s.name, playing: s.isPlaying, scheduledAt: s._startedAt,
    })) ?? [],
    audioContextState: openingAudio.state,
    audioContextTime: openingAudio.currentTime,
    openingSounds: currentRoom?.getObjectByName('TemporaryOpeningAudio')?.children.map((sound) => ({
      name: sound.name, playing: sound.isPlaying, scheduledAt: sound._startedAt,
      position: sound.getWorldPosition(new THREE.Vector3()).toArray(),
    })) ?? [],
    titleActive: titleScreen.active,
    ready: readyToPlay, paused, locked: isLocked, completed: openingCompleted,
    player: player.position.toArray(), actorYaw: pomni?.rotation.y,
    gameplayActorVisible: player.visible && pomni?.visible,
    camera: camera.position.toArray(), cameraYaw, cameraPitch,
    cameraDirection: camera.getWorldDirection(new THREE.Vector3()).toArray(), cameraFov: camera.fov, cameraAspect: camera.aspect,
    lighting: currentRoom?.userData.bedroomLighting?.state,
    staticCoverVisible: cover?.visible, cinematicSkinMeshes: actorMeshes,
    blanketWeights: opening ? Array.from(opening.blanket.morphTargetInfluences) : null,
    idleTime: pomniActions.idle?.time, loadMilliseconds: opening?.loadMilliseconds,
    frameProfile: { ...openingFrameProfile }, memory: { ...renderer.info.memory },
    hallPreview: currentRoom?.userData.dormHallPreview ? {
      ...currentRoom.userData.dormHallPreview.metrics,
      visible: currentRoom.userData.dormHallPreview.group.visible,
    } : null,
    hallPreviewError: currentRoom?.userData.dormHallPreviewError ?? null,
    bedroomMirrorCount: mirrorCount, lastRender: { ...renderer.info.render },
    interactables: interactables.map((i) => ({ prompt: i.prompt(),
      enabled: i.enabled?.() !== false, radius: i.radius ?? null,
      anchor: i.anchor?.getWorldPosition(new THREE.Vector3()).toArray() ?? null,
      center: new THREE.Box3().setFromObject(i.objects[0]).getCenter(new THREE.Vector3()).toArray() })),
  };
}
