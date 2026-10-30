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
  kaufmo: { name: 'Kaufmo', initials: 'K', color: '#e0a868' },
  ribbit: { name: 'Ribbit', initials: 'R', color: '#5d9b3c' },
  jax: { name: 'Jax', initials: 'J', color: '#9b7fd4' },
};

// --- Pre-Level 1: "Business as Usual" ---------------------------------
// Jax's wordless pass-by (the design doc's "tell that something is wrong
// before anyone says so directly") is a pure 3D/animation beat with no
// dialogue box in the source script at all. main.js awaits the hallway
// cutaway at 'jaxPassByText', then resumes Ragatha's worried response.
//
// `anim` cues the cast in Pomni's Room as each node comes up (see
// pomniRoom.js): Ragatha walks up to Pomni, waves hello and chats, is
// still watching where Jax went when the cutscene cuts back, then turns
// worried. A cue holds until the next one.
export const preLevel1Dialogue = [
  {
    id: 'pomniMorningRemark',
    type: 'line',
    anim: { ragatha: 'walkIn' },
    speaker: 'pomni',
    side: 'left',
    direction: 'internal, muttered to herself',
    mood: 'neutral',
    text: 'Another day trapped in a nightmare circus run by an AI being. Same as yesterday.',
  },
  {
    id: 'ragathaMorningGreeting',
    type: 'line',
    anim: { ragatha: 'wave' },
    speaker: 'ragatha',
    side: 'right',
    text: 'Morning, Pomni! Sleep okay? Well — "sleep." You know what I mean.',
  },
  {
    type: 'line',
    anim: { ragatha: 'listen' },
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'As okay as it gets in here.',
  },
  {
    type: 'line',
    anim: { ragatha: 'chatty' },
    speaker: 'ragatha',
    side: 'right',
    text: "Caine's got something planned today, I think. I saw him rushing all over the circus trying to plan our next adventure.",
  },
  {
    type: 'line',
    anim: { ragatha: 'listen' },
    speaker: 'pomni',
    side: 'left',
    direction: 'deadpan',
    mood: 'annoyed',
    text: 'Thrilling. Another one of his "brilliant" ideas for more adventures.',
  },
  {
    // Silent sync point: the hallway cutaway plays here.
    id: 'jaxPassByText',
    type: 'cue',
  },
  {
    id: 'afterJaxPassBy',
    type: 'line',
    anim: { ragatha: 'watch' },
    speaker: 'ragatha',
    side: 'right',
    direction: 'watching him go, dropping the upbeat tone',
    text: "...Does Jax seem off to you? He's been like that for days now.",
  },
  {
    type: 'line',
    anim: { ragatha: 'worried' },
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'Now that you mention it, he hasn’t been his usual insufferable self lately.',
  },
  {
    type: 'line',
    anim: { ragatha: 'worried' },
    speaker: 'ragatha',
    side: 'right',
    text: 'I suspect something happened between Ribbit and him, they’ve been avoiding each other.',
  },
  {
    type: 'line',
    anim: { ragatha: 'worried' },
    speaker: 'pomni',
    side: 'left',
    direction: 'pause, uneasy',
    mood: 'worried',
    text: 'Strange… I should get going to see what Caine wants. He asked to see me after I woke up.',
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
    mood: 'happy',
    text: 'POMNI! Just the human I wanted to see!',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'flat',
    mood: 'annoyed',
    text: 'What do you want, Caine.',
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    mood: 'happy',
    text: "Listen — this is going to sound like a normal circus update, and then it's going to stop sounding like that.",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'his tone shifts, energy dims slightly',
    mood: 'worried',
    text: "Jax and Ribbit had... words. Bad ones. And Jax has been Jax-ing harder than usual ever since. More bite, less wit, if you know what I mean.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: "Jax is always a jerk. That's not exactly breaking news.",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    mood: 'worried',
    text: "This is different! He's on edge. Snapping at anyone who breathes near him. And Ribbit—",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'pause — first real crack in the showman act',
    mood: 'worried',
    text: "Ribbit's not doing so hot. She's been quiet. Withdrawn. And you know what happens when one of us gets stuck in that headspace too long.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'shocked',
    text: '...Abstraction.',
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    mood: 'shocked',
    text: "Abstraction! There it is! The A-word! The one I don't like saying out loud because saying it makes it feel closer to happening!",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'beat, quieter, almost pleading under the performance',
    mood: 'sad',
    text: "If she tips over, she's not coming back as herself, Pomni. Even I can't revert abstractions.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: "So you're asking me to get involved in their personal matters?",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    mood: 'happy',
    text: "I want you to go be the reason she doesn't have to fight it alone! That's slightly different and much more heroic-sounding!",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'sighing, already walking off',
    mood: 'sad',
    text: "...Fine. But if this goes badly I'm blaming you.",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'to the audience/camera, grin snapping back too fast',
    action: 'asideToCamera', // caineApproachCutscene.js: turns to the camera, rolls his eyes
    mood: 'happy',
    text: 'She always says that! She never does!',
    next: null,
  },
];

// --- Level 2 Opening: "Missing Pieces" ---------------------------------
// Two branch points (CHOICE 1 / CHOICE 2 in the source script) are flavor
// only — every option reconverges on the same next line, same as the
// source script never gates progress on which one is picked.
export const level2HallwayDialogue = [
  {
    type: 'beat',
    text: "Hallway outside Ribbit's room. Pomni steps out. Kaufmo hurries past without noticing her.",
  },
  {
    id: 'kaufmoHurriesBy',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'mumbling, hurrying past, not really talking to her',
    mood: 'worried',
    text: "—five on the left wall, one by the stage, and the door that wasn't a door… no, no, that one counts, that one has to count…",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'to herself',
    mood: 'worried',
    text: "…Okay. That's not normal. Even for here.",
  },
  {
    type: 'beat',
    text: 'Kaufmo hurries on and disappears into his room, a few doors before Ribbit’s.',
    next: null,
  },
];

