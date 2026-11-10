export const MESH_TOPOLOGY = 'mesh';
export const LEADER_RELAY_TOPOLOGY = 'leader-relay';
export const RELAY_FRAME_TYPE = 'leader-relay-frame';

export function getNetworkTopology(search = '', configuredTopology = MESH_TOPOLOGY) {
  const requestedTopology = new URLSearchParams(search).get('topology') || configuredTopology;
  return requestedTopology === LEADER_RELAY_TOPOLOGY ? LEADER_RELAY_TOPOLOGY : MESH_TOPOLOGY;
}

export function shouldConnectPeer(topology, localPeerId, roomLeaderId, remotePeerId) {
  if (topology !== LEADER_RELAY_TOPOLOGY) return localPeerId < remotePeerId;
  return localPeerId === roomLeaderId || remotePeerId === roomLeaderId;
}

export function makeRelayFrame(fromPeerId, payload) {
  return { type: RELAY_FRAME_TYPE, fromPeerId, payload };
}
