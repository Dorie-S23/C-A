// With Vite running: node tools/verify_jax_chase_browser.mjs [--hardware] [--port=5173]
// Level 3's way in, played for real (KAN-54, KAN-55): Kaufmo's hand-in and
// the Level 2 card, then out into the Dorm Hall as Jax bolts past and
// Pomni stops Ribbit following, on to Jax's corner of the Lobby and their
// talk, then the door search: the maze door is one of several, it only
// leads anywhere once he's run through it, and walking into it loads the
// maze. A save/load in between. Screenshots go to artifacts/jax-chase.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/jax-chase');
await fs.mkdir(output, { recursive: true });
const port = process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? '5173';
const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required',
    ...(process.argv.includes('--hardware') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.route('**/src/main.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `\n
    renderer.setPixelRatio(0.5);
    renderer.domElement.requestPointerLock = () => window.__chase.lock();
    document.exitPointerLock = () => {
      delete document.pointerLockElement;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const shown = (jaxApi) => jaxApi.jax.visible && jaxApi.jax.children.find(c => !c.isLight).visible;
    window.__chase = {
      stage, selectRoom, loadGame, objectives, storyProgress, player,
      get room() { return currentRoomInfo; },
      get checkpoint() { return checkpoint; },
      get gesture() { return stageGesture?.name ?? null; },
      state: getOpeningDiagnostics,
      lock() { Object.defineProperty(document, 'pointerLockElement', { value: renderer.domElement, configurable: true }); document.dispatchEvent(new Event('pointerlockchange')); },
      hall() {
        const hall = currentRoomInfo?.jaxHallway;
        return hall && {
          jaxShown: shown(hall.jaxApi), jaxRunning: hall.jaxApi.isRunning(), jaxZ: hall.jaxApi.jax.position.z,
          ribbitVisible: hall.ribbitApi.ribbit.visible,
        };
      },
      lobby() {
        const corner = currentRoomInfo?.jaxCorner, door = currentRoomInfo?.mazeDoor;
        const doorway = door && currentRoomInfo.group.getObjectByName(door.frameName + 'Doorway');
        return {
          jax: corner && { shown: shown(corner.jaxApi), running: corner.jaxApi.isRunning(),
            fromSpot: Math.hypot(corner.jaxApi.jax.position.x - corner.spot.x, corner.jaxApi.jax.position.z - corner.spot.z) },
          door: door && { frameName: door.frameName, armed: door.armed, portalOpen: door.isOpen,
            portal: doorway.material.isShaderMaterial, onMap: door.portal.onMap,
            enabled: portals.includes(door.portal) && door.portal.enabled() },
        };
      },
      doorway: (name) => currentRoomInfo.group.getObjectByName(name + 'Doorway')?.material.type ?? null,
      /** E on the named bedroom door, as the player would. */
      useDoor(name) {
        const frame = currentRoomInfo.group.getObjectByName(name);
        interactables.find(i => i.objects?.includes(frame)).interact(interactionContext);
      },
      /** Stands Pomni this far out in front of a door, facing it. */
      faceDoor(name, distance) {
        const doorway = currentRoomInfo.group.getObjectByName(name + 'Doorway');
        const out = new THREE.Vector3(0, 0, 1).applyQuaternion(doorway.quaternion).setY(0).normalize();
        const at = doorway.position.clone().addScaledVector(out, distance);
        stage.place({ x: at.x, z: at.z, lookAt: doorway.position });
      },
      put(x, z) { player.position.x = x; player.position.z = z; },
      // The playtest button skips the opening, and saves only start once it's
      // done (takeCheckpoint): stand in for a run that played it.
      openingDone() { openingCompleted = true; takeCheckpoint(); },
    };` });
});
const chase = (fn, arg) => page.evaluate(fn, arg);
const state = () => chase(() => window.__chase.state());
const until = async (fn, what, timeout = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(100);
  }
  throw Error(`Timed out waiting for ${what}: ${JSON.stringify(await state().then(s => ({ room: s.room, dialogue: s.dialogueText, objective: s.objective })))}`);
};
const key = (code, type = 'keydown') => chase(([code, type]) => window.dispatchEvent(new KeyboardEvent(type, {
  code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true,
})), [code, type]);
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`) });
const readyRoom = room => until(async () => { const s = await state(); return s.room === room && s.ready && s; }, `room ${room}`);
const objective = async () => (await state()).objective?.id ?? null;
const hall = () => chase(() => window.__chase.hall());
const lobby = () => chase(() => window.__chase.lobby());
const saying = text => async s => s.dialogueText.includes(text) && !s.dialogueWaiting;

