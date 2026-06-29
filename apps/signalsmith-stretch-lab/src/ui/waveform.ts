import type {
  LoopPreview,
  RuntimeStatusSnapshot,
  SimulatedSource,
} from "../types";

export interface WaveformState {
  readonly appliedLoop: LoopPreview;
  readonly levels: Readonly<Float32Array>;
  readonly requestedSeekFrame: number | null;
  readonly runtime: RuntimeStatusSnapshot;
  readonly source: SimulatedSource;
}

export function createWaveformPeaks(
  source: SimulatedSource,
  binCount = 320,
): Float32Array {
  const peaks = new Float32Array(binCount);
  const seed = hashSource(source.name, source.frames);

  for (let index = 0; index < peaks.length; index += 1) {
    const t = index / Math.max(1, peaks.length - 1);
    const carrier = Math.sin(index * 0.17 + seed * 0.013);
    const overtone = Math.sin(index * 0.047 + seed * 0.031);
    const envelope = 0.48 + 0.38 * Math.sin(Math.PI * t);
    peaks[index] = Math.max(
      0.08,
      Math.abs(carrier * 0.7 + overtone * 0.3) * envelope,
    );
  }

  return peaks;
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Readonly<Float32Array>,
  state: WaveformState,
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || canvas.width));
  const height = Math.max(180, Math.floor(rect.height || canvas.height));
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101418";
  context.fillRect(0, 0, width, height);

  drawGrid(context, width, height);
  drawLoop(context, width, height, state.appliedLoop, state.source.frames);
  drawPeaks(context, width, height, peaks);
  drawHistory(context, width, height, state.levels);
  drawMarker(
    context,
    width,
    height,
    state.runtime.sourceFrame,
    state.source.frames,
    "#f4d35e",
    "applied",
  );

  if (state.requestedSeekFrame !== null) {
    drawMarker(
      context,
      width,
      height,
      state.requestedSeekFrame,
      state.source.frames,
      "#7bdff2",
      "requested",
    );
  }
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;

  for (let index = 1; index < 8; index += 1) {
    const x = (width / 8) * index;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();
}

function drawPeaks(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaks: Readonly<Float32Array>,
): void {
  const center = height / 2;
  const barWidth = Math.max(2, width / peaks.length);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#9cf6f6");
  gradient.addColorStop(0.5, "#5dd39e");
  gradient.addColorStop(1, "#9cf6f6");
  context.fillStyle = gradient;

  for (let index = 0; index < peaks.length; index += 1) {
    const peak = peaks[index] ?? 0;
    const barHeight = Math.max(3, peak * height * 0.44);
    const x = index * barWidth;
    context.fillRect(
      x,
      center - barHeight,
      Math.max(1, barWidth - 1),
      barHeight * 2,
    );
  }
}

function drawHistory(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  levels: Readonly<Float32Array>,
): void {
  const top = height - 44;
  const step = width / Math.max(1, levels.length - 1);

  context.strokeStyle = "#ff8c42";
  context.lineWidth = 2;
  context.beginPath();

  for (let index = 0; index < levels.length; index += 1) {
    const x = index * step;
    const y = top - (levels[index] ?? 0) * 36;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

function drawLoop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  loop: LoopPreview,
  frames: number,
): void {
  if (!loop.enabled || frames <= 0) {
    return;
  }

  const start = frameToX(loop.startFrame, frames, width);
  const end = frameToX(loop.endFrame, frames, width);
  context.fillStyle = "rgba(93, 211, 158, 0.16)";
  context.fillRect(start, 0, Math.max(2, end - start), height);
  context.strokeStyle = "#5dd39e";
  context.lineWidth = 2;
  context.strokeRect(start, 1, Math.max(2, end - start), height - 2);
}

function drawMarker(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: number,
  totalFrames: number,
  color: string,
  label: string,
): void {
  const x = frameToX(frame, totalFrames, width);
  context.strokeStyle = color;
  context.lineWidth = label === "requested" ? 2 : 3;
  context.setLineDash(label === "requested" ? [7, 7] : []);
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, height);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = color;
  context.font = "12px system-ui, sans-serif";
  context.fillText(label, Math.min(width - 72, x + 8), 20);
}

function frameToX(frame: number, totalFrames: number, width: number): number {
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, totalFrames)));
  return progress * width;
}

function hashSource(name: string, frames: number): number {
  let hash = frames >>> 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = Math.imul(hash ^ name.charCodeAt(index), 16_777_619);
  }
  return hash >>> 0;
}
