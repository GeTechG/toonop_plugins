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

test('every frame goes into the archive, named in order', () => {
  const frames = { ...scene([line]), frames: 12 };

  const files = unzipSync(framesZip(frames));

  const names = Object.keys(files);
  assert.equal(names.length, 12);
  assert.deepEqual([names[0], names[11]], ['toonop-01.svg', 'toonop-12.svg']);
  assert.equal(strFromU8(files['toonop-03.svg']), frameSvg(frames, 2));
});
