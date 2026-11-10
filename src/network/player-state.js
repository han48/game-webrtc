function roundStateValue(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function makePlayerStateSnapshot(state) {
  return {
    position: {
      x: roundStateValue(state.position?.x),
      z: roundStateValue(state.position?.z),
    },
    direction: {
      x: roundStateValue(state.direction?.x),
      z: roundStateValue(state.direction?.z),
    },
    isMoving: Boolean(state.isMoving),
    isSitting: Boolean(state.isSitting),
    audioEnabled: Boolean(state.audioEnabled),
    videoEnabled: Boolean(state.videoEnabled),
    avatar: state.avatar,
  };
}

export function getPlayerStateSignature(state) {
  return JSON.stringify(makePlayerStateSnapshot(state));
}
