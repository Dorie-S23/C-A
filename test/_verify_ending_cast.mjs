import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { loadKinger } from '../src/characters/kinger.js';
import { loadGangle } from '../src/characters/gangle.js';
import { loadZooble } from '../src/characters/zooble.js';
import { stageLobbyEnding, lobbyEndingPlan, createExitDoorScene } from '../src/cutscenes/endingCutscene.js';
import { createCharacterPerformance, ENDING_PERFORMANCE_ACTIONS } from '../src/cinematics/characterPerformance.js';
import { ICONS } from '../src/ui/portraitIcons.js';
import { SPEAKERS } from '../src/data/dialogues.js';

function advance(performance, seconds, step = 0.05) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += step) performance.update(Math.min(step, seconds - elapsed));
}

function fakeApi(key) {
  const root = new THREE.Group();
  root.name = key[0].toUpperCase() + key.slice(1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), new THREE.MeshStandardMaterial());
  root.add(mesh);
  return {
    [key]: root,
    update() {}, setPose() {}, setActivity() {}, setListening() {}, setSpeaking() {},
    turnTowards() {}, lookTowards() {}, faceTowards() {}, stopMovement() {}, setDistress() {}, setDistressed() {},
    moveTo(point, { onArrive }) { onArrive(true); }, isRunning() { return false; }, playPassBy() {}, setShown() {},
    flyTo(point, duration, onArrive) { onArrive?.(); },
  };
}

function liveCast(variant = 'saved') {
  const extras = ['kinger', 'gangle', 'zooble'].map(key => {
    const root = new THREE.Group();
    root.name = key[0].toUpperCase() + key.slice(1);
    return { key, root, performance: createCharacterPerformance({ root }) };
  });
  const pomni = new THREE.Group();
  pomni.name = 'Pomni';
  return {
    pomni: { pomni, animations: [] },
    jaxApi: variant === 'saved' ? fakeApi('jax') : null,
    ribbitApi: fakeApi('ribbit'), ragathaApi: fakeApi('ragatha'),
    kaufmoApi: fakeApi('kaufmo'), caineApi: fakeApi('caine'), extras,
  };
}

function fakeRenderer() {
  return {
    calls: 0,
    getSize(target) { return target.set(1280, 720); },
    render() { this.calls++; },
  };
}

