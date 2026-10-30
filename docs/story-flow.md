# Story progression through Ribbit and Kaufmo

Start **Play** or **New Game** for a story session. Both clear objectives,
encounter milestones, Escape points, photos and cinematic state. Free roam of
a room from the developer screen stays separate from story progression.

The developer screen (Options → Room previews, or `?dev=1`) jumps straight into
any level or the cutscene between two of them: pre-story, Level 1, Level 1 → 2,
Level 2, Level 2 → 3 and Level 3, with free roam of each room separate. Each
jump is a story checkpoint like a save (`DEV_JUMPS` in `main.js`), holding what
the story would have by then (done objectives, Ribbit's points, the photos, the
keepsakes), so a level plays exactly as it does in the story. Jumps that begin
with an action (the knock on Ribbit's door, talking to Kaufmo, his hallway pass)
start it as the player clicks in.

The playable sequence is:

1. Pomni wakes; Ragatha enters and talks with her. Jax's hallway cutaway plays
   at the relevant dialogue beat. Completing the morning enables **Find Caine**.
2. Explore the Dorm Hall for ten seconds of active play; Caine arrives and
   speaks to Pomni. His completed warning enables
   **Find Ribbit**, with directions to the far-left bedroom. Pomni stays where
   the conversation ended.
3. At Ribbit's door, E offers **Knock on Ribbit’s door**. Normal opening and
   room travel are gated until her encounter is complete. The first choice
   plays through the closed door; consent moves the scene into her room.
4. Pomni approaches the bed before dialogue resumes. Choosing to sit waits
   for her approach and seating pose. Fixed conversation shots frame both
   characters. The four choices score at most four Escape points. Correct
   choices earn +1 and reduce distress by 1 (minimum 0); ordinary poor choices
   earn zero and increase distress, capped at 2. Distress starts at 1. The
   fourth option at each choice is a separate Game Over branch: it sets
   distress to 3, plays its response lines, then shows **Game Over** with the
   branch's message and **Retry Level**. Failure clears Level 1 points and
   never completes Find Ribbit or enables Find Kaufmo. Retry returns to the
   door and restarts the conversation with distress 1 and zero Level 1 points.
   Surviving paths steady Ribbit; successful points carry into Level 2.
5. Finishing completes **Find Ribbit** and enables **Find Kaufmo**. Pomni stands,
   the conversation camera releases, and the exit opens. There is no scene
   picker in this handoff. A **Level 1 Complete** card pauses for Continue
   before free exploration resumes.
6. Leaving for Dorm Hall plays Kaufmo's hallway encounter. Its completion is
   remembered, then Pomni travels into his room for the introduction. If
   interrupted, E on Kaufmo retries the room conversation.
7. Completing the introduction enables **Find and deliver the photos** and a
   **4-minute countdown covering both search and delivery**. Pomni auto-travels
   to the Lobby's default spawn; time advances only during active play, with
   loading, pause, dialogue and cinematics excluded. All 5 photos (`PHOTO_COUNT`
   in `level2Items.js`) glow softly around the Circus Lobby. Their positions and
   rotations stay fixed for this attempt, including return visits to the Lobby.
   The HUD shows found and delivered totals separately and keeps the countdown
   visible throughout the return route, including Dorm Hall and detours.
   Finding the fifth photo changes the instruction to **Return to Kaufmo**;
   the remaining time continues without resetting. E hands Kaufmo every held
   photo at once, which stops the clock, even with one second left. With at
   least 4 (`PHOTO_THRESHOLD`) he plays his success scene and send-off, then
   **Level 2 Complete** and the way into Level 3 (steps 8 to 11). With fewer
   he abstracts and the attempt ends on a
   **Retry Level 2** card. Early pickups are retained but do not bypass his
   introduction. Expiring before the hand-in fails even if all photos have been
   found: the game cuts to Kaufmo alone in his room (`level2TimeUpDialogue`),
   the shared abstraction effect (`src/effects/abstraction.js`) following each
   line's distress until he abstracts on the last beat, then a **Kaufmo has
   abstracted.** card. Its **Retry Level 2** restarts the level from the
   beginning: Find Kaufmo again, his Dorm Hall pass-by outside Ribbit's door
   (`storyProgress.restartLevel2()`), his introduction, then a new search.
   The too-few retry goes straight back to the Lobby search. Both clear
   held/delivered photos and Level 2 points and choose new spots, and the
   search restarts at the same default Lobby spawn with 4 minutes. Level 1
   points are preserved.

   Between conversations Kaufmo works at his theory wall, the clear wall
   across from his door (`createWallRoutine` in `kaufmoRoom.js`, the wall
   itself `src/props/theoryWall.js`): he writes a block of notes, steps back
   to think it over, then moves along to the next spot. His marker inks the
   wall wherever his hand goes. Talking to him puts both of them on their
   marks, and he goes back to the wall when the conversation ends. Once the
   success scene has played, the photos are pinned up among his notes. The
   hand-in scenes act the photos out on their beats (`handInActor` in
   `main.js`, the node ids in `dialogues.js`): Pomni holds them out, and he
   takes them, kneels and spreads them on the floor, taps one, gathers them
   and clutches them to his chest. With too few, he looks them over and lets
   them fall. Both characters gesture by the mood of their lines
   (`kaufmoTalk.js`, `pomniSpeaking.js`). Kaufmo also nods along while Pomni
   talks. `tools/kaufmo-animation-preview.html` shows his poses outside the
   game.
8. The successful hand-in completes **Hear Kaufmo’s Theory** and enables
   **Find Jax** before the Level 2 card, so a save made after it resumes from
   there. Continue hands control back in Kaufmo's room, and Pomni walks out
   into the Dorm Hall herself.
9. Outside his door, Dorsa's transition script plays (`level3Hallway`,
   staged by `src/levels/level3Hallway.js`; `dormHallRoom.js` loads Jax and
   Ribbit for it). It waits until the player has control. Jax is down the
   hall by Ribbit's door, back turned, and bolts back up it past her and out
   of sight, on the route and at the speed of the hall gathering
   (`hallwayGatheringPlan` and `JAX_RUN_SPEED` in
   `src/cutscenes/hallwayGatheringCutscene.js`). Ribbit walks up, and when she
   steps to follow him Pomni stops her with her arm out and sends her for the
   others. Its end completes **Find Jax** and enables **Follow Jax**.
