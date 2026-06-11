// Handwritten test runner. No dependencies — just node.
// Run with: node packages/core/test/run.mjs (from repo root)

import {
  Grid,
  priorityDirections,
  rectsAdjacent,
  footprintEquals,
  wrapValue,
  wrapCell,
  loopPeriod,
  loopContentPeriods,
  loopContentSize,
  loopAnchorScroll,
  loopInstances,
  nearestInstanceOrigin,
  resolveLoop,
  PanController,
} from '../dist/index.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`\x1b[32m\u2713\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, err: e });
    console.log(`\x1b[31m\u2717\x1b[0m ${name}`);
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

test('priorityDirections: horizontal-right origin -> w face closest', () => {
  const origin = { col: 0, row: 0, w: 1, h: 1 };
  const target = { col: 5, row: 0, w: 1, h: 1 };
  const dirs = priorityDirections(origin, target);
  eq(dirs[0], 'w');
  eq(dirs[1], 'e');
  eq(dirs[2], 'n');
  eq(dirs[3], 's');
  assert(['nw', 'sw'].includes(dirs[4]));
  assert(['nw', 'sw'].includes(dirs[5]));
});

test('priorityDirections: vertical-above origin -> rank 3 is right (e)', () => {
  const origin = { col: 0, row: 0, w: 1, h: 1 };
  const target = { col: 0, row: 5, w: 1, h: 1 };
  const dirs = priorityDirections(origin, target);
  eq(dirs[0], 'n');
  eq(dirs[1], 's');
  eq(dirs[2], 'e');
  eq(dirs[3], 'w');
});

test('rectsAdjacent: edge-touching rects are adjacent, overlapping are not', () => {
  assert(rectsAdjacent({ col: 0, row: 0, w: 1, h: 1 }, { col: 1, row: 0, w: 1, h: 1 }));
  assert(rectsAdjacent({ col: 0, row: 0, w: 1, h: 1 }, { col: 1, row: 1, w: 1, h: 1 }));
  assert(!rectsAdjacent({ col: 0, row: 0, w: 1, h: 1 }, { col: 2, row: 0, w: 1, h: 1 }));
  assert(!rectsAdjacent({ col: 0, row: 0, w: 2, h: 2 }, { col: 1, row: 1, w: 1, h: 1 }));
});

test('footprintEquals', () => {
  assert(footprintEquals({ w: 2, h: 3 }, { w: 2, h: 3 }));
  assert(!footprintEquals({ w: 2, h: 3 }, { w: 3, h: 2 }));
});

// ---- Grid basic API ----------------------------------------------------

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

// ---- Rule 1 -----------------------------------------------------------

test('Rule 1: moving to empty space just places', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 5, row: 5 });
  assert(ok);
  eq(g.getTile('a').col, 5);
  eq(g.getTile('a').row, 5);
});

// ---- Rule 2 -----------------------------------------------------------

test('Rule 2: adjacent same-footprint swap', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'b', col: 2, row: 0, w: 2, h: 2 });
  const ok = g.moveTile('a', { col: 2, row: 0 });
  assert(ok);
  eq(g.getTile('a').col, 2);
  eq(g.getTile('b').col, 0);
});

test('Rule 2 does NOT apply when footprints differ -> falls through to displacement', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'b', col: 2, row: 0, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 2, row: 0 });
  assert(ok);
  const b = g.getTile('b');
  assert(!(b.col === 0 && b.row === 0));
});

test('Rule 2: same-footprint multi-cell swap', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'b', col: 2, row: 0, w: 2, h: 2 });
  const ok = g.moveTile('a', { col: 2, row: 0 });
  assert(ok);
  eq(g.getTile('a').col, 2);
  eq(g.getTile('a').row, 0);
  eq(g.getTile('b').col, 0);
  eq(g.getTile('b').row, 0);
});

// ---- Rule 3-5 ---------------------------------------------------------

test('Rule 3-5: displace 1x1 occupier via face priority', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 5, row: 0, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 5, row: 0 });
  assert(ok);
  eq(g.getTile('a').col, 5);
  eq(g.getTile('b').col, 4);
  eq(g.getTile('b').row, 0);
});

