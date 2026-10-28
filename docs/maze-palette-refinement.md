# Level 3 digital-funhouse palette refinement

## Diagnosis and scope

The former beige checker tiles, large cream trim, pale canopy stripes and warm hemisphere/directional lights combined into a sepia cast. This pass replaces that combination with richer crimson, midnight blue, violet and selective refined gold. It changes maze-local materials, canvas colours and the existing light rig only. All architecture, vertex positions, colliders, actor anchors, hazards, interactions, objectives and transitions are retained.

The original workspace, staged/unstaged edits and three stashes are preserved. No commit, push or merge.

## Files

- `src/rooms/mazeEnvironment.js`: crimson textile bays, navy structural borders and lower panels, selective gold arch outlines, neutral ivory details and signs. Deeper violet chamber-specific textile/panels separate Jax from the ordinary search alcoves. Structural trim shares the navy material to preserve the spatial instance budget; no extra map is needed.
- `src/rooms/mazeRoom.js`: clean `#EAE6E2` / `#17182D` checker texture, cooler base wall colours and reduced floor emission. Floor roughness 0.65 / metalness 0.04 remain unchanged; no glossy finish.
- `src/rooms/mazeOverhead.js`: subdued crimson/navy/violet canopy, less self-illumination, matching overhead ribs, flags and Jax ceiling; geometry and placement unchanged.
- `src/rooms/mazeLighting.js`: neutral-cool broad fill and key, retained warm entrance wash, cooler intersection accents, blue/rose alcove focuses and controlled violet Jax lights. The alcove cones also illuminate some rear scenery. Same light count and two 512px shadow maps.
- `tools/review_maze_polish_browser.mjs`: test-only real-game camera capture gains bowling/mug alcove views, including optional 1.7 m first-person views. No production camera changes.

The existing `mazeLoopMarkings.js`, `mazeShaders.js`, both GLSL files and `src/main.js` are byte-for-byte unchanged from the beginning of this pass. The previously implemented rosettes remain; the attachment's request to leave floor markings unchanged is respected.

## Visual review

With the isolated Vite server on port 5174:

`http://127.0.0.1:5174/artifacts/maze-polish/palette-review.html`

The gallery includes matched seed-123 entrance, decorated corridor, intersection, active hazard, bowling-ball alcove, hot-chocolate alcove and Jax views from the ACTUAL playable game. Source images are under `artifacts/maze-polish/palette-before/` and `palette-after/`. Player poses, yaw, pitch and collision-based camera positions match exactly. Additional after-only first-person views show both collectibles unobscured by Pomni.

`node artifacts/maze-palette/verify_palette_browser.mjs` checks pose equality, preserved source hashes and image brightness, and saves `palette-metrics.json`. Average screenshot luma is lower than before; these image measurements are descriptive, not aesthetic or real-world illumination scores. Neutral checker whites intentionally remove the previous yellow floor tint.

Play: `http://127.0.0.1:5174/?dev=1&mazeSeed=123`, then Maze (raw, no intro).

## Validation

- Existing regression suite: 66 tests pass, plus dialogue and collision script checks.
- Real-model regression: 32 maze seeds, plus eight fixed seeds including 123 and 187 for corridor clearance, matching wall colliders, pickup sightlines, trigger anchors, floor-motif alignment, scenery batches, lighting budget and disposal.
- Six seeded gameplay snapshots exactly match the preserved Step 2 graph, walls, colliders, actors, pickups, triggers and hazard route.
- Actual Edge WebGL gameplay captures report no shader/render errors. Custom shader sources and update code are unchanged.
- Production build passes; the existing Vite large-bundle advisory remains.

Stop at this visual review. No architecture, AI, shader, gameplay or global renderer expansion is included.