10. In the Lobby, Jax is alone in the corner the toy blocks make with the
    north end of the long wall of bedroom doors, back turned, his idle
    glitching (`src/levels/level3Lobby.js`). Coming within 6 m of him starts
    `level3Jax` on staged shots. Its `action`s play the stage directions: he
    turns, a glitch tears across him, and he runs off along the doors. The
    camera cuts to Pomni before he reaches them. Escape before he runs resets
    the talk until Pomni steps back and approaches again; once he has run,
    the scene counts as finished.
11. The talk completes **Follow Jax** and enables **Find the Door to the
    Maze**. One of the five doors round the middle of that wall (`MAZE_DOORS`
    in `tadcRoom.js`, Plane119 to Plane124) leads into the maze, picked afresh
    each time the game runs (`lobbyMazeDoor.js`). It looks and opens like the
    rest, onto the same black void, until Jax has run through it; from then on
    opening it twists the `mazePortal.js` portal open in its doorway, including
    after a load, and walking into it loads the maze and completes the
    objective. It's left off the minimap. `tools/verify_jax_chase_browser.mjs`
    plays steps 8–11 for real.

`src/game/storyProgress.js` owns the post-Caine milestones. Objectives and
milestones survive room changes. Ribbit's completed pose and an unscored
follow-up interaction are restored on re-entry. Re-entering cannot repeat the
scored encounter or the completed hallway encounter.

