import { describe, expect, it } from "vitest";

import { ChunkedWavSource } from "../src/audio/chunked-wav-source";
import { createChunkedWavPcmSource } from "../src/audio/pcm-source";
import {
  SourceReferenceMonitor,
  type SourceReferenceAudioContext,
  type SourceReferenceSourceNode,
} from "../src/audio/source-reference-monitor";

import type { ChunkedWavPcmSource } from "../src/audio/pcm-source";

describe("SourceReferenceMonitor", () => {
  it("predicts preview frames using the active source sample rate", async () => {
    const context = new FakeAudioContext(48_000);
    const source = await createSource({ frameCount: 44_100 * 8, sampleRate: 44_100 });
    const monitor = new SourceReferenceMonitor(context);

    monitor.sync(source, 0, 1);
    await waitForScheduledSource(context);

    context.currentTime = 1.04;

    expect(Math.round(monitor.status.predictedFrame)).toBe(44_100);
    expect(Math.round(monitor.status.predictedFrame)).not.toBe(48_000);

    monitor.dispose();
  });

  it("keeps matched-sample-rate prediction behavior unchanged", async () => {
    const context = new FakeAudioContext(48_000);
    const source = await createSource({ frameCount: 48_000 * 8, sampleRate: 48_000 });
    const monitor = new SourceReferenceMonitor(context);

    monitor.sync(source, 0, 1);
    await waitForScheduledSource(context);

    context.currentTime = 1.04;

    expect(Math.round(monitor.status.predictedFrame)).toBe(48_000);

    monitor.dispose();
  });

  it("disconnects ended preview source nodes and keeps stop idempotent", async () => {
    const context = new FakeAudioContext(48_000);
    const source = await createSource({ frameCount: 48_000 * 8, sampleRate: 48_000 });
    const monitor = new SourceReferenceMonitor(context);

    monitor.sync(source, 0, 1);
    const node = await waitForScheduledSource(context);
    const scheduledCount = monitor.status.scheduledSourceCount;

    node.finish();

    expect(monitor.status.scheduledSourceCount).toBe(scheduledCount - 1);
    expect(node.disconnectCount).toBe(1);

    expect(() => {
      monitor.stop();
      monitor.stop();
    }).not.toThrow();
    expect(node.disconnectCount).toBe(1);

    monitor.dispose();
  });
});

class FakeAudioContext implements SourceReferenceAudioContext {
  currentTime = 0;
  readonly destination = {};
  readonly sources: FakeSourceNode[] = [];

  constructor(readonly sampleRate: number) {}

  createBuffer(
    numberOfChannels: number,
    length: number,
    _sampleRate: number,
  ): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length);
  }

  createBufferSource(): FakeSourceNode {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source;
  }

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
}

class FakeAudioBuffer {
  private readonly channels: Float32Array[];

  constructor(numberOfChannels: number, length: number) {
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) {
      throw new Error(`Missing channel ${channel.toString()}`);
    }

    return data;
  }
}

class FakeAudioParam {
  value = 1;

  setTargetAtTime(value: number, _startTime: number, _timeConstant: number): void {
    this.value = value;
  }

  setValueAtTime(value: number, _startTime: number): void {
    this.value = value;
  }
}

class FakeGainNode {
  readonly gain = new FakeAudioParam();
  connected = false;
  disconnected = false;

  connect(_destination: unknown): void {
    this.connected = true;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeSourceNode implements SourceReferenceSourceNode {
  buffer: FakeAudioBuffer | null = null;
  connectCount = 0;
  disconnectCount = 0;
  onended: ((event: Event) => void) | null = null;
  readonly playbackRate = new FakeAudioParam();
  startTime: number | undefined;
  stopCount = 0;

  connect(_destination: unknown): void {
    this.connectCount += 1;
  }

  disconnect(): void {
    this.disconnectCount += 1;
  }

  finish(): void {
    this.onended?.(new Event("ended"));
  }

  start(when?: number): void {
    this.startTime = when;
  }

  stop(_when?: number): void {
    this.stopCount += 1;
  }
}

async function createSource(options: {
  readonly frameCount: number;
  readonly sampleRate: number;
}): Promise<ChunkedWavPcmSource> {
  const wavSource = await ChunkedWavSource.open(
    createPcm16WavFile({
      frameCount: options.frameCount,
      sampleRate: options.sampleRate,
    }),
  );

  return createChunkedWavPcmSource(
    wavSource,
    {
      channels: wavSource.info.channelCount,
      durationFrames: wavSource.info.frameCount,
      durationSeconds: wavSource.info.durationSeconds,
      formatSummary: "test WAV",
      memoryBytes: wavSource.info.memoryBytes,
      name: "test.wav",
      sampleRate: wavSource.info.sampleRate,
    },
    1,
    1,
  );
}

function createPcm16WavFile(options: {
  readonly frameCount: number;
  readonly sampleRate: number;
}): File {
  const channelCount = 1;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataBytes = options.frameCount * blockAlign;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);

  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, options.sampleRate, true);
  view.setUint32(28, options.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);

  return new File([bytes], "test.wav", { type: "audio/wav" });
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}

async function waitForScheduledSource(
  context: FakeAudioContext,
): Promise<FakeSourceNode> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const source = context.sources[0];
    if (source) {
      return source;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error("Timed out waiting for a scheduled source node.");
}
