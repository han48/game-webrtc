function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.floor(random() * (index + 1)));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

export class TeamSession {
  constructor() {
    this.phase = 'lobby';
    this.playerCount = 0;
    this.teamCount = 0;
    this.players = new Map();
    this.cards = [];
  }

  addPlayer(peerId, name) {
    if (this.phase !== 'lobby' || this.players.has(peerId) || this.players.size >= 20) return false;
    this.players.set(peerId, { peerId, name, teamId: null });
    return true;
  }

  configure(playerCount, teamCount) {
    if (this.phase !== 'lobby'
      || !Number.isInteger(playerCount) || playerCount < 2 || playerCount > 20
      || !Number.isInteger(teamCount) || teamCount < 2 || teamCount > 10
      || teamCount > playerCount || playerCount % teamCount !== 0) return false;
    this.playerCount = playerCount;
    this.teamCount = teamCount;
    return true;
  }

  start(players, bounds, random = Math.random) {
    if (this.phase !== 'lobby' || !this.playerCount || !this.teamCount
      || players.length !== this.playerCount || players.length !== this.players.size) return false;

    this.players = new Map(players.map(({ peerId, name }) => [peerId, {
      peerId,
      name,
      teamId: null,
    }]));
    const teamIds = Array.from({ length: this.teamCount }, (_, index) => `team-${index + 1}`);
    const cardTeams = shuffle(teamIds.flatMap((teamId) => (
      Array(this.playerCount / this.teamCount).fill(teamId)
    )), random);
    this.cards = cardTeams.map((teamId, index) => ({
      id: `team-card-${index}`,
      teamId,
      x: bounds.minX + 2 + random() * (bounds.maxX - bounds.minX - 4),
      z: bounds.minZ + 2 + random() * (bounds.maxZ - bounds.minZ - 4),
      vx: (random() - 0.5) * 5,
      vz: (random() - 0.5) * 5,
      caughtBy: null,
    }));
    this.phase = 'collecting';
    return true;
  }

  tick(positions, deltaSeconds, bounds, random = Math.random) {
    if (this.phase !== 'collecting') return false;
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.1);
    for (const card of this.cards) {
      if (card.caughtBy) continue;
      card.x += card.vx * delta;
      card.z += card.vz * delta;
      if (card.x < bounds.minX + 1 || card.x > bounds.maxX - 1) {
        card.vx = -card.vx;
        card.x = Math.min(Math.max(card.x, bounds.minX + 1), bounds.maxX - 1);
      }
      if (card.z < bounds.minZ + 1 || card.z > bounds.maxZ - 1) {
        card.vz = -card.vz;
        card.z = Math.min(Math.max(card.z, bounds.minZ + 1), bounds.maxZ - 1);
      }
      if (Math.hypot(card.vx, card.vz) < 1.2) {
        card.vx += (random() - 0.5) * 0.4;
        card.vz += (random() - 0.5) * 0.4;
      }
    }

    for (const player of this.players.values()) {
      if (player.teamId) continue;
      const position = positions.get(player.peerId);
      if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) continue;
      const card = this.cards.find((candidate) => !candidate.caughtBy
        && Math.hypot(position.x - candidate.x, position.z - candidate.z) <= 0.95);
      if (!card) continue;
      card.caughtBy = player.peerId;
      player.teamId = card.teamId;
    }

    if ([...this.players.values()].every((player) => player.teamId)) this.phase = 'finished';
    return true;
  }

  leave(peerId) {
    const player = this.players.get(peerId);
    if (!player) return false;
    this.players.delete(peerId);
    if (this.phase === 'collecting' || this.phase === 'finished') {
      this.phase = 'lobby';
      this.playerCount = 0;
      this.teamCount = 0;
      this.cards = [];
      for (const member of this.players.values()) member.teamId = null;
      return true;
    }
    this.cards = this.cards.filter((card) => card.caughtBy !== peerId);
    return true;
  }

  reset() {
    this.phase = 'lobby';
    this.playerCount = 0;
    this.teamCount = 0;
    this.cards = [];
    for (const player of this.players.values()) player.teamId = null;
  }

  snapshot() {
    return {
      phase: this.phase,
      playerCount: this.playerCount,
      teamCount: this.teamCount,
      players: [...this.players.values()].map((player) => ({ ...player })),
      cards: this.cards.filter((card) => !card.caughtBy).map(({ teamId, ...card }) => card),
    };
  }
}
