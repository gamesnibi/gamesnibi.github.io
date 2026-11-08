// Bramble's speech bubble: say() shows a line he hasn't said in his last three, then fades it out.
// The lines are his own, from the game (waiting for Josh's OK in the preview).
export const LINES = [
  "Ahoy, angler! Mind the third floorboard. It bites.",
  "Step right up! Everything's on sale. Except Gerald. Gerald is a worm and he is not for sale.",
  "You again! The trout said you'd be back. They gossip, you know.",
  "Oh good, a visitor! I was about to start talking to the barrel again.",
  "I once arm-wrestled a catfish. It was a draw. We're still friends.",
  "This hat has been struck by lightning twice. It's magnetic now.",
  "They call me Barnaby the Brave. Mostly I call myself that.",
  "Take your time. I'll just be here, alphabetising worms.",
  "Anything catch your eye? Besides my magnificent beard?",
  "Old Mossback owes me three nets and an apology.",
  "Tight lines! Come back soon!"
];

const MEMORY = 3;

// hideAfter: ms the bubble stays up (0 keeps it up); by default long enough to read the line
export function createBubble(el, lines = LINES, { hideAfter = null } = {}) {
  const recent = [];
  let timer = 0;
  function say() {
    const fresh = lines.filter((l) => !recent.includes(l));
    const line = fresh[Math.floor(Math.random() * fresh.length)];
    recent.push(line);
    if (recent.length > MEMORY) recent.shift();
    el.textContent = line;
    el.classList.add('show');
    clearTimeout(timer);
    const ms = hideAfter === null ? Math.min(7000, 2500 + line.length * 45) : hideAfter;
    if (ms) timer = setTimeout(() => el.classList.remove('show'), ms);
    return line;
  }
  return { say };
}
