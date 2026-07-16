// Handwritten test runner. No dependencies — just node.
// Run with: node packages/core/test/run.mjs (from repo root)

import {
  Grid,
  reflowTiles,
  priorityDirections,
  rectsOverlap,
  rectsAdjacent,
  footprintEquals,
  wrapValue,
  wrapCell,
  loopBounds,
  loopPeriod,
  loopShift,
  loopInstances,
  resolveLoop,
  PanController,
  DEFAULT_ANIMATION_CONFIG,
  resolveAnimationConfig,
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

function geometry(tiles) {
  return tiles.map(({ id, col, row, w, h }) => ({ id, col, row, w, h }));
}

const preserveV1ParityFixtures = [
  {
    name: '12 to 8 preserves valid positions, gaps, and input order',
    tiles: [
      { id: 'late', col: 4, row: 3, w: 3, h: 2 },
      { id: 'early', col: 0, row: 0, w: 4, h: 2 },
      { id: 'lower', col: 0, row: 6, w: 2, h: 1 },
    ],
    options: { cols: 8, strategy: 'preserve-v1' },
    expected: [
      { id: 'late', col: 4, row: 3, w: 3, h: 2 },
      { id: 'early', col: 0, row: 0, w: 4, h: 2 },
      { id: 'lower', col: 0, row: 6, w: 2, h: 1 },
    ],
  },
  {
    name: '12 to 4 relocates horizontally out-of-bounds tiles',
    tiles: [
      { id: 'right', col: 8, row: 2, w: 3, h: 2 },
      { id: 'left', col: 0, row: 0, w: 2, h: 2 },
      { id: 'bottom', col: 2, row: 4, w: 2, h: 2 },
    ],
    options: { cols: 4, strategy: 'preserve-v1' },
    expected: [
      { id: 'right', col: 0, row: 2, w: 3, h: 2 },
      { id: 'left', col: 0, row: 0, w: 2, h: 2 },
      { id: 'bottom', col: 2, row: 4, w: 2, h: 2 },
    ],
  },
  {
    name: 'collisions use stable tile IDs while returning input order',
    tiles: [
      { id: 'b', col: 0, row: 0, w: 2, h: 2 },
      { id: 'a', col: 0, row: 0, w: 2, h: 2 },
      { id: 'c', col: 2, row: 0, w: 2, h: 2 },
    ],
    options: { cols: 4, strategy: 'preserve-v1' },
    expected: [
      { id: 'b', col: 2, row: 0, w: 2, h: 2 },
      { id: 'a', col: 0, row: 0, w: 2, h: 2 },
      { id: 'c', col: 0, row: 2, w: 2, h: 2 },
    ],
  },
  {
    name: '12 to 8 scales an oversized tile and rounds height proportionally',
    tiles: [{ id: 'wide', col: 0, row: 5, w: 12, h: 4 }],
    options: { cols: 8, strategy: 'preserve-v1' },
    expected: [{ id: 'wide', col: 0, row: 5, w: 8, h: 3 }],
  },
  {
    name: 'an empty placement map uses automatic 12 to 4 projection',
    tiles: [
      { id: 'lower', col: 0, row: 3, w: 6, h: 3 },
      { id: 'upper', col: 6, row: 0, w: 6, h: 3 },
    ],
    options: { cols: 4, strategy: 'preserve-v1', placements: {} },
    expected: [
      { id: 'lower', col: 0, row: 3, w: 4, h: 2 },
      { id: 'upper', col: 0, row: 0, w: 4, h: 2 },
    ],
  },
  {
    name: 'partial placements lead and missing tiles fill around them',
    tiles: [
      { id: 'missing-before', col: 0, row: 0, w: 6, h: 3 },
      { id: 'custom', col: 4, row: 4, w: 2, h: 2 },
      { id: 'missing-after', col: 8, row: 0, w: 2, h: 2 },
    ],
    options: {
      cols: 4,
      strategy: 'preserve-v1',
      placements: {
        custom: { col: 0, row: 2, w: 2, h: 2 },
        'missing-tile-id': { col: 2, row: 10, w: 2, h: 2 },
      },
    },
    expected: [
      { id: 'custom', col: 0, row: 2, w: 2, h: 2 },
      { id: 'missing-before', col: 0, row: 0, w: 4, h: 2 },
      { id: 'missing-after', col: 2, row: 2, w: 2, h: 2 },
    ],
  },
  {
    name: 'complete placements remain verbatim and preserve input order',
    tiles: [
      { id: 'b', col: 0, row: 0, w: 2, h: 2 },
      { id: 'a', col: 2, row: 0, w: 2, h: 2 },
    ],
    options: {
      cols: 4,
      strategy: 'preserve-v1',
      placements: {
        a: { col: 0, row: 3, w: 2, h: 2 },
        b: { col: 2, row: 5, w: 2, h: 2 },
        'missing-tile-id': { col: 0, row: 20, w: 4, h: 1 },
      },
    },
    expected: [
      { id: 'b', col: 2, row: 5, w: 2, h: 2 },
      { id: 'a', col: 0, row: 3, w: 2, h: 2 },
    ],
  },
  {
    name: 'editorial dashboard with a partial tablet arrangement',
    tiles: [
      { id: 'hero', col: 0, row: 0, w: 8, h: 4 },
      { id: 'notes', col: 8, row: 0, w: 4, h: 4 },
      { id: 'chart', col: 0, row: 4, w: 5, h: 3 },
      { id: 'links', col: 5, row: 4, w: 3, h: 2 },
      { id: 'map', col: 8, row: 4, w: 4, h: 5 },
    ],
    options: {
      cols: 8,
      strategy: 'preserve-v1',
      placements: {
        hero: { col: 0, row: 0, w: 8, h: 4 },
        notes: { col: 0, row: 4, w: 4, h: 3 },
        map: { col: 4, row: 4, w: 4, h: 4 },
        archived: { col: 0, row: 30, w: 8, h: 2 },
      },
    },
    expected: [
      { id: 'hero', col: 0, row: 0, w: 8, h: 4 },
      { id: 'notes', col: 0, row: 4, w: 4, h: 3 },
      { id: 'map', col: 4, row: 4, w: 4, h: 4 },
      { id: 'chart', col: 0, row: 8, w: 5, h: 3 },
      { id: 'links', col: 5, row: 8, w: 3, h: 2 },
    ],
  },
  {
    name: 'media collection automatically projects to a mobile stack',
    tiles: [
      { id: 'video', col: 6, row: 0, w: 6, h: 4 },
      { id: 'title', col: 0, row: 0, w: 6, h: 2 },
      { id: 'quote', col: 0, row: 2, w: 4, h: 3 },
      { id: 'photo', col: 4, row: 4, w: 8, h: 6 },
      { id: 'footer', col: 0, row: 10, w: 12, h: 2 },
    ],
    options: { cols: 4, strategy: 'preserve-v1' },
    expected: [
      { id: 'video', col: 0, row: 1, w: 4, h: 3 },
      { id: 'title', col: 0, row: 0, w: 4, h: 1 },
      { id: 'quote', col: 0, row: 4, w: 4, h: 3 },
      { id: 'photo', col: 0, row: 7, w: 4, h: 3 },
      { id: 'footer', col: 0, row: 10, w: 4, h: 1 },
    ],
  },
  {
    name: 'planning board keeps mobile anchors and places new tiles',
    tiles: [
      { id: 'notes', col: 0, row: 7, w: 6, h: 4 },
      { id: 'cover', col: 0, row: 0, w: 12, h: 4 },
      { id: 'status', col: 8, row: 4, w: 4, h: 3 },
      { id: 'agenda', col: 0, row: 4, w: 4, h: 3 },
      { id: 'links', col: 6, row: 7, w: 6, h: 4 },
      { id: 'people', col: 4, row: 4, w: 4, h: 3 },
    ],
    options: {
      cols: 4,
      strategy: 'preserve-v1',
      placements: {
        cover: { col: 0, row: 0, w: 4, h: 2 },
        status: { col: 0, row: 2, w: 2, h: 2 },
        removed: { col: 2, row: 2, w: 2, h: 2 },
      },
    },
    expected: [
      { id: 'cover', col: 0, row: 0, w: 4, h: 2 },
      { id: 'status', col: 0, row: 2, w: 2, h: 2 },
      { id: 'notes', col: 0, row: 4, w: 4, h: 3 },
      { id: 'agenda', col: 0, row: 7, w: 4, h: 3 },
      { id: 'links', col: 0, row: 10, w: 4, h: 3 },
      { id: 'people', col: 0, row: 13, w: 4, h: 3 },
    ],
  },
];

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

test('animation config: smooth defaults are normalized onto the grid', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  deepEq(g.config.animation, DEFAULT_ANIMATION_CONFIG);
});

