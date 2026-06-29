import { SIGNALSMITH_WASM_EXPORTS } from "./module-types";
import {
  desiredStretchSpec,
  processedOutputLevelsSpec,
  runtimeStatusSpec,
} from "../boundary/specs";

export const SIGNALSMITH_ADAPTER_CONTRACT = {
  desiredControls: {
    reader: "future AudioWorklet processor",
    specId: desiredStretchSpec.id,
    wrapperCalls: [
      "_setTransposeSemitones",
      "_setFormantSemitones",
      "_setFormantBase",
      "_configure",
    ],
    writer: "host controller",
  },
  generatedModule: {
    exports: SIGNALSMITH_WASM_EXPORTS,
    input: "vendor/signalsmith-stretch/web/emscripten/main.cpp",
    output: "generated/signalsmith-stretch.worklet.js",
  },
  processedOutputLevels: {
    reader: "host observer",
    specId: processedOutputLevelsSpec.id,
    writer: "future output-level probe beside the worklet",
  },
  runtimeStatus: {
    reader: "host observer",
    specId: runtimeStatusSpec.id,
    writer: "future AudioWorklet processor",
    wrapperCalls: [
      "_blockSamples",
      "_intervalSamples",
      "_inputLatency",
      "_outputLatency",
      "_seek",
      "_process",
      "_flush",
    ],
  },
} as const;
