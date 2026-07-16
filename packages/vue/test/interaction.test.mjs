import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measureInteractionScale,
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
