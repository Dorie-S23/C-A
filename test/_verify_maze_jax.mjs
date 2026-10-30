import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadMazeRoom, JAX_SPAWN_SECONDS } from '../src/rooms/mazeRoom.js';
import { createMazeItems } from '../src/state/mazeItems.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function (url, onLoad, _progress, onError) {
  try {
    const bytes = fs.readFileSync(new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url)));
    const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
    data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(length + 28).toString('base64');
    delete data.images; delete data.textures;
    data.materials = data.materials.map(({ name, doubleSided }) => ({ name, doubleSided }));
    new GLTFLoader().parseAsync(JSON.stringify(data), '').then(onLoad, onError);
  } catch (error) { onError(error); }
};

const player = new THREE.Vector3(0, 1.6, 0);

test('Jax turns up in his hideout only after a minute of her actually being in the maze', async () => {
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const { jax } = room.jaxApi;
  const blocking = () => room.jaxBoundary.colliders.filter(box => room.colliders.includes(box)).length;
  room.update(0, player);
  assert.equal(jax.visible, false); assert.equal(room.jaxSpawned, false);
  assert.equal(blocking(), 0, 'No invisible barrier where he will be, before he is');
  assert.equal(room.jaxEncounter.enabled(), false);
  // Menus and conversations don't count.
  for (let i = 0; i < 120; i++) room.update(1, player, { playerActive: false });
  assert.equal(room.jaxSpawned, false);
  for (let t = 0; t < JAX_SPAWN_SECONDS - 1; t += .5) room.update(.5, player);
  assert.equal(room.jaxSpawned, false);
  room.update(1.01, player);
  assert.equal(room.jaxSpawned, true); assert.equal(jax.visible, true);
  assert.equal(room.jaxEncounter.enabled(), false, 'Reaching him (for the countdown) only counts at his nook');
  assert.equal(blocking(), 0, 'Where he first turns up he just runs off: no barrier');
  room.placeJax(room.hideouts.length - 1); room.update(0, player);
  assert.equal(blocking(), 4, 'In his nook his personal space blocks (keepsakes still missing)');
  assert.equal(room.jaxEncounter.enabled(), true);
});

test('he stands in a dead end facing its back wall, pacing side to side and glitching', async () => {
  for (const seed of [1, 2, 42, 1234]) {
    const room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    const { jaxApi: { jax } } = room;
    room.spawnJax();
    const { cell, wayIn } = room.hideouts[room.jaxStop];
    assert.equal(Object.values(cell.walls).filter(wall => !wall).length, 1, `seed ${seed}: a dead end`);
    const facing = new THREE.Vector3(Math.sin(jax.rotation.y), 0, Math.cos(jax.rotation.y));
    assert.ok(facing.dot(wayIn) < -.99, `seed ${seed}: back to the way in, facing the wall`);
    const model = jax.children.find(child => !child.isLight);
    const offsets = [];
    for (let i = 0; i < 300; i++) { room.update(1 / 60, player); offsets.push(model.position.x); }
    assert.ok(Math.max(...offsets) > .2 && Math.min(...offsets) < -.2, `seed ${seed}: shuffles both ways`);
    assert.ok(Math.max(...offsets.map(Math.abs)) < .5, `seed ${seed}: but stays on his mark`);
    assert.ok(room.jaxGlitch.uniforms.uGlitchTime.value > 4.9, 'the glitch shader runs');
    // Engaged, he stops and turns to her; let go, back to pacing at his wall.
    const her = jax.position.clone().addScaledVector(wayIn, 2);
    room.jaxApi.engage(her);
    for (let i = 0; i < 360; i++) room.update(1 / 60, player);
    const turned = new THREE.Vector3(Math.sin(jax.rotation.y), 0, Math.cos(jax.rotation.y));
    assert.ok(turned.dot(wayIn) > .95, `seed ${seed}: turns to face her`);
    assert.ok(Math.abs(model.position.x) < .08, `seed ${seed}: stops pacing`);
    room.jaxApi.engage(null);
    for (let i = 0; i < 360; i++) room.update(1 / 60, player);
    const back = new THREE.Vector3(Math.sin(jax.rotation.y), 0, Math.cos(jax.rotation.y));
    assert.ok(back.dot(wayIn) < -.95, `seed ${seed}: back to his wall`);
  }
});

