import { describe, expect, it } from 'vitest';
import { createWerewolfDeck, getWerewolfCount, getWerewolfWinner, resolveNight, resolveVotes } from './werewolf.js';
import { WerewolfSession } from './werewolf-session.js';

describe('werewolf rules', () => {
  it.each([[5, 1], [6, 1], [7, 2], [10, 2], [11, 3]])('uses %i players to assign %i wolves', (playerCount, wolfCount) => {
    expect(getWerewolfCount(playerCount)).toBe(wolfCount);
    const deck = createWerewolfDeck(Array.from({ length: playerCount }, (_, index) => `player-${index}`), () => 0);
    expect(deck).toHaveLength(playerCount);
    expect(deck.filter((card) => card.role === 'werewolf')).toHaveLength(wolfCount);
    expect(deck.filter((card) => card.role === 'villager')).toHaveLength(playerCount - wolfCount - 3);
  });

  it('rejects games with fewer than five players', () => {
    expect(() => createWerewolfDeck(['a', 'b', 'c', 'd'])).toThrow('ít nhất 5');
  });

  it('applies guard, witch save, and poison outcomes', () => {
    expect(resolveNight({ victimId: 'a', protectedId: 'a' })).toBeNull();
    expect(resolveNight({ victimId: 'a', saved: true })).toBeNull();
    expect(resolveNight({ victimId: 'a', poisonedId: 'b' })).toBe('b');
    expect(resolveNight({ victimId: 'a', poisonedId: 'a' })).toBeNull();
  });

  it('returns a runoff for tied votes and checks parity victory', () => {
    expect(resolveVotes({ a: 'b', b: 'c', c: 'b', d: 'c' })).toEqual({ eliminatedId: null, tiedIds: ['b', 'c'] });
    expect(getWerewolfWinner([
      { role: 'werewolf', alive: true },
      { role: 'seer', alive: true },
    ])).toBe('werewolves');
  });

  it('arbitrates simultaneous card claims without duplicate owners and keeps roles private', () => {
    const session = new WerewolfSession({ random: () => 0.5, now: () => 1000 });
    const playerIds = Array.from({ length: 5 }, (_, index) => `player-${index}`);
    playerIds.forEach((peerId) => session.join(peerId, peerId));
    expect(session.start()).toBe(true);

    const positions = new Map(playerIds.map((peerId) => [peerId, { x: 0, z: 0 }]));
    session.tick(positions);

    const owners = session.cards.map((card) => card.ownerId);
    expect(session.phase).toBe('night');
    expect(owners).toHaveLength(5);
    expect(new Set(owners).size).toBe(5);
    expect(session.snapshot(playerIds[0]).ownRole).toBeTruthy();
    expect(session.snapshot(playerIds[1]).players[0].role).toBeNull();
  });

  it('runs the 55-second night and opens a runoff after tied votes', () => {
    let now = 1000;
    const session = new WerewolfSession({ random: () => 0.5, now: () => now });
    const playerIds = Array.from({ length: 5 }, (_, index) => `player-${index}`);
    playerIds.forEach((peerId) => session.join(peerId, peerId));
    session.start();
    session.tick(new Map(playerIds.map((peerId) => [peerId, { x: 0, z: 0 }])));

    now = session.endsAt;
    session.advance();
    expect(session.nightStage).toBe('seer');
    now = session.endsAt;
    session.advance();
    now = session.endsAt;
    session.advance();
    now = session.endsAt;
    session.advance();
    expect(session.phase).toBe('discussion');
    expect(session.endsAt - now).toBe(180_000);

    session.advance();
    session.vote(playerIds[0], playerIds[3]);
    session.vote(playerIds[1], playerIds[4]);
    now = session.endsAt;
    session.advance();
    expect(session.phase).toBe('revote');
    expect(session.tieIds).toEqual([playerIds[3], playerIds[4]]);
  });

  it('removes a leaver card before collection completes', () => {
    const session = new WerewolfSession({ random: () => 0.5, now: () => 1000 });
    const playerIds = Array.from({ length: 5 }, (_, index) => `player-${index}`);
    playerIds.forEach((peerId) => session.join(peerId, peerId));
    session.start();
    session.leave(playerIds[0]);

    expect(session.cards).toHaveLength(4);
    expect(session.tick(new Map(playerIds.slice(1).map((peerId) => [peerId, { x: 0, z: 0 }])))).toBe(true);
    expect(session.phase).toBe('night');
    expect(new Set(session.cards.map((card) => card.ownerId)).size).toBe(4);
  });
});