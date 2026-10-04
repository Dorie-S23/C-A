import { defineConfig } from 'vite';

// Relative base is required: the built game is hosted in a subdirectory
// on the department LAMP server, not at the domain root.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // The root index.html only redirects to the room selection page,
      // which lives in "game screens/" — both need building.
      input: ['index.html', 'game screens/roomselection.html'],
    },
  },
});
