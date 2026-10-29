import {shouldShowObjective} from './objectiveHUD.js';
import {mazeObjective,MAZE_FINDABLES} from '../state/mazeItems.js';
export function createMazeObjectiveHUD({root,items}){
 const title=root.querySelector('[data-maze-title]'),count=root.querySelector('[data-maze-count]'),list=root.querySelector('[data-maze-checklist]');
 const rows=MAZE_FINDABLES.map((item,index)=>{const row=document.createElement('li');list.append(row);return {row,item,number:index+1,label:index?'Hot Chocolate Mug':'Bowling Ball'};});
 return {update(context,room){
   const visible=room==='maze'&&shouldShowObjective({...context,session:true});root.hidden=!visible;if(!visible)return;
   const state=mazeObjective(items);if(title.textContent!==state.title)title.textContent=state.title;
   const text=`Objects found: ${state.count}/${MAZE_FINDABLES.length}`;if(count.textContent!==text)count.textContent=text;
   list.hidden=items.hasAllRequired();
   rows.forEach(({row,item,number,label})=>{const found=items.hasCollected(item.id),text=`${number}. ${label}${found?' (found)':''}`;if(row.textContent!==text)row.textContent=text;row.classList.toggle('collected',found);});
 },hide(){root.hidden=true;}};
}
