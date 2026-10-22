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
    mood: 'annoyed',
    text: 'Another day trapped in a nightmare circus run by a sentient cartoon. Same as yesterday.',
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
    text: "Caine's got something planned today, I think. He was doing that thing where he mutters to himself and draws diagrams nobody asked for.",
  },
  {
    type: 'line',
    anim: { ragatha: 'listen' },
    speaker: 'pomni',
    side: 'left',
    direction: 'deadpan',
    mood: 'annoyed',
    text: 'Thrilling. Another one of his "brilliant" ideas.',
  },
  {
    // The hallway cutaway plays before this brief narrative beat.
    id: 'jaxPassByText',
    type: 'beat',
    text: 'Jax storms past.',
  },
  {
    id: 'afterJaxPassBy',
    type: 'line',
    anim: { ragatha: 'watch' },
    speaker: 'ragatha',
    side: 'right',
    direction: 'watching him go, dropping the upbeat tone',
    text: "...He's been like that for days now.",
  },
  {
    type: 'line',
    anim: { ragatha: 'worried' },
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "He's always like that.",
  },
  {
    type: 'line',
    anim: { ragatha: 'worried' },
    speaker: 'ragatha',
    side: 'right',
    text: 'Not like this. Not since the thing with Ribbit.',
  },
  {
    type: 'line',
    anim: { ragatha: 'worried' },
    speaker: 'pomni',
    side: 'left',
    direction: 'pause, uneasy',
    mood: 'worried',
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
    mood: 'happy',
    text: 'POMNI! Just the digital being I wanted to see!',
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
    text: "Rude, but fair. Listen — this is going to sound like a normal circus update, and then it's going to stop sounding like that.",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'his tone shifts, energy dims slightly',
    mood: 'worried',
    text: "Jax and Ribbit had... words. Bad ones. And Jax has been Jax-ing harder than usual ever since. More bite, less bit, if you know what I mean.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: "Jax is always a jerk, that's not exactly breaking news—",
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
    text: "Abstraction! There it is! The A-word! The one I don't like saying out loud because saying it makes it feel closer!",
  },
  {
    type: 'line',
    speaker: 'caine',
    side: 'right',
    direction: 'beat, quieter, almost pleading under the performance',
    mood: 'sad',
    text: "If she tips over, she's not coming back as herself, Pomni. Whatever's left afterward — that's not Ribbit anymore. That's just... noise wearing her shape.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: "So what, you want me to fix a fight I wasn't even part of?",
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
    mood: 'happy',
    text: 'Her door is at the far end of the hall, on the left. I’ll check on everyone else. Just make sure she isn’t alone.',
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
    text: "—three on the left wall, one by the stage, and the door that wasn't a door… no, no, that one counts, that one has to count…",
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
    text: 'Kaufmo? Hey. You just ran past me like I was furniture.',
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
      { text: "You think there's a way out.", next: 'c1_c' },
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
    text: "I don't think. I know.",
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
    text: "Because if I'm wrong… (beat) then I'm just the guy walking in circles talking to himself.",
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
    text: 'And he laughed. Called me crazy. Said I should go lie down before I glitch out in front of everyone.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: '…That is a very Jax thing to say.',
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
      { text: "You're not crazy.", next: 'c2_b' },
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
    mood: 'sad',
    text: "You don't know that. I don't even know that. (beat) …But thanks.",
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
    mood: 'annoyed',
    text: 'I\'ve got nothing better to do. Literally. Caine scheduled my afternoon as "free."',
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
    text: 'Of course you don\'t.',
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
    text: 'So I got Ribbit in on it. She jumped out, gave him a scare, and he dropped them. It worked! Perfectly!',
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
    text: "But Ribbit had to keep him busy so I could grab them, so she's running all over the circus, Caine's chasing her, the pictures are getting kicked everywhere, and by the time it calmed down — gone. Scattered.",
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
    text: "There were three. I'm sure there were three. Bring them back to me? Please?",
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
// continues inside. Four graded choices: the best answer earns 1 Escape
// point (`points: 1`), the others 0 — they still advance, but change
// Ribbit's reply and Pomni has to walk it back. Every option's branch
// rejoins the main line. Win/lose: each pick also moves Ribbit's distress
// (src/dialogue/distressMeter.js). Finish the talk before it peaks and
// Ribbit is steadied (the win, ending on the hot chocolate line); let it
// peak and, right after her reply to that pick, level1.js jumps to
// 'l1_shut_out' — she throws Pomni out and the level is lost.
// Choice-checking lives in src/dialogue/choiceTally.js;
// src/levels/level1.js owns the encounter.
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
      { text: '“It’s Pomni. I just wanted to see how you’re doing.”', next: 'l1_c1_a', points: 1 },
      { text: '“Caine sent me. He’s worried you’re going to abstract.”', next: 'l1_c1_b', points: 0 },
      { text: '“It’s me. Open up, I don’t have all day.”', next: 'l1_c1_c', points: 0 },
    ],
  },
  {
    id: 'l1_c1_a',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…Pomni? Fine. Door’s open.',
    next: 'l1_inside',
  },
  {
    id: 'l1_c1_b',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'He — what? Is that what everyone’s saying about me now?',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'worried',
    text: 'No. Sorry. That came out wrong. Can I come in?',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…Whatever. It’s open.',
    next: 'l1_inside',
  },
  {
    id: 'l1_c1_c',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Then don’t spend it here.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'sad',
    text: '…Okay, that was rude. Sorry. Can I come in?',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…It’s open.',
  },
  {
    id: 'l1_inside',
    type: 'beat',
    action: 'enterRoom',
    text: 'Inside, the room is dim. Ribbit is curled up on the bed. An empty mug hook hangs by the door.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'Hey.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Hey.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'worried',
    text: 'It’s quiet in here. You’re usually… not quiet.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Yeah, well. Turns out I’m a lot. Apparently.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'worried',
    text: 'Who said that?',
  },
  {
    type: 'beat',
    text: 'Silence.',
  },
  // CHOICE 2
  {
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“Let me guess. Jax.”', next: 'l1_c2_a', points: 0 },
      { text: '(Sit down next to her and wait.)', next: 'l1_c2_b', points: 1 },
      { text: '“Whatever it is, you’ll get over it. Everyone here bounces back.”', next: 'l1_c2_c', points: 0 },
    ],
  },
  {
    id: 'l1_c2_a',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Don’t. Don’t say his name like it’s a punchline.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'sad',
    text: 'Okay. Sorry.',
    next: 'l1_jax',
  },
  {
    id: 'l1_c2_b',
    type: 'line',
    action: 'sitBesideRibbit',
    speaker: 'ribbit',
    side: 'right',
    text: '…You’re not gonna make me talk?',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'Nope. I’m very good at sitting.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…Okay.',
    next: 'l1_jax',
  },
  {
    id: 'l1_c2_c',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Do they? Because I’ve seen what happens to people who don’t.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'sad',
    text: '…Yeah. Bad choice of words. Sorry.',
  },
  {
    id: 'l1_jax',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'It was Jax.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Every night after the show, we’d hang out at the café. Hot chocolate, terrible jokes. It was the one normal thing in this whole place.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'He’s been getting worse lately. Snappier. So the other night I asked if he was okay. That’s it. That’s all I asked.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'And he just exploded. Said he never wanted me tagging along. That I’m loud and clingy, and the only reason anyone puts up with me is because nobody can leave.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Then he knocked my mug off the table and walked out.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'sad',
    text: '…',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'And now I keep thinking… what if he’s right?',
  },
  // CHOICE 3
  {
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“What he said was cruel. It doesn’t make it true. You don’t owe him a conversation right now.”', next: 'l1_c3_a', points: 1 },
      { text: '“Well… you are pretty loud.”', next: 'l1_c3_b', points: 0 },
      { text: '“Just stop thinking about him. Problem solved.”', next: 'l1_c3_c', points: 0 },
    ],
  },
  {
    id: 'l1_c3_a',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…I don’t know how to stop hearing it in my head.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'You don’t have to figure it all out today. I can stay for a bit.',
    next: 'l1_best_friend',
  },
  {
    id: 'l1_c3_b',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…Great. Thanks. Really helpful.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'shocked',
    text: 'That — okay, I’m bad at this. Loud isn’t bad. It’s just… you.',
    next: 'l1_best_friend',
  },
  {
    id: 'l1_c3_c',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'He’s my best friend. I can’t just switch that off.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'sad',
    text: '…Right. Sorry. That was too easy for me to say.',
  },
  {
    id: 'l1_best_friend',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'He’s my best friend, Pomni. Was. Is? I don’t know.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'And it’s not just me. He’s been going after Kaufmo too.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'shocked',
    text: 'Kaufmo?',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Kaufmo’s got this theory. That there’s a way out. He’s been collecting stuff, writing everything down. He told Jax about it.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Jax laughed at him. Called him crazy.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Kaufmo laughed too, but… I know that laugh. It’s the one I do.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'worried',
    text: 'Have you talked to him?',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'I couldn’t even get out of bed. Some friend I am.',
  },
  // CHOICE 4
  {
    type: 'choice',
    speaker: 'pomni',
    options: [
      { text: '“You’re allowed to take a minute. I’ll check on him. You can come when you’re ready.”', next: 'l1_c4_a', points: 1 },
      { text: '“Yeah, he probably needs you more than you need to lie here.”', next: 'l1_c4_b', points: 0 },
      { text: '“Kaufmo’s a grown man. He’ll be fine.”', next: 'l1_c4_c', points: 0 },
    ],
  },
  {
    id: 'l1_c4_a',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…You’d do that?',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: 'Apparently I’m doing welfare checks today.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'Okay.',
    next: 'l1_sits_up',
  },
  {
    id: 'l1_c4_b',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: '…I know. You don’t have to rub it in.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'worried',
    text: 'I didn’t mean — look. I’ll go. You don’t have to.',
    next: 'l1_sits_up',
  },
  {
    id: 'l1_c4_c',
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'That’s what everyone says right before someone isn’t.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'sad',
    text: '…Okay. I’ll check on him.',
  },
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
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: 'High praise.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'If you see Kaufmo, tell him I’m on his side. Tell him I believe him.',
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: 'Will do.',
  },
  {
    type: 'line',
    speaker: 'ribbit',
    side: 'right',
    text: 'And Pomni? …If Jax ever wants to talk, tell him I’ll make the hot chocolate.',
    next: null,
  },
  // LOSE: only reached by level1.js's jump once Ribbit's distress peaks.
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

