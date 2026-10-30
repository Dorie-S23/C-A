/**
 * The dialogue lifecycle is separate from the broad legacy found-Jax box.
 * It starts only when she asks to talk (E: `requested`), close enough to
 * see him; walking away and back isn't needed to try again. The keepsakes
 * aren't needed. Finishing it records `outcome()` (whether he abstracts).
 */
export function createMazeEncounter({items,playDialogue,outcome=()=>null,onEngage=()=>{},onRelease=()=>{}}){
  let active=false,resumeAt,disposed=false,generation=0;
  return {
    get active(){return active;},
    get resumeAt(){return resumeAt;},
    update({inRange,visible,eligible,requested=false}){
      if(disposed||active||!requested||!eligible||!inRange||!visible||items.jaxComplete)return false;
      active=true;const own=++generation;onEngage();
      const release=()=>{active=false;onRelease();};
      const started=playDialogue({startAt:resumeAt,onNode(node){if(own===generation&&node.id)resumeAt=node.id;},
        // Completed before release, so onRelease can tell a finished talk from a cancelled one.
        onComplete(){if(disposed||own!==generation||!active)return;generation++;resumeAt=undefined;items.completeJax(outcome());release();},
        onCancel(){if(disposed||own!==generation||!active)return;generation++;release();},
      });
      if(!started){generation++;release();}
      return Boolean(started);
    },
    dispose(){disposed=true;generation++;if(active){active=false;onRelease();}},
  };
}
