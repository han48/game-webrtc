import { createWerewolfDeck, getWerewolfWinner, resolveNight, resolveVotes, WEREWOLF_TIMERS } from './werewolf.js';

const NIGHT_STAGES = [
  { role: 'werewolf', seconds: 20 },
  { role: 'seer', seconds: 10 },
  { role: 'guard', seconds: 10 },
  { role: 'witch', seconds: 15 },
];

function randomPosition(random) {
  return {
    x: -10 + random() * 20,
    z: -10 + random() * 20,
  };
}

export class WerewolfSession {
  constructor({ random = Math.random, now = Date.now } = {}) {
    this.random = random;
    this.now = now;
    this.phase = 'lobby';
    this.players = new Map();
    this.cards = [];
    this.round = 0;
    this.nightStage = null;
    this.nightStageIndex = -1;
    this.endsAt = null;
    this.tieIds = [];
    this.votes = {};
    this.wolfVictimId = null;
    this.protectedId = null;
    this.saved = false;
    this.poisonedId = null;
    this.winner = null;
    this.lastCardTick = this.now();
  }

  join(peerId, name) {
    if (this.phase !== 'lobby' || this.players.has(peerId)) return false;
    this.players.set(peerId, {
      peerId,
      name,
      alive: true,
      role: null,
      hasCard: false,
      potions: { save: true, poison: true },
      lastProtectedId: null,
      seerResult: null,
    });
    return true;
  }

  leave(peerId) {
    const player = this.players.get(peerId);
    if (!player) return false;
    if (this.phase === 'lobby') this.players.delete(peerId);
    else if (this.phase === 'collecting') {
      this.players.delete(peerId);
      const removedCard = this.cards.find((card) => card.ownerId === peerId)
        || this.cards.find((card) => !card.ownerId);
      if (removedCard) this.cards = this.cards.filter((card) => card !== removedCard);
      if (this.players.size && [...this.players.values()].every((remainingPlayer) => remainingPlayer.hasCard)) this.beginNight();
    }
    else {
      player.alive = false;
      this.checkWinner();
    }
    return true;
  }

  start() {
    if (this.phase !== 'lobby' || this.players.size < 5) return false;
    const playerIds = [...this.players.keys()];
    this.cards = createWerewolfDeck(playerIds, this.random).map((card) => ({
      ...card,
      ...randomPosition(this.random),
      vx: (this.random() - 0.5) * 3,
      vz: (this.random() - 0.5) * 3,
    }));
    this.phase = 'collecting';
    this.lastCardTick = this.now();
    return true;
  }