// --- Level 2 hand-in: presenting pictures to Kaufmo ---------------------
// main.js picks which of these to play based on how many pictures have
// been presented in total once this hand-in is counted (see itemState in
// main.js and the interact() callback in kaufmoRoom.js) — these aren't
// player choices, they're Kaufmo's reaction to the running count.

export const level2HandIn1Dialogue = [
  {
    type: 'beat',
    text: 'Pomni holds out a photo. Kaufmo stops pacing.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: "Wait — wait, is that— that's one of them! That's a real one!",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'turning it over in his hands',
    mood: 'worried',
    text: "Okay. Okay, this is good. This is one. There's more though, right? I remember there being more.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "I'll keep looking.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "Please. One isn't enough to prove anything. One is just a coincidence. I need the rest.",
    next: null,
  },
];

export const level2HandIn2Dialogue = [
  {
    type: 'beat',
    text: 'Pomni holds out another photo.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'happy',
    text: "Two! That's two now! Look — look at the corner of this one, that's the same carpet as the first. Same place.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "So it's really one office. Not just random junk.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "Right! Exactly! That's two confirmed. There are more out there — I remember there being more. Keep looking.",
    next: null,
  },
];

export const level2HandIn3Dialogue = [
  {
    type: 'beat',
    text: 'Pomni holds out a third photo.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: "Three now. More than half, Pomni. This isn't nothing anymore.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "You keep saying that at every one.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'half-laugh, half not',
    mood: 'worried',
    text: "I mean it more each time. Two left. I can feel it getting clearer.",
    next: null,
  },
];

