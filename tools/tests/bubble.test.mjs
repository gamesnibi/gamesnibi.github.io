// Bramble's speech bubble (assets/js/bubble.js). Run: node --test tools/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBubble, LINES } from '../../assets/js/bubble.js';

// the bubble only needs somewhere to put its text and a class list
const stand = () => ({ textContent: '', classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } } });

test('Bramble never repeats any of his last three lines', () => {
  const el = stand(), b = createBubble(el, LINES, { hideAfter: 0 });
  const said = Array.from({ length: 300 }, () => b.say());
  said.forEach((line, i) => {
    assert.ok(LINES.includes(line));
    assert.ok(!said.slice(Math.max(0, i - 3), i).includes(line), `repeat at ${i}: ${line}`);
  });
  assert.equal(el.textContent, said.at(-1), 'the bubble shows the line');
  assert.ok(el.classList.set.has('show'));
  assert.ok(new Set(said).size === LINES.length, 'every line comes up');
});

test("every line keeps the site's copy rules", () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const out = execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(dir)})
from copyrules import check_copy
print(json.dumps([check_copy('<p>' + l + '</p>') for l in json.load(sys.stdin)]))`], { input: JSON.stringify(LINES) });
  JSON.parse(out).forEach((problems, i) => assert.deepEqual(problems, [], LINES[i]));
  assert.equal(LINES.length, 11);
});
