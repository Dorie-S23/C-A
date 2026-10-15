/**
 * The Escape Threshold: a hidden score carried across the whole run that
 * decides, at the end of the game, whether the party escapes (Gate 1).
 * Level 1's graded dialogue earns up to 4 points, Level 2's items up to 3.
 *
 * Hidden on purpose — nothing on screen shows it; the story hints at how
 * well things are going instead. Module-level state, so it survives room
 * changes for as long as the page is open, and resetEscapeThreshold()
 * starts a fresh run (the title screen's PLAY does) without a refresh.
 *
 * Points are kept per level and *set*, not added: replaying a level
 * replaces that level's score instead of stacking it, so the total can
 * never exceed ESCAPE_MAX however often a level is retried.
 */
export const LEVEL_MAX_POINTS = {
  level1: 4, // one per graded choice in Ribbit's conversation
  level2: 3, // one per C&A office picture presented to Kaufmo
};
export const ESCAPE_MAX = Object.values(LEVEL_MAX_POINTS).reduce((sum, p) => sum + p, 0);

// Gate 1 pass mark: mostly-good play across both levels clears it (e.g.
// 3/4 with Ribbit and 2/3 pictures), careless play doesn't.
export const ESCAPE_PASS_MARK = 5;

const levelPoints = new Map();

/** Records a level's points so far, replacing anything it earned before. */
export function setLevelPoints(level, points) {
  if (!(level in LEVEL_MAX_POINTS)) throw new Error(`Unknown Escape Threshold level: ${level}`);
  levelPoints.set(level, Math.max(0, Math.min(points, LEVEL_MAX_POINTS[level])));
}

export function getLevelPoints(level) {
  return levelPoints.get(level) ?? 0;
}

export function getEscapeTotal() {
  let total = 0;
  for (const points of levelPoints.values()) total += points;
  return total;
}

/** Gate 1, checked at the end of the game: does the party escape? */
export function passesEscapeGate() {
  return getEscapeTotal() >= ESCAPE_PASS_MARK;
}

export function resetEscapeThreshold() {
  levelPoints.clear();
}
