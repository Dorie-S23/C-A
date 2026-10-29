// Confirms the maze's two hidden keepsakes (src/state/mazeItems.js,
// src/props/mazeFindables.js) actually get placed, stay clear of Jax/the
// exit/the hazard's patrol, and are pickupable â€” against the real Jax
// model, the same GLB-loading technique used throughout tools/.
// Run: node tools/verify_maze_findables.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadMazeRoom } from '../src/rooms/mazeRoom.js';
import { createMazeItems, MAZE_FINDABLES } from '../src/state/mazeItems.js';

// Ignore per-load UUIDs/material IDs: compare actual rendered layout and poses.
function layout(room) {
  return {
    seed: room.mazeSeed,
    walls: room.colliders.map(box => [box.min.toArray(), box.max.toArray()]),
    spawn: room.spawn.toArray(), spawnFacing: room.spawnFacing,
    jax: room.group.getObjectByName('Jax').position.toArray(),
    jaxFacing: room.group.getObjectByName('Jax').rotation.y,
    exit: [room.triggers.exit.min.toArray(), room.triggers.exit.max.toArray()],
    patrol: room.movers.map(mover => mover.waypoints.map(point => point.toArray())),
    items: room.group.children.filter(child => child.name === 'MazeFindable')
      .map(item => ({ position: item.position.toArray(), rotation: item.rotation.y })),
    prompts: room.interactables.map(item => item.prompt()),
  };
}

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

{
  const mazeItems = createMazeItems();
  const room = await loadMazeRoom(null, { mazeItems });

  const meshes = room.group.children.filter((c) => c.name === 'MazeFindable');
  assert.equal(meshes.length, MAZE_FINDABLES.length, `expected ${MAZE_FINDABLES.length} findables placed, got ${meshes.length}`);
  assert.equal(room.interactables.length, MAZE_FINDABLES.length, 'one pickup interactable per findable');
  console.log(`PASS both findables placed (${meshes.length}) with matching interactables`);

  assert.ok(room.interactables.every((pickup, i) => pickup.anchor === meshes[i] && pickup.radius > 4.5 / 2),
    'each pickup is offered from outside its pocket without aiming at it');
  const [firstPickup] = room.interactables;
  assert.ok(firstPickup.prompt().startsWith('Pick up '), `unexpected prompt: ${firstPickup.prompt()}`);
  firstPickup.interact();
  assert.equal(room.group.children.filter((c) => c.name === 'MazeFindable').length, meshes.length - 1,
    'interacting should remove the mesh from the scene');
  assert.equal(room.interactables.length, MAZE_FINDABLES.length - 1,
    'interacting should drop its own interactable from the room list too');
  assert.equal(mazeItems.totalFound(), 1, 'collecting should register with the shared item state');
  console.log('PASS picking one up removes it from the scene, the interactable list, and registers the find');
}

{
  // A revisit with one already collected shouldn't re-place it.
  const mazeItems = createMazeItems();
  mazeItems.collect(MAZE_FINDABLES[0].id);
  const room = await loadMazeRoom(null, { mazeItems });
  const meshes = room.group.children.filter((c) => c.name === 'MazeFindable');
  assert.equal(meshes.length, MAZE_FINDABLES.length - 1, 'an already-collected findable should not reappear on reload');
  console.log('PASS an already-collected findable does not reappear on reload');
}

{
  // No mazeItems passed at all (e.g. a context that never wires it up):
  // should load clean, no findables, nothing thrown.
  const room = await loadMazeRoom(null, {});
  assert.equal(room.group.children.filter((c) => c.name === 'MazeFindable').length, 0);
  assert.deepEqual(room.interactables, []);
  console.log('PASS loads clean with no findables when mazeItems is omitted');
}

{
  for (const seed of [0, 12345, 0xffffffff]) {
    const first = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    const second = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    assert.equal(first.mazeSeed, seed);
    assert.deepEqual(layout(second), layout(first), `seed ${seed} must reproduce walls, actors and props`);
  }
  console.log('PASS explicit seeds, including zero and the maximum, reproduce the entire fresh room layout');
}

{
  const first = await loadMazeRoom(null, { mazeItems: createMazeItems() });
  assert.ok(Number.isInteger(first.mazeSeed) && first.mazeSeed >= 0 && first.mazeSeed <= 0xffffffff);
  const replay = await loadMazeRoom(null, { seed: first.mazeSeed, mazeItems: createMazeItems() });
  assert.deepEqual(layout(replay), layout(first), 'a randomly chosen seed must recreate the reported room');
  console.log('PASS an unseeded load records a seed that reproduces its walls and item placements');
}

