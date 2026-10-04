/**
 * Speaker registry + dialogue scripts, consumed by DialogueUI via
 * dialogueEngine. Colors are placeholders standing in for real portrait
 * art — each echoes the character's established palette (Pomni's red/blue
 * jester suit, Ragatha's lavender patchwork, Caine's magenta ringmaster
 * coat) so swapping in real art later is a drop-in, not a redesign.
 */
export const SPEAKERS = {
  pomni: { name: 'Pomni', initials: 'P', color: 'linear-gradient(135deg, #c1272d 50%, #2b3a8f 50%)' },
  ragatha: { name: 'Ragatha', initials: 'R', color: '#8a6fb0' },
  caine: { name: 'Caine', initials: 'C', color: '#b0163f' },
};

// --- Pre-Level 1: "Business as Usual" ---------------------------------
// Jax's wordless pass-by (the design doc's "tell that something is wrong
// before anyone says so directly") is a pure 3D/animation beat with no
// dialogue box in the source script — represented here as a `beat` node
// so the overlay still carries the moment during a text-only playtest,
// but it has no speaker/portrait and is meant to be replaced by an actual
// animated Jax walking through the background once that exists.
export const preLevel1Dialogue = [
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'internal, muttered to herself',
    text: 'Another day trapped in a nightmare circus run by a sentient cartoon. Same as yesterday.',
  },
  {
    type: 'line',
    speaker: 'ragatha',
    side: 'right',
    text: 'Morning, Pomni! Sleep okay? Well — "sleep." You know what I mean.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    text: 'As okay as it gets in here.',
  },
  {
    type: 'line',
    speaker: 'ragatha',
    side: 'right',
    text: "Caine's got something planned today, I think. He was doing that thing where he mutters to himself and draws diagrams nobody asked for.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'deadpan',
    text: 'Thrilling. Another one of his "brilliant" ideas.',
  },
  {
    type: 'beat',
    text: 'Jax storms past in the background — no dialogue, just animation/SFX.',
  },
  {
    type: 'line',
    speaker: 'ragatha',
    side: 'right',
    direction: 'watching him go, dropping the upbeat tone',
    text: "...He's been like that for days now.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    text: "He's always like that.",
  },
  {
    type: 'line',
    speaker: 'ragatha',
    side: 'right',
    text: 'Not like this. Not since the thing with Ribbit.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'pause, uneasy',
    text: "Guess I should go find out what Caine wants before it becomes my problem too.",
    next: null,
  },
];

// --- Level 1 Open: "Caine's Warning" -----------------------------------
export const level1OpenDialogue = [
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'bursting in, too cheerful at first',
    text: 'POMNI! Just the digital being I wanted to see!',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'flat',
    text: 'What do you want, Caine.',
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    text: "Rude, but fair. Listen — this is going to sound like a normal circus update, and then it's going to stop sounding like that.",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'his tone shifts, energy dims slightly',
    text: "Jax and Ribbit had... words. Bad ones. And Jax has been Jax-ing harder than usual ever since. More bite, less bit, if you know what I mean.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    text: "Jax is always a jerk, that's not exactly breaking news—",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    text: "This is different! He's on edge. Snapping at anyone who breathes near him. And Ribbit—",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'pause — first real crack in the showman act',
    text: "Ribbit's not doing so hot. She's been quiet. Withdrawn. And you know what happens when one of us gets stuck in that headspace too long.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    text: '...Abstraction.',
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    text: "Abstraction! There it is! The A-word! The one I don't like saying out loud because saying it makes it feel closer!",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'beat, quieter, almost pleading under the performance',
    text: "If she tips over, she's not coming back as herself, Pomni. Whatever's left afterward — that's not Ribbit anymore. That's just... noise wearing her shape.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    text: "So what, you want me to fix a fight I wasn't even part of?",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    text: "I want you to go be the reason she doesn't have to fight it alone! That's slightly different and much more heroic-sounding!",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'sighing, already walking off',
    text: "...Fine. But if this goes badly I'm blaming you.",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'to the audience/camera, grin snapping back too fast',
    text: 'She always says that! She never does!',
    next: null,
  },
];
