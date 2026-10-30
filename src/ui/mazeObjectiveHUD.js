import {shouldShowObjective} from './objectiveHUD.js';
import {mazeObjective} from '../state/mazeItems.js';
/** Only ever "Follow Jax" (then the exit): no keepsake count or checklist, as nothing asks for them. */
export function createMazeObjectiveHUD({root,items}){
 const title=root.querySelector('[data-maze-title]'),count=root.querySelector('[data-maze-count]'),list=root.querySelector('[data-maze-checklist]');
 if(count)count.hidden=true;if(list)list.hidden=true;
 return {update(context,room){
   const visible=room==='maze'&&shouldShowObjective({...context,session:true});root.hidden=!visible;if(!visible)return;
   const state=mazeObjective(items);if(title.textContent!==state.title)title.textContent=state.title;
 },hide(){root.hidden=true;}};
}
