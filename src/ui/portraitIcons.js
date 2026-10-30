/**
 * The 2D character icons shown in the dialogue overlay's portrait slots,
 * keyed by speaker id (see SPEAKERS in src/data/dialogues.js). Speakers
 * without one fall back to the drawn sprites in portraitSprites.js, then
 * to plain initials.
 */
const DIR = './models/objects/2D%20dialogue%20icons/';

export const ICONS = {
  pomni: `${DIR}pomni.webp`,
  caine: `${DIR}caine.png`,
  kaufmo: `${DIR}kaufmo.png`,
  ragatha: `${DIR}Ragatha.webp`,
  jax: `${DIR}Jax.webp`,
  ribbit: `${DIR}ribbit.png`,
};
