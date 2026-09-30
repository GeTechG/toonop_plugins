/**
 * A straight line.
 *
 * The tool collects its own points: of the whole gesture it keeps the first and
 * the last, so what lands in the frame is an ordinary two-point pencil stroke —
 * neither the format nor the player knows a plugin was involved.
 */

import type { Plugin } from '../../../types/toonop';

/**
 * The engine appends what `capture` returns — the addition, never the line
 * rebuilt: a line handed back whole was appended again at every move, the
 * start written over and over, and a fan of lines landed. So every event's
 * point is kept, and the two ends are picked out of them for the hand and for
 * the frame alike: a line stays a line however long it is dragged around.
 */
const capture = (_line: readonly number[], points: readonly number[]): number[] =>
  points.length < 2 ? [] : [points[points.length - 2], points[points.length - 1]];

const ends = (line: readonly number[]): number[] =>
  line.length < 2 ? [...line] : [line[0], line[1], line[line.length - 2], line[line.length - 1]];

/** Drawn on the 24-unit grid: the catalog record and the tool both take it. */
const ICON = '<path d="M5 19 19 5" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" />';

const plugin: Plugin = {
  id: 'straight-line',
  // The major this plugin was written against: see types/toonop.ts.
  api: 1,
  icon: ICON,
  // Its own words, under its own namespace in the editor's i18next. The
  // manifest below points into them by key; `host.t` would read the same.
  locales: {
    ru: { label: 'Линия', title: 'Ровная линия (U)' },
    en: { label: 'Line', title: 'Straight line (U)' },
  },
  tools: {
    'straight-line': {
      label: { t: 'label' },
      title: { t: 'title' },
      key: 'u',
      icon: ICON,
      stroke: {
        kind: 'pencil',
        descriptor: ({ width, color }) => ({ kind: 'pencil', geometry: 'smooth', width, color }),
        // Its own rules, so the line is the same whatever brush the preset
        // would have handed it. The numbers are logical pixels, as every
        // brush's are, and no document rescales them.
        rules: () => ({
          range: { min: 1, max: 500 },
          defaults: { width: 5, smooth: 3, minDistance: 3 },
          // Two points: neither thinning number has anything to do here.
          smoothing: false,
          capture,
          preview: ends,
          prepare: ends,
        }),
      },
    },
  },
};

export default plugin;
