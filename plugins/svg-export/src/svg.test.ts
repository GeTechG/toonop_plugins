import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PluginCanvas, PluginScene } from '../../../types/toonop.ts';
import { strFromU8, unzipSync } from 'fflate';

import { frameSvg, framesZip } from './svg.ts';

/** A scene of one frame whose layers are whatever the test draws on the canvas. */
function scene(layers: ((canvas: PluginCanvas) => void)[]): PluginScene {
  return {
    width: 800,
    height: 400,
    frameRate: 12,
    frames: 1,
    frame: 0,
    background: '#ffffff',
    layers: layers.length,
    draw: (layer, _frame, canvas) => layers[layer]?.(canvas),
  };
}

const line = (canvas: PluginCanvas) => {
  canvas.setTransform(1, 0, 0, 1, 0, 0);
  canvas.beginPath();
  canvas.lineWidth = 40;
  canvas.strokeStyle = '#ff0000';
  canvas.lineCap = 'round';
  canvas.lineJoin = 'round';
  canvas.moveTo(0, 0);
  canvas.quadraticCurveTo(80, 80, 160, 0);
  canvas.stroke();
};

test('the picture is the canvas: logical pixels outside, document units inside, on the background', () => {
  const svg = frameSvg(scene([]), 0);

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100" height="50" viewBox="0 0 800 400">/);
  assert.match(svg, /<rect width="800" height="400" fill="#ffffff"\/>/);
  assert.match(svg, /<\/svg>$/);
});

test('a stroked path keeps its curve, width, colour and round ends', () => {
  const svg = frameSvg(scene([line]), 0);

  assert.match(svg, /<path d="M0 0Q80 80 160 0" fill="none" stroke="#ff0000" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"\/>/);
});

test('a dot is a filled circle of its radius', () => {
  const svg = frameSvg(scene([(canvas) => {
    canvas.beginPath();
    canvas.fillStyle = '#00ff00';
    canvas.arc(10, 20, 5, 0, Math.PI * 2);
    canvas.fill();
  }]), 0);

  assert.match(svg, /<path d="M5 20a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" fill="#00ff00"\/>/);
});

test('a filled square mark is a rect', () => {
  const svg = frameSvg(scene([(canvas) => {
    canvas.fillStyle = '#0000ff';
    canvas.fillRect(8, 16, 8, 8);
  }]), 0);

  assert.match(svg, /<rect x="8" y="16" width="8" height="8" fill="#0000ff"\/>/);
});

test('an eraser masks what its layer drew before it, and nothing after or below', () => {
  const erase = (canvas: PluginCanvas) => {
    line(canvas);
    canvas.globalCompositeOperation = 'destination-out';
    canvas.beginPath();
    canvas.lineWidth = 16;
    canvas.strokeStyle = '#000000';
    canvas.moveTo(0, 50);
    canvas.lineTo(100, 50);
    canvas.stroke();
    canvas.globalCompositeOperation = 'source-over';
    canvas.beginPath();
    canvas.fillStyle = '#123456';
    canvas.fillRect(1, 1, 2, 2);
  };
  const svg = frameSvg(scene([line, erase]), 0);

  const [below, top] = svg.split('</g><g>');
  assert.doesNotMatch(below, /mask/);
  assert.match(top, /<mask id="m1" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="400"><rect width="800" height="400" fill="#fff"\/><path d="M0 50L100 50" fill="none" stroke="#000" stroke-width="16"/);
  assert.match(top, /<g mask="url\(#m1\)"><path d="M0 0Q80 80 160 0"[^>]*\/><\/g><rect x="1" y="1"/);
});

test('every frame goes into the archive, named in order', async () => {
  const frames = { ...scene([line]), frames: 12 };

  const files = unzipSync(await framesZip(frames));

  const names = Object.keys(files);
  assert.equal(names.length, 12);
  assert.deepEqual([names[0], names[11]], ['toonop-01.svg', 'toonop-12.svg']);
  assert.equal(strFromU8(files['toonop-03.svg']), frameSvg(frames, 2));
});

/**
 * A line of changing width as the renderer sends it: a circle at every vertex,
 * then a quad between neighbours. Eight vertices for each stored point.
 */
function pressured(canvas: PluginCanvas, chain: number[][], color = '#ff0000') {
  canvas.beginPath();
  canvas.fillStyle = color;
  for (const [x, y, r] of chain) {
    canvas.moveTo(x + r, y);
    canvas.arc(x, y, r, 0, Math.PI * 2);
  }
  for (let i = 1; i < chain.length; i++) {
    const [ax, ay, ra] = chain[i - 1];
    const [bx, by, rb] = chain[i];
    const length = Math.hypot(bx - ax, by - ay);
    if (length === 0) continue;
    const nx = -(by - ay) / length;
    const ny = (bx - ax) / length;
    canvas.moveTo(ax + nx * ra, ay + ny * ra);
    canvas.lineTo(bx + nx * rb, by + ny * rb);
    canvas.lineTo(bx - nx * rb, by - ny * rb);
    canvas.lineTo(ax - nx * ra, ay - ny * ra);
  }
  canvas.fill();
}

/** A wobbly spiral with a press that comes and goes: `stored` points of a pen. */
function spiral(stored: number): number[][] {
  const chain: number[][] = [];
  const vertices = stored * 8;
  for (let i = 0; i <= vertices; i++) {
    const t = i / vertices;
    const a = t * Math.PI * 6;
    chain.push([
      4000 + 3000 * t * Math.cos(a) + 30 * Math.sin(t * 90),
      3000 + 2000 * t * Math.sin(a),
      6 + 34 * (0.5 + 0.5 * Math.sin(t * 20)),
    ]);
  }
  return chain;
}

const nodes = (svg: string): number => (svg.match(/[MLCQa]/g) ?? []).length;

test('a pressed line is one path of a few nodes, not a shape per sample', () => {
  const svg = frameSvg(scene([(canvas) => pressured(canvas, spiral(200))]), 0);

  assert.equal(svg.match(/<path /g)?.length, 1);
  assert.ok(nodes(svg) < 400, `${nodes(svg)} nodes`);
});

/** A path of `M`, `C` and `Z` as closed polygons, its curves cut fine. */
function polygons(d: string): number[][][] {
  const rings: number[][][] = [];
  for (const [, command, args] of d.matchAll(/([MCZ])([^MCZ]*)/g)) {
    const v = args.trim().split(/\s+/).map(Number);
    if (command === 'M') {
      rings.push([[v[0], v[1]]]);
    } else if (command === 'C') {
      const ring = rings[rings.length - 1];
      const [ax, ay] = ring[ring.length - 1];
      for (let step = 1; step <= 16; step++) {
        const t = step / 16;
        const u = 1 - t;
        ring.push([
          u * u * u * ax + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4],
          u * u * u * ay + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5],
        ]);
      }
    }
  }
  return rings;
}

