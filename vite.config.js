import { defineConfig } from 'vite';

// Relative base is required: the built game is hosted in a subdirectory
// on the department LAMP server, not at the domain root.
export default defineConfig({
  base: './',
});
