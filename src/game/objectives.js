export const OBJECTIVES = Object.freeze({
  'find-caine': Object.freeze({ id: 'find-caine', title: 'Find Caine', detail: 'Look for him in the Dorm Hall.' }),
  // Caine's completed warning activates this; it does not start Ribbit's encounter.
  'find-ribbit': Object.freeze({ id: 'find-ribbit', title: 'Find Ribbit', detail: '' }),
  // Level 1 finishing activates this (see level1.js); Kaufmo's hallway
  // scene playing through completes it (see level2.js).
  'find-kaufmo': Object.freeze({ id: 'find-kaufmo', title: 'Find Kaufmo', detail: '' }),
  // Handing in the 3rd photo activates this (the stall line plays once,
  // then nothing signals there's more); talking to him again, hearing
  // the actual payoff, completes it. See kaufmoRoom.js.
  'kaufmo-theory': Object.freeze({
    id: 'kaufmo-theory', title: "Hear Kaufmo's Theory", detail: 'Give him a minute, then go back.',
  }),
});

/** Session state, independent of room loads, rendering and dialogue previews. */
export function createObjectiveController(definitions = OBJECTIVES) {
  let active = null;
  const completed = new Set(), listeners = new Set();
  const notify = () => listeners.forEach(listener => listener(active));
  return {
    get active() { return active; },
    isComplete(id) { return completed.has(id); },
    activate(id) {
      if (!Object.hasOwn(definitions, id)) throw new Error(`Unknown objective: ${id}`);
      if (active?.id === id || completed.has(id)) return false;
      active = Object.freeze({ ...definitions[id], id }); notify(); return true;
    },
    complete(id = active?.id) {
      if (!active || active.id !== id) return false;
      completed.add(id); active = null; notify(); return true;
    },
    reset() {
      active = null; completed.clear(); notify();
    },
    subscribe(listener) {
      listeners.add(listener); listener(active);
      return () => listeners.delete(listener);
    },
  };
}
