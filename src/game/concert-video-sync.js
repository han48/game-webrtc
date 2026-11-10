export function getSynchronizedPlaybackSeconds(nowMs, durationSeconds) {
  if (!Number.isFinite(nowMs)) throw new TypeError('nowMs must be a finite number.');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError('durationSeconds must be a positive finite number.');
  }

  const epochSeconds = Math.floor(nowMs / 1000);
  return ((epochSeconds % durationSeconds) + durationSeconds) % durationSeconds;
}

export function getServerClockOffsetMs(dateHeader, requestStartedAtMs, responseReceivedAtMs) {
  const serverTimeMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverTimeMs)) throw new Error('The server response did not contain a valid Date header.');
  if (!Number.isFinite(requestStartedAtMs) || !Number.isFinite(responseReceivedAtMs)
    || responseReceivedAtMs < requestStartedAtMs) {
    throw new RangeError('The clock synchronization request timestamps are invalid.');
  }

  return serverTimeMs - (requestStartedAtMs + responseReceivedAtMs) / 2;
}
