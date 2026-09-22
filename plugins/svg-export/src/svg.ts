/**
 * A frame as SVG.
 *
 * The editor draws each cell onto a canvas we bring, with the commands its own
 * renderer uses; this canvas writes them down as SVG instead of pixels. Nothing
 * here reads a stroke's points: which curve a `smooth` or a `cubic` stroke is
 * stays the editor's business, so the file is the same picture the player shows.
 */

import { strToU8, zipSync } from 'fflate';

import type { PluginCanvas, PluginScene } from '../../../types/toonop.ts';

/** Document units per logical pixel (`FIXED_POINT_SCALE` of the contract). */
const UNITS_PER_PIXEL = 8;

/** Numbers the way a path reads well: no trailing zeros, no float noise. */
const n = (value: number): string => String(Math.round(value * 1000) / 1000);

const escape = (value: string): string => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * One layer's worth of canvas, as SVG markup.
 *
 * An eraser (`destination-out`) cuts the alpha of what its layer drew before
 * it: everything so far goes under a mask the eraser is black in, and what
 * comes after is drawn over it untouched. Erasers in a row share one mask.
 */
class SvgCanvas implements PluginCanvas {
  globalCompositeOperation = 'source-over';
  lineWidth = 1;
  strokeStyle = '#000000';
  fillStyle = '#000000';
  lineCap = 'butt';
  lineJoin = 'miter';

  #d = '';
  #body = '';
  /** What the erasers in a row cut, waiting for the next paint to close the mask. */
  #cut = '';
  #masks: { next: number };
  #width: number;
  #height: number;

  constructor(width: number, height: number, masks: { next: number }) {
    this.#width = width;
    this.#height = height;
    this.#masks = masks;
  }

  // The scene draws in document units, which is what the viewBox is in.
  setTransform(): void {}

  beginPath(): void {
    this.#d = '';
  }

  moveTo(x: number, y: number): void {
    this.#d += `M${n(x)} ${n(y)}`;
  }

  lineTo(x: number, y: number): void {
    this.#d += `L${n(x)} ${n(y)}`;
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.#d += `Q${n(cpx)} ${n(cpy)} ${n(x)} ${n(y)}`;
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    this.#d += `C${n(cp1x)} ${n(cp1y)} ${n(cp2x)} ${n(cp2y)} ${n(x)} ${n(y)}`;
  }

  /**
   * The renderer only ever arcs a whole circle — a dot — so it is written as
   * two half-circle arcs, which a path can close on itself.
   */
  arc(x: number, y: number, r: number): void {
    this.#d += `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`;
  }

  fill(): void {
    this.#put((paint) => `<path d="${this.#d}" fill="${paint(this.fillStyle)}"/>`);
  }

  stroke(): void {
    this.#put((paint) => `<path d="${this.#d}" fill="none" stroke="${paint(this.strokeStyle)}" `
      + `stroke-width="${n(this.lineWidth)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"/>`);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.#put((paint) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${paint(this.fillStyle)}"/>`);
  }

  /** Paint goes on the layer; an eraser's shape goes into the mask, black. */
  #put(element: (paint: (color: string) => string) => string): void {
    if (this.globalCompositeOperation === 'destination-out') {
      this.#cut += element(() => '#000');
      return;
    }
    this.#closeMask();
    this.#body += element(escape);
  }

  #closeMask(): void {
    if (!this.#cut) {
      return;
    }
    const id = `m${this.#masks.next++}`;
    const size = `width="${this.#width}" height="${this.#height}"`;
    // In user space and over the whole canvas: the default region is the
    // masked group's box, which a straight line has no height of.
    this.#body = `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" ${size}>`
      + `<rect ${size} fill="#fff"/>${this.#cut}</mask>`
      + `<g mask="url(#${id})">${this.#body}</g>`;
    this.#cut = '';
  }

  markup(): string {
    this.#closeMask();
    return this.#body;
  }
}

/** One frame of the scene: every visible layer bottom-up, on the background. */
export function frameSvg(scene: PluginScene, frame: number): string {
  const { width, height } = scene;
  const masks = { next: 1 };
  let layers = '';
  for (let layer = 0; layer < scene.layers; layer++) {
    const canvas = new SvgCanvas(width, height, masks);
    scene.draw(layer, frame, canvas);
    layers += `<g>${canvas.markup()}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width / UNITS_PER_PIXEL)}" height="${n(height / UNITS_PER_PIXEL)}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="${escape(scene.background)}"/>${layers}</svg>`;
}

/** Every frame, one SVG each, numbered wide enough to sort the way they play. */
export function framesZip(scene: PluginScene): Uint8Array {
  const digits = Math.max(2, String(scene.frames).length);
  const files: Record<string, Uint8Array> = {};
  for (let frame = 0; frame < scene.frames; frame++) {
    files[`toonop-${String(frame + 1).padStart(digits, '0')}.svg`] = strToU8(frameSvg(scene, frame));
  }
  return zipSync(files);
}
