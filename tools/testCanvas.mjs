// Node geometry tests don't render the doorway gradient. Browser regression
// checks use a real canvas; this only supplies the new portal's CanvasTexture.
globalThis.document ??= {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`Unexpected test element: ${tag}`);
    return { width: 0, height: 0, getContext() {
      return { createRadialGradient() { return { addColorStop() {} }; }, fillRect() {} };
    } };
  },
};
