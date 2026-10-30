import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { loadKinger } from '../src/characters/kinger.js';
import { loadGangle } from '../src/characters/gangle.js';
import { loadZooble } from '../src/characters/zooble.js';
import { loadEndingCast } from '../src/characters/endingCast.js';
import { createCharacterPerformance, ENDING_PERFORMANCE_ACTIONS } from '../src/cinematics/characterPerformance.js';
import { ICONS } from '../src/ui/portraitIcons.js';
import { SPEAKERS } from '../src/data/dialogues.js';

function advance(performance, seconds, step = 0.05) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += step) performance.update(Math.min(step, seconds - elapsed));
}

function fakeApi(key, disposed = null) {
  const root = new THREE.Group();
  root.name = key;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), new THREE.MeshStandardMaterial());
  root.add(mesh);
  return {
    [key]: root,
    update() {}, setPose() {}, setActivity() {}, setListening() {}, setSpeaking() {},
    turnTowards() {}, lookTowards() {}, faceTowards() {}, stopMovement() {}, setDistress() {}, setDistressed() {},
    moveTo(point, { onArrive }) { onArrive(true); }, isRunning() { return false; }, playPassBy() {},
    dispose() { if (disposed) disposed.count++; },
  };
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

test('saved and bittersweet casts have explicit membership and dispose once without owning player Pomni', async () => {
  const disposed = { count: 0 };
  const loaders = Object.fromEntries(['pomni', 'jax', 'ribbit', 'kaufmo', 'caine', 'ragatha', 'kinger', 'gangle', 'zooble']
    .map(key => [key, async () => key === 'kinger' ? loadKinger() : fakeApi(key, key === 'ribbit' ? disposed : null)]));
  const pomni = new THREE.Group();
  pomni.name = 'Pomni';
  const saved = await loadEndingCast({ pomni, loaders });
  assert.deepEqual(new Set(saved.diagnostics.members), new Set(['pomni', 'jax', 'ribbit', 'kaufmo', 'caine', 'ragatha', 'kinger', 'gangle', 'zooble']));
  assert.equal(saved.actors.get('pomni').owned, false);
  assert.equal(saved.ensemble.getObjectByName('Pomni'), undefined);
  saved.dispose();
  saved.dispose();
  assert.equal(disposed.count, 1);
  assert.equal(saved.diagnostics.disposed, true);

  const bittersweet = await loadEndingCast({ endingVariant: 'bittersweet', pomni, loaders });
  assert.equal(bittersweet.actors.has('jax'), false);
  assert.equal(bittersweet.diagnostics.members.length, 8);
  bittersweet.dispose();
});

test('a failed cast load disposes every fulfilled partial asset', async () => {
  let resourceDisposals = 0;
  const loaders = Object.fromEntries(['jax', 'ribbit', 'kaufmo', 'ragatha', 'kinger', 'gangle', 'zooble']
    .map(key => [key, async () => {
      const api = fakeApi(key);
      api[key].traverse(object => object.geometry?.addEventListener('dispose', () => { resourceDisposals++; }));
      return api;
    }]));
  loaders.caine = async () => { throw new Error('missing Caine'); };
  await assert.rejects(() => loadEndingCast({ pomni: new THREE.Group(), loaders }), /missing Caine/);
  assert.equal(resourceDisposals, 7);
});

test('all nine ending speakers reuse registered dialogue portraits', () => {
  for (const key of ['pomni', 'jax', 'ribbit', 'kaufmo', 'caine', 'ragatha', 'kinger', 'gangle', 'zooble']) {
    assert.ok(SPEAKERS[key]?.name, key);
    assert.match(ICONS[key], /2D%20dialogue%20icons/);
  }
  for (const key of ['kinger', 'gangle', 'zooble']) assert.match(ICONS[key], new RegExp(`${key}\\.webp$`));
});
