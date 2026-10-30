import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadMazeRoom } from '../src/rooms/mazeRoom.js';
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
function findBone(root, prefix) {
  let found = null;
  root.traverse((object) => {
    if (found || !object.isBone) return;
    const normalized = object.name.toLowerCase().replace(/[^a-z]/g, '');
    if (normalized.startsWith(prefix)) found = object;
  });
  return found;
}

test('Jax is in his first hideout as soon as she arrives in the maze', async () => {
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const { jax } = room.jaxApi;
  const blocking = () => room.jaxBoundary.colliders.filter(box => room.colliders.includes(box)).length;
  room.update(0, player);
  assert.equal(room.jaxSpawned, true); assert.equal(jax.visible, true);
  assert.ok(jax.position.distanceTo(room.hideouts[0].spot) < 1e-6, 'at his first hiding place');
  assert.equal(room.jaxEncounter.enabled(), false, 'Reaching him (for the countdown) only counts at his nook');
  assert.equal(blocking(), 0, 'Where he first turns up he just runs off: no barrier');
  room.placeJax(room.hideouts.length - 1); room.update(0, player);
  assert.equal(blocking(), 4, 'In his nook his personal space blocks (keepsakes still missing)');
  assert.equal(room.jaxEncounter.enabled(), true);
});