Escape during live gameplay releases the pointer and pauses the conversation
and staged actions. Resume continues the same attempt. Explicit dialogue
cancellation (the dialogue API or an unlocked, unpaused preview) restores the
points from before the attempt; cancellation inside Ribbit's bedroom returns
Pomni to the hallway, where knocking retries the encounter. Leaving the session
invalidates old dialogue, movement and asset-load callbacks before room disposal.

Dialogue `onNode` hooks may return a Promise. While it is pending, advancing
or selecting is blocked and the dialogue is hidden so the action is visible.
Pause remains available. Staged movement, gestures and waits resolve `true`
on completion and `false` on cancellation. Animation and movement advance once
per frame and stop while the game is paused.

Verification:

```sh
npm test
node tools/verify_level1_browser.mjs # Vite on 5173; installed Chrome
node test/_verify_objectives.mjs
node test/_verify_caine_interaction.mjs
npm run build
```

With Vite running, `node tools/verify_dialogue_ui_browser.mjs` checks awaited
actions, current-score dialogue, cancellation and pause without model assets.
`node tools/verify_story_flow_browser.mjs` checks the opening,
Caine's arrival and warning, the story knock, cancellation during knock/entry,
Ribbit completion and revisit, Kaufmo's hallway/room transition,
hand-ins, completion cards, pause and New Game. It uses installed Edge with software rendering;
review-only browser instrumentation positions the player between encounters.
Screenshots and the report are written to ignored `artifacts/story-flow/`.

`node tools/verify_photo_search_timer_browser.mjs` checks the initial countdown,
a too-small hand-in (Kaufmo abstracts, Retry Level 2), two consecutive
timeouts (Kaufmo's cutaway and abstraction, then a restart at his Dorm Hall
pass-by and introduction) and equal start positions, pause/loading/dialogue
exclusion, actual photo pickup and Kaufmo interaction callbacks, stable
positions on a Lobby revisit, visible timing in Dorm Hall, failure with all
photos held, immediate last-second final delivery, and cancellation of a
pending retry by returning home. Its report and desktop/narrow-screen
screenshots are written to `artifacts/photo-search-timer/`. The bridge skips
walking distances and advances the game clock for deadline tests; these are
functional checks, not human difficulty measurements.

`node tools/verify_lobby_picture_scatter.mjs` checks all five placements across
8 real Lobby loads and a partial-delivery revisit. It also measures straight-line
travel distances for all 120 pickup orders per layout, ending at the Lobby exit,
through the real Dorm Hall and within Kaufmo's interaction radius. The report
is written to `artifacts/photo-search-timing/routes.json`. The first 8-layout
sample after this change estimated **70.7–147.8 seconds at walking speed**
(35.4–73.9 sprinting), excluding spotting, obstacle detours and interaction delays.
The longest order left only about 32 seconds of the old 180-second budget for
those costs. **240 seconds is the initial tuning choice**, adding a minute for
delivery and navigation. This estimate does not establish human completion rates
or guarantee every route fits: playtest unfamiliar layouts and partial-delivery
trips before final difficulty tuning. Adjust `SEARCH_TIMER_SECONDS` in `main.js`
and the initial timer text in `index.html` together.

Photo layout data is owned by `createLevel2Items().getPhotoLayout(factory)`:
the factory runs once per attempt and stores immutable plain coordinates and
rotations, without retaining meshes or textures. `scatterPictures()` reconstructs
only uncollected props from those slots. `reset()` clears both inventory and
layout for retries and New Game. No saved-game persistence is added.

Each Lobby landmark (`src/rooms/lobbyLandmarks.js`: hand-measured footprints
such as the Gumball Tower or Toy Block Wall) holds at most one photo, so they
can't all end up on one wall of 16 m toy blocks. The same landmarks label the
Lobby minimap, and during the search **H** names the nearest photo's landmark,
distance and direction and pings it on the minimap: 3 hints per attempt
(`HINT_LIMIT`), at least 20 seconds of search time apart
(`HINT_COOLDOWN_SECONDS`, both in `main.js`).

