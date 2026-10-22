import fs from 'node:fs';

// Node geometry checks use stand-ins for canvas and image decoding. The image
// loader still verifies that each portrait asset exists; Chromium checks its
// real decoding/rendering. No browser code imports this helper.
globalThis.document ??= {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`Unexpected test element: ${tag}`);
    return { width: 0, height: 0, getContext() {
      return { createRadialGradient() { return { addColorStop() {} }; }, fillRect() {} };
    } };
  },
};

globalThis.document.createElementNS ??= (_namespace, tag) => {
  if (tag !== 'img') throw new Error(`Unexpected test namespaced element: ${tag}`);
  const listeners = new Map();
  const image = {
    width: 1, height: 1,
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    set src(url) {
      const file = new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url));
      if (!fs.existsSync(file)) throw new Error(`Missing portrait asset: ${url}`);
      queueMicrotask(() => listeners.get('load')?.call(image));
    },
  };
  return image;
};
