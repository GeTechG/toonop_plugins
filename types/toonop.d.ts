/**
 * The plugin contract of the toonop editor, api 1.
 *
 * A copy of the public part of the editor's `plugins/contract.ts`. It is kept
 * by hand: pulling the editor in as a package for types alone costs more than
 * updating one file when the major changes.
 */

/** The canvas a stroke's numbers are measured on. */
export type StrokeDialect = 'multator' | 'toonio';

export interface PencilToolDescriptor {
  readonly kind: 'pencil';
  readonly dialect: StrokeDialect;
  readonly width: number;
  readonly color: string;
}

export interface EraserToolDescriptor {
  readonly kind: 'eraser';
  readonly dialect: StrokeDialect;
  readonly width: number;
}

export interface FeatherToolDescriptor {
  readonly kind: 'feather';
  readonly dialect: StrokeDialect;
  readonly width: number;
  readonly color: string;
  readonly fill: string;
}

/**
 * A stamped mark: the points are places, `shape` the polygon filled at each of
 * them, on the unit square (`[0,0, 1,0, 1,1, 0,1]` is the pixel cell).
 */
export interface StampToolDescriptor {
  readonly kind: 'stamp';
  readonly dialect: 'toonio';
  readonly width: number;
  readonly color: string;
  readonly shape: readonly number[];
}

/** The primitives the format knows and the renderer draws. A plugin invents none. */
export type LineToolDescriptor =
  | PencilToolDescriptor
  | EraserToolDescriptor
  | FeatherToolDescriptor
  | StampToolDescriptor;

/** A stroke of the frame, as a plugin may rewrite it. */
export interface PluginStroke {
  points: number[];
  [field: string]: unknown;
}

export interface PluginPoint {
  readonly x: number;
  readonly y: number;
}

/** The plugin's only way into the editor: data out, edits in. */
export interface PluginHost {
  /** A node inside a floating window of the editor; it lives until the tool is left. */
  window(opts: { title: string }): HTMLElement;
  /** The strokes of the current frame on the selected, visible layers. */
  strokes(): readonly PluginStroke[];
  /** One edit of the document. Undo is the editor's business, never the plugin's. */
  edit(fn: (strokes: PluginStroke[]) => void): void;
  /** Document units → reference-canvas px. */
  referencePx(value: number): number;
}

/** The brush the editor holds when a stroke starts. */
export interface PluginBrush {
  readonly width: number;
  readonly color: string;
  readonly fill: string;
  readonly dialect: StrokeDialect;
}

export interface StrokeCommitContext {
  readonly coordinateScale: number;
}

export interface ResolvedStroke {
  readonly points: readonly number[];
  readonly tool: LineToolDescriptor;
}

/** What a drawing tool lays down, and how. */
export interface PluginPrimitive {
  readonly kind: LineToolDescriptor['kind'];
  /** The canvas its numbers are on, when the tool fixes one whatever the preset. */
  readonly dialect?: StrokeDialect;
  /** It lands on a grid: the canvas draws one, and the cursor is a cell. */
  readonly grid?: boolean;
  /** What the mega eraser does to such a stroke. Default `line`. */
  readonly cut?: 'line' | 'cells' | 'closed';
  /** The descriptor frozen into the session, built from the brush in hand. */
  descriptor(brush: PluginBrush): LineToolDescriptor;
  /** Collects the pointer's points itself, instead of the dialect's own capture. */
  capture?(line: readonly number[], points: readonly number[], width: number): number[];
  /** Thins the captured points when the gesture ends. */
  prepare?(points: readonly number[], width: number, zoom: number): number[];
  /** What the collected points become when the gesture ends. */
  commit?(
    points: readonly number[],
    descriptor: LineToolDescriptor,
    ctx: StrokeCommitContext,
  ): ResolvedStroke;
}

/** A tool a plugin adds: how it is drawn, and what the gesture does. */
export interface PluginTool {
  readonly label: string;
  readonly title: string;
  /** The shortcut it asks for; dropped when something already holds it. */
  readonly key?: string;
  /** SVG markup on a 24-unit grid, drawn at the size of the editor's own icons. */
  readonly icon: string;
  /** A tool that interrupts drawing instead of replacing it (the pipette, the hand). */
  readonly help?: boolean;
  /** The CSS cursor over the canvas while this tool is in hand. */
  readonly cursor?: string;
  /** A tool the arrangement never offers. */
  readonly offPanel?: boolean;
  /** What it lays down, for a tool that draws rather than reshapes. */
  readonly stroke?: PluginPrimitive;
  readonly press?: (host: PluginHost, point: PluginPoint) => void;
  readonly move?: (host: PluginHost, point: PluginPoint) => void;
  readonly release?: (host: PluginHost) => void;
  readonly activate?: (host: PluginHost) => void;
  readonly deactivate?: (host: PluginHost) => void;
}

/**
 * The manifest: the module's `export default`. `name`, `version` and
 * `description` are read from here only when the bundle is installed from
 * disk — for a plugin of the catalog they come from its record.
 */
export interface Plugin {
  readonly id: string;
  readonly api: 1;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly tool?: PluginTool;
}
