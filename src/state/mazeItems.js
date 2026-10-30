/**
 * Level 3's keepsakes, its score and the encounter checkpoint. The bowling
 * ball and the hot chocolate are optional: each found is a point towards
 * the Level 3 score (with the final conversation's choices, choicePoints),
 * and nothing requires them. main.js feeds score into the Escape Threshold;
 * jaxOutcome is what that total decided when the talk ended.
 */
export const MAZE_FINDABLES = [
  { id: 'bowling-ball', label: 'bowling ball' },
  { id: 'hot-chocolate-mug', label: 'mug of hot chocolate' },
];
export const MAZE_ITEM_POINTS = 1; // each keepsake, whichever and however many
const OUTCOMES = ['stays', 'abstracts'];
const validSeed=value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;
export function createMazeItems({ onCollect=()=>{}, onChange=()=>{} }={}) {
  const collected=new Set();let seed=null,jaxComplete=false,choicePoints=0,jaxOutcome=null;
  const hasAllRequired=()=>MAZE_FINDABLES.every(item=>collected.has(item.id));
  return {
    hasCollected:id=>collected.has(id),
    /** Both keepsakes found (a full score's worth; never a requirement). */
    hasAllRequired,
    totalFound:()=>collected.size,
    get seed(){return seed;},
    get jaxComplete(){return jaxComplete;},
    get choicePoints(){return choicePoints;},
    get jaxOutcome(){return jaxOutcome;},
    /** Level 3's points: the keepsakes found and the conversation's choices. */
    get score(){return collected.size*MAZE_ITEM_POINTS+choicePoints;},
    ensureSeed(preferred){
      if(seed===null){seed=validSeed(preferred)?preferred:Math.floor(Math.random()*0x100000000);onChange();}
      return seed;
    },
    collect(id){
      if(!MAZE_FINDABLES.some(item=>item.id===id)||collected.has(id))return false;
      collected.add(id);onCollect(id,collected.size,MAZE_FINDABLES.length);onChange();return true;
    },
    /** The final conversation's choice points (replacing any from an earlier try at it). */
    setChoicePoints(points){
      const next=Number.isFinite(points)?Math.max(0,points):0;
      if(next===choicePoints)return;choicePoints=next;onChange();
    },
    /** The talk with Jax is over, and the total decided this (`stays` / `abstracts`). */
    completeJax(outcome=null){
      if(jaxComplete)return false;
      jaxComplete=true;jaxOutcome=OUTCOMES.includes(outcome)?outcome:null;onChange();return true;
    },
    snapshot(){return {collected:MAZE_FINDABLES.filter(item=>collected.has(item.id)).map(item=>item.id),seed,jaxComplete,choicePoints,jaxOutcome};},
    restore(saved={}){
      collected.clear();
      for(const id of Array.isArray(saved?.collected)?saved.collected:[])if(MAZE_FINDABLES.some(item=>item.id===id))collected.add(id);
      seed=validSeed(saved?.seed)?saved.seed:null;jaxComplete=Boolean(saved?.jaxComplete);
      choicePoints=Number.isFinite(saved?.choicePoints)?Math.max(0,saved.choicePoints):0;
      jaxOutcome=jaxComplete&&OUTCOMES.includes(saved?.jaxOutcome)?saved.jaxOutcome:null;onChange();
    },
    reset(){collected.clear();seed=null;jaxComplete=false;choicePoints=0;jaxOutcome=null;onChange();},
  };
}
/**
 * On screen: "Find Jax", then "Follow Jax" once he's run from her
 * (`jaxFled`). The keepsakes are never asked for, and there's no exit to
 * reach: talking to him ends the level.
 */
export function mazeObjective(items,{jaxFled=false}={}){
  return {title:jaxFled?'Follow Jax':'Find Jax',complete:items.jaxComplete};
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
    // Reaching him stops the clock, keepsakes or not.
    tick(deltaSeconds, { playable = false, atJax = false } = {}) {
      if (!playable || status !== 'searching') return null;
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Maze clock delta must be finite and nonnegative.');
      if (atJax) { status = 'reached'; return 'reached'; }
      timeLeft = Math.max(0, timeLeft - deltaSeconds);
      if (timeLeft === 0) { status = 'expired'; return 'expired'; }
      return null;
    },
  };
}
