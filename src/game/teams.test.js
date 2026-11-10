import { describe, expect, it } from 'vitest';
import { TeamSession } from './teams.js';

const bounds = { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };
const fourPlayers = [
  { peerId: 'one', name: 'One' },
  { peerId: 'two', name: 'Two' },
  { peerId: 'three', name: 'Three' },
  { peerId: 'four', name: 'Four' },
];

describe('team card game', () => {
  it('requires equal-sized teams and the configured number of connected players', () => {
    const session = new TeamSession();
    fourPlayers.forEach((player) => session.addPlayer(player.peerId, player.name));
    expect(session.configure(4, 3)).toBe(false);
    expect(session.configure(4, 2)).toBe(true);
    expect(session.start(fourPlayers.slice(0, 3), bounds)).toBe(false);
  });

  it('creates balanced hidden team cards and catches cards for each player', () => {
    const session = new TeamSession();
    fourPlayers.forEach((player) => session.addPlayer(player.peerId, player.name));
    session.configure(4, 2);
    expect(session.start(fourPlayers, bounds, () => 0.25)).toBe(true);
    expect(session.snapshot().cards).toHaveLength(4);
    expect(session.snapshot().cards[0].teamId).toBeUndefined();

    const positions = new Map();
    for (const card of [...session.cards]) {
      positions.set(card.id, { x: card.x, z: card.z });
    }
    fourPlayers.forEach((player, index) => {
      const card = session.cards[index];
      positions.set(player.peerId, { x: card.x, z: card.z });
    });
    session.tick(positions, 0.05, bounds);
    expect(session.phase).toBe('finished');
    const counts = new Map();
    session.players.forEach((player) => counts.set(player.teamId, (counts.get(player.teamId) || 0) + 1));
    expect([...counts.values()].sort()).toEqual([2, 2]);
    expect(session.snapshot().cards).toHaveLength(0);
  });

  it('moves flying cards within the room bounds', () => {
    const session = new TeamSession();
    fourPlayers.forEach((player) => session.addPlayer(player.peerId, player.name));
    session.configure(4, 2);
    session.start(fourPlayers, bounds, () => 0.8);
    session.tick(new Map(), 0.1, bounds);
    for (const card of session.cards) {
      expect(card.x).toBeGreaterThanOrEqual(bounds.minX + 1);
      expect(card.x).toBeLessThanOrEqual(bounds.maxX - 1);
      expect(card.z).toBeGreaterThanOrEqual(bounds.minZ + 1);
      expect(card.z).toBeLessThanOrEqual(bounds.maxZ - 1);
    }
  });

  it('restarts team setup if a player leaves during or after a team assignment round', () => {
    const session = new TeamSession();
    fourPlayers.forEach((player) => session.addPlayer(player.peerId, player.name));
    session.configure(4, 2);
    session.start(fourPlayers, bounds, () => 0.25);
    session.leave('one');

    expect(session.snapshot()).toMatchObject({
      phase: 'lobby',
      playerCount: 0,
      teamCount: 0,
      cards: [],
      players: [
        { peerId: 'two', teamId: null },
        { peerId: 'three', teamId: null },
        { peerId: 'four', teamId: null },
      ],
    });
  });
});
