import { MAZE_HINT_OBJECTS, createMazeHintProgress } from '../state/mazeHints.js';
import { renderMazeHintMap, renderMazeHintLegend } from './mazeHintMap.js';

/**
 * The maze's hints. Each use (H) takes the next one straight away, no
 * screen in between: the first, the map, opens this panel showing it and
 * how many hints are left; the others, beams, don't open it at all
 * (useBeam, from main.js, which fires the beam). Once they're all used, H
 * shows the map again.
 */
export function createMazeHints({button,reminder,panel,onOpen,onClose,onChange,onTrail=()=>{},nextPortrait=()=>null,hasCollected=()=>false,getPlayerPosition=()=>null,getPlayerFacing=()=>0,getJaxPosition=()=>null}) {
  const progress=createMazeHintProgress();
  const text=panel.querySelector('[data-hint-text]'),next=panel.querySelector('[data-next-hint]');
  const portrait=panel.querySelector('[data-caine-portrait]');
  const map=panel.querySelector('[data-maze-map]'),drawing=panel.querySelector('[data-map-drawing]'),legend=panel.querySelector('[data-map-legend]');
  const count=panel.querySelector('[data-hints-count]'),back=panel.querySelector('[data-close-hints]'),tutorial=document.getElementById('tutorial-hud');
  let room=null,previewMap=false,currentHint=null,viewing=null;
  next.hidden=true; // nothing to choose: opening it is using it
  const missing=()=>MAZE_HINT_OBJECTS.filter(item=>!hasCollected(item.id)).map(item=>item.id);
  function renderMap(kind) {
    const data=renderMazeHintMap(drawing,room,{mode:kind==='jax'?'jax':kind==='map'?'map':'objects',missingItems:missing(),playerPosition:getPlayerPosition(),playerFacing:getPlayerFacing(),jaxPosition:getJaxPosition()});
    renderMazeHintLegend(legend,data);
  }
  function render() {
    const planned=progress.next,showMap=previewMap||Boolean(viewing)||(Boolean(currentHint)&&currentHint.kind!=='trail');
    count.textContent=progress.remaining+(progress.remaining===1?' hint left':' hints left');
    next.hidden=true;
    text.hidden=!currentHint&&!previewMap&&!viewing&&Boolean(planned);
    text.textContent=currentHint?.text ?? (viewing?progress.mapText
      :previewMap?'P marks where you are. The other markers show the objects you still need.':'You have used all the hints for this search.');
    portrait.hidden=!currentHint;
    map.hidden=!showMap;panel.classList.toggle('maze-hints--map',Boolean(showMap));
    panel.classList.toggle('maze-hints--revealed',Boolean(currentHint));
    if(!showMap){drawing.replaceChildren();legend.replaceChildren();}
  }
  function close(notify=true) {
    if(!panel.open)return;
    panel.close();room=null;currentHint=null;previewMap=false;viewing=null;drawing.replaceChildren();legend.replaceChildren();button.setAttribute('aria-expanded','false');
    if(notify)onClose();
  }
  button.addEventListener('click',event=>{event.stopPropagation();onOpen();});
  back.addEventListener('click',()=>close());
  panel.addEventListener('cancel',event=>{event.preventDefault();close();});
  window.addEventListener('keydown',event=>{
    if(!panel.open)return;
    if(event.code==='Escape'){event.preventDefault();close();}
    else if(event.code==='KeyH'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();close();}
    if(event.code!=='Tab')event.stopImmediatePropagation();
  },true);
  window.addEventListener('keyup',event=>{if(panel.open&&event.code!=='Tab')event.stopImmediatePropagation();},true);
  return {
    get isOpen(){return panel.open;},
    /** The next hint is a beam (so main.js fires it rather than opening this). */
    get nextIsBeam(){return progress.next?.kind==='trail';},
    get remaining(){return progress.remaining;},
    /** Uses up the next hint, a beam; onTrail fires it. */
    useBeam(){
      if(progress.next?.kind!=='trail')return false;
      progress.reveal();onTrail();onChange();return true;
    },
    /** Opens on the map: using up the map hint the first time, after that just looking again. */
    open(value,{previewMap:preview=false}={}) {
      if(panel.open)return false;
      room=value;previewMap=preview;currentHint=null;viewing=null;
      if(!preview&&progress.next?.kind==='map'){
        currentHint=progress.reveal();
        portrait.src=nextPortrait() ?? '';portrait.alt='Caine';
        onChange();
      } else if(!preview&&progress.map) viewing=progress.map;
      render();
      if(previewMap)renderMap('objects');else if(currentHint||viewing)renderMap('map');
      button.setAttribute('aria-expanded','true');panel.showModal();back.focus();return true;
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
