const FENCE_THICKNESS = 0.18;

export function getStandingAreaFenceSegments(footprint, gateWidth) {
  const edges = footprint.map(([x, z], index) => {
    const end = footprint[(index + 1) % footprint.length];
    return {
      start: [x, z],
      end,
      midpointZ: (z + end[1]) / 2,
      length: Math.hypot(end[0] - x, end[1] - z),
    };
  });
  const topEdge = edges.reduce((best, edge, index) => (
    edge.midpointZ < edges[best].midpointZ ? index : best
  ), 0);
  const bottomEdge = edges.reduce((best, edge, index) => (
    edge.midpointZ > edges[best].midpointZ ? index : best
  ), 0);

  return edges.flatMap((edge, index) => {
    if (index !== topEdge && index !== bottomEdge) {
      return [{ start: edge.start, end: edge.end }];
    }

    const openingWidth = Math.min(gateWidth, edge.length * 0.45);
    const sideLength = (edge.length - openingWidth) / 2;
    if (sideLength <= 0) return [];

    const [startX, startZ] = edge.start;
    const [endX, endZ] = edge.end;
    const directionX = (endX - startX) / edge.length;
    const directionZ = (endZ - startZ) / edge.length;
    const firstEnd = [
      startX + directionX * sideLength,
      startZ + directionZ * sideLength,
    ];
    const secondStart = [
      endX - directionX * sideLength,
      endZ - directionZ * sideLength,
    ];
    return [
      { start: edge.start, end: firstEnd },
      { start: secondStart, end: edge.end },
    ];
  });
}

function getFootprint(area, width, depth) {
  return area.footprint ?? [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
}

function getWorldPoint([x, z], area) {
  const cosine = Math.cos(area.rotationY);
  const sine = Math.sin(area.rotationY);
  return [
    area.x + (x * cosine) + (z * sine),
    area.z - (x * sine) + (z * cosine),
  ];
}

function getFenceObstacles(footprint, gateWidth, area, scale = 1, offsetZ = 0) {
  return getStandingAreaFenceSegments(footprint, gateWidth).map(({ start, end }) => {
    const [startX, startZ] = getWorldPoint(start, area);
    const [endX, endZ] = getWorldPoint(end, area);
    const dx = (endX - startX) * scale;
    const dz = (endZ - startZ) * scale;
    return {
      x: (startX + endX) * scale / 2,
      z: (startZ + endZ) * scale / 2 + offsetZ,
      width: Math.abs(dx) + FENCE_THICKNESS,
      depth: Math.abs(dz) + FENCE_THICKNESS,
    };
  });
}

export function getConcertStandingBoundaryObstacles(layout) {
  const obstacles = [];
  const scale = layout.centralClusterScale ?? 1;
  const offsetZ = layout.centralClusterOffsetZ ?? 0;

  for (const pit of layout.pits ?? []) {
    obstacles.push(...getFenceObstacles(
      getFootprint(pit, pit.width, pit.depth),
      layout.pitGateWidth ?? 3,
      { ...pit, rotationY: pit.rotationY ?? 0 },
      scale,
      offsetZ,
    ));
  }

  for (const tribune of layout.standingTribunes ?? []) {
    const columnWidths = tribune.columns.map(
      (column) => column.width ?? tribune.width / tribune.columns.length,
    );
    const totalWidth = columnWidths.reduce((total, width) => total + width, 0);
    let precedingWidth = 0;

    tribune.columns.forEach((column, index) => {
      const columnWidth = columnWidths[index];
      const columnDepth = column.depth ?? tribune.depth;
      const columnX = -totalWidth / 2 + precedingWidth + columnWidth / 2;
      const columnZ = column.dz ?? 0;
      const cosine = Math.cos(tribune.rotationY ?? 0);
      const sine = Math.sin(tribune.rotationY ?? 0);
      obstacles.push(...getFenceObstacles(
        getFootprint(column, columnWidth - 0.6, columnDepth - 0.6),
        tribune.gateWidth ?? 3,
        {
          x: tribune.x + columnX * cosine + columnZ * sine,
          z: tribune.z - columnX * sine + columnZ * cosine,
          rotationY: tribune.rotationY ?? 0,
        },
      ));
      precedingWidth += columnWidth;
    });
  }

  return obstacles;
}
