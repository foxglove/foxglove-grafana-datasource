import { intervalStringToNanoseconds } from './intervalNanos';

describe('intervalStringToNanoseconds', () => {
  it('parses fractional ms', () => {
    expect(intervalStringToNanoseconds('0.1ms')).toBe(100_000);
    expect(intervalStringToNanoseconds('1.5ms')).toBe(1_500_000);
  });

  it('parses common units', () => {
    expect(intervalStringToNanoseconds('1s')).toBe(1_000_000_000);
    expect(intervalStringToNanoseconds('10ms')).toBe(10_000_000);
    expect(intervalStringToNanoseconds('2m')).toBe(120_000_000_000);
  });

  it('treats bare number as seconds', () => {
    expect(intervalStringToNanoseconds('2')).toBe(2_000_000_000);
    expect(intervalStringToNanoseconds('0.5')).toBe(500_000_000);
  });

  it('returns undefined for empty, invalid, or non-positive', () => {
    expect(intervalStringToNanoseconds('')).toBeUndefined();
    expect(intervalStringToNanoseconds('  ')).toBeUndefined();
    expect(intervalStringToNanoseconds('0ms')).toBe(0);
    expect(intervalStringToNanoseconds('not-a-duration')).toBeUndefined();
  });

  it('returns undefined for unit typos like "1hr" or "5min"', () => {
    expect(intervalStringToNanoseconds('1hr')).toBeUndefined();
    expect(intervalStringToNanoseconds('5min')).toBeUndefined();
    expect(intervalStringToNanoseconds('10sec')).toBeUndefined();
    expect(intervalStringToNanoseconds('2days')).toBeUndefined();
  });
});
