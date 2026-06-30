import type { WaveformPeakMode } from "../audio/waveform-peaks";
import type {
  LoopPreview,
  RuntimeStatusSnapshot,
  SimulatedSource,
} from "../types";

export interface WaveformState {
  readonly appliedLoop: LoopPreview;
  readonly draftLoop: LoopPreview;
  readonly levels: {
    readonly peak: Readonly<Float32Array>;
    readonly rms: Readonly<Float32Array>;
  };
  readonly peakMode: WaveformPeakMode;
  readonly requestedSeekFrame: number | null;
  readonly runtime: RuntimeStatusSnapshot;
  readonly source: SimulatedSource;
}

export interface WaveformMeasure {
  readonly dpr: number;
  readonly heightCssPx: number;
  readonly widthCssPx: number;
}

export interface WaveformRenderer {
  readonly draw: (peaks: Readonly<Float32Array>, state: WaveformState) => void;
  readonly invalidateStatic: () => void;
  readonly measure: () => WaveformMeasure;
  readonly reset: () => void;
}

interface WaveformRendererOptions {
  readonly overlayCanvas: HTMLCanvasElement;
  readonly staticCanvas: HTMLCanvasElement;
}

interface CanvasBackingState {
  dpr: number;
  heightCssPx: number;
  widthCssPx: number;
}

interface WaveformColors {
  readonly baseline: string;
  readonly deckBottom: string;
  readonly deckTop: string;
  readonly envelopeBottom: string;
  readonly envelopeMid: string;
  readonly envelopeTop: string;
  readonly gridMajor: string;
  readonly gridMinor: string;
  readonly levelPeak: string;
  readonly levelRms: string;
  readonly levelStripBackground: string;
  readonly loopAppliedEdge: string;
  readonly loopAppliedFill: string;
  readonly loopDraftEdge: string;
  readonly loopDraftFill: string;
  readonly peakEdge: string;
  readonly playhead: string;
  readonly requestedSeek: string;
  readonly signature: string;
  readonly syntheticEdge: string;
  readonly syntheticFill: string;
}

interface WaveformLayout {
  readonly levelStrip: Rect;
  readonly main: Rect;
  readonly width: number;
}

interface SourceSurface {
  readonly canvas: HTMLCanvasElement;
  readonly colorsSignature: string;
  readonly heightPx: number;
  readonly peakMode: WaveformPeakMode;
  readonly peaks: Readonly<Float32Array>;
}

interface DeckView {
  readonly centerFrame: number;
  readonly totalFrames: number;
  readonly visibleFrames: number;
  readonly width: number;
}

interface Rect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const DEFAULT_WIDTH_CSS_PX = 960;
const DEFAULT_HEIGHT_CSS_PX = 260;
const GRID_DIVISIONS = 12;
const LEVEL_STRIP_MAX_HEIGHT = 52;
const LEVEL_STRIP_MIN_HEIGHT = 34;
const LEVEL_STRIP_RATIO = 0.18;
const MAIN_LEVEL_GAP = 10;
const MIN_VISIBLE_HALF_HEIGHT_PX = 3;
const VISIBLE_SECONDS_PER_PIXEL = 0.026;

