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
import { bendBone, SIDEWAYS } from './characters/bendBone.js';
import { preloadJaxHallwayCutscene, playJaxHallwayCutscene } from './cutscenes/jaxHallwayCutscene.js';
import { createDialogueUI } from './ui/DialogueUI.js';
import { createTitleScreen } from './ui/titleScreen.js';
import { resetEscapeThreshold, setLevelPoints } from './state/escapeThreshold.js';
import { runLevel1 } from './levels/level1.js';
import { createMinimap } from './ui/minimap.js';
import {
  SPEAKERS, preLevel1Dialogue, level1OpenDialogue, level2OpeningDialogue, level1RibbitDialogue,
  level2HandIn1Dialogue, level2HandIn2Dialogue, level2HandIn3Dialogue,
  level2IdleDialogue, level2CompleteDialogue, level2PayoffDialogue,
} from './data/dialogues.js';

// Collision fires dozens of short rays a frame (wall probe, floor probes,
// body-overlap rings). Plain three.js tests a ray against every triangle of
// each candidate mesh, which makes walking crawl in dense rooms like Pomni's
// (~120k triangles, almost all of it around the player). A BVH per mesh lets
// each ray test only the handful of triangles near it. Meshes without one
// (skinned meshes) fall back to the regular raycast.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Each preview plays over whichever room backdrop its own scene is set in.
const DIALOGUE_SCRIPTS = {
  preLevel1: { script: preLevel1Dialogue, room: 'pomni' },
  level1Open: { script: level1OpenDialogue, room: 'pomni' },
  level2Opening: { script: level2OpeningDialogue, room: 'kaufmo' },
  level1Ribbit: { script: level1RibbitDialogue, room: 'ribbit' },
  level2HandIn1: { script: level2HandIn1Dialogue, room: 'kaufmo' },
  level2HandIn2: { script: level2HandIn2Dialogue, room: 'kaufmo' },
  level2HandIn3: { script: level2HandIn3Dialogue, room: 'kaufmo' },
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
const pomniActions = {}; // lower-cased clip name -> AnimationAction
let currentAction = null;
const pomniReady = loadPomni().then(({ pomni: model, animations }) => {
  pomni = model;
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

const dialogueUI = createDialogueUI({ speakers: SPEAKERS });
const minimap = createMinimap();
let currentRoom = null;
let currentRoomKey = null;
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

function showHint(text, durationMs = 3000) {
  hint.textContent = text;
  hint.classList.add('visible');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => hint.classList.remove('visible'), durationMs);
}

roomPicker.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // don't also trigger the overlay's lock-on-click
    selectRoom(button.dataset.room);
  });
});

dialoguePicker.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    // Levels are played for real (src/levels/); the rest are text previews.
    if (button.dataset.mission) startMission(button.dataset.mission);
    else playDialoguePreview(button.dataset.dialogue);
  });
});

