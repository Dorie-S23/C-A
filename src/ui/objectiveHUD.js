/** Pure visibility policy is also used by lifecycle tests. */
export function shouldShowObjective({ session, room, ready, locked, paused, cinematic, dialogue, menu }) {
  return Boolean(session && room && ready && locked && !paused && !cinematic && !dialogue && !menu);
}

export function createObjectiveHUD({ objectives, root }) {
  const title = root.querySelector('[data-objective-title]');
  const detail = root.querySelector('[data-objective-detail]');
  let gameplayVisible = false;
  const render = objective => {
    if (title.textContent !== (objective?.title ?? '')) title.textContent = objective?.title ?? '';
    if (detail.textContent !== (objective?.detail ?? '')) detail.textContent = objective?.detail ?? '';
    detail.hidden = !objective?.detail;
  };
  const unsubscribe = objectives.subscribe(objective => {
    render(objective);
    root.hidden = !gameplayVisible || !objective;
  });
  return {
    // A presentation override changes instructions without reactivating the
    // objective (which would reset subscribers such as the search timer).
    update(context, minimapVisible = false, presentation = objectives.active) {
      render(presentation);
      gameplayVisible = shouldShowObjective(context);
      root.hidden = !gameplayVisible || !presentation;
      root.classList.toggle('objective-hud--with-minimap', minimapVisible);
    },
    hide() { gameplayVisible = false; root.hidden = true; },
    dispose() { unsubscribe(); root.hidden = true; },
  };
}