export function createWaveformRenderer(
  options: WaveformRendererOptions,
): WaveformRenderer {
  const staticContext = options.staticCanvas.getContext("2d");
  const overlayContext = options.overlayCanvas.getContext("2d");
  let staticBacking: CanvasBackingState | null = null;
  let overlayBacking: CanvasBackingState | null = null;
  let sourceSurface: SourceSurface | null = null;
  let staticDirty = true;
  let lastStaticSignature = "";

  const measure = (): WaveformMeasure => {
    return measureCanvas(options.staticCanvas);
  };

  const invalidateStatic = (): void => {
    staticDirty = true;
  };

  const reset = (): void => {
    sourceSurface = null;
    staticDirty = true;
    lastStaticSignature = "";
  };

  const draw = (peaks: Readonly<Float32Array>, state: WaveformState): void => {
    if (!staticContext || !overlayContext) {
      return;
    }

    const measured = measure();
    const staticResized = syncCanvasBacking(
      options.staticCanvas,
      measured,
      staticBacking,
    );
    const overlayResized = syncCanvasBacking(
      options.overlayCanvas,
      measured,
      overlayBacking,
    );
    staticBacking = measured;
    overlayBacking = measured;

    staticContext.setTransform(measured.dpr, 0, 0, measured.dpr, 0, 0);
    overlayContext.setTransform(measured.dpr, 0, 0, measured.dpr, 0, 0);

    const layout = resolveLayout(measured);
    const colors = readWaveformColors(options.staticCanvas);
    const view = resolveDeckView(state.source, state.runtime, layout.width);
    const staticSignature = [
      colors.signature,
      measured.dpr.toFixed(3),
      measured.widthCssPx.toString(),
      measured.heightCssPx.toString(),
      peaks.length.toString(),
      state.peakMode,
      state.runtime.sourceFrame.toString(),
      state.source.frames.toString(),
      state.source.sampleRate.toString(),
      levelHistorySignature(state.levels.peak),
      levelHistorySignature(state.levels.rms),
    ].join("|");

    if (
      staticDirty ||
      staticResized ||
      sourceSurfaceNeedsRefresh(
        sourceSurface,
        peaks,
        state.peakMode,
        colors.signature,
        Math.max(1, Math.round(layout.main.height * measured.dpr)),
      ) ||
      staticSignature !== lastStaticSignature
    ) {
      sourceSurface = refreshSourceSurface(
        sourceSurface,
        peaks,
        state.peakMode,
        colors,
        layout,
        measured.dpr,
      );
      drawStaticLayer(
        staticContext,
        sourceSurface,
        state,
        colors,
        layout,
        view,
      );
      staticDirty = false;
      lastStaticSignature = staticSignature;
    }

    if (overlayResized) {
      clearCanvas(overlayContext, measured);
    }
    drawOverlayLayer(overlayContext, state, colors, layout, view);
  };

  return { draw, invalidateStatic, measure, reset };
}

function measureCanvas(canvas: HTMLCanvasElement): WaveformMeasure {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const widthCssPx =
    rect.width > 0
      ? rect.width
      : canvas.width > 0
        ? canvas.width / dpr
        : DEFAULT_WIDTH_CSS_PX;
  const heightCssPx =
    rect.height > 0
      ? rect.height
      : canvas.height > 0
        ? canvas.height / dpr
        : DEFAULT_HEIGHT_CSS_PX;

  return {
    dpr,
    heightCssPx: Math.max(1, Math.floor(heightCssPx)),
    widthCssPx: Math.max(1, Math.floor(widthCssPx)),
  };
}

function syncCanvasBacking(
  canvas: HTMLCanvasElement,
  measure: WaveformMeasure,
  previous: CanvasBackingState | null,
): boolean {
  if (
    previous &&
    previous.widthCssPx === measure.widthCssPx &&
    previous.heightCssPx === measure.heightCssPx &&
    previous.dpr === measure.dpr
  ) {
    return false;
  }

  canvas.width = Math.max(1, Math.floor(measure.widthCssPx * measure.dpr));
  canvas.height = Math.max(1, Math.floor(measure.heightCssPx * measure.dpr));
  return true;
}

function clearCanvas(
  context: CanvasRenderingContext2D,
  measure: WaveformMeasure,
): void {
  context.clearRect(0, 0, measure.widthCssPx, measure.heightCssPx);
}

function resolveLayout(measure: WaveformMeasure): WaveformLayout {
  const levelStripHeight = clamp(
    measure.heightCssPx * LEVEL_STRIP_RATIO,
    LEVEL_STRIP_MIN_HEIGHT,
    LEVEL_STRIP_MAX_HEIGHT,
  );
  const mainHeight = Math.max(
    80,
    measure.heightCssPx - levelStripHeight - MAIN_LEVEL_GAP,
  );

  return {
    levelStrip: {
      height: levelStripHeight,
      width: measure.widthCssPx,
      x: 0,
      y: mainHeight + MAIN_LEVEL_GAP,
    },
    main: {
      height: mainHeight,
      width: measure.widthCssPx,
      x: 0,
      y: 0,
    },
    width: measure.widthCssPx,
  };
}