export const level2RoomOpeningDialogue = [
  {
    id: 'l2_inside',
    type: 'beat',
    text: 'Pomni catches up. Kaufmo turns toward her, still lost in thought.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "Kaufmo? Hey. Are you alright? You've been mumbling things to yourself lately.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: "Pomni! Pomni. Good. You're real. You are real, right? Don't answer that. Sorry. That was weird.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "A little. What's going on?",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: 'Nothing! Everything. Okay, so — you know how everything here is fake? Fake sky, fake food, fake doors.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "I've noticed, yeah.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "But not all of it. Some things don't fit. A texture that's too real. A sound that loops wrong. Like someone left a back door open and forgot to paint over it.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "I've been writing it all down. I've got… a lot written down.",
  },
  {
    id: 'choice1',
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: "Sounds like you've been thinking about this a lot.", next: 'c1_a' },
      { text: 'Kaufmo, slow down. Breathe.', next: 'c1_b' },
      { text: 'Uhh, what?', next: 'c1_c' },
    ],
  },
  {
    id: 'c1_a',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: "Every second! I can't stop. Every time I close my eyes I see the gaps.",
    next: 'converge1',
  },
  {
    id: 'c1_b',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "Breathe. Right. Breathing. …We don't even need to breathe here, did you know that? That's another one. Add it to the list.",
    next: 'converge1',
  },
  {
    id: 'c1_c',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'annoyed',
    text: "Haven't you been listening?!",
    next: 'converge1',
  },
  {
    id: 'converge1',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "There's an exit, Pomni. A real one. I'm close. I'm so close I can feel it, and that's what scares me.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'Why would that scare you?',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'sad',
    text: "Because if I'm wrong… then I'm just the guy walking in circles talking to himself.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'sad',
    text: 'Which is what Jax said.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'shocked',
    text: 'You told Jax?',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'annoyed',
    text: "I thought he'd get it! He's the one guy who never buys Caine's whole routine. So I showed him everything.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'sad',
    text: 'And he laughed. Called me crazy. Said I should go lie down before I abstract in front of everyone.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: "…That's a very Jax thing to say.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'sad',
    text: "Yeah, but it's different lately. He used to be mean in a fun way. Now he just means it.",
  },
  {
    id: 'choice2',
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: "He's been taking it out on everyone. It's not about you.", next: 'c2_a1' },
      { text: 'You are crazy.', next: 'c2_b' },
      { text: 'Honestly? You do sound a bit crazy right now.', next: 'c2_c1' },
    ],
  },
  {
    id: 'c2_a1',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'Pomni nods',
    mood: 'worried',
    text: '…Ribbit too? Huh. Okay. That actually helps. A little. Is that bad?',
    next: 'c2_a2',
  },
  {
    id: 'c2_a2',
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'No. I get it.',
    next: 'converge2',
  },
  {
    id: 'c2_b',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'annoyed',
    text: "Excuse me?? You don't know that. I don't even know that…",
    next: 'converge2',
  },
  {
    id: 'c2_c1',
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'laughs, too fast',
    mood: 'shocked',
    text: "Ha. Yeah. Yeah, I know. That's the worst part. I can hear it too.",
    next: 'c2_c2',
  },
  {
    id: 'c2_c2',
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "…Doesn't mean you're wrong, though.",
    next: 'converge2',
  },
  {
    id: 'converge2',
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "Look. I want out of here as much as anyone. If there's something real, I'll help you find it.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: 'You… would?',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "Of course, Kaufmo. I don't like seeing you so stressed out.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'exhales',
    mood: 'worried',
    text: 'Okay. Okay okay okay. Then you should know — my best clue? I don\'t have it anymore.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: 'Great.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "A while back I caught Caine staring at some pictures. Just… staring. For ages. Not performing, not talking. Caine doesn't stop talking, Pomni.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: '…That is suspicious.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'happy',
    text: 'So I got Zooble in on it. She jumped out, gave him a scare, and he dropped them. It worked! Perfectly!',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: 'But.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'sad',
    text: "But Zooble had to keep him busy so I could grab them, so she's running all over the circus, Caine's chasing her, the pictures are getting kicked everywhere, and by the time it calmed down — gone. Scattered.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'And you never went back for them?',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "I've tried! But every time I get close I spot another sign, and I'm writing that down, and then I'm three rooms away and I forgot what I was doing.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'quietly',
    mood: 'sad',
    text: "It's getting harder to hold onto things.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'beat',
    mood: 'neutral',
    text: "Alright. I'll find them.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "There were five. I'm sure there were five. Bring them back to me? Please?",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'happy',
    text: 'Stay here. Try not to start a new list.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'happy',
    text: '…No promises.',
    next: null,
  },
];

// The complete sequence remains available as a standalone dialogue preview.
export const level2OpeningDialogue = [
  ...level2HallwayDialogue.map(node => ({ ...node, next: undefined })),
  ...level2RoomOpeningDialogue,
];

