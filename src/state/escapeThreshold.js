import { createChoiceTally } from '../dialogue/choiceTally.js';
import { level3JaxFinalDialogue } from '../data/dialogues.js';
import { MAZE_FINDABLES, MAZE_ITEM_POINTS } from './mazeItems.js';

/**
 * The Escape Threshold: a hidden score carried across the whole run that
 * decides, at the end of the game, whether the party escapes (Gate 1).
 * Level 1's graded dialogue earns up to 4 points, Level 2's items up to 5
 * (one per photo — there are 5 now, not the original 3). Level 3 earns a
 * point per maze keepsake found and its final conversation's choice points;
 * with Levels 1 and 2 it decides whether Jax abstracts (the Jax gate).
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
  level2: 5, // one per C&A office picture presented to Kaufmo
  // a point per maze keepsake, and the best answers' points in his talk
  level3: MAZE_FINDABLES.length * MAZE_ITEM_POINTS + createChoiceTally(level3JaxFinalDialogue).maxPoints,
};
// Gate 1 (escaping) is Levels 1 and 2's; Level 3 counts towards the Jax gate.
const ESCAPE_LEVELS = ['level1', 'level2'];
const JAX_LEVELS = ['level1', 'level2', 'level3'];
const maxOf = levels => levels.reduce((sum, level) => sum + LEVEL_MAX_POINTS[level], 0);
const totalOf = levels => levels.reduce((sum, level) => sum + getLevelPoints(level), 0);
export const ESCAPE_MAX = maxOf(ESCAPE_LEVELS);

// The Jax gate: Jax doesn't abstract if Levels 1 to 3 together reach this
// share of everything they could earn.
export const JAX_PASS_RATIO = 0.75;
export const JAX_MAX = maxOf(JAX_LEVELS);
export const JAX_PASS_MARK = Math.ceil(JAX_MAX * JAX_PASS_RATIO - 1e-9);

// Gate 1 pass mark: mostly-good play across both levels clears it (e.g.
// 3/4 with Ribbit and 3/5 pictures), careless play doesn't. Keeps roughly
// the same pass ratio (~71%) the original 5-of-7 mark used before Level 2
// went from 3 photos to 5.
export const ESCAPE_PASS_MARK = 6;

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
  return totalOf(ESCAPE_LEVELS);
}

/** Gate 1, checked at the end of the game: does the party escape? */
export function passesEscapeGate() {
  return getEscapeTotal() >= ESCAPE_PASS_MARK;
}

/** Levels 1 to 3's points, for the Jax gate. */
export function getJaxTotal() {
  return totalOf(JAX_LEVELS);
}

/** The Jax gate, checked as his final conversation ends: does he stay himself? */
export function passesJaxGate() {
  return getJaxTotal() >= JAX_PASS_MARK;
}

export function resetEscapeThreshold() {
  levelPoints.clear();
}

/** For a save: each level's points. */
export function snapshotEscapeThreshold() {
  return Object.fromEntries(levelPoints);
}

/** From a save; levels that no longer exist are ignored. */
export function restoreEscapeThreshold(saved = {}) {
  levelPoints.clear();
  for (const [level, points] of Object.entries(saved)) {
    if (level in LEVEL_MAX_POINTS && Number.isFinite(points)) setLevelPoints(level, points);
  }
}
