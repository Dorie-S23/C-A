import * as THREE from 'three';

// Finding Jax in the maze (Level 3). He's there from the start (mazeRoom.js),
// pacing in a dead end with his back to the way in. Twice, when Pomni
// spots him she stops and he's heard mumbling to himself; if she then gets
// close he frets and bolts, off round the corners to his next hiding
// place. The third, his nook, he's had enough of running: she can call out
// to him (E), he turns to face her, she walks up and they talk. Whatever
// keepsakes she has (if any).
//
// While he's away after first running, his glitch fragments play: stuttering lines (no dialogue box)
// over a crackle, and he flickers into sight down the corridor she's
// looking along, there and gone.

const NOTICE_RADIUS = 8;    // she spots him from this far, with a clear view
const FRET_RADIUS = 3.2;    // this close (after he's mumbled) and he bolts
const FRET_SECONDS = .7;    // turning on her, glitching, before he runs
const RUN_SPEED = 6.5;      // m/s
const RUN_CELLS = 4;        // how much of the way she sees him run, then he's gone
const WATCH_SECONDS = 1.1;  // she's held watching him go this long
const REAPPEAR_SECONDS = 1; // he turns up at the next place this long after vanishing
const CALL_RADIUS = 6.5;    // she can call out to him from this far
const TALK_DISTANCE = 2.4;  // where she walks up to, to talk
const EYE_HEIGHT = 1.45;
const PASS_WIDE = 1.3;      // the only way out's past her: he swerves this far round her
const MUMBLES = ['level3JaxMumble1', 'level3JaxMumble2'];
const FRAGMENT_SECONDS = 3.4;              // each fragment, stuttering on and off
const FRAGMENT_GAP = .3;
const FLICKERS = [[.35, .3], [1.75, .22]]; // into a fragment: when he flickers into sight, for how long
const FLICKER_NEAREST = 4.5;               // metres: no closer than this (a wall right there: no flicker)
const FLICKER_FARTHEST = 13;

/**
 * @param {object} game main.js's missionApi
 * @param {object} room the loaded maze (mazeRoom.js)
 * @param {{ startTalk: () => boolean, onFled?: (stop: number) => void,
 *   fragments?: { mug: string[] },
 *   caption?: { show(text: string, seconds: number): void, hide(): void },
 *   crackle?: () => void }} options
 *   startTalk: begins the final conversation (main.js's maze encounter);
 *   false if it couldn't. fragments: his glitch fragments, shown with
 *   caption over crackle (see above)
 * @returns {{ readonly phase: string, readonly callable: boolean, callRadius: number,
 *   call(): void, talkEnded(finished: boolean, outcome?: string | null): void, stop(): void }}
 */
