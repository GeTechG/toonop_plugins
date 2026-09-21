/**
 * The plugin contract of the toonop editor, api 1.
 *
 * A copy of the public part of the editor's `plugins/contract.ts`, plus the
 * numbers of the document format a brush needs to measure anything. It is kept
 * by hand: pulling the editor in as a package for this alone costs more than
 * updating one file when the major changes.
 *
 * A `.ts` and not a `.d.ts`, because the constants below are values: a plugin
 * bundles them like any other import, and nothing is borrowed at runtime.
 */

/**
 * The contract major this file describes, as a type and not as a value.
 *
 * A plugin writes the number out (`api: 1`) instead of importing it. A value
 * would be substituted at build time — «whatever major the contract happens
 * to be on» — and the field would stop saying anything: rebuild an untouched
 * plugin after a major moved and it would claim a compatibility nobody
 * checked. Written out, it is the author's word, and a number that is not
 * this one does not typecheck.
 */
export type PluginApi = 1;

// ---------------------------------------------------------------------------
// The document format, as far as a brush needs it
// ---------------------------------------------------------------------------

/** Document units per logical pixel: coordinates are stored fixed-point. */
export const FIXED_POINT_SCALE = 8;

/**
 * The canvas a new document opens at — and nothing more than that.
 *
 * A width and every thinning threshold are logical pixels, the same ones on a
 * document of any size: a pixel is a pixel, and the editor rescales nothing
 * by how big the picture is. Documents of other sizes are coming, and a brush
 * set to 9 lays a nine-pixel line in every one of them.
 *
 * A brush that reproduces an editor which drew on a canvas of another size
 * MAY bring its numbers over once, when it declares them — multiply by
 * `CANVAS_LOGICAL_WIDTH / <that canvas>` and declare the result, the way the
 * Multator line does. That is a choice of defaults, not arithmetic per stroke.
 */
export const CANVAS_LOGICAL_WIDTH = 1280;

/** What the stored coordinate range holds — points may lie outside the canvas. */
export const STROKE_COORD_MIN = -32768;
export const STROKE_COORD_MAX = 32767;

/** Longest single stroke the format takes, in numbers (x and y each count). */
export const MAX_STROKE_COORDS = 65536;

/**
 * Lang simplification as the Multator reference tuned it — and its tolerance
 * is in pixels of that editor's own 600-wide canvas, not logical pixels here.
 * To thin the way it did on this canvas, bring it over once:
 * `LANG_TOLERANCE_LOGICAL * (CANVAS_LOGICAL_WIDTH / 600)`.
 */
export const LANG_LOOK_AHEAD = 5;
export const LANG_TOLERANCE_LOGICAL = 10;
export const LANG_TOLERANCE_DOC = LANG_TOLERANCE_LOGICAL * FIXED_POINT_SCALE;

/** The unit square — what a pixel-style stamp lays down. */
export const SQUARE_STAMP: readonly number[] = [0, 0, 1, 0, 1, 1, 0, 1];

/** How a stroke's stored numbers are read into a path. */
export type StrokeGeometry = 'line' | 'smooth' | 'cubic';

export interface PencilToolDescriptor {
  readonly kind: 'pencil';
  readonly geometry: StrokeGeometry;
  readonly width: number;
  readonly color: string;
}

export interface EraserToolDescriptor {
  readonly kind: 'eraser';
  readonly geometry: StrokeGeometry;
  readonly width: number;
}

/** A closed filled shape: the points are a ring and the thickness is in them. */
export interface ContourToolDescriptor {
  readonly kind: 'contour';
  readonly geometry: StrokeGeometry;
  readonly color: string;
}

export interface ContourEraserToolDescriptor {
  readonly kind: 'contour-eraser';
  readonly geometry: StrokeGeometry;
}

/** The same curve as the pencil, filled with `fill` before it is stroked. */
export interface FeatherToolDescriptor {
  readonly kind: 'feather';
  readonly geometry: StrokeGeometry;
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
  readonly geometry: 'line';
  readonly width: number;
  readonly color: string;
  readonly shape: readonly number[];
}

/** The primitives a pointer session lays down. A plugin invents none. */
export type LineToolDescriptor =
  | PencilToolDescriptor
  | EraserToolDescriptor
  | FeatherToolDescriptor
  | StampToolDescriptor;

/** What a brush's own commit may hand back, beyond what it drew with. */
export type ToolDescriptor =
  | LineToolDescriptor
  | ContourToolDescriptor
  | ContourEraserToolDescriptor;

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