test('Rule 3-5: displacement clears the FULL dragger footprint, not just one cell', () => {
  // a is 3x1 at (0,0). target (4,0)..(6,0). b at (5,0).
  // Origin west, priority #1 'w'. b must clear cols 4-6 -> land at col 3.
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 3, h: 1 });
  g.addTile({ id: 'b', col: 5, row: 0, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 4, row: 0 });
  assert(ok);
  eq(g.getTile('a').col, 4);
  const b = g.getTile('b');
  eq(b.col, 3, 'b should clear 3-wide dragger -> land at col 3');
  eq(b.row, 0);
});

test('Rule 3-5: vertical dragger displaces vertically by enough to clear', () => {
  // a is 1x3 at (0,0). target rows 4..6. b at (0,5).
  // Origin north, priority #1 'n'. b must end up at row 3.
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 3 });
  g.addTile({ id: 'b', col: 0, row: 5, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 0, row: 4 });
  assert(ok);
  eq(g.getTile('a').row, 4);
  const b = g.getTile('b');
  eq(b.row, 3, 'b should clear 3-tall dragger -> land at row 3');
  eq(b.col, 0);
});

test('Rule 3-5: large dragger displaces small partially-overlapping victim', () => {
  // a is 4x4 at (0,0). target (5,5)..(8,8). b is 1x1 at (7,7) — sits inside target.
  const g = new Grid({ cols: 20, rows: 20, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 4, h: 4 });
  g.addTile({ id: 'b', col: 7, row: 7, w: 1, h: 1 });
  const ok = g.moveTile('a', { col: 5, row: 5 });
  assert(ok);
  eq(g.getTile('a').col, 5);
  eq(g.getTile('a').row, 5);
  const b = g.getTile('b');
  // Origin is NW of target -> rank-1 face is 'nw'-ish (closest face). For NW origin,
  // closest face is whichever between n and w is closer; rect (0,0,4,4) -> target (5,5,4,4).
  // dx = 1, dy = 1, |dx|=|dy| so faceClosestToOrigin returns 'w' (tie -> horizontal).
  // 'w' is dx=-1, dy=0, kxClear = max(1, 7+1 - 5) = 3. b lands at col 4.
  eq(b.col, 4, 'b should clear 4-wide target -> col 4');
  eq(b.row, 7);
});

test('Rule 3-5: two stacked victims displaced by 2x2 dragger do not collide', () => {
  // 2x2 dragger lands on (0,0). Two 1x1 victims A, B occupy column 0 rows 0-1.
  // After displacement they must NOT both land on the same cell — earlier the
  // engine ignored already-placed victims when checking the next one, causing
  // A and B to overlap (rendered as B "only moving 1 unit" because two tiles
  // collapsed onto the same cell).
  const g = new Grid({ cols: 12, rows: 12, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'A', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'B', col: 0, row: 1, w: 1, h: 1 });
  g.addTile({ id: 'D', col: 5, row: 5, w: 2, h: 2 });
  const ok = g.moveTile('D', { col: 0, row: 0 });
  assert(ok, 'move should succeed');
  const A = g.getTile('A');
  const B = g.getTile('B');
  // Both should be displaced clear of the 2x2 dragger; they must not be at
  // identical positions.
  assert(!(A.col === B.col && A.row === B.row),
    `A at ${A.col},${A.row} must not equal B at ${B.col},${B.row}`);
});

test('Rule 3-5: row of victims displaced east by 2x2 dragger do not collide', () => {
  const g = new Grid({ cols: 12, rows: 12, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'A', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'B', col: 1, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'D', col: 5, row: 5, w: 2, h: 2 });
  const ok = g.moveTile('D', { col: 0, row: 0 });
  assert(ok, 'move should succeed');
  const A = g.getTile('A');
  const B = g.getTile('B');
  assert(!(A.col === B.col && A.row === B.row),
    `A at ${A.col},${A.row} must not equal B at ${B.col},${B.row}`);
});

// ---- Rule 6 -----------------------------------------------------------

