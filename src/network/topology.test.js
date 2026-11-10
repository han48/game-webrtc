import { describe, expect, it } from 'vitest';
import {
  LEADER_RELAY_TOPOLOGY,
  makeRelayFrame,
  MESH_TOPOLOGY,
  RELAY_FRAME_TYPE,
  shouldConnectPeer,
  getNetworkTopology,
} from './topology';

describe('network topology', () => {
  it('keeps mesh as the default and accepts configured or URL-selected leader relay', () => {
    expect(getNetworkTopology('', undefined)).toBe(MESH_TOPOLOGY);
    expect(getNetworkTopology('', LEADER_RELAY_TOPOLOGY)).toBe(LEADER_RELAY_TOPOLOGY);
    expect(getNetworkTopology('?topology=leader-relay', MESH_TOPOLOGY)).toBe(LEADER_RELAY_TOPOLOGY);
    expect(getNetworkTopology('?topology=unknown', LEADER_RELAY_TOPOLOGY)).toBe(MESH_TOPOLOGY);
  });

  it('connects only the room leader in leader-relay mode', () => {
    expect(shouldConnectPeer(LEADER_RELAY_TOPOLOGY, 'a', 'a', 'b')).toBe(true);
    expect(shouldConnectPeer(LEADER_RELAY_TOPOLOGY, 'b', 'a', 'a')).toBe(true);
    expect(shouldConnectPeer(LEADER_RELAY_TOPOLOGY, 'b', 'a', 'c')).toBe(false);
    expect(shouldConnectPeer(MESH_TOPOLOGY, 'a', 'a', 'b')).toBe(true);
    expect(shouldConnectPeer(MESH_TOPOLOGY, 'b', 'a', 'c')).toBe(true);
    expect(shouldConnectPeer(MESH_TOPOLOGY, 'c', 'a', 'b')).toBe(false);
  });

  it('wraps relayed data with its original sender identity', () => {
    expect(makeRelayFrame('peer-a', { type: 'chat', text: 'hello' })).toEqual({
      type: RELAY_FRAME_TYPE,
      fromPeerId: 'peer-a',
      payload: { type: 'chat', text: 'hello' },
    });
  });
});
