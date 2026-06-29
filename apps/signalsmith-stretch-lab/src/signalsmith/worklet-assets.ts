const STRETCH_META_PATH = "../../vendor/signalsmith-stretch/.vendor-meta.json";
const LINEAR_META_PATH = "../../vendor/signalsmith-linear/.vendor-meta.json";
const WORKLET_ASSET_PATH = "../../generated/signalsmith-stretch.worklet.js";

interface VendorMeta {
  readonly name: string;
  readonly source: string;
  readonly requestedRef: string;
  readonly sourceBranch?: string;
  readonly sourceTag?: string;
}

export type SignalsmithRuntimeMode = "real-adapter" | "simulator-fallback";

export interface SignalsmithWorkletAssetFacts {
  readonly generatedWorkletExists: boolean;
  readonly generatedWorkletUrl: string | null;
  readonly linearVendorMeta: VendorMeta | null;
  readonly realAdapterAvailable: boolean;
  readonly realAdapterStatus: string;
  readonly runtimeMode: SignalsmithRuntimeMode;
  readonly stretchVendorMeta: VendorMeta | null;
}

const vendorMetaModules = import.meta.glob<VendorMeta>(
  "../../vendor/**/.vendor-meta.json",
  {
    eager: true,
    import: "default",
  },
);

const workletAssets = import.meta.glob<string>(
  "../../generated/signalsmith-stretch.worklet.js",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

export function readSignalsmithWorkletAssets(): SignalsmithWorkletAssetFacts {
  const stretchVendorMeta = vendorMetaModules[STRETCH_META_PATH] ?? null;
  const linearVendorMeta = vendorMetaModules[LINEAR_META_PATH] ?? null;
  const generatedWorkletUrl = workletAssets[WORKLET_ASSET_PATH] ?? null;
  const missing: string[] = [];

  if (!stretchVendorMeta) {
    missing.push("vendored Stretch source missing");
  }
  if (!linearVendorMeta) {
    missing.push("vendored Linear source missing");
  }
  if (!generatedWorkletUrl) {
    missing.push("generated worklet missing");
  }

  const generatedWorkletExists = generatedWorkletUrl !== null;
  const sourceAssetsPresent =
    stretchVendorMeta !== null &&
    linearVendorMeta !== null &&
    generatedWorkletExists;

  return {
    generatedWorkletExists,
    generatedWorkletUrl,
    linearVendorMeta,
    realAdapterAvailable: false,
    realAdapterStatus: sourceAssetsPresent
      ? "Real adapter unavailable: generated Signalsmith assets are present; AudioWorklet runtime wiring is still pending."
      : `Real adapter unavailable: ${missing.join(", ")}.`,
    runtimeMode: "simulator-fallback",
    stretchVendorMeta,
  };
}