btnResume.addEventListener('click', (event) => {
  event.stopPropagation();
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
      // PLAY starts a fresh run: hidden score and Level 2's photos.
      resetEscapeThreshold();
      collectedItems.clear();
      presentedItems.clear();
      level2StallSeen = false;
      titleScreen.hide();
      showRoomPicker();
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
document.getElementById('btn-replay-intro').addEventListener('click', () => {
  titleOptions.hidden = true;
  titleScreen.show({ playIntro: true });
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
titleScreen.ready
  .then(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('loading');
    titleScreen.show({ playIntro: true });
  })
  .catch((err) => {
    console.error('Failed to load title screen', err);
    showRoomPicker();
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
  if (isLocked) document.exitPointerLock();
  if (dialogueUI.isActive) dialogueUI.cancel();
  minimap.hide();
  loadToken++; // discard any load still in flight for the room we're leaving
  paused = false;
  resetMoveState();
  resetStage();

  if (currentRoom) {
    scene.remove(currentRoom);
    disposeObject3D(currentRoom);
    currentRoom = null;
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

// While set, animate() renders this instead of the normal scene/camera —
// see runCutscene() and the render branch below.
let activeCutscene = null;

/**
 * Hands the render loop over to a cutscene (e.g. Jax's hallway run) until
 * it reports itself done, then calls onDone — typically to resume
 * whatever dialogue/preview was paused for it.
 */
function runCutscene(cutscene, onDone) {
  activeCutscene = { update: cutscene.update, onDone };
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
  const { script, room } = entry;

  // Pre-Level 1's "Jax storms past" plays as a cutscene cut away to the
  // real Dorm Hall (see jaxHallwayCutscene.js) rather than anything
  // happening inside this preview's own room — load it alongside the
  // room rather than after, so it's never what the player ends up
  // waiting on.
  const cutsceneReady = key === 'preLevel1' ? preloadJaxHallwayCutscene() : Promise.resolve(null);

  selectRoom(room, {
    preview: key,
    onReady: () => {
      overlay.classList.add('hidden');
      readyToPlay = false;
      resetMoveState();
      if (roomTalkPartner) turnPomniTowards(roomTalkPartner, PREVIEW_CAMERA_OFFSET);
      const roomAtLoad = currentRoom;

      cutsceneReady.then((cutsceneAssets) => {
        if (currentRoom !== roomAtLoad) return; // player backed out before it finished loading

        function finish() {
          roomDialogueCue?.(null);
          readyToPlay = true;
          overlay.classList.remove('hidden');
          overlayTitle.textContent = 'Click to Play';
          overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
        }

        // One-shot assets (a whole extra copy of the Dorm Hall) — free
        // their GPU resources once used, whether that's right after the
        // cutscene plays or because the player backed out before it got
        // that far, rather than leaking VRAM every time this gets replayed.
        let cutsceneDisposed = false;
        function disposeCutsceneAssets() {
          if (cutsceneDisposed || !cutsceneAssets) return;
          cutsceneDisposed = true;
          disposeObject3D(cutsceneAssets.scene);
        }

        // Escape mid-preview: don't leave the player stuck with both the
        // dialogue and the home overlay hidden — bail all the way out.
        const cancel = () => {
          disposeCutsceneAssets();
          returnToHome();
        };

        if (cutsceneAssets) {
          // Played in two parts around the cutscene: dialogueUI.play()'s
          // own finish() already hides the dialogue box once stopAt ends
          // part one, so there's nothing extra to hide/show by hand here.
          dialogueUI.play(script, {
            stopAt: 'afterJaxPassBy',
            onNode: roomDialogueCue,
            onComplete: () => {
              runCutscene(playJaxHallwayCutscene(renderer, cutsceneAssets), () => {
                disposeCutsceneAssets();
                dialogueUI.play(script, {
                  startAt: 'afterJaxPassBy', onNode: roomDialogueCue, onComplete: finish, onCancel: cancel,
                });
              });
            },
            onCancel: cancel,
          });
        } else {
          dialogueUI.play(script, { onNode: roomDialogueCue, onComplete: finish, onCancel: cancel });
        }
      });
    },
  });
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
function playRoomDialogue(key, {
  lookAt, onChoice, onComplete, onCancel, distressFor, onNode, startAt, stopAt,
} = {}) {
  const entry = DIALOGUE_SCRIPTS[key];
  if (!entry || dialogueUI.isActive) return;
  resetMoveState();
  if (lookAt) turnPomniTowards(lookAt);
  dialogueUI.play(entry.script, {
    onChoice, onComplete, onCancel, distressFor, onNode, startAt, stopAt,
  });
}

// --- Missions: levels that run across rooms (src/levels/) ---
// A room picked from the list is just a place to explore; a mission is the
// level played for real, moving through whichever rooms its story needs
// and driving them with the API below.

const MISSIONS = {
  level1: runLevel1,
};

const missionApi = {
  /** Loads a room from the menus (Click to Play); resolves with the loaded room. */
  enterRoom(roomKey) {
    return new Promise((resolve) => {
      selectRoom(roomKey, {
        onReady: (room) => {
          if (isLocked) {
            overlay.classList.add('hidden');
          } else {
            overlayTitle.textContent = 'Click to Play';
            overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
          }
          resolve(room);
        },
      });
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
  get stage() {
    return stage;
  },
};

function startMission(key) {
  MISSIONS[key]?.(missionApi);
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
// Minimal, scoped to just this mechanic (not the full Escape-Threshold
// score service the story doc eventually wants — that's a separate
// piece). Survives room changes on purpose: these aren't reset in
// selectRoom()/returnToHome() the way per-room scene state is, since a
// picture picked up in one room has to still be held when the player
// reaches Kaufmo in a different one.
const collectedItems = new Set(); // picked up, not yet handed in
const presentedItems = new Set(); // already handed to Kaufmo
// Whether Kaufmo's "I'm working on it, I'll find you" stall line has
// already played once. Lets the first idle revisit after the 3rd hand-in
// show that line, and only every visit after that deliver the actual
// payoff (level2Payoff) — instead of looping the stall line forever.
let level2StallSeen = false;

const itemState = {
  hasCollected: (id) => collectedItems.has(id) || presentedItems.has(id),
  collect(id) {
    if (this.hasCollected(id)) return;
    collectedItems.add(id);
    showHint(`Picked up a photo. (${collectedItems.size + presentedItems.size}/3)`);
  },
  heldCount: () => collectedItems.size,
  totalPresented: () => presentedItems.size,
  /** Hands over everything currently held; returns the new running total. */
  presentHeld() {
    for (const id of collectedItems) presentedItems.add(id);
    collectedItems.clear();
    // Only pictures actually presented to Kaufmo score: one Escape point each.
    setLevelPoints('level2', presentedItems.size);
    return presentedItems.size;
  },
  /** Which script to play on an idle revisit once all 3 are presented. */
  pickPostHandInScript() {
    if (!level2StallSeen) {
      level2StallSeen = true;
      return 'level2Complete';
    }
    return 'level2Payoff';
  },
};

function selectRoom(roomKey, { onReady, from, preview } = {}) {
  const loadRoom = ROOM_LOADERS[roomKey];
  if (!loadRoom) return;

  if (dialogueUI.isActive) dialogueUI.cancel();
  const myToken = ++loadToken; // any older in-flight load becomes stale the instant this fires
  paused = false;
  resetMoveState();
  resetStage();

  if (currentRoom) {
    scene.remove(currentRoom);
    disposeObject3D(currentRoom);
    currentRoom = null;
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
  roomPicker.hidden = true;
  dialoguePicker.hidden = true;
  btnTitle.hidden = true;
  pauseMenu.hidden = true;
  overlay.classList.add('loading');
  // Otherwise she stands alone in the void behind the loading screen.
  player.visible = false;
  overlayTitle.textContent = 'Loading…';
  overlaySubtitle.textContent = 'Fetching room model (0%)';

  Promise.all([
    loadRoom((ratio) => {
      if (myToken !== loadToken) return; // a newer selectRoom()/returnToHome() superseded this one
      overlaySubtitle.textContent = `Fetching room model (${Math.round(ratio * 100)}%)`;
    }, { from, preview, playDialogue: playRoomDialogue, endLevel, stage, items: itemState }),
    pomniReady,
  ])
    .then(([result]) => {
      if (myToken !== loadToken) {
        // Something else was picked (or Home was hit) before this load
        // finished. Attaching it now would silently resurrect a room over
        // whatever the player actually asked for, so throw it away instead.
        disposeObject3D(result.group);
        return;
      }
      applyLoadedRoom(result, onReady && (() => onReady(result)), roomKey);
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
  environment: wantsEnvironment,
}, onReady, roomKey) {
  currentRoom = group;
  currentRoomKey = roomKey;
  player.visible = true;
  scene.add(group);

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
  if (roomKey === 'dorm' && portals.length > 0) minimap.show(portals);
  else minimap.hide();

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

  readyToPlay = true;
  overlay.classList.remove('loading');
  if (onReady) {
    onReady();
  } else {
    overlayTitle.textContent = 'Click to Play';
    overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
  }
}

function disposeObject3D(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.dispose?.(); // e.g. a mirror's Reflector frees its render target
    if (child.geometry) {
      disposeBoundsTree.call(child.geometry);
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      for (const key of Object.keys(material)) {
        if (material[key]?.isTexture) material[key].dispose();
      }
      material.dispose();
    }
  });
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
  setMove(e.code, true);
  if (e.code === 'KeyE' && !e.repeat && isLocked && focusedInteractable) {
    focusedInteractable.interact(interactionContext);
  }
});
window.addEventListener('keyup', (e) => setMove(e.code, false));
// A keyup can be missed entirely (Alt-tabbing away, the OS eating a key
// combo), which leaves that direction stuck "held" until the same key is
// pressed again. Clear all of them on blur and on every transition that
// suspends normal play, so a stale flag never survives into the next state.
window.addEventListener('blur', resetMoveState);

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

// Third-person follow camera (see updateCamera).
const CAMERA_DISTANCE = 3.2;        // how far behind Pomni
const CAMERA_TARGET_DROP = 0.3;     // aim at her shoulders, a bit below PLAYER_HEIGHT
const CAMERA_COLLISION_PAD = 0.25;  // stay this far in front of any wall
const CAMERA_RETURN_SHARPNESS = 6;  // how fast it eases back out after a wall
const MIN_VISIBLE_DISTANCE = 0.7;   // hide Pomni if the camera is inside her
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const cameraHitPoint = new THREE.Vector3();
const cameraRaycaster = new THREE.Raycaster();
let currentCameraDistance = CAMERA_DISTANCE;

// Pomni turning and her walk animation (see updatePomniWalk).
const TURN_SHARPNESS = 14;     // higher = snappier turning
// Ground speed each clip's feet move at, measured at POMNI_HEIGHT; the clip
// is sped up/slowed down by actual speed ÷ this so her feet stay planted.
const WALK_CLIP_SPEED = 1.24; // 1.1 at the old 1.6 m height, scaled by 1.8/1.6
const RUN_CLIP_SPEED = 3.2;   // 2.85 at the old 1.6 m height, scaled by 1.8/1.6
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
  if (!isLocked || dialogueUI.isActive || stageBusy()) return;
  const sensitivity = MOUSE_SENSITIVITY * mouseSensitivityScale;
  cameraYaw -= e.movementX * sensitivity;
  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + e.movementY * sensitivity, PITCH_MIN, PITCH_MAX,
  );
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
// Per-frame hook for room-specific animation (e.g. Caine's idle in Pomni's room).
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

/** Walking into an archway's portal loads the room it leads to. */
function checkPortals() {
  if (portals.length === 0) return;
  // Her actual feet, not floorY: the dorm arch stands on a few steps.
  triggerProbe.set(player.position.x, player.position.y - PLAYER_HEIGHT + 0.5, player.position.z);
  // A door portal (see rooms/doors.js) only leads anywhere once it's open.
  const portal = portals.find((p) => p.box.containsPoint(triggerProbe) && (p.enabled?.() ?? true));
  if (portal) travelTo(portal.to);
}

/**
 * Switches rooms mid-game, keeping the mouse captured: the loading screen
 * shows over the game and play carries straight on once the room is in.
 */
function travelTo(roomKey) {
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
  updatePomniWalk(deltaSeconds, deltaSeconds > 0 ? moved / deltaSeconds : 0);

  checkTriggers(player);
  checkPortals();
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
  if (pomniMixer) {
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
let stageHold = false;   // a room asked to keep control frozen (between beats)
let sitAmount = 0;       // 0 standing .. 1 seated, eased
const stageHeading = new THREE.Vector3();

function stageBusy() {
  return stageHold || stageWalk !== null || stageGesture !== null || stageSeatY !== null;
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
    stageWalk?.resolve();
    return new Promise((resolve) => {
      stageWalk = { points: points.map((p) => new THREE.Vector3(p.x, 0, p.z)), index: 0, speed, resolve };
    });
  },

  /** Plays a gesture on top of her idle. 'knock' calls onTap at each rap. */
  gesture(name, { onTap } = {}) {
    stageGesture?.resolve();
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
  stageWalk?.resolve();
  stageGesture?.resolve();
  stageWalk = null;
  stageGesture = null;
  stageSeatY = null;
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
    walk.resolve();
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
    gesture.resolve();
  }
}

// --- Third-person follow camera ---

function updateCamera(dt) {
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
  if (isLocked && !dialogueUI.isActive && !stageBusy() && interactables.length > 0) {
    // The crosshair ray starts behind Pomni, so reach is measured from her.
    interactRaycaster.setFromCamera(SCREEN_CENTER, camera);
    interactRaycaster.far = INTERACT_DISTANCE + currentCameraDistance;
    const hit = interactRaycaster.intersectObjects(interactables.flatMap((i) => i.objects), false)[0];
    if (hit && hit.point.distanceTo(player.position) <= INTERACT_DISTANCE) {
      focused = interactables.find((i) => i.objects.includes(hit.object));
    }
    focused ??= nearestInRange();
  }

  focusedInteractable = focused;
  interactPrompt.hidden = !focused;
  if (focused) interactPrompt.textContent = `E — ${focused.prompt()}`;
}

/**
 * The closest anchored interactable within its `radius` of Pomni (on the
 * floor plane, and roughly the same storey) that she can actually see —
 * so an NPC on the far side of a wall never offers to talk.
 */
function nearestInRange() {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const interactable of interactables) {
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
  const delta = Math.min(clock.getDelta(), MAX_DELTA);
  // Hazards/doors/room idle animation stay live through a dialogue preview
  // (the pointer is unlocked there too, but it's not a pause) — only the
  // actual pause menu freezes them, so a patrolling hazard can't close in
  // on a player who is sitting in the pause menu.
  if (!paused) {
    updateMovers(delta);
    roomUpdate?.(delta);
    refreshDynamicColliders();
  }
  if (pomni) {
    // No walking while the next room loads, mid-conversation, or while a
    // room is staging her (see `stage`): a scripted walk drives her instead.
    if (stageWalk && !paused) updateStageWalk(delta);
    else if (isLocked && readyToPlay && !dialogueUI.isActive && !stageBusy()) updateMovement(delta);
    else updatePomniWalk(delta, 0); // settle the waddle while paused/talking
    updateCamera(delta);
  }
  minimap.update(player.position.x, player.position.z, cameraYaw);
  updateInteractionFocus();
  if (activeCutscene) {
    const finished = activeCutscene.update(delta);
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
