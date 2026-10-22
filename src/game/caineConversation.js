/** Mission progression only; rendering, dialogue UI and room ownership stay external. */
export function createCaineConversation({ objectives, isStorySession, playDialogue, showHint }) {
  let busy = false, generation = 0;
  const controller = {
    get busy() { return busy; },
    get enabled() {
      return !objectives.isComplete('find-caine') && objectives.active?.id !== 'find-ribbit';
    },
    talk(lookAt, isCurrent = () => true) {
      if (busy || !controller.enabled || !isCurrent()) return false;
      if (!isStorySession() || objectives.active?.id !== 'find-caine') {
        showHint?.('Speak with Ragatha in Pomni\'s room first. Press T there if you interrupted her conversation.', 7000);
        return false;
      }
      busy = true;
      const token = ++generation;
      const finish = success => {
        if (!busy || token !== generation) return;
        busy = false;
        if (!success || !isCurrent() || !isStorySession() || objectives.active?.id !== 'find-caine') return;
        objectives.complete('find-caine');
        objectives.activate('find-ribbit');
      };
      try {
        const started = playDialogue('level1Open', {
          lookAt, onComplete: () => finish(true), onCancel: () => finish(false),
        });
        if (started === false) { finish(false); return false; }
        return true;
      } catch (error) { finish(false); throw error; }
    },
    cancelPending() { generation++; busy = false; },
  };
  return controller;
}
