import assert from 'node:assert/strict';
import { test } from 'node:test';

import plugin from './index.ts';

/**
 * The editor's engine as the contract states it: `capture` returns what a
 * batch adds, and the engine appends it; `preview` and `prepare` read the
 * whole line.
 */
function drag(...points: [number, number][]): { preview: number[]; stroke: number[] } {
  const rules = plugin.tools!['straight-line'].stroke!.rules!({
    width: 40, color: '#000000', fill: '#ffffff', smooth: 3, minDistance: 3,
  })!;
  const line: number[] = [];
  let preview: number[] = [];
  for (const [x, y] of points) {
    line.push(...rules.capture(line, [x, y], 40));
    preview = rules.preview ? rules.preview(line) : [...line];
  }
  return { preview, stroke: rules.prepare ? rules.prepare(line, 40, 1) : [...line] };
}

test('a drag lands one straight stroke from where it began to where it ended', () => {
  // The line came back rebuilt from `capture`, and the engine appended it:
  // the start was written again at every move, and a fan of lines landed.
  const { preview, stroke } = drag([0, 0], [80, 80], [160, 40], [240, 240]);
  assert.deepEqual(stroke, [0, 0, 240, 240]);
  assert.deepEqual(preview, [0, 0, 240, 240]);
});

test('a tap is a dot', () => {
  assert.deepEqual(drag([8, 8], [8, 8]).stroke, [8, 8, 8, 8]);
});
