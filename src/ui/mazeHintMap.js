import { MAZE_HINT_OBJECTS } from '../state/mazeHints.js';

// Map coordinates follow the final room graph. No enemies, exit or route.
function project(room, position) {
  const {cols,rows}=room.maze;
  const width=room.bounds ? room.bounds.max.x-room.bounds.min.x : cols*4.5;
  const depth=room.bounds ? room.bounds.max.z-room.bounds.min.z : rows*4.5;
  const minX=room.bounds?.min.x ?? -width/2, minZ=room.bounds?.min.z ?? -depth/2;
  return { x:Math.max(0,Math.min(cols,(position.x-minX)/width*cols)),
    y:Math.max(0,Math.min(rows,(position.z-minZ)/depth*rows)) };
}

export function mazeHintMapData(room, { mode = 'objects', missingItems = MAZE_HINT_OBJECTS.map(item=>item.id), playerPosition, playerFacing = 0, jaxPosition = null } = {}) {
  const {maze,environmentLayout}=room, walls=[];
  for(const row of maze.cells) for(const {r,c,walls:sides} of row) {
    if(sides.top)walls.push([c,r,c+1,r]);
    if(sides.left)walls.push([c,r,c,r+1]);
    if(r===maze.rows-1&&sides.bottom)walls.push([c,r+1,c+1,r+1]);
    if(c===maze.cols-1&&sides.right)walls.push([c+1,r,c+1,r+1]);
  }
  const atCell=cell=>({r:cell.r,c:cell.c,x:cell.c+.5,y:cell.r+.5});
  const markers=[{marker:'E',label:'Entrance',note:'From the Circus Lobby',color:'#daa94b',...atCell(maze.start)}];
  // Where he is now, if known (he moves between hiding places), else his nook.
  if(mode==='jax') markers.push({marker:'J',label:'Jax',note:'The Last Act',color:'#b13d83',...atCell(maze.jax),
    ...(Number.isFinite(jaxPosition?.x)&&Number.isFinite(jaxPosition?.z)?project(room,jaxPosition):{})});
  else for(const item of MAZE_HINT_OBJECTS.filter(item=>missingItems.includes(item.id))) {
    const alcove=environmentLayout.alcoves[item.alcove];
    const pickup=room.interactables?.find(entry=>entry.prompt?.()===('Pick up '+(item.id==='bowling-ball'?'bowling ball':'mug of hot chocolate')));
    let point=atCell(alcove);
    if(pickup?.anchor) {
      pickup.anchor.updateWorldMatrix(true,false);
      const matrix=pickup.anchor.matrixWorld.elements;
      point={...point,...project(room,{x:matrix[12],z:matrix[14]})};
    }
    markers.push({marker:item.marker,itemId:item.id,label:item.label,note:item.station+' - '+item.landmark,color:'#76409b',...point});
  }
  if(Number.isFinite(playerPosition?.x)&&Number.isFinite(playerPosition?.z))markers.push({marker:'P',label:'Pomni (you)',note:'Your position at this hint',color:'#4499b2',facing:playerFacing,...project(room,playerPosition)});
  return {cols:maze.cols,rows:maze.rows,walls,markers};
}

export function renderMazeHintMap(container, room, options) {
  const data=mazeHintMapData(room,options),ns='http://www.w3.org/2000/svg';
  const element=(tag,attributes,text)=>{
    const node=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    if(text)node.textContent=text;
    return node;
  };
  const svg=element('svg',{viewBox:'-.4 -.4 '+(data.cols+.8)+' '+(data.rows+.8),role:'img','aria-labelledby':'maze-map-title maze-map-description'});
  svg.append(element('title',{id:'maze-map-title'},'The funhouse maze layout'));
  svg.append(element('desc',{id:'maze-map-description'},'Current walls and corridors. '+data.markers.map(marker=>marker.marker+' marks '+marker.label).join('; ')+'.'));
  svg.append(element('rect',{x:0,y:0,width:data.cols,height:data.rows,rx:.08,fill:'#30354e'}));
  svg.append(element('path',{d:data.walls.map(([x,y,a,b])=>'M'+x+','+y+'L'+a+','+b).join(' '),fill:'none',stroke:'#d4bdec','stroke-width':.065,'stroke-linecap':'round','data-map-walls':''}));
  for(const marker of data.markers) {
    const group=element('g',{'data-map-marker':marker.marker,'data-map-x':marker.x,'data-map-y':marker.y,...(marker.itemId?{'data-map-item':marker.itemId}:{})});
    if(marker.marker==='P') {
      const dx=Math.sin(marker.facing),dy=Math.cos(marker.facing);
      group.append(element('line',{x1:marker.x,y1:marker.y,x2:marker.x+dx*.45,y2:marker.y+dy*.45,stroke:'#bcefff','stroke-width':.09,'stroke-linecap':'round'}));
    }
    group.append(element('circle',{cx:marker.x,cy:marker.y,r:marker.marker==='P'?.23:.30,fill:marker.color,stroke:marker.marker==='P'?'#d9f8ff':'#e4c8ef','stroke-width':.04}));
    group.append(element('text',{x:marker.x,y:marker.y+.02,'text-anchor':'middle','dominant-baseline':'middle',fill:marker.marker==='E'?'#17182d':'#fff4ff','font-size':.32,'font-family':'system-ui, sans-serif','font-weight':700},marker.marker));
    svg.append(group);
  }
  container.replaceChildren(svg);
  return data;
}

export function renderMazeHintLegend(container,data) {
  container.replaceChildren();
  const ordered=[...data.markers].sort((a,b)=>(b.marker==='P')-(a.marker==='P'));
  for(const marker of ordered) {
    const row=document.createElement('li'),badge=document.createElement('b'),label=document.createElement('strong'),note=document.createElement('span');
    badge.textContent=marker.marker;badge.style.background=marker.color;
    if(marker.marker==='E')badge.className='entrance';
    label.textContent=marker.label;note.textContent=marker.note;
    row.append(badge,label,note);container.append(row);
  }
}