test('Rule 6: infinite axis push cascades tiles', () => {
  const g2 = new Grid({ cols: 2, rows: Infinity, unitWidth: 50, unitHeight: 50 });
  g2.addTile({ id: 'drag', col: 1, row: 10, w: 1, h: 1 });
  g2.addTile({ id: 'x', col: 0, row: 0, w: 1, h: 1 });
  g2.addTile({ id: 'y', col: 0, row: 1, w: 1, h: 1 });
  g2.addTile({ id: 'z', col: 0, row: 2, w: 1, h: 1 });
  const ok2 = g2.moveTile('drag', { col: 0, row: 0 });
  assert(ok2);
  eq(g2.getTile('drag').col, 0);
  eq(g2.getTile('drag').row, 0);
});

test('Rule 6: 0-1 BFS on fully fixed grid handles diagonal swap', () => {
  const g2 = new Grid({ cols: 2, rows: 2, unitWidth: 50, unitHeight: 50 });
  g2.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g2.addTile({ id: 'b', col: 1, row: 0, w: 1, h: 1 });
  g2.addTile({ id: 'c', col: 0, row: 1, w: 1, h: 1 });
  g2.addTile({ id: 'd', col: 1, row: 1, w: 1, h: 1 });
  const ok2 = g2.moveTile('a', { col: 1, row: 1 });
  assert(ok2);
});

test('Rule 6: cascade push displaces blocker chain on fixed grid', () => {
  // Scenario from user bug report: 2x2 'big' at (0,0) blocks. Dragger 1x1 at (0,2)
  // wants to move up to (0,1). To make room, big must shift south, but tile 'b' at (1,2)
  // blocks. The engine should cascade-push b further south.
  const g = new Grid({ cols: 12, rows: 12, unitWidth: 75, unitHeight: 75 });
  g.addTile({ id: 'big', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'p', col: 2, row: 0, w: 1, h: 1 });   // top-right blocker
  g.addTile({ id: 'q', col: 3, row: 0, w: 3, h: 1 });
  g.addTile({ id: 'drag', col: 0, row: 2, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 1, row: 2, w: 1, h: 1 });   // blocks 'big' going south
  g.addTile({ id: 'r', col: 2, row: 1, w: 2, h: 1 });
  const ok = g.moveTile('drag', { col: 0, row: 1 });
  assert(ok, 'cascade displacement should succeed');
  eq(g.getTile('drag').col, 0);
  eq(g.getTile('drag').row, 1);
  // big must have moved out of (0,0)..(1,1) so drag fits
  const big = g.getTile('big');
  assert(big.row >= 2, `big should have shifted south to make room, ended at (${big.col},${big.row})`);
  // b must have been cascade-pushed
  const b = g.getTile('b');
  assert(!(b.col === 1 && b.row === 2), 'b should have cascaded out of the way');
});

// ---- Compaction -------------------------------------------------------

test('Compaction: gravity top pulls tiles to row 0', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50, gravity: 'top' });
  g.addTile({ id: 'a', col: 0, row: 5, w: 1, h: 1 });
  eq(g.getTile('a').row, 0);
});

test('Compaction: tiles stack toward gravity', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50, gravity: 'top' });
  g.addTile({ id: 'a', col: 0, row: 5, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 0, row: 8, w: 1, h: 1 });
  eq(g.getTile('a').row, 0);
  eq(g.getTile('b').row, 1);
});

// ---- Serialization --
// ---- Serialization ----------------------------------------------------

test('toJSON / fromJSON roundtrip', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50, gravity: 'top' });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2, data: { label: 'hello' } });
  g.addTile({ id: 'b', col: 5, row: 5, w: 1, h: 1 });
  const snap = g.toJSON();
  const g2 = Grid.fromJSON(JSON.parse(JSON.stringify(snap)));
  eq(g2.tiles.length, 2);
  eq(g2.getTile('a').w, 2);
  deepEq(g2.getTile('a').data, { label: 'hello' });
  eq(g2.config.gravity, 'top');
});

// ---- Positioning ------------------------------------------------------

test('Positioning: absolute tiles are skipped by tilesIn', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'b', col: 0, row: 0, w: 1, h: 1, position: 'absolute', pinned: { x: 100, y: 100 } });
  const hits = g.tilesIn({ col: 0, row: 0, w: 1, h: 1 });
  eq(hits.length, 1);
  eq(hits[0].id, 'a');
});