// --- Level 1: "Talk Her Down" (Ribbit) ---------------------------------
// Script by Dorsa Shahrokh. Starts with E at her hallway door, then
// continues inside. Four graded choices, each with four options: the button
// shows a short label, then Pomni says the line in full. The best answer
// earns 1 Escape point (`points: 1`); two others score 0 — they still
// advance, but change Ribbit's reply and Pomni has to walk it back — and
// the fourth (`points: -1`) ends the level on the spot: its branch ends in
// a `gameOver` beat whose text is the Game Over card's message (see
// src/levels/level1.js). Every other branch rejoins the main line.
// Choice-checking lives in src/dialogue/choiceTally.js.
// 'l1_shut_out' (after the win ending) is an unused lose scene, kept for
// if the failure ever plays out in dialogue before the Game Over card.
// `action` on a node names a stage direction the mission acts out in 3D
// when that node is shown (knock, enterRoom, sitBesideRibbit,
// ribbitSitsUp) — the text stays exactly as written.
export const level1RibbitDialogue = [
  {
    type: 'beat',
    action: 'knock',
    text: "Ribbit's room. The door is shut. Pomni knocks.",
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    direction: 'through the door',
    text: '…Go away. Unless you’re Caine. Actually, especially if you’re Caine.',
  },
  // CHOICE 1
  {
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“It’s Pomni”', next: 'l1_c1_a', points: 1 },
      { text: '“Caine sent me”', next: 'l1_c1_b', points: 0 },
      { text: '“Open”', next: 'l1_c1_c', points: 0 },
      { text: '“Nevermind”', next: 'l1_c1_d', points: -1 },
    ],
  },
  { id: 'l1_c1_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'It’s Pomni. I just wanted to see how you’re doing.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…Pomni? Fine. Door’s open.', next: 'l1_inside' },
  { id: 'l1_c1_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Caine sent me to see if you’re okay. He’s worried you’re going to abstract.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'He — what? Is that what everyone’s saying about me now?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'No. Sorry. That came out wrong. Can I come in?' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…Whatever. It’s open.', next: 'l1_inside' },
  { id: 'l1_c1_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'It’s me. Open up, I don’t have all day.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Then don’t spend it here.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: '…Okay, that was rude. Sorry. Can I come in?' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…It’s open.', next: 'l1_inside' },
  { id: 'l1_c1_d', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'On second thought, nevermind. I’m wasting my time anyway.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'WHY WOULD YOU KNOCK THEN?' },
  { type: 'beat', gameOver: true, text: 'Don’t be a bum', next: null },
  {
    id: 'l1_inside',
    type: 'beat',
    action: 'enterRoom',
    text: 'Inside, the room is dim. Ribbit is curled up on the bed. An empty mug hook hangs by the door.',
  },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Hey.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Hey.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'It’s quiet in here. You’re usually… not quiet.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Yeah, well. Turns out I’m a lot. Apparently.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Who said that?' },
  { type: 'beat', text: 'Silence.' },
  // CHOICE 2
  {
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“Jax?”', next: 'l1_c2_a', points: 0 },
      { text: '(Sit down next to her and wait.)', next: 'l1_c2_b', points: 1 },
      { text: '“Bounce back”', next: 'l1_c2_c', points: 0 },
      { text: '“Yeah.”', next: 'l1_c2_d', points: -1 },
    ],
  },
  { id: 'l1_c2_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Let me guess. Jax.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Don’t. Don’t say his name like it’s a punchline.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: 'Okay. Sorry.', next: 'l1_jax' },
  { id: 'l1_c2_b', type: 'line', action: 'sitBesideRibbit', speaker: 'ribbit', side: 'right', text: '…You’re not gonna make me talk?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Nope. I’m very good at sitting.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…Okay.', next: 'l1_jax' },
  { id: 'l1_c2_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Whatever it is, you’ll get over it. Everyone bounces back.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Do they? Because I’ve seen what happens to people who don’t.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: '…Yeah. Bad choice of words. Sorry.', next: 'l1_jax' },
  { id: 'l1_c2_d', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'You’re right, you are a lot. You should really work on that.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Why the hell are you here, Pomni? Just leave.' },
  { type: 'beat', gameOver: true, text: 'Why would you say that?', next: null },
  { id: 'l1_jax', type: 'line', speaker: 'ribbit', side: 'right', text: 'It was Jax.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'After every adventure, we have a tradition where Jax, Kaufmo and I hang out at the café. Hot chocolate, terrible jokes. It was the one normal thing in this whole place.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'He’s been getting so distant from us. We opened up to each other and after that he’s been acting horrible towards me. Snappier. So the other night I asked if he was okay. That’s it. That’s all I asked.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'And he just exploded. Said he can’t stand me anymore. That I’m loud and clingy, and the only reason anyone puts up with me is because nobody can leave.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Then he knocked my mug off the table and walked out.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: '…' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'And now I keep thinking… what if he’s right?' },
  // CHOICE 3
  {
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“He’s not”', next: 'l1_c3_a', points: 1 },
      { text: '“Well…”', next: 'l1_c3_b', points: 0 },
      { text: '“Stay away from him”', next: 'l1_c3_c', points: 0 },
      { text: '“He is”', next: 'l1_c3_d', points: -1 },
    ],
  },
  { id: 'l1_c3_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'He’s not right. He’s hurting, and he aimed it at the closest person.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…That’s not fair either.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'No. It’s not. But it’s not the truth about you.', next: 'l1_best_friend' },
  { id: 'l1_c3_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Well… you are pretty loud, I can’t lie.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…Great. Thanks. Really helpful.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'shocked', text: 'That — okay, I’m bad at this. Loud isn’t bad. It’s just… you.', next: 'l1_best_friend' },
  { id: 'l1_c3_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Maybe you should stay away from him for a while.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'So he wins? I lose my best friend and my hot chocolate?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: 'That’s not what I meant. Sorry.', next: 'l1_best_friend' },
  { id: 'l1_c3_d', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'I agree with him, he’s right about that. You are really annoying, no one likes a ‘pick-me’, Ribbit.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'You’re so messed up, get the hell out of my room!' },
  { type: 'beat', gameOver: true, text: 'You’re being the ‘pick-me’', next: null },
  { id: 'l1_best_friend', type: 'line', speaker: 'ribbit', side: 'right', text: 'He’s my best friend, Pomni. Was. Is? I don’t know.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'And it’s not just me. He’s been going after Kaufmo too.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'shocked', text: 'Kaufmo?' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Kaufmo’s got this theory. That there’s a way out. He’s been collecting stuff, writing everything down. He told Jax about it.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Jax laughed at him. Called him crazy. Keeps ridiculing and dismissing him.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'At first Kaufmo thought Jax was just being Jax, but he got more tense with his insults and it started getting to him.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Have you talked to him?' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'I couldn’t even get out of bed. Some friend I am.' },
  // CHOICE 4
  {
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“Take your time”', next: 'l1_c4_a', points: 1 },
      { text: '“He needs you”', next: 'l1_c4_b', points: 0 },
      { text: '“Don’t worry about him”', next: 'l1_c4_c', points: 0 },
      { text: '“So lazy”', next: 'l1_c4_d', points: -1 },
    ],
  },
  { id: 'l1_c4_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'You’re allowed to take a minute. I’ll check on him. You can come when you’re ready.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…You’d do that?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'Apparently I’m doing welfare checks today.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Okay.', next: 'l1_sits_up' },
  { id: 'l1_c4_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Yeah, he probably needs you more than you need to lie here.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: '…I know. You don’t have to rub it in.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'I didn’t mean — look. I’ll go. You don’t have to.', next: 'l1_sits_up' },
  { id: 'l1_c4_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Kaufmo’s a grown man. He’ll be fine.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'That’s what everyone says right before someone isn’t.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: '…Okay. I’ll check on him.', next: 'l1_sits_up' },
  { id: 'l1_c4_d', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'Gee, lazy much? You couldn’t even check up on your friend?' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Pomni, what’s wrong with you?' },
  { type: 'beat', gameOver: true, text: 'Genuinely what’s wrong with you? Seek help', next: null },
  {
    id: 'l1_sits_up',
    type: 'beat',
    action: 'ribbitSitsUp',
    text: 'Ribbit sits up slowly.',
  },
  {
    id: 'l1_recovery',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Thanks, Pomni. Really. I feel… less like a puddle.',
    // Swapped in by level1.js's lineFor when fewer than two picks were
    // right. Kept here rather than in level1.js so the voice generator
    // (tools/generateVoices.mjs) finds and records it too.
    altText: 'I’m still a mess. But… it helps that you stayed. I think I can sit up for a bit.',
  },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'High praise.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'If you see Kaufmo, tell him I’m on his side. Even if he’s acting a little crazy.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Will do.' },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'And Pomni? …If Jax ever wants to talk, tell him I’ll make the hot chocolate.',
    next: null,
  },
  // LOSE (not wired up): Ribbit shuts Pomni out. Nothing jumps here yet.
  {
    id: 'l1_shut_out',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'You know what? Forget it. I don’t need someone else telling me what’s wrong with me.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'worried',
    text: 'Ribbit, wait, I didn’t—',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Just go, Pomni. Please.',
  },
  {
    type: 'beat',
    text: 'Ribbit turns to the wall and pulls the blanket over her head. She isn’t listening anymore.',
    next: null,
  },
];

export const ribbitFollowupDialogue = [
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'I’m taking a minute. Thanks for checking on me. Kaufmo’s room is a few doors back toward the entrance.', next: null },
];

// --- Level 2: returning with the pictures ------------------------------
// Pomni hands Kaufmo everything she's found in one go (see pickKaufmoScript
// in src/state/level2Items.js): PHOTO_THRESHOLD (4) or more plays
// level2Return then level2Sendoff; fewer plays level2Abstraction, which
// ends in Game Over and a fresh search. `distress` on a line shakes the
// dialogue box (DialogueUI's distress levels 1-3) as he comes apart.

// Idle line for talking to him empty-handed mid-search.
export const level2IdleDialogue = [
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "Still looking? Don't stop on my account. Well — do stop. Just not for long.",
    next: null,
  },
];

// Revisiting him after the success scene.
export const level2CompleteDialogue = [
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'quieter than usual, focused',
    mood: 'neutral',
    text: "I'm working on it. I'll find you. Go — do whatever it is you were doing.",
    next: null,
  },
];

