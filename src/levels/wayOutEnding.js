/**
 * One room-scoped Way Out sequence. The generation guard is shared by
 * dialogue, audio, animation and room-loading callbacks owned by the scene.
 */
export function createWayOutEnding({
  variant,
  isLive = () => true,
  play,
  update,
  cleanup,
  onStart,
  onComplete,
  onError,
}) {
  let phase = 'idle';
  let generation = 0;
  let starts = 0;
  let context = null;
  let cleaned = false;

  const current = ticket => phase === 'playing' && ticket === generation && isLive();
  const guard = (ticket, callback) => (...args) => {
    if (!current(ticket)) return undefined;
    return callback(...args);
  };

  function stop(nextPhase) {
    if (cleaned) return;
    cleaned = true;
    phase = nextPhase;
    generation++;
    context = null;
    cleanup?.();
  }

  return {
    get phase() { return phase; },
    get diagnostics() {
      return Object.freeze({ variant, phase, starts, generation });
    },

    start() {
      if (phase !== 'idle' || typeof play !== 'function') return Promise.resolve(false);
      phase = 'playing';
      starts++;
      const ticket = ++generation;
      context = {
        isCurrent: () => current(ticket),
        guard: callback => guard(ticket, callback),
      };
      return Promise.resolve()
        .then(() => {
          if (!current(ticket)) return false;
          onStart?.(context);
          if (!current(ticket)) return false;
          return play(context);
        })
        .then(result => {
          if (!current(ticket)) return false;
          if (result === false) {
            stop('cancelled');
            return false;
          }
          phase = 'complete';
          context = null;
          onComplete?.();
          return true;
        })
        .catch(error => {
          if (!current(ticket)) return false;
          stop('failed');
          onError?.(error);
          return false;
        });
    },

    update(deltaSeconds) {
      if (context?.isCurrent()) update?.(deltaSeconds, context);
    },

    cancel() {
      if (phase === 'cancelled') return false;
      stop('cancelled');
      return true;
    },
  };
}
