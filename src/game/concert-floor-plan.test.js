import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getConcertBoundarySegments } from './concert-boundary.js';
import { isBlocked } from './pathfinding.js';

const floorPlan = JSON.parse(readFileSync(new URL('../concert-floor-plan.json', import.meta.url), 'utf8'));
const layout = floorPlan.layout;
const areaNames = [
  ...layout.stage.labels.map(({ name }) => name),
  layout.stage.runway.label,
  ...layout.pits.map(({ name }) => name),
  ...layout.standingTribunes.flatMap(({ columns }) => columns.map(({ name }) => name)),
  ...layout.sideWings.flatMap(({ blocks }) => blocks.map(({ name }) => name)),
  layout.foh.label,
  ...layout.seatedSections.flatMap(({ blocks }) => blocks.map(({ name }) => name)),
];

describe('ATVNCG2026 D1-2 floor plan', () => {
  it('includes the named areas shown in the venue map', () => {
    expect(areaNames).toEqual(expect.arrayContaining([
      'LONG MÃ',
      'CHIẾN MÃ',
      'HIỂN NHIÊN',
      'THÁM HIỂM',
      'LÀM MẠNH',
      'SOẠN NHẠC',
      'CỦI LỬA',
      'MỸ NAM',
      'NGOẠI Ô',
      'ĐIỆN ẢNH',
      'HOA LỬA',
      'VINH QUY',
      'ANH TÀI LẮM CHIÊU',
      'QUÁI KIỆT MỘNG MƠ',
      'ANH TÀI HÀO HOA',
      'BIỆT ĐỘI TÁI XUẤT',
      'ANH TÀI NỘI LỰC',
      'ANH TÀI TÌNH',
      'TÌNH ĐẦU RỰC CHÁY',
      'NHỮNG KẺ LÃNG DU',
      'NGUYÊN TỐ',
      'MỸ MÃN',
      'FOH',
      'HỢP LỰC',
      'RỰC RỠ',
      'S-VIP 1',
      'STAGE B',
      'S-VIP 2',
      'LỤC LẠC',
      'QUÝ TỬ',
      'THĂNG HOA',
      'HÀO MÔN',
      'BỆNH BỔNG',
      'LẪY LỪNG',
      'KHẢI HOÀN',
      'KỲ TÍCH',
      'ANH CHÀNG NHÀ BÊN',
      'TỔ ĐỘI SÓNG NGẦM',
    ]));
  });

  it('joins each side into a 90% block parallel to its outer tribune edge', () => {
    const [wing] = layout.sideWings.filter(({ side }) => side === 'left');
    const outerEdge = layout.standingTribunes[0].columns[0].footprint;
    const wingNames = wing.blocks.map(({ name }) => name);

    expect(layout.sideWings.filter(({ side }) => side === 'left')).toHaveLength(1);
    expect(wing).toMatchObject({
      x: -97.584,
      z: -58.011,
      rotationY: 0.152,
      blocks: [
        { name: 'ANH TÀI LẮM CHIÊU', dx: -9, dz: -14.97825, width: 18, depth: 29.9565 },
        { name: 'ANH TÀI HÀO HOA', dx: 9, dz: -14.97825, width: 18, depth: 29.9565 },
        { name: 'QUÁI KIỆT MỘNG MƠ', dx: -9, dz: 14.97825, width: 18, depth: 29.9565 },
        { name: 'BIỆT ĐỘI TÁI XUẤT', dx: 9, dz: 14.97825, width: 18, depth: 29.9565 },
      ],
    });
    expect(wingNames).toHaveLength(4);
    expect(Math.atan2(outerEdge[3][0] - outerEdge[0][0], outerEdge[3][1] - outerEdge[0][1]))
      .toBeCloseTo(wing.rotationY, 2);

    const tribune = layout.standingTribunes[0];
    const tribuneColumnX = -tribune.width / 2 + tribune.columns[0].width / 2;
    const outerEdgeMidpoint = [
      tribune.x + tribuneColumnX
        + (outerEdge[0][0] + outerEdge[3][0]) / 2,
      tribune.z + (outerEdge[0][1] + outerEdge[3][1]) / 2,
    ];
    const wingInnerEdgeMidpoint = [
      wing.x + Math.cos(wing.rotationY) * 18,
      wing.z - Math.sin(wing.rotationY) * 18,
    ];
    const gap = [
      wingInnerEdgeMidpoint[0] - outerEdgeMidpoint[0],
      wingInnerEdgeMidpoint[1] - outerEdgeMidpoint[1],
    ];
    expect(Math.hypot(...gap)).toBeCloseTo(5, 1);
    expect(gap[0] * Math.sin(wing.rotationY) + gap[1] * Math.cos(wing.rotationY))
      .toBeCloseTo(0, 1);
    const [outer, inner] = [-9, 9].map((dx) => wing.blocks.find((block) => block.dx === dx));
    expect(outer.dx + outer.width / 2).toBe(inner.dx - inner.width / 2);
    const [stageSide, audienceSide] = [-14.97825, 14.97825]
      .map((dz) => wing.blocks.find((block) => block.dz === dz));
    expect(stageSide.dz + stageSide.depth / 2).toBe(audienceSide.dz - audienceSide.depth / 2);
    const wingLength = audienceSide.dz + audienceSide.depth / 2
      - stageSide.dz + stageSide.depth / 2;
    const outerEdgeLength = Math.hypot(
      outerEdge[3][0] - outerEdge[0][0],
      outerEdge[3][1] - outerEdge[0][1],
    );
    expect(wingLength).toBeCloseTo(outerEdgeLength * 0.9, 2);

    const [rightWing] = layout.sideWings.filter(({ side }) => side === 'right');
    const rightTribune = layout.standingTribunes[1];
    const rightOuterEdge = rightTribune.columns[3].footprint;
    expect(layout.sideWings.filter(({ side }) => side === 'right')).toHaveLength(1);
    expect(rightWing).toMatchObject({
      x: -wing.x,
      z: wing.z,
      rotationY: -wing.rotationY,
      blocks: [
        { name: 'ANH TÀI NỘI LỰC', dx: -9, dz: -14.97825, width: 18, depth: 29.9565 },
        { name: 'TÌNH ĐẦU RỰC CHÁY', dx: 9, dz: -14.97825, width: 18, depth: 29.9565 },
        { name: 'ANH TÀI TÌNH', dx: -9, dz: 14.97825, width: 18, depth: 29.9565 },
        { name: 'NHỮNG KẺ LÃNG DU', dx: 9, dz: 14.97825, width: 18, depth: 29.9565 },
      ],
    });
    expect(Math.atan2(rightOuterEdge[2][0] - rightOuterEdge[1][0], rightOuterEdge[2][1] - rightOuterEdge[1][1]))
      .toBeCloseTo(rightWing.rotationY, 2);
    const rightColumnX = rightTribune.columns
      .slice(0, 3)
      .reduce((total, { width }) => total + width, -rightTribune.width / 2)
      + rightTribune.columns[3].width / 2;
    const rightOuterEdgeMidpoint = [
      rightTribune.x + rightColumnX
        + (rightOuterEdge[1][0] + rightOuterEdge[2][0]) / 2,
      rightTribune.z + (rightOuterEdge[1][1] + rightOuterEdge[2][1]) / 2,
    ];
    const rightWingInnerEdgeMidpoint = [
      rightWing.x - Math.cos(rightWing.rotationY) * 18,
      rightWing.z + Math.sin(rightWing.rotationY) * 18,
    ];
    const rightGap = [
      rightWingInnerEdgeMidpoint[0] - rightOuterEdgeMidpoint[0],
      rightWingInnerEdgeMidpoint[1] - rightOuterEdgeMidpoint[1],
    ];
    expect(Math.hypot(...rightGap)).toBeCloseTo(5, 1);
    expect(rightGap[0] * Math.sin(rightWing.rotationY) + rightGap[1] * Math.cos(rightWing.rotationY))
      .toBeCloseTo(0, 1);
  });

  it('removes the side staircases while preserving runway access stairs', () => {
    expect(layout.stairs).toEqual([]);
    expect(layout.accessStairs).toHaveLength(1);
  });

  it('matches the standing-tribune proportions and mirrored angles in the reference', () => {
    const [left, right] = layout.standingTribunes;

    expect(left).toMatchObject({
      x: -42,
      z: -63,
      width: 77,
      depth: 70,
      rotationY: 0,
      floorHeight: 0,
      fenceHeight: 0.5,
      gateWidth: 3,
    });
    expect(right).toMatchObject({
      x: 42,
      z: -63,
      width: 77,
      depth: 70,
      rotationY: 0,
      floorHeight: 0,
      fenceHeight: 0.5,
      gateWidth: 3,
    });
    expect(left.columns.map(({ name, width }) => [name, width])).toEqual([
      ['NGOẠI Ô', 15.4],
      ['MỸ NAM', 15.4],
      ['CỦI LỬA', 23.1],
      ['LÀM MẠNH', 23.1],
    ]);
    expect(right.columns.map(({ name, width }) => [name, width])).toEqual([
      ['SOẠN NHẠC', 23.1],
      ['ĐIỆN ẢNH', 23.1],
      ['HOA LỬA', 15.4],
      ['VINH QUY', 15.4],
    ]);
    expect(left.columns.reduce((total, { width }) => total + width, 0)).toBe(left.width);
    expect(right.columns.reduce((total, { width }) => total + width, 0)).toBe(right.width);
    expect(left.columns[3]).toMatchObject({ depth: 32, dz: 19 });
    expect(right.columns[0]).toMatchObject({ depth: 32, dz: 19 });
    expect(left.z + left.columns[3].dz + left.columns[3].depth / 2).toBe(left.z + left.depth / 2);
    expect(right.z + right.columns[0].dz + right.columns[0].depth / 2).toBe(right.z + right.depth / 2);
    expect(left.columns[3].footprint).toEqual([
      [-11.55, -16],
      [1.55, -16],
      [11.55, -6],
      [11.55, 16],
      [-11.55, 16],
    ]);
    expect(right.columns[0].footprint).toEqual([
      [-11.55, -6],
      [-1.55, -16],
      [11.55, -16],
      [11.55, 16],
      [-11.55, 16],
    ]);
    expect(left.columns[3].footprint[0][1]).toBe(-16);
    expect(left.columns[3].footprint[1][1]).toBe(-16);
    expect(right.columns[0].footprint[1][1]).toBe(-16);
    expect(right.columns[0].footprint[2][1]).toBe(-16);
    expect(left.columns[3].footprint[0][0]).toBe(-11.55);
    expect(left.columns[3].footprint[3][0]).toBe(11.55);
    expect(right.columns[0].footprint[0][0]).toBe(-11.55);
    expect(right.columns[0].footprint[3][0]).toBe(11.55);
    expect(left.columns[0].footprint).toEqual([
      [-7.1, -31.4],
      [7.1, -34.4],
      [7.1, 34.4],
      [3, 34.4],
    ]);
    expect(right.columns[3].footprint).toEqual([
      [-7.1, -34.4],
      [7.1, -31.4],
      [-3, 34.4],
      [-7.1, 34.4],
    ]);
    expect(left.columns[0].footprint[0][1]).toBe(-31.4);
    expect(right.columns[3].footprint[1][1]).toBe(-31.4);
    expect(left.columns[0].footprint[1][0] - left.columns[0].footprint[0][0]).toBe(14.2);
    expect(left.columns[0].footprint[2][0] - left.columns[0].footprint[3][0]).toBe(4.1);
    expect(right.columns[3].footprint[1][0] - right.columns[3].footprint[0][0]).toBe(14.2);
    expect(right.columns[3].footprint[2][0] - right.columns[3].footprint[3][0]).toBe(4.1);
    expect(left.x + left.width / 2).toBe(-3.5);
    expect(right.x - right.width / 2).toBe(3.5);
    const sânKhấu = layout.seatedSections.find(({ name }) => name === 'SÂN KHẤU');
    const nguyênTố = sânKhấu
      .blocks.find(({ name }) => name === 'NGUYÊN TỐ');
    const tribuneFront = Math.max(
      left.z + left.depth / 2,
      left.z + left.columns[3].dz + left.columns[3].depth / 2,
      right.z + right.depth / 2,
      right.z + right.columns[0].dz + right.columns[0].depth / 2,
    );
    expect(sânKhấu.z - (nguyênTố.depth ?? sânKhấu.depth) / 2 - tribuneFront)
      .toBeGreaterThan(0);
  });

  it('preserves the entrance and welcome-gate area', () => {
    expect(floorPlan.entrance).toEqual({
      wallSide: 'none',
      spawn: { x: 0, z: 117 },
      label: 'Cổng vào · ATVNCG2026 D1-2',
      labelPosition: { x: 0, z: 115 },
      floorPatch: { x: 0, z: 113, width: 40, depth: 6 },
    });
    expect(floorPlan.defaultSpawn).toEqual(floorPlan.entrance.spawn);
    expect(layout.gate).toEqual({
      x: 0,
      z: 97,
      width: 34,
      height: 20,
      shieldColor: '#c69a52',
      shieldEdge: '#5e4423',
      scaffoldColor: '#8a8f98',
      emblemText: 'M',
      label: 'CONCERT',
      labelColor: '#b7893f',
      title: 'ANH TRAI VƯỢT NGÀN CHÔNG GAI 2026',
      uplightColor: '#ffd98a',
      uplightIntensity: 24,
    });
  });

  it('creates a passable gate opening and blocks access through the other boundary sides', () => {
    const boundary = layout.eventBoundary;
    const obstacles = getConcertBoundarySegments(boundary);

    expect(boundary).toMatchObject({
      minX: -120,
      maxX: 120,
      minZ: -130,
      maxZ: 87,
      entryWidth: 28,
    });
    expect(floorPlan.entrance.spawn.z).toBeGreaterThan(boundary.maxZ);
    expect(layout.gate.z).toBeGreaterThan(boundary.maxZ);
    expect(layout.gate.z - boundary.maxZ).toBeCloseTo(10, 0);
    expect(isBlocked({ x: 0, z: boundary.maxZ }, obstacles)).toBe(false);
    expect(isBlocked({ x: 30, z: boundary.maxZ }, obstacles)).toBe(true);
    expect(isBlocked({ x: boundary.minX, z: 0 }, obstacles)).toBe(true);
    expect(isBlocked({ x: 0, z: boundary.minZ }, obstacles)).toBe(true);
  });

  it('mirrors the horse blocks and forms equal-sided triangular pits with separating runways', () => {
    const [longMa, chienMa, hienNhien, thamHiem] = layout.pits;

    expect(layout.debugCamera).toEqual({ x: 0, z: -89, height: 85 });
    expect(layout.centralClusterScale).toBe(0.72);
    expect(layout.centralClusterOffsetZ).toBe(-26);
    expect(floorPlan.bounds).toEqual({
      minX: -130,
      maxX: 130,
      minZ: -143,
      maxZ: 125,
    });
    expect(floorPlan.floor).toMatchObject({
      width: 260,
      depth: 268,
      surfaceWidth: 258,
      surfaceDepth: 266,
    });
    expect(layout.stage.labels).toEqual([]);
    expect(layout.stage.footprint).toEqual([
      [-35, -8],
      [35, -8],
      [35, 2],
      [25, 8],
      [-25, 8],
      [-35, 2],
    ]);
    expect(layout.stage.cornerRadius).toBe(3);
    expect(layout.stage.frontLipWidth).toBe(50);
    expect(layout.stage.floorLabel).toEqual({
      text: 'SÂN KHẤU',
      fontSize: 4.5,
      color: '#858c8f',
    });
    expect(layout.stage.deckColor).toBe('#cfd4d6');
    expect([longMa, chienMa, hienNhien, thamHiem].map(({ name }) => name)).toEqual([
      'LONG MÃ',
      'CHIẾN MÃ',
      'HIỂN NHIÊN',
      'THÁM HIỂM',
    ]);
    expect(layout.stage.z).toBe(-110);
    expect(longMa).toMatchObject({ x: -15.5, z: -91, rotationY: 0, width: 24, depth: 32 });
    expect(chienMa).toMatchObject({ x: 15.5, z: -91, rotationY: 0, width: 24, depth: 32 });
    expect(hienNhien).toMatchObject({ x: -10.234, z: -71.834, width: 16, depth: 16 });
    expect(thamHiem).toMatchObject({ x: 10.234, z: -71.834, width: 16, depth: 16 });
    expect([longMa, chienMa, hienNhien, thamHiem].map(({ priceLabel }) => priceLabel))
      .toEqual(['3.000.000 ₫', '3.000.000 ₫', '4.000.000 ₫', '4.000.000 ₫']);
    expect([longMa, chienMa, hienNhien, thamHiem].map(({ color, textColor }) => [color, textColor]))
      .toEqual(Array(4).fill(['#d64d44', '#2b2020']));
    expect(longMa.footprint).toEqual([[-12, -12], [12, -12], [12, -4], [-12, 20]]);
    expect(chienMa.footprint).toEqual([[-12, -12], [12, -12], [12, 20], [-12, -4]]);
    expect(hienNhien.footprint).toEqual([
      [-8.923, 2.391],
      [2.391, -8.923],
      [6.534, 6.534],
    ]);
    expect(thamHiem.footprint).toEqual([
      [-2.391, -8.923],
      [8.923, 2.391],
      [-6.534, 6.534],
    ]);
    const [topLeft, topRight, bottomRight, bottomLeft] = longMa.footprint;
    expect(topLeft[0]).toBe(bottomLeft[0]);
    expect(topRight[0]).toBe(bottomRight[0]);
    expect(topLeft[1]).toBe(topRight[1]);
    expect(longMa.rotationY).toBe(0);
    expect(Math.abs(bottomRight[0] - bottomLeft[0])).toBe(
      Math.abs(bottomRight[1] - bottomLeft[1]),
    );
    for (const triangle of [hienNhien, thamHiem]) {
      const [a, b, c] = triangle.footprint;
      const sideLength = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      expect(sideLength(a, b)).toBeCloseTo(16, 2);
      expect(sideLength(b, c)).toBeCloseTo(16, 2);
      expect(sideLength(c, a)).toBeCloseTo(16, 2);
    }
    expect(layout.stage.runway).toMatchObject({ length: 106.1667, width: 4.2 });
    const runwayEndZ = (layout.stage.z + layout.stage.depth / 2 + layout.stage.runway.length)
      * layout.centralClusterScale + layout.centralClusterOffsetZ;
    expect(runwayEndZ).toBeCloseTo(layout.foh.z - layout.foh.depth / 2, 1);
    expect(layout.pitRunways).toHaveLength(7);
    expect(layout.pitRunways.slice(0, 5).every(({ width }) => width === 2.4)).toBe(true);
    expect(layout.pitRunways.slice(5).every(({ width }) => width === 1.4)).toBe(true);
    expect(layout.pitRunways.slice(0, 5).map(({ start, end }) => [start, end])).toEqual([
      [[-34, -122], [34, -122]],
      [[-34, -122], [-34, -69]],
      [[34, -122], [34, -69]],
      [[-34, -69], [0, -53]],
      [[34, -69], [0, -53]],
    ]);
    const [leftTribune, rightTribune] = layout.standingTribunes;
    const leftLamManh = leftTribune.columns.find(({ name }) => name === 'LÀM MẠNH');
    const rightSoanNhac = rightTribune.columns.find(({ name }) => name === 'SOẠN NHẠC');
    const triangleFront = Math.max(
      ...[hienNhien, thamHiem].flatMap(({ z, footprint }) => footprint.map(([, localZ]) => z + localZ)),
    );
    const sideSectionsBack = Math.max(
      leftTribune.z + leftLamManh.dz - leftLamManh.depth / 2,
      rightTribune.z + rightSoanNhac.dz - rightSoanNhac.depth / 2,
    );
    expect(sideSectionsBack - triangleFront).toBeGreaterThanOrEqual(5);

    const transformedBounds = [
      ...layout.stage.footprint.map(([x, z]) => [layout.stage.x + x, layout.stage.z + z]),
      ...layout.pitRunways.flatMap(({ start, end }) => [start, end]),
      ...layout.pits.flatMap(({ x, z, footprint }) => footprint.map(([localX, localZ]) => [
        x + localX,
        z + localZ,
      ])),
    ].map(([x, z]) => [x * layout.centralClusterScale, z * layout.centralClusterScale]);
    const [minX, maxX] = [
      Math.min(...transformedBounds.map(([x]) => x)),
      Math.max(...transformedBounds.map(([x]) => x)),
    ];
    const [minZ, maxZ] = [
      Math.min(...transformedBounds.map(([, z]) => z)),
      Math.max(...transformedBounds.map(([, z]) => z)),
    ];
    expect(minX).toBeGreaterThanOrEqual(-26.6);
    expect(maxX).toBeLessThanOrEqual(26.6);
    expect(minZ + layout.centralClusterOffsetZ).toBeGreaterThanOrEqual(-116);
    expect(maxZ + layout.centralClusterOffsetZ).toBeLessThanOrEqual(-64);
    const cuiluaStageSideEdge = layout.standingTribunes[0].z
      - layout.standingTribunes[0].depth / 2;
    const stageFrontEdge = Math.max(...layout.stage.footprint.map(([, z]) => z))
      + layout.stage.z;
    expect(stageFrontEdge * layout.centralClusterScale + layout.centralClusterOffsetZ)
      .toBeLessThan(cuiluaStageSideEdge);
  });

  it('places the synchronized video screen within the stage backdrop', () => {
    const { videoScreen } = layout.stage;

    expect(videoScreen).toEqual({
      videoId: 'qelODM2Kkf4',
      durationSeconds: 5520,
      width: 26.6667,
      height: 15,
      x: 0,
      y: layout.stage.height + 7.5,
      z: -layout.stage.depth / 2 + 0.45,
    });
    expect(videoScreen.height).toBe(15);
    expect(videoScreen.width).toBeLessThan(layout.stage.width);
  });

  it('connects the seated blocks from Lục Lạc through Tổ đội Sóng Ngầm', () => {
    const rows = layout.seatedSections.filter(({ name }) => /^HÀNG [1-4]$/.test(name));
    const firstRowBlocks = rows[0].blocks;
    const quyTu = firstRowBlocks.find(({ name }) => name === 'QUÝ TỬ');
    const benhBong = rows[1].blocks.find(({ name }) => name === 'BỆNH BỔNG');

    expect(rows.map(({ tier }) => tier)).toEqual([2, 4, 6, 6]);
    expect(rows[0].blocks.map(({ name, x, width }) => ({ name, x, width }))).toEqual([
      { name: 'LỤC LẠC', x: -56.5, width: 48 },
      { name: 'QUÝ TỬ', x: 0, width: 65 },
      { name: 'THĂNG HOA', x: 56.5, width: 48 },
    ]);
    expect(quyTu.width).toBe(benhBong.width);
    expect(rows[0].depth).toBe(rows[1].depth);
    expect(rows[1].blocks.map(({ name, width }) => [name, width])).toEqual([
      ['HÀO MÔN', 36],
      ['BỆNH BỔNG', 65],
      ['LẪY LỪNG', 36],
    ]);
    expect(rows[2].blocks.map(({ name, width }) => [name, width])).toEqual([
      ['KHẢI HOÀN', 48],
      ['KỲ TÍCH', 48],
    ]);
    expect(rows[3].blocks.map(({ name, width }) => [name, width])).toEqual([
      ['ANH CHÀNG NHÀ BÊN', 37],
      ['TỔ ĐỘI SÓNG NGẦM', 37],
    ]);
    rows.forEach((row) => {
      const blocks = [...row.blocks].sort((a, b) => a.x - b.x);
      blocks.slice(1).forEach((block, index) => {
        const previous = blocks[index];
        expect(previous.x + previous.width / 2).toBe(block.x - block.width / 2);
      });

    });
    rows.slice(1).forEach((row, index) => {
      const previous = rows[index];
      expect(previous.z + previous.depth / 2).toBe(row.z - row.depth / 2);
    });
  });

  it('matches the area prices and Vietnamese names shown on the ticket map', () => {
    const [leftTribune, rightTribune] = layout.standingTribunes;
    const areas = [
      ...leftTribune.columns,
      ...rightTribune.columns,
      ...layout.sideWings.flatMap(({ blocks }) => blocks),
      ...layout.seatedSections.flatMap(({ blocks }) => blocks),
    ];
    const priceByName = Object.fromEntries(areas.map(({ name, priceLabel }) => [name, priceLabel]));

    expect(priceByName).toMatchObject({
      'NGOẠI Ô': '1.000.000 ₫',
      'MỸ NAM': '1.500.000 ₫',
      'CỦI LỬA': '2.000.000 ₫',
      'LÀM MẠNH': '3.000.000 ₫',
      'SOẠN NHẠC': '3.000.000 ₫',
      'ĐIỆN ẢNH': '2.000.000 ₫',
      'HOA LỬA': '1.500.000 ₫',
      'VINH QUY': '1.000.000 ₫',
      'ANH TÀI LẮM CHIÊU': '1.000.000 ₫',
      'ANH TÀI HÀO HOA': '1.500.000 ₫',
      'QUÁI KIỆT MỘNG MƠ': '1.500.000 ₫',
      'BIỆT ĐỘI TÁI XUẤT': '2.000.000 ₫',
      'NGUYÊN TỐ': '3.000.000 ₫',
      'MỸ MÃN': '4.000.000 ₫',
      'HỢP LỰC': '4.000.000 ₫',
      'RỰC RỠ': '3.000.000 ₫',
      'QUÝ TỬ': '4.000.000 ₫',
      'BỆNH BỔNG': '3.000.000 ₫',
      'HÀO MÔN': '2.500.000 ₫',
      'LẪY LỪNG': '2.500.000 ₫',
      'KHẢI HOÀN': '2.000.000 ₫',
      'KỲ TÍCH': '2.000.000 ₫',
      'ANH CHÀNG NHÀ BÊN': '1.500.000 ₫',
      'TỔ ĐỘI SÓNG NGẦM': '1.500.000 ₫',
      'S-VIP 1': '10.000.000 ₫',
      'S-VIP 2': '10.000.000 ₫',
    });
  });

  it('joins the stage-side blocks into a tier below Lục Lạc', () => {
    const stageSide = layout.seatedSections.find(({ name }) => name === 'SÂN KHẤU');
    const svip = layout.seatedSections.find(({ name }) => name === 'S-VIP VÀ STAGE B');
    const lucLac = layout.seatedSections.find(({ name }) => name === 'HÀNG 1');
    const foh = layout.foh;
    const runway = layout.runways[0];
    const accessStairs = layout.accessStairs[0];
    const stageSideBlocks = [...stageSide.blocks, {
      name: foh.label,
      x: foh.x,
      width: foh.width,
    }].sort((a, b) => a.x - b.x);
    const svipBlocks = [...svip.blocks].sort((a, b) => a.x - b.x);

    expect(stageSide.tier).toBe(lucLac.tier - 1);
    expect(svip.tier).toBe(lucLac.tier - 1);
    expect(foh.tier).toBe(lucLac.tier - 1);
    for (const blocks of [stageSideBlocks, svipBlocks]) {
      expect(blocks.at(-1).x + blocks.at(-1).width / 2
        - (blocks[0].x - blocks[0].width / 2)).toBeCloseTo(161);
      blocks.slice(1).forEach((block, index) => {
        const previous = blocks[index];
        expect(previous.x + previous.width / 2).toBeCloseTo(block.x - block.width / 2);
      });
    }

    expect(runway).toMatchObject({
      zStart: svip.z + svip.depth / 2,
      zEnd: lucLac.z - lucLac.depth / 2,
      spanWidth: 161,
      tier: lucLac.tier,
      heightOffset: -0.5,
      color: '#888888',
    });
    expect(accessStairs).toMatchObject({
      x: runway.x,
      zStart: runway.zStart,
      zEnd: runway.zStart + (runway.zEnd - runway.zStart) / 2,
      spanWidth: runway.spanWidth / 2,
      fromTier: svip.tier,
      toTier: runway.tier,
      toHeightOffset: runway.heightOffset,
      color: '#888888',
    });
    expect(runway.heightOffset).toBe(-0.5);
    expect(accessStairs.zStart).toBe(svip.z + svip.depth / 2);
  });

  it('does not include structures from the previous concert layout', () => {
    expect(layout).not.toHaveProperty('screens');
    expect(layout).not.toHaveProperty('towers');
    expect(layout.stage).not.toHaveProperty('centerScreen');
    expect(layout.stage).not.toHaveProperty('chevronCount');
    expect(layout.stage).not.toHaveProperty('logoText');
  });
});
