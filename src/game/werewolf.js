export const WEREWOLF_TIMERS = {
  night: 55,
  discussion: 180,
  vote: 30,
  revote: 30,
};

export function getWerewolfCount(playerCount) {
  if (playerCount < 5) return 0;
  if (playerCount <= 6) return 1;
  if (playerCount <= 10) return 2;
  return 3;
}

export function createWerewolfDeck(playerIds, random = Math.random) {
  if (playerIds.length < 5) throw new Error('Cần ít nhất 5 người chơi để bắt đầu.');

  const roles = [
    ...Array(getWerewolfCount(playerIds.length)).fill('werewolf'),
    'seer',
    'guard',
    'witch',
    ...Array(playerIds.length - getWerewolfCount(playerIds.length) - 3).fill('villager'),
  ];

  for (let index = roles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [roles[index], roles[swapIndex]] = [roles[swapIndex], roles[index]];
  }

  return roles.map((role, index) => ({ id: `card-${index}`, role, ownerId: null }));
}

export function resolveNight({ victimId, protectedId, saved, poisonedId }) {
  if (!victimId || victimId === protectedId || saved) return poisonedId || null;
  return poisonedId === victimId ? null : poisonedId || victimId;
}

export function resolveVotes(votes) {
  const counts = new Map();
  Object.values(votes).forEach((targetId) => {
    if (targetId) counts.set(targetId, (counts.get(targetId) || 0) + 1);
  });
  if (!counts.size) return { eliminatedId: null, tiedIds: [] };

  const highestCount = Math.max(...counts.values());
  const tiedIds = [...counts].filter(([, count]) => count === highestCount).map(([playerId]) => playerId);
  return tiedIds.length === 1
    ? { eliminatedId: tiedIds[0], tiedIds: [] }
    : { eliminatedId: null, tiedIds };
}

export function getWerewolfWinner(players) {
  const alive = players.filter((player) => player.alive);
  const wolves = alive.filter((player) => player.role === 'werewolf').length;
  const villagers = alive.length - wolves;
  if (!wolves) return 'villagers';
  if (wolves >= villagers) return 'werewolves';
  return null;
}