// Enough pictures (PHOTO_THRESHOLD or more). The beat ids are where
// main.js acts the photos out (actHandIn): handed over, spread on the
// floor, one tapped, gathered up, clutched.
export const level2ReturnDialogue = [
  { type: 'beat', text: 'Pomni returns with the pictures. Kaufmo is at his wall, scribbling. He looks round immediately.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'shocked', text: 'You’re back. You’re back! Did you — tell me you —' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'I got the pictures. As requested.' },
  { id: 'handsOver', type: 'beat', text: 'She hands them over. Kaufmo spreads them out on the floor and goes quiet.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'shocked', text: '…Oh.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'I looked at them on the way back. It’s just an office. Desks, chairs, a sad little plant. Kind of boring, honestly.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'worried', text: 'Exactly. Pomni, nothing in here is boring. Caine doesn’t do boring. Everything in this place is bright and loud and bouncing. But this?' },
  { id: 'tapsPicture', type: 'beat', text: 'He taps one of the pictures.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'worried', text: 'This is somewhere that just… exists. Somewhere nobody designed to be fun. That’s not his. That’s from outside.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'So why would Caine have pictures of it?' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'worried', text: 'That’s the question, isn’t it? Maybe he’s been there. Maybe he came from there. Maybe he’s just as stuck as we are and he’s not telling anyone.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: '…That’s a lot of maybes.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'It’s a lot more than I had an hour ago.' },
  { id: 'gathersPictures', type: 'beat', text: 'He gathers the pictures carefully and holds them against his chest. His voice is steadier now, closer to his usual laid-back self.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'These are the missing pieces, Pomni. I’ve been staring at half a puzzle for weeks. Now it’s starting to look like a picture.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'So what happens now?' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'neutral', text: 'Now I sit with it. Line it all up. Figure out where this place is, and how we get there.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'Once I’ve worked it out, I’ll come find you. I promise.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'You’re not going to wander off and start a new list?' },
  { type: 'line', speaker: 'kaufmo', side: 'right', direction: 'small laugh', mood: 'happy', text: 'Maybe a short one.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'neutral', text: '…Hey. Thanks. For not calling me crazy. Well, for not only calling me crazy.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'Don’t mention it. Seriously. Don’t mention it to anyone.' },
  { id: 'turnsBack', type: 'beat', text: 'Kaufmo grins and turns back to the pictures, already muttering, but calm this time.', next: null },
];

// Straight after level2Return, still in his room: the hand-off to Level 3.
export const level2SendoffDialogue = [
  { id: 'clutchingPictures', type: 'line', speaker: 'kaufmo', side: 'right', direction: 'clutching the pictures, voice shaking, but this time with excitement', mood: 'happy', text: 'These are it, Pomni. These are the missing pieces. I think… I think I can actually do this.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Take your time. Don’t let anyone tell you it’s not possible.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'I’ll come find you the second I have it. Don’t go anywhere too dangerous.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'We live in a digital circus. Everywhere is too dangerous.', next: null },
];

// Too few pictures: he comes apart. Ends in Game Over (main.js).
export const level2AbstractionDialogue = [
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'Pomni! You’re back. Tell me you found them. Please.' },
  { id: 'holdsOut', type: 'line', speaker: 'pomni', side: 'left', direction: 'holds out what she has', mood: 'worried', text: 'This is all I could find.' },
  { id: 'looksThemOver', type: 'beat', text: 'Kaufmo takes the pictures, looks them over, then past her as if the rest should be there.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'neutral', distress: 1, text: '…This is it? There should be more. There has to be more. I counted. The pattern doesn’t work with this.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Maybe we can keep looking. We can still—' },
  { id: 'itDoesntClose', type: 'line', speaker: 'kaufmo', side: 'right', mood: 'worried', distress: 2, text: 'No, no, no. It doesn’t close. Without the other pieces it doesn’t close. It’s just a picture of an office. It’s just an office.' },
  { type: 'beat', text: 'Kaufmo starts pacing in circles again, faster. Faint static creeps in at the edges of everything.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'sad', distress: 2, text: 'He said I was crazy. Jax said it, and everyone just… laughed. And I told myself I’d prove it. I just needed something real.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'shocked', text: 'Kaufmo, you’re not crazy. Hey. Look at me.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', direction: 'not hearing her', mood: 'shocked', distress: 3, text: 'What if I am? What if there’s no exit and I made it up, because I couldn’t stand it? What if it’s just a circus, and it’s always been just a circus?' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'shocked', distress: 3, text: 'The pieces don’t, they don’t, they don’t fit, there’s no way, there’s no way, there’s no—' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'shocked', text: 'Kaufmo! Stay with me! Please!' },
  { type: 'beat', distress: 3, text: 'His colours drain. He distorts and stretches while the room warps around him. The music cuts out to a single distorted tone.', next: null },
];

// The search clock runs out before Pomni is back: a cutaway to Kaufmo alone
// in his room, waiting, until he can't any more. The last beat (id
// 'abstracts') is where main.js plays the abstraction effect through, then
// Game Over and Level 2 starts again from the top (kaufmoOutOfTime).
export const level2TimeUpDialogue = [
  { type: 'beat', text: 'Meanwhile, in Kaufmo’s room. He’s pacing in circles, glancing at the door every few steps.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', direction: 'to himself', mood: 'worried', text: 'She’s coming back. She said she’d find them. She’s coming back.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'worried', distress: 1, text: 'How long does it take to find five pictures? I could’ve found five pictures. I could’ve found ten.' },
  { type: 'beat', text: 'He stops at the door and listens. Nothing. Faint static creeps in at the edges of everything.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'sad', distress: 2, text: 'She’s not coming. Nobody’s coming. They all think I made it up, and now she does too.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', direction: 'faster and faster', mood: 'shocked', distress: 3, text: 'No pictures, no pattern, no door, no exit, no, no, there’s no, there’s no—' },
  { id: 'abstracts', type: 'beat', distress: 3, text: 'His colours drain. He distorts and stretches until there’s nothing left of Kaufmo, just a dark, churning shape where he stood.', next: null },
];

// --- Level 2 into 3: Jax bolts, Ribbit in the hall ------------------------
// Dorsa's transition script. Played in the Dorm Hall outside Kaufmo's room
// once Level 2 is complete (levels/level3Hallway.js acts out its `action`s):
// Jax bolts past for the hall's exit, and Pomni sends Ribbit for the others
// instead of letting her follow.
export const level3HallwayDialogue = [
  { type: 'beat', action: 'jaxBolts', text: 'Jax bolts past her, toward the exit of the hallway.' },
  { type: 'line', speaker: 'pomni', side: 'left', direction: 'shouting after him', mood: 'shocked', text: 'Jax, wait!' },
  { type: 'beat', action: 'ribbitArrives', text: 'Footsteps. Ribbit walks up and stops when she sees Pomni calling out after Jax.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Pomni? Was that Jax?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'He ran out to the circus lobby. He was glitching, Ribbit. Something’s really wrong.' },
  { type: 'line', speaker: 'ribbit', side: 'right', direction: 'her voice drops', text: 'Is this because of me? Because of the fight?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'It’s not your fault. But I think it’s gotten bigger than the fight.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Then let’s go after him. Now.' },
  { type: 'beat', action: 'pomniStopsRibbit', text: 'Ribbit takes a step forward to follow. Pomni stops her, putting her arm out.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Wait. Not yet.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Pomni, he’s hurting. We can’t just stand here.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'I know. But I barely got a few sentences out and he bolted. If we both go charging in, he’ll feel cornered. I don’t think he’s ready to be confronted by us yet.' },
  { type: 'line', speaker: 'ribbit', side: 'right', direction: 'after a pause', text: '…Okay. So what do you need me to do?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Find the others. Gangle, Zooble, Ragatha, Kinger. Tell them what’s happening with Jax. And tell them about Kaufmo.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Kaufmo? What about him?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'happy', text: 'He’s in his room right now, working out the exit. I found the missing pieces he needed, and he thinks he can actually do it this time. Everyone should know it’s real, and that he’s not crazy.' },
  { type: 'line', speaker: 'ribbit', side: 'right', direction: 'a small, surprised smile, the first one in a while', text: 'He’s been saying it for so long. I’ll make sure they listen.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Thank you. I’ll meet you all back soon.' },
  { type: 'line', speaker: 'ribbit', side: 'right', direction: 'already turning to go', text: 'You’d better.' },
  { type: 'beat', action: 'ribbitLeaves', text: 'Ribbit heads back. Pomni turns to follow Jax.', next: null },
];

// --- Level 3 intro: Jax in the Lobby --------------------------------------
// Played when Pomni finds him in a corner of the Circus Lobby (levels/
// level3Lobby.js acts out its `action`s). He runs off through one of the
// bedroom doors along the wall, the one that leads into the maze.
export const level3JaxDialogue = [
  { type: 'beat', text: 'Jax is alone in a corner of the circus lobby, back turned. He moves in jerky little stutters, like a skipping recording.' },
  { type: 'line', speaker: 'jax', side: 'right', direction: 'without turning around', text: 'Oh look, it’s the circus’s resident problem solver. Let me guess. Ribbit sent you. Or the bowling nerd.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Nobody sent me. I just wanted to talk.' },
  { type: 'line', action: 'jaxTurns', speaker: 'jax', side: 'right', text: 'Talk. Great. That’s always so productive.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Everyone’s worried about you, Jax. Ribbit, Kaufmo… you’ve been calling people crazy and snapping at everyone who walks by.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Because it’s true, Pomni. We’re stuck in a circus, there is no exit, and somebody has to say it. Does anybody ever listen to me? No.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'That’s not what this is. You’re not okay, and I think you know that.' },
  { type: 'beat', action: 'jaxGlitches', distress: 2, text: 'Jax stiffens. A glitch tears across him for a split second, and the sound crackles.' },
  { type: 'line', speaker: 'jax', side: 'right', direction: 'quietly, almost to himself', distress: 1, text: 'I’m fine. I’m fine. Stop looking at me like that.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Jax…' },
  { type: 'line', speaker: 'jax', side: 'right', distress: 2, text: 'Stop it!' },
  { type: 'beat', action: 'jaxRunsOff', text: 'Jax runs off along the row of doors and slips through one of them, into the maze.', next: null },
];

// level2Return and level2Sendoff back to back: one conversation in his room.
export const level2ReturnAndSendoffDialogue = [
  ...level2ReturnDialogue.map((node, i, all) => (i === all.length - 1 ? { ...node, next: undefined } : node)),
  ...level2SendoffDialogue,
];

// --- Level 3.2: "Face to Face" (the Last Act) ---------------------------
// Starts by itself when Pomni reaches Jax with both keepsakes (main.js,
// levels/mazeEncounter.js); intentionally separate from the Dorm Hall
// intro. Five graded choices, three options each: the best answer earns
// 1 point toward Jax's Fate (src/state/jaxFate.js), the other two earn 0
// and get a colder reply. Every branch rejoins the main line, so every
// playthrough answers all five. Nodes carry ids so an interrupted
// conversation resumes where it was (mazeEncounter's resumeAt).
//
// At the 'jaxFate' beat main.js decides his fate once (nextFor): enough
// points and it falls through to 'jaxSaved'; too many bad choices and it
// goes to 'jaxBreaks', where he abstracts on the 'jaxAbstracts' beat (the
// shared abstraction effect, awaited) and Pomni leaves the maze alone, on
// to the bittersweet ending. Jax's static follows jaxFate's distress line
// by line; a line's own `distress` overrides it.
export const level3JaxFinalDialogue = [
  { id: 'jf_open', type: 'beat', text: 'The Last Act. Pomni steps onto the stage. Jax is hunched at its centre, flickering like a bad signal.' },
  { id: 'jf_found', type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Jax? I’ve been looking everywhere for you.' },
  { id: 'jf_congrats', type: 'line', speaker: 'jax', side: 'right', text: '…Well, congratulations. You found me. Want a prize? There’s a whole maze of them.' },
  { id: 'jf_okay', type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Are you okay?' },
  { id: 'jf_look', type: 'line', speaker: 'jax', side: 'right', text: 'Do I look okay to you?' },
  // CHOICE 1
  {
    id: 'jf_c1',
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“No. That’s why I came.”', next: 'jf_c1_a', points: 1 },
      { text: '“You look fine”', next: 'jf_c1_b', points: 0 },
      { text: '“Ribbit sent me”', next: 'jf_c1_c', points: 0 },
    ],
  },
  { id: 'jf_c1_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'No. You don’t. That’s why I came.' },
  { type: 'line', speaker: 'jax', side: 'right', direction: 'caught off guard', text: '…Huh. Most people take the hint when I run.', next: 'jf_c1_done' },
  { id: 'jf_c1_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Honestly? You look fine. Kind of dramatic, but fine.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Great. Glad my breakdown’s entertaining.', next: 'jf_c1_done' },
  { id: 'jf_c1_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Ribbit’s really worried. She asked me to find you.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Of course she did. Send someone in to tell me how much I hurt her feelings. Real subtle.', next: 'jf_c1_done' },
  { id: 'jf_c1_done', type: 'line', speaker: 'jax', side: 'right', text: 'So what is this? An intervention? Did Caine make you little cue cards?' },
  { id: 'jf_gifts', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'I brought you something.' },
  { id: 'jf_gifts_beat', type: 'beat', text: 'Pomni holds out the bowling ball and the mug of hot chocolate. Jax goes very still.' },
  { id: 'jf_where', type: 'line', speaker: 'jax', side: 'right', text: '…Where did you get those?' },
  // CHOICE 2
  {
    id: 'jf_c2',
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“I think they’re yours”', next: 'jf_c2_a', points: 1 },
      { text: '“Take them and talk”', next: 'jf_c2_b', points: 0 },
      { text: '“Proof you were wrong”', next: 'jf_c2_c', points: 0 },
    ],
  },
  { id: 'jf_c2_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'They were in here, in the maze. I think they’re yours. Bowling with Kaufmo. The café with Ribbit.' },
  { type: 'line', speaker: 'jax', side: 'right', direction: 'quietly', text: 'Bowling nights. And hot chocolate after. …I thought I’d thrown all that out.', next: 'jf_c2_done' },
  { id: 'jf_c2_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'Doesn’t matter. Take them, and then you have to talk to me.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Oh, it’s a trade. Cool. Love being bribed with my own junk.', next: 'jf_c2_done' },
  { id: 'jf_c2_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Kaufmo and Ribbit still care about you. These prove you were wrong about them.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Wow. Okay. Thanks for keeping score.', next: 'jf_c2_done' },
  { id: 'jf_c2_done', type: 'line', speaker: 'jax', side: 'right', text: 'You know what I said to them, right? To both of them.' },
  { id: 'jf_heard', type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: 'I heard.' },
  { id: 'jf_bad_guy', type: 'line', speaker: 'jax', side: 'right', text: 'Then you know I’m the bad guy here. So why are you still standing there?' },
  // CHOICE 3
  {
    id: 'jf_c3',
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“It was awful. You’re not.”', next: 'jf_c3_a', points: 1 },
      { text: '“They had it coming”', next: 'jf_c3_b', points: 0 },
      { text: '“So apologise”', next: 'jf_c3_c', points: 0 },
    ],
  },
  { id: 'jf_c3_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'What you said was awful. That doesn’t make you awful. People say things when they’re scared.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'I’m not scared.' },
  { type: 'beat', text: 'Pomni waits.' },
  { type: 'line', speaker: 'jax', side: 'right', text: '…Okay. Maybe a little.', next: 'jf_c3_done' },
  { id: 'jf_c3_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'Honestly, Kaufmo can be a lot. Maybe they had some of it coming.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Don’t. Don’t do that. They didn’t.', next: 'jf_c3_done' },
  { id: 'jf_c3_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'So say sorry. Problem solved. Can we go now?' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Yeah, sure. Just glue it all back together. Easy.', next: 'jf_c3_done' },
  { id: 'jf_c3_done', type: 'line', speaker: 'jax', side: 'right', text: 'You want to know the real joke? Kaufmo keeps saying there’s a way out. And every time he says it, I want to believe him so badly it makes me sick.' },
  { id: 'jf_hope', type: 'line', speaker: 'jax', side: 'right', text: 'Because what if he’s wrong? What if I let myself hope, and it’s just… more circus?' },
  // CHOICE 4
  {
    id: 'jf_c4',
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“He’s close, Jax”', next: 'jf_c4_a', points: 1 },
      { text: '“Maybe you’re right”', next: 'jf_c4_b', points: 0 },
      { text: '“Stop being so negative”', next: 'jf_c4_c', points: 0 },
    ],
  },
  { id: 'jf_c4_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'He’s close, Jax. I found the pieces he needed. He really thinks there’s a way out this time.' },
  { type: 'line', speaker: 'jax', side: 'right', text: '…You’re serious.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'I don’t joke. You’ve met me.' },
  { type: 'line', speaker: 'jax', side: 'right', text: '…Yeah. You’re kind of a downer like that.', next: 'jf_c4_done' },
  { id: 'jf_c4_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: 'Maybe you’re right. Maybe hoping just makes it worse.' },
  { type: 'line', speaker: 'jax', side: 'right', text: '…Yeah. Thanks. That’s exactly what I needed to hear.', next: 'jf_c4_done' },
  { id: 'jf_c4_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'You can’t just decide it’s hopeless. Stop being so negative.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Oh, I can’t? Watch me.', next: 'jf_c4_done' },
  { id: 'jf_c4_done', type: 'beat', text: 'The static flares. For a second, half of Jax isn’t there at all.' },
  { id: 'jf_go_back', type: 'line', speaker: 'jax', side: 'right', text: 'I don’t know how to go back out there. I don’t know how to look at them.' },
  // CHOICE 5
  {
    id: 'jf_c5',
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“Come back with me”', next: 'jf_c5_a', points: 1 },
      { text: '“That’s on you”', next: 'jf_c5_b', points: 0 },
      { text: '“Stay here, then”', next: 'jf_c5_c', points: 0 },
    ],
  },
  { id: 'jf_c5_a', type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'You don’t have to know yet. Just come back with me. We’ll work out the rest together.' },
  { type: 'line', speaker: 'jax', side: 'right', text: '…Together. Ugh. You sound like Ragatha.', next: 'jaxFate' },
  { id: 'jf_c5_b', type: 'line', speaker: 'pomni', side: 'left', mood: 'annoyed', text: 'That’s kind of on you, isn’t it? You made the mess.' },
  { type: 'line', speaker: 'jax', side: 'right', text: '…Right. Yeah. It is.', next: 'jaxFate' },
  { id: 'jf_c5_c', type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'If you’re not ready, stay. I’ll tell them you’re fine.' },
  { type: 'line', speaker: 'jax', side: 'right', text: 'Sure. Leave the problem in the maze. Everyone else does.', next: 'jaxFate' },
  // Where his fate is decided (see above). Without main.js deciding it
  // (a dialogue preview), it falls through to the saved ending.
  { id: 'jaxFate', type: 'beat', text: 'Jax looks at the bowling ball, then the mug, then at Pomni.' },
  { id: 'jaxSaved', type: 'beat', text: 'The static on him thins, then fades. He straightens up, just a little.' },
  { id: 'jf_saved_come', type: 'line', speaker: 'jax', side: 'right', text: '…Okay. Okay. I’ll come. Don’t make it weird.' },
  { id: 'jf_saved_weird', type: 'line', speaker: 'pomni', side: 'left', mood: 'happy', text: 'I would never make it weird.' },
  { id: 'jf_saved_thanks', type: 'line', speaker: 'jax', side: 'right', text: 'You’re making it weird right now. …Thanks, Pomni. For coming after me.', next: null },
  { id: 'jaxBreaks', type: 'line', speaker: 'jax', side: 'right', distress: 3, text: 'No. No, see, this is what I was saying. There’s nothing to go back to. There’s nothing, there’s no, there’s no—' },
  { id: 'jf_breaks_stay', type: 'line', speaker: 'pomni', side: 'left', mood: 'shocked', text: 'Jax! Jax, look at me. Stay with me!' },
  { id: 'jf_breaks_ribbit', type: 'line', speaker: 'jax', side: 'right', distress: 3, text: 'Tell Ribbit… tell her the mug was… tell her I…' },
  { id: 'jaxAbstracts', type: 'beat', distress: 3, text: 'His colours drain. He stretches and tears until there’s nothing left of Jax, just a dark, churning shape at the centre of the stage.' },
  { id: 'jf_gone_quiet', type: 'beat', text: 'The maze goes quiet. Pomni stands there for a long time, still holding the mug.' },
  { id: 'jf_gone_sorry', type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: '…I’m sorry, Jax. I’m so sorry.', next: null },
];

// --- Ending: "Way Out", the bittersweet variant --------------------------
// Jax abstracted in Face to Face, but the Escape Threshold was cleared
// (src/game/endings.js). Pomni walks out of the maze alone and main.js
// plays this in the Circus Lobby, then the ending card.
export const endingBittersweetDialogue = [
  { type: 'beat', text: 'Pomni comes out of the maze alone. Caine is hovering by the entrance, waiting.' },
  { type: 'line', speaker: 'caine', side: 'right', mood: 'happy', text: 'Pomni! You’re back! And you’re… alone. Where’s Jax?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: 'He didn’t make it, Caine. He abstracted.' },
  { type: 'line', speaker: 'caine', side: 'right', direction: 'the showman voice gone', mood: 'sad', text: '…Oh. Oh, no. I really thought, if anyone could reach him…' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: 'So did I.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'But Kaufmo was right. There’s a way out. Can you get everyone here? Everyone.' },
  { type: 'beat', text: 'Caine snaps his fingers. With a pop, the whole circus is standing in the Lobby: Ragatha, Kinger, Gangle, Zooble, Ribbit and Kaufmo.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'It’s real. The pieces fit. I can show you the way out, all of you.' },
  { type: 'line', speaker: 'ribbit', side: 'right', direction: 'looking past Pomni, at the maze', text: 'Pomni… where’s Jax?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'sad', text: 'I’m sorry, Ribbit.' },
  { type: 'beat', text: 'Ribbit doesn’t say anything. Kaufmo puts a hand on her shoulder.' },
  { type: 'line', speaker: 'caine', side: 'right', mood: 'worried', text: 'And, ah, what about me? I’m not sure I can go anywhere. I’m sort of… the building.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'neutral', text: 'Then we take you with us. On our phones. You’re not getting left behind.' },
  { type: 'line', speaker: 'ribbit', side: 'right', text: 'Nobody else gets left behind.' },
  { type: 'beat', text: 'One by one, they step through the exit. Pomni goes last, and looks back once at the maze, where Jax should be.', next: null },
];

// --- Ending (KAN-85, KAN-89, KAN-95) ---------------------------------------
// After the maze exit (main.js leaveMaze/playEnding), in two parts, acted
// out by cutscenes/endingCutscene.js (each `action`). First the Circus
// Lobby, just outside the maze door: Pomni comes out, with Jax or alone,
// the others are waiting, and they talk until Kaufmo says he's found the
// exit. Then the exit door itself, where they leave one by one. One of each
// per ENDING_VARIANTS entry. Gangle, Zooble and Kinger have no lines until
// their models exist (KAN-90).
export const endingLobbySavedDialogue = [
  { type: 'beat', action: 'walkOut', text: 'Pomni and Jax step out of the maze door into the circus lobby. Everyone is waiting.' },
  { type: 'line', action: 'groupReacts', speaker: 'ragatha', side: 'right', direction: 'rushing forward', text: 'Pomni! Jax! You’re both okay!' },
  { type: 'line', speaker: 'jax', side: 'right', direction: 'hands in his pockets', text: 'Don’t make it weird.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'You found him! I told you the pieces would lead somewhere!' },
  { type: 'line', speaker: 'ribbit', side: 'right', direction: 'quietly', text: 'Welcome back, Jax.' },
  { type: 'line', action: 'jaxLooksAway', speaker: 'jax', side: 'right', text: '…Yeah. Whatever. Thanks, I guess.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'happy', text: 'Nobody gave up on you. That’s the only reason I could find you.' },
  { type: 'line', action: 'kaufmoExit', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'Speaking of finding things… I did it. I found the exit. The real one. Come on, everyone, let’s go!' },
  { type: 'beat', text: 'Kaufmo leads them all across the circus.', next: null },
];

export const endingLobbyAbstractedDialogue = [
  { type: 'beat', action: 'walkOut', text: 'Pomni steps out of the maze door alone, slowly, arms hanging at her sides.' },
  { type: 'line', action: 'groupReacts', speaker: 'ragatha', side: 'right', mood: 'happy', text: 'Pomni! You made it out!' },
  { type: 'line', action: 'groupRealises', speaker: 'ragatha', side: 'right', direction: 'her smile fading', text: '…Where’s Jax?' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'I’m sorry. I was too late. He was already… gone.' },
  { type: 'beat', action: 'grief', text: 'Nobody says anything for a long moment.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'sad', text: 'No. No, he can’t be. He was the one who kept telling me I was crazy…' },
  { type: 'line', speaker: 'ribbit', side: 'right', direction: 'barely above a whisper', text: 'He always acted like nothing could get to him.' },
  { type: 'line', speaker: 'ragatha', side: 'right', direction: 'putting a hand on Pomni’s shoulder', text: 'You went in after him, Pomni. You did more than any of us did.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'Then why does it feel like my fault?' },
  { type: 'line', action: 'kaufmoExit', speaker: 'kaufmo', side: 'right', mood: 'sad', direction: 'after a while', text: '…I found the exit. The real one. I don’t think he’d want us to stay here. Let’s go.' },
  { type: 'beat', text: 'Kaufmo leads them all across the circus.', next: null },
];

// The exit door: the same for both until the last of them have gone.
const exitDoorOpening = [
  { type: 'beat', action: 'gathered', text: 'A plain door at the very edge of the circus, light pouring out around it. None of them had ever noticed it before.' },
  { type: 'line', speaker: 'kaufmo', side: 'right', mood: 'happy', text: 'This is it. I checked it a hundred times. It’s real.' },
  { type: 'beat', action: 'caineArrives', text: 'Caine pops into the air beside them.' },
  { type: 'line', speaker: 'caine', side: 'right', mood: 'shocked', text: 'Leaving? All of you? Well! I suppose every show has its final curtain.' },
  { type: 'line', speaker: 'ragatha', side: 'right', text: 'Thank you for everything, Caine. Really.' },
  { type: 'line', speaker: 'caine', side: 'right', mood: 'happy', text: 'Oh, stop it. Go on, go on! Before I get sentimental!' },
  { type: 'beat', action: 'kaufmoLeaves', text: 'Kaufmo goes first, without looking back.' },
  { type: 'beat', action: 'ribbitLeaves', text: 'Ribbit follows him through.' },
  { type: 'beat', action: 'ragathaLeaves', text: 'Ragatha squeezes Pomni’s hand, and goes.' },
];

export const exitDoorSavedDialogue = [
  ...exitDoorOpening,
  { type: 'line', speaker: 'jax', side: 'right', direction: 'almost a smile', text: 'Don’t get sentimental on me, Pomni.' },
  { type: 'beat', action: 'jaxLeaves', text: 'Jax shrugs, and strolls through like it’s nothing.' },
  { type: 'line', speaker: 'caine', side: 'right', mood: 'happy', text: 'Goodbye, Pomni.' },
  { type: 'beat', action: 'pomniLeaves', text: 'Pomni steps into the light.', next: null },
];

export const exitDoorAbstractedDialogue = [
  ...exitDoorOpening,
  { type: 'beat', action: 'pomniLooksBack', text: 'Pomni looks back at the circus one last time.' },
  { type: 'line', speaker: 'pomni', side: 'left', mood: 'worried', text: 'I’m sorry, Jax.' },
  { type: 'line', speaker: 'caine', side: 'right', mood: 'sad', text: 'Goodbye, Pomni.' },
  { type: 'beat', action: 'pomniLeaves', text: 'Pomni steps into the light.', next: null },
];
