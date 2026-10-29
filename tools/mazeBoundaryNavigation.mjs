import assert from 'node:assert/strict';
export function assertBoundaryNavigation(maze,boxes,locked=true){
 const step=.25,origin=-29.25,n=235,blocked=new Uint8Array(n*n),seen=new Uint8Array(n*n);
 for(const box of boxes){const b=box.clone().expandByScalar(.35);const x0=Math.max(0,Math.ceil((b.min.x-origin)/step)),x1=Math.min(n-1,Math.floor((b.max.x-origin)/step)),z0=Math.max(0,Math.ceil((b.min.z-origin)/step)),z1=Math.min(n-1,Math.floor((b.max.z-origin)/step));for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)blocked[z*n+x]=1;}
 const index=c=>Math.round((-27+c.r*4.5-origin)/step)*n+Math.round((-27+c.c*4.5-origin)/step);
 const queue=[index(maze.start)];seen[queue[0]]=1;
 for(let i=0;i<queue.length;i++){const at=queue[i],x=at%n,z=Math.floor(at/n);for(const next of [x>0?at-1:-1,x<n-1?at+1:-1,z>0?at-n:-1,z<n-1?at+n:-1])if(next>=0&&!blocked[next]&&!seen[next]){seen[next]=1;queue.push(next);}}
 for(const row of maze.cells)for(const c of row)if(c!==maze.jax)assert.ok(seen[index(c)],`unreachable cell ${c.r},${c.c}`);
 assert.equal(seen[index(maze.jax)],locked?0:1,'Jax must be physically inaccessible while locked');
 return queue.length;
}