/** A point of the gesture, in document units. */
export interface PluginPoint {
  readonly x: number;
  readonly y: number;
}

/** A stroke of the frame, as a plugin may rewrite it. */
export interface PluginStroke {
  points: number[];
  [field: string]: unknown;
}

/**
 * The plugin's only way into the editor: data out, edits in.
 *
 * Units are not among the services: a document unit is `1 / FIXED_POINT_SCALE`
 * of a logical pixel on a document of any size, so a plugin that wants pixels
 * divides by that constant itself.
 */
export interface PluginHost {
  /** A node inside a floating window of the editor; it lives until the tool is left. */
  window(opts: { title: string }): HTMLElement;
  /** The strokes of the current frame on the selected, visible layers. */
  strokes(): readonly PluginStroke[];
  /** One edit of the document. Undo is the editor's business, never the plugin's. */
  edit(fn: (strokes: PluginStroke[]) => void): void;
}

/** The brush record the editor holds for the tool in hand. */
export interface PluginBrush {
  readonly width: number;
  readonly color: string;
  readonly fill: string;
  readonly smooth: number;
  readonly minDistance: number;
}

export interface ResolvedStroke {
  readonly points: readonly number[];
  readonly tool: ToolDescriptor;
}

/**
 * A brush's own rules for turning a gesture into stored points. Plain
 * functions and numbers: the stroke engine runs them and never learns whose
 * they are.
 */
export interface StrokeRules {
  /** What a width may be, in logical pixels; absent means «whatever the profile allows». */
  readonly range?: { readonly min: number; readonly max: number };
  /** What a fresh record of this brush starts at. */
  readonly defaults?: { readonly width: number; readonly smooth: number; readonly minDistance: number };
  /** Whether the smoothing pair reaches this brush at all. */
  readonly smoothing?: boolean;
  /** Folds a batch of pointer samples into the points collected so far. */
  capture(line: readonly number[], batch: readonly number[], width: number): number[];
  /** The line under the hand, before the thinning the commit does. */
  preview?(points: readonly number[]): number[];
  /** How the line under the hand is read, when that differs from the stored stroke. */
  readonly previewGeometry?: StrokeGeometry;
  /**
   * Thins the collected points when the gesture ends. `zoom` is the viewport
   * zoom frozen at `pointerdown`; nothing about the document's size is handed
   * over, because nothing about it enters a threshold.
   */
  prepare?(points: readonly number[], width: number, zoom: number): number[];
  /** Lays the collected points down as the descriptor's `geometry` reads them. */
  path?(points: readonly number[]): number[];
  /** What the release event contributes; absent means «the same as any other». */
  release?(line: readonly number[], batch: readonly number[], width: number): number[];
  /** A cancelled gesture still lands in the frame. */
  readonly commitOnCancel?: boolean;
  /** What the collected points become; absent means «the points, as prepared». */
  readonly commit?: (points: readonly number[], descriptor: LineToolDescriptor) => ResolvedStroke;
}

/** What a drawing tool lays down, and how. */
export interface PluginPrimitive {
  readonly kind: LineToolDescriptor['kind'];
  /**
   * The brush's own rules, when it has them. A tool that declares none draws
   * by the rules of the brush its preset named.
   *
   * `range`, `defaults` and `smoothing` of what comes back MUST NOT
   * depend on the argument: the editor reads them with a neutral brush to work
   * out which record to hand over.
   */
  rules?(brush: PluginBrush): StrokeRules | undefined;
  /** It lands on a grid: the canvas draws one, and the cursor is a cell. */
  readonly grid?: boolean;
  /** What the mega eraser does to such a stroke. Default `line`. */
  readonly cut?: 'line' | 'cells' | 'closed';
  /** The descriptor frozen into the session, built from the brush in hand. */
  descriptor(brush: PluginBrush): LineToolDescriptor;
}