test('animation config: partial updates preserve existing custom settings', () => {
  const g = new Grid({
    cols: 10,
    rows: 10,
    unitWidth: 50,
    unitHeight: 50,
    animation: {
      repositionDurationMs: 500,
      repositionEasing: 'linear',
      liftDurationMs: 200,
    },
  });
  g.updateConfig({ animation: { liftDurationMs: 90 } });
  eq(g.config.animation.repositionDurationMs, 500);
  eq(g.config.animation.repositionEasing, 'linear');
  eq(g.config.animation.liftDurationMs, 90);
});

test('animation config: invalid values fall back and negative durations clamp to zero', () => {
  const animation = resolveAnimationConfig({
    repositionDurationMs: Number.NaN,
    repositionEasing: '   ',
    liftDurationMs: -20,
  });
  eq(animation.repositionDurationMs, DEFAULT_ANIMATION_CONFIG.repositionDurationMs);
  eq(animation.repositionEasing, DEFAULT_ANIMATION_CONFIG.repositionEasing);
  eq(animation.liftDurationMs, 0);
});

test('add/remove/query', () => {
  const g = new Grid({ cols: 10, rows: 10, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'a', col: 0, row: 0, w: 2, h: 2 });
  g.addTile({ id: 'b', col: 5, row: 5, w: 1, h: 1 });
  eq(g.tiles.length, 2);
  eq(g.getTile('a').w, 2);
  g.removeTile('a');
  eq(g.tiles.length, 1);
});