function resolveDeckView(
  source: SimulatedSource,
  runtime: RuntimeStatusSnapshot,
  width: number,
): DeckView {
  const totalFrames = Math.max(1, source.frames);
  const responsiveFrames = Math.floor(
    Math.max(1, width) * VISIBLE_SECONDS_PER_PIXEL * source.sampleRate,
  );
  const minimumFrames = Math.min(totalFrames, source.sampleRate * 8);
  const visibleFrames = Math.min(
    totalFrames,
    Math.max(minimumFrames, responsiveFrames),
  );

  return {
    centerFrame: clamp(runtime.sourceFrame, 0, totalFrames),
    totalFrames,
    visibleFrames: Math.max(1, visibleFrames),
    width,
  };
}

function readWaveformColors(canvas: HTMLCanvasElement): WaveformColors {
  const style = getComputedStyle(canvas);
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };
  const values = {
    baseline: read("--waveform-baseline", "rgb(125 144 150 / 0.72)"),
    deckBottom: read("--waveform-deck-bottom", "rgb(8 12 15)"),
    deckTop: read("--waveform-deck-top", "rgb(18 26 31)"),
    envelopeBottom: read("--waveform-envelope-bottom", "rgb(122 214 197)"),
    envelopeMid: read("--waveform-envelope-mid", "rgb(92 181 153)"),
    envelopeTop: read("--waveform-envelope-top", "rgb(164 244 235)"),
    gridMajor: read("--waveform-grid-major", "rgb(255 255 255 / 0.14)"),
    gridMinor: read("--waveform-grid-minor", "rgb(255 255 255 / 0.07)"),
    levelPeak: read("--waveform-level-peak", "rgb(255 156 94)"),
    levelRms: read("--waveform-level-rms", "rgb(244 211 94 / 0.72)"),
    levelStripBackground: read(
      "--waveform-level-strip-background",
      "rgb(7 10 12 / 0.82)",
    ),
    loopAppliedEdge: read("--waveform-loop-applied-edge", "rgb(94 226 163)"),
    loopAppliedFill: read(
      "--waveform-loop-applied-fill",
      "rgb(94 226 163 / 0.16)",
    ),
    loopDraftEdge: read("--waveform-loop-draft-edge", "rgb(127 219 241)"),
    loopDraftFill: read(
      "--waveform-loop-draft-fill",
      "rgb(127 219 241 / 0.12)",
    ),
    peakEdge: read("--waveform-peak-edge", "rgb(209 255 247)"),
    playhead: read("--waveform-playhead", "rgb(244 211 94)"),
    requestedSeek: read("--waveform-requested-seek", "rgb(127 219 241)"),
    syntheticEdge: read("--waveform-synthetic-edge", "rgb(159 177 183 / 0.44)"),
    syntheticFill: read("--waveform-synthetic-fill", "rgb(159 177 183 / 0.22)"),
  };

  return {
    ...values,
    signature: Object.values(values).join("|"),
  };
}

function sourceSurfaceNeedsRefresh(
  surface: SourceSurface | null,
  peaks: Readonly<Float32Array>,
  peakMode: WaveformPeakMode,
  colorsSignature: string,
  heightPx: number,
): boolean {
  if (surface === null) {
    return true;
  }

  return (
    surface.peaks !== peaks ||
    surface.peakMode !== peakMode ||
    surface.colorsSignature !== colorsSignature ||
    surface.heightPx !== heightPx
  );
}

function refreshSourceSurface(
  surface: SourceSurface | null,
  peaks: Readonly<Float32Array>,
  peakMode: WaveformPeakMode,
  colors: WaveformColors,
  layout: WaveformLayout,
  dpr: number,
): SourceSurface | null {
  if (peakMode === "empty" || peaks.length === 0) {
    return null;
  }

  const heightPx = Math.max(1, Math.round(layout.main.height * dpr));

  if (
    surface &&
    !sourceSurfaceNeedsRefresh(
      surface,
      peaks,
      peakMode,
      colors.signature,
      heightPx,
    )
  ) {
    return surface;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, peaks.length);
  canvas.height = heightPx;
  const context = canvas.getContext("2d");

  if (context) {
    drawEnvelopeSurface(context, peaks, peakMode, colors, {
      height: heightPx,
      width: canvas.width,
      x: 0,
      y: 0,
    });
  }

  return {
    canvas,
    colorsSignature: colors.signature,
    heightPx,
    peakMode,
    peaks,
  };
}

