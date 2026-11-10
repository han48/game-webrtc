export const LUCKY_SPIN_MS = 3200;

export function isLuckyNumber(value) {
  return /^\d{4}$/.test(String(value));
}

export function getLuckySpinNumber(numbers, random = Math.random) {
  if (!numbers.length) return null;
  const index = Math.min(numbers.length - 1, Math.floor(random() * numbers.length));
  return numbers[index];
}

export class LuckyNumberSession {
  constructor() {
    this.phase = 'choosing';
    this.players = new Map();
    this.locked = false;
    this.drawnNumbers = [];
    this.winners = new Set();
    this.currentNumber = null;
    this.spinEndsAt = null;
  }

  addPlayer(peerId, name) {
    if (this.locked || this.phase !== 'choosing' || this.players.has(peerId)) return false;
    this.players.set(peerId, { peerId, name, number: '' });
    return true;
  }

  setNumber(peerId, number) {
    const player = this.players.get(peerId);
    if (!player || this.locked || this.phase !== 'choosing' || !isLuckyNumber(number)) return false;
    player.number = String(number);
    return true;
  }

  spin(now = Date.now(), random = Math.random) {
    if (!['choosing', 'revealed'].includes(this.phase)) return false;
    const numbers = [...this.players.values()]
      .map((player) => player.number)
      .filter((number) => isLuckyNumber(number) && !this.drawnNumbers.includes(number));
    if (!numbers.length || [...this.players.values()].some((player) => !isLuckyNumber(player.number))) return false;

    this.locked = true;
    this.currentNumber = getLuckySpinNumber(numbers, random);
    this.phase = 'spinning';
    this.spinEndsAt = now + LUCKY_SPIN_MS;
    return true;
  }

  finishSpin(now = Date.now()) {
    if (this.phase !== 'spinning' || now < this.spinEndsAt) return false;
    this.drawnNumbers.push(this.currentNumber);
    for (const player of this.players.values()) {
      if (player.number === this.currentNumber) this.winners.add(player.peerId);
    }
    this.phase = 'revealed';
    this.spinEndsAt = null;
    return true;
  }

  finish() {
    if (this.phase !== 'revealed') return false;
    this.phase = 'finished';
    this.spinEndsAt = null;
    return true;
  }

  reset() {
    this.phase = 'choosing';
    this.locked = false;
    this.drawnNumbers = [];
    this.winners.clear();
    this.currentNumber = null;
    this.spinEndsAt = null;
    for (const player of this.players.values()) player.number = '';
  }

  leave(peerId) {
    this.winners.delete(peerId);
    return this.players.delete(peerId);
  }

  snapshot() {
    return {
      phase: this.phase,
      locked: this.locked,
      players: [...this.players.values()].map((player) => ({ ...player })),
      drawnNumbers: [...this.drawnNumbers],
      winners: [...this.winners],
      currentNumber: this.currentNumber,
      spinEndsAt: this.spinEndsAt,
    };
  }
}