{
  const first = await loadMazeRoom(null, { seed: 1, mazeItems: createMazeItems() });
  const second = await loadMazeRoom(null, { seed: 2, mazeItems: createMazeItems() });
  assert.notDeepEqual(layout(first).walls, layout(second).walls);
  assert.notDeepEqual(layout(first).items, layout(second).items);

  const items = createMazeItems();
  const room = await loadMazeRoom(null, { seed: 1, mazeItems: items });
  room.interactables[0].interact();
  const revisited = await loadMazeRoom(null, { seed: 1, mazeItems: items });
  assert.equal(revisited.interactables.length, 1);
  assert.deepEqual(layout(revisited).walls, layout(first).walls);
  assert.deepEqual(layout(revisited).items[0], layout(first).items[1]);
  console.log('PASS different seeds vary the room, and collected items stay absent on a seeded revisit');
}

{
  await assert.rejects(loadMazeRoom(null, { seed: -1 }), /Maze seed must be an integer/);
  await assert.rejects(loadMazeRoom(null, { seed: '12345' }), /Maze seed must be an integer/);
  console.log('PASS invalid room seeds reject with an actionable error');
}

{
  for (let seed = 0; seed < 32; seed++) {
    const room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    const { maze, mazePlacement } = room;
    const key = cell => `${cell.r},${cell.c}`;
    const origin = mazePlacement.cellAt(room.spawn);
    assert.equal(origin, maze.start);
    const reached = mazePlacement.reachableFrom(origin);
    assert.equal(reached.length, maze.rows * maze.cols);
    const distances = new Map(reached.map(({ cell, distance }) => [key(cell), distance]));
    const reserved = [maze.start, maze.exit, maze.jax, maze.jaxNeighbor,
      ...room.movers.flatMap(mover => mover.waypoints.map(point => mazePlacement.cellAt(point)))];
    const excluded = new Set(reserved.map(key));
    const props = room.group.children.filter(child => child.name === 'MazeFindable');
    assert.equal(props.length, 2);
    for (const prop of props) {
      const cell = mazePlacement.cellAt(prop.position);
      assert.ok(cell && distances.has(key(cell)), `seed ${seed}: item is unreachable`);
      assert.ok(!excluded.has(key(cell)), `seed ${seed}: item overlaps a reserved cell`);
      excluded.add(key(cell)); // also disallow the two items sharing a cell
      assert.ok(room.colliders.every(wall => !wall.containsPoint(prop.position)), `seed ${seed}: item is inside a wall`);
    }
    const jax = room.group.getObjectByName('Jax');
    assert.equal(room.jaxEncounter.anchor, jax);
    assert.equal(room.jaxEncounter.radius, 2.5);
    assert.ok(room.jaxEncounter.objects.length > 0);
    assert.ok(room.jaxEncounter.objects.every(object => object.isMesh));
    const oldApproach = room.triggers.jax.getCenter(jax.position.clone()).sub(jax.position).multiplyScalar(2);
    assert.ok(Math.hypot(oldApproach.x, oldApproach.z) > room.jaxEncounter.radius,
      `seed ${seed}: the old approach cell must not count as a close Jax arrival`);
    assert.equal(mazePlacement.cellAt(jax.position), maze.jax);
    assert.ok(distances.has(key(maze.jax)));
    assert.ok(room.colliders.every(wall => !wall.containsPoint(jax.position)));

    const from = maze.cells[seed % maze.rows][seed * 7 % maze.cols];
    const queryDistances = new Map(mazePlacement.reachableFrom(from).map(({ cell, distance }) => [key(cell), distance]));
    const target = mazePlacement.selectCell(from, {
      minDistance: 2, maxDistance: 8, excludedCells: [{ r: from.r, c: from.c }],
    });
    assert.ok(target, `seed ${seed}: no safe Jax destination`);
    assert.ok(target.distance >= 2 && target.distance <= 8);
    assert.equal(target.distance, queryDistances.get(key(target.cell)));
    assert.equal(mazePlacement.cellAt(target.position), target.cell);
    assert.ok(!excluded.has(key(target.cell)), `seed ${seed}: destination overlaps a reserved cell or item`);
    assert.ok(room.colliders.every(wall => !wall.containsPoint(target.position)));
    assert.equal(mazePlacement.selectCell(from, { minDistance: maze.rows * maze.cols }), null);
    assert.equal(mazePlacement.selectCell(from, { excludedCells: maze.cells.flat() }), null);

    assert.equal(mazePlacement.cellAt({ x: room.bounds.max.x, z: 0 }), null);
    assert.equal(mazePlacement.cellAt({ x: room.bounds.min.x - 1, z: 0 }), null);
    assert.equal(mazePlacement.cellAt({ x: NaN, z: 0 }), null);
    room.interactables[0].interact();
    assert.equal(room.group.children.filter(child => child.name === 'MazeFindable').length, 1);
    assert.equal(room.interactables.length, 1);
  }
  console.log('PASS 32 real-model maze seeds keep items and Jax reachable, honour exclusions, and handle impossible destinations');
}