function drawStaticLayer(
  context: CanvasRenderingContext2D,
  sourceSurface: SourceSurface | null,
  state: WaveformState,
  colors: WaveformColors,
  layout: WaveformLayout,
  view: DeckView,
): void {
  drawDeckBackground(context, colors, {
    height: layout.levelStrip.y + layout.levelStrip.height,
    width: layout.width,
    x: 0,
    y: 0,
  });
  drawGrid(context, colors, layout.main);

  if (state.peakMode === "empty" || !sourceSurface) {
    drawBaseline(context, colors, layout.main);
  } else {
    drawSourceWindow(context, sourceSurface.canvas, layout.main, view);
  }

  drawLevelStrip(context, state.levels, colors, layout.levelStrip);
}

function drawDeckBackground(
  context: CanvasRenderingContext2D,
  colors: WaveformColors,
  rect: Rect,
): void {
  const gradient = context.createLinearGradient(0, rect.y, 0, rect.height);
  gradient.addColorStop(0, colors.deckTop);
  gradient.addColorStop(1, colors.deckBottom);
  context.fillStyle = gradient;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawGrid(
  context: CanvasRenderingContext2D,
  colors: WaveformColors,
  rect: Rect,
): void {
  context.save();
  context.lineWidth = 1;

  for (let index = 1; index < GRID_DIVISIONS; index += 1) {
    const x = rect.x + (rect.width / GRID_DIVISIONS) * index;
    context.strokeStyle = index % 3 === 0 ? colors.gridMajor : colors.gridMinor;
    context.beginPath();
    context.moveTo(x, rect.y);
    context.lineTo(x, rect.y + rect.height);
    context.stroke();
  }

  context.strokeStyle = colors.baseline;
  context.beginPath();
  context.moveTo(rect.x, rect.y + rect.height / 2);
  context.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
  context.stroke();
  context.restore();
}

function drawBaseline(
  context: CanvasRenderingContext2D,
  colors: WaveformColors,
  rect: Rect,
): void {
  context.save();
  context.strokeStyle = colors.baseline;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(rect.x, rect.y + rect.height / 2);
  context.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
  context.stroke();
  context.restore();
}

function drawEnvelopeSurface(
  context: CanvasRenderingContext2D,
  peaks: Readonly<Float32Array>,
  peakMode: WaveformPeakMode,
  colors: WaveformColors,
  rect: Rect,
): void {
  context.clearRect(rect.x, rect.y, rect.width, rect.height);

  if (peakMode === "synthetic") {
    drawSyntheticEnvelope(context, peaks, colors, rect);
    return;
  }

  drawActualEnvelope(context, peaks, colors, rect);
}

function drawActualEnvelope(
  context: CanvasRenderingContext2D,
  peaks: Readonly<Float32Array>,
  colors: WaveformColors,
  rect: Rect,
): void {
  const gradient = context.createLinearGradient(0, rect.y, 0, rect.height);
  gradient.addColorStop(0, colors.envelopeTop);
  gradient.addColorStop(0.5, colors.envelopeMid);
  gradient.addColorStop(1, colors.envelopeBottom);

  drawEnvelopeFill(context, peaks, rect, gradient, 1);
  drawEnvelopeEdges(context, peaks, rect, colors.peakEdge, 1);
}

function drawSyntheticEnvelope(
  context: CanvasRenderingContext2D,
  peaks: Readonly<Float32Array>,
  colors: WaveformColors,
  rect: Rect,
): void {
  drawEnvelopeFill(context, peaks, rect, colors.syntheticFill, 0.72);
  drawEnvelopeEdges(context, peaks, rect, colors.syntheticEdge, 0.8);
}

function drawEnvelopeFill(
  context: CanvasRenderingContext2D,
  peaks: Readonly<Float32Array>,
  rect: Rect,
  fillStyle: CanvasGradient | string,
  alpha: number,
): void {
  const center = rect.y + rect.height / 2;
  const topPoints = envelopePoints(peaks, rect, -1);
  const bottomPoints = envelopePoints(peaks, rect, 1);

  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = fillStyle;
  context.beginPath();

  for (const [index, point] of topPoints.entries()) {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }

  for (let index = bottomPoints.length - 1; index >= 0; index -= 1) {
    const point = bottomPoints[index];
    if (point) {
      context.lineTo(point.x, point.y);
    }
  }

  context.lineTo(rect.x, center);
  context.closePath();
  context.fill();
  context.restore();
}

function drawEnvelopeEdges(
  context: CanvasRenderingContext2D,
  peaks: Readonly<Float32Array>,
  rect: Rect,
  color: string,
  alpha: number,
): void {
  context.save();
  context.globalAlpha = alpha;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 1.25;
  context.strokeStyle = color;
  strokeEnvelopeEdge(context, envelopePoints(peaks, rect, -1));
  strokeEnvelopeEdge(context, envelopePoints(peaks, rect, 1));
  context.restore();
}

function strokeEnvelopeEdge(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
): void {
  context.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }
  context.stroke();
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function envelopePoints(
  peaks: Readonly<Float32Array>,
  rect: Rect,
  direction: -1 | 1,
): readonly Point[] {
  const points: Point[] = [];
  const center = rect.y + rect.height / 2;
  const maxHeight = rect.height * 0.45;

  for (let index = 0; index < peaks.length; index += 1) {
    const progress = peaks.length === 1 ? 0 : index / (peaks.length - 1);
    const peak = clamp(peaks[index] ?? 0, 0, 1);
    const height = Math.max(MIN_VISIBLE_HALF_HEIGHT_PX, peak * maxHeight);

    points.push({
      x: rect.x + progress * rect.width,
      y: center + direction * height,
    });
  }

  return points;
}

function drawSourceWindow(
  context: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  rect: Rect,
  view: DeckView,
): void {
  const cropWidth = Math.max(
    1,
    (sourceCanvas.width * view.visibleFrames) / view.totalFrames,
  );
  const centerX = (sourceCanvas.width * view.centerFrame) / view.totalFrames;
  let sourceX = centerX - cropWidth / 2;
  let sourceWidth = cropWidth;
  let destinationX = rect.x;
  let destinationWidth = rect.width;

  if (sourceX < 0) {
    const trimmed = -sourceX;
    const trimRatio = trimmed / cropWidth;
    sourceX = 0;
    sourceWidth -= trimmed;
    destinationX += rect.width * trimRatio;
    destinationWidth -= rect.width * trimRatio;
  }

  if (sourceX + sourceWidth > sourceCanvas.width) {
    const trimmed = sourceX + sourceWidth - sourceCanvas.width;
    const trimRatio = trimmed / cropWidth;
    sourceWidth -= trimmed;
    destinationWidth -= rect.width * trimRatio;
  }

  if (sourceWidth <= 0 || destinationWidth <= 0) {
    return;
  }

  context.drawImage(
    sourceCanvas,
    sourceX,
    0,
    sourceWidth,
    sourceCanvas.height,
    destinationX,
    rect.y,
    destinationWidth,
    rect.height,
  );
}

function drawLevelStrip(
  context: CanvasRenderingContext2D,
  levels: WaveformState["levels"],
  colors: WaveformColors,
  rect: Rect,
): void {
  context.save();
  context.fillStyle = colors.levelStripBackground;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeStyle = colors.gridMajor;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(rect.x, rect.y + 0.5);
  context.lineTo(rect.x + rect.width, rect.y + 0.5);
  context.stroke();
  drawLevelHistoryLine(context, levels.rms, colors.levelRms, rect, 1.4);
  drawLevelHistoryLine(context, levels.peak, colors.levelPeak, rect, 1.8);
  context.restore();
}

function drawLevelHistoryLine(
  context: CanvasRenderingContext2D,
  levels: Readonly<Float32Array>,
  color: string,
  rect: Rect,
  lineWidth: number,
): void {
  const baseline = rect.y + rect.height - 8;

  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();

  if (levels.length === 0) {
    context.moveTo(rect.x, baseline);
    context.lineTo(rect.x + rect.width, baseline);
    context.stroke();
    return;
  }

  for (let index = 0; index < levels.length; index += 1) {
    const progress = levels.length === 1 ? 0 : index / (levels.length - 1);
    const x = rect.x + progress * rect.width;
    const y =
      rect.y +
      rect.height -
      8 -
      clamp(levels[index] ?? 0, 0, 1) * Math.max(1, rect.height - 14);

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

function levelHistorySignature(levels: Readonly<Float32Array>): string {
  if (levels.length === 0) {
    return "0";
  }

  const first = levels[0] ?? 0;
  const middle = levels[Math.floor(levels.length / 2)] ?? 0;
  const last = levels[levels.length - 1] ?? 0;
  let max = 0;

  for (const level of levels) {
    max = Math.max(max, level);
  }

  return [
    levels.length.toString(),
    first.toFixed(4),
    middle.toFixed(4),
    last.toFixed(4),
    max.toFixed(4),
  ].join(":");
}

function drawOverlayLayer(
  context: CanvasRenderingContext2D,
  state: WaveformState,
  colors: WaveformColors,
  layout: WaveformLayout,
  view: DeckView,
): void {
  context.clearRect(
    0,
    0,
    layout.width,
    layout.levelStrip.y + layout.levelStrip.height,
  );
  drawLoop(context, state.appliedLoop, colors, layout.main, view, "applied");
  drawLoop(context, state.draftLoop, colors, layout.main, view, "draft");
  drawPlayhead(context, colors, layout.main);

  if (state.requestedSeekFrame !== null) {
    drawRequestedSeek(
      context,
      state.requestedSeekFrame,
      colors,
      layout.main,
      view,
    );
  }
}

function drawLoop(
  context: CanvasRenderingContext2D,
  loop: LoopPreview,
  colors: WaveformColors,
  rect: Rect,
  view: DeckView,
  mode: "applied" | "draft",
): void {
  if (!loop.enabled) {
    return;
  }

  const startX = frameToX(loop.startFrame, view, rect);
  const endX = frameToX(loop.endFrame, view, rect);
  const left = Math.max(rect.x, Math.min(startX, endX));
  const right = Math.min(rect.x + rect.width, Math.max(startX, endX));

  if (right <= rect.x || left >= rect.x + rect.width || right <= left) {
    return;
  }

  context.save();
  context.fillStyle =
    mode === "applied" ? colors.loopAppliedFill : colors.loopDraftFill;
  context.fillRect(left, rect.y, right - left, rect.height);
  context.strokeStyle =
    mode === "applied" ? colors.loopAppliedEdge : colors.loopDraftEdge;
  context.lineWidth = mode === "applied" ? 2 : 1.5;
  context.setLineDash(mode === "applied" ? [] : [7, 5]);
  drawLoopEdge(context, startX, rect);
  drawLoopEdge(context, endX, rect);
  context.strokeRect(left, rect.y + 1, right - left, rect.height - 2);
  context.restore();
}

function drawLoopEdge(
  context: CanvasRenderingContext2D,
  x: number,
  rect: Rect,
): void {
  if (x < rect.x || x > rect.x + rect.width) {
    return;
  }

  context.beginPath();
  context.moveTo(x, rect.y);
  context.lineTo(x, rect.y + rect.height);
  context.stroke();
}

function drawPlayhead(
  context: CanvasRenderingContext2D,
  colors: WaveformColors,
  rect: Rect,
): void {
  const x = rect.x + rect.width / 2;
  context.save();
  context.strokeStyle = colors.playhead;
  context.fillStyle = colors.playhead;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, rect.y);
  context.lineTo(x, rect.y + rect.height);
  context.stroke();
  drawPlayheadNotch(context, x, rect.y, 1);
  drawPlayheadNotch(context, x, rect.y + rect.height, -1);
  context.restore();
}

function drawPlayheadNotch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: -1 | 1,
): void {
  context.beginPath();
  context.moveTo(x - 7, y);
  context.lineTo(x + 7, y);
  context.lineTo(x, y + direction * 9);
  context.closePath();
  context.fill();
}

function drawRequestedSeek(
  context: CanvasRenderingContext2D,
  frame: number,
  colors: WaveformColors,
  rect: Rect,
  view: DeckView,
): void {
  const x = frameToX(frame, view, rect);

  if (x < rect.x || x > rect.x + rect.width) {
    return;
  }

  context.save();
  context.strokeStyle = colors.requestedSeek;
  context.lineWidth = 2;
  context.setLineDash([7, 7]);
  context.beginPath();
  context.moveTo(x, rect.y);
  context.lineTo(x, rect.y + rect.height);
  context.stroke();
  context.restore();
}

function frameToX(frame: number, view: DeckView, rect: Rect): number {
  const offsetFrames = frame - view.centerFrame;
  return (
    rect.x + rect.width / 2 + (offsetFrames / view.visibleFrames) * rect.width
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
