import * as THREE from 'three';
import { getReachableCells } from '../maze/mazePlacements.js';

/** Maze-only light rig. Attached targets and shadow resources are owned by the
 * returned group; no renderer, scene-global, layout or gameplay state changes.
 * Budget: one hemisphere, at most ten direct lights, two 512px shadow maps.
 */
export function createMazeLighting({ maze, layout, cellCenter }) {
  const root = new THREE.Group(); root.name = 'MazeLighting';
  const fill = new THREE.HemisphereLight(0xffe4b9, 0x526b91, 0.57);
  fill.name = 'MazeReadableFill'; root.add(fill);
  const key=new THREE.DirectionalLight(0xffdfac,0.88);
  key.name='MazeTheatreKey';key.position.set(-18,18,-14);key.target.position.set(4,0,7);root.add(key,key.target);
  const distance = new Map(getReachableCells(maze, maze.start).map(entry => [entry.cell, entry.distance]));
  const far = Math.max(1, distance.get(maze.jax));
  function point(name, color, intensity, position, range) {
    const light = new THREE.PointLight(color, intensity, range, 2);
    light.name = name; light.position.copy(position); root.add(light); return light;
  }
  function spot(name, color, intensity, position, target, range, angle) {
    const light = new THREE.SpotLight(color, intensity, range, angle, 0.65, 2);
    light.name = name; light.position.copy(position);
    light.target.position.copy(target); root.add(light, light.target); return light;
  }
  const entrance = cellCenter(0, 0).add(new THREE.Vector3(2.25, 0, 0));
  spot('EntranceGoldenWash', 0xffd18b, 75,
    entrance.clone().add(new THREE.Vector3(0, 4.5, 2.8)),
    entrance.clone().add(new THREE.Vector3(0, 1.5, -2.1)), 15, 0.95);

  layout.loops.slice(0, 3).forEach((loop, index) => {
    const cell = loop.find(c => Object.values(c.walls).filter(wall => !wall).length >= 3) ?? loop[0];
    const progress = THREE.MathUtils.clamp(distance.get(cell) / far, 0, 1);
    const color = new THREE.Color(0xffd5a0).lerp(new THREE.Color(0x91b7ff), progress * 0.75);
    if (progress > 0.65) color.lerp(new THREE.Color(0xd38dff), (progress - 0.65) / 0.35);
    const closed=[['top',0,1],['right',-1,0],['bottom',0,-1],['left',1,0]].find(([wall])=>cell.walls[wall]);
    const normal=new THREE.Vector3(closed?.[1]??1,0,closed?.[2]??0),centre=cellCenter(cell.r,cell.c);
    spot(`IntersectionAccent${index}`,color,38,centre.clone().addScaledVector(normal,0.7).setY(4.6),centre.clone().addScaledVector(normal,-1.6).setY(1.2),12,0.72);
  });

  layout.alcoves.slice(0, 2).forEach((cell, index) => {
    const directions = [['top',0,-1], ['right',1,0], ['bottom',0,1], ['left',-1,0]];
    const [, dx, dz] = directions.find(([wall]) => !cell.walls[wall]);
    const centre = cellCenter(cell.r, cell.c);
    spot(index ? 'CocoaAlcoveFocus' : 'BowlingAlcoveFocus', index ? 0xffd7b4 : 0xffe4ae, 19,
      centre.clone().add(new THREE.Vector3(dx * 0.75, 2.85, dz * 0.75)),
      centre.clone().setY(0.12), 7, 0.83);
  });

  const mid=layout.patrolCells[Math.floor(layout.patrolCells.length/2)];
  const patrolCentre=cellCenter(mid.r,mid.c);
  const theatrical=spot('PatrolTheatricalKey',0xffd4a0,85,
    patrolCentre.clone().add(new THREE.Vector3(1.4,7.2,0.7)),patrolCentre.clone(),18,0.72);
  theatrical.castShadow=true;theatrical.shadow.mapSize.set(512,512);
  theatrical.shadow.camera.near=0.4;theatrical.shadow.camera.far=18;
  theatrical.shadow.bias=-0.0002;theatrical.shadow.normalBias=0.035;theatrical.shadow.radius=2;

  const jax = cellCenter(maze.jax.r, maze.jax.c);
  const approach = cellCenter(maze.jaxNeighbor.r, maze.jaxNeighbor.c).sub(jax).normalize();
  const right = new THREE.Vector3(-approach.z, 0, approach.x);
  point('JaxVioletRim', 0xa96bff, 8,
    jax.clone().addScaledVector(right, 1.3).addScaledVector(approach, -0.65).setY(2.55), 10);
  const focus = spot('JaxRoseSpotlight', 0xffb7e6, 32,
    jax.clone().addScaledVector(approach, 2.3).addScaledVector(right, -0.5).setY(4.6),
    jax.clone().setY(1.2), 12, 0.69);
  focus.castShadow = true;
  focus.shadow.mapSize.set(512, 512);
  focus.shadow.camera.near = 0.3; focus.shadow.camera.far = 12;
  focus.shadow.bias = -0.0002; focus.shadow.normalBias = 0.035;
  focus.shadow.radius = 2;
  root.userData.lightingBudget = { directLights: layout.loops.slice(0, 3).length + 7, shadowMaps: 2, shadowSize: 512 };
  let disposed = false;
  root.dispose = () => {
    if (disposed) return; disposed = true;
    root.traverse(object => object.shadow?.dispose());
  };
  return root;
}
