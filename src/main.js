import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { loadPomniRoom } from './rooms/pomniRoom.js';
import { loadDormHallRoom } from './rooms/dormHallRoom.js';
import { loadRibbitRoom } from './rooms/ribbitRoom.js';
import { loadTadcRoom } from './rooms/tadcRoom.js';
import { loadMazeRoom } from './rooms/mazeRoom.js';
import { loadKaufmoRoom } from './rooms/kaufmoRoom.js';
import { linkToHall } from './rooms/walkInLink.js';
import { loadPomni } from './characters/pomni.js';
import { createPomniGaitArms } from './characters/pomniGaitArms.js';
import { createPomniJump } from './characters/pomniJump.js';
import { createPomniSpeaking } from './characters/pomniSpeaking.js';
import { OPENING_HANDOFF } from './cinematics/pomniOpening.js';
import { createOpeningAudio } from './cinematics/openingAudio.js';
import { createRagathaEntrance } from './cinematics/ragathaEntrance.js';
import { createJaxBedroomPass, JAX_PASS_BEAT, JAX_PASS_RESUME } from './cinematics/jaxBedroomPass.js';
import { POMNI_INVITATION, POMNI_SEATED_DIALOGUE, RAGATHA_ENTRANCE_EVENT } from './cinematics/pomniInvitation.js';
import { bendBone, SIDEWAYS, UP } from './characters/bendBone.js';
import { preloadJaxHallwayCutscene, playJaxHallwayCutscene } from './cutscenes/jaxHallwayCutscene.js';
import { createCaineApproachCutscene } from './cutscenes/caineApproachCutscene.js';
import { createDialogueUI } from './ui/DialogueUI.js';
import { ICONS } from './ui/portraitIcons.js';
import { createVoicePlayer } from './audio/voicePlayer.js';
import { createAmbience } from './audio/ambience.js';
import { createMusic, DEFAULT_MUSIC_VOLUME } from './audio/music.js';
import { createTitleScreen } from './ui/titleScreen.js';
import { createGamepadInput } from './input/gamepad.js';
import { createIntroStory } from './ui/introStory.js';
import { resetEscapeThreshold, snapshotEscapeThreshold, restoreEscapeThreshold, setLevelPoints, passesJaxGate } from './state/escapeThreshold.js';
import { createChoiceTally } from './dialogue/choiceTally.js';
import { createStoryProgress, ENDING_VARIANTS } from './game/storyProgress.js';
import { createSaveSlots, parseSaveFile, saveFileContents, saveFileName } from './game/saveGame.js';
import { createLoadingBackgrounds } from './ui/loadingBackgrounds.js';
import { createLoadingSprites } from './ui/loadingSprites.js';
import { installGltfBlobCleanup, releaseTextures } from './rooms/assetLifecycle.js';
import { createLevel2Items, pickKaufmoScript, photoUrls, PHOTO_COUNT, PHOTO_THRESHOLD, PHOTO_URLS } from './state/level2Items.js';
import {createMazeEncounter} from './levels/mazeEncounter.js';
import { runMazeJaxChase } from './levels/mazeJaxChase.js';
import { createMazeSounds } from './audio/mazeSounds.js';
import { createGlitchCaption } from './ui/glitchCaption.js';
import {createMazeObjectiveHUD} from './ui/mazeObjectiveHUD.js';
import { createMazeHints } from './ui/mazeHints.js';
import './ui/mazeHints.css';
import { createMazeItems, createMazeSearch, MAZE_FINDABLES } from './state/mazeItems.js';
import { runLevel1 } from './levels/level1.js';
import { runHallwayScene } from './levels/level3Hallway.js';
import { runLobbyScene } from './levels/level3Lobby.js';
import { loadEndingCast, lobbyEndingPlan, stageLobbyEnding, createExitDoorScene } from './cutscenes/endingCutscene.js';
import { kaufmoHallwayPlan, preloadKaufmoHallwayCutscene, playKaufmoHallwayCutscene } from './cutscenes/kaufmoHallwayCutscene.js';
import { createMinimap } from './ui/minimap.js';
import { nearestLandmark } from './rooms/lobbyLandmarks.js';
import { createObjectiveController } from './game/objectives.js';
import { createObjectiveHUD } from './ui/objectiveHUD.js';
import { shouldShowObjective } from './ui/objectiveHUD.js';
import { createControlsTutorial } from './game/controlsTutorial.js';
import { createTutorialHUD } from './ui/tutorialHUD.js';
import { createActionCaptions } from './ui/actionCaptions.js';
import { createCaineConversation } from './game/caineConversation.js';
import { createCaineMemory } from './state/caineMemory.js';
import { distressFromDialogue } from './effects/abstraction.js';
import { createHandInPhotos } from './props/handInPhotos.js';
import {
  SPEAKERS, preLevel1Dialogue, level1OpenDialogue, level2OpeningDialogue, level1RibbitDialogue,
  level2IdleDialogue, level2CompleteDialogue, level2ReturnAndSendoffDialogue, level2AbstractionDialogue,
  level2TimeUpDialogue, level3HallwayDialogue, level3JaxDialogue, level3JaxFinalDialogue,
  level3JaxMumble1Dialogue, level3JaxMumble2Dialogue, mazePickupBowlingDialogue, mazePickupMugDialogue, JAX_GLITCH_FRAGMENTS,
  endingLobbySavedDialogue, endingLobbyAbstractedDialogue, exitDoorSavedDialogue, exitDoorAbstractedDialogue,
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
  level2Idle: { script: level2IdleDialogue, room: 'kaufmo' },
  level2Complete: { script: level2CompleteDialogue, room: 'kaufmo' },
  level2Return: { script: level2ReturnAndSendoffDialogue, room: 'kaufmo' },
  level2Abstraction: { script: level2AbstractionDialogue, room: 'kaufmo' },
  level2TimeUp: { script: level2TimeUpDialogue, room: 'kaufmo' },
  level3Hallway: { script: level3HallwayDialogue, room: 'dorm' },
  level3Jax: { script: level3JaxDialogue, room: 'tadc' },
  level3JaxFinal: {script:level3JaxFinalDialogue,room:'maze'},
  level3JaxMumble1: { script: level3JaxMumble1Dialogue, room: 'maze' },
  level3JaxMumble2: { script: level3JaxMumble2Dialogue, room: 'maze' },
  mazePickupBowling: { script: mazePickupBowlingDialogue, room: 'maze' },
  mazePickupMug: { script: mazePickupMugDialogue, room: 'maze' },
  endingLobbySaved: { script: endingLobbySavedDialogue, room: 'tadc' },
  endingLobbyAbstracted: { script: endingLobbyAbstractedDialogue, room: 'tadc' },
  exitDoorSaved: { script: exitDoorSavedDialogue, room: null },
  exitDoorAbstracted: { script: exitDoorAbstractedDialogue, room: null },
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
const WALK_SPEED = 3.6; // metres per second
const SPRINT_MULTIPLIER = 2.0; // running speed = WALK_SPEED × this
// Dev builds only (npm run dev): crosses rooms fast for playtesting. Kept
// moderate — every frame's step still goes through the wall probes, and a
// much longer step starts skipping thin geometry.
const DEV_SPEED_MULTIPLIER = import.meta.env.DEV ? 3 : 1;
const WALL_MARGIN = 0.4; // keep the camera this far from any wall
const STEP_HEIGHT = 0.4; // ledges up to this tall are stepped onto; taller ones block
const PROBE_HEIGHT = STEP_HEIGHT + 0.05; // height of the wall-probe ray above the feet
// Space jumps: peak height is JUMP_SPEED² / (2 × GRAVITY) ≈ 0.8m, enough to
// hop up ledges and stairs taller than STEP_HEIGHT.
const JUMP_SPEED = 4.5; // metres per second, upward at take-off
const GRAVITY = 13; // metres per second², a little floatier than real
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
// Each room's looping background bed; shares the opening audio's context.
const ambience = createAmbience(() => openingAudio.context);
// Each room's background music, layered over the ambience on the same context.
const music = createMusic(() => openingAudio.context);

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
const ENVIRONMENT_INTENSITY = 0.6;
scene.environmentIntensity = ENVIRONMENT_INTENSITY;
// A room can ask for it weaker (room.environmentIntensity). Walking straight
// from one room into the next (walkIntoRoom) it eases there, at this rate.
let environmentTarget = ENVIRONMENT_INTENSITY;
const ENVIRONMENT_EASE = 3;

// --- Player (Pomni) ---
// Stands in for the old first-person camera: position.y = feet + PLAYER_HEIGHT,
// so all the collision code below works unchanged.
const player = new THREE.Object3D();
scene.add(player);

let pomni = null;
let pomniMixer = null;
let pomniSpeaking = null;
let pomniJump = null;
let pomniGaitArms = null;
const pomniActions = {}; // lower-cased clip name -> AnimationAction
let currentAction = null;
const pomniReady = loadPomni().then(({ pomni: model, animations }) => {
  pomni = model;
  pomniSpeaking = createPomniSpeaking(pomni);
  pomniJump = createPomniJump(pomni);
  pomniGaitArms = createPomniGaitArms(pomni, animations);
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
  Hips: null, RightArm: null, RightForeArm: null, RightHand: null, LeftArm: null, LeftForeArm: null, LeftHand: null,
  LeftUpLeg: null, RightUpLeg: null, LeftLeg: null, RightLeg: null,
  Neck: null, Head: null,
};
let pomniHipsHeight = 0.8; // hips above her feet when standing; measured on load

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
createLoadingBackgrounds(overlay);
createLoadingSprites(overlay);
const roomPicker = document.getElementById('room-picker');
const dialoguePicker = document.getElementById('dialogue-picker');
const pauseMenu = document.getElementById('pause-menu');
const pauseCaption = document.getElementById('pause-caption');
const btnResume = document.getElementById('btn-resume');
const btnHome = document.getElementById('btn-home');
const caineMemory = createCaineMemory();
const pauseMemoryJoke = document.getElementById('caine-pause-joke');
const memoryCaption = document.getElementById('caine-memory-caption');
const retryMemoryCaption = document.getElementById('caine-retry-caption');
const btnTitle = document.getElementById('btn-title');
const crosshair = document.getElementById('crosshair');
const hint = document.getElementById('hint');
const hintText = document.getElementById('hint-text');
const hintPortrait = document.getElementById('hint-portrait');
const hintKicker = document.getElementById('hint-kicker');
// Written out in full so the packager (tools/package.mjs) finds each one.
const CAINE_HINT_IMAGES = [
  './models/objects/caine%20hint/images.jpg',
  './models/objects/caine%20hint/cd0a176a46b50c1866ca16e094b4f173.jpg',
  './models/objects/caine%20hint/aaa8d0ce4ae5942a836f3135c873cac0.jpg',
  './models/objects/caine%20hint/93bf485eb3201513f1c061b4679315c0.jpg',
  './models/objects/caine%20hint/79e9ddff7c4b617b721e3cb5a73d4e81.jpg',
  './models/objects/caine%20hint/33ffe84e2d0434aa12849e456528e8b3.jpg',
  './models/objects/caine%20hint/2a0d1d8f0192690e4e155e1f94738586.jpg',
  './models/objects/caine%20hint/261ccc01ee6dec910f904ffed42b06c3.jpg',
];
let nextCaineHintImage = 0;
const interactPrompt = document.getElementById('prompt');
const cinematicSkip = document.getElementById('cinematic-skip');
const skipCurtain = document.getElementById('skip-curtain');
// Skip intro runs the parts that can't be cut short (getting up, the
// entrance walks, staged pauses) this many times faster, behind skipCurtain.
const SKIP_SPEED = 12;
const levelCompletePanel = document.getElementById('level-complete-panel');
const sceneFade = document.getElementById('scene-fade');
const levelCompleteCaine = document.getElementById('level-complete-caine');
const levelCompleteTitle = document.getElementById('level-complete-title');
const levelCompleteSubtitle = document.getElementById('level-complete-subtitle');
const btnLevelCompleteContinue = document.getElementById('btn-level-complete-continue');

const pictureCounter = document.getElementById('picture-counter');
const mazeItemsCounter = document.getElementById('maze-items-counter');
const mazeSearchTimer = document.getElementById('maze-search-timer');
const searchTimer = document.getElementById('search-timer');
const hintKey = document.getElementById('hint-key');
const dialogueVoice = createVoicePlayer();
// The narrated backstory a new game opens with (PLAY or Options > New Game).
const introStory = createIntroStory({ root: document.getElementById('intro-story'), voice: dialogueVoice });
// Escape mid-game pauses (it frees the mouse) rather than backing out of a
// conversation; it only cancels on the menu screens (dialogue previews).
// The browser may report the unlock just before or just after the key.
let lastUnlockMs = -Infinity;
const ESCAPE_UNLOCK_WINDOW_MS = 500;
const dialogueUI = createDialogueUI({
  speakers: SPEAKERS,
  voice: dialogueVoice,
  // Never during the opening's story conversations: cancelling one sent
  // Ragatha out of the room for good, and T only replayed her lines. In a
  // cinematic, Escape (and the controller's B) falls through to its pause.
  escapeCancels: () => !isLocked && !paused && !activeCinematic()?.active && !openingInvitationPlaying
    && performance.now() - lastUnlockMs > ESCAPE_UNLOCK_WINDOW_MS,
  controllerPrompts: () => (gamepad.active ? {
    continue: `press ${gamepad.label('Space')} to continue ▾`,
    choice: `↑/↓ to pick · ${gamepad.label('Space')} to choose`,
  } : null),
});
const actionCaptions = createActionCaptions();
const minimap = createMinimap();
const objectives = createObjectiveController();
const objectiveHUD = createObjectiveHUD({ objectives, root: document.getElementById('objective-hud') });
const controlsTutorial = createControlsTutorial();
const tutorialHUD = createTutorialHUD({
  tutorial: controlsTutorial, root: document.getElementById('tutorial-hud'), portraits: CAINE_HINT_IMAGES,
  // Controller wording while the pad is in use; null keeps the keyboard lines.
  labelFor: (id) => {
    if (!gamepad.active) return null;
    return {
      move: 'Left stick - Move',
      look: 'Right stick - Look around',
      run: `Hold ${gamepad.label('ShiftLeft')} - Run`,
      interact: `Press ${gamepad.label('KeyE')} - Interact`,
    }[id];
  },
});
let preLevel1Session = false;
let storySessionId = 0;
let morningDialoguePending = false;
// Saving (see takeCheckpoint): the latest checkpoint, and how Pomni came
// into the current room (a loaded save arrives the same way).
let checkpoint = null;
let currentRoomFrom = null;
let restoringSave = false;
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
// Pomni's "Come in." after an opening without the seated shot runs outside
// any cinematic, so there's no pause to fall back on; Escape just waits.
let openingInvitationPlaying = false;
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

// Hints name keyboard keys ("Press T to continue"); while the controller is
// in use, name the pad button standing in for that key instead.
const HINT_KEYS = { E: 'KeyE', H: 'KeyH', T: 'KeyT', V: 'KeyV' };

function showHint(text, durationMs = 3000, { caine = false } = {}) {
  hintText.textContent = text.replace(/\b([Pp]ress) ([EHTV])\b/g,
    (match, press, key) => `${press} ${gamepad.label(HINT_KEYS[key])}`);
  hint.classList.toggle('hint--caine', caine);
  hintKicker.hidden = !caine;
  hintPortrait.hidden = !caine;
  if (caine) {
    hintPortrait.src = CAINE_HINT_IMAGES[nextCaineHintImage % CAINE_HINT_IMAGES.length];
    hintPortrait.alt = 'Caine';
    nextCaineHintImage++;
  } else {
    hintPortrait.removeAttribute('src');
    hintPortrait.alt = '';
  }
  hint.classList.add('visible');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => hint.classList.remove('visible'), durationMs);
}

roomPicker.querySelectorAll('button[data-room]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // don't also trigger the overlay's lock-on-click
    openingCompleted = false;
    resetObjectiveSession();
    resetMazeAttempt(); // a fresh maze: new layout, both keepsakes back, full clock
    selectRoom(button.dataset.room);
  });
});

dialoguePicker.querySelectorAll('button[data-story]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    startNewGame(); // the story for real, from the opening
  });
});
// The narrated intro panels, then on into the new game like PLAY. Always
// plays, even with dev mode's skip-cutscenes on, since it was asked for.
document.getElementById('btn-backstory').addEventListener('click', (event) => {
  event.stopPropagation();
  openingAudio.unlock(); // while this click still counts as a user gesture
  introStory.play(() => startNewGame());
});

// --- Developer jumps ----------------------------------------------------
// Every level, and every cutscene between them, from its own start, so any
// one can be tested without playing what comes before. A jump is a story
// checkpoint, just like a save (see loadGame): the objectives done by then,
// Ribbit's points, the photos, the keepsakes. Most then begin the way the
// story does on arriving in that room (Caine's arrival timer, the Jax
// scenes). `start` is for beats that begin with an action instead (a
// knock, a conversation, a cutscene): it runs as the player clicks in, so
// nothing plays behind the Click to Play screen.
const STORY_ORDER = ['find-caine', 'find-ribbit', 'find-kaufmo', 'collect-photos', 'check-kaufmo', 'find-jax', 'follow-jax', 'enter-maze'];
const ALL_PHOTOS = Object.keys(PHOTO_URLS);

/** The checkpoint for the story with `active` the current objective. */
function storyAt(active, { room, from = null, story = {}, items, maze } = {}) {
  const completed = STORY_ORDER.slice(0, STORY_ORDER.indexOf(active));
  const done = (id) => completed.includes(id);
  return {
    room, from,
    objectives: { active, completed },
    story: {
      ribbitPoints: done('find-ribbit') ? 4 : null,
      hallwaySeen: done('find-kaufmo'),
      kaufmoIntroduced: done('find-kaufmo'),
      ...story,
    },
    // Handing photos in moves them from collected (in her hands) to presented.
    items: items ?? (done('collect-photos') ? { collected: [], presented: ALL_PHOTOS, done: true } : {}),
    maze: maze ?? {},
    mazeHints: {},
    escape: { ...(done('find-ribbit') && { level1: 4 }), ...(done('collect-photos') && { level2: ALL_PHOTOS.length }) },
    morningDialoguePending: false,
  };
}

const knockOnRibbitsDoor = () => interactables.find((interactable) => interactable.storyKnock)?.interact();
const talkToKaufmoNow = () => currentRoomInfo?.kaufmoApi && talkToKaufmo(currentRoomInfo.kaufmoApi, loadToken);

