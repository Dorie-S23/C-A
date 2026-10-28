import fs from 'node:fs';
import { generateMaze } from '../src/maze/generateMaze.js';
import { createSeededRandom } from '../src/maze/seededRandom.js';
import { shapeMazeEnvironment } from '../src/maze/mazeEnvironmentLayout.js';
import { getReachableCells } from '../src/maze/mazePlacements.js';

const seed = Number(process.argv[2] ?? 123);
const maze = generateMaze(13, 13, createSeededRandom(seed), 0);
const layout = shapeMazeEnvironment(maze);
const scale = 38, offset = 32;
const x = c => offset + c * scale, y = r => 92 + r * scale;
const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="760" height="650" viewBox="0 0 760 650"><rect width="760" height="650" fill="#151522"/><g font-family="sans-serif" fill="#f4ead8"><text x="32" y="32" font-size="22">Level 3 funhouse layout</text><text x="32" y="58" font-size="14">Seed ${seed} · 13 × 13 · 4.5 m cells · layout review</text>`];
const region = (cells, color) => cells.forEach(cell => parts.push(`<rect x="${x(cell.c)}" y="${y(cell.r)}" width="${scale}" height="${scale}" fill="${color}"/>`));
region(maze.cells.flat(), '#292938');
region(layout.entrance, '#81672e'); region(layout.chamber, '#604982'); region(layout.alcoves, '#275a5c');
const line = (cells, color, width, closed = false) => {
 const points = [...cells, ...(closed ? [cells[0]] : [])].map(cell => `${x(cell.c)+scale/2},${y(cell.r)+scale/2}`).join(' ');
 parts.push(`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`);
};
layout.loops.forEach(loop => line(loop, '#e9b856', 5, true));
line(layout.patrolCells, '#ff7777', 5);
for(const row of maze.cells) for(const cell of row) {
 const sx=x(cell.c), sy=y(cell.r);
 const wall=(a,b,c,d)=>parts.push(`<path d="M${a} ${b} L${c} ${d}" stroke="#eee1c5" stroke-width="3"/>`);
 if(cell.walls.top) wall(sx,sy,sx+scale,sy);
 if(cell.walls.left) wall(sx,sy,sx,sy+scale);
 if(cell.r===12 && cell.walls.bottom) wall(sx,sy+scale,sx+scale,sy+scale);
 if(cell.c===12 && cell.walls.right) wall(sx+scale,sy,sx+scale,sy+scale);
}
const label=(cell,text,color)=>parts.push(`<circle cx="${x(cell.c)+scale/2}" cy="${y(cell.r)+scale/2}" r="11" fill="${color}"/><text x="${x(cell.c)+scale/2}" y="${y(cell.r)+scale/2+4}" text-anchor="middle" font-size="12" fill="#111">${text}</text>`);
label(maze.start,'E','#ffe395'); label(maze.jax,'J','#d6b3ff'); label(maze.exit,'X','#9be5a8');
label(layout.alcoves[0],'B','#8ce2ed'); label(layout.alcoves[1],'M','#8ce2ed');
const legend=['E  Entrance / future arch','Gold  Future patrol circuits','Red  Existing hazard path','Teal  Search alcoves','B  Bowling ball','M  Hot chocolate mug','Purple  Jax chamber','J  Jax','X  Existing exit'];
legend.forEach((text,i)=>parts.push(`<text x="550" y="${112+i*29}" font-size="13">${text}</text>`));
const distance = getReachableCells(maze, maze.start).find(entry=>entry.cell===maze.jax).distance;
parts.push(`<text x="32" y="620" font-size="14">Jax: ${distance} passages from entrance · ${layout.loops.length} circuits · ${layout.alcoves.length} reserved search pockets</text></g></svg>`);
fs.mkdirSync('artifacts/maze-layout',{recursive:true});
const file=`artifacts/maze-layout/seed-${seed}.svg`;
fs.writeFileSync(file,parts.join('\n'));
console.log(file);
