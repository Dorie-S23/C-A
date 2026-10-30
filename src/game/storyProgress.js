import { PHOTO_THRESHOLD } from '../state/level2Items.js';

export function wayOutVariantForJaxFate(fate) {
  if (fate === 'saved') return 'saved';
  if (fate === 'abstracted') return 'bittersweet';
  return null;
}

/**
 * How the game can end; the ending plays the matching variant. 'saved':
 * Jax comes out and everyone leaves. 'abstracted': Jax is lost, the rest
 * leave. 'trapped': Jax is lost and the door won't open (endingFor in
 * escapeThreshold.js picks).
 */
export const ENDING_VARIANTS = ['saved', 'abstracted', 'trapped'];
const JAX_FATES = ['saved', 'abstracted'];
/** What happened to Jax in an ending: he's lost in both sad ones. */
const jaxFateOf = (ending) => (ending === 'trapped' ? 'abstracted' : ending);

/** Story milestones survive room loads; previews never complete them. */
export function createStoryProgress({ objectives, isStorySession }) {
  let ribbitPoints = null;
  let hallwaySeen = false;
  let kaufmoIntroduced = false;
  let ending = null; // set once Pomni leaves the maze (see ENDING_VARIANTS)
  let jaxFate = null;
  return {
    get ribbitComplete() { return isStorySession() && objectives.isComplete('find-ribbit'); },
    get ribbitPoints() { return ribbitPoints; },
    get hallwayPending() { return this.ribbitComplete && !hallwaySeen && !kaufmoIntroduced; },
    get kaufmoIntroduced() { return kaufmoIntroduced; },
    get level3Complete() { return ending !== null; },
    get ending() { return ending; },
    finishRibbit(points) {
      if (!isStorySession() || objectives.active?.id !== 'find-ribbit') return false;
      ribbitPoints = points;
      objectives.complete('find-ribbit');
      objectives.activate('find-kaufmo');
      return true;
    },
    finishHallway() {
      if (!this.hallwayPending) return false;
      hallwaySeen = true;
      return true;
    },
    finishKaufmoIntro() {
      if (!isStorySession() || objectives.active?.id !== 'find-kaufmo') return false;
      kaufmoIntroduced = true;
      hallwaySeen = true;
      objectives.complete('find-kaufmo');
      objectives.activate('collect-photos');
      return true;
    },
    presentedPhotos(count) {
      if (!isStorySession() || !kaufmoIntroduced || count < PHOTO_THRESHOLD) return;
      if (objectives.complete('collect-photos')) objectives.activate('check-kaufmo');
    },
    // Level 3's way in: once Kaufmo has his pieces, Pomni steps out into the
    // Dorm Hall as Jax bolts through it (Ribbit goes for the others), finds
    // him in the Lobby, and after their talk finds the door he ran through.
    get findingJax() { return isStorySession() && objectives.active?.id === 'find-jax'; },
    get chasingJax() { return isStorySession() && objectives.active?.id === 'follow-jax'; },
    get mazeOpen() {
      return isStorySession() && (objectives.active?.id === 'enter-maze' || objectives.isComplete('enter-maze'));
    },
    finishLevel2() {
      if (!isStorySession() || !objectives.complete('check-kaufmo')) return false;
      objectives.activate('find-jax');
      return true;
    },
    sawJaxBolt() {
      if (!isStorySession() || !objectives.complete('find-jax')) return false;
      objectives.activate('follow-jax');
      return true;
    },
    caughtUpWithJax() {
      if (!isStorySession() || !objectives.complete('follow-jax')) return false;
      objectives.activate('enter-maze');
      return true;
    },
    enteredMaze() {
      return isStorySession() && objectives.complete('enter-maze');
    },
    get jaxFate() { return jaxFate; },
    /** The room-scoped variant ('saved' or 'bittersweet') that matches `ending`. */
    get endingVariant() { return ending ? wayOutVariantForJaxFate(jaxFate) : null; },
    /** Pomni has left the maze; `outcome` is the ending it led to (ENDING_VARIANTS). Once per run. */
    finishLevel3(outcome) {
      if (!isStorySession() || ending !== null || !ENDING_VARIANTS.includes(outcome)) return false;
      ending = outcome;
      jaxFate = jaxFateOf(outcome);
      objectives.complete('enter-maze');
      return true;
    },
    /** Back to the start of Level 2 (Ribbit done, Kaufmo yet to hurry past), Level 1 kept. */
    restartLevel2() {
      if (!this.ribbitComplete) return false;
      hallwaySeen = false;
      kaufmoIntroduced = false;
      const { completed } = objectives.snapshot();
      objectives.restore({
        active: 'find-kaufmo',
        completed: completed.filter(id => !['find-kaufmo', 'collect-photos', 'check-kaufmo'].includes(id)),
      });
      return true;
    },
    reset() { ribbitPoints = null; hallwaySeen = false; kaufmoIntroduced = false; ending = null; jaxFate = null; },
    snapshot() { return { ribbitPoints, hallwaySeen, kaufmoIntroduced, ending, jaxFate }; },
    restore(saved = {}) {
      ribbitPoints = saved.ribbitPoints ?? null;
      hallwaySeen = Boolean(saved.hallwaySeen);
      kaufmoIntroduced = Boolean(saved.kaufmoIntroduced);
      // Older dev/Tjeding saves recorded level3Complete + jaxFate instead of `ending`.
      ending = ENDING_VARIANTS.includes(saved.ending) ? saved.ending
        : saved.level3Complete && JAX_FATES.includes(saved.jaxFate) ? saved.jaxFate : null;
      jaxFate = JAX_FATES.includes(saved.jaxFate) ? saved.jaxFate : jaxFateOf(ending);
    },
  };
}