test('Positioning: moveTile rejects out-of-flow tiles', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1, position: 'fixed', pinned: { x: 50, y: 50 } });
  const ok = g.moveTile('a', { col: 5, row: 5 });
  assert(!ok, 'moveTile must return false for out-of-flow tiles');
});

test('Positioning: setTilePinned updates pinned coords for absolute', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1, position: 'absolute', pinned: { x: 0, y: 0 } });
  const ok = g.setTilePinned('a', { x: 200, y: 80 });
  assert(ok);
  const t = g.getTile('a');
  eq(t.pinned.x, 200);
  eq(t.pinned.y, 80);
});

test('Positioning: setTilePinned rejects in-flow tiles', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 1, h: 1 });
  const ok = g.setTilePinned('a', { x: 50, y: 50 });
  assert(!ok, 'setTilePinned must reject static tiles');
});

test('Positioning: setTilePosition transitions modes', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 3, row: 4, w: 1, h: 1 });
  g.setTilePosition('a', 'absolute', { pinned: { x: 100, y: 100 } });
  eq(g.getTile('a').position, 'absolute');
  eq(g.getTile('a').pinned.x, 100);
  eq(g.getTile('a').col, 3);
  eq(g.getTile('a').row, 4);
  g.addTile({ id: 'b', col: 3, row: 4, w: 1, h: 1 });
  eq(g.getTile('b').col, 3);
});

test('Positioning: relative tiles still occupy their grid slot', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 5, row: 5, w: 1, h: 1, position: 'relative', offset: { x: 20, y: 0 } });
  const hits = g.tilesIn({ col: 5, row: 5, w: 1, h: 1 });
  eq(hits.length, 1);
  eq(hits[0].id, 'a');
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
  assert(ok);
  eq(g.getTile('a').w, 2);
  const b = g.getTile('b');
  assert(!(b.col === 1 && b.row === 0));
});

// ---- Loop mode ---------------------------------------------------------

test('Loop: wrapValue positive modulo', () => {
  eq(wrapValue(5, 10), 5);
  eq(wrapValue(15, 10), 5);
  eq(wrapValue(-3, 10), 7);
  eq(wrapValue(-10, 10), 0);
  eq(wrapValue(0, 10), 0);
});

test('Loop: wrapCell wraps into base period', () => {
  const cfg = { cols: 12, rows: 8, unitWidth: 50, unitHeight: 50 };
  deepEq(wrapCell({ col: 13, row: -1 }, cfg), { col: 1, row: 7 });
  deepEq(wrapCell({ col: -12, row: 8 }, cfg), { col: 0, row: 0 });
});

test('Loop: loopPeriod includes gap', () => {
  const cfg = { cols: 10, rows: 5, unitWidth: 50, unitHeight: 40, gap: 4 };
  deepEq(loopPeriod(cfg), { width: 10 * 54, height: 5 * 44 });
});

test('Loop: content spans >= 3 periods and >= viewport + 2 periods', () => {
  const cfg = { cols: 4, rows: 4, unitWidth: 50, unitHeight: 50 };
  // period = 200px; small viewport -> 3 periods
  deepEq(loopContentPeriods(cfg, 150, 150), { nx: 3, ny: 3 });
  // viewport 900px > period -> ceil(900/200)+2 = 7
  deepEq(loopContentPeriods(cfg, 900, 150), { nx: 7, ny: 3 });
  const size = loopContentSize(cfg, 900, 150);
  assert(size.width >= 900 + 2 * 200, 'content >= viewport + 2 periods');
});

test('Loop: loopAnchorScroll keeps scroll inside [period, 2*period)', () => {
  eq(loopAnchorScroll(0, 200), 200);
  eq(loopAnchorScroll(50, 200), 250);
  eq(loopAnchorScroll(250, 200), 250);
  eq(loopAnchorScroll(-50, 200), 350);
  assert(loopAnchorScroll(123456.7, 200) >= 200);
  assert(loopAnchorScroll(123456.7, 200) < 400);
});

