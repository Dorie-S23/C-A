import { MeshDepthMaterial, RGBADepthPacking } from 'three';

/** Jax's two shipped materials are opaque. Give this room visit an owned
 * shadow-pass material instead of retaining a closed bitmap in Three r169's
 * shared depth uniforms. Geometry and visible model materials are untouched.
 * The game's existing mesh.dispose hook releases it on room teardown.
 */
export function ownMazeShadowPass(jax) {
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.name = 'MazeOwnedOpaqueDepth';
  let disposed = false;
  jax.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.customDepthMaterial = depth;
    const previous = mesh.dispose;
    mesh.dispose = function() {
      if (!disposed) { depth.dispose(); disposed = true; }
      previous?.call(this);
    };
  });
  return depth;
}