  tick(positions) {
    if (this.phase !== 'collecting') return false;
    const elapsed = Math.min(Math.max((this.now() - this.lastCardTick) / 1000, 0), 0.1);
    this.lastCardTick = this.now();
    this.cards.forEach((card) => {
      if (card.ownerId) return;
      card.x += card.vx * elapsed;
      card.z += card.vz * elapsed;
      if (card.x < -11 || card.x > 11) card.vx *= -1;
      if (card.z < -11 || card.z > 11) card.vz *= -1;
      card.x = Math.max(-11, Math.min(11, card.x));
      card.z = Math.max(-11, Math.min(11, card.z));
    });

    const availableCards = this.cards.filter((card) => !card.ownerId);
    for (let index = availableCards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1));
      [availableCards[index], availableCards[swapIndex]] = [availableCards[swapIndex], availableCards[index]];
    }
    const claimedPlayers = new Set();
    let changed = false;
    availableCards.forEach((card) => {
      const candidates = [...this.players.values()].filter((player) => {
        const position = positions.get(player.peerId);
        return player.alive && !player.hasCard && !claimedPlayers.has(player.peerId) && position
          && Math.hypot(card.x - position.x, card.z - position.z) <= 1.05;
      });
      if (!candidates.length) return;
      const winner = candidates[Math.floor(this.random() * candidates.length)];
      card.ownerId = winner.peerId;
      winner.role = card.role;
      winner.hasCard = true;
      claimedPlayers.add(winner.peerId);
      changed = true;
    });

    if ([...this.players.values()].every((player) => player.hasCard)) this.beginNight();
    return changed || availableCards.length > 0;
  }

  act(peerId, action) {
    const player = this.players.get(peerId);
    if (this.phase !== 'night' || !player?.alive || player.role !== this.nightStage) return false;
    const target = this.players.get(action.targetId);
    if (this.nightStage !== 'witch' && !target?.alive) return false;

    if (this.nightStage === 'werewolf') this.wolfVictimId = target.peerId;
    if (this.nightStage === 'seer') player.seerResult = { targetId: target.peerId, isWerewolf: target.role === 'werewolf' };
    if (this.nightStage === 'guard') {
      if (target.peerId === peerId || target.peerId === player.lastProtectedId) return false;
      player.lastProtectedId = target.peerId;
      this.protectedId = target.peerId;
    }
    if (this.nightStage === 'witch') {
      if (action.save && player.potions.save && this.wolfVictimId) {
        player.potions.save = false;
        this.saved = true;
      }
      const poisonTarget = this.players.get(action.poisonTargetId);
      if (action.poison && player.potions.poison && poisonTarget?.alive) {
        player.potions.poison = false;
        this.poisonedId = poisonTarget.peerId;
      }
      if (!action.save && !action.poison) return false;
    }
    return true;
  }

  vote(peerId, targetId) {
    const player = this.players.get(peerId);
    const target = this.players.get(targetId);
    if (!['vote', 'revote'].includes(this.phase) || !player?.alive || !target?.alive || peerId === targetId) return false;
    if (this.phase === 'revote' && !this.tieIds.includes(targetId)) return false;
    this.votes[peerId] = targetId;
    return true;
  }

  advance() {
    if (this.phase === 'night') {
      this.nightStageIndex += 1;
      if (this.nightStageIndex < NIGHT_STAGES.length) {
        this.nightStage = NIGHT_STAGES[this.nightStageIndex].role;
        this.endsAt = this.now() + NIGHT_STAGES[this.nightStageIndex].seconds * 1000;
      } else {
        this.endNight();
      }
      return;
    }
    if (this.phase === 'discussion') {
      this.beginVote(false);
      return;
    }
    if (this.phase === 'vote' || this.phase === 'revote') this.endVote();
  }

  snapshot(peerId) {
    const ownPlayer = this.players.get(peerId);
    return {
      phase: this.phase,
      players: [...this.players.values()].map((player) => ({
        peerId: player.peerId,
        name: player.name,
        alive: player.alive,
        hasCard: player.hasCard,
        role: player.alive && this.phase !== 'finished' ? null : player.role,
      })),
      cards: this.phase === 'collecting'
        ? this.cards.map(({ id, x, z, ownerId }) => ({ id, x, z, ownerId }))
        : [],
      round: this.round,
      nightStage: this.nightStage,
      endsAt: this.endsAt,
      tieIds: this.tieIds,
      victimId: ownPlayer?.role === 'witch' ? this.wolfVictimId : null,
      winner: this.winner,
      ownRole: ownPlayer?.alive ? ownPlayer.role : null,
      potions: ownPlayer?.role === 'witch' ? { ...ownPlayer.potions } : null,
      seerResult: ownPlayer?.seerResult || null,
    };
  }

  beginNight() {
    this.phase = 'night';
    this.round += 1;
    this.nightStageIndex = 0;
    this.nightStage = NIGHT_STAGES[0].role;
    this.endsAt = this.now() + NIGHT_STAGES[0].seconds * 1000;
    this.wolfVictimId = null;
    this.protectedId = null;
    this.saved = false;
    this.poisonedId = null;
    this.votes = {};
    this.players.forEach((player) => { player.seerResult = null; });
  }

  endNight() {
    const killedId = resolveNight({
      victimId: this.wolfVictimId,
      protectedId: this.protectedId,
      saved: this.saved,
      poisonedId: this.poisonedId,
    });
    const killed = this.players.get(killedId);
    if (killed) killed.alive = false;
    if (!this.checkWinner()) {
      this.phase = 'discussion';
      this.nightStage = null;
      this.endsAt = this.now() + WEREWOLF_TIMERS.discussion * 1000;
    }
  }

  beginVote(runoff, tieIds = []) {
    this.phase = runoff ? 'revote' : 'vote';
    this.tieIds = tieIds;
    this.votes = {};
    this.endsAt = this.now() + (runoff ? WEREWOLF_TIMERS.revote : WEREWOLF_TIMERS.vote) * 1000;
  }

  endVote() {
    const result = resolveVotes(this.votes);
    if (result.eliminatedId) {
      const eliminated = this.players.get(result.eliminatedId);
      if (eliminated) eliminated.alive = false;
    } else if (this.phase === 'revote') {
      this.tieIds = [];
    } else if (result.tiedIds.length) {
      this.beginVote(true, result.tiedIds);
      return;
    }

    if (!this.checkWinner()) this.beginNight();
  }

  checkWinner() {
    const winner = getWerewolfWinner([...this.players.values()]);
    if (!winner) return false;
    this.phase = 'finished';
    this.winner = winner;
    this.nightStage = null;
    this.endsAt = null;
    return true;
  }
}