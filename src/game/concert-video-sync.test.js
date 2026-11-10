import { describe, expect, it } from 'vitest';
import {
  getServerClockOffsetMs,
  getSynchronizedPlaybackSeconds,
} from './concert-video-sync.js';

describe('concert video clock synchronization', () => {
  it('uses the same loop position when clients share the same server time', () => {
    const firstClientLocalTime = 100_000;
    const secondClientLocalTime = 105_000;

    expect(getSynchronizedPlaybackSeconds(firstClientLocalTime + 5_000, 5520)).toBe(
      getSynchronizedPlaybackSeconds(secondClientLocalTime, 5520),
    );
  });

  it('wraps playback time at the configured loop duration', () => {
    expect(getSynchronizedPlaybackSeconds(5520_000, 5520)).toBe(0);
    expect(getSynchronizedPlaybackSeconds(5521_000, 5520)).toBe(1);
    expect(getSynchronizedPlaybackSeconds(-1_000, 5520)).toBe(5519);
  });

  it('estimates server offset at the midpoint of the request', () => {
    expect(getServerClockOffsetMs(
      'Tue, 27 Oct 2026 04:00:00 GMT',
      Date.UTC(2026, 9, 27, 4, 0, 2),
      Date.UTC(2026, 9, 27, 4, 0, 4),
    )).toBe(-3000);
  });

  it('rejects invalid duration and server timestamps', () => {
    expect(() => getSynchronizedPlaybackSeconds(0, 0)).toThrow(RangeError);
    expect(() => getServerClockOffsetMs('not a date', 0, 1)).toThrow();
    expect(() => getServerClockOffsetMs('Tue, 27 Oct 2026 04:00:00 GMT', 2, 1)).toThrow(RangeError);
  });
});
