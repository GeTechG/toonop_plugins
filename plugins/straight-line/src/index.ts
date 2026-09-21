/**
 * A straight line.
 *
 * The tool collects its own points: of the whole gesture it keeps the first and
 * the last, so what lands in the frame is an ordinary two-point pencil stroke —
 * neither the format nor the player knows a plugin was involved.
 */

import type { Plugin } from '../../../types/toonop';

const plugin: Plugin = {
  id: 'straight-line',
  api: 1,
  tool: {
    label: 'Линия',
    title: 'Ровная линия (L)',
    key: 'l',
    icon: '<path d="M5 19 19 5" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" />',
    stroke: {
      kind: 'pencil',
      descriptor: ({ width, color, dialect }) => ({ kind: 'pencil', dialect, width, color }),
      // The first point of the gesture is the start, the latest one the end.
      // Nothing piles up between them: a line stays a line however long it is
      // dragged around.
      capture: (line, points) => {
        if (points.length < 2) {
          return [...line];
        }
        const x = points[points.length - 2];
        const y = points[points.length - 1];
        return line.length >= 2 ? [line[0], line[1], x, y] : [x, y];
      },
      // Two points are a finished stroke already: nothing to thin out.
      prepare: (points) => [...points],
    },
  },
};

export default plugin;