Photos only go where Pomni can walk up and see them. The scatter's sweep
origins can land sealed inside props (a pocket in the Toy Block Wall, the poles'
hollow bases), so the Lobby checks spots against `src/rooms/lobbyReach.js`, a
walkable-floor map flood-filled from the spawn. It's generated: rerun
`node tools/buildLobbyReach.mjs` after changing the Lobby model, castle walls
or staircase. A spot also has to be out in the open, not behind a building:
seen face-on from at least half the walkable floor in front of it within
12 m (`PHOTO_OPEN_*` in `tadcRoom.js`). Sight lines are cast both ways, since
the single-sided castle walls let a one-way ray through from behind; that
let the occasional photo face a wall no floor could see. Photos are about
1 m wide so they read from across a landmark. With these rules the same
8-layout route estimate came to 84.8–160.4 seconds at walking speed.

Room/cutscene cleanup releases unique geometries, skeletons, shadow targets,
textures and decoded bitmap sources. A loading-manager hook also releases the
actual embedded-image blob URLs after decoding, working around the r169
GLTFLoader cleanup path. The browser regression tracks those URLs and checks
that none remain at the end of loading.

Leaving the maze (both keepsakes found, Jax's conversation finished) freezes
Pomni, fades to black and records Level 3 as complete with its ending variant,
`saved` or `abstracted` (`storyProgress.ending`, kept in saves). A save taken
after that loads straight into the ending instead of the maze. `jaxOutcome()`
in `main.js` decides the variant; until the final conversation can fail
(KAN-67) it is always `saved`. `playEnding(variant)` plays the ending
scene (`src/cutscenes/endingCutscene.js`, KAN-89 and KAN-95): its own set, a
dusk clearing outside the maze's striped wall and gate, with Ribbit, Kaufmo
and Ragatha waiting and Caine flying in a little apart. Pomni walks out of
the gate with Jax (`endingSavedDialogue`) or alone, head bowed, to the
group's grief (`endingAbstractedDialogue`). Each node's `action` drives the
cast and each speaker picks the camera shot (`endingPlan().shots`). Gangle,
Zooble and Kinger have reserved marks but no models yet (KAN-90). Escape skips
the conversation; developer cutscene skipping skips the whole scene. Then the
**Level 3 Complete** card, then the title screen. The dev menu's two
**Ending** buttons jump straight to it.

Developer cutscene skipping honours awaited actions and scores each choice once.
Returning home or changing rooms cancels a pending completion card.


Manual Level 1 win/loss check in Chrome or Edge:

- Start a New Game and follow Find Caine, then Find Ribbit to her door.
- To lose quickly, choose D ("Nevermind") at the first dialogue choice.
  Its response lines must play, then Game Over must show “Don’t be a bum”,
  without recovery or Find Kaufmo.
  Click Retry Level: the door conversation restarts without reloading the
  browser, at distress 1 and zero Level 1 points.
- On retry, choose A, B, A, A. Finish the dialogue, confirm Level 1 Complete,
  click Continue, and follow Find Kaufmo. The successful attempt earns 4 points
  that stay in the Escape Threshold through the Level 2 transition.
- A, B, A, D fails on the fourth choice after earlier correct answers; retry
  must discard the attempt's points rather than adding them to the next one.
- B, A, B, B and C, C, C, C each survive with zero points. Ordinary zero-point
  choices do not trigger Game Over in the current script.
- Escape pauses a live conversation. Resume must retain its choice and points.

For the KAN-30/KAN-48 review matrix and exact suggested Jira updates, see
[tjeding-status.md](tjeding-status.md). With Vite running,
`node tools/verify_level1_review_browser.mjs` writes its browser report and
screenshots to ignored `artifacts/level1-review/rendered/`; `--no-render` runs
the same state checks without drawing the 3D scene. The default audit draws
real WebGL frames on demand for screenshots, suppressing continuous rendering
and shader warm-up; it does not measure rendering performance.
