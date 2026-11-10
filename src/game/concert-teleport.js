function transformClusterPoint(x, z, layout) {
  const scale = layout.centralClusterScale ?? 1;
  return {
    x: x * scale,
    z: z * scale + (layout.centralClusterOffsetZ ?? 0),
  };
}

function getFootprintCenter(footprint) {
  let twiceArea = 0;
  let xTotal = 0;
  let zTotal = 0;

  footprint.forEach(([x, z], index) => {
    const [nextX, nextZ] = footprint[(index + 1) % footprint.length];
    const cross = x * nextZ - nextX * z;
    twiceArea += cross;
    xTotal += (x + nextX) * cross;
    zTotal += (z + nextZ) * cross;
  });

  if (Math.abs(twiceArea) < Number.EPSILON) {
    const center = footprint.reduce(
      (result, [x, z]) => ({ x: result.x + x, z: result.z + z }),
      { x: 0, z: 0 },
    );
    return { x: center.x / footprint.length, z: center.z / footprint.length };
  }

  return {
    x: xTotal / (3 * twiceArea),
    z: zTotal / (3 * twiceArea),
  };
}

function transformPoint(x, z, rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: x * cosine + z * sine,
    z: -x * sine + z * cosine,
  };
}

export function filterConcertTeleportLocations(locations, maxPrice) {
  if (maxPrice === null) return locations;

  return locations.filter(({ priceLabel }) => (
    priceLabel && Number(priceLabel.replace(/\D/g, '')) <= maxPrice
  ));
}

export function getConcertTeleportLocations(layout) {
  const locations = [];
  let stagePoint = null;
  const add = (name, x, z, type, priceLabel) => {
    locations.push({ id: name, name, x, z, type, priceLabel });
  };
  const { stage } = layout;

  if (stage) {
    const stageFootprint = stage.footprint ?? [
      [-stage.width / 2, -stage.depth / 2],
      [stage.width / 2, -stage.depth / 2],
      [stage.width / 2, stage.depth / 2],
      [-stage.width / 2, stage.depth / 2],
    ];
    const stageCenter = getFootprintCenter(stageFootprint);
    stagePoint = transformClusterPoint(
      stage.x + stageCenter.x,
      stage.z + stageCenter.z,
      layout,
    );
    add(stage.floorLabel?.text || 'SÂN KHẤU', stagePoint.x, stagePoint.z, 'Sân khấu');
    if (stage.runway) {
      const runwayPoint = transformClusterPoint(
        stage.x,
        stage.z + stage.depth / 2 + stage.runway.length / 2,
        layout,
      );
      add(stage.runway.label || 'RUNWAY', runwayPoint.x, runwayPoint.z, 'Runway');
    }
  }

  for (const pit of layout.pits ?? []) {
    const footprint = pit.footprint ?? [
      [-pit.width / 2, -pit.depth / 2],
      [pit.width / 2, -pit.depth / 2],
      [pit.width / 2, pit.depth / 2],
      [-pit.width / 2, pit.depth / 2],
    ];
    const center = getFootprintCenter(footprint);
    const point = transformClusterPoint(pit.x + center.x, pit.z + center.z, layout);
    add(pit.name, point.x, point.z, 'Đứng', pit.priceLabel);
  }

  for (const tribune of layout.standingTribunes ?? []) {
    const columnWidths = tribune.columns.map(
      (column) => column.width ?? tribune.width / tribune.columns.length,
    );
    const totalWidth = columnWidths.reduce((total, width) => total + width, 0);
    let precedingWidth = 0;

    tribune.columns.forEach((column, index) => {
      const width = columnWidths[index];
      const depth = column.depth ?? tribune.depth;
      const footprint = column.footprint ?? [
        [-(width - 0.6) / 2, -(depth - 0.6) / 2],
        [(width - 0.6) / 2, -(depth - 0.6) / 2],
        [(width - 0.6) / 2, (depth - 0.6) / 2],
        [-(width - 0.6) / 2, (depth - 0.6) / 2],
      ];
      const center = getFootprintCenter(footprint);
      const columnX = -totalWidth / 2 + precedingWidth + width / 2;
      const columnZ = column.dz ?? 0;
      const offset = transformPoint(columnX + center.x, columnZ + center.z, tribune.rotationY ?? 0);
      add(column.name, tribune.x + offset.x, tribune.z + offset.z, 'Đứng', column.priceLabel);
      precedingWidth += width;
    });
  }

  for (const wing of layout.sideWings ?? []) {
    for (const block of wing.blocks) {
      const offset = transformPoint(
        block.dx ?? 0,
        block.dz ?? 0,
        wing.rotationY ?? 0,
      );
      add(block.name, wing.x + offset.x, wing.z + offset.z, 'Ngồi', block.priceLabel);
    }
  }

  if (layout.foh) {
    add(layout.foh.label || 'FOH', layout.foh.x, layout.foh.z, 'Kỹ thuật');
  }

  for (const section of layout.seatedSections ?? []) {
    for (const block of section.blocks) {
      add(block.name, block.x, section.z, 'Ngồi', block.priceLabel ?? section.priceLabel);
    }
  }

  return locations.map((location) => ({
    ...location,
    distanceToStage: stagePoint
      ? Math.hypot(location.x - stagePoint.x, location.z - stagePoint.z)
      : null,
  }));
}
