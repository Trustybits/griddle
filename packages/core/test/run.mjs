// Handwritten test runner. No dependencies — just node.
// Run with: node packages/core/test/run.mjs (from repo root)
// Or:       node test/run.mjs (from packages/core)

import { Grid, priorityDirections, rectsAdjacent, footprintEquals } from '../dist/index.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, err: e });
    console.log(`\x1b[31m✗\x1b[0m ${name}`);
    console.log(`  \x1b[31m${e.message}\x1b[0m`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function deepEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg || 'deepEq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

// ---- Geometry ----------------------------------------------------------

test('priorityDirections: horizontal-right origin → w face closest', () => {
  // dragger at (0,0), target at (5,0). Origin is to the west of target.
  const origin = { col: 0, row: 0, w: 1, h: 1 };
  const target = { col: 5, row: 0, w: 1, h: 1 };
  const dirs = priorityDirections(origin, target);
  eq(dirs[0], 'w', 'first priority should be face closest to origin (w)');
  eq(dirs[1], 'e', 'second priority should be opposite face (e)');
  eq(dirs[2], 'n', 'third priority should be upwards face when origin horizontal');
  eq(dirs[3], 's', 'fourth should be the remaining face');
  assert(['nw', 'sw'].includes(dirs[4]), 'rank 5 should be a close corner');
  assert(['nw', 'sw'].includes(dirs[5]), 'rank 6 should be a close corner');
});

test('priorityDirections: vertical-above origin → rank 3 is right (e)', () => {
  const origin = { col: 0, row: 0, w: 1, h: 1 };
  const target = { col: 0, row: 5, w: 1, h: 1 };
  const dirs = priorityDirections(origin, target);
  eq(dirs[0], 'n', 'first priority should be face closest (n)');
  eq(dirs[1], 's', 'second priority should be opposite (s)');
  eq(dirs[2], 'e', 'third should be right for vertical origin');
  eq(dirs[3], 'w', 'fourth remaining');
});

test('rectsAdjacent: edge-touching rects are adjacent, overlapping are not', () => {
  assert(rectsAdjacent({ col: 0, row: 0, w: 1, h: 1 }, { col: 1, row: 0, w: 1, h: 1 }));
  assert(rectsAdjacent({ col: 0, row: 0, w: 1, h: 1 }, { col: 1, row: 1, w: 1, h: 1 })); // corner
  assert(!rectsAdjacent({ col: 0, row: 0, w: 1, h: 1 }, { col: 2, row: 0, w: 1, h: 1 }));
  assert(!rectsAdjacent({ col: 0, row: 0, w: 2, h: 2 }, { col: 1, row: 1, w: 1, h: 1 })); // overlap
});

test('footprintEquals', () => {
  assert(footprintEquals({ w: 2, h: 3 }, { w: 2, h: 3 }));
  assert(!footprintEquals({ w: 2, h: 3 }, { w: 3, h: 2 }));
});

// ---- Grid basic API -----------------------------------------------------

test('add/remove/query', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'b', col: 5, row: 5, w: 1, h: 1 });
  eq(g.tiles.length, 2);
  eq(g.getTile('a').w, 2);
  g.removeTile('a');
  eq(g.tiles.length, 1);
});

test('rectInBounds respects fixed and infinite axes', () => {
  const g1 = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  assert(g1.rectInBounds({ col: 0, row: 0, w: 10, h: 10 }));
  assert(!g1.rectInBounds({ col: 5, row: 5, w: 6, h: 1 }));
  assert(!g1.rectInBounds({ col: -1, row: 0, w: 1, h: 1 }));

  const g2 = new Grid({ cols: Infinity, rows: 10, unitWidth: 50, unitHeight: 50 });
  assert(g2.rectInBounds({ col: 9999, row: 0, w: 5, h: 1 }));
  assert(!g2.rectInBounds({ col: 0, row: 5, w: 1, h: 6 }));
});

// ---- Movement Rule 1: empty target --------------------------------------

test('Rule 1: moving to empty space just places', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 5, row: 5 });
  assert(ok);
  eq(g.getTile('a').col, 5);
  eq(g.getTile('a').row, 5);
});

// ---- Movement Rule 2: adjacent same-footprint swap ----------------------

test('Rule 2: adjacent same-footprint swap', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'b', col: 2, row: 0, w: 2, h: 2 });
  const ok = g.moveTile('a', { col: 2, row: 0 });
  assert(ok, 'move should succeed');
  eq(g.getTile('a').col, 2);
  eq(g.getTile('b').col, 0, 'b should have swapped to a\'s old position');
});

test('Rule 2 does NOT apply when footprints differ → falls through to displacement', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'b', col: 2, row: 0, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 2, row: 0 });
  assert(ok, 'move should still succeed via Rule 3-5');
  // b should have been displaced, not swapped
  const b = g.getTile('b');
  assert(!(b.col === 0 && b.row === 0), 'b should not be at a\'s old position (that was a swap)');
});

// ---- Movement Rule 3-5: priority displacement ---------------------------

test('Rule 3-5: displace occupier via face priority', () => {
  // a at (0,0), wants to move to (5,0). b at (5,0) — not adjacent → must displace.
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 5, row: 0, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 5, row: 0 });
  assert(ok);
  eq(g.getTile('a').col, 5);
  // b should have been pushed west (rank 1 face) — but that's the direction of origin.
  // With origin to the west, priority #1 is 'w', so b moves west to (4,0).
  eq(g.getTile('b').col, 4);
  eq(g.getTile('b').row, 0);
});

