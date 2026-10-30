import { PHOTO_THRESHOLD } from '../state/level2Items.js';

export function wayOutVariantForJaxFate(fate) {
  if (fate === 'saved') return 'saved';
  if (fate === 'abstracted') return 'bittersweet';
  return null;
}

/** Story milestones survive room loads; previews never complete them. */
export function createStoryProgress({ objectives, isStorySession }) {
  let ribbitPoints = null;
  let hallwaySeen = false;
  let kaufmoIntroduced = false;
  let level3Complete = false;
  let jaxFate = null;
  let endingVariant = null;
  return {
    get ribbitComplete() { return isStorySession() && objectives.isComplete('find-ribbit'); },
    get ribbitPoints() { return ribbitPoints; },
    get hallwayPending() { return this.ribbitComplete && !hallwaySeen && !kaufmoIntroduced; },
    get kaufmoIntroduced() { return kaufmoIntroduced; },
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
    get level3Complete() { return level3Complete; },
    get jaxFate() { return jaxFate; },
    get endingVariant() { return endingVariant; },
    finishLevel3(fate) {
      const variant = wayOutVariantForJaxFate(fate);
      if (!isStorySession() || level3Complete || !variant) return false;
      level3Complete = true;
      jaxFate = fate;
      endingVariant = variant;
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
    reset() {
      ribbitPoints = null; hallwaySeen = false; kaufmoIntroduced = false;
      level3Complete = false; jaxFate = null; endingVariant = null;
    },
    snapshot() {
      return { ribbitPoints, hallwaySeen, kaufmoIntroduced, level3Complete, jaxFate, endingVariant };
    },
    restore(saved = {}) {
      ribbitPoints = saved.ribbitPoints ?? null;
      hallwaySeen = Boolean(saved.hallwaySeen);
      kaufmoIntroduced = Boolean(saved.kaufmoIntroduced);
      level3Complete = Boolean(saved.level3Complete);
      jaxFate = wayOutVariantForJaxFate(saved.jaxFate) ? saved.jaxFate : null;
      endingVariant = level3Complete ? wayOutVariantForJaxFate(jaxFate) : null;
    },
  };
}
