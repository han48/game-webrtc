function isWithinBounds(position, bounds) {
  return position.x >= bounds.minX && position.x <= bounds.maxX
    && position.z >= bounds.minZ && position.z <= bounds.maxZ;
}

export function getDefaultSpawn(plan) {
  const entranceSpawn = plan.entrance?.spawn;
  const candidate = Number.isFinite(entranceSpawn?.x) && Number.isFinite(entranceSpawn?.z)
    ? entranceSpawn
    : plan.defaultSpawn;

  if (Number.isFinite(candidate?.x) && Number.isFinite(candidate?.z)) {
    return { x: candidate.x, z: candidate.z };
  }

  return {
    x: (plan.bounds.minX + plan.bounds.maxX) / 2,
    z: (plan.bounds.minZ + plan.bounds.maxZ) / 2,
  };
}

export function getSpawnPoints(plan) {
  const origin = getDefaultSpawn(plan);
  const offsets = Array.isArray(plan.spawnOffsets) && plan.spawnOffsets.length > 0
    ? plan.spawnOffsets
    : [{ x: 0, z: 0 }];
  const positions = offsets
    .map((offset) => ({ x: origin.x + offset.x, z: origin.z + offset.z }))
    .filter((position) => isWithinBounds(position, plan.bounds));

  return positions.length > 0 ? positions : [origin];
}

export function getOverflowSpawn(plan, index) {
  const origin = getDefaultSpawn(plan);
  const fallback = plan.spawnFallback || {};
  const originOffset = fallback.originOffset || { x: 0, z: 0 };
  const columns = Math.max(1, Math.floor(fallback.columns || 5));
  const position = {
    x: origin.x + originOffset.x + ((index % columns) * (fallback.stepX || 1.2)),
    z: origin.z + originOffset.z + (Math.floor(index / columns) * (fallback.stepZ || 1.2)),
  };

  return {
    x: Math.min(Math.max(position.x, plan.bounds.minX), plan.bounds.maxX),
    z: Math.min(Math.max(position.z, plan.bounds.minZ), plan.bounds.maxZ),
  };
}