/** Advances the dialogue on screen until it ends or `stop(state)` says so. */
async function advance(stop = () => false) {
  for (let i = 0; i < 1500; i++) {
    const s = await state();
    if (!s.dialogueActive || await stop(s)) return s;
    if (s.dialogueWaiting) { await page.waitForTimeout(100); continue; }
    const choosing = await page.locator('#dialogue-options').evaluate(el => !el.hidden);
    if (choosing) await page.locator('.dialogue-option').first().evaluate(button => button.click());
    else await key('Space');
    await page.waitForTimeout(40);
  }
  throw Error('Dialogue did not finish');
}

try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await until(() => chase(() => Boolean(window.__chase)), 'the game');

  // Level 2's hand-in for real, from its developer jump (it starts as she clicks in).
  await chase(() => document.querySelector('[data-jump="level2HandIn"]').click());
  await readyRoom('kaufmo');
  await chase(() => window.__chase.openingDone());
  await chase(() => window.__chase.lock());
  await until(async () => (await state()).dialogueActive, 'Kaufmo talking');
  await advance();
  await until(async () => (await state()).completionCardVisible, 'the Level 2 card');
  assert.equal(await objective(), 'find-jax', 'Find Jax is the saved objective while the card shows');
  assert.equal(await chase(() => window.__chase.checkpoint?.objectives.active), 'find-jax');
  console.log('PASS Level 2 hand-in completes Hear Kaufmo’s Theory and sets Find Jax before the card');

  await page.locator('#btn-level-complete-continue').click();
  await page.waitForTimeout(800);
  const afterCard = await state();
  assert.equal(afterCard.room, 'kaufmo', 'Pomni walks out of Kaufmo’s room herself');
  assert.equal(afterCard.cutsceneActive, false, 'no cutaway: Jax is seen in the hall itself');
  assert.equal(afterCard.objective?.id, 'find-jax');
  console.log('PASS Continue hands control back in Kaufmo’s room with Find Jax');

  // Out into the hall with the mouse released first (as after loading a
  // save), so "Click to Play" is up: nothing may start before the player
  // can see it. Walking out through his door keeps the mouse captured.
  await chase(() => document.exitPointerLock());
  await chase(() => window.__chase.selectRoom('dorm', { from: 'kaufmo' }));
  await readyRoom('dorm');
  let h = await hall();
  assert.ok(h && h.jaxShown && !h.jaxRunning && !h.ribbitVisible, JSON.stringify(h));
  await page.waitForTimeout(600);
  assert.equal((await state()).dialogueActive, false, 'the scene waits for the player to have control');
  assert.equal((await hall()).jaxRunning, false, 'so does Jax, down the hall');
  await chase(() => window.__chase.lock());
  await until(async () => (await hall()).jaxRunning, 'Jax to bolt');
  assert.ok((await state()).stagedCamera);
  await page.waitForTimeout(1300);
  await shot('1-hall-bolt');
  await advance(saying('Jax, wait!'));
  h = await hall();
  assert.ok(!h.jaxShown && !h.jaxRunning, 'he’s gone up the hall before she shouts after him');
  await shot('2-hall-jax-wait');
  console.log('PASS Stepping out of Kaufmo’s room, Jax bolts from down the hall back up it past her');

  await advance(saying('Pomni? Was that Jax?'));
  assert.equal((await hall()).ribbitVisible, true);
  await page.waitForTimeout(400);
  await shot('3-hall-ribbit');
  await advance(saying('Wait. Not yet.'));
  assert.equal(await chase(() => window.__chase.gesture), 'armOut', 'her arm is out to stop Ribbit');
  await shot('4-hall-arm-out');
  console.log('PASS Ribbit walks up, steps to follow him, and Pomni stops her with her arm out');

  await advance();
  const afterHall = await state();
  assert.equal(afterHall.objective?.id, 'follow-jax');
  assert.ok(!(await hall()).ribbitVisible && !afterHall.stagedCamera);
  await shot('5-hall-after');
  console.log('PASS After the hall scene: Ribbit has gone for the others and the objective is Follow Jax');

  // Into the Lobby by the arch: Jax is in his corner, and the maze door,
  // one of the five, doesn't lead anywhere yet.
  await chase(() => window.__chase.selectRoom('tadc', { from: 'dorm' }));
  await readyRoom('tadc');
  await chase(() => window.__chase.lock());
  let l = await lobby();
  assert.ok(l.jax?.shown && l.jax.fromSpot < 0.01 && !l.jax.running, JSON.stringify(l));
  assert.ok(['Plane119', 'Plane120', 'Plane122', 'Plane123', 'Plane124'].includes(l.door?.frameName), JSON.stringify(l));
  assert.ok(!l.door.armed && !l.door.portal && l.door.onMap === false, JSON.stringify(l));
  await page.waitForTimeout(600);
  await shot('6-lobby-arrival');
  const mazeDoor = l.door.frameName;
  await chase(name => window.__chase.useDoor(name), mazeDoor);
  await page.waitForTimeout(2200);
  l = await lobby();
  assert.ok(!l.door.portal && !l.door.enabled, 'opened before he runs through it, it’s just the void');
  await chase(name => window.__chase.useDoor(name), mazeDoor);
  console.log(`PASS In the Lobby Jax waits in his corner; this run’s maze door (${mazeDoor}) is off the map and leads nowhere yet`);

  const spot = await chase(() => { const { spot } = window.__chase.room.jaxCorner; return { x: spot.x, z: spot.z }; });
  await chase(([x, z]) => window.__chase.put(x, z), [spot.x - 9, spot.z + 7]);
  await page.waitForTimeout(500);
  assert.equal((await state()).dialogueActive, false, 'not from across the room');
  await chase(([x, z]) => window.__chase.put(x, z), [spot.x - 3, spot.z + 3]);
  await until(async () => (await state()).dialogueActive, 'the talk to start');
  assert.ok((await state()).stagedCamera, 'the talk has its own shot');
  await page.waitForTimeout(800);
  await shot('7-lobby-talk');
  console.log('PASS Walking up behind him starts level3Jax on its staged two-shot');

  await advance(s => s.dialogueText.includes('Stop it!'));
  await advance(s => s.dialogueWaiting);
  await until(async () => (await lobby()).jax.running, 'Jax to run');
  await page.waitForTimeout(600);
  await shot('8-lobby-runs-off');
  await until(async () => !(await lobby()).jax.shown, 'the cut away from him');
  await page.waitForTimeout(300);
  await shot('9-lobby-alone');
  await advance();
  l = await lobby();
  const afterTalk = await state();
  assert.equal(afterTalk.objective?.id, 'enter-maze');
  assert.ok(!l.jax.shown && l.door.armed && !afterTalk.stagedCamera, JSON.stringify({ l, camera: afterTalk.stagedCamera }));
  console.log('PASS He runs off along the doors, out of shot; the objective is Find the Door to the Maze');

  // The search: a wrong door is still the void; the right one twists open.
  const wrong = ['Plane119', 'Plane120', 'Plane122', 'Plane123', 'Plane124'].find(name => name !== mazeDoor);
  await chase(([name]) => window.__chase.faceDoor(name, 4), [wrong]);
  await chase(name => window.__chase.useDoor(name), wrong);
  await page.waitForTimeout(1500);
  assert.equal(await chase(name => window.__chase.doorway(name), wrong), 'MeshBasicMaterial');
  await shot('10-wrong-door');
  await chase(([name]) => window.__chase.faceDoor(name, 4.5), [mazeDoor]);
  await chase(name => window.__chase.useDoor(name), mazeDoor);
  await page.waitForTimeout(900);
  await shot('11-maze-door-twisting');
  await until(async () => (await lobby()).door.portalOpen, 'the portal to open');
  l = await lobby();
  assert.ok(l.door.portal && l.door.enabled, JSON.stringify(l));
  await page.waitForTimeout(300);
  await shot('12-maze-door-open');
  console.log('PASS A wrong door opens onto the void; the maze door twists open into its portal');

  // A save from here loads back into the Lobby with the door still the way in.
  await chase(() => window.__chase.loadGame(window.__chase.checkpoint));
  await readyRoom('tadc');
  l = await lobby();
  assert.ok(l.door?.armed && !l.jax && l.door.frameName === mazeDoor, JSON.stringify(l));
  assert.equal(await objective(), 'enter-maze');
  console.log('PASS Loading that save: the same door leads into the maze, and Jax is gone');

  // Open it and walk in.
  await chase(() => window.__chase.lock());
  await chase(([name]) => window.__chase.faceDoor(name, 2.6), [mazeDoor]);
  await shot('13-after-load');
  await chase(name => window.__chase.useDoor(name), mazeDoor);
  await until(async () => (await lobby()).door.portalOpen, 'the portal to open again');
  await key('KeyW');
  await until(async () => (await state()).room === 'maze', 'the maze', 120000);
  await key('KeyW', 'keyup');
  await readyRoom('maze');
  assert.equal(await objective(), null);
  assert.equal(await chase(() => window.__chase.objectives.isComplete('enter-maze')), true);
  console.log('PASS Walking into the open maze door loads the maze and completes the objective');

  assert.deepEqual(errors, []);
  console.log('PASS No page errors');
} finally {
  await browser.close();
}
