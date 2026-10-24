export const OBJECTIVES = Object.freeze({
  'find-caine': Object.freeze({ id: 'find-caine', title: 'Find Caine', detail: 'Look for him in the Dorm Hall.' }),
  'find-ribbit': Object.freeze({ id: 'find-ribbit', title: 'Find Ribbit', detail: 'Knock on her door at the far end of the hall, on the left.' }),
  'find-kaufmo': Object.freeze({ id: 'find-kaufmo', title: 'Find Kaufmo', detail: 'His room is a few doors down the hall — go find him there.' }),
  'collect-photos': Object.freeze({ id: 'collect-photos', title: 'Find and deliver the photos', detail: 'Find five office photos in the Lobby and give them to Kaufmo before time runs out.' }),
  'check-kaufmo': Object.freeze({ id: 'check-kaufmo', title: 'Hear Kaufmo’s Theory', detail: 'Talk to him again about what the photos reveal.' }),
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
    /** For a save: plain ids only. */
    snapshot() {
      return { active: active?.id ?? null, completed: [...completed] };
    },
    /** From a save; unknown ids (an objective since removed) are dropped. */
    restore({ active: activeId = null, completed: done = [] } = {}) {
      completed.clear();
      for (const id of done) if (Object.hasOwn(definitions, id)) completed.add(id);
      active = activeId && Object.hasOwn(definitions, activeId) && !completed.has(activeId)
        ? Object.freeze({ ...definitions[activeId], id: activeId }) : null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener); listener(active);
      return () => listeners.delete(listener);
    },
  };
}
