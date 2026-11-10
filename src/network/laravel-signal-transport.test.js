import { afterEach, describe, expect, it, vi } from 'vitest';
import LaravelSignalTransport from './laravel-signal-transport';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('LaravelSignalTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('joins and polls messages from the Laravel signaling API', async () => {
    const messages = [];
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith('/join')) {
        return jsonResponse({
          type: 'joined',
          roomId: 'office',
          peerId: 'peer-id',
          token: 'session-token',
        });
      }
      if (url.endsWith('/poll')) {
        return jsonResponse({ messages: [{ type: 'peer-left', peerId: 'other-peer' }] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const transport = new LaravelSignalTransport('/api/office-game/signal');
    transport.onmessage = ({ data }) => messages.push(JSON.parse(data));
    await transport.connect('office', 'Player');

    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(messages[0].type).toBe('joined');
    expect(messages[1]).toEqual({ type: 'peer-left', peerId: 'other-peer' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      roomId: 'office',
      peerId: 'peer-id',
      token: 'session-token',
    });
    transport.close();
  });

  it('posts outgoing signals with the joined session credentials', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith('/join')) {
        return jsonResponse({
          type: 'joined',
          roomId: 'office',
          peerId: 'peer-id',
          token: 'session-token',
        });
      }
      return jsonResponse({ messages: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const transport = new LaravelSignalTransport('/api/office-game/signal');
    await transport.connect('office', 'Player');
    transport.send(JSON.stringify({ type: 'offer', to: 'other-peer', offer: { sdp: 'offer' } }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/office-game/signal/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"type":"offer"'),
      }),
    ));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      roomId: 'office',
      peerId: 'peer-id',
      token: 'session-token',
      message: { type: 'offer', to: 'other-peer' },
    });
    transport.close();
  });
});
