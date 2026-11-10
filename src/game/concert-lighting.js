export function getBeamLineFixtures(start, end, spacing, scale = 1) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const count = Math.max(1, Math.ceil((length * scale) / spacing));

  return Array.from({ length: count + 1 }, (_, index) => {
    const progress = index / count;
    return [
      start[0] + (end[0] - start[0]) * progress,
      start[1] + (end[1] - start[1]) * progress,
    ];
  });
}

export function getBeamPerimeterFixtures(corners, spacing, scale = 1) {
  return corners.flatMap((start, index) => (
    getBeamLineFixtures(start, corners[(index + 1) % corners.length], spacing, scale)
      .slice(0, -1)
  ));
}