test('Loop: loopInstances returns one copy per visible period', () => {
  const cfg = { cols: 4, rows: 4, unitWidth: 50, unitHeight: 50 };
  // period 200x200. Tile at (0,0) 1x1 -> base rect [0,50)x[0,50).
  const tiles = [{ id: 'a', col: 0, row: 0, w: 1, h: 1 }];
  // View covering exactly the second period.
  const one = loopInstances(cfg, tiles, { x: 200, y: 200, width: 200, height: 200 });
  eq(one.length, 1);
  eq(one[0].key, 'a@1,1');
  eq(one[0].left, 200);
  eq(one[0].top, 200);
  // View spanning a seam horizontally -> two copies.
  const two = loopInstances(cfg, tiles, { x: 190, y: 200, width: 220, height: 100 });
  eq(two.length, 2);
  const keys = two.map((i) => i.key).sort();
  deepEq(keys, ['a@1,1', 'a@2,1']);
});

test('Loop: loopInstances skips out-of-flow tiles', () => {
  const cfg = { cols: 4, rows: 4, unitWidth: 50, unitHeight: 50 };
  const tiles = [
    { id: 'a', col: 0, row: 0, w: 1, h: 1 },
    { id: 'p', col: 0, row: 0, w: 1, h: 1, position: 'absolute', pinned: { x: 0, y: 0 } },
  ];
  const out = loopInstances(cfg, tiles, { x: 0, y: 0, width: 200, height: 200 });
  eq(out.length, 1);
  eq(out[0].tile.id, 'a');
});

test('Loop: nearestInstanceOrigin picks the copy near the point', () => {
  const cfg = { cols: 4, rows: 4, unitWidth: 50, unitHeight: 50 };
  // Cell (1,1) base origin = (50,50); period 200.
  const near = nearestInstanceOrigin(cfg, { col: 1, row: 1 }, { x: 460, y: 70 });
  deepEq(near, { left: 450, top: 50 });
});

test('Loop: resolveLoop applies defaults', () => {
  const off = resolveLoop({ cols: 4, rows: 4, unitWidth: 50, unitHeight: 50 });
  eq(off, null);
  const pan = resolveLoop({ cols: 4, rows: 4, unitWidth: 50, unitHeight: 50, loop: { enabled: true } });
  eq(pan.interaction, 'pan');
  assert(pan.dragPan);
  eq(pan.friction, 4);
  const edit = resolveLoop({
    cols: 4, rows: 4, unitWidth: 50, unitHeight: 50,
    loop: { enabled: true, interaction: 'edit', physics: { friction: 7 } },
  });
  eq(edit.interaction, 'edit');
  assert(!edit.dragPan, 'edit mode never drag-pans');
  eq(edit.friction, 7);
});

test('Loop: Grid rejects loop + infinite axes', () => {
  let threw = false;
  try {
    new Grid({ cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50, loop: { enabled: true } });
  } catch {
    threw = true;
  }
  assert(threw, 'constructor must reject loop with infinite rows');
  const g = new Grid({ cols: 12, rows: 12, unitWidth: 50, unitHeight: 50 });
  let threw2 = false;
  try {
    g.updateConfig({ infiniteY: true, loop: { enabled: true } });
  } catch {
    threw2 = true;
  }
  assert(threw2, 'updateConfig must reject loop with infiniteY');
});

test('Loop: PanController drag pans opposite pointer and flings on release', () => {
  const pan = new PanController();
  pan.dragStart(100, 100, 0);
  pan.dragMove(60, 100, 16); // finger left 40px -> camera right
  pan.dragEnd(16);
  // Advance simulation 2s in 16ms steps.
  let st;
  for (let t = 32; t <= 2000; t += 16) st = pan.tick(t);
  assert(st.x > 40, `camera should coast past the drag distance, got ${st.x}`);
  assert(Math.abs(st.y) < 1e-6, 'no vertical motion');
  assert(!st.isMoving, 'camera settles');
});

test('Loop: PanController scrollBy moves camera directly', () => {
  const pan = new PanController();
  pan.scrollBy(120, -30);
  const st = pan.tick(16);
  eq(st.x, 120);
  eq(st.y, -30);
  assert(!st.isDragging);
});

// ---- Report -----------------------------------------------------------

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.log(`\n--- ${f.name} ---`);
    console.log(f.err.stack || f.err.message);
  }
  process.exit(1);
}
