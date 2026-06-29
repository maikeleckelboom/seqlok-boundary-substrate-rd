import type { MeterDef, ParamDef } from "./types";

function mix64(
  seedHi: number,
  seedLo: number,
  data: string,
): Readonly<{ hi: number; lo: number }> {
  let high = seedHi >>> 0;
  let low = seedLo >>> 0;

  for (let index = 0; index < data.length; index += 1) {
    const code = data.charCodeAt(index) >>> 0;
    high = Math.imul(high ^ code, 0x85ebca6b) >>> 0;
    low = Math.imul(low ^ code, 0xc2b2ae35) >>> 0;
    high = (high ^ (high >>> 13)) >>> 0;
    low = (low ^ (low >>> 16)) >>> 0;
  }

  return { hi: high, lo: low };
}

function hashCanonicalPayload(content: unknown): string {
  const json = JSON.stringify(content);
  const mixed = mix64(0x12345678, 0x9abcdef0, json);
  const high = mixed.hi.toString(16).padStart(8, "0");
  const low = mixed.lo.toString(16).padStart(8, "0");
  return `${high}${low}`;
}

export function generateAnonymousSpecId(
  params: Readonly<Record<string, ParamDef>> | undefined,
  meters: Readonly<Record<string, MeterDef>> | undefined,
): string {
  const content: Record<string, unknown> = {};
  if (params !== undefined && Object.keys(params).length > 0) {
    content.params = params;
  }
  if (meters !== undefined && Object.keys(meters).length > 0) {
    content.meters = meters;
  }

  return `anon_${hashCanonicalPayload(content)}`;
}
