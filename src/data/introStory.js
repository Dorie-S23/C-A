/**
 * The intro story: five narrated panels played on a new game, between the
 * title screen's fly-in and Pomni waking (src/ui/introStory.js shows them).
 *
 * Each panel is a dialogue-shaped line, so tools/generateVoices.mjs records
 * the narration along with the rest of the script (it lists this module in
 * SCRIPT_MODULES). It covers only the premise — humans, a virtual world, no
 * exit, abstraction — and leaves Jax and Ribbit to the morning scenes.
 *
 * The image paths are spelled out in full so tools/package.mjs, which ships
 * only the asset paths the bundle mentions, finds each one.
 */
export const INTRO_PANELS = Object.freeze([
  {
    type: 'line',
    speaker: 'narrator',
    mood: 'neutral',
    image: './models/game%20screens/intro/1.jpg',
    text: 'It started with a headset. Just a game, played alone in a dark room, late at night.',
  },
  {
    type: 'line',
    speaker: 'narrator',
    mood: 'worried',
    image: './models/game%20screens/intro/2.jpg',
    text: 'Then the room was gone. She woke up in a body that wasn’t hers, in a world made of code, and couldn’t remember her own name.',
  },
  {
    type: 'line',
    speaker: 'narrator',
    mood: 'neutral',
    image: './models/game%20screens/intro/3.jpg',
    text: 'This is the Amazing Digital Circus. Its ringmaster, an AI named Caine, fills every day with adventures. What he never mentions is the exit. There isn’t one.',
  },
  {
    type: 'line',
    speaker: 'narrator',
    mood: 'sad',
    image: './models/game%20screens/intro/4.jpg',
    text: 'She wasn’t the first. Every performer here is a human who put on that headset. Some have been stuck for years.',
  },
  {
    type: 'line',
    speaker: 'narrator',
    mood: 'worried',
    image: './models/game%20screens/intro/5.jpg',
    text: 'And this world is hard on a mind. Break down too far, and you abstract: you lose yourself and become something like this. In here, the only thing holding anyone together is each other.',
  },
]);
