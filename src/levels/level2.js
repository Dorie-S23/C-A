/** Kaufmo's hallway encounter and a real trip to his room for the introduction. */
export function runLevel2(game, { onHallway, onIntroduced } = {}) {
  const session = game.session;
  let token = game.token;
  const live = () => game.session === session && game.token === token;
  return game.playDialogue('level2Hallway', {
    onCancel() {
      if (live()) game.showHint('Find Kaufmo in his room, a few doors toward the hall entrance.', 6500);
    },
    async onComplete() {
      if (!live()) return;
      onHallway?.();
      const room = await game.travel('kaufmo');
      if (!room || game.session !== session || !game.isRoom(room)) return;
      token = game.token;
      game.playDialogue('level2RoomOpening', {
        onComplete() { if (live()) onIntroduced?.(); },
        onCancel() {
          if (live()) game.showHint('Talk to Kaufmo to continue the conversation.', 6500);
        },
      });
    },
  });
}