/** A tool a plugin adds: how it is drawn, and what the gesture does. */
export interface PluginTool {
  readonly label: string;
  readonly title: string;
  /** The shortcut it asks for; dropped when something already holds it. */
  readonly key: string;
  /** SVG markup on a 24-unit grid, drawn at the size of the editor's own icons. */
  readonly icon: string;
  /** A tool that interrupts drawing instead of replacing it (the pipette, the hand). */
  readonly help?: boolean;
  /** The CSS cursor over the canvas while this tool is in hand. */
  readonly cursor?: string;
  /** A tool the arrangement never offers: something else takes it in hand. */
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
 * The UX profile of a preset: everything it changes about how the editor
 * behaves beyond the line its brush draws. Pure data.
 */
export interface UxProfile {
  /** Two-swatch quick palette shown while the full picker is collapsed; null = always the picker. */
  readonly quickPalette: readonly string[] | null;
  /** White is the eraser marker: choosing it (or the pencil while white) arms the eraser. */
  readonly whiteIsEraser: boolean;
  /** The pipette is only offered while the full palette is expanded. */
  readonly pipetteNeedsPalette: boolean;
  /** The pipette is not a rail button: it lives in the palette's foot alone. */
  readonly pipetteOffRail: boolean;
  /** Which neighbors the onion skin shows (only read in the 'neighbors' mode). */
  readonly onionSides: 'both' | 'previous';
  /** Onion model: fading neighbors, or the last visited frames. */
  readonly onionMode: 'neighbors' | 'history';
  /** A persistent grid of saved colors next to the picker. */
  readonly colorGrid: boolean;
  /** Allowed player fps range. */
  readonly fpsRange: readonly [number, number];
  /** The pipette follows the pointer with a live color swatch. */
  readonly livePipettePreview: boolean;
  /** Cursor draws a crosshair for very thin and very thick brushes. */
  readonly crossCursor: boolean;
  /** Tools the preset's starting arrangement places, in toolbar order. */
  readonly tools: readonly string[];
  /** Opacity the active frame (with its live stroke) is composited at. */
  readonly activeFrameAlpha: number;
  /** Which neighbor becomes active after deleting a frame. */
  readonly afterRemove: 'next' | 'previous';
  /** Playback starts from the first frame instead of the active one. */
  readonly playFromStart: boolean;
  /** What Space plays: the whole document, or the frame selection. */
  readonly playbackRange: 'document' | 'selection';
  /** Where a new layer lands relative to the active one; Ctrl inverts it. */
  readonly newLayerPosition: 'above' | 'below';
  /** A new stroke leaves the redo buffer alone instead of clearing it. */
  readonly redoSurvivesStroke: boolean;
  /** Frame rate a fresh document gets under this preset. */
  readonly defaultFps: number;
  /** Upper bound for the +/- brush nudge (logical px). */
  readonly brushSizeMax: number;
  /** Adaptive +/- step (1 below 10, 5 below 50, else 10) instead of a flat 1. */
  readonly adaptiveBrushStep: boolean;
  /**
   * How the editor's canvas is rasterised. `device` takes the screen's
   * `devicePixelRatio`; `document` takes one bitmap pixel per document pixel.
   * It is the preset's, not the brush's: a document has one bitmap.
   */
  readonly canvasDensity: 'device' | 'document';
  /** Alt+S downloads the project as a file instead of opening the export. */
  readonly projectFile: boolean;
}

/** A patch on the editor's one arrangement. */
export interface PluginPanels {
  readonly base?: { left?: string[]; right?: string[]; rows?: string[][]; float?: string[] };
  readonly hide?: readonly string[];
  readonly swap?: readonly (readonly [string, string])[];
}

/** A preset: what the editor behaves like, brought whole. */
export interface PluginPreset {
  readonly label: string;
  /** Default brush: the tool whose rules a tool without its own follows. */
  readonly brush: string;
  /** The brush type it opens with; the everyday one when it names none. */
  readonly brushType?: string;
  readonly ux: UxProfile;
  readonly panels?: PluginPanels;
}

/** A type the brush in hand can be switched to; the everyday one is the editor's own. */
export interface PluginBrushType {
  readonly label: string;
  /** One line on what it draws, for the list that offers it. */
  readonly hint?: string;
  /** Everyday tool id → the tool that stands in for it. */
  readonly twins: Readonly<Record<string, string>>;
}

/**
 * The manifest: the module's `export default`. `name`, `version` and
 * `description` are read from here only when the bundle is installed from
 * disk — for a plugin of the catalog they come from its record.
 */
export interface Plugin {
  readonly id: string;
  readonly api: PluginApi;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  /** SVG markup on the 24-unit grid, drawn beside the name in the list. */
  readonly icon?: string;
  /** The tools it brings, keyed by the id each takes in the register. */
  readonly tools?: Readonly<Record<string, PluginTool>>;
  readonly presets?: Readonly<Record<string, PluginPreset>>;
  readonly brushTypes?: Readonly<Record<string, PluginBrushType>>;
}
