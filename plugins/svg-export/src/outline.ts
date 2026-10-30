/**
 * A line of changing width as one outline.
 *
 * The renderer fills such a line as a circle at every vertex and a quad between
 * neighbours, eight vertices to a stored point — right for a canvas, and a pile
 * of thousands of shapes for whoever opens the file in a vector editor. Here the
 * circles are thinned, their union is taken and the union's edge is fitted with
 * curves: the same picture to within `TOLERANCE`, as a few nodes.
 */

import ClipperLib from 'clipper-lib';
import fitCurve from 'fit-curve';

/** How far the curves may stray from the union, in document units: 1/8 of a logical pixel. */
const TOLERANCE = 1;

/** How far a thinned line may stray from the one the renderer drew. */
const THIN_TOLERANCE = 0.5;

/** A circle is a polygon this close to it, and never cruder than an octagon. */
const CIRCLE_TOLERANCE = 0.25;
const CIRCLE_MIN_SIDES = 8;

/** Clipper works in whole numbers: this many of them to a document unit. */
const CLIPPER_SCALE = 16;

/** The longest stretch of edge a fitted curve gets no point on: a logical pixel. */
const MAX_GAP = 8;

/** A turn sharper than this is a corner a curve must not round off. */
const CORNER = (50 * Math.PI) / 180;

type Circle = readonly [x: number, y: number, r: number];
type Point = [x: number, y: number];

/**
 * Douglas-Peucker over the centre and radius: what it drops stays within
 * `tolerance` of what it keeps. Returns the indices kept; a closed run, whose
 * two ends are one point, is split at the point farthest from them.
 */
function thin(circles: readonly Circle[], tolerance: number): number[] {
  const keep = new Uint8Array(circles.length);
  keep[0] = keep[circles.length - 1] = 1;
  const stack = [0, circles.length - 1];
  while (stack.length > 0) {
    const last = stack.pop()!;
    const first = stack.pop()!;
    const [ax, ay, ar] = circles[first];
    const [bx, by, br] = circles[last];
    const dx = bx - ax;
    const dy = by - ay;
    const square = dx * dx + dy * dy;
    let worst = 0;
    let at = -1;
    for (let i = first + 1; i < last; i++) {
      const [x, y, r] = circles[i];
      const t = square > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / square)) : 0;
      const off = Math.hypot(x - ax - dx * t, y - ay - dy * t) + Math.abs(r - ar - (br - ar) * t);
      if (off > worst) {
        worst = off;
        at = i;
      }
    }
    if (worst > tolerance) {
      keep[at] = 1;
      stack.push(first, at, at, last);
    }
  }
  return circles.flatMap((_, i) => (keep[i] === 1 ? [i] : []));
}

function circlePolygon([x, y, r]: Circle): Point[] {
  const sides = Math.max(CIRCLE_MIN_SIDES, Math.ceil(Math.PI / Math.acos(1 - Math.min(CIRCLE_TOLERANCE / r, 0.5))));
  const polygon: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    polygon.push([x + r * Math.cos(angle), y + r * Math.sin(angle)]);
  }
  return polygon;
}

/** What joins two circles: the quad on their outer tangents, none if one holds the other. */
function joint([ax, ay, ra]: Circle, [bx, by, rb]: Circle): Point[] | null {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length <= Math.abs(ra - rb)) {
    return null;
  }
  const sin = (ra - rb) / length;
  const cos = Math.sqrt(1 - sin * sin);
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy * cos + ux * sin;
  const py = ux * cos + uy * sin;
  const qx = uy * cos + ux * sin;
  const qy = -ux * cos + uy * sin;
  return [
    [ax + px * ra, ay + py * ra],
    [bx + px * rb, by + py * rb],
    [bx + qx * rb, by + qy * rb],
    [ax + qx * ra, ay + qy * ra],
  ];
}

/** The union's edges: outer ones wound against the holes, as a nonzero fill wants. */
function union(polygons: readonly Point[][]): Point[][] {
  const clipper = new ClipperLib.Clipper();
  for (const polygon of polygons) {
    const path = polygon.map(([x, y]) => ({ X: Math.round(x * CLIPPER_SCALE), Y: Math.round(y * CLIPPER_SCALE) }));
    // Everything wound one way, or an overlap would cancel out.
    clipper.AddPath(ClipperLib.Clipper.Orientation(path) ? path : path.reverse(), ClipperLib.PolyType.ptSubject, true);
  }
  const edges: { X: number; Y: number }[][] = [];
  clipper.Execute(ClipperLib.ClipType.ctUnion, edges, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return edges.map((edge) => edge.map(({ X, Y }): Point => [X / CLIPPER_SCALE, Y / CLIPPER_SCALE]));
}

/**
 * Where the closed edge has to be cut for the curves: its corners, or anywhere.
 * Read off the edge thinned to `CIRCLE_TOLERANCE`, since at full detail the
 * steps of Clipper's whole numbers turn as sharply as any corner.
 */
function corners(edge: readonly Point[]): number[] {
  const closed = [...edge, edge[0]].map(([x, y]): Circle => [x, y, 0]);
  const kept = thin(closed, CIRCLE_TOLERANCE).slice(0, -1);
  const found = kept.filter((index, i) => {
    const [px, py] = edge[kept[(i + kept.length - 1) % kept.length]];
    const [x, y] = edge[index];
    const [nx, ny] = edge[kept[(i + 1) % kept.length]];
    const turn = Math.atan2((x - px) * (ny - y) - (y - py) * (nx - x), (x - px) * (nx - x) + (y - py) * (ny - y));
    return Math.abs(turn) > CORNER;
  });
  return found.length > 0 ? found : [0];
}

const number = (value: number): string => String(Math.round(value * 10) / 10);

function fittedEdge(edge: readonly Point[]): string {
  const cuts = corners(edge);
  let d = `M${number(edge[cuts[0]][0])} ${number(edge[cuts[0]][1])}`;
  cuts.forEach((cut, k) => {
    const next = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + edge.length;
    const section: Point[] = [edge[cut]];
    for (let i = cut + 1; i <= next; i++) {
      const [ax, ay] = edge[(i - 1) % edge.length];
      const [bx, by] = edge[i % edge.length];
      // A curve answers only for the points it is given: a long edge bare of
      // them is room for it to bulge.
      const parts = Math.ceil(Math.hypot(bx - ax, by - ay) / MAX_GAP);
      for (let part = 1; part <= parts; part++) {
        section.push([ax + ((bx - ax) * part) / parts, ay + ((by - ay) * part) / parts]);
      }
    }
    for (const [, c1, c2, end] of fitCurve(section, TOLERANCE * TOLERANCE)) {
      d += `C${number(c1[0])} ${number(c1[1])} ${number(c2[0])} ${number(c2[1])} ${number(end[0])} ${number(end[1])}`;
    }
  });
  return `${d}Z`;
}

/** The path of a line's circles, in the order the line runs through them. */
export function outlinePath(circles: readonly Circle[]): string {
  const kept = thin(circles, THIN_TOLERANCE).map((i) => circles[i]);
  const polygons = kept.map(circlePolygon);
  for (let i = 1; i < kept.length; i++) {
    const quad = joint(kept[i - 1], kept[i]);
    if (quad) {
      polygons.push(quad);
    }
  }
  return union(polygons).map(fittedEdge).join('');
}