export const level2HandIn4Dialogue = [
  {
    type: 'beat',
    text: 'Pomni holds out a fourth photo. Kaufmo nearly drops it grabbing for it.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: "Four. Four, Pomni. One left. Just one.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'worried',
    text: "You okay? You look like you're about to vibrate out of your shoes.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'not okay, clearly',
    mood: 'worried',
    text: "I'm fine. I'm fine. Find the last one and I'm fine.",
    next: null,
  },
];

export const level2HandIn5Dialogue = [
  {
    type: 'beat',
    text: 'Pomni holds out the last photo. Kaufmo goes very still.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: 'Five.',
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'quiet, almost to himself',
    mood: 'happy',
    text: "Five. These were it. These were the missing pieces, Pomni — I wasn't imagining it, I wasn't crazy, I just didn't have the whole picture. Now I do.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'happy',
    text: "So what happens now?",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "Now I work out what it means. Give me — I don't know how long. But I'll come find you once I have the answer. I promise.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    direction: 'small smile',
    mood: 'happy',
    text: "Try not to lose them this time.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'happy',
    text: "…No promises.",
    next: null,
  },
];

// Idle lines for revisiting him between hand-ins (holding nothing new).
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

// Idle line once all three have been handed in, before he comes to find her.
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

// The payoff level2CompleteDialogue promises: the next time Pomni comes
// back, Kaufmo has an answer. Plays once in place of the idle "still
// working on it" line, then main.js keeps replaying it for any later
// visits — same as every other idle/complete script in this file.
export const level2PayoffDialogue = [
  {
    type: 'beat',
    text: "Kaufmo's on his feet before the door's even shut behind her.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'shocked',
    text: "Okay — okay, don't leave yet, I laid them all out, just— look.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'neutral',
    text: "You found something.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'happy',
    text: "Same carpet in all three. Same baseboard. There's a water stain in the corner of two of them, same shape, same spot. It's not three places, Pomni. It's one room.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    direction: 'quieter',
    mood: 'worried',
    text: "And Caine's been keeping pictures of it. Hiding them, even. You don't hide a photo of nothing.",
  },
  {
    type: 'line',
    speaker: 'pomni',
    side: 'left',
    mood: 'annoyed',
    text: "Okay. Slow down. A room — where?",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'worried',
    text: "That's the part I don't have yet. But a room that real doesn't just float in nowhere. It's behind something. A wall that isn't a wall. A door marked as something it's not.",
  },
  {
    type: 'line',
    speaker: 'kaufmo',
    side: 'right',
    mood: 'neutral',
    text: "Remember that? 'The door that wasn't a door'? I wrote it off as a glitch. I don't think it was.",
    next: null,
  },
];
