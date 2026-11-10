const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;
const POLL_INTERVAL = 800;

export default class LaravelSignalTransport {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.readyState = CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.roomId = null;
    this.peerId = null;
    this.token = null;
    this.pollTimer = null;
    this.pollController = null;
    this.sendQueue = Promise.resolve();
    this.closed = false;
  }

  async request(action, body, signal) {
    const response = await fetch(`${this.endpoint}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || `Signaling request failed (${response.status}).`);
    return result;
  }

  dispatch(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  async connect(roomId, name) {
    try {
      const joined = await this.request('join', { roomId, name });
      if (this.closed) return;
      this.roomId = joined.roomId;
      this.peerId = joined.peerId;
      this.token = joined.token;
      this.readyState = OPEN;
      this.onopen?.();
      this.dispatch(joined);
      this.poll();
    } catch (error) {
      if (this.closed) return;
      this.dispatch({ type: 'error', message: error.message });
      this.fail(error);
    }
  }

  async poll() {
    if (this.closed || this.readyState !== OPEN) return;
    this.pollController = new AbortController();
    try {
      const result = await this.request('poll', {
        roomId: this.roomId,
        peerId: this.peerId,
        token: this.token,
      }, this.pollController.signal);
      for (const message of result.messages || []) this.dispatch(message);
      this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL);
    } catch (error) {
      if (!this.closed) this.fail(error);
    }
  }

  send(rawMessage) {
    if (this.readyState !== OPEN) return;
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.sendQueue = this.sendQueue
      .then(() => {
        if (this.closed) return;
        return this.request('send', {
          roomId: this.roomId,
          peerId: this.peerId,
          token: this.token,
          message,
        });
      })
      .catch((error) => this.fail(error));
  }

  close() {
    if (this.readyState === CLOSED || this.readyState === CLOSING) return;
    this.closed = true;
    this.readyState = CLOSING;
    clearTimeout(this.pollTimer);
    this.pollController?.abort();
    if (this.peerId && this.token) {
      this.request('leave', {
        roomId: this.roomId,
        peerId: this.peerId,
        token: this.token,
      }).catch(() => {});
    }
    this.readyState = CLOSED;
    this.onclose?.();
  }

  fail(error) {
    if (this.closed) return;
    this.onerror?.(error);
    this.closed = true;
    this.readyState = CLOSED;
    clearTimeout(this.pollTimer);
    this.pollController?.abort();
    this.onclose?.();
  }
}
