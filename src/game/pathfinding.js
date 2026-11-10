const DEFAULT_COLLISION_RADIUS = 0.45;

// Checks whether a point is inside any obstacle footprint. This is used for both
// keyboard collision and click-to-move navigation.
export function isBlocked(position, obstacles = [], radius = DEFAULT_COLLISION_RADIUS) {
  return obstacles.some((obstacle) => {
    const halfWidth = obstacle.width / 2;
    const halfDepth = obstacle.depth / 2;
    const dx = Math.abs(position.x - obstacle.x);
    const dz = Math.abs(position.z - obstacle.z);
    return dx < halfWidth + radius && dz < halfDepth + radius;
  });
}

export function buildPath(start, goal, obstacles = [], options = {}) {
  const cellSize = options.cellSize ?? 1;
  const width = options.width ?? 20;
  const height = options.height ?? 20;
  const minX = options.minX ?? 0;
  const minZ = options.minZ ?? 0;
  const clearance = options.clearance ?? 0.55;
  const grid = [];

  for (let z = 0; z < height; z += 1) {
    const row = [];
    for (let x = 0; x < width; x += 1) {
      const worldX = minX + x * cellSize + cellSize / 2;
      const worldZ = minZ + z * cellSize + cellSize / 2;
      const occupied = isBlocked({ x: worldX, z: worldZ }, obstacles, clearance);
      row.push(occupied ? 1 : 0);
    }
    grid.push(row);
  }

  const startCell = {
    x: Math.max(0, Math.min(width - 1, Math.round((start.x - minX) / cellSize))),
    z: Math.max(0, Math.min(height - 1, Math.round((start.z - minZ) / cellSize))),
  };

  const goalCell = {
    x: Math.max(0, Math.min(width - 1, Math.round((goal.x - minX) / cellSize))),
    z: Math.max(0, Math.min(height - 1, Math.round((goal.z - minZ) / cellSize))),
  };

  if (grid[startCell.z]?.[startCell.x] === 1 || grid[goalCell.z]?.[goalCell.x] === 1) {
    return [start, goal];
  }

  const queue = [{ ...startCell, cost: 0 }];
  const cameFrom = new Map();
  const costSoFar = new Map();
  costSoFar.set(`${startCell.x},${startCell.z}`, 0);

  const directions = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
    { x: 1, z: 1 },
    { x: -1, z: -1 },
    { x: 1, z: -1 },
    { x: -1, z: 1 },
  ];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    const currentKey = `${current.x},${current.z}`;

    if (current.x === goalCell.x && current.z === goalCell.z) {
      const path = [];
      let cursor = currentKey;
      while (cursor) {
        const [cx, cz] = cursor.split(',').map(Number);
        path.unshift({
          x: minX + cx * cellSize + cellSize / 2,
          z: minZ + cz * cellSize + cellSize / 2,
        });
        const prev = cameFrom.get(cursor);
        if (!prev) break;
        cursor = prev;
      }

      if (path.length === 0) {
        return [start, goal];
      }

      path[0] = start;
      path[path.length - 1] = goal;
      return path;
    }

    for (const dir of directions) {
      const nextX = current.x + dir.x;
      const nextZ = current.z + dir.z;
      const nextKey = `${nextX},${nextZ}`;

      if (nextX < 0 || nextX >= width || nextZ < 0 || nextZ >= height) continue;
      if (grid[nextZ][nextX] === 1) continue;

      const nextCost = costSoFar.get(currentKey) + 1;
      const existingCost = costSoFar.get(nextKey);
      if (existingCost !== undefined && existingCost <= nextCost) continue;

      cameFrom.set(nextKey, currentKey);
      costSoFar.set(nextKey, nextCost);
      queue.push({ x: nextX, z: nextZ, cost: nextCost + Math.abs(nextX - goalCell.x) + Math.abs(nextZ - goalCell.z) });
    }
  }

  return [start, goal];
}
