import { MAZE_HINT_OBJECTS, createMazeHintProgress } from '../state/mazeHints.js';
import { renderMazeHintMap, renderMazeHintLegend } from './mazeHintMap.js';

export function createMazeHints({button,reminder,panel,onOpen,onClose,onChange,hasCollected=()=>false,getPlayerPosition=()=>null,getPlayerFacing=()=>0}) {
  const progress=createMazeHintProgress({hasCollected});
  const text=panel.querySelector('[data-hint-text]'),next=panel.querySelector('[data-next-hint]');
  const map=panel.querySelector('[data-maze-map]'),drawing=panel.querySelector('[data-map-drawing]'),legend=panel.querySelector('[data-map-legend]');
  const count=panel.querySelector('[data-hints-count]'),back=panel.querySelector('[data-close-hints]'),tutorial=document.getElementById('tutorial-hud');
  let room=null,previewMap=false,currentHint=null;
  const missing=()=>MAZE_HINT_OBJECTS.filter(item=>!hasCollected(item.id)).map(item=>item.id);
  function renderMap(kind) {
    const data=renderMazeHintMap(drawing,room,{mode:kind==='jax'?'jax':'objects',missingItems:missing(),playerPosition:getPlayerPosition(),playerFacing:getPlayerFacing()});
    renderMazeHintLegend(legend,data);
  }
  function render() {
    const planned=progress.next,showMap=previewMap||Boolean(currentHint);
    count.textContent=progress.remaining+(progress.remaining===1?' hint left':' hints left');
    next.hidden=Boolean(currentHint)||previewMap||!planned;
    next.disabled=!planned;
    next.textContent=planned?'Reveal Hint '+planned.number:'Reveal Hint';
    text.hidden=!currentHint&&!previewMap&&Boolean(planned);
    text.textContent=currentHint?.text ?? (previewMap?'P marks where you are. The other markers show the objects you still need.':'You have used all the hints for this search.');
    map.hidden=!showMap;panel.classList.toggle('maze-hints--map',Boolean(showMap));
    if(!showMap){drawing.replaceChildren();legend.replaceChildren();}
  }
  function requestNext() {
    currentHint=null;previewMap=false;render();(next.hidden?back:next).focus();
  }
  function close(notify=true) {
    if(!panel.open)return;
    panel.close();room=null;currentHint=null;previewMap=false;drawing.replaceChildren();legend.replaceChildren();button.setAttribute('aria-expanded','false');
    if(notify)onClose();
  }
  button.addEventListener('click',event=>{event.stopPropagation();onOpen();});
  back.addEventListener('click',()=>close());
  panel.addEventListener('cancel',event=>{event.preventDefault();close();});
  next.addEventListener('click',()=>{
    if(!room||currentHint||previewMap)return;
    const hint=progress.reveal();if(!hint)return;
    currentHint=hint;render();renderMap(hint.kind);onChange();back.focus();
  });
  window.addEventListener('keydown',event=>{
    if(!panel.open)return;
    if(event.code==='Escape'){event.preventDefault();close();}
    else if(event.code==='KeyH'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();requestNext();}
    if(event.code!=='Tab')event.stopImmediatePropagation();
  },true);
  window.addEventListener('keyup',event=>{if(panel.open&&event.code!=='Tab')event.stopImmediatePropagation();},true);
  return {
    get isOpen(){return panel.open;},
    open(value,{previewMap:preview=false}={}) {
      if(panel.open)return false;
      room=value;previewMap=preview;currentHint=null;render();if(previewMap)renderMap('objects');
      button.setAttribute('aria-expanded','true');panel.showModal();(next.hidden?back:next).focus();return true;
    },
    update(available,playable){
      button.hidden=!available||playable||panel.open;reminder.hidden=!playable||panel.open;
      if(playable)reminder.style.bottom=tutorial&&!tutorial.hidden?Math.max(16,innerHeight-tutorial.getBoundingClientRect().top+12)+'px':'';
    },
    hide(){close(false);button.hidden=reminder.hidden=true;},
    snapshot:()=>progress.snapshot(),
    restore(value){close(false);progress.restore(value);},
    reset(){close(false);progress.reset();button.hidden=reminder.hidden=true;},
  };
}
