// With Vite running: node tools/verify_ending_cast_browser.mjs
// Real character assets, rendered procedural rigs, portraits, and teardown.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/way-out-cast');
await fs.mkdir(output, { recursive: true });
const report = { pass: false, checks: [], errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.route('**/src/main.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
    renderer.setPixelRatio(0.6);
    const lock = () => {
      Object.defineProperty(document, 'pointerLockElement', { value: renderer.domElement, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    renderer.domElement.requestPointerLock = lock;
    document.exitPointerLock = () => {
      delete document.pointerLockElement;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__endingCastReview = {
      jump: key => devJump(key),
      home: () => returnToHome(),
      state() {
        const cast = currentRoomInfo?.ending?.cast;
        return {
          room: currentRoomKey, loaded: Boolean(currentRoom), variant: storyProgress.endingVariant,
          members: cast?.diagnostics.members ?? [],
          disposed: cast?.diagnostics.disposed ?? null,
          meshes: Object.fromEntries([...(cast?.actors ?? [])].map(([key, actor]) => {
            let meshes = 0, sprites = 0;
            actor.root.traverse(object => { if (object.isMesh) meshes++; if (object.isSprite) sprites++; });
            return [key, { meshes, sprites, owned: actor.owned }];
          })),
          actions: cast?.diagnostics.actions ?? {},
          pillow: (() => {
            const pillow = currentRoom?.getObjectByName('KingerPillow');
            return pillow ? { parent: pillow.parent.name, meshes: pillow.children.filter(child => child.isMesh).length } : null;
          })(),
        };
      },
      async portraits() {
        const result = {};
        for (const key of ['kinger', 'gangle', 'zooble']) {
          const image = new Image();
          image.src = ICONS[key];
          try { await image.decode(); result[key] = [image.naturalWidth, image.naturalHeight]; }
          catch { result[key] = [0, 0]; }
        }
        return result;
      },
      showCast() {
        activeWayOutEnding?.cancel(); activeWayOutEnding = null;
        const cast = currentRoomInfo.ending.cast;
        cast.ensemble.visible = true;
        const keys = ['pomni', 'jax', 'ribbit', 'kaufmo', 'caine', 'ragatha', 'kinger', 'gangle', 'zooble']
          .filter(key => cast.actors.has(key));
        keys.forEach((key, index) => {
          const actor = cast.actors.get(key);
          actor.root.visible = true;
          actor.root.position.set((index - (keys.length - 1) / 2) * 1.35, 0, -1.5);
          actor.root.rotation.set(0, Math.PI, 0);
          if (key === 'jax') actor.api.setShown(true);
        });
        stage.hold(true);
        stage.frame({ position: [0, 3.0, -10], target: [0, 1.05, -1.5] });
        return keys;
      },
      act(key, action) {
        const actor = currentRoomInfo.ending.cast.actors.get(key);
        const performance = actor.performance;
        const target = actor.root.position.clone();
        let pending;
        if (action === 'walkTo') pending = performance.walkTo(target.add(new THREE.Vector3(0.45, 0, 0)));
        else if (action === 'runTo') pending = performance.runTo(target.add(new THREE.Vector3(-0.45, 0, 0)));
        else if (action === 'lookTowards') pending = performance.lookTowards(new THREE.Vector3(0, 1, 4));
        else if (action === 'turnTowards') pending = performance.turnTowards(new THREE.Vector3(0, 0, 4));
        else if (action === 'stepForward') pending = performance.stepForward(0.2);
        else if (action === 'comfort') pending = performance.comfort(new THREE.Vector3(0, 1, 0));
        else if (action === 'clutch') pending = performance.clutch();
        else if (action === 'gesture') pending = performance.gesture();
        else pending = performance.react();
        window.__endingAction = pending;
        return performance.diagnostics;
      },
      actionResult: () => window.__endingAction,
      remember() {
        const cast = currentRoomInfo.ending.cast;
        window.__staleEndingCast = cast;
        const resources = { geometry: new Set(), material: new Set(), texture: new Set(), skeleton: new Set() };
        currentRoom.traverse(object => {
          if (!object.isMesh) return;
          if (object.geometry) resources.geometry.add(object.geometry);
          if (object.skeleton) resources.skeleton.add(object.skeleton);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            resources.material.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) resources.texture.add(value);
          }
        });
        const counts = { geometry: 0, material: 0, texture: 0, skeleton: 0 };
        for (const type of ['geometry', 'material', 'texture']) {
          for (const resource of resources[type]) resource.addEventListener('dispose', () => { counts[type]++; });
        }
        for (const skeleton of resources.skeleton) {
          const dispose = skeleton.dispose.bind(skeleton);
          skeleton.dispose = () => { counts.skeleton++; dispose(); };
        }
        window.__endingResources = {
          counts, expected: Object.fromEntries(Object.entries(resources).map(([key, set]) => [key, set.size])),
        };
        const kinger = cast.actors.get('kinger');
        const target = kinger.root.position.clone().add(new THREE.Vector3(2, 0, 0));
        window.__endingAction = kinger.performance.walkTo(target);
        return window.__endingResources.expected;
      },
      disposal() {
        return {
          resources: window.__endingResources,
          castDisposed: window.__staleEndingCast?.diagnostics.disposed ?? false,
          roomLoaded: Boolean(currentRoom),
        };
      },
    };
  ` });
});
const state = () => page.evaluate(() => window.__endingCastReview.state());
const call = (method, ...args) => page.evaluate(({ method, args }) => window.__endingCastReview[method](...args), { method, args });
const wait = (predicate, arg, timeout = 60000) => page.waitForFunction(predicate, arg, { timeout });
async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log('PASS', name);
}
async function jump(key, count) {
  await call('jump', key);
  await wait(count => {
    const s = window.__endingCastReview.state();
    return s.loaded && s.room === 'ending' && s.members.length === count;
  }, count);
}

try {
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5174'}/?dev=1`, { waitUntil: 'domcontentloaded' });
  await wait(() => Boolean(window.__endingCastReview));
  await jump('wayOutSaved', 9);
  await check('The saved ending loads all nine real 3D cast members', async () => {
    const s = await state();
    assert.deepEqual(new Set(s.members), new Set(['pomni', 'jax', 'ribbit', 'kaufmo', 'caine', 'ragatha', 'kinger', 'gangle', 'zooble']));
    for (const [key, mesh] of Object.entries(s.meshes)) {
      assert.ok(mesh.meshes > 0, `${key} has real meshes`);
      assert.equal(mesh.sprites, 0, `${key} is not a portrait sprite`);
    }
    assert.equal(s.meshes.pomni.owned, false);
    assert.equal(s.pillow.parent, 'KingerChest');
    assert.ok(s.pillow.meshes >= 2);
  });
  await check('The three added dialogue portraits decode from existing artwork', async () => {
    const portraits = await call('portraits');
    for (const size of Object.values(portraits)) assert.deepEqual(size, [384, 384]);
  });

  await call('showCast');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(output, 'cast-lineup.png') });
  await check('Reusable actions animate the actual cast rigs', async () => {
    for (const [key, action] of [
      ['kinger', 'clutch'], ['gangle', 'walkTo'], ['zooble', 'comfort'],
      ['ragatha', 'gesture'], ['kaufmo', 'react'], ['ribbit', 'lookTowards'], ['caine', 'turnTowards'],
    ]) {
      await call('act', key, action);
      await page.waitForTimeout(250);
      const s = await state();
      assert.ok(s.actions[key], `${key} exposes performance diagnostics`);
    }
    await page.waitForTimeout(1300);
    const s = await state();
    assert.equal(s.actions.gangle.moving, false);
    assert.equal(s.actions.kinger.action, 'clutch');
    await page.screenshot({ path: path.join(output, 'cast-performance.png') });
  });

  await check('Home cancels a pending action and disposes every recorded room resource', async () => {
    const expected = await call('remember');
    assert.ok(expected.geometry > 0 && expected.material > 0 && expected.skeleton > 0);
    await call('home');
    assert.equal(await call('actionResult'), false);
    const result = await call('disposal');
    assert.equal(result.castDisposed, true);
    assert.equal(result.roomLoaded, false);
    assert.deepEqual(result.resources.counts, result.resources.expected);
  });

  await jump('wayOutBittersweet', 8);
  await check('The bittersweet cast retains everyone except explicitly abstracted Jax', async () => {
    const s = await state();
    assert.equal(s.members.includes('jax'), false);
    assert.equal(s.members.includes('kinger'), true);
    assert.equal(s.members.includes('gangle'), true);
    assert.equal(s.members.includes('zooble'), true);
  });
  assert.deepEqual(report.errors, [], 'browser console and page errors');
  report.pass = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
