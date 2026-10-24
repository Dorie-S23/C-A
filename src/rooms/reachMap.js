/**
 * Reads a run-length coded walkable-floor grid (see lobbyReach.js, written
 * by tools/buildLobbyReach.mjs) into a quick "can Pomni stand here?" test.
 *
 * @param {{ minX: number, minZ: number, step: number, width: number, height: number, rows: string }} data
 * @returns {{ step: number, has: (x: number, z: number) => boolean }}
 */
export function decodeReachMap({ minX, minZ, step, width, height, rows }) {
  const cells = new Uint8Array(width * height);
  rows.split('|').forEach((row, j) => {
    if (!row) return;
    for (const run of row.split(',')) {
      const [first, count] = run.split(':').map(Number);
      cells.fill(1, j * width + first, j * width + first + count);
    }
  });
  return {
    step,
    has(x, z) {
      const i = Math.round((x - minX) / step);
      const j = Math.round((z - minZ) / step);
      return i >= 0 && j >= 0 && i < width && j < height && cells[j * width + i] === 1;
    },
  };
}
