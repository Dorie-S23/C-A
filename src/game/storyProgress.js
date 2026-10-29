import { PHOTO_THRESHOLD } from '../state/level2Items.js';

/** How Level 3 can end for Jax; the ending plays the matching variant. */
export const ENDING_VARIANTS = ['saved', 'abstracted'];

/** Story milestones survive room loads; previews never complete them. */
export function createStoryProgress({ objectives, isStorySession }) {
  let ribbitPoints = null;
  let hallwaySeen = false;
  let kaufmoIntroduced = false;
  let ending = null; // set once Pomni leaves the maze (see ENDING_VARIANTS)
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
    /** Pomni has left the maze; `variant` is how it went for Jax. Once per run. */
    finishLevel3(variant) {
      if (!isStorySession() || ending !== null || !ENDING_VARIANTS.includes(variant)) return false;
      ending = variant;
      return true;
    },
    reset() { ribbitPoints = null; hallwaySeen = false; kaufmoIntroduced = false; ending = null; },
    snapshot() { return { ribbitPoints, hallwaySeen, kaufmoIntroduced, ending }; },
    restore(saved = {}) {
      ribbitPoints = saved.ribbitPoints ?? null;
      hallwaySeen = Boolean(saved.hallwaySeen);
      kaufmoIntroduced = Boolean(saved.kaufmoIntroduced);
      ending = ENDING_VARIANTS.includes(saved.ending) ? saved.ending : null;
    },
  };
}