function makeDoor(variant = 'saved', cast = liveCast(variant), renderer = fakeRenderer()) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement() {
      return {
        width: 0, height: 0,
        getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }),
      };
    },
  };
  try {
    return { door: createExitDoorScene(renderer, variant, cast), cast, renderer };
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('the three original models are scaled 3D mesh rigs and Kinger owns a real pillow', async () => {
  for (const [load, key, expectedHeight] of [
    [loadKinger, 'kinger', 2.25], [loadGangle, 'gangle', 1.35], [loadZooble, 'zooble', 1.75],
  ]) {
    const api = await load();
    const root = api[key];
    let meshes = 0;
    root.traverse(object => { if (object.isMesh) meshes++; });
    assert.ok(meshes >= 9, `${key} has a complete mesh silhouette`);
    assert.ok(api.rig.head && api.rig.arms.length === 2);
    const height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
    assert.ok(Math.abs(height - expectedHeight) < 0.16, `${key} height ${height}`);
    root.traverse(object => assert.ok(!object.isSprite));
  }
  const { kinger, rig, pillow } = await loadKinger();
  assert.equal(pillow.parent, rig.propAnchor);
  let pillowMeshes = 0;
  pillow.traverse(object => { if (object.isMesh) pillowMeshes++; });
  assert.ok(pillowMeshes >= 2);
  assert.equal(kinger.getObjectByName('KingerPillowCushion').isMesh, true);
});

test('every ending action is available and idle, looking, and turning animate the rig', async () => {
  const { kinger, rig } = await loadKinger();
  const performance = createCharacterPerformance({ root: kinger, rig });
  for (const action of ENDING_PERFORMANCE_ACTIONS) assert.equal(typeof performance[action], 'function', action);
  await performance.idle();
  performance.update(0);
  const breath = rig.body.scale.y;
  performance.update(0.5);
  assert.notEqual(rig.body.scale.y, breath);
  const head = rig.head.quaternion.clone();
  await performance.lookTowards(new THREE.Vector3(2, 1, 0));
  performance.update(0.05);
  assert.notEqual(rig.head.quaternion.equals(head), true);
  const turning = performance.turnTowards(new THREE.Vector3(1, 0, 0));
  advance(performance, 2);
  assert.equal(await turning, true);
  assert.ok(Math.abs(kinger.rotation.y - Math.PI / 2) < 0.03);
});

test('walking, running, and stepping complete through update-driven movement', async () => {
  const { gangle, rig } = await loadGangle();
  const performance = createCharacterPerformance({ root: gangle, rig });
  const walking = performance.walkTo(new THREE.Vector3(0, 0, 1), { speed: 2 });
  advance(performance, 0.25);
  assert.ok(gangle.position.z > 0.4 && gangle.position.z < 0.6);
  advance(performance, 0.3);
  assert.equal(await walking, true);
  assert.ok(Math.abs(gangle.position.z - 1) < 1e-6);

  const running = performance.runTo(new THREE.Vector3(1, 0, 1), { speed: 4 });
  advance(performance, 0.3);
  assert.equal(await running, true);
  assert.ok(Math.abs(gangle.position.x - 1) < 1e-6);

  const before = gangle.position.clone();
  const direction = gangle.getWorldDirection(new THREE.Vector3());
  const stepping = performance.stepForward(0.35);
  advance(performance, 0.5);
  assert.equal(await stepping, true);
  const displacement = gangle.position.clone().sub(before);
  assert.ok(Math.abs(displacement.length() - 0.35) < 1e-6);
  assert.ok(displacement.normalize().dot(direction) > 0.99);
});

test('reactions, comforting, gestures, and clutching pose real arms and props', async () => {
  const { kinger, rig } = await loadKinger();
  const performance = createCharacterPerformance({ root: kinger, rig });
  for (const [start, action] of [
    [() => performance.react(), 'react:surprise'],
    [() => performance.comfort(new THREE.Vector3(0, 1, 2)), 'comfort'],
    [() => performance.gesture(), 'gesture:wave'],
  ]) {
    const pending = start();
    performance.update(0.05);
    assert.equal(performance.diagnostics.action, action);
    advance(performance, 1.3);
    assert.equal(await pending, true);
  }
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
  await performance.clutch(prop);
  performance.update(0.05);
  assert.equal(prop.parent, rig.propAnchor);
  assert.equal(performance.diagnostics.action, 'clutch');
  assert.equal(performance.diagnostics.hasProp, true);
  const restingArm = rig.arms[0].quaternion.clone();
  await performance.idle();
  performance.update(0.05);
  assert.notEqual(rig.arms[0].quaternion.equals(restingArm), true);
});

test('replacement, cancellation, and disposal resolve stale actions without further movement', async () => {
  const { zooble, rig } = await loadZooble();
  const performance = createCharacterPerformance({ root: zooble, rig });
  const walking = performance.walkTo(new THREE.Vector3(0, 0, 2));
  const running = performance.runTo(new THREE.Vector3(2, 0, 0));
  assert.equal(await walking, false);
  performance.cancel();
  assert.equal(await running, false);
  const position = zooble.position.clone();
  advance(performance, 1);
  assert.deepEqual(zooble.position, position);

  const pending = performance.walkTo(new THREE.Vector3(0, 0, 3));
  performance.dispose();
  performance.dispose();
  assert.equal(await pending, false);
  assert.equal(performance.diagnostics.disposed, true);
  advance(performance, 1);
  assert.deepEqual(zooble.position, position);
  assert.equal(await performance.gesture(), false);
});

test('the live Lobby stages the procedural cast and includes Jax only when saved', () => {
  for (const variant of ['saved', 'abstracted']) {
    const cast = liveCast(variant);
    const room = { group: new THREE.Group(), storyUpdate: null };
    const stage = {
      place() {}, frame() {}, lookWithHead() {}, lookAt() {},
      async walkTo() { return true; }, async wait() { return true; },
    };
    const plan = lobbyEndingPlan({ spawn: new THREE.Vector3(0, 0, 2.4), facing: 0 });
    const lobby = stageLobbyEnding(room, stage, variant, cast, plan);
    for (const name of ['Ribbit', 'Ragatha', 'Kaufmo', 'Kinger', 'Gangle', 'Zooble']) {
      assert.ok(room.group.getObjectByName(name), `${variant}: ${name}`);
    }
    assert.equal(Boolean(room.group.getObjectByName('Jax')), variant === 'saved');
    assert.equal(typeof room.storyUpdate, 'function');
    lobby.detach();
    assert.equal(room.storyUpdate, null);
    assert.equal(room.group.children.length, 0);
  }
});

test('cancelling the Lobby walk cannot schedule a stale delay', async () => {
  let finishWalk;
  let waits = 0;
  const room = { group: new THREE.Group(), storyUpdate: null };
  const stage = {
    place() {}, frame() {}, lookWithHead() {}, lookAt() {},
    walkTo: () => new Promise(resolve => { finishWalk = resolve; }),
    async wait() { waits++; return true; },
  };
  const plan = lobbyEndingPlan({ spawn: new THREE.Vector3(0, 0, 2.4), facing: 0 });
  const lobby = stageLobbyEnding(room, stage, 'saved', liveCast(), plan);
  const walking = lobby.onNode({ type: 'beat', action: 'walkOut' });
  finishWalk(false);
  assert.equal(await walking, false);
  assert.equal(waits, 0);
  lobby.detach();
});

test('the live exit-door scene has the full variant cast and disposes once', () => {
  for (const variant of ['saved', 'abstracted']) {
    const { door, renderer } = makeDoor(variant);
    for (const name of ['Pomni', 'Ribbit', 'Ragatha', 'Kaufmo', 'Caine', 'Kinger', 'Gangle', 'Zooble']) {
      assert.ok(door.scene.getObjectByName(name), `${variant}: ${name}`);
    }
    assert.equal(Boolean(door.scene.getObjectByName('Jax')), variant === 'saved');
    door.update(1 / 60);
    assert.equal(renderer.calls, 1);
    door.dispose();
    door.dispose();
    assert.equal(door.scene.children.length, 0);
  }
});

test('the exit-door handoff cancels Ragatha\'s previous Lobby movement', () => {
  const cast = liveCast();
  let stopped = false;
  cast.ragathaApi.stopMovement = () => { stopped = true; };
  const { door } = makeDoor('saved', cast);
  assert.equal(stopped, true);
  door.dispose();
});

test('exit-door disposal settles a pending walk and suppresses later actions and rendering', async () => {
  const { door, renderer } = makeDoor();
  const leaving = door.onNode({ type: 'beat', action: 'kaufmoLeaves' });
  door.update(0.1);
  assert.equal(renderer.calls, 1);
  door.dispose();
  assert.equal(await leaving, false);
  assert.equal(await door.onNode({ type: 'beat', action: 'gathered' }), false);
  door.update(1);
  assert.equal(renderer.calls, 1);
});

test('disposing while Pomni stops at the door cannot revive Caine afterwards', async () => {
  const cast = liveCast();
  const { door } = makeDoor('saved', cast);
  const stopping = door.onNode({ type: 'beat', action: 'pomniStops' });
  door.dispose();
  assert.equal(await stopping, false);
  assert.equal(cast.caineApi.caine.visible, false);
});

test('Jax departure is update-driven and resolves false on disposal', async () => {
  const cast = liveCast();
  cast.jaxApi.isRunning = () => true;
  const { door } = makeDoor('saved', cast);
  const leaving = door.onNode({ type: 'beat', action: 'jaxLeaves' });
  door.update(0.1);
  door.dispose();
  assert.equal(await leaving, false);
});

test('all nine ending speakers reuse registered dialogue portraits', () => {
  for (const key of ['pomni', 'jax', 'ribbit', 'kaufmo', 'caine', 'ragatha', 'kinger', 'gangle', 'zooble']) {
    assert.ok(SPEAKERS[key]?.name, key);
    assert.match(ICONS[key], /2D%20dialogue%20icons/);
  }
  for (const key of ['kinger', 'gangle', 'zooble']) assert.match(ICONS[key], new RegExp(`${key}\\.webp$`));
});
