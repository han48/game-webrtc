import { describe, expect, it } from 'vitest';
import { getPlayerStateSignature, makePlayerStateSnapshot } from './player-state';

const playerState = {
  position: { x: 2, z: 3 },
  direction: { x: 0, z: -1 },
  isMoving: false,
  isSitting: false,
  audioEnabled: false,
  videoEnabled: false,
  avatar: { color: '#fff' },
};

describe('player state snapshots', () => {
  it('rounds insignificant position and direction noise', () => {
    expect(getPlayerStateSignature({
      ...playerState,
      position: { x: 2.001, z: 3.004 },
      direction: { x: 0.002, z: -0.999 },
    })).toBe(getPlayerStateSignature(playerState));
  });

  it('changes the snapshot for meaningful movement or pose changes', () => {
    expect(getPlayerStateSignature({
      ...playerState,
      position: { x: 2.02, z: 3 },
    })).not.toBe(getPlayerStateSignature(playerState));
    expect(getPlayerStateSignature({
      ...playerState,
      isSitting: true,
    })).not.toBe(getPlayerStateSignature(playerState));
  });

  it('includes media and avatar state in snapshots', () => {
    expect(makePlayerStateSnapshot({
      ...playerState,
      audioEnabled: true,
    }).audioEnabled).toBe(true);
    expect(makePlayerStateSnapshot({
      ...playerState,
      avatar: { color: '#000' },
    }).avatar).toEqual({ color: '#000' });
  });
});