export function runMazeJaxChase(game, room, { startTalk, onFled, fragments, caption, crackle } = {}) {
  const { stage } = game;
  const token = game.token;
  const live = () => game.token === token && game.isRoom(room);
  const { jaxApi, jaxGlitch } = room;
  const jax = jaxApi.jax;
  // hiding -> mumbling -> mumbled -> fretting -> fleeing -> hiding (the next
  // place) ... -> cornered (his nook) -> calling -> talking -> done
  let phase = room.jaxAtNook ? 'cornered' : 'hiding';
  let run = null; // { points, index, watched, gone }
  let fragmentsPlaying = null; // { lines, clock, line, flickering }
  const fragmentsPlayed = new Set();
  const fragmentsLength = lines => lines.length * (FRAGMENT_SECONDS + FRAGMENT_GAP);

  const ray = new THREE.Ray(), hit = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  /** A clear view between her and him over the maze's walls. */
  function sees(playerPosition) {
    from.set(playerPosition.x, EYE_HEIGHT, playerPosition.z);
    to.set(jax.position.x, EYE_HEIGHT, jax.position.z);
    const distance = from.distanceTo(to);
    ray.set(from, to.clone().sub(from).normalize());
    const own = room.jaxBoundary.colliders;
    return !room.colliders.some(box => !own.includes(box) && ray.intersectBox(box, hit) && from.distanceTo(hit) < distance - .05);
  }
  const head = () => jax.position.clone().setY(EYE_HEIGHT + .2);

  // --- Glitch fragments -------------------------------------------------
  function playFragments(set) {
    const lines = fragments?.[set];
    if (!lines?.length || fragmentsPlayed.has(set)) return;
    fragmentsPlayed.add(set);
    fragmentsPlaying = { lines, clock: 0, line: -1, flickering: false };
  }
  function advanceFragments(deltaSeconds) {
    const playing = fragmentsPlaying;
    if (!playing || !game.playing) return;
    playing.clock += deltaSeconds;
    const line = Math.floor(playing.clock / (FRAGMENT_SECONDS + FRAGMENT_GAP));
    if (line >= playing.lines.length) { endFlicker(); fragmentsPlaying = null; return; }
    if (line !== playing.line) {
      playing.line = line;
      crackle?.();
      caption?.show(playing.lines[line], FRAGMENT_SECONDS);
    }
    const into = playing.clock - line * (FRAGMENT_SECONDS + FRAGMENT_GAP);
    // Only while he's unseen: before he's first turned up, or away between places.
    const unseen = !room.jaxSpawned || Boolean(run?.gone);
    const flicker = unseen && FLICKERS.some(([at, length]) => into >= at && into < at + length);
    if (flicker && !playing.flickering) playing.flickering = startFlicker();
    else if (!flicker && playing.flickering) { endFlicker(); playing.flickering = false; }
  }
  // There and gone, as far down the corridor she's looking along as he can
  // be (or one to her side), facing her, coming apart.
  function startFlicker() {
    const her = game.playerPosition, look = game.viewDirection;
    if (!her || !look) return false;
    const forward = new THREE.Vector3(look.x, 0, look.z).normalize();
    let best = null;
    for (const angle of [0, Math.PI / 2, -Math.PI / 2]) {
      const way = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      const reach = Math.min(clearDistance(her, way) - 1, FLICKER_FARTHEST);
      if (reach >= FLICKER_NEAREST) { best = { way, reach }; break; }
    }
    if (!best) return false;
    const at = new THREE.Vector3(her.x, 0, her.z).addScaledVector(best.way, best.reach);
    jax.position.copy(at);
    jax.rotation.y = Math.atan2(her.x - at.x, her.z - at.z);
    jax.visible = true;
    jaxGlitch.setLevel(1);
    jaxGlitch.burst();
    return true;
  }
  function endFlicker() {
    if (!fragmentsPlaying?.flickering) return;
    room.placeJax(room.jaxStop); // back to his hiding place
    jax.visible = room.jaxSpawned && !run?.gone;
  }
  function clearDistance(fromPoint, way) {
    from.set(fromPoint.x, EYE_HEIGHT, fromPoint.z);
    ray.set(from, way);
    let nearest = Infinity;
    for (const box of room.colliders) if (ray.intersectBox(box, hit)) nearest = Math.min(nearest, from.distanceTo(hit));
    return nearest;
  }

  // She stops, turns to him, and hears him talking to himself.
  function mumble() {
    phase = 'mumbling';
    stage.hold(true);
    stage.lookAt(jax.position);
    stage.lookWithHead(head());
    const done = () => {
      if (!live() || phase !== 'mumbling') return;
      stage.hold(false);
      stage.lookWithHead(null);
      phase = 'mumbled';
    };
    if (!game.playDialogue(MUMBLES[Math.min(room.jaxStop, MUMBLES.length - 1)], { onComplete: done, onCancel: done })) done();
  }

  // Too close: he whips round, comes apart a bit, and bolts.
  async function fret(playerPosition) {
    phase = 'fretting';
    stage.hold(true);
    stage.lookWithHead(head());
    jaxApi.engage(playerPosition.clone().setY(0));
    jaxApi.glitch();
    jaxGlitch.burst();
    if (!await stage.wait(FRET_SECONDS) || !live()) return;
    flee(playerPosition);
  }

  function flee(playerPosition) {
    phase = 'fleeing';
    const route = room.routeOn(room.jaxStop);
    // His dead end's one way out is past her, so first round her, on
    // whichever side of the corridor she's left the room.
    const { wayIn } = room.hideouts[room.jaxStop];
    const across = new THREE.Vector3(-wayIn.z, 0, wayIn.x);
    const offCentre = playerPosition.clone().sub(route[0]).dot(across);
    const pastHer = route[0].clone().addScaledVector(wayIn, playerPosition.clone().sub(route[0]).dot(wayIn))
      .addScaledVector(across, offCentre > 0 ? -PASS_WIDE : PASS_WIDE);
    run = { points: [pastHer, ...route.slice(1, RUN_CELLS + 1)], index: 0, watched: 0, gone: false };
    nextLeg();
  }
  function nextLeg() {
    const point = run.points[run.index++];
    if (!point) { vanish(); return; }
    const start = jax.position.clone().setY(0);
    jaxApi.playPassBy(start, point.clone().setY(0), Math.max(.05, start.distanceTo(point) / RUN_SPEED), { style: 'run', stay: true });
  }
  // Round the corner and gone: he's at his next hiding place, out of sight
  // (shown there a moment later, in storyUpdate).
  function vanish() {
    if (run.watched < WATCH_SECONDS) releaseWatch();
    run.gone = true;
    run.reappearIn = REAPPEAR_SECONDS;
    jax.visible = false;
    room.placeJax(room.jaxStop + 1);
    jaxGlitch.setLevel(1);
    // Away after first running: the hot chocolate fragments, then he's found again.
    if (room.jaxStop === 1 && fragments?.mug?.length) {
      playFragments('mug');
      run.reappearIn = fragmentsLength(fragments.mug) + .4;
    }
    onFled?.(room.jaxStop);
  }
  function releaseWatch() {
    stage.hold(false);
    stage.lookWithHead(null);
  }

  room.storyUpdate = (deltaSeconds, playerPosition) => {
    if (!live() || !playerPosition) return;
    advanceFragments(deltaSeconds);
    if (!room.jaxSpawned) return;
    if (phase === 'fleeing' && run) {
      if (run.gone) {
        if (fragmentsPlaying || (run.reappearIn -= deltaSeconds) > 0) return;
        jax.visible = true;
        run = null;
        phase = room.jaxAtNook ? 'cornered' : 'hiding';
        return;
      }
      run.watched += deltaSeconds;
      if (run.watched >= WATCH_SECONDS && run.watched - deltaSeconds < WATCH_SECONDS) releaseWatch();
      if (!jaxApi.isRunning()) nextLeg();
      return;
    }
    if (!game.playing) return;
    const apart = Math.hypot(playerPosition.x - jax.position.x, playerPosition.z - jax.position.z);
    if (phase === 'hiding' && apart < NOTICE_RADIUS && sees(playerPosition)) mumble();
    else if (phase === 'mumbled' && apart < FRET_RADIUS) fret(playerPosition);
  };

  const controller = {
    get phase() { return phase; },
    /** He's run from her at least once (so she's following him now, not finding him). */
    get fled() { return phase === 'fleeing' || room.jaxStop > 0; },
    /** He's standing at a hiding place (not fretting, running, away, or a fragment's flicker). */
    get atHidingPlace() { return phase !== 'fretting' && phase !== 'fleeing' && jax.visible; },
    /** The fragment showing now, if any (for diagnostics). */
    get fragment() { return fragmentsPlaying ? fragmentsPlaying.lines[fragmentsPlaying.line] ?? null : null; },
    /** Leaving the maze: no caption left behind. */
    stop() { caption?.hide(); fragmentsPlaying = null; },
    /** In his nook, waiting: she can call out to him. */
    get callable() { return phase === 'cornered' && jax.visible; },
    callRadius: CALL_RADIUS,
    /** She calls out: he turns to her, she walks up to him, and they talk. */
    async call() {
      if (!controller.callable || !live()) return;
      phase = 'calling';
      stage.hold(true);
      jaxApi.engage(game.playerPosition.clone().setY(0));
      jaxGlitch.setLevel(.45);
      stage.lookAt(jax.position);
      stage.lookWithHead(head());
      const toHer = game.playerPosition.clone().sub(jax.position).setY(0);
      const mark = jax.position.clone().addScaledVector(toHer.normalize(), TALK_DISTANCE);
      if (toHer.lengthSq() > 0 && game.playerPosition.distanceTo(mark.clone().setY(game.playerPosition.y)) > .2) {
        if (!await stage.walkTo([mark]) || !live()) return;
      }
      stage.lookAt(jax.position);
      stage.frame(talkShot(jax.position, mark));
      phase = 'talking';
      if (!startTalk()) controller.talkEnded(false);
    },
    /**
     * The conversation's over: talked through (he stays turned to her,
     * settling if he `stays`, coming apart if he `abstracts`), or left
     * (back to his wall).
     */
    talkEnded(finished, outcome = null) {
      if (!live() || phase !== 'talking') return;
      stage.releaseCamera();
      stage.hold(false);
      stage.lookWithHead(null);
      if (finished) {
        phase = 'done';
        if (outcome === 'abstracts') { jaxGlitch.setLevel(1); jaxGlitch.setSeverity(1); jaxGlitch.burst(); jaxApi.glitch(); }
        else { jaxGlitch.setLevel(.12); jaxGlitch.setSeverity(0); }
        return;
      }
      jaxApi.engage(null);
      jaxGlitch.setLevel(1);
      phase = 'cornered';
    },
  };
  return controller;
}

/** Over Pomni's shoulder, down the dead end at him. */
function talkShot(jaxAt, pomniAt) {
  const back = pomniAt.clone().sub(jaxAt).setY(0).normalize();
  const side = new THREE.Vector3(-back.z, 0, back.x);
  return {
    position: pomniAt.clone().addScaledVector(back, 2.1).addScaledVector(side, .85).setY(1.95).toArray(),
    target: jaxAt.clone().lerp(pomniAt, .35).setY(1.35).toArray(),
  };
}