test('found, he mumbles; close, he bolts to the next hiding place; the third time she calls him and they talk', async () => {
  const { runMazeJaxChase } = await import('../src/levels/mazeJaxChase.js');
  const items = createMazeItems();
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: items });
  room.spawnJax();
  const her = new THREE.Vector3(0, 1.6, 0);
  const log = [], dialogues = [];
  let talks = 0, held = false;
  const game = {
    token: 1, isRoom: () => true, playing: true, playerPosition: her,
    showHint: text => log.push(['hint', text]),
    playDialogue: (key, handlers) => { dialogues.push({ key, handlers }); return true; },
    stage: {
      hold: value => { held = value; }, lookAt() {}, lookWithHead() {}, frame: () => log.push(['frame']), releaseCamera: () => log.push(['release']),
      wait: async () => true, walkTo: async ([point]) => { her.set(point.x, 1.6, point.z); return true; },
    },
  };
  const chase = runMazeJaxChase(game, room, { hasKeepsakes: () => items.hasAllRequired(), startTalk: () => { talks++; return true; } });
  const { jax } = room.jaxApi;
  const tick = async (seconds = 1 / 30) => { room.update(seconds, her); await Promise.resolve(); await Promise.resolve(); };
  assert.equal(room.hideouts.length, 3);
  assert.equal(new Set(room.hideouts.map(h => h.cell)).size, 3, 'three different hiding places');
  for (const [stop, mumble] of [[0, 'level3JaxMumble1'], [1, 'level3JaxMumble2']]) {
    const { spot, wayIn, cell } = room.hideouts[stop];
    assert.equal(room.jaxStop, stop); assert.ok(jax.position.distanceTo(spot) < 1e-6);
    assert.equal(Object.values(cell.walls).filter(wall => !wall).length, 1, 'a dead end');
    her.set(spot.x + wayIn.x * 20, 1.6, spot.z + wayIn.z * 20);
    await tick(); assert.equal(chase.phase, 'hiding', 'not from far off');
    // Down the dead end towards him: she stops, and he mumbles.
    her.set(spot.x + wayIn.x * 5.6, 1.6, spot.z + wayIn.z * 5.6);
    await tick();
    assert.equal(chase.phase, 'mumbling'); assert.equal(held, true, 'Pomni stops');
    assert.equal(dialogues.at(-1).key, mumble);
    dialogues.at(-1).handlers.onComplete();
    assert.equal(chase.phase, 'mumbled'); assert.equal(held, false);
    // Close: he frets and runs off, round the corners, to the next place.
    her.set(spot.x + wayIn.x * 2.6, 1.6, spot.z + wayIn.z * 2.6);
    await tick();
    assert.equal(chase.phase, 'fleeing');
    let ran = 0;
    for (let i = 0; i < 600 && chase.phase === 'fleeing'; i++) {
      await tick();
      if (room.jaxStop === stop && jax.visible) ran = Math.max(ran, jax.position.distanceTo(spot));
    }
    assert.ok(ran > 4, `he's seen running off (${ran.toFixed(1)} m)`);
    assert.equal(held, false, 'and she has control again');
    assert.equal(room.jaxStop, stop + 1); assert.equal(jax.visible, true);
    assert.ok(jax.position.distanceTo(room.hideouts[stop + 1].spot) < 1e-6);
  }
  assert.equal(chase.phase, 'cornered'); assert.equal(room.jaxAtNook, true); assert.equal(chase.callable, true);
  assert.ok(room.hideouts[2].cell === room.maze.jax, 'the last is his nook');
  // No keepsakes needed: calling out starts the talk.
  const { spot } = room.hideouts[2];
  her.set(spot.x + room.hideouts[2].wayIn.x * 5, 1.6, spot.z + room.hideouts[2].wayIn.z * 5);
  await chase.call();
  assert.equal(talks, 1); assert.equal(chase.phase, 'talking');
  assert.ok(Math.abs(Math.hypot(her.x - jax.position.x, her.z - jax.position.z) - 2.4) < .05, 'she walks up to him');
  for (let i = 0; i < 120; i++) await tick();
  const facing = new THREE.Vector3(Math.sin(jax.rotation.y), 0, Math.cos(jax.rotation.y));
  assert.ok(facing.dot(her.clone().sub(jax.position).setY(0).normalize()) > .95, 'he faces her');
  chase.talkEnded(true, 'stays');
  assert.equal(chase.phase, 'done');
  room.update(1 / 30, her);
  assert.ok(room.jaxGlitch.uniforms.uGlitch.value <= .121, 'staying himself, he settles (even his bursts are small)'); assert.deepEqual(log.at(-1), ['release']); assert.equal(held, false);
});

