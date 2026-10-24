# Story progression through Ribbit and Kaufmo

Start **Play** or **New Game** for a story session. Both clear objectives,
encounter milestones, Escape points, photos and cinematic state. Options →
Room previews and the developer mission buttons remain separate from story
progression.

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
   characters. The four choices score at most four Escape points; poor
   choices increase distress by 1 and correct choices reduce it by 1 (minimum 0).
   Distress starts at 1. Reaching 3 immediately cancels the dialogue and shows
   **Level 1 Failed** with **Retry Level**. Failure clears Level 1 points and
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
   rotations stay fixed for this attempt, including visits after partial delivery.
   The HUD shows found and delivered totals separately and keeps the countdown
   visible throughout the return route, including Dorm Hall and detours.
   Finding the fifth photo changes the instruction to **Return to Kaufmo**;
   the remaining time continues without resetting. E presents all held photos
   immediately. Partial deliveries pause for dialogue and then resume the same
   clock; reaching 5 delivered stops it before Kaufmo's reaction, even with one
   second left. Early pickups are retained but do not bypass his introduction.
   All 5 delivered enable **Hear Kaufmo’s Theory**; his stall/payoff conversations
   resolve that objective and show **Level 2 Complete** once per run. Expiring
   with fewer than 5 delivered fails even if all photos have been found. Continue
   clears held/delivered photos and Level 2 points, chooses new spots, and restarts
   at the same default Lobby spawn with 4 minutes. Level 1 points are preserved.
   This remains a retry card, not the later "abstraction" effect.

`src/game/storyProgress.js` owns the post-Caine milestones. Objectives and
milestones survive room changes. Ribbit's completed pose and an unscored
follow-up interaction are restored on re-entry. Re-entering cannot repeat the
scored encounter or the completed hallway encounter.

Escape during Ribbit's conversation cancels staged actions and restores the
points from before that attempt. Inside the bedroom it returns Pomni to the
hallway, where knocking retries the encounter. Leaving the session invalidates
old dialogue, movement and asset-load callbacks before room disposal.

Dialogue `onNode` hooks may return a Promise. While it is pending, advancing
or selecting is blocked and the dialogue is hidden so the action is visible.
Escape remains available. Staged movement, gestures and waits resolve `true`
on completion and `false` on cancellation. Animation and movement advance once
per frame and stop while the game is paused.

Verification:

```sh
npm test
node tools/verify_level1_browser.mjs # Vite on 5173; installed Chrome
node _verify_objectives.mjs
node _verify_caine_interaction.mjs
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
two consecutive timeout/retry cycles and equal start positions, pause/loading/
dialogue exclusion, actual photo pickup and Kaufmo interaction callbacks,
stable positions after partial delivery, visible timing in Dorm Hall, failure
with all photos held, immediate last-second final delivery, and cancellation
of a pending retry by returning home. Its report and desktop/narrow-screen
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
or staircase.

Room/cutscene cleanup releases unique geometries, skeletons, shadow targets,
textures and decoded bitmap sources. A loading-manager hook also releases the
actual embedded-image blob URLs after decoding, working around the r169
GLTFLoader cleanup path. The browser regression tracks those URLs and checks
that none remain at the end of loading.

The maze remains the existing prototype. This change does not implement its
planned memory searches, final Jax dialogue or branching ending cinematics.

Developer cutscene skipping honours awaited actions and scores each choice once.
Returning home or changing rooms cancels a pending completion card.


Manual Level 1 win/loss check in Chrome:

- Start a New Game and follow Find Caine, then Find Ribbit to her door.
- To lose quickly, choose B at the first dialogue choice and A at the second.
  Distress moves 1 -> 2 -> 3. Level 1 Failed must appear immediately, without
  recovery or Find Kaufmo. Click Retry Level: the door conversation restarts
  without reloading the browser, at distress 1 and zero Level 1 points.
- On retry, choose A, B, A, A. Finish the dialogue, confirm Level 1 Complete,
  click Continue, and follow Find Kaufmo. The successful attempt earns 4 points
  that stay in the Escape Threshold through the Level 2 transition.
- A, A, B, B fails on the fourth choice after earning one point; retry must
  discard that point rather than adding it to the next attempt.
