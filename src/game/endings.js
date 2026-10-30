/**
 * Which ending the run gets, from the two hidden meters (see the storyline
 * outline's "How the Two Meters Decide the Ending"):
 *
 *   Gate 1, the Escape Threshold (escapeThreshold.js passesEscapeGate):
 *   short of it and the party never finds the way out, whatever happened
 *   with Jax. Gate 2, Jax's Fate (jaxFate.js): only once Gate 1 is
 *   cleared, it decides whether he leaves with them.
 *
 *   'happy'        escaped, Jax saved: everyone leaves together
 *   'bittersweet'  escaped, Jax abstracted: the group leaves without him
 *   'noEscape'     not escaped; `jaxSaved` still says which variant to tell
 *
 * Pure, so the routing is tested on its own; main.js plays the result.
 *
 * @param {{ escaped: boolean, jaxSaved: boolean }} state
 * @returns {'happy' | 'bittersweet' | 'noEscape'}
 */
export function resolveEnding({ escaped, jaxSaved }) {
  if (!escaped) return 'noEscape';
  return jaxSaved ? 'happy' : 'bittersweet';
}