/** Whether the nonzero rule paints a point. */
function painted(rings: number[][][], x: number, y: number): boolean {
  let winding = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      if ((ay <= y) !== (by <= y) && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) {
        winding += by > ay ? 1 : -1;
      }
    }
  }
  return winding !== 0;
}

/** How far a point is inside the line (positive) or outside it (negative). */
function depth(chain: number[][], x: number, y: number): number {
  let best = -Infinity;
  for (let i = 1; i < chain.length; i++) {
    const [ax, ay, ra] = chain[i - 1];
    const [bx, by, rb] = chain[i];
    const dx = bx - ax;
    const dy = by - ay;
    const square = dx * dx + dy * dy;
    const t = square > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / square)) : 0;
    best = Math.max(best, ra + (rb - ra) * t - Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

test('the outline paints what the line covers, to within a quarter of a pixel', () => {
  const chain = spiral(100);
  const d = frameSvg(scene([(canvas) => pressured(canvas, chain)]), 0).match(/<path d="([^"]*)"/)![1];
  const rings = polygons(d);

  let checked = 0;
  for (let y = 0; y < 6000; y += 37) {
    for (let x = 0; x < 8000; x += 41) {
      const inside = depth(chain, x, y);
      if (Math.abs(inside) > 2) {
        assert.equal(painted(rings, x, y), inside > 0, `at ${x} ${y}, ${inside} deep`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 10000);
});

test('a line closed in a ring leaves its middle unpainted', () => {
  const ring = Array.from({ length: 200 }, (_, i) => {
    const a = (i / 199) * Math.PI * 2;
    return [400 + 200 * Math.cos(a), 200 + 150 * Math.sin(a), 20];
  });
  const d = frameSvg(scene([(canvas) => pressured(canvas, ring)]), 0).match(/<path d="([^"]*)"/)![1];
  const rings = polygons(d);

  assert.equal(painted(rings, 400, 200), false);
  assert.equal(painted(rings, 600, 200), true);
  assert.equal(painted(rings, 100, 20), false);
});

test('a pressed line stood still is a dot', () => {
  const svg = frameSvg(scene([(canvas) => pressured(canvas, [[10, 20, 5], [10, 20, 5]])]), 0);

  assert.match(svg, /<path d="M5 20a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" fill="#ff0000"\/>/);
});

test('a pressed eraser cuts with the same outline, black in the mask', () => {
  const erase = (canvas: PluginCanvas) => {
    line(canvas);
    canvas.globalCompositeOperation = 'destination-out';
    pressured(canvas, spiral(200), '#000000');
  };
  const svg = frameSvg(scene([erase]), 0);

  const mask = svg.match(/<mask [^>]*>(.*)<\/mask>/)![1];
  assert.equal(mask.match(/<path /g)?.length, 1);
  assert.match(mask, /<path d="M[^"]*Z" fill="#000"\/>/);
  assert.ok(nodes(mask) < 400, `${nodes(mask)} nodes`);
});
