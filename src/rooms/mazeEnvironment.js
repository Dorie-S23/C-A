import * as THREE from 'three';
import { getReachableCells } from '../maze/mazePlacements.js';

const SIDES = [
  { wall: 'top', nx: 0, nz: 1 }, { wall: 'right', nx: -1, nz: 0 },
  { wall: 'bottom', nx: 0, nz: -1 }, { wall: 'left', nx: 1, nz: 0 },
];

/** Static, room-owned scenery. Never reads the layout RNG or writes maze cells,
 * colliders, actor anchors, interactions, triggers or lights. All tall fixtures
 * hug closed walls; passage ornaments are above the player's head.
 */
export function createMazeEnvironment({ maze, layout, cellCenter, cellSize }) {
  const root = new THREE.Group();
  root.name = 'MazeScenery';
  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 8, 6),
    bead: new THREE.IcosahedronGeometry(1,0),
    disc: new THREE.CircleGeometry(1, 32),
    arch: new THREE.TorusGeometry(1, 0.025, 6, 32, Math.PI),
    ring: new THREE.TorusGeometry(1, 0.025, 6, 32),
    jar: new THREE.CylinderGeometry(0.9, 1, 1, 12),
    chestLid: new THREE.CylinderGeometry(0.19,0.19,1.32,16,1,false,0,Math.PI),
  };
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.72, emissive: color, emissiveIntensity: 0.018, ...extra,
  });
  const palette = {
    yellow: material(0x252b59), red: material(0xac244b), scarlet: material(0xce3262), cream: material(0xeae6e2),
    gold: material(0xdaa94b, { metalness: 0.38, roughness: 0.4 }),
    ink: material(0x17182d), purple: material(0x362053), magenta: material(0xb13d83),
    blue: material(0x252b59), silver: material(0xa2afd2, { metalness: 0.32, roughness: 0.32, emissiveIntensity: 0.09 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffeddb }),
    pale: new THREE.MeshBasicMaterial({ color: 0xb5bfea }),
    darkMirror: material(0x34425d, { metalness: 0.45, roughness: 0.19, emissiveIntensity: 0.07 }),
  };
  // Structural borders reuse the navy material to retain the instance budget.
  palette.trim=palette.blue;palette.blue.metalness=0.20;palette.blue.roughness=0.47;
  const textMaterials = new Map();
  function signMaterial(title, subtitle = '') {
    const key = `${title}/${subtitle}`;
    if (textMaterials.has(key)) return textMaterials.get(key);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17182d'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#daa94b'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#eae6e2'; ctx.textAlign = 'center';
    ctx.font = 'bold 32px Georgia, serif'; ctx.fillText(title, 256, subtitle ? 57 : 76, 470);
    if (subtitle) { ctx.font = '14px Georgia, serif'; ctx.fillStyle = '#b8aed4'; ctx.fillText(subtitle, 256, 91, 465); }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const result = new THREE.MeshBasicMaterial({ map }); textMaterials.set(key, result); return result;
  }
  function mesh(parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) {
    const result = new THREE.Mesh(geo, mat);
    result.position.set(x, y, z); result.scale.set(sx, sy, sz); result.rotation.z = rz;
    parent.add(result); return result;
  }
  const box = (p, m, x, y, z, w, h, d, rz = 0) => mesh(p, geometry.box, m, x, y, z, w, h, d, rz);
  const bulb = (p, x, y, z, size = 0.055) => mesh(p, geometry.bead, palette.bulb, x, y, z, size, size, size);
  const board = (p, title, subtitle, x, y, z, w = 3.2) => box(p, signMaterial(title, subtitle), x, y, z, w, w / 4, 0.025);
  function star(p, x, y, z, radius, mat = palette.gold) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? radius * 0.42 : radius;
      if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    shape.closePath();
    // Only a few symbols: cache geometry by radius to share between panels.
    const key = `star${radius}`;
    geometry[key] ??= new THREE.ShapeGeometry(shape);
    return mesh(p, geometry[key], mat, x, y, z);
  }
  function frame(cell, side, name) {
    const group = new THREE.Group(); group.name = name;
    const center = cellCenter(cell.r, cell.c);
    group.position.set(center.x - side.nx * (cellSize / 2 - 0.115), 0, center.z - side.nz * (cellSize / 2 - 0.115));
    group.rotation.y = Math.atan2(side.nx, side.nz); root.add(group); return group;
  }
  function curtain(p, x, y, z, width, height, mat = palette.red) {
    const key=`cloth${width}/${height}`;
    if(!geometry[key]){
      const cloth=new THREE.PlaneGeometry(width,height,28,12),positions=cloth.attributes.position;
      for(let i=0;i<positions.count;i++){
        const u=cloth.attributes.uv.getX(i),v=cloth.attributes.uv.getY(i);
        positions.setZ(i,0.045*Math.cos(u*Math.PI*14));
        positions.setY(i,positions.getY(i)+(1-v)*0.035*Math.sin(u*Math.PI*6));
      }
      cloth.computeVertexNormals();geometry[key]=cloth;
    }
    mat.side=THREE.DoubleSide;mat.forceSinglePass=true;
    mesh(p,geometry[key],mat,x,y,z+0.015);
    box(p,palette.gold,x,y-height*0.18,z+0.073,width*1.03,0.045,0.025,x>0?-0.12:0.12);
  }
  function archShape(inset=0){
    const shape=new THREE.Shape(),w=1.76-inset,b=-0.70+inset,t=0.98-inset;
    shape.moveTo(-w,b);shape.lineTo(w,b);shape.lineTo(w,0.0);
    shape.bezierCurveTo(w,t*0.61,w*0.56,t,0,t);
    shape.bezierCurveTo(-w*0.56,t,-w,t*0.61,-w,0);shape.closePath();return shape;
  }
  const archFrame=archShape();archFrame.holes.push(new THREE.Path(archShape(0.075).getPoints(8).reverse()));
  geometry.wallArch=new THREE.ExtrudeGeometry(archFrame,{depth:0.045,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.012,bevelSegments:1,curveSegments:8});
  geometry.archInset=new THREE.ShapeGeometry(archShape(0.09),16);
  const raised=new THREE.Shape();raised.moveTo(-0.5,-0.5);raised.lineTo(0.5,-0.5);raised.lineTo(0.5,0.5);raised.lineTo(-0.5,0.5);raised.closePath();
  geometry.raisedPanel=new THREE.ExtrudeGeometry(raised,{depth:0.025,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.025,bevelSegments:1});
  const damask=document.createElement('canvas');damask.width=damask.height=128;
  const dc=damask.getContext('2d');dc.fillStyle='#ffffff';dc.fillRect(0,0,128,128);
  dc.fillStyle='#b2aacb';
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    const cx=x*32+(y%2)*16,cy=y*32;
    dc.beginPath();dc.moveTo(cx,cy-11);dc.lineTo(cx+6,cy);dc.lineTo(cx,cy+11);dc.lineTo(cx-6,cy);dc.closePath();dc.fill();
    dc.fillRect(cx-1,cy-15,2,3);
  }
  const textileMap=new THREE.CanvasTexture(damask);textileMap.colorSpace=THREE.SRGBColorSpace;
  textileMap.wrapS=textileMap.wrapT=THREE.RepeatWrapping;textileMap.repeat.set(0.7,0.7);
  const textileWarm=material(0xac244b,{map:textileMap,roughness:0.93,emissiveIntensity:0.015});
  const textileCool=material(0x252b59,{map:textileMap,roughness:0.93,emissiveIntensity:0.015});
  const textilePurple=material(0x76409b,{map:textileMap,roughness:0.93,emissiveIntensity:0.015});
  const textileJax=material(0x431f66,{map:textileMap,roughness:0.90,emissiveIntensity:0.01});
  const distances = new Map(getReachableCells(maze, maze.start).map(entry => [entry.cell, entry.distance]));
  const maxDistance = Math.max(...distances.values());
  const chamber = new Set(layout.chamber);
  for (const row of maze.cells) for (const cell of row) {
    const mysterious = chamber.has(cell) || distances.get(cell) / maxDistance > 0.73;
    const variant = (cell.r * 7 + cell.c * 11) % 5;
    for (const side of SIDES) {
      if (!cell.walls[side.wall]) continue;
      // Keep raised mouldings behind the lobby proscenium, not across its painting.
      if(cell.r===0&&cell.c<=1&&side.wall==='top')continue;
      const p = frame(cell, side, 'CircusWallPanel');
      const zone=distances.get(cell)/maxDistance;
      const upper=mysterious?palette.purple:variant===1?palette.yellow:palette.red;
      box(p,upper,0,1.92,0,4.26,1.83,0.012);
      box(p,palette.ink,0,0.52,0.005,4.26,0.98,0.018);
      // A stepped cornice, real arch moulding and recessed textile bay.
      for(const [y,h,d] of [[0.10,0.10,0.05],[1.04,0.075,0.055],[2.78,0.07,0.065],[2.89,0.09,0.085],[2.97,0.045,0.10]])
        box(p,y===2.89?palette.blue:palette.trim,0,y,0.018,4.28,h,d);
      mesh(p,geometry.archInset,chamber.has(cell)?textileJax:zone>0.66?textilePurple:zone>0.33?textileCool:textileWarm,0,1.87,0.018);
      mesh(p,geometry.wallArch,palette.gold,0,1.87,0.033);
      for(const x of [-2.02,2.02]){
        box(p,palette.blue,x,1.45,0.025,0.115,2.68,0.065);
        box(p,palette.gold,x,1.45,0.064,0.032,2.64,0.025);
        mesh(p,geometry.raisedPanel,palette.trim,x,2.73,0.055,0.21,0.14,1);
      }
      for(const x of [-1.4,0,1.4]){
        mesh(p,geometry.raisedPanel,palette.trim,x,0.53,0.02,1.24,0.65,1);
        mesh(p,geometry.raisedPanel,chamber.has(cell)?palette.purple:mysterious?palette.magenta:palette.red,x,0.53,0.05,1.12,0.54,1);
        box(p,palette.gold,x,0.53,0.09,0.10,0.10,0.018,Math.PI/4);
      }
      if(variant===2){
        mesh(p,geometry.ring,palette.gold,0,1.97,0.065,0.59,0.69,0.59);
        // Gently curved silvered glass produces real changing highlights.
        mesh(p,geometry.sphere,palette.darkMirror,0,1.97,0.035,0.55,0.65,0.065);
        box(p,palette.silver,-0.16,1.98,0.105,0.025,0.74,0.008,-0.22);
      }else{
        mesh(p,geometry.disc,mysterious?palette.magenta:palette.blue,0,1.96,0.065,0.49,0.49,1);
        mesh(p,geometry.ring,palette.gold,0,1.96,0.08,0.50,0.50,0.50);
        star(p,0,1.96,0.10,0.33,mysterious?palette.silver:palette.gold);
        for(const x of [-1.13,1.13]){
          mesh(p,geometry.raisedPanel,palette.gold,x,1.96,0.055,0.10,0.18,1);
          mesh(p,geometry.bead,palette.cream,x,2.11,0.06,0.055,0.055,0.035);
        }
      }
      if ((cell.r + cell.c) % 3 === 0) for (const x of [-1.86, 1.86]) bulb(p, x, 2.92, 0.07, 0.043);
    }
  }

  // Grand entrance is a painted, lobby-facing theatrical backdrop on the
  // existing closed boundary. It is scenery, not a new portal or doorway.
  const entrance = new THREE.Group(); entrance.name = 'CircusLobbyArch';
  const ec = cellCenter(0, 0); entrance.position.set(ec.x + cellSize / 2, 0, ec.z - cellSize / 2 + 0.23); root.add(entrance);
  box(entrance, palette.ink, 0, 2.1, -0.08, 8.15, 4.2, 0.02);
  // Trompe-l'oeil lobby: perspective checkers, distant tent and toy columns.
  const lobby = document.createElement('canvas'); lobby.width = 512; lobby.height = 256;
  const lc = lobby.getContext('2d');
  lc.fillStyle = '#4e6e9c'; lc.fillRect(0, 0, 512, 256);
  lc.fillStyle = '#b9b3bc'; lc.fillRect(0, 142, 512, 114);
  for(let row=0;row<7;row++)for(let col=-8;col<8;col++){
    const a=row/7,b=(row+1)/7,y1=142+a*a*114,y2=142+b*b*114;
    const w1=5+a*36,w2=5+b*36;
    lc.fillStyle=(row+col)%2?'#eae6e2':'#17182d';lc.beginPath();
    lc.moveTo(256+col*w1,y1);lc.lineTo(256+(col+1)*w1,y1);lc.lineTo(256+(col+1)*w2,y2);lc.lineTo(256+col*w2,y2);lc.closePath();lc.fill();
  }
  for (let i = 0; i < 9; i++) { lc.fillStyle = i % 2 ? '#eae6e2' : '#b8325a'; lc.fillRect(148 + i * 24, 70, 24, 103); }
  lc.fillStyle = '#49244e'; lc.fillRect(222, 107, 64, 66);
  lc.fillStyle = '#daa94b'; lc.beginPath(); lc.moveTo(138, 70); lc.lineTo(256, 8); lc.lineTo(374, 70); lc.closePath(); lc.fill();
  for (const x of [35, 427]) { lc.fillStyle = '#d5b9e5'; lc.fillRect(x, 44, 48, 151); lc.fillStyle = '#daa94b'; lc.fillRect(x-4, 40, 56, 15); }
  const lobbyMap = new THREE.CanvasTexture(lobby); lobbyMap.colorSpace = THREE.SRGBColorSpace;
  box(entrance, new THREE.MeshBasicMaterial({ map: lobbyMap, color: 0xd9d7eb }), 0, 1.75, -0.04, 6.9, 3.4, 0.015);
  for (const x of [-3.66, 3.66]) {
    box(entrance, palette.gold, x, 1.24, 0, 0.38, 2.48, 0.19);
    for (let y = 0.2; y < 2.5; y += 0.34) box(entrance, palette.red, x, y, 0.11, 0.32, 0.16, 0.035);
    curtain(entrance, x * 0.83, 1.55, 0.13, 0.8, 2.9);
  }
  mesh(entrance, geometry.arch, palette.gold, 0, 2.45, 0.06, 3.65, 2.2, 1);
  mesh(entrance, geometry.arch, palette.red, 0, 2.45, 0.045, 3.88, 2.36, 1);
  for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI; bulb(entrance, Math.cos(a) * 3.66, 2.45 + Math.sin(a) * 2.2, 0.14, 0.072); }
  board(entrance, 'THE WONDER MAZE', 'CIRCUS LOBBY  /  STEP RIGHT IN', 0, 3.43, 0.2, 4.4);
  star(entrance, 0, 4.81, 0.1, 0.27);

  // An overhead landmark for each intentional loop, without floor supports.
  const names = ['THE GOLDEN TURN', 'MIRROR GALLERY', 'VELVET PARADE'];
  const views = { entrance: { position: [ec.x + 2.25, 2.2, ec.z + 6.6], target: [ec.x + 2.25, 2.3, ec.z - 2.1] } };
  layout.loops.forEach((loop, index) => {
    const cell = loop.find(c => Object.values(c.walls).filter(w => !w).length >= 3) ?? loop[0];
    const center = cellCenter(cell.r, cell.c);
    const p = new THREE.Group(); p.name = `Landmark${index}`; p.position.copy(center); root.add(p);
    const side = SIDES.find(s => cell.walls[s.wall]);
    if (side) p.rotation.y = Math.atan2(side.nx, side.nz);
    mesh(p, geometry.arch, palette.gold, 0, 2.94, 0, 1.9, 1.25, 1);
    board(p, names[index], 'WONDER MAZE  /  CIRCUS COLLECTION', 0, 3.15, 0.1, 2.65);
    for (const x of [-1.7, 1.7]) star(p, x, 3.1, 0.05, 0.22, index === 1 ? palette.silver : palette.gold);
    const medallion = mesh(p, geometry.disc, index === 2 ? palette.magenta : palette.gold, 0, 0.008, 0, 1.18, 1.18, 1);
    medallion.rotation.x = -Math.PI / 2;
    const inset = mesh(p, geometry.disc, palette.ink, 0, 0.01, 0, 1.08, 1.08, 1); inset.rotation.x = -Math.PI / 2;
    const emblem = star(p, 0, 0.014, 0, 0.7); emblem.rotation.x = -Math.PI / 2;
    if (index === 0) {
      p.updateMatrixWorld(true);
      views.corridor = { position: p.localToWorld(new THREE.Vector3(0, 1.85, 5.7)).toArray(), target: p.localToWorld(new THREE.Vector3(0, 1.85, 0)).toArray() };
    }
  });

  function backSide(cell) {
    const open = SIDES.find(side => !cell.walls[side.wall]);
    return SIDES.find(side => cell.walls[side.wall] && side.nx === -open?.nx && side.nz === -open?.nz)
      ?? SIDES.find(side => cell.walls[side.wall]);
  }
  layout.alcoves.forEach((cell, index) => {
    const p = frame(cell, backSide(cell), `SearchAlcove${index}`);
    box(p, palette.ink, 0, 1.46, 0.1, 3.7, 2.73, 0.035);
    for (const x of [-1.65, 1.65]) curtain(p, x, 1.4, 0.17, 0.43, 2.55, index === 1 ? palette.magenta : palette.red);
    board(p, index === 0 ? 'LOST & FOUND' : index === 1 ? 'THE COCOA CLUB' : 'CABINET OF CURIOSITIES', index === 0 ? 'TOYS, TRINKETS & OTHER WONDERS' : 'A LITTLE COMFORT IN THE CIRCUS', 0, 2.58, 0.21, 2.9);
    for (const x of [-1.25, 1.25]) bulb(p, x, 2.94, 0.15);
    // Thin stage-flat furniture stays at the rear wall, away from the
    // collectible (still exactly at the centre of its original cell).
    if (index % 2 === 0) {
      box(p, palette.red, -0.8, 0.4, 0.18, 1.3, 0.69, 0.24);
      const lid=mesh(p,geometry.chestLid,palette.red,-0.8,0.75,0.18);lid.rotation.z=Math.PI/2;
      box(p,palette.gold,-0.8,0.74,0.18,1.38,0.045,0.37);
      for (const x of [-1.24, -0.35]) box(p, palette.gold, x, 0.41, 0.31, 0.075, 0.68, 0.02);
      star(p, -0.8, 0.42, 0.315, 0.15);
      for (const [i, x, y] of [[0,0.5,0.17],[1,0.87,0.17],[2,0.68,0.49]]) {
        box(p, [palette.blue,palette.cream,palette.magenta][i], x, y, 0.15, 0.3, 0.3, 0.18);
        star(p, x, y, 0.247, 0.065);
      }
    } else {
      for (const y of [0.8, 1.4, 1.95]) {
        box(p, palette.gold, 0, y, 0.2, 2.35, 0.065, 0.24);
        for (let i = 0; i < 3; i++) {
          mesh(p, geometry.jar, i % 2 ? palette.cream : palette.magenta, -0.7 + i * 0.65, y + 0.17, 0.19, 0.12, 0.27, 0.11);
          box(p, palette.gold, -0.7 + i * 0.65, y + 0.32, 0.19, 0.25, 0.04, 0.23);
        }
      }
    }
    const rug = mesh(p, geometry.disc, palette.red, 0, 0.009, 2.13, 1.0, 1.0, 1); rug.rotation.x = -Math.PI / 2;
    p.updateMatrixWorld(true);
    if (index < 2) views[index === 0 ? 'bowling' : 'mug'] = {
      position: p.localToWorld(new THREE.Vector3(0, 1.8, 5.6)).toArray(),
      target: p.localToWorld(new THREE.Vector3(0, 1.3, 1.0)).toArray(),
    };
  });

  // The chamber's actor, trigger and floor height are unchanged. This is a
  // flat stage carpet with wall scenery, never a raised collision platform.
  const jc = cellCenter(maze.jax.r, maze.jax.c);
  const approach = cellCenter(maze.jaxNeighbor.r, maze.jaxNeighbor.c).sub(jc).normalize();
  let stageCell = maze.jax;
  let js = SIDES.find(s => maze.jax.walls[s.wall] && s.nx === approach.x && s.nz === approach.z)
    ?? SIDES.find(s => maze.jax.walls[s.wall]);
  // A four-way actor cell has no backing wall. Use the nearest closed
  // chamber wall instead of placing scenery across an open corridor.
  if(!js){
    stageCell=[...layout.chamber].filter(cell=>SIDES.some(side=>cell.walls[side.wall]))
      .sort((a,b)=>Math.abs(a.r-maze.jax.r)+Math.abs(a.c-maze.jax.c)-Math.abs(b.r-maze.jax.r)-Math.abs(b.c-maze.jax.c))[0];
    js=SIDES.find(side=>stageCell.walls[side.wall]);
  }
  const stage = frame(stageCell, js, 'JaxTheatreBackdrop');
  // No marquee, no footlights, no red carpet: this reads as the storage
  // nook he's wedged himself into, not a stage he's been put on display in.
  box(stage, palette.ink, 0, 1.5, 0.11, 4.2, 2.94, 0.035);
  mesh(stage, geometry.archInset, textileJax, 0, 1.55, 0.13);
  // One loose drape, bunched and off-centre rather than a matched
  // theatrical pair, as if he's half-hidden behind it.
  curtain(stage, -1.2, 1.3, 0.2, 0.58, 2.5, palette.purple);
  // Crates and a jar shoved into the corner, same clutter language as the
  // search alcoves, so the spot reads as something he's hiding among.
  box(stage, palette.red, 1.3, 0.38, 0.19, 1.0, 0.66, 0.26);
  const lid = mesh(stage, geometry.chestLid, palette.red, 1.3, 0.72, 0.19); lid.rotation.z = Math.PI / 2;
  mesh(stage, geometry.jar, palette.magenta, 1.75, 0.2, 0.2, 0.1, 0.22, 0.09);
  // One small, unframed cracked-mirror shard, low and off-centre — a quiet
  // callback to the circus's mirrors, not a stage reveal.
  const shardShape = new THREE.Shape();
  [[-0.22, -0.3], [-0.05, -0.05], [0.08, -0.33], [0.21, -0.02], [0.05, 0.3], [-0.1, 0.0]]
    .forEach(([xx, yy], n) => n ? shardShape.lineTo(xx, yy) : shardShape.moveTo(xx, yy));
  shardShape.closePath();
  geometry.jaxShard ??= new THREE.ShapeGeometry(shardShape);
  mesh(stage, geometry.jaxShard, palette.darkMirror, -1.7, 1.05, 0.14, 0.85, 0.85, 1);
  stage.updateMatrixWorld(true);
  // Derived straight from Jax's own cell centre, so it's correct whether or
  // not the backdrop had to attach to an alternate wall (four-way cells).
  root.userData.jaxStageCentre = jc.clone().setY(0.01).toArray();
  views.jax = { position: stage.localToWorld(new THREE.Vector3(0, 1.6, 3.4)).toArray(), target: [jc.x, 1.3, jc.z] };

  // Merge identical static primitives into instanced batches. The entire maze
  // shares unit geometry and a small material palette instead of thousands
  // of individual draw calls. All resources belong to this room's root.
  root.updateMatrixWorld(true);
  const batches = new Map(), meshes = [], chunks = new Map();
  const chunkSize=18;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes.push(object);
    const tile=`${Math.floor((object.matrixWorld.elements[12]+29.25)/chunkSize)},${Math.floor((object.matrixWorld.elements[14]+29.25)/chunkSize)}`;
    const key = `${object.geometry.uuid}/${object.material.uuid}/${tile}`;
    if (!batches.has(key)) { batches.set(key, { geometry: object.geometry, material: object.material, matrices: [] }); chunks.set(tile,(chunks.get(tile)??0)+1); }
    batches.get(key).matrices.push(object.matrixWorld.clone());
  });
  meshes.forEach(object => object.removeFromParent());
  for (const batch of batches.values()) {
    const instances = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    batch.matrices.forEach((matrix, i) => instances.setMatrixAt(i, matrix));
    instances.computeBoundingSphere(); instances.receiveShadow = true; instances.name = 'CircusSceneryBatch'; root.add(instances);
  }
  root.userData.reviewViews = views;
  root.userData.sceneryStats = { batches: batches.size, spatialChunks: chunks.size, maxChunkBatches: Math.max(...chunks.values()), chunkSize, instances: meshes.length, labelTextures: textMaterials.size, newLights: 0 };
  return root;
}