// ---- Explicit reflow --------------------------------------------------

for (const fixture of preserveV1ParityFixtures) {
  test(`Reflow preserve-v1 parity: ${fixture.name}`, () => {
    deepEq(
      geometry(reflowTiles(fixture.tiles, fixture.options)),
      fixture.expected,
    );
  });
}

test('Reflow preserve-v1 is deterministic and does not mutate its input', () => {
  const input = [
    { id: 'b', col: 8, row: 0, w: 6, h: 3 },
    { id: 'a', col: 0, row: 0, w: 6, h: 3 },
  ];
  const before = JSON.parse(JSON.stringify(input));
  const options = { cols: 4, strategy: 'preserve-v1' };

  const first = reflowTiles(input, options);
  const second = reflowTiles(input, options);

  deepEq(first, second);
  deepEq(input, before);
  assert(first[0] !== input[0], 'reflow must return new tile objects');
});

test('Reflow preserve-v1 preserves all tile metadata and capabilities', () => {
  const data = { label: 'wide tile' };
  const input = [{
    id: 'wide', col: 9, row: 4, w: 8, h: 5,
    data,
    resizeHandles: ['nw', 'se'],
    draggable: false,
    resizable: false,
    minW: 2,
    minH: 3,
    maxW: 10,
    maxH: 12,
    position: 'relative',
    pinned: { x: 40, y: 80 },
    offset: { x: 12, y: -4 },
    sticky: { edge: 'top', threshold: 6 },
  }];

  const [tile] = reflowTiles(input, { cols: 4, strategy: 'preserve-v1' });

  deepEq(geometry([tile]), [{ id: 'wide', col: 0, row: 0, w: 4, h: 3 }]);
  eq(tile.data, data, 'consumer data reference must survive');
  deepEq(tile.resizeHandles, ['nw', 'se']);
  eq(tile.draggable, false);
  eq(tile.resizable, false);
  eq(tile.minW, 2);
  eq(tile.minH, 3);
  eq(tile.maxW, 10);
  eq(tile.maxH, 12);
  eq(tile.position, 'relative');
  deepEq(tile.pinned, { x: 40, y: 80 });
  deepEq(tile.offset, { x: 12, y: -4 });
  deepEq(tile.sticky, { edge: 'top', threshold: 6 });
});

test('Reflow preserve-v1 scales height at rounding and minimum boundaries', () => {
  const result = reflowTiles([
    { id: 'round-up', col: 0, row: 0, w: 8, h: 5 },
    { id: 'minimum', col: 8, row: 0, w: 12, h: 1 },
    { id: 'already-fits', col: 0, row: 8, w: 4, h: 2 },
  ], { cols: 4, strategy: 'preserve-v1' });
  const byId = new Map(result.map((tile) => [tile.id, tile]));

  deepEq({ w: byId.get('round-up').w, h: byId.get('round-up').h }, { w: 4, h: 3 });
  deepEq({ w: byId.get('minimum').w, h: byId.get('minimum').h }, { w: 4, h: 1 });
  deepEq({ w: byId.get('already-fits').w, h: byId.get('already-fits').h }, { w: 4, h: 2 });
});

test('Reflow preserve-v1 keeps supplied unusual geometry verbatim', () => {
  const result = reflowTiles(
    [{ id: 'placed', col: 0, row: 0, w: 2, h: 2 }],
    {
      cols: 4,
      strategy: 'preserve-v1',
      placements: { placed: { col: 7, row: -2, w: 6, h: 0 } },
    },
  );

  deepEq(geometry(result), [{ id: 'placed', col: 7, row: -2, w: 6, h: 0 }]);
});

