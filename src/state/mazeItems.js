/** Level 3 keepsakes and encounter checkpoint; independent of Escape Threshold. */
export const MAZE_FINDABLES = [
  { id: 'bowling-ball', label: 'bowling ball' },
  { id: 'hot-chocolate-mug', label: 'mug of hot chocolate' },
];
const validSeed=value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;
export function createMazeItems({ onCollect=()=>{}, onChange=()=>{} }={}) {
  const collected=new Set();let seed=null,jaxComplete=false;
  const hasAllRequired=()=>MAZE_FINDABLES.every(item=>collected.has(item.id));
  return {
    hasCollected:id=>collected.has(id),
    hasAllRequired,
    totalFound:()=>collected.size,
    get seed(){return seed;},
    get jaxComplete(){return jaxComplete;},
    ensureSeed(preferred){
      if(seed===null){seed=validSeed(preferred)?preferred:Math.floor(Math.random()*0x100000000);onChange();}
      return seed;
    },
    collect(id){
      if(!MAZE_FINDABLES.some(item=>item.id===id)||collected.has(id))return false;
      collected.add(id);onCollect(id,collected.size,MAZE_FINDABLES.length);onChange();return true;
    },
    completeJax(){if(!hasAllRequired()||jaxComplete)return false;jaxComplete=true;onChange();return true;},
    snapshot(){return {collected:MAZE_FINDABLES.filter(item=>collected.has(item.id)).map(item=>item.id),seed,jaxComplete};},
    restore(saved={}){
      collected.clear();
      for(const id of Array.isArray(saved?.collected)?saved.collected:[])if(MAZE_FINDABLES.some(item=>item.id===id))collected.add(id);
      seed=validSeed(saved?.seed)?saved.seed:null;jaxComplete=Boolean(saved?.jaxComplete)&&hasAllRequired();onChange();
    },
    reset(){collected.clear();seed=null;jaxComplete=false;onChange();},
  };
}
export function mazeObjective(items){
  return {title:items.jaxComplete?'Reach the exit':items.hasAllRequired()?'Find Jax':"Find Jax's missing objects",count:MAZE_FINDABLES.filter(item=>items.hasCollected(item.id)).length,complete:items.jaxComplete};
}

export const MAZE_SEARCH_SECONDS = 300;

/** Per-attempt gameplay clock; reaching Jax is not a Level 3 completion. */
export function createMazeSearch() {
  let timeLeft = null;
  let status = 'idle';
  return {
    get timeLeft() { return timeLeft; },
    get status() { return status; },
    start() { timeLeft = MAZE_SEARCH_SECONDS; status = 'searching'; },
    clear() { timeLeft = null; status = 'idle'; },
    tick(deltaSeconds, { playable = false, allItems = false, atJax = false } = {}) {
      if (!playable || status !== 'searching') return null;
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Maze clock delta must be finite and nonnegative.');
      if (allItems && atJax) { status = 'reached'; return 'reached'; }
      timeLeft = Math.max(0, timeLeft - deltaSeconds);
      if (timeLeft === 0) { status = 'expired'; return 'expired'; }
      return null;
    },
  };
}
