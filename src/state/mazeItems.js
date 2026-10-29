export const MAZE_FINDABLES=[{id:'bowling-ball',label:'bowling ball'},{id:'hot-chocolate-mug',label:'mug of hot chocolate'}];
export function createMazeItems({onCollect=()=>{},onChange=()=>{}}={}){
 const collected=new Set();let jaxComplete=false;
 const hasAllRequired=()=>MAZE_FINDABLES.every(item=>collected.has(item.id));
 return {hasCollected:id=>collected.has(id),hasAllRequired,get jaxComplete(){return jaxComplete;},totalFound:()=>collected.size,
 collect(id){if(!MAZE_FINDABLES.some(item=>item.id===id)||collected.has(id))return false;collected.add(id);onCollect(id,collected.size,MAZE_FINDABLES.length);onChange();return true;},
 completeJax(){if(!hasAllRequired()||jaxComplete)return false;jaxComplete=true;onChange();return true;},
 reset(){collected.clear();jaxComplete=false;onChange();}};
}
export const MAZE_SEARCH_SECONDS = 180;

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