const DEV_JUMPS = {
  // Pre-story: the morning is the very start (New Game); Caine's arrival comes next.
  caine: { checkpoint: storyAt('find-caine', { room: 'dorm', from: 'pomni' }) },
  // Level 1: Ribbit, from her door.
  level1: { checkpoint: storyAt('find-ribbit', { room: 'dorm', from: 'ribbit' }), start: knockOnRibbitsDoor },
  // Level 1 -> 2: Kaufmo hurrying past in the hall, then on into his room.
  kaufmoHallway: { checkpoint: storyAt('find-kaufmo', { room: 'dorm' }), start: () => playKaufmoHallway() },
  // Level 2: his introduction, the search on its own, and the hand-in scene.
  level2Intro: { checkpoint: storyAt('find-kaufmo', { room: 'kaufmo', from: 'dorm', story: { hallwaySeen: true } }), start: talkToKaufmoNow },
  level2Search: { checkpoint: storyAt('collect-photos', { room: 'tadc' }) },
  level2HandIn: { checkpoint: storyAt('collect-photos', { room: 'kaufmo', from: 'dorm', items: { collected: ALL_PHOTOS } }), start: talkToKaufmoNow },
  // Level 2 -> 3: Jax bolting down the hall, then his corner of the Lobby and the maze door.
  jaxHallway: { checkpoint: storyAt('find-jax', { room: 'dorm', from: 'kaufmo' }) },
  jaxLobby: { checkpoint: storyAt('follow-jax', { room: 'tadc', from: 'dorm' }) },
  // Level 3: the maze from its start, and its last act with both keepsakes found.
  level3: { checkpoint: storyAt('enter-maze', { room: 'maze', from: 'tadc' }) },
  level3LastAct: { checkpoint: storyAt('enter-maze', { room: 'maze', from: 'tadc', maze: { collected: MAZE_FINDABLES.map(({ id }) => id) } }) },
};

let pendingJumpStart = null; // { room, start }: run once she's in that room and clicks in

function devJump(key) {
  const jump = DEV_JUMPS[key];
  if (!jump) return;
  loadGame(jump.checkpoint);
  pendingJumpStart = jump.start ? { room: jump.checkpoint.room, start: jump.start } : null;
}

function runPendingJumpStart() {
  if (!pendingJumpStart || currentRoomKey !== pendingJumpStart.room || !readyToPlay) return;
  const { start } = pendingJumpStart;
  pendingJumpStart = null;
  start();
}

dialoguePicker.querySelectorAll('button[data-jump]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    devJump(button.dataset.jump);
  });
});

// Jumps to the ending for playtesting, skipping the maze: the same fade,
// recorded outcome and ending as walking out of it (see leaveMaze).
for (const variant of ENDING_VARIANTS) {
  document.getElementById(`btn-ending-${variant}`).addEventListener('click', (event) => {
    event.stopPropagation();
    // Also invalidate an earlier ending whose cast is still loading, before
    // it has a room or dialogue for returnToHome's usual cleanup to find.
    returnToHome();
    resetObjectiveSession(true);
    titleScreen.hide();
    void leaveMaze(variant);
  });
}

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

// Flavor controls never change pause, dialogue, audio, timers, or saves.
function hideMemoryText() {
  pauseMemoryJoke.hidden = memoryCaption.hidden = retryMemoryCaption.hidden = true;
  pauseMemoryJoke.textContent = memoryCaption.textContent = retryMemoryCaption.textContent = '';
}
function showPauseMemory() {
  const text = caineMemory.takePauseJoke();
  pauseMemoryJoke.textContent = text ?? '';
  pauseMemoryJoke.hidden = !text;
}
const memorySettings = document.querySelectorAll('[data-caine-enabled]');
for (const input of memorySettings) {
  input.checked = caineMemory.enabled;
  input.addEventListener('change', event => {
    event.stopPropagation();
    caineMemory.setEnabled(input.checked);
    for (const setting of memorySettings) setting.checked = caineMemory.enabled;
    if (!caineMemory.enabled) hideMemoryText();
  });
}
for (const button of document.querySelectorAll('[data-caine-clear]')) {
  button.addEventListener('click', event => {
    event.stopPropagation();
    caineMemory.clear();
    hideMemoryText();
    document.getElementById('caine-memory-note').textContent = 'Caine’s local retry/run history was cleared. Campaign saves are unchanged.';
  });
}
function updateMemoryCaption(delta, context) {
  const playable = Boolean(context.room && context.ready && context.locked
    && !context.paused && !context.cinematic && !context.dialogue && !context.menu
    && savePanel.hidden && levelCompletePanel.hidden && !document.hidden);
  const text = caineMemory.updateCaption(delta, { playable });
  if (memoryCaption.textContent !== (text ?? '')) memoryCaption.textContent = text ?? '';
  memoryCaption.hidden = !text;
}

// --- Title screen ---
const titleOptions = document.getElementById('title-options');
const titleQuit = document.getElementById('title-quit');
const sensitivityInput = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivity-value');
const SENSITIVITY_KEY = 'tadc.mouseSensitivity';
const voiceVolumeInput = document.getElementById('voice-volume');
const voiceVolumeValue = document.getElementById('voice-volume-value');
const VOICE_VOLUME_KEY = 'tadc.voiceVolume';
const ambienceVolumeInput = document.getElementById('ambience-volume');
const ambienceVolumeValue = document.getElementById('ambience-volume-value');
const AMBIENCE_VOLUME_KEY = 'tadc.ambienceVolume';
const DEFAULT_AMBIENCE_VOLUME = 0.45;
const musicVolumeInput = document.getElementById('music-volume');
const musicVolumeValue = document.getElementById('music-volume-value');
const MUSIC_VOLUME_KEY = 'tadc.musicVolume';

// A page opened in a background tab waits until it's actually viewed.
let titleThemeWaiting = false;
function startTitleTheme() {
  if (document.hidden) {
    if (titleThemeWaiting) return;
    titleThemeWaiting = true;
    document.addEventListener('visibilitychange', () => {
      titleThemeWaiting = false;
      if (titleScreen.active) startTitleTheme();
    }, { once: true });
    return;
  }
  openingAudio.unlock();
  openingAudio.setMainThemeVolume(0.5);
  openingAudio.playMainTheme();
}