test('Reflow rejects invalid columns and unknown strategies', () => {
  const invalidOptions = [
    { cols: 0, strategy: 'preserve-v1' },
    { cols: -1, strategy: 'preserve-v1' },
    { cols: 2.5, strategy: 'preserve-v1' },
    { cols: Infinity, strategy: 'preserve-v1' },
    { cols: NaN, strategy: 'preserve-v1' },
    { cols: 4, strategy: 'latest' },
  ];

  for (const options of invalidOptions) {
    let threw = false;
    try {
      reflowTiles([], options);
    } catch {
      threw = true;
    }
    assert(threw, `expected invalid options to throw: ${JSON.stringify(options)}`);
  }
});

test('Grid.reflow installs config and geometry before emitting one event', () => {
  const g = new Grid(
    { cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [
      { id: 'left', col: 0, row: 0, w: 2, h: 2 },
      { id: 'right', col: 8, row: 0, w: 4, h: 2 },
    ],
  );
  const events = [];
  g.changes.on((event) => {
    events.push(event);
    eq(g.config.cols, 4, 'listener must observe final columns');
    deepEq(geometry(g.tiles), [
      { id: 'left', col: 0, row: 0, w: 2, h: 2 },
      { id: 'right', col: 0, row: 2, w: 4, h: 2 },
    ], 'listener must observe final geometry');
  });

  const changed = g.reflow({ cols: 4, strategy: 'preserve-v1' });

  assert(changed, 'right tile should move');
  eq(events.length, 1);
  deepEq(events[0], { type: 'reflow', tileIds: ['right'] });
});

test('Grid.reflow returns false when only the target columns change', () => {
  const g = new Grid(
    { cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [{ id: 'a', col: 0, row: 0, w: 2, h: 2 }],
  );
  const events = [];
  g.changes.on((event) => events.push(event));

  const changed = g.reflow({ cols: 8, strategy: 'preserve-v1' });

  assert(!changed, 'unchanged geometry should return false');
  eq(g.config.cols, 8);
  deepEq(events, [{ type: 'reflow', tileIds: [] }]);
});

test('Grid.updateConfig remains side-effect-free when columns change', () => {
  const g = new Grid(
    { cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [{ id: 'right', col: 8, row: 3, w: 4, h: 2 }],
  );
  const before = geometry(g.tiles);
  const events = [];
  g.changes.on((event) => events.push(event));

  g.updateConfig({ cols: 4 });

  deepEq(geometry(g.tiles), before);
  deepEq(events, [{ type: 'config', tileIds: [] }]);
});

test('Grid.reflow rejects invalid options without partially mutating state', () => {
  const g = new Grid(
    { cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [{ id: 'a', col: 8, row: 3, w: 4, h: 2 }],
  );
  const before = g.toJSON();
  const events = [];
  g.changes.on((event) => events.push(event));
  const invalidOptions = [
    { cols: 0, strategy: 'preserve-v1' },
    { cols: -1, strategy: 'preserve-v1' },
    { cols: 2.5, strategy: 'preserve-v1' },
    { cols: Infinity, strategy: 'preserve-v1' },
    { cols: NaN, strategy: 'preserve-v1' },
    { cols: 4, strategy: 'unknown-v1' },
  ];

  for (const options of invalidOptions) {
    let threw = false;
    try {
      g.reflow(options);
    } catch {
      threw = true;
    }
    assert(threw, 'invalid Grid.reflow call must throw');
    deepEq(g.toJSON(), before, 'failed reflow must roll back config and tiles');
  }
  deepEq(events, []);
});

test('Grid.reflow leaves out-of-flow tiles untouched and out of collision checks', () => {
  const pinned = {
    id: 'pinned', col: 9, row: 9, w: 2, h: 2,
    position: 'absolute', pinned: { x: 100, y: 200 },
  };
  const g = new Grid(
    { cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [
      pinned,
      { id: 'flow', col: 8, row: 0, w: 4, h: 2 },
    ],
  );

  g.reflow({
    cols: 4,
    strategy: 'preserve-v1',
    placements: {
      pinned: { col: 0, row: 0, w: 4, h: 4 },
    },
  });

  deepEq(g.getTile('pinned'), pinned);
  deepEq(geometry([g.getTile('flow')]), [
    { id: 'flow', col: 0, row: 0, w: 4, h: 2 },
  ]);
});

test('Grid.reflow converts an infinite horizontal grid to finite columns', () => {
  const g = new Grid(
    { cols: Infinity, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [{ id: 'a', col: 20, row: 0, w: 2, h: 2 }],
  );

  g.reflow({ cols: 8, strategy: 'preserve-v1' });

  eq(g.config.cols, 8);
  eq(g.config.infiniteX, false);
  deepEq(geometry(g.tiles), [{ id: 'a', col: 0, row: 0, w: 2, h: 2 }]);
});

test('Reflow keeps all ordinary tiles renderable after shrinking to 8 and 4 columns', () => {
  const input = [
    { id: 'hero', col: 0, row: 0, w: 8, h: 4 },
    { id: 'side', col: 8, row: 0, w: 4, h: 4 },
    { id: 'wide', col: 0, row: 6, w: 12, h: 5 },
    { id: 'small', col: 10, row: 12, w: 2, h: 2 },
  ];

  for (const cols of [8, 4]) {
    const result = reflowTiles(input, { cols, strategy: 'preserve-v1' });
    for (const tile of result) {
      assert(tile.col >= 0 && tile.col + tile.w <= cols, `${tile.id} must fit ${cols} columns`);
    }
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        assert(!rectsOverlap(result[i], result[j]), `${result[i].id} and ${result[j].id} overlap`);
      }
    }
  }
});

test('Grid.reflow does not apply gravity automatically', () => {
  const g = new Grid(
    { cols: 4, rows: Infinity, unitWidth: 50, unitHeight: 50, gravity: 'top' },
    [{ id: 'a', col: 0, row: 5, w: 2, h: 2 }],
  );
  const events = [];
  g.changes.on((event) => events.push(event));

  g.reflow({ cols: 4, strategy: 'preserve-v1' });

  eq(g.getTile('a').row, 5);
  deepEq(events, [{ type: 'reflow', tileIds: [] }]);
  g.compactAll();
  eq(g.getTile('a').row, 0);
  eq(events[1].type, 'compact');
});

test('Grid.pack remains a separate dense operation after reflow', () => {
  const g = new Grid(
    { cols: 4, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [
      { id: 'a', col: 0, row: 5, w: 2, h: 2 },
      { id: 'b', col: 2, row: 5, w: 2, h: 2 },
    ],
  );

  g.reflow({ cols: 4, strategy: 'preserve-v1' });
  eq(g.getTile('a').row, 5, 'reflow must preserve the valid gap');
  assert(g.pack(), 'pack should still translate the dense block');
  deepEq(geometry(g.tiles), [
    { id: 'a', col: 0, row: 0, w: 2, h: 2 },
    { id: 'b', col: 2, row: 0, w: 2, h: 2 },
  ]);
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

test('Rule 6: infinite Y never pushes a collision victim above row zero', () => {
  // A 1x1 dragger moves south into the top of a full-width 2x4 victim. A
  // blocker below prevents the normal south displacement, so the Rule 6 fast
  // path considers pushing north. Infinite Y grows downward only; older code
  // treated north as unbounded and moved `big` to row -3, clipping its top.
  const g = new Grid({ cols: 2, rows: Infinity, unitWidth: 50, unitHeight: 50 });
  g.addTile({ id: 'drag', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'big', col: 0, row: 1, w: 2, h: 4 });
  g.addTile({ id: 'block', col: 0, row: 5, w: 2, h: 1 });

  const ok = g.moveTile('drag', { col: 0, row: 1 });

  assert(ok, 'move should fall back to an in-bounds displacement');
  eq(g.getTile('drag').row, 1);
  for (const tile of g.tiles) {
    assert(tile.row >= 0, `${tile.id} must remain at a non-negative row, got ${tile.row}`);
  }
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

test('resizeTile cascades a vertical stack instead of jumping the first victim', () => {
  const g = new Grid({
    cols: 4,
    rows: Infinity,
    unitWidth: 50,
    unitHeight: 50,
    gravity: 'top',
  });
  g.addTile({ id: 'top', col: 0, row: 0, w: 1, h: 1 });
  g.addTile({ id: 'second', col: 0, row: 1, w: 1, h: 1 });
  g.addTile({ id: 'third', col: 0, row: 2, w: 1, h: 1 });
  g.addTile({ id: 'fourth', col: 0, row: 3, w: 1, h: 1 });

  const ok = g.resizeTile('top', { w: 1, h: 2 });

  assert(ok, 'resize should succeed');
  eq(g.getTile('top').row, 0);
  eq(g.getTile('top').h, 2);
  eq(g.getTile('second').row, 2, 'direct victim should move down one row');
  eq(g.getTile('third').row, 3, 'next tile should cascade down one row');
  eq(g.getTile('fourth').row, 4, 'entire lower stack should cascade down');
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
  const bounds = { cols: 12, rows: 8 };
  deepEq(wrapCell({ col: 13, row: -1 }, bounds), { col: 1, row: 7 });
  deepEq(wrapCell({ col: -12, row: 8 }, bounds), { col: 0, row: 0 });
});

test('Loop: loopBounds is the content bounding box', () => {
  const tiles = [
    { id: 'a', col: 0, row: 0, w: 2, h: 1 },
    { id: 'b', col: 3, row: 2, w: 2, h: 2 },
    // Out-of-flow tiles are excluded.
    { id: 'p', col: 50, row: 50, w: 1, h: 1, position: 'absolute', pinned: { x: 0, y: 0 } },
  ];
  deepEq(loopBounds(tiles), { cols: 5, rows: 4 });
  deepEq(loopBounds([]), { cols: 1, rows: 1 });
});

test('Loop: loopPeriod derives from content, includes gap', () => {
  const cfg = { cols: 10, rows: 5, unitWidth: 50, unitHeight: 40, gap: 4 };
  // Tiles only span 4 cols x 2 rows of the 10x5 grid: period is the content,
  // not the configured grid, so repeats have no dead space between them.
  const tiles = [
    { id: 'a', col: 0, row: 0, w: 2, h: 2 },
    { id: 'b', col: 2, row: 0, w: 2, h: 2 },
  ];
  deepEq(loopPeriod(cfg, tiles), { width: 4 * 54, height: 2 * 44 });
});

test('Loop: loopInstances returns one copy per visible period', () => {
  const cfg = { cols: 4, rows: 4, unitWidth: 50, unitHeight: 50 };
  // Marker tile at (3,3) makes the content bounding box 4x4 -> period 200x200.
  const tiles = [
    { id: 'a', col: 0, row: 0, w: 1, h: 1 },
    { id: 'z', col: 3, row: 3, w: 1, h: 1 },
  ];
  // View covering exactly the second period.
  const one = loopInstances(cfg, tiles, { x: 200, y: 200, width: 200, height: 200 })
    .filter((i) => i.tile.id === 'a');
  eq(one.length, 1);
  eq(one[0].key, 'a@1,1');
  eq(one[0].left, 200);
  eq(one[0].top, 200);
  // View spanning a seam horizontally -> two copies.
  const two = loopInstances(cfg, tiles, { x: 190, y: 200, width: 220, height: 100 })
    .filter((i) => i.tile.id === 'a');
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
  // Bounds from 'a' alone -> period 50x50; view of one period -> one copy.
  const out = loopInstances(cfg, tiles, { x: 0, y: 0, width: 50, height: 50 });
  eq(out.length, 1);
  eq(out[0].tile.id, 'a');
});

test('Loop: brick pattern shifts each repeat row horizontally', () => {
  // One 1x1 tile at origin with a 2x1 marker -> bounds 4x1, period 200x50.
  const cfg = {
    cols: 4, rows: 4, unitWidth: 50, unitHeight: 50,
    loop: { enabled: true, pattern: 'brick', offset: 0.5 },
  };
  const tiles = [
    { id: 'a', col: 0, row: 0, w: 1, h: 1 },
    { id: 'z', col: 3, row: 0, w: 1, h: 1 },
  ];
  deepEq(loopShift(cfg, tiles), { x: 100, y: 0 }); // 0.5 * 4 cols * 50px
  const out = loopInstances(cfg, tiles, { x: 0, y: 0, width: 200, height: 100 });
  const a00 = out.find((i) => i.key === 'a@0,0');
  const a01 = out.find((i) => i.key === 'a@0,1');
  deepEq({ left: a00.left, top: a00.top }, { left: 0, top: 0 });
  // Repeat row ky=1 is shifted right by half the period.
  deepEq({ left: a01.left, top: a01.top }, { left: 100, top: 50 });
});

test('Loop: drop pattern shifts each repeat column vertically', () => {
  const cfg = {
    cols: 4, rows: 4, unitWidth: 50, unitHeight: 50,
    loop: { enabled: true, pattern: 'drop', offset: 0.5 },
  };
  const tiles = [
    { id: 'a', col: 0, row: 0, w: 1, h: 1 },
    { id: 'z', col: 0, row: 3, w: 1, h: 1 }, // bounds 1x4, period 50x200
  ];
  deepEq(loopShift(cfg, tiles), { x: 0, y: 100 });
  const out = loopInstances(cfg, tiles, { x: 0, y: 0, width: 100, height: 200 });
  const a10 = out.find((i) => i.key === 'a@1,0');
  // Repeat column kx=1 is shifted down by half the period.
  deepEq({ left: a10.left, top: a10.top }, { left: 50, top: 100 });
});

test('Loop: grid pattern has no shift', () => {
  const cfg = {
    cols: 4, rows: 4, unitWidth: 50, unitHeight: 50,
    loop: { enabled: true },
  };
  const tiles = [{ id: 'a', col: 0, row: 0, w: 1, h: 1 }];
  deepEq(loopShift(cfg, tiles), { x: 0, y: 0 });
});

test('Loop: structural repack runs after resize/add, never after moves', () => {
  const holes = (g) => {
    const b = loopBounds(g.tiles);
    const area = g.tiles.reduce((s, t) => s + t.w * t.h, 0);
    return b.cols * b.rows - area;
  };
  const mk = (repack) => new Grid(
    {
      cols: 6, rows: 12, unitWidth: 50, unitHeight: 50,
      loop: { enabled: true, repack },
    },
    [
      { id: 'a', col: 0, row: 0, w: 1, h: 1 },
      { id: 'b', col: 0, row: 1, w: 1, h: 1 },
    ],
  );

  // Default ('toggle'): growing a to 3x1 leaves b stranded under it — the
  // bounding box gains holes and stays that way (no repack).
  const g1 = mk(undefined);
  g1.resizeTile('a', { w: 3, h: 1 });
  assert(holes(g1) > 0, 'toggle mode must not repack after resize');

  // 'structural': the same edit ends densely packed ([a 3x1][b] in one row).
  const g2 = mk('structural');
  g2.resizeTile('a', { w: 3, h: 1 });
  eq(holes(g2), 0, 'structural repack must leave no holes');
  deepEq(loopBounds(g2.tiles), { cols: 4, rows: 1 });

  // Moves never trigger repack even with 'structural'.
  const g3 = mk('structural');
  g3.moveTile('b', { col: 4, row: 5 });
  deepEq({ col: g3.getTile('b').col, row: g3.getTile('b').row }, { col: 4, row: 5 });

  // Adds trigger repack with 'structural'.
  g3.addTile({ id: 'c', col: 5, row: 9, w: 1, h: 1 });
  eq(holes(g3), 0, 'add must repack densely under structural');
});

test('Loop: resolveLoop applies defaults', () => {
  const off = resolveLoop({ cols: 4, rows: 4, unitWidth: 50, unitHeight: 50 });
  eq(off, null);
  const pan = resolveLoop({ cols: 4, rows: 4, unitWidth: 50, unitHeight: 50, loop: { enabled: true } });
  eq(pan.interaction, 'pan');
  assert(pan.dragPan);
  eq(pan.friction, 4);
  eq(pan.pattern, 'grid');
  eq(pan.offset, 0.5);
  eq(pan.repack, 'toggle');
  const edit = resolveLoop({
    cols: 4, rows: 4, unitWidth: 50, unitHeight: 50,
    loop: { enabled: true, interaction: 'edit', physics: { friction: 7 } },
  });
  eq(edit.interaction, 'edit');
  assert(edit.dragPan, 'edit mode drag-pans from the background by default');
  eq(edit.friction, 7);
  const noPan = resolveLoop({
    cols: 4, rows: 4, unitWidth: 50, unitHeight: 50,
    loop: { enabled: true, physics: { dragPan: false } },
  });
  assert(!noPan.dragPan, 'physics.dragPan: false disables drag-to-pan');
});

test('Loop: Grid.pack compacts tiles into a dense block', () => {
  const g = new Grid(
    { cols: 4, rows: 12, unitWidth: 50, unitHeight: 50 },
    [
      { id: 'a', col: 0, row: 4, w: 2, h: 2 },
      { id: 'b', col: 3, row: 9, w: 1, h: 1 },
      { id: 'c', col: 2, row: 4, w: 2, h: 1 },
    ],
  );
  g.pack();
  // Reading order: a (row 4), c (row 4, col 2), b (row 9).
  // a -> (0,0); c -> (2,0); b -> first free scanning row 0: (2,1).
  const a = g.getTile('a');
  const c = g.getTile('c');
  const b = g.getTile('b');
  deepEq({ col: a.col, row: a.row }, { col: 0, row: 0 });
  deepEq({ col: c.col, row: c.row }, { col: 2, row: 0 });
  deepEq({ col: b.col, row: b.row }, { col: 2, row: 1 });
  deepEq(loopBounds(g.tiles), { cols: 4, rows: 2 });
});

test('Loop: pack finds a hole-free tiling when one exists', () => {
  // The React demo's default tile set: 20 cells of area — tiles a 10x2
  // rectangle exactly, so pack must produce zero holes.
  const g = new Grid(
    { cols: 12, rows: 12, unitWidth: 50, unitHeight: 50 },
    [
      { id: '1', col: 0, row: 0, w: 2, h: 2 },
      { id: '2', col: 2, row: 0, w: 1, h: 1 },
      { id: '3', col: 3, row: 0, w: 3, h: 1 },
      { id: '4', col: 6, row: 0, w: 1, h: 2 },
      { id: '5', col: 7, row: 0, w: 2, h: 2 },
      { id: '6', col: 0, row: 2, w: 1, h: 1 },
      { id: '7', col: 1, row: 2, w: 1, h: 1 },
      { id: '8', col: 9, row: 0, w: 1, h: 1 },
      { id: '9', col: 10, row: 0, w: 1, h: 1 },
      { id: '10', col: 2, row: 1, w: 2, h: 1 },
    ],
  );
  g.pack();
  const tiles = g.tiles;
  const area = tiles.reduce((s, t) => s + t.w * t.h, 0);
  const b = loopBounds(tiles);
  eq(b.cols * b.rows, area, 'bounding box must have zero holes');
  // No overlaps.
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], c = tiles[j];
      const overlap =
        a.col < c.col + c.w && c.col < a.col + a.w &&
        a.row < c.row + c.h && c.row < a.row + a.h;
      assert(!overlap, `tiles ${a.id} and ${c.id} overlap`);
    }
  }
});

test('Loop: pack preserves an already-dense layout', () => {
  // A hand-packed perfect 10x2 rectangle: pack must not move anything.
  const layout = [
    { id: '1', col: 0, row: 0, w: 2, h: 2 },
    { id: '2', col: 2, row: 0, w: 1, h: 1 },
    { id: '3', col: 3, row: 0, w: 3, h: 1 },
    { id: '10', col: 2, row: 1, w: 2, h: 1 },
    { id: '7', col: 4, row: 1, w: 1, h: 1 },
    { id: '6', col: 5, row: 1, w: 1, h: 1 },
    { id: '4', col: 6, row: 0, w: 1, h: 2 },
    { id: '5', col: 7, row: 0, w: 2, h: 2 },
    { id: '8', col: 9, row: 0, w: 1, h: 1 },
    { id: '9', col: 9, row: 1, w: 1, h: 1 },
  ];
  const g = new Grid({ cols: 12, rows: 12, unitWidth: 50, unitHeight: 50 }, layout);
  const movedAny = g.pack();
  assert(!movedAny, 'pack must not touch a perfectly dense layout');
  for (const t of layout) {
    const cur = g.getTile(t.id);
    deepEq({ col: cur.col, row: cur.row }, { col: t.col, row: t.row });
  }
});

test('Loop: pack translates an offset dense layout to the origin', () => {
  const g = new Grid(
    { cols: 12, rows: 12, unitWidth: 50, unitHeight: 50 },
    [
      { id: 'a', col: 3, row: 2, w: 2, h: 1 },
      { id: 'b', col: 5, row: 2, w: 1, h: 1 },
    ],
  );
  const movedAny = g.pack();
  assert(movedAny, 'offset layout must be translated');
  deepEq({ col: g.getTile('a').col, row: g.getTile('a').row }, { col: 0, row: 0 });
  deepEq({ col: g.getTile('b').col, row: g.getTile('b').row }, { col: 2, row: 0 });
});

test('Loop: enabling loop auto-packs the layout', () => {
  const g = new Grid(
    { cols: 4, rows: 12, unitWidth: 50, unitHeight: 50 },
    [
      { id: 'a', col: 0, row: 6, w: 1, h: 1 },
      { id: 'b', col: 3, row: 2, w: 1, h: 1 },
    ],
  );
  g.updateConfig({ loop: { enabled: true } });
  const bounds = loopBounds(g.tiles);
  deepEq(bounds, { cols: 2, rows: 1 });
});

test('Loop: pack fires only on the off->on toggle', () => {
  // Constructing (or loading a snapshot) with loop already enabled respects
  // the stored layout as-is — no auto-pack.
  const g = new Grid(
    { cols: 4, rows: 12, unitWidth: 50, unitHeight: 50, loop: { enabled: true } },
    [
      { id: 'a', col: 0, row: 6, w: 1, h: 1 },
      { id: 'b', col: 3, row: 2, w: 1, h: 1 },
    ],
  );
  deepEq({ col: g.getTile('a').col, row: g.getTile('a').row }, { col: 0, row: 6 });
  deepEq({ col: g.getTile('b').col, row: g.getTile('b').row }, { col: 3, row: 2 });
  // Other config changes while looping do not repack.
  g.updateConfig({ gap: 8 });
  deepEq({ col: g.getTile('a').col, row: g.getTile('a').row }, { col: 0, row: 6 });
  // Moving a tile while looping uses the normal pipeline — no repack.
  g.moveTile('b', { col: 2, row: 6 });
  deepEq({ col: g.getTile('b').col, row: g.getTile('b').row }, { col: 2, row: 6 });
  deepEq({ col: g.getTile('a').col, row: g.getTile('a').row }, { col: 0, row: 6 });
  // Toggling loop OFF does not repack either; the layout simply stays.
  g.updateConfig({ loop: { enabled: false } });
  deepEq({ col: g.getTile('a').col, row: g.getTile('a').row }, { col: 0, row: 6 });
  deepEq({ col: g.getTile('b').col, row: g.getTile('b').row }, { col: 2, row: 6 });
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
