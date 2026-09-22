/**
 * SVG export.
 *
 * Two formats of the export window: the frame in hand as one SVG, and every
 * frame as a zip of SVGs, for whoever carries the drawing on in a vector
 * editor. The editor draws each cell for us (see `svg.ts`), so the picture in
 * the file is the one the player shows.
 */

import type { Plugin } from '../../../types/toonop.ts';
import { frameSvg, framesZip } from './svg.ts';
// A bundle put in from a file has no catalog record: it names itself, with
// the words its package already carries rather than a second copy of them.
import pkg from '../package.json' with { type: 'json' };

/** Drawn on the 24-unit grid: a curve between its two anchors. */
const ICON = '<path d="M5 19C5 9 19 15 19 5" /><rect x="3" y="17" width="4" height="4" /><rect x="17" y="3" width="4" height="4" />';

const plugin: Plugin = {
  id: 'svg-export',
  // The major this plugin was written against: see types/toonop.ts.
  api: 1,
  name: pkg.toonop.title,
  version: pkg.version,
  description: pkg.toonop.description,
  icon: ICON,
  locales: {
    ru: {
      frame: 'SVG',
      frame_hint: 'Кадр в руках одним файлом',
      frames: 'SVG, все кадры',
      frames_hint: 'Каждый кадр отдельным SVG, архивом .zip',
    },
    en: {
      frame: 'SVG',
      frame_hint: 'The frame in hand as one file',
      frames: 'SVG, every frame',
      frames_hint: 'Each frame as its own SVG, in a .zip',
    },
  },
  exporters: {
    svg: {
      label: { t: 'frame' },
      hint: { t: 'frame_hint' },
      run: (scene) => ({
        blob: new Blob([frameSvg(scene, scene.frame)], { type: 'image/svg+xml' }),
        name: 'toonop.svg',
      }),
    },
    'svg-frames': {
      label: { t: 'frames' },
      hint: { t: 'frames_hint' },
      run: (scene) => ({
        blob: new Blob([framesZip(scene)], { type: 'application/zip' }),
        name: 'toonop-svg.zip',
      }),
    },
  },
};

export default plugin;