// Keys shouldn't drive the menu hidden behind an open panel.
const titleMenuBlocked = () => !titleOptions.hidden || !titleQuit.hidden || !creditsPanel.classList.contains('hidden');
const titleScreen = createTitleScreen({
  renderer,
  onIntroStart: startTitleTheme,
  onMenu: startTitleTheme,
  isBlocked: titleMenuBlocked,
  onAction: (action) => {
    if (action === 'play') {
      startNewGameWithStory();
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
const titleMusicToggle = document.getElementById('title-music-toggle');
function updateTitleMusicToggle() {
  const muted = openingAudio.mainThemeMuted;
  titleMusicToggle.classList.toggle('is-muted', muted);
  titleMusicToggle.setAttribute('aria-pressed', String(muted));
  titleMusicToggle.setAttribute('aria-label', `${muted ? 'Unmute' : 'Mute'} title screen music`);
  titleMusicToggle.title = `${muted ? 'Unmute' : 'Mute'} title screen music`;
}
titleMusicToggle.addEventListener('click', event => {
  event.stopPropagation();
  openingAudio.setMainThemeMuted(!openingAudio.mainThemeMuted);
  updateTitleMusicToggle();
});
titleMusicToggle.addEventListener('pointermove', event => {
  titleScreen.pointGloveAt(event.clientX, event.clientY);
});
updateTitleMusicToggle();
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

// Dialogue voice volume, 0 (off) to 1. Same persistence as the sensitivity.
function setVoiceVolume(value) {
  dialogueVoice.setVolume(value);
  voiceVolumeInput.value = value;
  voiceVolumeValue.textContent = value === 0 ? 'off' : `${Math.round(value * 100)}%`;
}
try {
  const stored = Number(localStorage.getItem(VOICE_VOLUME_KEY) ?? 1);
  setVoiceVolume(Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 1);
} catch {
  setVoiceVolume(1);
}
voiceVolumeInput.addEventListener('input', () => {
  setVoiceVolume(Number(voiceVolumeInput.value));
  try {
    localStorage.setItem(VOICE_VOLUME_KEY, voiceVolumeInput.value);
  } catch {
    // Storage blocked — the setting just won't persist.
  }
});

// Room ambience volume, 0 (off) to 1, persisted the same way.
function setAmbienceVolume(value) {
  ambience.setVolume(value);
  ambienceVolumeInput.value = value;
  ambienceVolumeValue.textContent = value === 0 ? 'off' : `${Math.round(value * 100)}%`;
}
try {
  const stored = Number(localStorage.getItem(AMBIENCE_VOLUME_KEY) ?? DEFAULT_AMBIENCE_VOLUME);
  setAmbienceVolume(Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : DEFAULT_AMBIENCE_VOLUME);
} catch {
  setAmbienceVolume(DEFAULT_AMBIENCE_VOLUME);
}
ambienceVolumeInput.addEventListener('input', () => {
  setAmbienceVolume(Number(ambienceVolumeInput.value));
  try {
    localStorage.setItem(AMBIENCE_VOLUME_KEY, ambienceVolumeInput.value);
  } catch {
    // Storage blocked — the setting just won't persist.
  }
});

// Background music volume, 0 (off) to 1, persisted the same way.
function setMusicVolume(value) {
  music.setVolume(value);
  musicVolumeInput.value = value;
  musicVolumeValue.textContent = value === 0 ? 'off' : `${Math.round(value * 100)}%`;
}
try {
  const stored = Number(localStorage.getItem(MUSIC_VOLUME_KEY) ?? DEFAULT_MUSIC_VOLUME);
  setMusicVolume(Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : DEFAULT_MUSIC_VOLUME);
} catch {
  setMusicVolume(DEFAULT_MUSIC_VOLUME);
}
musicVolumeInput.addEventListener('input', () => {
  setMusicVolume(Number(musicVolumeInput.value));
  try {
    localStorage.setItem(MUSIC_VOLUME_KEY, musicVolumeInput.value);
  } catch {
    // Storage blocked — the setting just won't persist.
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
// Development-only reproduction of a reported Level 3 layout. Normal loads
// choose a new seed, available through getOpeningDiagnostics().mazeSeed.
const devMazeSeed = (() => {
  if (!import.meta.env.DEV) return undefined;
  const value = new URLSearchParams(window.location.search).get('mazeSeed');
  if (value === null) return undefined;
  const seed = Number(value);
  if (/^\d+$/.test(value) && Number.isInteger(seed) && seed <= 0xffffffff) return seed;
  console.warn('Ignoring invalid mazeSeed; use an integer from 0 to 4294967295.');
  return undefined;
})();
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
  startNewGameWithStory();
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
// While the skip button is up, Escape presses it. Captured ahead of the
// pause and dialogue handlers, which would otherwise pause the opening or
// cancel its conversation. P still pauses.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || event.repeat || paused || cinematicSkip.hidden) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  cinematicSkip.click();
}, true);
document.getElementById('btn-options-credits').addEventListener('click', openCredits);
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
  // The title music is the title screen's: it fades out here (and starts
  // again if they go back to it, as its menu starts it).
  openingAudio.stopMainTheme();
  overlay.classList.remove('hidden');
  overlay.classList.remove('loading');
  overlayTitle.textContent = 'Jump in';
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
  sceneFade.classList.remove('on', 'white');
  // Only restart the theme after the story faded it out; backing out of the
  // menus (Options -> Room previews -> Title screen) keeps it playing.
  if (openingAudio.mainThemeVolume < 0.5) openingAudio.stopMainTheme();
  pendingJumpStart = null;
  mazeHints.hide();
  mazeItemsCounter.hidden = true;
  mazeSearchTimer.hidden = true;
  resetMazeAttempt();
  skipIntroRequested = false;
  dropRoomPreload();
  resetObjectiveSession();
  loadToken++; // invalidate dialogue callbacks before cancelling the old UI
  activeJaxPass?.dispose(); activeJaxPass = null;
  cancelCutscene();
  cancelLevelComplete();
  activeEntrance?.dispose(); activeEntrance = null; openingInvitationPlaying = false;
  activeOpening = null;
  cinematicSkip.hidden = true;
  if (isLocked) document.exitPointerLock();
  if (dialogueUI.isActive) dialogueUI.cancel();
  minimap.hide();
  paused = false;
  ambience.setRoom(null);
  ambience.setPaused(false);
  music.setRoom(null);
  music.setPaused(false);
  openingAudio.setMainThemePaused(false);
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
  mazeEncounter?.dispose();mazeEncounter=null;
  mazeSounds?.dispose();mazeSounds=null;mazeChase?.stop();mazeChase=null;
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
 * PLAY and Options > New Game: the intro story (src/ui/introStory.js) first,
 * then the new game. It starts and ends on black, like the title's fade
 * into the tent and Pomni's dark bedroom on either side of it. Dev mode's
 * skip-cutscenes setting and the dev story button go straight to the game.
 */
function startNewGameWithStory() {
  if (devSkipCutscenesInput.checked) {
    startNewGame();
    return;
  }
  openingAudio.unlock(); // while this click/keypress still counts as a user gesture
  titleScreen.hide();
  introStory.play(() => startNewGame());
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
  resetMazeAttempt();
  resetObjectiveSession(true);
  openingAudio.unlock();
  openingAudio.setMainThemeVolume(0.5);
  if (isLocked) document.exitPointerLock();
  titleScreen.hide();
  openingCompleted = false;
  selectRoom('pomni', { openingMode: 'play' });
  caineMemory.beginRun();
}

function resetObjectiveSession(active = false) {
  caineMemory.cancelCaption();
  hideMemoryText();
  storySessionId++;
  storyProgress.reset();
  cancelLevelComplete();
  caineConversation.cancelPending();
  preLevel1Session = active;
  morningDialoguePending = false;
  objectives.reset(); objectiveHUD.hide();
  controlsTutorial.reset(); tutorialHUD.hide();
  checkpoint = null; // a new session has nothing to save until its first checkpoint
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
  ambience.setPaused(value);
  music.setPaused(value);
  openingAudio.setMainThemePaused(value);
  dialogueUI.setPaused(value);
  if (!value) clock.getDelta(); // a background-tab pause must not fast-forward on resume
  resetMoveState();
  cinematicSkip.hidden = value || !(cinematic.skippable ?? cinematic.phase === 'playing');
  overlay.classList.toggle('hidden', !value);
  overlayTitle.textContent = 'Paused';
  overlaySubtitle.textContent = pauseCaption.textContent = 'Resume the opening or return to the title screen';
  pauseMenu.hidden = !value;
  if (value) {
    openingAudio.playIntermissionCue();
    showPauseMemory();
  }
  else pauseMemoryJoke.hidden = true;
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
    return;
  }
  openingInvitationPlaying = true;
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
  openingInvitationPlaying = false;
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

/**
 * An awaited hallway cutaway, cancelled with its owning dialogue or room.
 * Jax's silent pre-Level-1 pass-by only — Kaufmo's equivalent beat now
 * plays as its own live, in-scene cutscene (see kaufmoHallwayCutscene.js
 * and playKaufmoHallway), not a cutaway to a separate backdrop.
 */
function withHallwayCutscene(key, baseOnNode) {
  if (key !== 'preLevel1') return baseOnNode;
  const token = loadToken;
  let triggered = false;
  return (node) => {
    const base = baseOnNode?.(node);
    if (skippingCutscenes()) return base;
    if (triggered || node.id !== 'jaxPassByText') return base;
    triggered = true;
    const dialogue = dialogueGeneration;
    return (async () => {
      await base;
      let assets;
      try { assets = await preloadJaxHallwayCutscene(); }
      catch (error) { console.warn('Hallway scene unavailable; continuing dialogue.', error); return; }
      if (!assets) return;
      if (token !== loadToken || dialogue !== dialogueGeneration || !dialogueUI.isActive) {
        disposeObject3D(assets.scene); return;
      }
      await new Promise(resolve => {
        const finish = () => { disposeObject3D(assets.scene); resolve(); };
        const cutscene = playJaxHallwayCutscene(renderer, assets);
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
 * onNode for each node as it's shown (to act out its `action`), nextFor
 * to send the script somewhere it wouldn't route itself, and startAt/stopAt to play only part of the script (see createDialogueEngine).
 *
 * @param {string} key a DIALOGUE_SCRIPTS key
 * @param {{ lookAt?: THREE.Vector3, onChoice?: (option, nextNode) => void,
 *   onComplete?: () => void, onCancel?: () => void,
 *   distressFor?: (lineNode) => number, onNode?: (node) => void,
 *   nextFor?: (node) => string | undefined, startAt?: string, stopAt?: string }} [options]
 */
let dialogueGeneration = 0;
function playRoomDialogue(key, {
  lookAt, onChoice, onComplete, onCancel, distressFor, lineFor, nextFor, onNode, startAt, stopAt,
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
    onChoice, onComplete: finish(onComplete), onCancel: finish(onCancel), distressFor, lineFor, nextFor, startAt, stopAt,
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
};

const missionApi = {
  get memoryTicket() { return caineMemory.revision; },
  rememberRetry: (level, ticket) => caineMemory.recordRetry(level, ticket),
  /** Loads a room from the menus (Click to Play); resolves with the loaded room. */
  enterRoom(roomKey, { from = currentRoomKey } = {}) {
    return selectRoom(roomKey, {
        from,
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
  travel(roomKey, options) {
    overlay.classList.remove('hidden');
    return missionApi.enterRoom(roomKey, options);
  },
  /** Adds an E-interaction to the current room (cleared on the next room change). */
  addInteractable(interactable) {
    interactables.push(interactable);
  },
  playDialogue: playRoomDialogue,
  cancelDialogue: () => dialogueUI.cancel(),
  endLevel: (title, subtitle) => endLevel(title, subtitle),
  showHint,
  showLevelComplete,
  isRoom: room => currentRoom === room.group,
  /** The player has control: mouse captured, room ready, not paused. */
  get playing() { return isLocked && readyToPlay && !paused; },
  get token() { return loadToken; },
  get session() { return storySessionId; },
  get stage() {
    return stage;
  },
  get playerPosition() { return player.position; },
  /** Where the camera's looking. */
  get viewDirection() { return camera.getWorldDirection(new THREE.Vector3()); },
};

function startMission(key) {
  resetObjectiveSession();
  titleScreen.hide();
  MISSIONS[key]?.(missionApi);
}

function attachStoryInteractions(room, roomKey, token) {
  if (roomKey === 'tadc' && room.jaxCorner && storyProgress.chasingJax) {
    runLobbyScene(missionApi, room, {
      onGone() {
        if (token !== loadToken || !storyProgress.caughtUpWithJax()) return;
        showHint('Jax went through one of the doors along this wall. Open them to find the way into the maze.', 7000);
      },
    });
    return;
  }
  if (roomKey === 'dorm' && room.jaxHallway && storyProgress.findingJax) {
    runHallwayScene(missionApi, room, {
      onDone() {
        if (token !== loadToken || !storyProgress.sawJaxBolt()) return;
        showHint('Jax ran out to the Circus Lobby. Follow him through the curtained arch.', 6500);
      },
    });
  }
  // The final maze conversation is now automatic; keep its anchor for
  // the upstream countdown, without adding the superseded E-only placeholder.
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
    // No prompt at all until Caine's sent her to find Ribbit.
    enabled: () => current() && !storyProgress.ribbitComplete && objectives.active?.id === 'find-ribbit',
    prompt: () => 'Knock on Ribbit’s door',
    interact() {
      if (!current() || objectives.active?.id !== 'find-ribbit') return;
      ambience.setRoom('ribbit');
      ambience.setRoomGain(0.5);
      runLevel1(missionApi, { hall: room, story: true, onComplete: points => storyProgress.finishRibbit(points) });
    },
  });
}

/** A once-only, win-gated shot in the real hall, followed by the existing room talk. */
async function playKaufmoHallway() {
  if (currentRoomKey !== 'dorm' || dialogueUI.isActive || !storyProgress.finishHallway()) return false;
  const token = loadToken;
  const room = currentRoomInfo;
  overlay.classList.add('hidden');
  resetMoveState();
  stage.hold(true);
  let assets;
  let plan;
  try {
    plan = kaufmoHallwayPlan(room);
    assets = await preloadKaufmoHallwayCutscene();
  } catch (error) {
    console.warn('Kaufmo hallway run unavailable; continuing dialogue.', error);
  }
  if (token !== loadToken) {
    if (assets) disposeObject3D(assets.kaufmoApi.kaufmo);
    return false;
  }
  if (plan) stage.place(plan.pomni);
  let cutscene;
  let cleaned = false;
  let runDone = Promise.resolve();
  let triggered = false;
  function cancelRunOnEscape(event) {
    if (event.code !== 'Escape' || token !== loadToken) return;
    // This short intro can be dismissed; other conversations keep their
    // existing Escape-to-pause behavior. Own the key only while he runs.
    event.preventDefault();
    event.stopImmediatePropagation();
    dialogueUI.cancel();
  }
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('keydown', cancelRunOnEscape, true);
    cutscene?.cleanup();
    if (assets) disposeObject3D(assets.kaufmoApi.kaufmo);
    if (token === loadToken) {
      stage.hold(false);
      // Room entry checkpointed before finishHallway claimed this encounter.
      // Persist its seen flag at this stable handoff, including cancellation.
      takeCheckpoint();
    }
  };
  const started = playRoomDialogue('level2Hallway', {
    onNode(node) {
      if (node.id === 'kaufmoHurriesBy' && !triggered && assets) {
        triggered = true;
        cutscene = playKaufmoHallwayCutscene(renderer, { scene, room, ...assets, plan });
        runDone = new Promise(resolve => {
          const finish = () => {
            window.removeEventListener('keydown', cancelRunOnEscape, true);
            cutscene.cleanup();
            if (token !== loadToken) cleanup();
            resolve();
          };
          window.addEventListener('keydown', cancelRunOnEscape, true);
          runCutscene({ ...cutscene, cancel: finish }, finish);
        });
      } else if (triggered) {
        // Keep the mumble live during the run, but don't let fast advance
        // finish the conversation (and cancel the run) before he reaches his door.
        return runDone;
      }
    },
    onComplete: cleanup,
    onCancel() {
      cleanup();
      if (token === loadToken) showHint('Find Kaufmo in his room to continue.', 6500);
    },
  });
  if (!started) cleanup();
  return started;
}

function talkToKaufmo(kaufmoApi, token) {
  if (token !== loadToken || currentRoomKey !== 'kaufmo' || dialogueUI.isActive) return false;
  const valid = () => token === loadToken && currentRoomKey === 'kaufmo';
  const lookAt = kaufmoApi.kaufmo.getWorldPosition(new THREE.Vector3());
  // He turns to face her and starts gesturing on his own lines, same idea
  // as Ribbit's/Caine's own faceTowards/setSpeaking — previously he just
  // stood there frozen through the whole conversation.
  kaufmoApi.faceTowards(player.position);
  // Between conversations he's at his theory wall (kaufmoRoom.js
  // createWallRoutine); a conversation takes him off it.
  const room = currentRoomInfo;
  const routine = room?.kaufmoRoutine;
  let actHandIn = null; // acts out the photos for level2Return/level2Abstraction (see handInActor)
  const onNode = (node) => {
    const speaking = node.speaker === 'kaufmo';
    kaufmoApi.setSpeaking(speaking);
    kaufmoApi.setListening(node.speaker === 'pomni');
    kaufmoApi.setPose(speaking ? (node.mood || 'neutral') : 'neutral');
    actHandIn?.(node);
  };
  const stopTalking = () => { kaufmoApi.setSpeaking(false); kaufmoApi.setListening(false); kaufmoApi.setPose('neutral'); };
  // The conversation has its own shot: the room's staging if it has one
  // (Pomni put on her mark, the camera at the bed's corner — see
  // kaufmoRoom.js talkShot), else a two-shot (see twoShotCamera). The
  // follow camera comes back when it ends, however it ends.
  const talk = (key, { onComplete, onCancel, distressFor }) => {
    if (dialogueUI.isActive) return false;
    routine?.pause();
    const staging = currentRoomInfo?.talkShot;
    let faceThis = lookAt;
    if (staging) {
      // Both onto their marks (kaufmoRoom.js talkShot), angled so the
      // camera sees both their faces.
      kaufmoApi.kaufmo.position.x = staging.kaufmo.x;
      kaufmoApi.kaufmo.position.z = staging.kaufmo.z;
      kaufmoApi.kaufmo.updateMatrixWorld(true);
      stage.place({ x: staging.pomni.x, z: staging.pomni.z, lookAt: staging.pomniLooksAt });
      kaufmoApi.faceTowards(staging.kaufmoLooksAt);
      faceThis = staging.pomniLooksAt;
      stage.lookWithHead(staging.pomniHeadAt);
    }
    const shot = staging ? { position: staging.camera.clone(), target: staging.target.clone() } : twoShotCamera(lookAt);
    // Back to his wall as the camera cuts back, unless the scene ends the
    // level: then he stays as it left him, behind the card.
    const release = (backToWall) => {
      if (stageCamera === shot) stageCamera = null;
      if (staging) stage.lookWithHead(null);
      if (backToWall && room === currentRoomInfo) routine?.resume();
    };
    const endsLevel = key === 'level2Return' || key === 'level2Abstraction';
    const started = playRoomDialogue(key, {
      lookAt: faceThis,
      onNode,
      distressFor,
      onComplete() { release(!endsLevel); return onComplete(); },
      onCancel() { release(key !== 'level2Abstraction'); onCancel(); },
    });
    if (started) stageCamera = shot;
    else release(true);
    return started;
  };

  if (preLevel1Session && !storyProgress.ribbitComplete) {
    showHint('Check on Ribbit first. Kaufmo can wait here.', 4500);
    return false;
  }
  if (preLevel1Session && !storyProgress.kaufmoIntroduced) {
    return talk('level2RoomOpening', {
      async onComplete() {
        stopTalking();
        if (!valid() || !storyProgress.finishKaufmoIntro()) return;
        if (itemState.heldCount()) showHint('You already have a photo. Talk to Kaufmo again to show him.', 6000);
        // The photos are in the Lobby, not the Dorm Hall — spawn her right
        // where the search actually happens instead of making her walk
        // there herself. missionApi.travel already shows the normal
        // "Loading…" overlay while the room comes in.
        await missionApi.travel('tadc', { from: null });
      },
      onCancel: stopTalking,
    });
  }
  // Returning with the photos (see pickKaufmoScript): enough and he has his
  // missing pieces, too few and he abstracts. A success scene that was cut
  // off plays again rather than skipping to his idle line.
  let key = pickKaufmoScript(itemState);
  if (key === 'level2Complete' && !itemState.isDone()) key = 'level2Return';
  storyProgress.presentedPhotos(itemState.totalPresented());
  if (key === 'level2Return') openingAudio.playChime('handIn');
  if (key === 'level2Return' || key === 'level2Abstraction') actHandIn = handInActor(kaufmoApi, room);
  const finished = () => {
    if (!valid()) return;
    if (key === 'level2Return' && !itemState.isDone()) {
      // Before the card, so a save from here on picks up the way into Level 3.
      storyProgress.finishLevel2();
      itemState.markDone();
      void finishKaufmoLevel(token);
    } else if (key === 'level2Abstraction') {
      void kaufmoAbstracted(token);
    }
  };
  return talk(key === 'level2Opening' ? 'level2RoomOpening' : key, {
    distressFor: (line) => line.distress ?? 0,
    onComplete() { stopTalking(); finished(); },
    // He's already had the photos: backing out can't undo what happens.
    // Out of the success scene, though, it plays again from the top.
    onCancel() {
      stopTalking();
      if (key === 'level2Abstraction') finished();
      else if (room?.handInPhotos) { room.handInPhotos.dispose(); room.handInPhotos = null; }
    },
  });
}

/**
 * Acts out the photos changing hands on the beats level2Return and
 * level2Abstraction mark (their ids in dialogues.js): Pomni holds them
 * out and Kaufmo takes them; then he kneels and spreads them over the
 * floor, taps one, gathers them up and clutches them to his chest — or,
 * short of enough, looks them over and lets them fall. Each cue sets the
 * whole state it needs, so a beat skipped before its motion finished
 * doesn't leave the next one wrong. Returns the onNode hook.
 */
function handInActor(kaufmoApi, room) {
  room.handInPhotos?.dispose();
  const urls = photoUrls(itemState.snapshot().presented);
  const photos = createHandInPhotos(urls, {
    kaufmo: kaufmoApi.kaufmo,
    kaufmoHands: kaufmoApi.hands,
    pomniHands: () => (pomniBones.LeftHand && pomniBones.RightHand ? [pomniBones.LeftHand, pomniBones.RightHand] : null),
    floorY: kaufmoApi.kaufmo.position.y,
  });
  room.group.add(photos.group);
  room.handInPhotos = photos;

  let cue = 0;
  // A step of the current cue, dropped if a later cue has already started.
  const later = (seconds, step) => {
    const mine = cue;
    photos.after(seconds, () => { if (mine === cue) step(); });
  };
  const act = (name) => kaufmoApi.setActivity(name);
  const handOver = () => {
    void stage.gesture('handOver');
    act('receive');
    later(0.3, () => photos.setMode('pomni'));
    later(1.0, () => photos.setMode('kaufmo'));
  };
  return (node) => {
    switch (node.id) {
      case 'handsOver':
        cue++;
        handOver();
        later(1.5, () => act('spread'));
        later(1.9, () => photos.setMode('floor'));
        break;
      case 'tapsPicture':
        cue++;
        act('tap');
        photos.setMode('floor');
        photos.tap(2);
        break;
      case 'gathersPictures':
        cue++;
        act('kneel');
        photos.setMode('kaufmo');
        later(0.7, () => { act('clutch'); photos.setMode('chest'); });
        break;
      case 'turnsBack':
        cue++;
        act('study');
        photos.setMode('kaufmo');
        break;
      case 'clutchingPictures':
        cue++;
        act('clutch');
        photos.setMode('chest');
        break;
      case 'holdsOut':
        cue++;
        handOver();
        later(1.3, () => act('study'));
        break;
      case 'itDoesntClose':
        cue++;
        act(null);
        photos.setMode('dropped');
        break;
      default:
        // Done tapping: back to kneeling over them as he talks.
        if (node.type === 'line' && kaufmoApi.activity === 'tap') act('kneel');
    }
  };
}

// Talking to someone frames them both: the camera stands off Pomni's right
// shoulder, a little behind her, aimed between them, so she's left of
// centre and they're right of it (the follow camera would sit right behind
// her head, hiding them). Pulled in if a wall's in the way. Rooms are full
// of props, so a few angles are tried, best first, and the first that
// sees both of them clearly wins (else the one pulled in least).
const TWO_SHOT_DISTANCE = 3.2;    // metres from the point between them, at the least
const TWO_SHOT_ANGLES = [         // behind: how far round behind her, as a share of that distance
  { behind: 0.45, height: 2.2 }, { behind: 0.25, height: 2.2 }, { behind: 0.7, height: 2.2 },
  { behind: 0.45, height: 2.9 }, { behind: 0.1, height: 2.9 }, { behind: 0.8, height: 2.9 },
];
const TWO_SHOT_AIM_HEIGHT = 1.05; // aimed at about chest height
const twoShotRaycaster = new THREE.Raycaster();

function twoShotCamera(partner) {
  const feetY = player.position.y - PLAYER_HEIGHT;
  const ahead = new THREE.Vector3(partner.x - player.position.x, 0, partner.z - player.position.z);
  const apart = Math.max(ahead.length(), 0.5);
  ahead.divideScalar(apart);
  const right = new THREE.Vector3(-ahead.z, 0, ahead.x); // her right, facing them
  const target = new THREE.Vector3(
    (player.position.x + partner.x) / 2, feetY + TWO_SHOT_AIM_HEIGHT, (player.position.z + partner.z) / 2,
  );
  const distance = Math.max(TWO_SHOT_DISTANCE, apart * 1.4);
  const chests = [player.position, partner].map((p) => new THREE.Vector3(p.x, feetY + TWO_SHOT_AIM_HEIGHT, p.z));
  let fallback = null;
  for (const { behind, height } of TWO_SHOT_ANGLES) {
    const desired = target.clone()
      .addScaledVector(right, distance)
      .addScaledVector(ahead, -distance * behind)
      .setY(feetY + height);
    const position = resolveOpeningCamera(target, desired);
    if (chests.every((chest) => clearView(position, chest))) return { position, target };
    const reach = position.distanceTo(target);
    if (!fallback || reach > fallback.reach) fallback = { position, reach };
  }
  return { position: fallback.position, target };
}

/** Whether nothing solid in the room sits between the camera and a point. */
function clearView(from, to) {
  const toward = to.clone().sub(from);
  const far = toward.length() - 0.4; // stop short of the character's own body
  if (far <= 0) return true;
  twoShotRaycaster.set(from, toward.normalize());
  twoShotRaycaster.far = far;
  const candidates = collisionMeshes.filter((entry) => twoShotRaycaster.ray.intersectsBox(entry.box)).map((entry) => entry.mesh);
  return twoShotRaycaster.intersectObjects(candidates, false).length === 0;
}

/**
 * After the success scene: the Level 2 card. The story's already on
 * 'find-jax' (see talkToKaufmo): Pomni walks out into the Dorm Hall, where
 * level3Hallway.js has Jax bolt past her, then on to the Lobby, where
 * level3Lobby.js stages the rest on the way into the maze. Outside the story
 * (a room picked from the list) there's nothing to stage, so it's straight
 * to the Lobby conversation and the maze, as before.
 */
async function finishKaufmoLevel(token) {
  const title = 'Level 2 Complete';
  const subtitle = 'Kaufmo has his missing pieces. Now someone should check on Jax.';
  const story = storyProgress.findingJax;
  if (!await showLevelComplete(title, subtitle, { resume: story }) || token !== loadToken) return;
  if (story) {
    showHint('Head back out into the Dorm Hall and look for Jax.', 6000);
    return;
  }
  const lobby = await missionApi.travel('tadc', { from: null });
  if (!lobby) return;
  const here = loadToken;
  const intoTheMaze = () => { if (here === loadToken) void missionApi.travel('maze'); };
  if (!playRoomDialogue('level3Jax', { onComplete: intoTheMaze, onCancel: intoTheMaze })) intoTheMaze();
}

/** Too few photos: Kaufmo abstracts. Game Over, then the search starts over. */
async function kaufmoAbstracted(token) {
  const memoryTicket = caineMemory.revision;
  const retry = await showLevelComplete(
    'Kaufmo has abstracted.',
    `He needed at least ${PHOTO_THRESHOLD} of the ${PHOTO_COUNT} photos. Try the search again.`,
    { resume: false, chime: 'fail', buttonLabel: 'Retry Level 2', memoryRetry: 'level2' }
  );
  if (!retry || token !== loadToken) return;
  await resetPhotoSearch(memoryTicket);
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
    if (count === PHOTO_THRESHOLD) return;
    showHint(count >= PHOTO_COUNT
      ? 'All photos found — return to Kaufmo before time runs out!'
      : `Picked up a photo. (${count}/${PHOTO_COUNT})`, 6000);
  },
});
const storyProgress = createStoryProgress({ objectives, isStorySession: () => preLevel1Session });

// --- Level 3 maze keepsakes ---------------------------------------------
// Optional: each is a Level 3 point (mazeItems.score, with the final talk's
// choices) towards the Jax gate. Nothing on screen asks for them; Pomni says
// something as she picks each up. Same shared-instance-survives-room-
// changes lifecycle as itemState above.
const MAZE_PICKUP_LINES = { 'bowling-ball': 'mazePickupBowling', 'hot-chocolate-mug': 'mazePickupMug' };
let mazeEncounter=null,lastMazeExitHint=0;
// This maze visit's keepsake sounds and Jax chase (fragments' caption), stopped on leaving it.
let mazeSounds=null,mazeChase=null;
const glitchCaption=createGlitchCaption();
const mazeItems = createMazeItems({
  onChange(){setLevelPoints('level3',mazeItems.score);currentRoomInfo?.jaxBoundary?.sync();takeCheckpoint();},
  onCollect: (id) => { playRoomDialogue(MAZE_PICKUP_LINES[id]); },
});
const mazeSearch = createMazeSearch();
let mazeGloinkWarningPending = false;
let mazeAttemptSeed = null;
let mazeClockWasPlayable = false;
document.addEventListener('visibilitychange', () => { mazeClockWasPlayable = false; });

const mazeHUD=createMazeObjectiveHUD({root:document.getElementById('maze-objective-hud'),items:mazeItems});

const mazeHints = createMazeHints({
  button: document.getElementById('maze-hints-button'), reminder: document.getElementById('maze-hints-reminder'), panel: document.getElementById('maze-hints-panel'),
  onOpen: openMazeHints, onClose: finishMazeHints, onChange: () => takeCheckpoint(),
  hasCollected: id => mazeItems.hasCollected(id),
  getPlayerPosition: () => player.position,
  getPlayerFacing: () => pomni?.rotation.y ?? 0,
});

function canOpenMazeHints() {
  return currentRoomKey === 'maze' && Boolean(currentRoom) && readyToPlay
    && levelCompletePanel.hidden && savePanel.hidden && !dialogueUI.isActive
    && !activeCinematic()?.active && !activeCutscene && !activeJaxPass?.active && !stageBusy()
    && controlsPanel.hidden && creditsPanel.classList.contains('hidden')
    && titleOptions.hidden && titleQuit.hidden && !titleScreen.active
    && (isLocked && !paused || paused && !pauseMenu.hidden);
}

function openMazeHints() {
  if (mazeHints.isOpen || !canOpenMazeHints()) return false;
  resetMoveState(); mazeClockWasPlayable = false;
  pauseRoomForMenu();
  mazeHints.open(currentRoomInfo);
  if (isLocked) document.exitPointerLock();
  return true;
}

function finishMazeHints() {
  // Back and Escape always return to the existing paused menu. Only its
  // Resume button may reacquire the pointer and restart gameplay.
  resetMoveState();
  if (currentRoomKey === 'maze' && paused && !pauseMenu.hidden) btnResume.focus({ preventScroll: true });
}

// --- Saving and loading -------------------------------------------------
// Checkpoints only: the game keeps a snapshot of the story so far, taken
// each time an objective changes and each time Pomni enters a room, never
// mid-scene. The pause menu's Save writes that latest checkpoint to a slot
// (game/saveGame.js), and Load restores it into its room.
//
// Anything new that has to survive a reload (a level's progress, a story
// flag) goes into takeCheckpoint() and loadGame() below, ideally as its
// own module's snapshot()/restore() like the ones here. Bump SAVE_VERSION
// in saveGame.js if old saves can no longer load into the new shape.
const saveSlots = createSaveSlots();
const ROOM_NAMES = {
  pomni: "Pomni's Room", dorm: 'Dorm Hall', tadc: 'Circus Lobby',
  ribbit: "Ribbit's Room", kaufmo: "Kaufmo's Room", maze: 'Maze',
};

function takeCheckpoint() {
  // Preserve story checkpoint rules; the raw maze review can also save its
  // own Level 3 progression without replaying the preceding story. An ending
  // jump has already torn its room down, so use the maze as its restore label;
  // loadGame routes the completed story straight back into the ending.
  const endingCheckpoint = storyProgress.level3Complete;
  const mazeCheckpoint = currentRoomKey === 'maze' || endingCheckpoint;
  if ((!preLevel1Session&&!mazeCheckpoint) || restoringSave || (!openingCompleted&&!mazeCheckpoint)
    || (!ROOM_NAMES[currentRoomKey] && !endingCheckpoint)) return;
  checkpoint = {
    room: ROOM_NAMES[currentRoomKey] ? currentRoomKey : 'maze',
    from: currentRoomFrom,
    objectives: objectives.snapshot(),
    story: storyProgress.snapshot(),
    items: itemState.snapshot(),
    maze: mazeItems.snapshot(),
    mazeHints: mazeHints.snapshot(),
    escape: snapshotEscapeThreshold(),
    morningDialoguePending,
    // Shown on the slot, so a save says what it was.
    objectiveTitle: objectives.active?.title ?? null,
  };
}
objectives.subscribe(() => takeCheckpoint());

/** Starts the story from a save, from the title screen or mid-game. */
function loadGame(data) {
  if (!data || data.incompatible) return;
  // A cast load can still be in flight with no current room to tear down.
  if (!titleScreen.active) returnToHome();
  restoringSave = true;
  try {
    skipIntroRequested = false;
    resetEscapeThreshold();
    itemState.reset();
    resetMazeAttempt();
    resetObjectiveSession(true);
    objectives.restore(data.objectives);
    storyProgress.restore(data.story);
    itemState.restore(data.items);
    mazeItems.restore(data.maze);
    mazeHints.restore(data.mazeHints);
    restoreEscapeThreshold(data.escape);
    morningDialoguePending = Boolean(data.morningDialoguePending);
    openingCompleted = true;
  } finally {
    restoringSave = false;
  }
  openingAudio.unlock();
  if (isLocked) document.exitPointerLock();
  titleScreen.hide();
  titleOptions.hidden = true;
  // Saved after leaving the maze: straight to the ending, not back inside.
  if (storyProgress.level3Complete) {
    void playEnding(storyProgress.ending);
    return;
  }
  selectRoom(data.room, {
    from: data.from ?? undefined,
    openingMode: data.room === 'pomni' ? 'settled' : undefined,
    onReady: () => {
      overlayTitle.textContent = 'Click to Play';
      overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
    },
  });
}

const savePanel = document.getElementById('save-slots');
const savePanelTitle = document.getElementById('save-slots-title');
const savePanelNote = document.getElementById('save-slots-note');
const saveSlotList = document.getElementById('save-slot-list');
const btnSaveFile = document.getElementById('btn-save-file');
const btnLoadFile = document.getElementById('btn-load-file');
const saveFileInput = document.getElementById('save-file-input');
let savePanelMode = 'save';
let savePanelFromTitle = false;

function describeSlot(data) {
  if (!data) return 'Empty';
  if (data.incompatible) return 'From an older version of the game, can’t be loaded';
  const when = data.savedAt ? new Date(data.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return [data.objectiveTitle ?? 'Exploring', ROOM_NAMES[data.room] ?? data.room, when].filter(Boolean).join(' · ');
}

function renderSaveSlots(note) {
  const saving = savePanelMode === 'save';
  savePanelTitle.textContent = saving ? 'Save Game' : 'Load Game';
  savePanelNote.textContent = note ?? (saving
    ? (checkpoint
      ? `Saves your last checkpoint (${checkpoint.objectiveTitle ?? ROOM_NAMES[checkpoint.room]}).`
      : 'Nothing to save yet: the story saves from the end of the morning on.')
    : 'Pick a save to continue from.');
  btnSaveFile.hidden = !saving;
  btnSaveFile.disabled = !checkpoint;
  btnLoadFile.hidden = saving;
  saveSlotList.replaceChildren(...saveSlots.list().map((data, i) => {
    const slot = i + 1;
    const button = document.createElement('button');
    const name = document.createElement('span');
    name.className = 'save-slot-name';
    name.textContent = `Slot ${slot}`;
    const detail = document.createElement('span');
    detail.className = 'save-slot-detail';
    detail.textContent = describeSlot(data);
    button.append(name, detail);
    button.disabled = saving ? !checkpoint : (!data || data.incompatible);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (saving) {
        if (data && !window.confirm(`Overwrite Slot ${slot}?`)) return;
        try {
          saveSlots.write(slot, checkpoint);
          renderSaveSlots(`Saved to Slot ${slot}.`);
        } catch (error) {
          console.warn('Save failed', error);
          renderSaveSlots('Couldn’t save: this browser isn’t letting the game store data.');
        }
      } else {
        savePanel.hidden = true;
        loadGame(data);
      }
    });
    return button;
  }));
}

// Save files: the same checkpoint as a .json on disk, for a backup or
// another computer. Chrome and Edge ask where to put it; other browsers
// download it.
btnSaveFile.addEventListener('click', async (event) => {
  event.stopPropagation();
  if (!checkpoint) return;
  const text = saveFileContents(checkpoint);
  const name = saveFileName(checkpoint);
  try {
    let saved = name;
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: name, types: [{ description: 'TADC save', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      saved = handle.name;
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    renderSaveSlots(`Saved to ${saved}.`);
  } catch (error) {
    if (error?.name === 'AbortError') return; // closed the dialog without saving
    console.warn('Save to file failed', error);
    renderSaveSlots('Couldn’t save the file.');
  }
});
btnLoadFile.addEventListener('click', (event) => {
  event.stopPropagation();
  saveFileInput.value = ''; // picking the same file twice still loads it
  saveFileInput.click();
});
saveFileInput.addEventListener('click', (event) => event.stopPropagation());
saveFileInput.addEventListener('change', async () => {
  const file = saveFileInput.files?.[0];
  if (!file) return;
  const data = parseSaveFile(await file.text());
  if (!data) { renderSaveSlots('That file isn’t a save from this game.'); return; }
  if (data.incompatible) { renderSaveSlots('That save is from another version of the game, so it can’t be loaded.'); return; }
  savePanel.hidden = true;
  loadGame(data);
});

function openSavePanel(mode, { fromTitle = false } = {}) {
  savePanelMode = mode;
  savePanelFromTitle = fromTitle;
  renderSaveSlots();
  savePanel.hidden = false;
}

document.getElementById('btn-save').addEventListener('click', (event) => {
  event.stopPropagation();
  if (currentRoomKey === 'maze' && checkpoint?.room === 'maze') checkpoint.mazeHints = mazeHints.snapshot();
  openSavePanel('save');
});
document.getElementById('btn-pause-load').addEventListener('click', (event) => {
  event.stopPropagation();
  openSavePanel('load');
});
document.getElementById('btn-load-game').addEventListener('click', (event) => {
  event.stopPropagation();
  titleOptions.hidden = true;
  openSavePanel('load', { fromTitle: true });
});
document.getElementById('btn-save-slots-back').addEventListener('click', (event) => {
  event.stopPropagation();
  savePanel.hidden = true;
  if (savePanelFromTitle) titleOptions.hidden = false;
});

// The photo search times out before the photos are delivered: Kaufmo runs
// out of patience and abstracts (see kaufmoOutOfTime), and Level 2 starts
// again from the beginning. Objective changes arm/disarm the clock; a
// retry after too few photos resets it explicitly because the objective
// stays active.
// Includes delivery through Dorm Hall; see docs/story-flow.md for timing checks.
const SEARCH_TIMER_SECONDS = 240;
let searchTimeLeft = null; // seconds left, or null while it isn't the active objective
let hintCooldown = 0; // seconds until H gives another photo hint (see givePhotoHint)
let hintsLeft = 0;
const HINT_LIMIT = 3; // hints per photo-search attempt (see givePhotoHint); here, not below, as the subscribe call right after uses it
objectives.subscribe((active) => {
  searchTimeLeft = active?.id === 'collect-photos' ? SEARCH_TIMER_SECONDS : null;
  hintCooldown = 0;
  hintsLeft = HINT_LIMIT;
});

function resetMazeAttempt(seed = null) {
  mazeHints.reset();
  mazeItems.reset();
  mazeSearch.clear();
  mazeAttemptSeed = seed;
  mazeClockWasPlayable = false;
}

function canReachMazeJax() {
  const encounter = currentRoomInfo?.jaxEncounter;
  if (currentRoomKey !== 'maze' || !encounter || !isInteractionAvailable(encounter)) return false;
  return hasLineOfSight(encounter);
}

function mazeSearchInstructions() {
  return {title:mazeItems.jaxComplete?'Reach the exit':'Follow Jax',
    detail:mazeItems.jaxComplete?'The conversation is complete. Leave the maze.':'Find Jax before time runs out. He runs when you get close, so follow him until he stops running, then call out to him (E).'};
}

function updateMazeSearch(deltaSeconds) {
  const playable = mazeGameplayAvailable(gameplayHUDContext());
  // A first/resumed frame must not charge time spent loading or suspended.
  const elapsed = mazeClockWasPlayable ? deltaSeconds : 0;
  mazeClockWasPlayable = playable;
  if (!playable) return;
  if (mazeGloinkWarningPending) {
    mazeGloinkWarningPending = false;
    showHint('Be careful of the Gloinks!', 6000);
  }
  const result = mazeSearch.tick(elapsed, {
    playable,
    atJax: canReachMazeJax(),
  });
  if (result === 'reached') {
    // No hint: this is her walking up to him after calling out, and the
    // conversation (mazeJaxChase.js) follows by itself.
    foundJax = true;
  } else if (result === 'expired') {
    restartMazeSearch();
  }
}

function restartMazeSearch() {
  return retryMaze('LEVEL 3 FAILED', 'Time’s up — find both keepsakes and reach Jax before the countdown ends.');
}

/**
 * Level 3 failed (out of time, or caught by a gloink): the fail card, then
 * a fresh attempt — a new maze, both keepsakes back in it, a full clock.
 */
async function retryMaze(title, subtitle) {
  const token = loadToken, session = storySessionId, memoryTicket = caineMemory.revision;
  const failedSeed = mazeAttemptSeed;
  const continued = await showLevelComplete(
    title, subtitle,
    { resume: false, chime: 'fail', buttonLabel: 'Retry', memoryRetry: 'maze' }
  );
  if (!continued || token !== loadToken || currentRoomKey !== 'maze') return;
  const seed = Math.floor(Math.random() * 0x100000000);
  resetMazeAttempt(seed === failedSeed ? (seed + 1) >>> 0 : seed);
  const room = await missionApi.travel('maze', { from: null });
  if (room && session === storySessionId && currentRoomInfo === room && currentRoomKey === 'maze') {
    caineMemory.recordRetry('maze', memoryTicket);
  }
}

/**
 * How Level 3 went for Jax, for the ending (see ENDING_VARIANTS in
 * storyProgress.js): what the Jax gate decided as his final conversation
 * ended (Levels 1 to 3's points reaching 75%, escapeThreshold.js).
 */
function jaxOutcome() {
  return mazeItems.jaxOutcome === 'abstracts' ? 'abstracted' : 'saved';
}

/**
 * Dorsa's final talk with Jax, acted out in the maze: the static on him
 * follows each line's `distress`, and after round 5 the Jax gate sends it
 * to Ending A (he steadies) or Ending B (he unravels, the clearing flashes
 * white, and he's gone). Merged into the encounter's own handlers.
 */
function jaxFinalScene(room, handlers) {
  const { jaxApi, jaxGlitch } = room;
  const token = loadToken;
  const actions = {
    jaxSteadies() { jaxGlitch?.setLevel(0.12); },
    jaxUnravels() {
      jaxGlitch?.setLevel(1);
      jaxGlitch?.burst();
      jaxApi.glitch?.();
      return new Promise(resolve => setTimeout(resolve, 1600));
    },
    async whiteOut() {
      sceneFade.classList.add('white');
      await fadeScreen(true, 0.6);
      if (token !== loadToken) return;
      jaxApi.setShown(false);
      await fadeScreen(false, 1.4);
      sceneFade.classList.remove('white');
    },
  };
  return {
    distressFor: (node) => node.distress ?? 0,
    nextFor: (node) => (node.fateCheck ? (passesJaxGate() ? 'jaxWonOver' : 'jaxAbstracts') : undefined),
    onNode(node) {
      handlers.onNode?.(node);
      if (node.distress !== undefined && jaxGlitch) jaxGlitch.setLevel(Math.max(0.12, node.distress / 3));
      return actions[node.action]?.();
    },
  };
}

/** Fades the screen to black (true) or back (false); resolves once it's there. */
function fadeScreen(toBlack, seconds = 1.2) {
  sceneFade.style.transitionDuration = `${seconds}s`;
  sceneFade.classList.toggle('on', toBlack);
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Level 3's exit: Pomni's controls freeze, the maze fades to black, the
 * run records that Level 3 is done and how it went for Jax (so a save
 * taken now resumes at the ending, not back in the maze), then the ending.
 */
async function leaveMaze(variant) {
  const token = loadToken;
  resetMoveState();
  stage.hold(true);
  mazeSearchTimer.hidden = true;
  await fadeScreen(true);
  if (token !== loadToken) return;
  storyProgress.finishLevel3(variant);
  takeCheckpoint();
  await playEnding(variant);
}

// The card the ending closes on, after its two scenes.
const ENDING_CARDS = {
  saved: 'Pomni and Jax step out of the maze together.',
  abstracted: 'Pomni steps out of the maze alone.',
};
// Each part's conversation (DIALOGUE_SCRIPTS) and the music under both.
const ENDING_PARTS = {
  saved: { lobby: 'endingLobbySaved', door: 'exitDoorSaved', music: 'endingSaved' },
  abstracted: { lobby: 'endingLobbyAbstracted', door: 'exitDoorAbstracted', music: 'endingAbstracted' },
};

/**
 * The end of the game for `variant` ('saved' or 'abstracted'), in two
 * scenes (cutscenes/endingCutscene.js): the Circus Lobby just outside the
 * maze door, where Pomni comes out to the others and they talk until
 * Kaufmo says he's found the exit; then the exit door, a set of its own,
 * where they leave one by one. Then the card, then the title screen.
 * Escape skips what's left; developer cutscene skipping skips it all.
 */
async function playEnding(variant) {
  const loadingToken = loadToken;
  sceneFade.classList.add('on');
  overlay.classList.add('hidden'); // the dev menu, when it's jumped here from there
  if (!skippingCutscenes()) {
    let cast = null;
    try {
      cast = await loadEndingCast(variant);
    } catch (error) {
      if (loadingToken === loadToken) console.warn('Ending cast unavailable; showing its card.', error);
    }
    if (loadingToken !== loadToken) {
      if (cast) disposeEndingCast(cast);
      return;
    }
    if (cast) {
      const finished = await playEndingLobby(variant, cast);
      if (finished === null) return; // Home or a newer room superseded it
      if (finished) {
        const token = loadToken;
        let door = null;
        try {
          door = createExitDoorScene(renderer, variant, cast);
        } catch (error) {
          console.warn('Exit door scene unavailable; showing its card.', error);
        }
        if (door) {
          await playEndingScene(door, ENDING_PARTS[variant].door);
          door.dispose();
        }
        if (token !== loadToken) return;
      } else {
        // Escape or a missing Lobby ends this ending before the exit-door
        // scene can take ownership of the separately loaded Pomni and Caine.
        disposeEndingCast(cast);
      }
    }
  }
  const token = loadToken;
  sceneFade.classList.add('on');
  const done = await showLevelComplete('Level 3 Complete', ENDING_CARDS[variant], { resume: false, buttonLabel: 'Back to title' });
  if (!done || token !== loadToken) return;
  returnToHome();
}

/** Releases a cast whose assets finished loading after its ending was cancelled. */
function disposeEndingCast(cast) {
  const roots = [
    cast.pomni?.pomni, cast.jaxApi?.jax, cast.ribbitApi?.ribbit,
    cast.ragathaApi?.ragatha, cast.kaufmoApi?.kaufmo, cast.caineApi?.caine,
    ...(cast.extras ?? []).map(extra => extra.root),
  ];
  for (const root of roots) if (root) disposeObject3D(root);
}

/**
 * The ending's first part, in the loaded Lobby outside the maze door.
 * Resolves true once Kaufmo's led them off (the screen black again),
 * false if it was skipped or unavailable, or null if the game moved on.
 */
async function playEndingLobby(variant, cast) {
  const loading = selectRoom('tadc', {
    from: 'maze',
    onReady() { overlay.classList.add('hidden'); btnTitle.hidden = true; },
  });
  // selectRoom invalidates the maze synchronously; this is the Lobby's token.
  const token = loadToken;
  const room = await loading;
  if (token !== loadToken) {
    // The load was superseded before any cast member entered the room.
    disposeEndingCast(cast);
    return null;
  }
  if (!room || room !== currentRoomInfo) return false;
  resetMoveState();
  stage.hold(true);
  music.setRoom(ENDING_PARTS[variant].music);
  minimap.hide();
  let lobby;
  try {
    lobby = stageLobbyEnding(room, stage, variant, cast, lobbyEndingPlan(room.mazeDoor.portal.arrival));
  } catch (error) {
    console.warn('Lobby ending unavailable; on to the exit door.', error);
    return token === loadToken;
  }
  void fadeScreen(false, 1.6);
  const finished = await new Promise((resolve) => {
    const started = playRoomDialogue(ENDING_PARTS[variant].lobby, {
      onNode: lobby.onNode,
      onComplete: () => resolve(true),
      onCancel: () => resolve(false),
    });
    if (!started) resolve(false);
  });
  if (token !== loadToken) {
    // Room teardown owns everyone staged in the Lobby; these two roots were
    // never parented there and need their own cleanup after detaching actors.
    lobby.detach();
    disposeObject3D(cast.pomni.pomni);
    disposeObject3D(cast.caineApi.caine);
    return null;
  }
  await fadeScreen(true, 1.2);
  if (token !== loadToken) {
    lobby.detach();
    disposeObject3D(cast.pomni.pomni);
    disposeObject3D(cast.caineApi.caine);
    return null;
  }
  lobby.detach();
  stage.releaseCamera();
  stage.lookWithHead(null);
  return finished;
}

/** Renders a scene of its own (the red door), fades it in from black, plays its conversation and fades out to white. */
function playEndingScene(ending, dialogueKey) {
  const token = loadToken;
  return new Promise((resolve) => {
    let finished = false;
    const stop = () => { if (!finished) { finished = true; resolve(); } };
    runCutscene({ update: (delta) => { ending.update(delta); return finished; }, cancel: stop }, stop);
    // A frame of the scene under the black before it fades up.
    requestAnimationFrame(() => {
      if (finished || token !== loadToken) return;
      void fadeScreen(false, 1.6);
      // The script's last direction: cut to white.
      const close = async () => {
        // Home cancels the cutscene before it cancels this dialogue. In that
        // case the old conversation must not fade the new title back to black.
        if (finished || token !== loadToken) { stop(); return; }
        sceneFade.classList.add('white');
        await fadeScreen(true, 2);
        stop();
      };
      dialogueUI.play(DIALOGUE_SCRIPTS[dialogueKey].script, {
        onNode: ending.onNode,
        onComplete: close,
        onCancel: close,
      });
    });
  });
}

function updateSearchTimer(deltaSeconds) {
  if (searchTimeLeft === null) return;
  if (!isLocked || !readyToPlay || paused || dialogueUI.isActive || activeCutscene || activeCinematic()?.active || stageBusy()) return;
  hintCooldown = Math.max(0, hintCooldown - deltaSeconds);
  searchTimeLeft -= deltaSeconds;
  if (searchTimeLeft <= 0) {
    searchTimeLeft = null;
    void kaufmoOutOfTime();
  }
}

async function restartPhotoSearch() {
  const token = loadToken, memoryTicket = caineMemory.revision;
  const continued = await showLevelComplete(
    'LEVEL 2 FAILED',
    `Time's up — you didn't get the photos back to Kaufmo in time (he needs at least ${PHOTO_THRESHOLD}). Try again from the Lobby.`,
    { resume: false, chime: 'fail', memoryRetry: 'level2' },
  );
  if (!continued || token !== loadToken) return; // the player had already moved on by the time this landed
  await resetPhotoSearch(memoryTicket);
}

/**
 * Time's up before Pomni is back: a cutaway to Kaufmo alone in his room
 * (level2TimeUpDialogue), the shared abstraction effect following his
 * distress line by line until he abstracts on the last beat. Then Game
 * Over, and Level 2 from the beginning (restartLevel2). Escape skips to
 * the end: he's gone either way.
 */
async function kaufmoOutOfTime() {
  const session = storySessionId;
  const room = currentRoomKey === 'kaufmo' ? currentRoomInfo : await missionApi.travel('kaufmo', { from: null });
  if (!room?.kaufmoApi || session !== storySessionId) return;
  const token = loadToken;
  const memoryTicket = caineMemory.revision;
  const { kaufmoApi, talkShot: staging } = room;
  const { kaufmo, abstraction } = kaufmoApi;
  resetMoveState();
  room.kaufmoRoutine?.pause(); // off his wall, onto his mark
  // Just him: she isn't back yet.
  player.visible = false;
  if (staging) {
    kaufmo.position.x = staging.kaufmo.x;
    kaufmo.position.z = staging.kaufmo.z;
    kaufmo.updateMatrixWorld(true);
    kaufmoApi.faceTowards(staging.kaufmoLooksAt);
  }
  stageCamera = {
    position: staging?.camera.clone() ?? camera.position.clone(),
    target: kaufmo.position.clone().setY(kaufmo.position.y + 1.2),
  };

  let over = false;
  const gameOver = async () => {
    if (over || token !== loadToken) return;
    over = true;
    kaufmoApi.setSpeaking(false);
    abstraction.setProgress(1);
    abstraction.setDistress(1, { immediate: true });
    const retry = await showLevelComplete(
      'Kaufmo has abstracted.',
      'Time ran out before you got the photos back to him. Level 2 starts again from the beginning.',
      { resume: false, chime: 'fail', buttonLabel: 'Retry Level 2', memoryRetry: 'level2' },
    );
    if (retry && token === loadToken) {
      await restartLevel2();
      caineMemory.recordRetry('level2', memoryTicket);
    }
  };
  const started = playRoomDialogue('level2TimeUp', {
    distressFor: (line) => line.distress ?? 0,
    onNode(node) {
      // A line without a level leaves him as upset as the last one.
      if (node.distress !== undefined) abstraction.setDistress(distressFromDialogue(node.distress));
      const speaking = node.speaker === 'kaufmo';
      kaufmoApi.setSpeaking(speaking);
      kaufmoApi.setPose(speaking ? (node.mood || 'neutral') : 'neutral');
      // Holds the beat (its text hidden) while he comes apart.
      if (node.id === 'abstracts') return abstraction.abstract();
    },
    onComplete: gameOver,
    onCancel: gameOver,
  });
  if (!started) void gameOver();
}

/**
 * Level 2 from its first beat, as if Pomni had just left Ribbit's room:
 * Kaufmo hurrying past in the Dorm Hall, then his introduction, then a
 * fresh search with new spots and a full clock. Level 1 is kept.
 */
async function restartLevel2() {
  itemState.reset();
  if (!storyProgress.restartLevel2()) return;
  // Arriving from Ribbit's room plays the hallway pass-by (see selectRoom).
  await missionApi.travel('dorm', { from: 'ribbit' });
}

/** A fresh photo search: new spots, a full clock and hints, back in the Lobby. */
async function resetPhotoSearch(memoryTicket) {
  const session = storySessionId;
  itemState.reset();
  searchTimeLeft = SEARCH_TIMER_SECONDS;
  hintCooldown = 0;
  hintsLeft = HINT_LIMIT;
  // Use the same default Lobby spawn as the introduction, even when the
  // failed attempt ended in Dorm Hall (whose normal arrival uses the arch).
  const room = await missionApi.travel('tadc', { from: null });
  if (room && session === storySessionId && currentRoomInfo === room && currentRoomKey === 'tadc') {
    caineMemory.recordRetry('level2', memoryTicket);
  }
}

// --- Photo hints (H) -----------------------------------------------------
// During the photo search, H names the nearest photo still in the Lobby by
// the landmark it's on (see rooms/lobbyLandmarks.js), says which way it is
// and pings it on the minimap. Only HINT_LIMIT per attempt (a retry gets a
// fresh set), and the cooldown runs on the search clock, so hints stay a
// nudge rather than a trail to follow.
const HINT_COOLDOWN_SECONDS = 20;
const HINT_PING_MS = 8000;
const HINT_LANDMARK_REACH = 12; // metres: further from any landmark, the hint just gives the way

function photoHintsActive() {
  return searchTimeLeft !== null && itemState.totalFound() < PHOTO_COUNT;
}

function givePhotoHint() {
  if (!photoHintsActive()) return;
  if (currentRoomKey !== 'tadc') {
    showHint('The photos are hidden around the Circus Lobby.', 4000, { caine: true });
    return;
  }
  if (hintsLeft <= 0) {
    showHint('No hints left.', 2500, { caine: true });
    return;
  }
  if (hintCooldown > 0) {
    showHint(`Next hint in ${Math.ceil(hintCooldown)}s.`, 2500, { caine: true });
    return;
  }
  const photos = currentRoomInfo?.photoPositions?.() ?? [];
  if (!photos.length) return;
  const { x, z } = player.position;
  const distance = (photo) => Math.hypot(photo.x - x, photo.z - z);
  const nearest = photos.reduce((best, photo) => (distance(photo) < distance(best) ? photo : best));
  const landmark = nearestLandmark(nearest.x, nearest.z, HINT_LANDMARK_REACH);
  const where = landmark ? ` by the ${landmark.label}` : '';
  showHint(`A photo is${where}, ${Math.round(distance(nearest))} m ${directionTo(nearest.x - x, nearest.z - z)}.`, 6000, { caine: true });
  minimap.ping(nearest.x, nearest.z, 'Photo', HINT_PING_MS);
  hintCooldown = HINT_COOLDOWN_SECONDS;
  hintsLeft--;
}

/** "ahead", "to your left"... for a world-space offset, from the camera's view. */
function directionTo(dx, dz) {
  const ahead = -dx * Math.sin(cameraYaw) - dz * Math.cos(cameraYaw); // same axes as moveForward/moveRight
  const right = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
  const angle = Math.abs(Math.atan2(right, ahead));
  if (angle <= Math.PI / 4) return 'ahead';
  if (angle >= Math.PI * 3 / 4) return 'behind you';
  return right > 0 ? 'to your right' : 'to your left';
}

function mazeGameplayAvailable(context) {
  return Boolean(currentRoomKey === 'maze' && context.room && context.ready && context.locked
    && !context.paused && !context.dialogue && !context.cinematic && !context.menu
    && savePanel.hidden && !document.hidden);
}

function updateMazeItemsCounter(context) {
  const visible = mazeGameplayAvailable(context);

  // No keepsake count: nothing on screen asks for them (only "Follow Jax").
  if (!mazeItemsCounter.hidden) mazeItemsCounter.hidden = true;
  const timerVisible = visible && mazeSearch.status === 'searching';
  if (mazeSearchTimer.hidden === timerVisible) mazeSearchTimer.hidden = !timerVisible;
  if (timerVisible) {
    const seconds = Math.ceil(mazeSearch.timeLeft);
    const timerText = `Time left: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (mazeSearchTimer.textContent !== timerText) mazeSearchTimer.textContent = timerText;
  }
}

function updatePictureCounter() {
  // Keep the countdown visible wherever the player can spend search time,
  // including the Dorm Hall and any detours. Hide the Level 2 HUD afterward.
  const searchActive = objectives.active?.id === 'collect-photos';
  const visible = (searchActive || currentRoomKey === 'tadc' || currentRoomKey === 'kaufmo')
    && (!preLevel1Session || storyProgress.kaufmoIntroduced) && !itemState.isDone()
    && isLocked && readyToPlay && !paused && !dialogueUI.isActive
    && !activeCutscene && !activeCinematic()?.active && !stageBusy() && !titleScreen.active
    && overlay.classList.contains('hidden') && controlsPanel.hidden
    && creditsPanel.classList.contains('hidden');
  if (pictureCounter.hidden === visible) pictureCounter.hidden = !visible;

  // Handed-in pictures still count as found. Only update the live region
  // when its text changes, rather than announcing it every animation frame.
  const text = `Photos found: ${itemState.totalFound()}/${PHOTO_COUNT} · Delivered: ${itemState.totalPresented()}/${PHOTO_COUNT}`;
  if (pictureCounter.textContent !== text) pictureCounter.textContent = text;

  const timerVisible = visible && searchTimeLeft !== null;
  if (searchTimer.hidden === timerVisible) searchTimer.hidden = !timerVisible;
  if (timerVisible) {
    const seconds = Math.max(0, Math.ceil(searchTimeLeft));
    const timerText = `Time left: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (searchTimer.textContent !== timerText) searchTimer.textContent = timerText;
  }

  const hintKeyVisible = timerVisible && photoHintsActive();
  if (hintKey.hidden === hintKeyVisible) hintKey.hidden = !hintKeyVisible;
  if (hintKeyVisible) {
    const left = `${hintsLeft} hint${hintsLeft === 1 ? '' : 's'} left`;
    const hintText = hintsLeft <= 0 ? 'No hints left'
      : hintCooldown > 0 ? `Next hint in ${Math.ceil(hintCooldown)}s · ${left}`
        : `Press H for a hint · ${left}`;
    if (hintKey.textContent !== hintText) hintKey.textContent = hintText;
  }
}

function leaveCurrentRoom({ keepMoving = false, keepRoom = false } = {}) {
  mazeGloinkWarningPending = false;
  if (hint.textContent === 'Be careful of the Gloinks!') {
    clearTimeout(hintTimeout);
    hint.classList.remove('visible');
  }
  mazeHints.hide();
  mazeItemsCounter.hidden = true;
  mazeSearchTimer.hidden = true;
  mazeClockWasPlayable = false;
  if (mazeSearch.status === 'expired') resetMazeAttempt();
  objectiveHUD.hide();
  caineConversation.cancelPending();
  dropRoomPreload();
  activeJaxPass?.dispose(); activeJaxPass = null;

  activeEntrance?.dispose(); activeEntrance = null; openingInvitationPlaying = false;
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
  mazeEncounter?.dispose();mazeEncounter=null;
  mazeSounds?.dispose();mazeSounds=null;mazeChase?.stop();mazeChase=null;
  foundJax = false;
  reachedExit = false;
  caught = false;
  return myToken;
}

/** What every room loader is handed. */
function roomLoadOptions(roomKey, { from, preview, openingMode }) {
  return {
    from, playDialogue: playRoomDialogue, preview, endLevel, stage, items: itemState, travel: travelTo,
    objectives, showLevelComplete, playChime: openingAudio.playChime, mazeItems,
    seed: roomKey === 'maze' ? mazeItems.ensureSeed(mazeAttemptSeed ?? devMazeSeed) : undefined,
    mazeDoor: roomKey !== 'tadc' ? undefined
      : storyProgress.chasingJax ? 'jax' : storyProgress.mazeOpen || storyProgress.level3Complete ? 'open' : null,
    jaxHallway: roomKey === 'dorm' && storyProgress.findingJax,
    ribbitStory: {
      complete: () => storyProgress.ribbitComplete,
      points: () => storyProgress.ribbitPoints,
    },
    kaufmoStory: {
      introduced: () => !preLevel1Session || storyProgress.kaufmoIntroduced,
      talk: kaufmoApi => talkToKaufmo(kaufmoApi, loadToken),
    },
    openingMode: openingMode ?? (roomKey === 'pomni' && from && openingCompleted ? 'settled' : undefined),
  };
}

function selectRoom(roomKey, { onReady, from, openingMode, preview } = {}) {
  const loadRoom = ROOM_LOADERS[roomKey];
  if (!loadRoom) return;
  const myToken = leaveCurrentRoom();
  music.prepare(roomKey); // synthesized under the loading screen
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
  let titleMusicLoadProgress = 0;

  return Promise.all([
    loadRoom((ratio, stage) => {
      if (myToken !== loadToken) return; // a newer selectRoom()/returnToHome() superseded this one
      if (roomKey === 'pomni' && openingMode === 'play') {
        titleMusicLoadProgress = Math.max(titleMusicLoadProgress, Math.min(1, ratio));
        openingAudio.setMainThemeVolume(0.5 * (1 - titleMusicLoadProgress));
      }
      overlaySubtitle.textContent = `Fetching ${stage === 'opening' ? 'opening animation' : 'room model'} (${Math.round(ratio * 100)}%)`;
    }, roomLoadOptions(roomKey, { from, preview, openingMode })),
    pomniReady,
    // The story's bedroom: get the hall outside it fully ready under this
    // same loading screen, so walking out later doesn't stall.
    roomKey === 'pomni' && openingMode && preLevel1Session ? readyHallAhead(myToken) : null,
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
      currentRoomFrom = from ?? null;
      if (roomKey === 'pomni' && roomPreload?.key === 'dorm' && roomPreload.compiled) {
        try { rehearseBedroomFromHall(result, roomPreload); } catch (error) { console.warn('Could not rehearse her room from the hall.', error); }
      }
      const ready = onReady && (() => onReady(result));
      // Kaufmo's room: the hall outside his door is got ready under this
      // same loading screen, for walking out into.
      const settle = roomKey === 'kaufmo' && ready ? () => readyHallBehindDoor(myToken, ready) : ready;
      applyLoadedRoom(result, settle, roomKey, openingMode === 'play');
      if (roomKey === 'maze') storyProgress.enteredMaze();
      takeCheckpoint();
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

function walkableBounds(box) {
  return {
    minX: box.min.x + WALL_MARGIN,
    maxX: box.max.x - WALL_MARGIN,
    minZ: box.min.z + WALL_MARGIN,
    maxZ: box.max.z - WALL_MARGIN,
  };
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
  mapLandmarks,
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
  if(roomKey==='maze'){
    // Finding him (mazeJaxChase.js): he turns up a minute in, mumbles and
    // bolts twice, then in his nook she calls out (E) and they talk here.
    const mazeRoom=currentRoomInfo;
    const listener=openingAudio.listener;
    mazeSounds=listener?createMazeSounds(listener,mazeRoom.keepsakes):null;
    const chase=mazeChase=runMazeJaxChase(missionApi,mazeRoom,{
      startTalk:()=>mazeEncounter.update({inRange:true,visible:true,eligible:true,requested:true}),
      fragments:JAX_GLITCH_FRAGMENTS,caption:glitchCaption,crackle:()=>mazeSounds?.crackle(),
    });
    // His talk's choices are scored like Level 1's; with the keepsakes and
    // Levels 1 and 2 they decide, as it ends, whether he abstracts.
    const choices=createChoiceTally(level3JaxFinalDialogue);
    mazeEncounter=createMazeEncounter({items:mazeItems,
      playDialogue:handlers=>playRoomDialogue('level3JaxFinal',{...handlers,
        onChoice:option=>{if(choices.record(option)!==null)mazeItems.setChoicePoints(choices.points);},
        ...jaxFinalScene(mazeRoom,handlers)}),
      outcome:()=>passesJaxGate()?'stays':'abstracts',
      // Talked through, he stays turned to her (how he is depends on the
      // outcome); left, he's back to his wall.
      onRelease:()=>chase.talkEnded(mazeItems.jaxComplete,mazeItems.jaxOutcome),
    });
    foundJax=mazeItems.jaxComplete;
    mazeRoom.interactables.push({
      objects:mazeRoom.jaxEncounter.objects,anchor:mazeRoom.jaxEncounter.anchor,radius:chase.callRadius,
      seeThrough:mazeRoom.jaxBoundary.colliders, // his own (invisible) personal space doesn't hide him
      prompt:()=>'Call out to Jax',
      enabled:()=>chase.callable&&!mazeItems.jaxComplete&&!mazeEncounter?.active,
      interact:()=>chase.call(),
    });
  }
  // Keep XDDCC playing through the opening Pomni/Dorm Hall story beats;
  // entering Ribbit's room starts Still Friends for her cutscene.
  const ambienceKey = preLevel1Session && !storyProgress.ribbitComplete
    && (roomKey === 'pomni' || roomKey === 'dorm') ? 'pomni' : roomKey;
  ambience.setRoomGain(1);
  ambience.setRoom(ambienceKey);
  // Those two songs are the room's music: no synthesized score over them.
  music.setRoom(ambienceKey === 'pomni' || ambienceKey === 'ribbit' ? null : roomKey);
  controlsTutorial.enterRoom(roomKey);
  player.visible = true;
  scene.add(group);
  // Before anything compiles: see bedroomClip.
  if (roomKey === 'pomni') clipToBedroomDoor(group);

  floorY = spawn.y;
  bounds = walkableBounds(box);
  colliders = roomColliders ?? [];
  // GLB rooms' meshes: the wall probes and floor raycast only test the
  // few entries whose boxes the query overlaps, padded by the player
  // radius so a mesh the player is touching is never skipped.
  // The room's own entries, not copies: her bedroom's wall cut-out swaps
  // an entry's mesh when the door's opened, and that has to reach here.
  collisionMeshes = (roomCollisionMeshes ?? []).map((entry) => Object.assign(entry, {
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
  environmentTarget = currentRoomInfo.environmentIntensity ?? ENVIRONMENT_INTENSITY;
  scene.environmentIntensity = environmentTarget;
  // Only meaningful in the hub with multiple unmarked doors, and the huge
  // Lobby (labelled landmarks, for the photo search) — every other room
  // either has no portals or just the one obvious way back.
  // Rooms built onto the hall (see rooms/connectRooms.js) have no portal,
  // just a marker.
  if (roomShowsMinimap(roomKey)) {
    minimap.show([...portals, ...(mapMarkers ?? [])], { group, floorY: spawn.y }, { landmarks: mapLandmarks });
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
  if (roomKey === 'maze') {
    mazeGloinkWarningPending = true;
    if (mazeSearch.status === 'idle') {
      mazeAttemptSeed = currentRoomInfo.mazeSeed;
      mazeSearch.start();
    }
    if(mazeItems.jaxComplete)mazeSearch.tick(0,{playable:true,atJax:true});
    if(mazeItems.jaxOutcome==='abstracts')currentRoomInfo.jaxApi?.setShown(false); // gone since Ending B
    foundJax = mazeSearch.status === 'reached';
  }
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
// Cast credits show the characters' dialogue icons. Set from here rather
// than in index.html so the packager sees the paths (it follows the URLs in
// the bundle). Each card also gets its turn in the staggered entrance.
for (const item of creditsPanel.querySelectorAll('[data-icon]')) {
  const src = ICONS[item.dataset.icon];
  if (!src) continue;
  const icon = document.createElement('img');
  icon.className = 'credit-icon';
  icon.src = src;
  icon.alt = ''; // the character's name is right beside it
  item.prepend(icon);
}
creditsPanel.querySelectorAll('.credits-rise').forEach((el, i) => el.style.setProperty('--i', i));
function openCredits() {
  creditsPanel.scrollTop = 0;
  creditsPanel.classList.remove('hidden'); // display:none -> shown replays the entrance
  document.getElementById('credits-close').focus({ preventScroll: true });
}
document.getElementById('credits-close').addEventListener('click', () => {
  creditsPanel.classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') creditsPanel.classList.add('hidden');
});

// --- Controls panel ---
const controlsPanel = document.getElementById('controls');
document.getElementById('btn-options-controls').addEventListener('click', () => {
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
// Jump state (see applyJump): a press waits here until the next movement
// frame; airborne stays true until settleOnGround lands her.
let jumpQueued = false;
let airborne = false;
let verticalVelocity = 0;
let jumpsUsed = 0;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey
    && currentRoomKey === 'maze' && openMazeHints()) { e.preventDefault(); return; }
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
  // A Space that DialogueUI already used (advancing or closing a line) has
  // been default-prevented, so finishing a conversation doesn't also jump.
  if (e.code === 'Space' && !e.repeat && !e.defaultPrevented && isLocked && readyToPlay && !paused
    && !dialogueUI.isActive) {
    e.preventDefault();
    jumpQueued = true;
  }
  if (e.code === 'KeyV' && !e.repeat && isLocked && readyToPlay && !paused && !dialogueUI.isActive
    && !activeCutscene && !stageBusy()) {
    firstPerson = !firstPerson;
  }
  if (e.code === 'KeyH' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && isLocked && readyToPlay
    && !paused && !dialogueUI.isActive && !activeCutscene && !stageBusy()) {
    givePhotoHint();
  }
});
window.addEventListener('keyup', (e) => setMove(e.code, false));

// --- Controller ---
// Right stick look speed at full tilt, radians per second (scaled by the
// same Options sensitivity as the mouse).
const STICK_YAW_SPEED = 3.0;
const STICK_PITCH_SPEED = 2.0;

/**
 * Browsers only grant pointer lock to a click or key press, which a
 * controller button doesn't count as. Chrome makes one exception: a page
 * that released the lock itself (Start below calls exitPointerLock) may
 * take it back without one. Otherwise, and for the first lock of a
 * session, the player has to click once.
 */
function lockFromGamepad() {
  Promise.resolve(renderer.domElement.requestPointerLock()).catch(() => {
    showHint('Click once to start - the browser needs a mouse click before the controller can take over.', 5000);
  });
}

const gamepad = createGamepadInput({
  mode: () => {
    if (mazeHints.isOpen) return 'menu';
    if (dialogueUI.isActive && !paused) return 'dialogue';
    if (activeCinematic()?.active) return paused ? 'menu' : 'cinematic';
    if (isLocked) return 'play';
    if (titleScreen.active && !titleMenuBlocked()) return 'title';
    return 'menu';
  },
  onStart: () => {
    if (activeCinematic()?.active) { pauseOpening(!paused); return; }
    // Releasing the lock ourselves shows the pause menu (see pointerlockchange)
    // and is what lets the next Start take it back without a click.
    if (isLocked) { document.exitPointerLock(); return; }
    if (!pauseMenu.hidden) { if (readyToPlay && currentRoom) lockFromGamepad(); return; }
    if (currentRoomKey === 'maze' && paused) return;
    if (readyToPlay && currentRoom && !overlay.classList.contains('hidden')) lockFromGamepad();
  },
  // A on "Click to Play" (nothing focused there) starts, like Start.
  onConfirm: () => {
    if (!readyToPlay || !currentRoom || overlay.classList.contains('hidden') || !pauseMenu.hidden) return false;
    if (currentRoomKey === 'maze' && paused) return false;
    lockFromGamepad();
    return true;
  },
  onConnect: () => showHint('Controller connected', 2500),
});

/** Right-stick look, under the same conditions as the mouse-look handler. */
function updateGamepadLook(deltaSeconds) {
  if (gamepad.lookX === 0 && gamepad.lookY === 0) return;
  if (!isLocked || !readyToPlay || paused || activeCinematic()?.active || dialogueUI.isActive || stageBusy() || activeCutscene) return;
  const scale = mouseSensitivityScale * deltaSeconds;
  const oldYaw = cameraYaw, oldPitch = cameraPitch;
  cameraYaw -= gamepad.lookX * STICK_YAW_SPEED * scale;
  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + gamepad.lookY * STICK_PITCH_SPEED * scale, PITCH_MIN, PITCH_MAX,
  );
  if (shouldShowObjective(gameplayHUDContext())) {
    controlsTutorial.look(Math.hypot(cameraYaw - oldYaw, cameraPitch - oldPitch));
  }
}

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
  // Shift+T in the maze: jump to the next keepsake still to collect
  // (bowling ball first, then the hot chocolate mug).
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyT' || !event.shiftKey || event.repeat || event.ctrlKey || event.altKey || event.metaKey
      || !isLocked || !readyToPlay || paused || dialogueUI.isActive || currentRoomKey !== 'maze') return;
    const next = MAZE_FINDABLES.find(item => !mazeItems.hasCollected(item.id));
    if (!next) { showHint('Dev teleport: both keepsakes already collected', 3000); return; }
    const pickup = currentRoomInfo?.interactables?.find(entry => entry.prompt?.() === `Pick up ${next.label}`);
    if (!pickup) return;
    event.preventDefault();
    // Land beside it, not inside its collider: 1.2 m out along the side she
    // came from stays inside the item's 4.5 m cell whatever the direction.
    const at = pickup.anchor.getWorldPosition(new THREE.Vector3());
    const away = new THREE.Vector3(player.position.x - at.x, 0, player.position.z - at.z);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
    away.normalize().multiplyScalar(1.2);
    player.position.x = at.x + away.x;
    player.position.z = at.z + away.z;
    resetMoveState();
    showHint(`Dev teleport: ${next.label}`, 2500);
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
  gamepad.resetSprint();
  // Called on every teleport too: drop any jump in progress, and the floor
  // follow snaps her down onto wherever she now stands.
  jumpQueued = false;
  land();
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
  if (currentRoomKey === 'maze' && paused) return;
  // Only resume when clicking the overlay background itself (not a button inside it)
  if (e.target !== overlay && e.target !== overlayTitle && e.target !== overlaySubtitle) return;
  if (!readyToPlay) return;
  if (!currentRoom) return; // on home screen, must pick a room first
  renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('click', () => {
  if (currentRoomKey === 'maze' && paused) return;
  if (readyToPlay && !isLocked && !dialogueUI.isActive && !stageBusy() && currentRoom) {
    renderer.domElement.requestPointerLock();
  }
});
function pauseRoomForMenu() {
  // Esc mid-game: show the pause menu (over any conversation, which waits)
  paused = true;
  // Freeze an in-room conversation behind the menu, as pauseOpening does.
  // Left running, its voice clip played out unheard and the player came back
  // to silent text.
  dialogueUI.setPaused(true);
  ambience.setPaused(true);
  music.setPaused(true);
  openingAudio.setMainThemePaused(true);
  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'Paused';
  overlaySubtitle.textContent = pauseCaption.textContent = 'The show will resume when you’re ready.';
  roomPicker.hidden = true;
  dialoguePicker.hidden = true;
  btnTitle.hidden = true;
  pauseMenu.hidden = false;
  openingAudio.playIntermissionCue();
  showPauseMemory();
}

document.addEventListener('pointerlockchange', () => {
  mazeClockWasPlayable = false;
  isLocked = document.pointerLockElement === renderer.domElement;
  crosshair.hidden = !isLocked;
  if (mazeHints.isOpen && isLocked) {
    crosshair.hidden = true; document.exitPointerLock(); return;
  }
  if (isLocked) {
    overlay.classList.add('hidden');
    pauseMenu.hidden = true;
    savePanel.hidden = true;
    // Unfreeze a conversation the pause below froze, so its voice clip
    // picks up where it stopped.
    if (paused) dialogueUI.setPaused(false);
    ambience.setPaused(false);
    music.setPaused(false);
    openingAudio.setMainThemePaused(false);
    paused = false;
    runPendingJumpStart();
    return;
  }
  lastUnlockMs = performance.now();
  // A keyup can be missed while the pointer is unlocked (e.g. the browser
  // ate the key combo that released it), so clear held movement here too,
  // not just on blur.
  resetMoveState();
  if (!levelCompletePanel.hidden) return;
  if (!currentRoom || !readyToPlay) return; // home screen, loading or endLevel — handled elsewhere
  pauseRoomForMenu();
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
// within `radius` of the anchor (see nearestInRange), unless `aimOnly`,
// where `radius` only caps how close she must be to aim at it. interact() gets
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
 * Swept circle-vs-box hit test for the maze's walls — resolveWallCollisions'
 * depenetrate-after-the-fact check only catches a step that *lands* within
 * a radius of a box; a fast enough step (sprinting, a frame hitch) can clear
 * a thin wall's whole footprint in one go and never land there at all. This
 * sweeps the full step first, each box pre-expanded by PLAYER_RADIUS (the
 * player is a point moving through Minkowski-expanded boxes), so it catches
 * that case the way firstWallHit's raycast already does for mesh rooms.
 */
function firstColliderHit(position, direction, distance) {
  const feetY = position.y - PLAYER_HEIGHT;
  let nearest = null;
  const consider = (t, nx, nz) => {
    if (t < 0 || t > distance) return;
    if (nearest && t >= nearest.distance) return;
    nearest = { distance: t, nx, nz };
  };
  for (const box of colliders) {
    if (box.max.y <= feetY + STEP_HEIGHT || box.min.y >= position.y) continue;

    // Already touching this box right now? Only a block if the step
    // actually heads further in (closest-point normal, same test
    // resolveWallCollisions uses) — mirrors firstWallHit's raycast, which
    // simply can't hit a surface behind its own origin. Without this,
    // moving *away* from a wall you're resting against would read as
    // blocked too, freezing movement next to any wall.
    {
      const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
      const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
      const dx = position.x - closestX, dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS && distSq > 1e-9) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist, nz = dz / dist;
        if (-(direction.x * nx + direction.z * nz) > 1e-4) consider(0, nx, nz);
      }
    }

    // Not yet touching: sweep the step against the box's faces, each
    // expanded by PLAYER_RADIUS (the player as a point moving through a
    // Minkowski-expanded box) — but a box's *expanded corners* are square,
    // not the rounded quarter-circle a real swept circle traces, so a
    // slab hit landing past the box's actual edge (i.e. near a corner, not
    // a flat face) is swapped for a proper swept-circle-vs-corner-point
    // hit instead. Without that, the square overshoot can wall off a
    // walkable gap right next to a corner — exactly where two walls meet.
    let enter = -Infinity, exit = distance, axis = null, sign = 0, outsideSlab = false;
    for (const [o, d, lo, hi, name] of [
      [position.x, direction.x, box.min.x - PLAYER_RADIUS, box.max.x + PLAYER_RADIUS, 'x'],
      [position.z, direction.z, box.min.z - PLAYER_RADIUS, box.max.z + PLAYER_RADIUS, 'z'],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) outsideSlab = true;
        continue;
      }
      const near = d > 0 ? (lo - o) / d : (hi - o) / d;
      const far = d > 0 ? (hi - o) / d : (lo - o) / d;
      if (near > enter) { enter = near; axis = name; sign = d > 0 ? -1 : 1; }
      if (far < exit) exit = far;
    }
    if (outsideSlab || !axis || enter < 0 || enter > exit) continue;

    const entryOther = axis === 'x' ? position.z + direction.z * enter : position.x + direction.x * enter;
    const [oMin, oMax] = axis === 'x' ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
    if (entryOther >= oMin && entryOther <= oMax) {
      consider(enter, axis === 'x' ? sign : 0, axis === 'z' ? sign : 0);
      continue;
    }
    const cornerOther = entryOther < oMin ? oMin : oMax;
    const cornerX = axis === 'x' ? (sign > 0 ? box.max.x : box.min.x) : cornerOther;
    const cornerZ = axis === 'x' ? cornerOther : (sign > 0 ? box.max.z : box.min.z);
    const ox = position.x - cornerX, oz = position.z - cornerZ;
    const b = direction.x * ox + direction.z * oz;
    const c = ox * ox + oz * oz - PLAYER_RADIUS * PLAYER_RADIUS;
    const discriminant = b * b - c;
    if (discriminant < 0) continue;
    const t = -b - Math.sqrt(discriminant);
    if (t < 0) continue;
    const hx = position.x + direction.x * t - cornerX, hz = position.z + direction.z * t - cornerZ;
    const hd = Math.hypot(hx, hz) || 1;
    consider(t, hx / hd, hz / hd);
  }
  if (!nearest) return null;
  hitNormal.set(nearest.nx, 0, nearest.nz);
  return { distance: nearest.distance, normal: hitNormal };
}

/** The colliders-only rooms' (the maze) equivalent of moveWithCollisions:
 * sweeps the frame's full step against the Box3 walls before applying it,
 * instead of moving the whole step and depenetrating after the fact. */
function moveWithBoxCollisions(player, direction, distance) {
  const hit = firstColliderHit(player.position, direction, distance);
  if (!hit) {
    player.position.addScaledVector(direction, distance);
    return;
  }
  player.position.addScaledVector(direction, hit.distance);

  const leftover = distance - hit.distance;
  if (leftover < 1e-4) return;

  // Retry the leftover along the wall face, same as moveWithCollisions.
  slideDelta.set(direction.x * leftover, 0, direction.z * leftover);
  slideDelta.addScaledVector(hit.normal, -slideDelta.dot(hit.normal));
  const slideLength = slideDelta.length();
  if (slideLength < 1e-4) return;
  slideDelta.divideScalar(slideLength);

  const slideHit = firstColliderHit(player.position, slideDelta, slideLength);
  player.position.addScaledVector(slideDelta, slideHit ? slideHit.distance : slideLength);
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
 * of letting them walk off its edge into the void. Mid-jump, a floor still
 * below her feet leaves her in the air; she lands once she reaches it.
 */
function settleOnGround(player) {
  const feetY = player.position.y - PLAYER_HEIGHT;
  const originY = player.position.y + 0.2;
  for (const [dx, dz] of GROUND_PROBES) {
    const groundY = findGroundY(player.position.x + dx, player.position.z + dz, originY, feetY);
    if (groundY !== null) {
      if (airborne && groundY < feetY) return true;
      player.position.y = groundY + PLAYER_HEIGHT;
      if (verticalVelocity <= 0) land();
      return true;
    }
  }
  return false;
}

/**
 * Starts a queued jump and moves her along the arc. Runs before the
 * frame's horizontal step: lifting her feet first raises the wall and
 * body probes with them, which is what lets her clear a ledge mid-air.
 */
function applyJump(deltaSeconds) {
  if (jumpQueued && jumpsUsed < 2) {
    airborne = true;
    verticalVelocity = JUMP_SPEED;
    jumpsUsed++;
  }
  jumpQueued = false;
  if (!airborne) return;
  verticalVelocity -= GRAVITY * deltaSeconds;
  player.position.y += verticalVelocity * deltaSeconds;
}

function land() {
  airborne = false;
  verticalVelocity = 0;
  jumpsUsed = 0;
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
function showLevelComplete(title, subtitle, { resume = true, chime = 'complete', buttonLabel = 'Continue →', memoryRetry = null } = {}) {
  cancelLevelComplete();
  const token = loadToken;
  resetMoveState();
  stage.hold(true);
  // The pointer-lock event must see the card, so it never opens Pause over it.
  levelCompleteTitle.textContent = title;
  levelCompleteSubtitle.textContent = subtitle;
  levelCompleteCaine.hidden = chime !== 'fail';
  const memoryText = caineMemory.retryCaption(memoryRetry);
  retryMemoryCaption.textContent = memoryText ?? '';
  retryMemoryCaption.hidden = !memoryText;
  btnLevelCompleteContinue.textContent = buttonLabel;
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
      retryMemoryCaption.hidden = true;
      retryMemoryCaption.textContent = '';
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
//
// Kaufmo's room works the same way, except that from inside it the hall
// itself shows through his door (her room has a stand-in of it): see
// walkInLink.js for where his room sits behind the hall's door. The hall
// keeps one of the two ready, whichever door Pomni's nearer.

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
  if (currentRoomKey === 'kaufmo') {
    updateDoorToHall();
    return;
  }
  const link = currentRoomInfo?.hallLink;
  if (currentRoomKey !== 'pomni' || !link?.isOpen()) return;
  if (!roomPreload) preloadRoom('dorm', 'pomni');
  prepareRoom(roomPreload);
  if (link.crossed(player.position)) walkIntoHall(link);
}

/**
 * In Kaufmo's room: the hall loads in the background, and once it's ready
 * it's put behind his door whenever that's open, to walk out into.
 */
function updateDoorToHall() {
  const room = currentRoomInfo;
  if (!room?.hallDoor) return;
  if (!roomPreload) preloadRoom('dorm', currentRoomKey);
  // Level 3 opens with Jax bolting through the hall, but the hall behind
  // this door was loaded (or parked, walking in) before Kaufmo sent her to
  // find him, so it has no Jax in it. Swapped for one that does as soon as
  // he has, under the Level 2 card. The link to it stays: it's only where
  // the two doorways sit, the same for every copy of the hall.
  if (storyProgress.findingJax && roomPreload.key === 'dorm' && roomPreload.result && !roomPreload.result.jaxHallway) {
    if (roomPreload.peeking) showHallBehindDoor(roomPreload, false);
    dropRoomPreload();
    preloadRoom('dorm', currentRoomKey);
  }
  prepareRoom(roomPreload);
  const entry = roomPreload;
  if (entry.key !== 'dorm') return;
  if (!room.hallLink && roomReady(entry)) linkRoom(room, currentRoomKey, entry.result);
  const link = room.hallLink;
  if (!link) return;
  // A swapped-in hall still loading isn't shown yet: walkIntoHall holds her
  // at the threshold until it's ready.
  const showing = link.isOpen() && roomReady(entry);
  if (showing !== entry.peeking) showHallBehindDoor(entry, showing);
  if (link.crossed(player.position)) walkIntoHall(link);
}

// The hall has one walk-in room ready at a time: the one whose door Pomni's
// nearest, keeping the one it has until another door's this much nearer.
const PRELOAD_SWITCH_METRES = 6;

function updateHallDoorways() {
  const doorways = currentRoomInfo?.walkInDoorways;
  if (currentRoomKey !== 'dorm' || !doorways) return;
  const key = roomToPreload(doorways);
  if (roomPreload && roomPreload.key !== key) {
    if (roomPreload.peeking) showRoomBehindDoor(roomPreload, false);
    dropRoomPreload();
  }
  if (!roomPreload) preloadRoom(key, 'dorm');
  prepareRoom(roomPreload);
  const entry = roomPreload;
  const doorway = doorways[key];
  if (roomReady(entry) && !entry.result.hallLink) linkRoom(entry.result, key, currentRoomInfo);
  const showing = doorway.control.ajar && roomReady(entry) && Boolean(entry.result.hallLink);
  if (showing !== entry.peeking) showRoomBehindDoor(entry, showing);
  if (doorway.crossed(player.position)) walkIntoRoom(entry, doorway);
}

function roomToPreload(doorways) {
  const away = (key) => doorways[key].centre.distanceTo(player.position);
  const nearest = Object.keys(doorways).reduce((a, b) => (away(b) < away(a) ? b : a));
  const kept = roomPreload?.key;
  return kept in doorways && away(kept) < away(nearest) + PRELOAD_SWITCH_METRES ? kept : nearest;
}

/**
 * Works out where a room with its own door to the hall (Kaufmo's) sits
 * behind the hall's door, once both are loaded. From then on she walks out
 * through it rather than taking its portal.
 */
function linkRoom(room, key, hall) {
  const doorway = hall.walkInDoorways?.[key];
  if (!room.hallDoor || !doorway) return;
  room.hallLink = linkToHall(room, room.hallDoor, doorway);
  room.hallDoor.portal.enabled = () => false;
  if (room === currentRoomInfo) bounds = walkableBounds(room.bounds);
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
  music.prepare(key);
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
      // The hall and Kaufmo's room are each seen from the other, and the
      // one she's in may have textures it's never yet had on screen.
      const linked = key === 'kaufmo' || currentRoomInfo?.hallDoor;
      for (const root of linked ? [result.group, currentRoom] : [result.group]) {
        root.traverse((object) => {
          for (const material of [object.material].flat()) {
            for (const value of Object.values(material ?? {})) if (value?.isTexture) textures.add(value);
          }
        });
      }
      entry.textures = [...textures].filter((texture) => !renderer.properties.get(texture).__webglTexture);
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
      // The hall and Kaufmo's room show each other for real: the room she's
      // in, as it will look from this one once she's walked through.
      if (key === 'kaufmo' || currentRoomInfo?.hallDoor) compiling.push(compileAsSeenFrom(staging));
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
          const seenFromHere = key === 'dorm' ? Boolean(currentRoomInfo?.hallDoor) : true;
          if (!seenFromHere || roomPreload !== entry) return null;
          // Seen from where she is: its own lights and mirrors stay off, so
          // showing it never changes the scene's light count (which would
          // rebuild every material's shader), and only that room's light it.
          result.group.traverse((object) => {
            if ((object.isLight || object.isReflector) && object.visible) entry.hidden.push(object);
          });
          for (const object of entry.hidden) object.visible = false;
          return renderer.compileAsync(result.group, camera, scene);
        })
        .then(() => {
          if (roomPreload === entry) {
            rehearseShadows(entry);
            // Its floor plan, traced now rather than as she steps into it.
            if (key === 'dorm') minimap.prepare(result.group, result.spawn.y);
          }
          entry.compiled = true;
        });
    })
    .catch((error) => {
      console.warn(`${key} could not preload; its doorway falls back to a normal trip.`, error);
      entry.failed = true;
    });
}

// For rehearseShadows: where it draws, and what everything is drawn with
// there (one cheap shader, not each material's).
const SCRAP_TARGET = new THREE.WebGLRenderTarget(1, 1);
const SCRAP_MATERIAL = new THREE.MeshBasicMaterial();

/**
 * Shadow shaders are built only as a shadow map's drawn (compiling a room
 * doesn't), so stepping into a preloaded room stalled on its meshes' and
 * Kaufmo's and her own blush's. They're built for the lights the scene had
 * the frame before, which on the step through are this room's. So they're
 * drawn once here, in this scene, into a scrap target: the preloaded room
 * (its lights off, as they are until she's in it) and Pomni stood at this
 * room's shadow-casting lamp, in its shadow. Anything the room's hiding for
 * now is shown for it, and a skinned mesh only poses (so only casts) once
 * it's been in view, so none of those are culled for it.
 */
function rehearseShadows(entry) {
  let lamp = null;
  currentRoom?.traverse((object) => { if (object.isPointLight && object.castShadow && object.visible) lamp ??= object; });
  if (!lamp) return;
  const { group, spawn } = entry.result;
  const at = lamp.getWorldPosition(new THREE.Vector3());
  const preview = group.userData.dormHallPreview?.group;
  const switched = [];
  const unculled = [];
  const flip = (object, visible) => { switched.push(object); object.visible = visible; };
  currentRoom.traverse((object) => { if (object.isReflector && object.visible) flip(object, false); });
  group.traverse((object) => {
    if ((object.isLight || object.isReflector) && object.visible) flip(object, false);
    else if (!object.visible && !object.isLight && !object.isReflector && object !== preview) flip(object, true);
    if (object.isSkinnedMesh && object.frustumCulled) unculled.push(object);
  });
  for (const object of unculled) object.frustumCulled = false;
  group.position.copy(at).sub(spawn);
  scene.add(group);
  const position = player.position.clone();
  player.position.copy(at);
  const view = new THREE.PerspectiveCamera(120, 1, 0.1, 200);
  view.position.copy(at);
  const target = renderer.getRenderTarget();
  renderer.setRenderTarget(SCRAP_TARGET);
  scene.overrideMaterial = SCRAP_MATERIAL;
  try {
    renderer.render(scene, view);
  } catch (error) {
    console.warn(`Could not rehearse ${entry.key}'s shadows; they'll build as she walks in.`, error);
  } finally {
    scene.overrideMaterial = null;
    renderer.setRenderTarget(target);
    for (const object of switched) object.visible = !object.visible;
    for (const object of unculled) object.frustumCulled = true;
    scene.remove(group);
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);
    player.position.copy(position);
  }
}

/** The room she's in, compiled lit by `staging` (its own lights off), as it's seen from there. */
function compileAsSeenFrom(staging) {
  const switchedOff = [];
  currentRoom.traverse((object) => {
    if ((object.isLight || object.isReflector) && object.visible) { switchedOff.push(object); object.visible = false; }
  });
  // compileAsync builds the programs before it returns; it only waits on them after.
  try {
    return renderer.compileAsync(currentRoom, camera, staging);
  } finally {
    for (const object of switchedOff) object.visible = true;
  }
}

/**
 * Loads the Dorm Hall behind the loading screen while Pomni's room loads,
 * and gets it completely ready to walk into: textures uploaded, collision
 * trees built, and every shader it will need built by actually drawing it
 * once (rehearseRoom). Without this, stepping out of her room stalls for
 * a second or two on that work. Never fails the bedroom load: if the hall
 * can't preload, her doorway falls back to a normal trip.
 */
function readyHallAhead(token) {
  preloadRoom('dorm', 'pomni');
  const entry = roomPreload;
  return entry.settled.then(() => {
    if (token !== loadToken || roomPreload !== entry || !entry.result || entry.failed) return;
    try {
      while (entry.textures.length) renderer.initTexture(entry.textures.pop());
      for (const mesh of entry.trees.splice(0)) if (!mesh.geometry.boundsTree) computeBoundsTree.call(mesh.geometry);
      rehearseRoom(entry);
      minimap.prepare(entry.result.group, entry.result.spawn.y);
    } catch (error) {
      console.warn('Could not get the hall ready ahead; it will finish preparing in play.', error);
    }
  });
}

/**
 * Kaufmo's room, just loaded behind the loading screen: the hall outside
 * his door is preloaded (seen from his room, as preloadRoom does), then
 * drawn as it'll be when she walks out into it (rehearseSteppingOut), and
 * only then is the loading screen let go (`ready`). Two frames more under
 * the screen catch anything that left to build.
 */
function readyHallBehindDoor(token, ready) {
  readyToPlay = false;
  overlay.classList.add('loading');
  preloadRoom('dorm', 'kaufmo');
  const entry = roomPreload;
  entry.settled.then(() => {
    if (token !== loadToken) return;
    if (roomPreload === entry && entry.result && !entry.failed) {
      try {
        while (entry.textures.length) renderer.initTexture(entry.textures.pop());
        for (const mesh of entry.trees.splice(0)) if (!mesh.geometry.boundsTree) computeBoundsTree.call(mesh.geometry);
        linkRoom(currentRoomInfo, currentRoomKey, entry.result);
        rehearseSteppingOut(entry);
      } catch (error) {
        console.warn('Could not get the hall ready ahead; it will finish preparing in play.', error);
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== loadToken) return;
      readyToPlay = true;
      overlay.classList.remove('loading');
      ready();
    }));
  });
}

/**
 * The scene as it is the moment Pomni steps out of Kaufmo's room into the
 * hall: the hall in place behind his door and lit by its own lights, his
 * room by them too, seen from the doorway both ways. Drawn to the screen
 * (it's under the loading screen) as the first step out otherwise stalled
 * on drawing all of both rooms that way for the first time. Each way twice:
 * shadows are drawn for the lights of the scene's previous draw.
 */
function rehearseSteppingOut(entry) {
  const link = currentRoomInfo.hallLink;
  if (!link) return;
  const switchedOff = [];
  currentRoom.traverse((object) => {
    if (object.isLight && object.visible) { switchedOff.push(object); object.visible = false; }
  });
  for (const object of entry.hidden) object.visible = true;
  showHallBehindDoor(entry, true);
  try {
    const doorway = currentRoomInfo.hallDoor.frameBox.getCenter(new THREE.Vector3());
    doorway.y = floorY + PLAYER_HEIGHT;
    const view = new THREE.PerspectiveCamera(100, camera.aspect, 0.1, 200);
    view.position.copy(doorway);
    for (const way of [link.outwardInRoom, link.outwardInRoom.clone().negate()]) {
      view.lookAt(doorway.clone().add(way));
      view.updateMatrixWorld();
      renderer.render(scene, view);
      renderer.render(scene, view);
    }
  } finally {
    showHallBehindDoor(entry, false);
    for (const object of entry.hidden) object.visible = false;
    for (const object of switchedOff) object.visible = true;
  }
}

/**
 * Draws a preloaded room once, as the scene will be once Pomni's in it:
 * her, its own lights and environment, and the shadows. three.js builds
 * shaders for the exact lights, shadows and output they're drawn with,
 * and some only when drawn (shadow casting), so compiling ahead isn't
 * enough; one real draw is. It's drawn to the screen (an offscreen target
 * builds different shaders) and the next frame simply draws over it.
 */
function rehearseRoom(entry, extras = [], aim = null) {
  const { group } = entry.result;
  const room = currentRoom;
  const environment = scene.environment;
  const playerVisible = player.visible;
  if (room) room.visible = false;
  player.visible = true;
  scene.add(group, ...extras);
  scene.environment = entry.result.environment ? environmentMap : null;
  const view = new THREE.PerspectiveCamera(120, camera.aspect, 0.1, 200);
  view.position.copy(entry.result.spawn).y += PLAYER_HEIGHT;
  if (aim) {
    view.position.copy(aim.from);
    view.lookAt(aim.to);
  }
  scene.updateMatrixWorld(true);
  renderer.compile(scene, view);
  renderer.render(scene, view);
  scene.remove(group, ...extras);
  scene.environment = environment;
  player.visible = playerVisible;
  if (room) room.visible = true;
}

/**
 * Her room as the hall shows it behind her door, and as it's kept once she
 * walks out (parkRoom): clipped at the hall's wall, its own lights and
 * mirrors off, lit by the hall. Rehearsed with the ready hall under the
 * story's loading screen, so neither the peek nor the parking stalls.
 */
function rehearseBedroomFromHall(bedroom, hallEntry) {
  const doorway = hallEntry.result.pomniDoorway;
  if (!doorway || !bedroom.hallLink) return;
  const { group } = bedroom;
  clipToBedroomDoor(group);
  const switchedOff = [];
  group.traverse((object) => {
    if ((object.isLight || object.isReflector) && object.visible) { switchedOff.push(object); object.visible = false; }
  });
  const preview = group.userData.dormHallPreview?.group;
  const previewVisible = preview?.visible;
  if (preview) preview.visible = false;
  bedroomClip.copy(doorway.wallPlane);
  bedroom.hallLink.toHall.decompose(group.position, group.quaternion, group.scale);
  // Looking in from the hall, the way she sees it with the door open:
  // three.js builds a clipped material's shaders right only when it's
  // actually drawn (compiling ahead gets the clipping wrong).
  const doorwayCentre = hallEntry.result.hallDoors?.pomni?.control.interactable.anchor.position.clone();
  const aim = doorwayCentre && {
    from: doorwayCentre.clone().addScaledVector(doorway.into, -2.5).setY(doorwayCentre.y + PLAYER_HEIGHT),
    to: doorwayCentre.clone().addScaledVector(doorway.into, 3).setY(doorwayCentre.y + 1),
  };
  try {
    rehearseRoom(hallEntry, [group], aim);
  } finally {
    group.position.set(0, 0, 0);
    group.quaternion.identity();
    group.scale.set(1, 1, 1);
    group.updateMatrixWorld(true);
    bedroomClip.copy(KEEP_ALL);
    if (preview) preview.visible = previewVisible;
    for (const object of switchedOff) object.visible = true;
  }
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

/** Puts the preloaded room behind its open door in the hall (or takes it away). */
function showRoomBehindDoor(entry, show) {
  entry.peeking = show;
  const { group, hallLink } = entry.result;
  for (const part of [hallLink.door].flat()) if (part) part.visible = !show;
  if (!show) {
    group.removeFromParent();
    bedroomClip.copy(KEEP_ALL);
    return;
  }
  bedroomClip.copy(currentRoomInfo.walkInDoorways[entry.key].wallPlane);
  hallLink.toHall.decompose(group.position, group.quaternion, group.scale);
  currentRoom.add(group);
  group.updateMatrixWorld(true);
}

/** Puts the hall behind Kaufmo's open door (or takes it away), his door showing in the doorway. */
function showHallBehindDoor(entry, show) {
  entry.peeking = show;
  const { group, walkInDoorways } = entry.result;
  for (const part of walkInDoorways[currentRoomKey].parts) part.visible = !show;
  const { glimpse } = currentRoomInfo.hallDoor.portal;
  if (glimpse) glimpse.visible = !show;
  if (!show) {
    group.removeFromParent();
    return;
  }
  currentRoomInfo.hallLink.toHall.clone().invert().decompose(group.position, group.quaternion, group.scale);
  currentRoom.add(group);
  group.updateMatrixWorld(true);
}

const HALL_DOOR_CLEARANCE = PLAYER_RADIUS + 0.15; // metres out from the hall's door
const BEDROOM_DOOR_CLEARANCE = PLAYER_RADIUS + 0.25; // metres into the room

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
  currentRoomFrom = leaving.key;
  const environmentIntensity = scene.environmentIntensity;
  applyLoadedRoom(room, () => {}, entry.key);
  // Eased to the new room's from here, not switched (her bedroom's own
  // lighting sets it itself).
  if (!room.lighting) scene.environmentIntensity = environmentIntensity;
  takeCheckpoint();
  pomni.rotation.y = pose.pomniYaw;
  cameraPitch = pose.pitch;
  currentCameraDistance = pose.distance;
  parkRoom(leaving.key, leaving.result, entry.key);
}

/**
 * Keeps the room Pomni just walked out of (into `into`) as the next room
 * behind the doorway, in the state she left it, ready to walk back into: no
 * reload. Leaving the hall for her room, the hall's copy of her door is shut
 * behind her (walkIntoHall brings her out just clear of it). Otherwise the
 * room's seen from the other one, with its own lights and mirrors off, lit
 * by that room's.
 */
function parkRoom(key, result, into) {
  const entry = {
    key, result, failed: false, compiled: true, trees: [], textures: [], peeking: false, hidden: [],
  };
  roomPreload = entry;
  entry.settled = Promise.resolve();
  if (key === 'dorm' && into === 'pomni') {
    const door = result.hallDoors?.pomni?.control;
    door?.close({ immediate: true });
    door?.update(0);
    return;
  }
  result.lighting?.detach();
  // The hall itself is right there now; its stand-in through her doorway
  // would only sit on top of it.
  result.group.userData.dormHallPreview?.setVisible(false);
  if (key === 'pomni') clipToBedroomDoor(result.group);
  result.group.traverse((object) => {
    if ((object.isLight || object.isReflector) && object.visible) entry.hidden.push(object);
  });
  for (const object of entry.hidden) object.visible = false;
  // Her room's shaders as seen from the hall were built under the story's
  // loading screen (rehearseBedroomFromHall); compiling them again here
  // can't get the clipping right and only stalls a frame. The hall's and
  // Kaufmo's room's, as each is seen from the other, were built as the
  // second of the two loaded (preloadRoom).
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

  // She comes out just clear of the doorway, and the hall's copy of the
  // door stands open, just as she left the room's own.
  const leaving = currentRoomKey;
  const past = link.depthPast(player.position);
  const pose = carryPose(link.toHall, link.yawToHall);
  pose.feet.addScaledVector(link.outward, Math.max(0, HALL_DOOR_CLEARANCE - past));
  enterPreloadedRoom(entry, pose);
  currentRoomInfo.hallDoors?.[leaving]?.control.open({ immediate: true });
  for (const part of currentRoomInfo.walkInDoorways?.[leaving]?.parts ?? []) part.visible = true;
  armCaineArrival();
}

function walkIntoRoom(entry, doorway) {
  if (entry.failed || (roomReady(entry) && !entry.result.hallLink)) {
    dropRoomPreload();
    travelTo(entry.key);
    return;
  }
  if (!entry.peeking) return; // not ready yet: she's at the edge of the hall's floor

  const link = entry.result.hallLink;
  const past = doorway.depthPast(player.position);
  const pose = carryPose(link.toHall.clone().invert(), -link.yawToHall);
  // Just clear of the room's (open) door's leaf and the doorway, inside.
  pose.feet.addScaledVector(link.outwardInRoom, -Math.max(0, BEDROOM_DOOR_CLEARANCE - past));
  // Its own door's in the doorway now; the hall's copy goes with the hall.
  for (const part of [link.door].flat()) if (part) part.visible = true;
  enterPreloadedRoom(entry, pose);
  // Looking back out, the hall's right there through the open door: her
  // room's stand-in of it, or (Kaufmo's) the hall itself, this same frame.
  currentRoom.userData.dormHallPreview?.setVisible(true);
  currentRoomInfo.hallDoor?.control.update(0);
  updateHallLink();
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
  if (currentRoomKey !== 'maze' || caught || reachedExit) return;

  for (const hazard of hazards) {
    const dx = player.position.x - hazard.mesh.position.x;
    const dz = player.position.z - hazard.mesh.position.z;
    if (Math.hypot(dx, dz) < hazard.radius + PLAYER_RADIUS) {
      caught = true;
      // A hazard catch fails the attempt outright, same as the countdown
      // expiring: retryMaze shows the fail card, then reseeds (a fresh
      // layout, both keepsakes back) and restarts the full countdown.
      const title = hazard.mesh.userData?.isGloink ? 'Gloinked!' : 'Abstracted!';
      const subtitle = hazard.mesh.userData?.isGloink
        ? 'A patrolling gloink caught you — try again.'
        : 'A patrolling hazard caught you — try again.';
      void retryMaze(title, subtitle);
      return;
    }
  }

  if (!triggers) return;
  triggerProbe.set(player.position.x, floorY + 0.5, player.position.z);


  updateMazeSearch(0);
  if (triggers.exit.containsPoint(triggerProbe)) {
    if(!mazeItems.jaxComplete){
      const now=performance.now();
      if(!lastMazeExitHint||now-lastMazeExitHint>3000){showHint("Find Jax and talk to him before leaving.");lastMazeExitHint=now;}
      return;
    }
    foundJax=true;
    reachedExit = true;
    void leaveMaze(jaxOutcome());
  }
}

function updateMovement(deltaSeconds) {
  const sprinting = move.sprint || gamepad.sprint;
  const speed = WALK_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1) * DEV_SPEED_MULTIPLIER;

  velocity.x = Number(move.right) - Number(move.left);
  velocity.z = Number(move.back) - Number(move.forward);
  if (velocity.lengthSq() > 0) velocity.normalize();
  // Keys win; otherwise the left stick steers, and a half tilt walks at
  // half speed (the walk clip follows her actual speed, so it slows too).
  else velocity.set(gamepad.moveX, 0, gamepad.moveY);
  const padMoving = gamepad.moveX !== 0 || gamepad.moveY !== 0;
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
  // Standing still, she keeps facing whichever way she last walked: looking
  // around with the mouse moves only the camera, never her.

  const frameStartX = player.position.x;
  const frameStartZ = player.position.z;

  applyJump(deltaSeconds);

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
    // Jumping straight up never runs acceptMove, so land her here.
    if (airborne && !settleOnGround(player)) land();
  } else {
    moveDelta.set(0, 0, 0).addScaledVector(moveRight, velocity.x).addScaledVector(moveForward, -velocity.z);
    const boxDistance = moveDelta.length();
    if (boxDistance > 1e-6) {
      moveDelta.divideScalar(boxDistance);
      moveWithBoxCollisions(player, moveDelta, boxDistance);
    }

    // Belt-and-braces depenetration for any residual overlap (e.g. a wall
    // that moved into the player, or floating-point slack at a corner);
    // the sweep above is what stops sprinting from clearing a wall outright.
    resolveWallCollisions(player.position);

    if (bounds) {
      player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
      player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
      if (!airborne || player.position.y <= floorY + PLAYER_HEIGHT) {
        player.position.y = floorY + PLAYER_HEIGHT;
        land();
      }
    }
  }

  currentRoomInfo?.jaxBoundary?.constrainMotion({x:frameStartX,z:frameStartZ},player.position,PLAYER_RADIUS);

  // Animate from how far she actually got, so walking into a wall doesn't bob.
  const moved = Math.hypot(player.position.x - frameStartX, player.position.z - frameStartZ);
  if (shouldShowObjective(gameplayHUDContext()) && (move.forward || move.back || move.left || move.right || padMoving)) {
    controlsTutorial.move(moved, sprinting);
  }
  updatePomniWalk(deltaSeconds, deltaSeconds > 0 ? moved / deltaSeconds : 0);

  checkTriggers(player);
  checkPortals();
  updateHallLink();
  updateHallDoorways();
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
    pomniJump?.remove();
    pomniGaitArms?.remove();
    animSpeed = THREE.MathUtils.damp(animSpeed, speed, 12, dt);
    if (airborne || animSpeed < 0.2) {
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
    pomniGaitArms?.update(dt, animSpeed, airborne);
    pomniJump?.update(dt, airborne, verticalVelocity, jumpsUsed, animSpeed);
    pomniSpeaking?.update(dt, dialogueUI.currentSpeaker === 'pomni' && player.visible
      && !activeOpening?.active && !stageWalk && !stageGesture && stageSeatY === null && animSpeed < .2,
    dialogueUI.currentMood);
    return;
  }

  pomniJump?.remove();
  pomniGaitArms?.remove();
  walkAmount = THREE.MathUtils.damp(walkAmount, !airborne && speed > 0.1 ? 1 : 0, 10, dt);
  walkPhase += speed * dt * STEPS_PER_METRE * Math.PI;

  pomni.position.y = -PLAYER_HEIGHT + Math.abs(Math.sin(walkPhase)) * WALK_BOB_HEIGHT * walkAmount;
  pomni.rotation.z = Math.sin(walkPhase) * WALK_SWAY * walkAmount;
  pomniGaitArms?.update(dt, speed, airborne);
  pomniJump?.update(dt, airborne, verticalVelocity, jumpsUsed, speed);
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
const ARM_OUT_DURATION = 2.6;   // seconds: arm out to stop someone, held, lowered
// Handing something over: both hands out in front of her, together,
// held while it's taken (the photos, see handInActor), then lowered.
// Seconds.
const HAND_OVER = { raise: 0.45, hold: 0.8, lower: 0.5 };
const HAND_OVER_DURATION = HAND_OVER.raise + HAND_OVER.hold + HAND_OVER.lower;
const SEAT_CLEARANCE = 0.06;    // her hips this far above the seat
const SIT_SHARPNESS = 6;

let stageWalk = null;    // { points: Vector3[], index, speed, resolve }
let stageGesture = null; // { name, time, taps, onTap, resolve }
let stageSeatY = null;   // world height of the seat she's sitting on, or null
let stageDelay = null;
let stageCamera = null;
let stageHold = false;   // a room asked to keep control frozen (between beats)
let stageHeadAt = null;  // a world point she turns her head to (see stage.lookWithHead), or null
const headLookPoint = new THREE.Vector3(); // the last one, so the head eases back from it
let headLookAmount = 0;  // 0 head on the animation .. 1 fully turned, eased
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

  /** Plays a gesture on top of her idle: 'knock' (calls onTap at each rap), 'handOver' or 'armOut'. */
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

  /** Turns just her head (and neck) toward a world point, easing in; null eases back. */
  lookWithHead(point) {
    stageHeadAt = point ? headLookPoint.copy(point) : null;
  },

  lowerArms(value) { pomniGaitArms?.setLowered(value); },
};

/** Cancels anything staged; on room change and when a room resets its scene. */
function resetStage() {
  pomniSpeaking?.reset();
  pomniGaitArms?.setLowered(false);
  stageWalk?.resolve(false);
  stageGesture?.resolve(false);
  stageDelay?.resolve(false);
  stageWalk = null;
  stageGesture = null;
  stageSeatY = null;
  stageDelay = null;
  stageCamera = null;
  stageHold = false;
  stageHeadAt = null;
  headLookAmount = 0;
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

// stage.lookWithHead: how far her head turns, and how fast it gets there.
const HEAD_LOOK_SHARPNESS = 4;
const HEAD_MAX_TURN = 1.0;  // radians either side of where her body faces
const HEAD_MAX_TILT = 0.35; // radians up (and a little less down)
const headPosition = new THREE.Vector3();
const headLookLocal = new THREE.Vector3();
const headTiltAxis = new THREE.Vector3();
const pomniInverse = new THREE.Quaternion();

/**
 * Turns her head toward stageHeadAt on top of the clip pose: the turn
 * split between neck and head, the tilt on the head alone, about her
 * head's own (turned) left-right axis so it nods rather than rolls.
 */
function applyHeadLook(dt) {
  headLookAmount = THREE.MathUtils.damp(headLookAmount, stageHeadAt ? 1 : 0, HEAD_LOOK_SHARPNESS, dt);
  if (headLookAmount < 0.001 || !pomniBones.Head) return;
  pomniBones.Head.getWorldPosition(headPosition);
  pomni.getWorldQuaternion(pomniInverse).invert();
  headLookLocal.subVectors(headLookPoint, headPosition).applyQuaternion(pomniInverse); // her frame: +Z ahead
  const turn = THREE.MathUtils.clamp(Math.atan2(headLookLocal.x, headLookLocal.z), -HEAD_MAX_TURN, HEAD_MAX_TURN);
  const up = Math.atan2(headLookLocal.y, Math.hypot(headLookLocal.x, headLookLocal.z));
  const tilt = THREE.MathUtils.clamp(up, -HEAD_MAX_TILT * 0.6, HEAD_MAX_TILT);
  bendBone(pomniBones.Neck, pomni, UP, turn * 0.4 * headLookAmount);
  bendBone(pomniBones.Head, pomni, UP, turn * 0.6 * headLookAmount);
  headTiltAxis.set(Math.cos(turn), 0, -Math.sin(turn)); // SIDEWAYS, turned with the head
  bendBone(pomniBones.Head, pomni, headTiltAxis, -tilt * headLookAmount); // -: top back, looking up
}

/**
 * Layers the staged gesture/seat on the clip pose updatePomniWalk just
 * played (see bendBone for the axes). Knock: right arm raised forward,
 * forearm rapping KNOCK_TAPS times. Arm out: the same arm held out nearly
 * straight, to stop whoever's in front of her. Hand over: both hands out
 * together, palms up. Sit: hips lowered onto the seat, thighs forward,
 * shins hanging.
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

  applyHeadLook(dt);

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
      openingAudio.playKnock();
      gesture.onTap?.(gesture.taps);
    }
    bendBone(pomniBones.RightArm, pomni, SIDEWAYS, -1.25 * raise);
    bendBone(pomniBones.RightForeArm, pomni, SIDEWAYS, (-0.9 + 0.35 * rap) * raise);
  } else if (gesture.name === 'armOut') {
    const t = gesture.time;
    const raise = THREE.MathUtils.smoothstep(t, 0, 0.3) * (1 - THREE.MathUtils.smoothstep(t, ARM_OUT_DURATION - 0.4, ARM_OUT_DURATION));
    bendBone(pomniBones.RightArm, pomni, SIDEWAYS, -1.35 * raise);
    bendBone(pomniBones.RightForeArm, pomni, SIDEWAYS, -0.15 * raise);
  }
  if (gesture.name === 'handOver') {
    const t = gesture.time;
    const raise = THREE.MathUtils.smoothstep(t, 0, HAND_OVER.raise)
      * (1 - THREE.MathUtils.smoothstep(t, HAND_OVER_DURATION - HAND_OVER.lower, HAND_OVER_DURATION));
    for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
      bendBone(pomniBones[`${side}Arm`], pomni, SIDEWAYS, -0.95 * raise);
      bendBone(pomniBones[`${side}ForeArm`], pomni, SIDEWAYS, -0.45 * raise);
      bendBone(pomniBones[`${side}ForeArm`], pomni, UP, -sign * 0.45 * raise); // in toward the other hand
      bendBone(pomniBones[`${side}Hand`], pomni, SIDEWAYS, 0.4 * raise); // palms up, flat
    }
  }
  const duration = { handOver: HAND_OVER_DURATION, armOut: ARM_OUT_DURATION }[gesture.name] ?? KNOCK_DURATION;
  if (gesture.time >= duration) {
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
  if (focused) interactPrompt.textContent = `${gamepad.label('KeyE')} — ${focused.prompt()}`;
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
    if (!interactable.anchor || interactable.aimOnly) continue;
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
  // Head to head height by default: furniture between them (a desk, a
  // rocking horse) shouldn't hide someone standing right there; walls
  // still do. That default assumes the anchor is a person's feet, though —
  // a floor-level prop (a dropped photo, a maze keepsake) gives its own
  // sightHeight instead, or checking a point ~1.6m above a 3cm-tall photo
  // would read as "blocked" under any overhang/shelf the photo itself
  // sits in plain view under.
  sightOrigin.set(player.position.x, player.position.y - 0.1, player.position.z);
  sightTarget.set(anchorPosition.x, anchorPosition.y + (interactable.sightHeight ?? PLAYER_HEIGHT - 0.1), anchorPosition.z);
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
    if (interactable.seeThrough?.includes(box)) continue;
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
  // The music steps back under voices, and under the cinematics' own
  // snores, knocks and footsteps.
  music.setDucked(dialogueUI.isActive || Boolean(activeCinematic()?.active));
  // Polled before anything reads input this frame; its buttons arrive as
  // key events, so they land exactly where a key press would have.
  gamepad.update(rawDelta);
  updateGamepadLook(delta);
  updateCaineArrival(delta);
  updateSearchTimer(delta);
  updateMazeSearch(rawDelta);
  introStory.update(delta);
  fastForwardCutscenes();
  // Black until she's playable, then the curtain fades off the room.
  skipCurtain.classList.toggle('shown', skipIntroRequested && !paused);
  const skipScale = skipIntroRequested ? SKIP_SPEED : 1;
  if (!paused) {
    updateMovers(delta);
    // playerActive: she's actually in play, so maze Gloinks may see her.
    if (!activeOpening?.active) roomUpdate?.(delta, player.position, {
      playerActive: isLocked && readyToPlay && !dialogueUI.isActive && !activeCutscene && !stageBusy(),
    });
    mazeSounds?.update(delta, player.position);
    refreshDynamicColliders();
    // Her bedroom's lighting runs the environment itself.
    if (!currentRoomInfo?.lighting) {
      scene.environmentIntensity = THREE.MathUtils.damp(scene.environmentIntensity, environmentTarget, ENVIRONMENT_EASE, delta);
    }
  }
  const kaufmoAudio = currentRoomKey === 'kaufmo' ? currentRoomInfo?.kaufmoApi : null;
  let writingSoundLevel = 0;
  if (kaufmoAudio?.activity === 'write' && !paused && !dialogueUI.isActive) {
    const kaufmo = kaufmoAudio.kaufmo.position;
    const distance = Math.hypot(player.position.x - kaufmo.x, player.position.z - kaufmo.z);
    writingSoundLevel = 1 - THREE.MathUtils.smoothstep(distance, 1.5, 6.5);
  }
  ambience.setKaufmoProximity(writingSoundLevel);
  if (!paused && stageDelay) {
    stageDelay.remaining -= delta * skipScale;
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
        activeEntrance.update(rawDelta * skipScale, follow);
        // She turns to Ragatha as Ragatha greets her (once she's up: until
        // then the opening's own animation has her). The update above can
        // end the entrance and clear activeEntrance, hence the ?.
        const facing = activeEntrance?.pomniFacing;
        if (facing != null && !activeOpening?.active) {
          const turn = THREE.MathUtils.euclideanModulo(facing - pomni.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
          pomni.rotation.y += turn * (1 - Math.exp(-4 * rawDelta));
        }
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
        activeOpening.update(rawDelta * skipScale, follow); // animation clock is not the movement/collision step clamp
      }
    } else {
      if (stageWalk && !paused) updateStageWalk(delta * skipScale);
      else if (isLocked && readyToPlay && !dialogueUI.isActive && !activeJaxPass?.active && !stageBusy() && !activeCutscene) updateMovement(delta);
      else updatePomniWalk(delta, 0); // settle the waddle while paused/talking
      if (!activeCutscene) updateCamera(delta);
    }
  }
  // Background room compilation can stall a frame; keep the brief visible
  // crossing from completing between two renders on slower machines.
  if (!paused) activeJaxPass?.update(skipIntroRequested ? rawDelta * skipScale : Math.min(rawDelta, .1));
  minimap.update(player.position.x, player.position.z, cameraYaw);
  updateInteractionFocus();
  const hudContext = gameplayHUDContext();
  updateMemoryCaption(delta, hudContext);
  actionCaptions.update({ opening: activeOpening, jaxPass: activeJaxPass,
    hidden: hudContext.paused || hudContext.menu || dialogueUI.isActive });
  const photoReturn = objectives.active?.id === 'collect-photos' && itemState.totalFound() >= PHOTO_COUNT
    ? { title: 'Return to Kaufmo', detail: 'Go through the Dorm Hall to his room. Press E on Kaufmo to deliver the photos before time runs out.' }
    : objectives.active;
  objectiveHUD.update({...hudContext,room:currentRoomKey==='maze'?null:hudContext.room}, roomShowsMinimap(currentRoomKey), photoReturn);
  mazeHUD.update(hudContext,currentRoomKey);
  tutorialHUD.update(hudContext, focusedBedroomDoor());
  mazeHints.update(canOpenMazeHints(), mazeGameplayAvailable(hudContext));
  updateMazeItemsCounter(hudContext);
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
  const showTitleMusicToggle = titleScreen.menuReady;
  titleMusicToggle.hidden = !showTitleMusicToggle;
  titleMusicToggle.classList.toggle('is-visible', showTitleMusicToggle);
  requestAnimationFrame(animate);
}

animate();

if (import.meta.env.DEV && new URLSearchParams(location.search).get('hintPreview') === '3') {
  titleScreen.hide();
  selectRoom('maze', { onReady: room => {
    resetMoveState(); mazeClockWasPlayable = false;
    pauseRoomForMenu();
    mazeHints.open(room, { previewMap: true });
  } });
}

// Share the existing HUD policy so tips never learn from suspended controls.
function gameplayHUDContext() {
  return {
    session: preLevel1Session, room: currentRoom, ready: readyToPlay, locked: isLocked,
    paused, cinematic: activeCinematic()?.active || Boolean(activeCutscene) || stageBusy(), dialogue: dialogueUI.isActive,
    menu: titleScreen.active || !overlay.classList.contains('hidden') || !controlsPanel.hidden
      || !creditsPanel.classList.contains('hidden') || !titleOptions.hidden || !titleQuit.hidden,
  };
}

function roomShowsMinimap(roomKey) {
  return roomKey === 'tadc' || (roomKey === 'dorm' && portals.length > 0);
}

function focusedBedroomDoor() {
  return currentRoomKey === 'pomni' && Boolean(focusedInteractable?.bedroomExit);
}

/** Development-only A/B review: no gameplay/input settings or production API. */
export function setDormHallPreviewForReview(visible) {
  if (!import.meta.env.DEV) return false;
  const preview = currentRoom?.userData.dormHallPreview;
  preview?.setVisible(Boolean(visible));
  return Boolean(preview);
}

/** Read-only development diagnostics for story and room browser regressions. */
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
    mazeSeed: currentRoomKey === 'maze' ? currentRoomInfo?.mazeSeed ?? null : null,
    dialogueWaiting: dialogueUI.isWaiting,
    stagedWalk: Boolean(stageWalk), stagedSeat: stageSeatY !== null,
    stagedDelay: stageDelay?.remaining ?? null, stagedCamera: Boolean(stageCamera),
    cutsceneActive: Boolean(activeCutscene),
    ribbitComplete: storyProgress.ribbitComplete, ribbitPoints: storyProgress.ribbitPoints,
    hallwayPending: storyProgress.hallwayPending, kaufmoIntroduced: storyProgress.kaufmoIntroduced,
    level3Complete: storyProgress.level3Complete, jaxFate: storyProgress.jaxFate,
    endingVariant: storyProgress.endingVariant, ending: storyProgress.ending,
    picturesHeld: itemState.heldCount(), picturesPresented: itemState.totalPresented(),
    // The room waiting behind a doorway, and whether it's the Dorm Hall with
    // Level 3's Jax (and Ribbit) in it.
    preloadedRoom: roomPreload?.key ?? null,
    preloadedHallHasJax: roomPreload?.key === 'dorm' && roomPreload.result ? Boolean(roomPreload.result.jaxHallway) : null,
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