test('he stands in a dead end facing its back wall, still on his mark (no shuffling or wiggling) while his glitch runs', async () => {
  for (const seed of [1, 2, 42, 1234]) {
    const room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    const { jaxApi: { jax } } = room;
    room.spawnJax();
    const { cell, wayIn } = room.hideouts[room.jaxStop];
    const leftElbow = findBone(jax, 'lowerarml');
    const rightElbow = findBone(jax, 'lowerarmr');
    assert.ok(leftElbow && rightElbow, 'Jax has both elbow joints');
    room.update(1 / 60, player);
    const elbowPose = [leftElbow.quaternion.clone(), rightElbow.quaternion.clone()];
    assert.equal(Object.values(cell.walls).filter(wall => !wall).length, 1, `seed ${seed}: a dead end`);
    const facing = new THREE.Vector3(Math.sin(jax.rotation.y), 0, Math.cos(jax.rotation.y));
    assert.ok(facing.dot(wayIn) < -.99, `seed ${seed}: back to the way in, facing the wall`);
    const model = jax.children.find(child => !child.isLight);
    const offsets = [];
    let maxElbowChange = 0;
    for (let i = 0; i < 300; i++) {
      room.update(1 / 60, player);
      offsets.push(model.position.x);
      maxElbowChange = Math.max(maxElbowChange,
        leftElbow.quaternion.angleTo(elbowPose[0]), rightElbow.quaternion.angleTo(elbowPose[1]));
    }
    assert.ok(maxElbowChange < 1e-6, `hands stay still instead of wringing (${maxElbowChange})`);
    assert.ok(Math.max(...offsets.map(Math.abs)) < 1e-6, `seed ${seed}: stands still on his mark`);
    assert.ok(room.jaxGlitch.uniforms.uGlitchTime.value > 4.9, 'the glitch shader runs');
    // Engaged, he turns to her; let go, back to his wall.
    const her = jax.position.clone().addScaledVector(wayIn, 2);
    room.jaxApi.engage(her);
    for (let i = 0; i < 360; i++) room.update(1 / 60, player);
    const turned = new THREE.Vector3(Math.sin(jax.rotation.y), 0, Math.cos(jax.rotation.y));
    assert.ok(turned.dot(wayIn) > .95, `seed ${seed}: turns to face her`);
    assert.ok(Math.abs(model.position.x) < 1e-6, `seed ${seed}: still on his mark`);
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
  assert.equal(chase.fled, false, 'Find Jax, until he runs');
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
    assert.equal(chase.fled, true, 'then Follow Jax');
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

test('his glitch fragments: the hot chocolate set while he is away after first running; he is there from the start', async () => {
  const { runMazeJaxChase } = await import('../src/levels/mazeJaxChase.js');
  const { JAX_GLITCH_FRAGMENTS } = await import('../src/data/dialogues.js');
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const { jax } = room.jaxApi;
  const spot0 = room.hideouts[0];
  // Down the corridor out of his first dead end, looking along it.
  const her = spot0.spot.clone().addScaledVector(spot0.wayIn, 5.6).setY(1.6);
  const shown = [];
  let crackles = 0;
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
    await Promise.resolve(); await Promise.resolve();
  };
  await tick();
  assert.equal(jax.visible, true); assert.ok(jax.position.distanceTo(spot0.spot) < 1e-6, 'at his hiding place from the start');
  assert.deepEqual(shown, [], 'no fragments before he is first found');
  // Found, he mumbles (completed straight away here); close, he runs.
  for (let i = 0; i < 3; i++) await tick();
  her.copy(spot0.spot).addScaledVector(spot0.wayIn, 2.6).setY(1.6);
  for (let i = 0; i < 900 && !(chase.phase === 'hiding' && room.jaxStop === 1); i++) await tick();
  assert.deepEqual(shown, JAX_GLITCH_FRAGMENTS.mug, 'the hot chocolate fragments while he is away');
  assert.equal(crackles, JAX_GLITCH_FRAGMENTS.mug.length, 'each over a crackle');
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

test('a trail hint runs through the corridors from her to Jax, never through a wall, and is gone after three seconds', async () => {
  const { playMazeTrail, TRAIL_SECONDS } = await import('../src/effects/mazeTrail.js');
  for (const seed of [1, 42, 1234]) {
    const room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    const { jax } = room.jaxApi;
    for (const row of room.maze.cells) for (const cell of row) {
      if ((cell.r * 7 + cell.c) % 5) continue;
      const her = new THREE.Vector3((cell.c - 6) * 4.5 + 1.3, 1.6, (cell.r - 6) * 4.5 - 1.1); // off-centre in her corridor
      const route = room.routeToJax(her);
      assert.ok(route[0].distanceTo(her.clone().setY(0)) < 1e-6, 'from her');
      assert.ok(route.at(-1).distanceTo(jax.position.clone().setY(0)) < 1e-6, 'to where he is');
      const trail = playMazeTrail(room.group, route);
      const mesh = room.group.getObjectByName('MazeTrailHint');
      // Along the core, and out to the edge of its glow either side: never into a wall.
      const curve = mesh.geometry.parameters.path, length = curve.getLength();
      for (let i = 0; i <= Math.ceil(length * 6); i++) {
        const u = i / Math.ceil(length * 6), at = curve.getPointAt(u), along = curve.getTangentAt(u);
        const across = new THREE.Vector3(-along.z, 0, along.x).normalize();
        for (const offset of [0, .3, -.3]) {
          const probe = at.clone().addScaledVector(across, offset);
          assert.ok(!room.colliders.some(box => box.containsPoint(probe)), `seed ${seed}: trail from cell ${cell.r},${cell.c} goes into a wall`);
        }
      }
      trail.dispose();
    }
  }
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const trail = playMazeTrail(room.group, room.routeToJax(new THREE.Vector3(...room.spawn.toArray())));
  const mesh = room.group.getObjectByName('MazeTrailHint');
  let alive = true, t = 0, heads = [];
  while (alive && t < 10) { alive = trail.update(1 / 30); t += 1 / 30; heads.push(mesh.material.uniforms.uHead.value); }
  assert.ok(Math.abs(t - TRAIL_SECONDS) < .05 && TRAIL_SECONDS === 6, `over in ${t.toFixed(2)} s`);
  assert.ok(heads.every((v, i) => !i || v >= heads[i - 1]) && heads.at(-1) === 1, 'its head runs all the way to him');
  assert.ok(mesh.material.uniforms.uFade.value < .01, 'faded out');
  trail.dispose();
  assert.equal(room.group.getObjectByName('MazeTrailHint'), undefined);
});

test('wrong answers make his glitching worse: more of it, more often, for the rest of the talk', async () => {
  const { applyJaxGlitch } = await import('../src/shaders/jaxGlitch.js');
  const glitch = applyJaxGlitch(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const sample = () => {
    let sum = 0, bursts = 0, was = false;
    for (let i = 0; i < 600; i++) { // ten seconds
      glitch.update(1 / 60);
      const value = glitch.uniforms.uGlitch.value;
      sum += value;
      // Above his steady hum for this level and severity (see jaxGlitch.js's HUM / SEVERE_*).
      const hum = (2 / 3) * (.18 + (.5 - .18) * glitch.severity) * (1 + .9 * glitch.severity);
      const flaring = value > hum * 1.05;
      if (flaring && !was) bursts++;
      was = flaring;
    }
    return { mean: sum / 600, bursts };
  };
  glitch.setLevel(2 / 3); // a distressed line
  const calm = sample();
  const steps = [calm];
  for (let wrong = 1; wrong <= 3; wrong++) { glitch.setSeverity(glitch.severity + .34); steps.push(sample()); }
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].mean > steps[i - 1].mean, `wrong answer ${i}: more glitched (${steps.map(s => s.mean.toFixed(2))})`);
  assert.equal(calm.bursts, 0, 'calm: no bursts of its own');
  assert.ok(steps[3].bursts >= 6, `three wrong: bursts all the time (${steps[3].bursts} in 10 s)`);
  assert.equal(glitch.severity, 1, 'and it tops out');
  glitch.setSeverity(0);
  // A burst already under way still runs its course (up to .7 s at full
  // severity), and catching one here failed this check about one run in six.
  for (let i = 0; i < 60; i++) glitch.update(1 / 60);
  assert.ok(Math.abs(sample().mean - calm.mean) < .02, 'steadied, it settles back');
});
