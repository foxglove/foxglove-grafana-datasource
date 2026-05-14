/**
 * Parse Grafana-style duration strings into nanoseconds.
 *
 * Supported suffixes match Grafana: ms, s, m, h, d, w, M (month), y (year).
 * A bare number (optionally signed, optional fraction) is interpreted as seconds.
 */
const NS_PER_SEC = 1_000_000_000;

/** Seconds per unit — aligned with Grafana `intervals_in_seconds` in rangeutil. */
const UNIT_TO_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  M: 2592000,
  y: 31536000,
};

const SUFFIXED = /^(-?\d+(?:\.\d+)?)(ms|[Mwdhmsy])$/;

/** Unit-less seconds (integer or decimal), no suffix. */
const SECONDS_ONLY = /^-?\d+(?:\.\d+)?$/;

export function intervalStringToNanoseconds(input: string): number | undefined {
  const str = input.trim();
  if (!str) {
    return undefined;
  }

  const suffixed = str.match(SUFFIXED);
  if (suffixed) {
    const count = parseFloat(suffixed[1]);
    const unit = suffixed[2];
    const perUnitSec = UNIT_TO_SECONDS[unit];
    if (perUnitSec === undefined || !Number.isFinite(count) || count < 0) {
      return undefined;
    }
    return Math.round(count * perUnitSec * NS_PER_SEC);
  }

  if (SECONDS_ONLY.test(str)) {
    const sec = parseFloat(str);
    if (!Number.isFinite(sec) || sec < 0) {
      return undefined;
    }
    return Math.round(sec * NS_PER_SEC);
  }

  return undefined;
}
