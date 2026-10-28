import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// The loading screen's pictures: whatever images are in this folder, listed
// for the game as `virtual:loading-pictures` (see src/ui/loadingBackgrounds.js),
// so adding or deleting a picture needs no code change. In dev, the list
// refreshes the moment the folder changes. The URLs are full './models/...'
// paths so tools/package.mjs, which ships only referenced files, finds them.
const LOADING_DIR = 'public/models/game screens/Loading screen';
const LOADING_URL = './models/game%20screens/Loading%20screen/';
const PICTURE = /\.(png|jpe?g|webp|gif|avif)$/i;
const VIRTUAL_ID = 'virtual:loading-pictures';

function loadingPictures() {
  const dir = path.resolve(LOADING_DIR);
  const list = () => (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((name) => PICTURE.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => LOADING_URL + encodeURIComponent(name));
  return {
    name: 'loading-pictures',
    resolveId: (id) => (id === VIRTUAL_ID ? '\0' + VIRTUAL_ID : null),
    load: (id) => (id === '\0' + VIRTUAL_ID ? `export default ${JSON.stringify(list())};` : null),
    configureServer(server) {
      server.watcher.add(dir);
      const refresh = (file) => {
        if (path.dirname(path.resolve(file)) !== dir) return;
        const module = server.moduleGraph.getModuleById('\0' + VIRTUAL_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

// Relative base is required: the built game is hosted in a subdirectory
// on the department LAMP server, not at the domain root.
export default defineConfig({
  base: './',
  plugins: [loadingPictures()],
  resolve: {
    dedupe: ['three'],
  },
  optimizeDeps: {
    // Scan only this app, not HTML files in temporary project copies.
    entries: ['index.html'],
  },
});