// ---- Rule 6: infinite push ---------------------------------------------

test('Rule 6: infinite axis push cascades tiles', () => {
  const g = new Grid({ cols: 10, rows: Infinity, unitWidth: 50, unitHeight: 50 });
  // Stack tiles vertically so there's no room laterally but infinite room below
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 0, row: 1, w: 1, h: 1 });
  g.addTile({ id: 'c', col: 0, row: 2, w: 1, h: 1 });
  g.addTile({ id: 'd', col: 0, row: 3, w: 1, h: 1 });
  // Move 'a' from far away onto (0,1). Actually 'a' is already at (0,0) which is
  // adjacent to b at (0,1) — so this hits Rule 2 (swap if same footprint). Let's instead:
  const g2 = new Grid({ cols: 2, rows: Infinity, unitWidth: 50, unitHeight: 50 });
  g2.addTile({ id: 'drag', col: 1, row: 10, w: 1, h: 1 });
  g2.addTile({ id: 'x', col: 0, row: 0, w: 1, h: 1 });
  g2.addTile({ id: 'y', col: 0, row: 1, w: 1, h: 1 });
  g2.addTile({ id: 'z', col: 0, row: 2, w: 1, h: 1 });
  // drag comes from (1,10), target (0,0). not adjacent; x at target;
  // displacement: priority face closest to origin... origin (1,10) is SE of target.
  // face closest = s. Try moving x south: (0,1) is occupied by y. Try e: (1,0) empty!
  // So rank 2 is n → out of bounds. rank 3 is e → (1,0) empty → x moves there. Success by Rule 4.
  const ok2 = g2.moveTile('drag', { col: 0, row: 0 });
  assert(ok2, 'drag should succeed');
  eq(g2.getTile('drag').col, 0);
  eq(g2.getTile('drag').row, 0);
});

test('Rule 6: 0-1 BFS on fully fixed grid rejects when no solution', () => {
  const g = new Grid({ cols: 2, rows: 2, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 1, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'c', col: 0, row: 1, w: 1, h: 1 });
  g.addTile({ id: 'd', col: 1, row: 1, w: 1, h: 1 });
  // Everything is packed, a wants b's spot via Rule 2 (adjacent, same size) → swap works
  const ok = g.moveTile('a', { col: 1, row: 0 });
  assert(ok, 'swap should succeed');

  // Now try a 4-tile fully packed grid where the swap is not adjacent.
  const g2 = new Grid({ cols: 2, rows: 2, unitWidth: 50, unitHeight: 50 });
  g2.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g2.addTile({ id: 'b', col: 1, row: 0, w: 1, h: 1 });
  g2.addTile({ id: 'c', col: 0, row: 1, w: 1, h: 1 });
  g2.addTile({ id: 'd', col: 1, row: 1, w: 1, h: 1 });
  // a wants to go to d's spot (1,1) — diagonal, 8-neighbor adjacent, same footprint → Rule 2 swap
  const ok2 = g2.moveTile('a', { col: 1, row: 1 });
  assert(ok2, 'diagonal-adjacent same-footprint swap OK');
});

// ---- Compaction --------------------------------------------------------

test('Compaction: gravity top pulls tiles to row 0', () => {
  const g = new Grid({
    cols: 10,
    rows: 10,
    unitWidth: 50,
    unitHeight: 50,
    gravity: 'top',
  });
  g.addTile({ id: 'a', col: 0, row: 5, w: 1, h: 1 });
  // addTile triggers compact when gravity is set
  eq(g.getTile('a').row, 0, 'tile should fall to the top');
});

test('Compaction: tiles stack toward gravity', () => {
  const g = new Grid({
    cols: 10,
    rows: 10,
    unitWidth: 50,
    unitHeight: 50,
    gravity: 'top',
  });
  g.addTile({ id: 'a', col: 0, row: 5, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 0, row: 8, w: 1, h: 1 });
  eq(g.getTile('a').row, 0);
  eq(g.getTile('b').row, 1);
});

// ---- Serialization -----------------------------------------------------

test('toJSON / fromJSON roundtrip', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50, gravity: 'top' });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 1, data: { label: 'hello' } });
  g.addTile({ id: 'b', col: 2, row: 0, w: 1, h: 2 });
  const snap = g.toJSON();
  const s = JSON.stringify(snap);
  const g2 = Grid.fromJSON(JSON.parse(s));
  eq(g2.tiles.length, 2);
  eq(g2.getTile('a').w, 2);
  deepEq(g2.getTile('a').data, { label: 'hello' });
  eq(g2.config.gravity, 'top');
});

// ---- Resize -----------------------------------------------------------

test('resizeTile shrinks without displacement', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 3, h: 3 });
  const ok = g.resizeTile('a', { w: 2, h: 2 });
  assert(ok);
  eq(g.getTile('a').w, 2);
});

test('resizeTile grows and displaces neighbors', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 1, row: 0, w: 1, h: 1 });
  const ok = g.resizeTile('a', { w: 2, h: 1 });
  assert(ok, 'resize should displace b');
  eq(g.getTile('a').w, 2);
  // b must have been moved
  const b = g.getTile('b');
  assert(!(b.col === 1 && b.row === 0), 'b should have moved');
});

// ---- Report ----------------------------------------------------------

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.log(`\n--- ${f.name} ---`);
    console.log(f.err.stack || f.err.message);
  }
  process.exit(1);
}
