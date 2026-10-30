import { DefaultLoadingManager } from 'three';
import { disposeBoundsTree } from 'three-mesh-bvh';

const installed = new WeakSet();

/**
 * Three r169's GLTFLoader revokes the source Promise rather than the resolved
 * blob URL for embedded images. itemEnd receives the actual URL after decoding.
 * Release it there, including on failed image loads, without changing loaders.
 */
export function installGltfBlobCleanup(manager = DefaultLoadingManager, revoke = url => URL.revokeObjectURL(url)) {
  if (installed.has(manager)) return;
  installed.add(manager);
  const previous = manager.onProgress;
  manager.onProgress = (url, loaded, total) => {
    if (typeof url === 'string' && url.startsWith('blob:')) revoke(url);
    previous?.(url, loaded, total);
  };
}

/** Exclusively owned room/cutscene textures; shared source images close once. */
export function releaseTextures(textures) {
  const closed = new Set();
  for (const texture of textures) {
    texture.dispose();
    const data = texture.source?.data;
    for (const image of Array.isArray(data) ? data : [data]) {
      if (!closed.has(image)) { image?.close?.(); closed.add(image); }
    }
  }
}

/** Releases every uniquely owned GPU resource below a room or character root. */
export function disposeObjectResources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse((child) => {
    child.shadow?.dispose();
    if (!child.isMesh) return;
    child.dispose?.();
    if (child.skeleton) skeletons.add(child.skeleton);
    if (child.geometry) geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) { disposeBoundsTree.call(geometry); geometry.dispose(); }
  for (const skeleton of skeletons) skeleton.dispose();
  releaseTextures(textures);
}