test('his glitch fragments: the bowling set as his first minute runs out, the hot chocolate set while he is away after first running; he flickers into sight', async () => {
  const { runMazeJaxChase } = await import('../src/levels/mazeJaxChase.js');
  const { JAX_GLITCH_FRAGMENTS } = await import('../src/data/dialogues.js');
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const { jax } = room.jaxApi;
  const spot0 = room.hideouts[0];
  // Down the corridor out of his first dead end, looking along it.
  const her = spot0.spot.clone().addScaledVector(spot0.wayIn, 5.6).setY(1.6);
  const shown = [];
  let crackles = 0, flickers = 0, wasVisible = false;
  const game = {
    token: 1, isRoom: () => true, playing: true, playerPosition: her, viewDirection: spot0.wayIn.clone().negate(),
    showHint() {}, playDialogue: (key, handlers) => { handlers.onComplete(); return true; },
    stage: { hold() {}, lookAt() {}, lookWithHead() {}, frame() {}, releaseCamera() {}, wait: async () => true, walkTo: async () => true },
  };
  const chase = runMazeJaxChase(game, room, {
    startTalk: () => true, fragments: JAX_GLITCH_FRAGMENTS, crackle: () => crackles++,
    caption: { show: text => shown.push(text), hide() {} },
  });
  const tick = async (seconds = 1 / 30) => {
    room.update(seconds, her);
    if (jax.visible && !wasVisible && !room.jaxSpawned) flickers++;
    wasVisible = jax.visible;
    await Promise.resolve(); await Promise.resolve();
  };
  for (let t = 0; t < 45; t += .5) await tick(.5);
  assert.deepEqual(shown, [], 'nothing for most of the minute');
  while (!room.jaxSpawned) await tick();
  assert.deepEqual(shown, JAX_GLITCH_FRAGMENTS.bowling, 'the bowling fragments, then he turns up');
  assert.equal(crackles, 3, 'each over a crackle');
  assert.ok(flickers >= 3, `he flickers into sight while they play (${flickers})`);
  assert.equal(jax.visible, true); assert.ok(jax.position.distanceTo(spot0.spot) < 1e-6, 'and is then at his hiding place');
  // Found, he mumbles (completed straight away here); close, he runs.
  for (let i = 0; i < 3; i++) await tick();
  her.copy(spot0.spot).addScaledVector(spot0.wayIn, 2.6).setY(1.6);
  for (let i = 0; i < 900 && !(chase.phase === 'hiding' && room.jaxStop === 1); i++) await tick();
  assert.deepEqual(shown.slice(3), JAX_GLITCH_FRAGMENTS.mug, 'the hot chocolate fragments while he is away');
  assert.equal(room.jaxStop, 1); assert.equal(jax.visible, true);
  assert.ok(jax.position.distanceTo(room.hideouts[1].spot) < 1e-6);
});

test('the Jax gate: Levels 1 to 3 reaching 75% of what they could earn keeps him from abstracting', async () => {
  const gate = await import('../src/state/escapeThreshold.js');
  gate.resetEscapeThreshold();
  assert.equal(gate.LEVEL_MAX_POINTS.level3, 2 + 5, 'two keepsakes and the talk’s five rounds');
  assert.equal(gate.JAX_MAX, 16); assert.equal(gate.JAX_PASS_MARK, Math.ceil(16 * .75));
  gate.setLevelPoints('level1', 4); gate.setLevelPoints('level2', 4);
  assert.equal(gate.passesJaxGate(), false, '8 of 16');
  gate.setLevelPoints('level3', 3);
  assert.equal(gate.passesJaxGate(), false, '11 of 16');
  gate.setLevelPoints('level3', 4);
  assert.equal(gate.passesJaxGate(), true, '12 of 16');
  assert.equal(gate.getEscapeTotal(), 8, 'the escape gate is still Levels 1 and 2 only');
  gate.resetEscapeThreshold();
});
