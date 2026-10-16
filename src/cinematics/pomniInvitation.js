import { preLevel1Dialogue } from '../data/dialogues.js';

// Share the existing self-directed remark; previews retain the full script.
export const POMNI_INVITATION = Object.freeze([
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Come in.' },
]);
export const POMNI_SEATED_DIALOGUE = Object.freeze([preLevel1Dialogue[0], ...POMNI_INVITATION]);

// Future Ragatha entrance can subscribe after the invitation is acknowledged.
export const RAGATHA_ENTRANCE_EVENT = 'pomni:invitation-complete';
