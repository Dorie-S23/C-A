/** Pure visibility policy is also used by lifecycle tests. */
export function shouldShowObjective({ session, room, ready, locked, paused, cinematic, dialogue, menu }) {
  return Boolean(session && room && ready && locked && !paused && !cinematic && !dialogue && !menu);
}

export function createObjectiveHUD({ objectives, root }) {
  const title = root.querySelector('[data-objective-title]');
  const detail = root.querySelector('[data-objective-detail]');
  let gameplayVisible = false;
  const unsubscribe = objectives.subscribe(objective => {
    title.textContent = objective?.title ?? '';
    detail.textContent = objective?.detail ?? '';
    detail.hidden = !objective?.detail;
    root.hidden = !gameplayVisible || !objective;
  });
  return {
    update(context, minimapVisible = false) {
      gameplayVisible = shouldShowObjective(context);
      root.hidden = !gameplayVisible || !objectives.active;
      root.classList.toggle('objective-hud--with-minimap', minimapVisible);
    },
    hide() { gameplayVisible = false; root.hidden = true; },
    dispose() { unsubscribe(); root.hidden = true; },
  };
}
