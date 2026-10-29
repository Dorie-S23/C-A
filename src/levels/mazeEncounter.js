/** The dialogue lifecycle is separate from the broad legacy found-Jax box. */
export function createMazeEncounter({items,playDialogue,onEngage=()=>{},onRelease=()=>{}}){
  let active=false,rearm=true,resumeAt,disposed=false,generation=0;
  return {
    get active(){return active;},
    get armed(){return rearm;},
    get resumeAt(){return resumeAt;},
    update({inRange,visible,eligible}){
      if(!inRange)rearm=true;
      if(disposed||active||!rearm||!eligible||!inRange||!visible||!items.hasAllRequired()||items.jaxComplete)return false;
      active=true;rearm=false;const own=++generation;onEngage();
      const release=()=>{active=false;onRelease();};
      const started=playDialogue({startAt:resumeAt,onNode(node){if(own===generation&&node.id)resumeAt=node.id;},
        onComplete(){if(disposed||own!==generation||!active)return;generation++;release();resumeAt=undefined;items.completeJax();},
        onCancel(){if(disposed||own!==generation||!active)return;generation++;release();},
      });
      if(!started){generation++;release();rearm=true;}
      return Boolean(started);
    },
    dispose(){disposed=true;generation++;if(active){active=false;onRelease();}},
  };
}
