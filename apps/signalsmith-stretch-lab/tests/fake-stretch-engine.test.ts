import { describe, expect, it } from "vitest";

import { createStretchCommandTransport } from "../src/boundary/commands";
import {
  createStretchBoundarySession,
  disposeStretchBoundarySession,
  initializeDesiredControls,
  readProcessedLevels,
  readRuntimeStatus,
  writeDesiredControls,
} from "../src/boundary/session";
import { FakeStretchEngine } from "../src/runtime/fake-stretch-engine";
import { defaultDesiredControls } from "../src/types";

function setup(capacity = 16) {
  const session = createStretchBoundarySession();
  const transport = createStretchCommandTransport(capacity);
  initializeDesiredControls(session);
  const engine = new FakeStretchEngine(session, transport, {
    applyDelayTicks: 2,
  });
  engine.tick({ renderQuantum: 128 });

  return { engine, session, transport };
}

describe("FakeStretchEngine", () => {
  it("keeps desired changes pending before applying the sequence", () => {
    const { engine, session } = setup();

    try {
      writeDesiredControls(session, {
        ...defaultDesiredControls(),
        desiredSequence: 2,
        rate: 2,
      });

      const pending = engine.tick({ renderQuantum: 128 });
      expect(pending.pendingDesiredSequence).toBe(2);
      expect(pending.runtime.lastAppliedDesiredSequence).toBe(1);

      const applied = engine.tick({ renderQuantum: 128 });
      expect(applied.pendingDesiredSequence).toBeNull();
      expect(applied.runtime.lastAppliedDesiredSequence).toBe(2);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });

  it("models play, pause, seek, loop, fault, and reset transitions", () => {
    const { engine, session, transport } = setup();

    try {
      transport.enqueue("play");
      expect(engine.tick({ renderQuantum: 256 }).runtime.state).toBe("playing");

      transport.enqueue("seek", { arg0: 48_000 });
      const seeking = engine.tick({ renderQuantum: 256 }).runtime;
      expect(seeking.state).toBe("seeking");
      expect(seeking.sourceFrame).toBe(48_000);

      transport.enqueue("setLoop", {
        arg0: 12_000,
        arg1: 24_000,
        arg2: 3,
      });
      const looped = engine.tick({ renderQuantum: 256 }).runtime;
      expect(looped.loopEnabled).toBe(true);
      expect(looped.loopRevision).toBe(3);

      transport.enqueue("pause");
      expect(engine.tick({ renderQuantum: 256 }).runtime.state).toBe(
        "ready-paused",
      );

      engine.setFault(42);
      expect(engine.tick({ renderQuantum: 256 }).runtime.state).toBe(
        "failed-recoverable",
      );
      expect(readRuntimeStatus(session).lastErrorCode).toBe(42);

      transport.enqueue("resetFault");
      expect(engine.tick({ renderQuantum: 256 }).runtime.state).toBe(
        "ready-paused",
      );
      expect(readRuntimeStatus(session).lastErrorCode).toBe(0);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });

  it("publishes output-level history arrays and deterministic full-scale events", () => {
    const { engine, session, transport } = setup();

    try {
      transport.enqueue("play");
      for (let index = 0; index < 10; index += 1) {
        engine.tick({ renderQuantum: 4_096 });
      }

      const levels = readProcessedLevels(session);
      const historyPeak = Array.from(levels.historyPeak);

      expect(levels.probeState).toBe("active");
      expect(levels.fullScaleLeftTotal).toBeGreaterThan(0);
      expect(historyPeak.some((value) => value > 0)).toBe(true);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });

  it("surfaces stale reads without pretending the desired state applied", () => {
    const { engine, session } = setup();

    try {
      writeDesiredControls(session, {
        ...defaultDesiredControls(),
        desiredSequence: 2,
        rate: 1.75,
      });
      engine.simulateStaleRead(1);

      const stale = engine.tick({ renderQuantum: 128 }).runtime;
      expect(stale.staleReadTotal).toBe(1);
      expect(stale.lastAppliedDesiredSequence).toBe(1);

      const pending = engine.tick({ renderQuantum: 128 });
      expect(pending.pendingDesiredSequence).toBe(2);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });

  it("surfaces SWSR newest-command drops in runtime status", () => {
    const { engine, session, transport } = setup(2);

    try {
      expect(transport.enqueue("play").accepted).toBe(true);
      expect(transport.enqueue("pause").accepted).toBe(false);

      engine.tick({ renderQuantum: 128 });
      expect(readRuntimeStatus(session).commandDroppedTotal).toBe(1);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });

  it("publishes failed probe status during a simulated fault", () => {
    const { engine, session } = setup();

    try {
      engine.setFault(7);
      engine.tick({ renderQuantum: 128 });

      const levels = readProcessedLevels(session);
      expect(levels.probeState).toBe("failed");
      expect(levels.lastErrorCode).toBe(7);
    } finally {
      disposeStretchBoundarySession(session);
    }
  });
});