// Check physical clearances against the real rendered room, not only its graph.
for (const seed of [0, 1, 2, 42, 123, 187, 12345, 0xffffffff]) {
  const room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
  const centre = cell => new THREE.Vector3(-27 + cell.c * 4.5, 0, -27 + cell.r * 4.5);
  const clear = (a, b = a) => {
    const box = new THREE.Box3().setFromPoints([a, b]);
    box.min.x -= 0.35; box.max.x += 0.35;
    box.min.z -= 0.35; box.max.z += 0.35;
    box.min.y = 0.4; box.max.y = 1.7;
    assert.ok(room.colliders.every(wall => !wall.intersectsBox(box)), `seed ${seed}: blocked corridor`);
  };
  assert.deepEqual(room.spawn.toArray(), [-27, 0, -27]);
  for (const row of room.maze.cells) for (const cell of row) {
    clear(centre(cell));
    if (!cell.walls.right) clear(centre(cell), centre(room.maze.cells[cell.r][cell.c + 1]));
    if (!cell.walls.bottom) clear(centre(cell), centre(room.maze.cells[cell.r + 1][cell.c]));
  }
  const walls = room.group.children.filter(child => child.isMesh && child.geometry.type === 'BoxGeometry');
  assert.equal(walls.length, room.colliders.length);
  walls.forEach((mesh, i) => assert.ok(new THREE.Box3().setFromObject(mesh).equals(room.colliders[i])));
  assert.ok(room.triggers.jax.containsPoint(centre(room.maze.jax).setY(0.5)));
  assert.ok(room.triggers.exit.containsPoint(centre(room.maze.exit).setY(0.5)));
  const markings=room.group.getObjectByName('FutureLoopInlays');
  assert.equal(markings.userData.style,'scalloped circus rosettes');
  for(const p of markings.userData.placements){
    const a=room.maze.cells[p.from.r][p.from.c],b=room.maze.cells[p.to.r][p.to.c];
    const side=b.r<a.r?'top':b.r>a.r?'bottom':b.c<a.c?'left':'right';
    assert.equal(a.walls[side],false,'rosette must sit on a real open loop edge');
    const box=new THREE.Box3(new THREE.Vector3(p.position[0]-p.radius,0.01,p.position[2]-p.radius),new THREE.Vector3(p.position[0]+p.radius,0.03,p.position[2]+p.radius));
    assert.ok(room.colliders.every(wall=>!wall.intersectsBox(box)),'rosette must not cross a wall');
  }
  const scenery = room.group.getObjectByName('MazeScenery');
  assert.ok(scenery, 'room includes the funhouse scenery');
  assert.ok(scenery.userData.sceneryStats.maxChunkBatches < 60, 'each spatial chunk stays batched');
  assert.ok(scenery.userData.sceneryStats.batches < 400, 'spatial batching stays within object budget');
  assert.equal(scenery.userData.sceneryStats.newLights, 0);
  const passageBoxes = [];
  for (const row of room.maze.cells) for (const cell of row) {
    for (const [wall, dr, dc] of [['right',0,1],['bottom',1,0]]) {
      if (cell.walls[wall]) continue;
      const box = new THREE.Box3().setFromPoints([centre(cell), centre(room.maze.cells[cell.r + dr][cell.c + dc])]);
      // Leave a generous 1.6 m wide walking/patrol lane through every passage.
      box.min.x -= 0.8; box.max.x += 0.8;
      box.min.z -= 0.8; box.max.z += 0.8;
      box.min.y = 0.4; box.max.y = 1.9;
      passageBoxes.push(box);
    }
  }
  const instanceMatrix = new THREE.Matrix4();
  scenery.updateMatrixWorld(true);
  scenery.traverse(object => {
    assert.ok(!object.isLight, 'scenery must not redesign the lighting');
    if (!object.isInstancedMesh) return;
    assert.ok(!object.material.isShaderMaterial, 'no custom shaders in Step 3');
    object.geometry.computeBoundingBox();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, instanceMatrix);
      instanceMatrix.premultiply(object.matrixWorld);
      const box = object.geometry.boundingBox.clone().applyMatrix4(instanceMatrix);
      if (box.max.y <= 0.4 || box.min.y >= 1.9) continue;
      assert.ok(passageBoxes.every(passage => !passage.intersectsBox(box)), `seed ${seed}: scenery obstructs a passage`);
    }
  });
  for (const cell of room.environmentLayout.alcoves.slice(0, 2)) {
    const open = [['top',-1,0],['right',0,1],['bottom',1,0],['left',0,-1]].find(([wall]) => !cell.walls[wall]);
    const from = centre(room.maze.cells[cell.r + open[1]][cell.c + open[2]]).setY(1.6);
    const target = centre(cell).setY(0.1);
    const ray = new THREE.Raycaster(from, target.clone().sub(from).normalize(), 0, from.distanceTo(target) - 0.05);
    assert.equal(ray.intersectObject(scenery, true).length, 0, `seed ${seed}: blocked pickup sightline`);
  }
  const lighting = room.group.getObjectByName('MazeLighting');
  assert.ok(lighting);
  const lights = [];
  lighting.traverse(object => { if (object.isLight) lights.push(object); });
  assert.equal(lights.filter(light => light.isHemisphereLight).length, 1);
  assert.ok(lights.filter(light => !light.isHemisphereLight).length <= 10);
  const shadowLights = lights.filter(light => light.castShadow);
  assert.equal(shadowLights.length, 2);
  const jaxShadow=shadowLights.find(light=>light.name==='JaxRoseSpotlight');
  assert.ok(jaxShadow);assert.ok(shadowLights.some(light=>light.name==='PatrolTheatricalKey'));
  assert.deepEqual(jaxShadow.shadow.mapSize.toArray(), [512,512]);
  lights.forEach(light => assert.ok(Number.isFinite(light.intensity) && light.intensity > 0));
  const target = jaxShadow.target.position.clone().setY(0);
  assert.ok(target.equals(centre(room.maze.jax)), 'spotlight targets the unchanged Jax anchor');
  let released = 0;
  jaxShadow.shadow.map = { dispose() { released++; } };
  lighting.dispose(); lighting.dispose();
  assert.equal(released, 1, 'room-local shadow cleanup is independently disposable and idempotent');
  assert.equal(room.hazards[0].radius, 0.9);
  assert.equal(room.movers[0].speed, 1.4);
  const props = room.group.children.filter(child => child.name === 'MazeFindable');
  props.forEach((prop, i) => assert.deepEqual(prop.position.toArray(), centre(room.environmentLayout.alcoves[i]).toArray()));
  for (const pickup of [...room.interactables]) pickup.interact();
  assert.equal(room.interactables.length, 0);
}
console.log('PASS eight fixed seeds including 123 and four-way-Jax seed 187: unchanged physical corridors, matching colliders, scenery clearance, pickup sightlines and destination triggers');


{
  const first = await loadMazeRoom(null, { seed: 123 });
  const second = await loadMazeRoom(null, { seed: 123 });
  const a = first.group.getObjectByName('Floor').material;
  const b = second.group.getObjectByName('Floor').material;
  assert.notEqual(a, b); assert.notEqual(a.map, b.map);
  assert.notEqual(first.group.getObjectByName('MazeLighting'), second.group.getObjectByName('MazeLighting'));
  const firstScenery = first.group.getObjectByName('MazeScenery').children.filter(child => child.isInstancedMesh);
  const secondMaterials = new Set(second.group.getObjectByName('MazeScenery').children.filter(child => child.isInstancedMesh).map(child => child.material));
  firstScenery.forEach(mesh => assert.ok(!secondMaterials.has(mesh.material)));
  a.dispose(); a.map.dispose();
  assert.ok(b.map.isTexture);
}
console.log('PASS maze lighting: bounded light/shadow budget, stable targets, idempotent cleanup and independent materials on repeat visits');
