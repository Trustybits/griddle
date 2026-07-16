import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampInteractionCell,
  measureInteractionScale,
  resolveResizePreview,
  toLocalInteractionDelta,
} from '../dist/interaction.js';

function element({
  rectWidth,
  rectHeight,
  offsetWidth,
  offsetHeight,
}) {
  return {
    offsetWidth,
    offsetHeight,
    getBoundingClientRect: () => ({
      width: rectWidth,
      height: rectHeight,
    }),
  };
}

test('interaction scale is one for an untransformed grid', () => {
  const scale = measureInteractionScale(element({
    rectWidth: 1200,
    rectHeight: 800,
    offsetWidth: 1200,
    offsetHeight: 800,
  }));

  assert.deepEqual(scale, { x: 1, y: 1 });
  assert.deepEqual(
    toLocalInteractionDelta(123, 246, scale),
    { dx: 123, dy: 246 },
  );
});

test('viewport drag deltas are converted through a scaled grid', () => {
  const scale = measureInteractionScale(element({
    rectWidth: 600,
    rectHeight: 400,
    offsetWidth: 1200,
    offsetHeight: 800,
  }));

  assert.deepEqual(scale, { x: 0.5, y: 0.5 });
  assert.deepEqual(
    toLocalInteractionDelta(61.5, 123, scale),
    { dx: 123, dy: 246 },
  );
});

test('a temporarily zero-sized axis reuses the valid measured axis', () => {
  const scale = measureInteractionScale(element({
    rectWidth: 600,
    rectHeight: 0,
    offsetWidth: 1200,
    offsetHeight: 0,
  }));

  assert.deepEqual(scale, { x: 0.5, y: 0.5 });
});

test('missing measurement data safely falls back to unscaled coordinates', () => {
  assert.deepEqual(measureInteractionScale(null), { x: 1, y: 1 });
  assert.deepEqual(measureInteractionScale(element({
    rectWidth: 0,
    rectHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
  })), { x: 1, y: 1 });
});

test('south-east resize trims at finite right and bottom edges', () => {
  assert.deepEqual(resolveResizePreview({
    corner: 'se',
    startCol: 2,
    startRow: 1,
    startW: 1,
    startH: 1,
    stepsX: 20,
    stepsY: 20,
    minW: 1,
    minH: 1,
    maxW: Infinity,
    maxH: Infinity,
    cols: 4,
    rows: 3,
    infiniteX: false,
    infiniteY: false,
  }), { col: 2, row: 1, w: 2, h: 2 });
});

test('north-west resize trims at zero while preserving opposite edges', () => {
  assert.deepEqual(resolveResizePreview({
    corner: 'nw',
    startCol: 2,
    startRow: 2,
    startW: 2,
    startH: 2,
    stepsX: -20,
    stepsY: -20,
    minW: 1,
    minH: 1,
    maxW: Infinity,
    maxH: Infinity,
    cols: 6,
    rows: 6,
    infiniteX: false,
    infiniteY: false,
  }), { col: 0, row: 0, w: 4, h: 4 });
});

test('draw cells clamp to the final finite cell but remain open on infinite axes', () => {
  assert.equal(clampInteractionCell(9, 4, false), 3);
  assert.equal(clampInteractionCell(-2, 4, false), 0);
  assert.equal(clampInteractionCell(9, 4, true), 9);
});
