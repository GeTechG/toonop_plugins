/**
 * A straight line.
 *
 * The tool collects its own points: of the whole gesture it keeps the first and
 * the last, so what lands in the frame is an ordinary two-point pencil stroke —
 * neither the format nor the player knows a plugin was involved.
 */

import type { Plugin } from '../../../types/toonop';

/**
 * The first point of the gesture is the start, the latest one the end.
 * Nothing piles up between them: a line stays a line however long it is
 * dragged around. Two points are a finished stroke already, so the commit
 * thins nothing.
 */
const capture = (line: readonly number[], points: readonly number[]): number[] => {
  if (points.length < 2) {
    return [...line];
  }
  const x = points[points.length - 2];
  const y = points[points.length - 1];
  return line.length >= 2 ? [line[0], line[1], x, y] : [x, y];
};

/** Drawn on the 24-unit grid: the catalog record and the tool both take it. */
const ICON = '<path d="M5 19 19 5" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" />';

const plugin: Plugin = {
  id: 'straight-line',
  // The major this plugin was written against: see types/toonop.ts.
  api: 1,
  icon: ICON,
  tools: {
    'straight-line': {
      label: 'Линия',
      title: 'Ровная линия (L)',
      key: 'l',
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
          prepare: (points) => [...points],
        }),
      },
    },
  },
};

export default plugin;
