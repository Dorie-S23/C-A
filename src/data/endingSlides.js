/**
 * The ending's slides: which image is up from which beat of Dorsa's script
 * (endingLobby*Dialogue, then exitDoor*Dialogue). Each entry starts at the
 * node with that `action` and stays up until the next one, so the script
 * itself, and the voice clips named after its text, stay as they are.
 *
 * The image paths are spelled out in full so tools/package.mjs, which ships
 * only the asset paths the bundle mentions, finds each one. The full-size
 * originals are in docs/ending-panels.
 */
const FAREWELL = {
  pomniStops: './models/game%20screens/ending/final-1.jpg',
  caineHat: './models/game%20screens/ending/final-2.jpg',
  pomniLeaves: './models/game%20screens/ending/final-3.jpg',
  caineAlone: './models/game%20screens/ending/final-4.jpg',
};

export const ENDING_SLIDES = Object.freeze({
  saved: Object.freeze({
    walkOut: './models/game%20screens/ending/saved-1.jpg',
    kaufmoSteps: './models/game%20screens/ending/saved-2.jpg',
    run: './models/game%20screens/ending/saved-3.jpg',
    gathered: './models/game%20screens/ending/saved-4.jpg',
    jaxLeaves: './models/game%20screens/ending/saved-5.jpg',
    ...FAREWELL,
  }),
  abstracted: Object.freeze({
    walkOut: './models/game%20screens/ending/abstracted-1.jpg',
    ragathaHolds: './models/game%20screens/ending/abstracted-2.jpg',
    run: './models/game%20screens/ending/abstracted-3.jpg',
    gathered: './models/game%20screens/ending/abstracted-4.jpg',
    // Kinger's the one going through in this image, so it waits for his beat.
    kingerLeaves: './models/game%20screens/ending/abstracted-5.jpg',
    ...FAREWELL,
  }),
  // No art of its own yet: the same Lobby, then only the images with the door
  // shut, since it never opens here.
  trapped: Object.freeze({
    walkOut: './models/game%20screens/ending/abstracted-1.jpg',
    ragathaHolds: './models/game%20screens/ending/abstracted-2.jpg',
    run: './models/game%20screens/ending/abstracted-3.jpg',
    gathered: './models/game%20screens/ending/abstracted-4.jpg',
    caineAppears: './models/game%20screens/ending/final-2.jpg',
    turnBack: './models/game%20screens/ending/final-4.jpg',
  }),
});
