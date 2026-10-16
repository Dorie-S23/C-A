/** One run's optional tips. No timers, input listeners or room resources. */
export function createControlsTutorial() {
  let unlocked, complete, dismissed, distance, look, run, interacted;
  const reset = () => {
    unlocked = complete = dismissed = interacted = false;
    distance = look = run = 0;
  };
  reset();
  const active = () => unlocked && !complete && !dismissed;
  return {
    reset,
    unlock() { unlocked = true; },
    enterRoom(room) { if (unlocked && room === 'dorm') complete = true; },
    dismiss() { if (active()) dismissed = true; },
    // Call only for accepted gameplay input, never cinematic/root motion.
    move(metres, sprinting) {
      if (!active() || !Number.isFinite(metres) || metres <= 0) return;
      const basicsLearned = distance >= .4 && look >= .12;
      distance += metres;
      if (basicsLearned && sprinting) run += metres;
    },
    look(radians) {
      if (active() && Number.isFinite(radians)) look += Math.abs(radians);
    },
    interact() { if (active()) interacted = true; },
    hints(nearDoor = false) {
      if (!active()) return [];
      if (nearDoor && !interacted) return ['interact'];
      const basics = [];
      if (distance < .4) basics.push('move');
      if (look < .12) basics.push('look');
      return basics.length ? basics : run < .4 ? ['run'] : [];
    },
    get state() {
      return { unlocked, complete, dismissed, moved: distance >= .4,
        looked: look >= .12, ran: run >= .4, interacted };
    },
  };
}
