// Separate cinematic beat; existing story/preview dialogue scripts stay intact.
export const POMNI_INVITATION = Object.freeze([
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Come in.' },
]);

// Future Ragatha entrance can subscribe after the invitation is acknowledged.
export const RAGATHA_ENTRANCE_EVENT = 'pomni:invitation-complete';
