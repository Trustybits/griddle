import test from 'node:test';
import assert from 'node:assert/strict';
import { animateReposition, liftTransition } from '../dist/animation.js';

function harness() {
  let nextFrame = 1;
  const frames = new Map();
  const cancelled = [];
  let reducedMotion = false;

  globalThis.window = {
    getComputedStyle(node) {
      return { translate: node.computedTranslate ?? node.style.translate ?? 'none' };
    },
    matchMedia() {
      return { matches: reducedMotion };
    },
  };
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    cancelled.push(id);
    frames.delete(id);
  };

  return {
    node(translate = 'none') {
      return {
        style: { transform: 'translate(30px, 40px)' },
        computedTranslate: translate,
        offsetWidth: 100,
      };
    },
    frames,
    cancelled,
    setReducedMotion(value) {
      reducedMotion = value;
    },
  };
}

test('animateReposition preserves transform and continues from the visible translate', () => {
  const h = harness();
  const node = h.node('5px -2px');
  animateReposition(node, 10, 20, {
    repositionDurationMs: 400,
    repositionEasing: 'linear',
  });

  assert.equal(node.style.transform, 'translate(30px, 40px)');
  assert.equal(node.style.translate, '15px 18px');
  assert.equal(node.style.transition, 'none');
  assert.equal(h.frames.size, 1);
  [...h.frames.values()][0]();
  assert.equal(node.style.transition, 'translate 400ms linear');
  assert.equal(node.style.translate, '0px 0px');
  assert.equal(node.style.transform, 'translate(30px, 40px)');
});

test('animateReposition cancels a pending play frame when interrupted', () => {
  const h = harness();
  const node = h.node();
  animateReposition(node, 10, 10);
  const firstFrame = [...h.frames.keys()][0];
  node.computedTranslate = '6px 4px';
  animateReposition(node, 20, -5);

  assert.deepEqual(h.cancelled, [firstFrame]);
  assert.equal(node.style.translate, '26px -1px');
  assert.equal(h.frames.size, 1);
});

test('animateReposition disables motion without disturbing transform', () => {
  const h = harness();
  const node = h.node('8px 3px');
  animateReposition(node, 10, 10, { enabled: false });

  assert.equal(node.style.transition, 'none');
  assert.equal(node.style.translate, '0px 0px');
  assert.equal(node.style.transform, 'translate(30px, 40px)');
  assert.equal(h.frames.size, 0);
});

test('animateReposition honors reduced motion unless explicitly opted out', () => {
  const h = harness();
  h.setReducedMotion(true);
  const reducedNode = h.node();
  animateReposition(reducedNode, 10, 10);
  assert.equal(h.frames.size, 0);

  const optedOutNode = h.node();
  animateReposition(optedOutNode, 10, 10, { respectReducedMotion: false });
  assert.equal(h.frames.size, 1);
});

test('liftTransition applies configured timing and reduced-motion behavior', () => {
  const h = harness();
  assert.equal(
    liftTransition({ liftDurationMs: 200, liftEasing: 'linear' }),
    'filter 200ms linear, opacity 200ms linear',
  );
  h.setReducedMotion(true);
  assert.equal(
    liftTransition({ liftDurationMs: 200, liftEasing: 'linear' }),
    'filter 0ms linear, opacity 0ms linear',
  );
});
