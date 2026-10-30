# The Amazing Digital Circus — Beta Demo Implementation Plan

## Where you are now

You have a working Three.js + Vite scaffold with:
- First-person pointer-lock controls (WASD + mouse look + sprint)
- Two `.glb` room models loaded via `GLTFLoader` (Pomni's Room, TADC map)
- Basic bounding-box collision clamping (no per-wall collision)
- Automatic spawn-point detection via vertex-centroid + raycast
- Auto-generated lighting rig per room
- A credits panel and a loading overlay
- Shadow maps enabled, `dispose()` on room teardown ✅
- `vite.config.js` already set to `base: './'` ✅

**What's missing for Beta** (mapped against the rubric):

| Rubric category | Current state | Gap |
|---|---|---|
| **Viewing (10%)** | Single first-person camera, no avatar visible | Need 3rd-person toggle, minimap, animated avatar |
| **Control & Playability (10%)** | Walk/sprint only, no objectives | Need collision, interaction (E key), mouse click, win/fail states, physics |
| **3D Effects (15%)** | Shadows + basic materials only | Need skybox, reflections, bump/normal maps, fog, particle effects |
| **Shaders (10%)** | None | Need ≥1 custom vertex+fragment shader (abstraction distortion, glitch, etc.) |
| **Gameplay & Experience (25%)** | No levels, no story, no dialogue | Need 3 distinct levels with story progression, dialogue system, sound/music |
| **Polish (10%)** | Rough overlay menu | Need main menu, pause menu, HUD, restart without refresh, loading screen, colour scheme |
| **Innovation (10%)** | Nothing beyond basics | Need novel mechanics (dialogue choices, item collection), environment changes over time |
| **Trailer (10%)** | Not started | Need 2-min trailer for Beta |

---

## Game concept recap

**Theme**: The Amazing Digital Circus — Pomni must help troubled circus members avoid "abstraction" (losing their mind).

| Level | Setting | Core mechanic | What's new |
|---|---|---|---|
| **Level 1 — Ribbit's Room** | Ribbit's bedroom in the circus. Warm, cozy but tense atmosphere. | **Dialogue system** — talk to Ribbit, make choices that raise/lower a "calm meter". Reach the threshold → good ending. | Introduces the dialogue mechanic, exploration, NPC interaction |
| **Level 2 — Kaufmo's Room** | Kaufmo's chaotic clown room, objects scattered everywhere. Darker, more unsettling. | **Item collection & puzzle** — find specific objects (comedy props, mementos) to keep Kaufmo sane before a timer runs out. | New mechanic: timed item hunt with inventory. Environmental storytelling. |
| **Level 3 — The Maze / Jax Chase** | A shifting, surreal circus maze. Neon/glitch aesthetic. | **Navigation + chase** — find Jax in the maze, then find the exit together while avoiding abstracted monsters. | New mechanic: pursuit/evasion AI, maze navigation, environmental hazards. |

**One sentence per level** (for the demo):
1. "Level 1 introduces dialogue choices that determine Ribbit's fate."
2. "Level 2 adds timed item collection and inventory management in a darker environment."
3. "Level 3 replaces conversation with navigation, pursuit, and environmental hazards."

---

## Proposed architecture

```
src/
├── main.js                    # Entry point, game loop, state machine
├── core/
│   ├── GameStateManager.js    # MENU → PLAYING → PAUSED → LEVEL_COMPLETE → GAME_OVER
│   ├── InputManager.js        # Keyboard + mouse abstraction
│   ├── AudioManager.js        # Background music + SFX
│   ├── CameraManager.js       # First-person / third-person toggle + minimap
│   └── CollisionManager.js    # Raycaster-based collision detection
├── ui/
│   ├── MainMenu.js            # Title screen with Start / Credits / Controls
│   ├── HUD.js                 # Health/calm meter, timer, inventory, minimap canvas
│   ├── DialogueUI.js          # Dialogue box with choices (sprite + text)
│   ├── PauseMenu.js           # Esc → pause overlay with Resume / Restart / Quit
│   └── LoadingScreen.js       # Animated loading bar
├── entities/
│   ├── Player.js              # Avatar mesh, animation mixer, movement + physics
│   ├── NPC.js                 # Character sprite/model + dialogue data
│   └── CollectibleItem.js     # Hovering/glowing pickup objects
├── levels/
│   ├── LevelBase.js           # Shared level lifecycle: load → play → cleanup
│   ├── Level1_Ribbit.js       # Dialogue level
│   ├── Level2_Kaufmo.js       # Item collection level
│   └── Level3_Maze.js         # Maze chase level
├── effects/
│   ├── shaders/
│   │   ├── glitchShader.js    # Custom vertex+fragment: abstraction distortion
│   │   └── toonShader.js      # Custom toon/cel shader for circus aesthetic
│   ├── Particles.js           # Sparkles, abstraction particles
│   └── PostProcessing.js      # Bloom, vignette, colour grading
├── rooms/                     # Existing room loaders (kept)
│   ├── loadRoomModel.js
│   ├── pomniRoom.js
│   └── tadcRoom.js
└── data/
    ├── dialogues.json         # All dialogue trees (Level 1)
    └── collectibles.json      # Item definitions (Level 2)
```

### Hierarchy / scene-graph design (for the "Viewing" questions)

```
Scene
├── Lights (AmbientLight, HemisphereLight)
├── Skybox (CubeTextureLoader or ShaderMaterial sphere)
├── LevelGroup (swapped per level — dispose old, load new)
│   ├── RoomModel (.glb)
│   │   ├── Walls, Floor, Props (receiveShadow)
│   │   └── InteractiveObjects (highlight on hover)
│   ├── NPCs
│   │   ├── CharacterModel/Sprite
│   │   └── PointLight (subtle glow — child of NPC, moves with them)
│   ├── Collectibles (Level 2)
│   │   └── Item → SpotLight (glow, child of item)
│   └── Hazards (Level 3)
├── Player
│   ├── AvatarMesh (Pomni model, visible in 3rd person)
│   │   └── AnimationMixer (idle, walk, run)
│   ├── FirstPersonCamera (child of Player, at head height)
│   └── Flashlight/SpotLight (child of camera, moves with view)
└── MinimapCamera (OrthographicCamera, top-down, renders to separate target)
```

> [!IMPORTANT]
> **Why this hierarchy matters for the demo**: The tutors will ask *"why is X a child of Y?"* Be ready to explain that lights attached to NPCs follow them automatically, the camera parented to the player means movement code only transforms the player, and the minimap camera is independent to get a top-down orthographic view.

---

## Task assignments (6 members)

> [!NOTE]
> Each member should own their area end-to-end (code + assets + testing). Pair up for integration sessions. Names below are placeholders — assign your actual members.

### Member 1 — **Core Engine & Architecture** (Team Lead)

**Owns**: Game state machine, level lifecycle, main loop refactor, build/deploy

| Task | Priority | Est. effort |
|---|---|---|
| Refactor `main.js` into `GameStateManager` (MENU → INTRO → LEVEL_1 → LEVEL_2 → LEVEL_3 → WIN/LOSE) | 🔴 High | 4h |
| Create `LevelBase.js` — abstract class with `load()`, `update(dt)`, `cleanup()` that each level extends | 🔴 High | 2h |
| Wire level transitions: completing Level 1 → auto-load Level 2 → Level 3 | 🔴 High | 2h |
| Implement restart-without-refresh (reset state, dispose old level, reload) | 🟡 Med | 2h |
| `InputManager.js` — centralized key/mouse state, rebindable | 🟡 Med | 1h |
| Set up production build pipeline, test `npm run build` → serve `dist/` → play through all 3 levels | 🔴 High | 1h |
| Deploy to LAMP server early (empty scene first, then real builds) | 🔴 High | 1h |
| Integration testing: ensure level transitions don't leak memory (`dispose()` everything) | 🟡 Med | 2h |

---

### Member 2 — **Player, Camera & Controls**

**Owns**: Player avatar, camera modes, collision, physics, minimap

| Task | Priority | Est. effort |
|---|---|---|
| `Player.js` — load a Pomni `.glb` model, attach `AnimationMixer` for idle/walk/run | 🔴 High | 4h |
| Animate the avatar: blend between idle ↔ walk ↔ run based on velocity | 🔴 High | 3h |
| `CameraManager.js` — first-person (current) + third-person toggle (press `V`) | 🔴 High | 3h |
| In 3rd person: camera orbits behind player, avatar visible; in 1st person: avatar hidden | 🟡 Med | 2h |
| `CollisionManager.js` — raycaster-based collision against room geometry (replace bounding-box clamping) | 🔴 High | 4h |
| Basic gravity: player falls if no floor below, lands on surfaces | 🟡 Med | 3h |
| Minimap: `OrthographicCamera` rendering to a `WebGLRenderTarget`, displayed as a corner HUD element | 🟡 Med | 3h |
| Gamepad/controller support (optional but tutor-suggested — `Gamepad API`) | 🟢 Low | 2h |

---

### Member 3 — **3D Effects & Shaders** (Graphics Lead)

**Owns**: Visual effects, custom shaders, post-processing, skybox, textures

| Task | Priority | Est. effort |
|---|---|---|
| **Custom shader #1 — Abstraction Glitch**: vertex displacement (wavy distortion) + fragment colour shifting. Uniform `uTime` drives animation, `uIntensity` controlled by game state (increases as calm meter drops) | 🔴 High | 5h |
| **Custom shader #2 — Toon/Cel shader**: outlines + stepped lighting to match the show's cartoon aesthetic. Apply to NPCs or player | 🟡 Med | 4h |
| Skybox: per-level dynamic skybox (Level 1: warm sunset circus tent, Level 2: stormy/dark, Level 3: neon/glitch void) | 🔴 High | 2h |
| Fog: distance fog per level (warm fog L1, dark fog L2, coloured fog L3) | 🟡 Med | 1h |
| Bump/normal maps on walls and floors (find/create circus-themed textures) | 🔴 High | 3h |
| Particle effects: sparkle particles on collectibles (Level 2), abstraction particles (floating geometric shards) | 🟡 Med | 3h |
| Post-processing pipeline (`EffectComposer`): bloom for glowing objects, vignette, optional chromatic aberration for glitch scenes | 🟡 Med | 3h |
| Reflective surfaces: mirror/shiny floor in circus tent using `CubeCamera` or `MeshPhysicalMaterial` with environment map | 🟡 Med | 2h |
| **Time-based environment change** (tutor suggestion): the longer you play, lights dim, fog thickens, colours desaturate — driven by a uniform clock | 🟡 Med | 2h |

> [!IMPORTANT]
> **Shader requirement**: Every team member must be able to explain the custom shaders in the demo. Member 3 should prepare a short "shader explainer" doc and walk the team through the GLSL code before the Beta demo.

---

### Member 4 — **Level 1 (Ribbit) & Dialogue System**

**Owns**: Level 1 gameplay, dialogue UI, NPC interaction, calm meter

| Task | Priority | Est. effort |
|---|---|---|
| `Level1_Ribbit.js` — extends `LevelBase`, loads Ribbit's room environment | 🔴 High | 3h |
| Design & build Ribbit's room in Blender or assemble from props (cozy but tense — blankets, photos, dim warm lighting) | 🔴 High | 4h |
| `DialogueUI.js` — HTML overlay: character sprite on left, text box, 2-3 choice buttons | 🔴 High | 4h |
| Write dialogue tree in `dialogues.json` — branching paths, each choice adds/subtracts from calm meter | 🔴 High | 3h |
| NPC interaction: walk up to Ribbit, press `E` → triggers dialogue, locks movement | 🔴 High | 2h |
| Calm meter HUD element (progress bar, colour shifts green→yellow→red) | 🟡 Med | 2h |
| Level outcome: calm meter ≥ threshold → good ending cutscene/text → transition to Level 2; below → bad ending → retry option | 🔴 High | 2h |
| Ribbit character model/sprite — either a `.glb` model or 2D sprite billboard that always faces camera | 🔴 High | 2h |
| Add Caine NPC in hallway for the exposition intro before Level 1 | 🟡 Med | 2h |
| Sound: ambient room sounds, dialogue "blip" SFX | 🟡 Med | 1h |

---

### Member 5 — **Level 2 (Kaufmo) & Item System**

**Owns**: Level 2 gameplay, collectible items, inventory, timer

| Task | Priority | Est. effort |
|---|---|---|
| `Level2_Kaufmo.js` — extends `LevelBase`, loads Kaufmo's chaotic clown room | 🔴 High | 3h |
| Design & build Kaufmo's room (darker, more cluttered — juggling props, broken mirrors, scattered joke items) | 🔴 High | 4h |
| `CollectibleItem.js` — items hover and rotate (sine wave on Y), glow (emissive + point light child), disappear on pickup with SFX | 🔴 High | 3h |
| Inventory HUD: bottom-of-screen slots showing collected items (icons or 3D thumbnails rendered to canvas) | 🔴 High | 3h |
| Timer mechanic: countdown timer on HUD, if it hits 0 → Kaufmo abstracts → bad ending | 🔴 High | 2h |
| Kaufmo NPC: starts calm, progressively gets more agitated (animation/colour shift) as time passes | 🟡 Med | 3h |
| Place 5-7 collectible items around the room, some hidden behind furniture or on shelves | 🟡 Med | 2h |
| Level outcome: all items collected in time → good ending → Level 3; timer expires → bad ending → retry | 🔴 High | 2h |
| Item interaction: walk near + press `E`, or click on item | 🟡 Med | 1h |
| Sound: ticking clock SFX (speeds up as time runs low), item pickup jingle | 🟡 Med | 1h |

---

### Member 6 — **Level 3 (Maze/Jax) & UI/Polish**

**Owns**: Level 3 gameplay, main menu, pause menu, loading screen, overall UI/UX

| Task | Priority | Est. effort |
|---|---|---|
| `Level3_Maze.js` — extends `LevelBase`, procedural or hand-crafted maze | 🔴 High | 5h |
| Maze generation: either a pre-built `.glb` maze model, or procedural walls from a grid | 🔴 High | 4h |
| Jax NPC: placed deep in maze, pathfinding/wandering AI (simple waypoint system) | 🟡 Med | 3h |
| Abstracted monsters: patrol maze corridors, contact = game over. Simple state machine (patrol → chase if player is close) | 🟡 Med | 4h |
| **Main Menu** (`MainMenu.js`): Title screen with game logo, "Start Game" / "Credits" / "Controls" buttons, circus-themed styling | 🔴 High | 3h |
| **Pause Menu** (`PauseMenu.js`): Esc → pause game, overlay with Resume / Restart Level / Quit to Menu | 🔴 High | 2h |
| **Loading Screen** (`LoadingScreen.js`): animated progress bar with circus-themed graphics while `.glb` models load | 🟡 Med | 2h |
| Consistent colour scheme & CSS theming across all UI elements (circus reds, purples, golds) | 🟡 Med | 2h |
| **Credits screen**: update with all actual assets, libraries, sources, licences | 🔴 High | 1h |
| Level 3 environment: neon/glitch aesthetic — emissive walls, moving spotlights, different from L1/L2 | 🟡 Med | 3h |

---

## Shared / everyone tasks

| Task | Who | Priority |
|---|---|---|
| Find or create character models (Pomni, Ribbit, Kaufmo, Jax, Caine) — `.glb` format, low-poly preferred | All | 🔴 High |
| Write all dialogue scripts (Level 1 especially) | Members 1 + 4 | 🔴 High |
| Sound & music sourcing: find royalty-free circus/horror BGM + SFX | Member 4 + 6 | 🟡 Med |
| `AudioManager.js` — background music per level, SFX on events, mute toggle | Member 4 or 6 | 🟡 Med |
| **Everyone**: understand the custom shaders well enough to explain them at the demo | All | 🔴 High |
| **Everyone**: test the full game start-to-finish on a clean browser before Beta | All | 🔴 High |
| Record and edit the 2-min game trailer | Members 2 + 3 | 🔴 High |

---

## Timeline to Beta (assuming ~2 weeks)

### Week 1 — Core systems + Level 1 playable

| Day | Milestone |
|---|---|
| **Day 1-2** | Member 1: `GameStateManager` + `LevelBase` scaffold. Member 2: `Player.js` with basic avatar + collision. Member 3: First custom shader (glitch). Member 4: `DialogueUI.js` prototype. Member 5: `CollectibleItem.js` prototype. Member 6: Main menu + pause menu. |
| **Day 3-4** | Member 1: Level transitions wired. Member 2: Camera toggle + minimap started. Member 3: Skybox + fog + bump maps. Member 4: Level 1 fully playable with dialogue. Member 5: Level 2 room + items placed. Member 6: Loading screen + HUD framework. |
| **Day 5** | **Integration checkpoint**: Level 1 plays start to finish. Deploy a build to LAMP server. Everyone tests. |
| **Weekend** | Fix integration bugs. Members 4+5 polish their levels. Member 3 finishes shader #2. |

### Week 2 — Levels 2 & 3 + polish + trailer

| Day | Milestone |
|---|---|
| **Day 1-2** | Level 2 fully playable. Level 3 maze built and walkable. Post-processing added. Sound integrated. |
| **Day 3-4** | Level 3 AI/chase mechanic working. Time-based environment changes. All UI polished. Full playthrough tested. |
| **Day 5** | **Code freeze**: no new features, only bug fixes. Record trailer footage. |
| **Weekend** | Edit trailer. Final LAMP deploy. Full team playthrough on lab hardware. Prepare for demo — everyone reviews shader code. |

---

## Verification plan

### Automated / self-tests
```bash
npm run build                    # Must succeed with no errors
npx serve dist                   # Serve built game locally
# Play through all 3 levels in Chrome — no console errors, no 404s
```

### Manual verification checklist
- [ ] Game loads from LAMP server URL in Chrome on Ubuntu
- [ ] Main menu → Start → Exposition (Caine) → Level 1 works
- [ ] Level 1: dialogue choices affect calm meter, good/bad endings both work
- [ ] Level 1 → Level 2 transition: old level disposed, no memory leak
- [ ] Level 2: all items collectible, timer works, good/bad endings
- [ ] Level 2 → Level 3 transition
- [ ] Level 3: maze navigable, Jax findable, monsters avoidable, ending reachable
- [ ] Camera toggle (V key) works: 1st → 3rd person and back
- [ ] Minimap renders correctly
- [ ] Custom shaders visible and animated (glitch effect, toon shader)
- [ ] Skybox changes per level
- [ ] Pause menu (Esc) works, Resume/Restart/Quit all functional
- [ ] Game restarts without page refresh
- [ ] Credits screen lists all external resources
- [ ] No absolute paths (`/`) in any source file
- [ ] Asset filenames are lowercase, no spaces
- [ ] Frame rate stays above 30fps on lab hardware
- [ ] Memory doesn't climb across 3 levels (check DevTools → Performance Monitor)

### Trailer
- [ ] Under 2 minutes
- [ ] Shows all 3 levels
- [ ] Has music/sound
- [ ] Uploaded to YouTube

---

## Open questions for the team

> [!IMPORTANT]
> **Q1**: Do you have character models yet? The biggest asset bottleneck will be getting `.glb` models for Pomni (player avatar), Ribbit, Kaufmo, Jax, and Caine. Options:
> - Find fan-made models on Sketchfab (many TADC models exist — just credit them)
> - Use 2D sprite billboards instead of 3D models (faster, still looks stylish)
> - Model them in Blender (best for Innovation marks, but time-consuming)
>
> **Recommendation**: Use Sketchfab `.glb` models for Beta, replace with custom Blender models for Final if time allows.

> [!IMPORTANT]
> **Q2**: For Level 3's maze — do you want a hand-crafted Blender model or procedural generation in code? Procedural is more impressive for Innovation but harder to polish visually. A hand-crafted maze with a few randomized elements (item placements, monster patrol routes) is a good middle ground.

> [!WARNING]
> **Q3**: The two existing `.glb` models are 7.6 MB and 10.4 MB. That's already 18 MB before adding character models, Level 2 room, Level 3 maze, textures, and audio. The brief warns about download size. Consider:
> - Draco-compressing your `.glb` files (can reduce by 80%+)
> - Adding a proper loading screen (marks under Polish)
> - Keeping total download under ~50 MB

> [!NOTE]
> **Q4**: How do you want to handle the "time-based environment change" (tutor suggestion)? The plan above has it as a shader uniform that gradually shifts lighting/fog/colour, but it could also be tied to specific story events. Which feels more natural for your game?
