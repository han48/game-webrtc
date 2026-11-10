import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  filterConcertTeleportLocations,
  getConcertTeleportLocations,
} from './concert-teleport.js';

const floorPlan = JSON.parse(readFileSync(new URL('../concert-floor-plan.json', import.meta.url), 'utf8'));

describe('concert teleport locations', () => {
  const locations = getConcertTeleportLocations(floorPlan.layout);

  it('includes the stage, runway, standing areas, side wings, and seated sections', () => {
    const names = locations.map(({ name }) => name);

    expect(names).toEqual(expect.arrayContaining([
      'SÂN KHẤU',
      'RUNWAY',
      'LONG MÃ',
      'NGOẠI Ô',
      'ANH TÀI LẮM CHIÊU',
      'FOH',
      'S-VIP 1',
      'ANH CHÀNG NHÀ BÊN',
    ]));
    expect(new Set(locations.map(({ id }) => id)).size).toBe(locations.length);
  });

  it('returns finite destinations at the center of the selected area', () => {
    expect(locations.every(({ x, z }) => Number.isFinite(x) && Number.isFinite(z))).toBe(true);
    const longMa = locations.find(({ name }) => name === 'LONG MÃ');

    expect(longMa.x).toBeCloseTo((-15.5 - 2.4) * floorPlan.layout.centralClusterScale, 5);
    expect(longMa.z).toBeCloseTo(
      (-91 - 0.8) * floorPlan.layout.centralClusterScale
        + floorPlan.layout.centralClusterOffsetZ,
      5,
    );
  });

  it('includes area type, ticket price, and estimated distance to the stage', () => {
    const longMa = locations.find(({ name }) => name === 'LONG MÃ');
    const lucLac = locations.find(({ name }) => name === 'LỤC LẠC');
    const foh = locations.find(({ name }) => name === 'FOH');
    const stage = locations.find(({ type }) => type === 'Sân khấu');

    expect(longMa).toMatchObject({ type: 'Đứng', priceLabel: '3.000.000 ₫' });
    expect(lucLac).toMatchObject({ type: 'Ngồi', priceLabel: '3.000.000 ₫' });
    expect(foh).toMatchObject({ type: 'Kỹ thuật' });
    expect(locations.every(({ distanceToStage }) => Number.isFinite(distanceToStage))).toBe(true);
    expect(stage.distanceToStage).toBe(0);
    expect(longMa.distanceToStage).toBeCloseTo(
      Math.hypot(longMa.x - stage.x, longMa.z - stage.z),
    );
  });

  it('filters areas at or below the selected maximum ticket price', () => {
    const filtered = filterConcertTeleportLocations(locations, 2000000);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(({ priceLabel }) => (
      priceLabel && Number(priceLabel.replace(/\D/g, '')) <= 2000000
    ))).toBe(true);
    expect(filtered.some(({ name }) => name === 'NGOẠI Ô')).toBe(true);
    expect(filtered.some(({ name }) => name === 'LONG MÃ')).toBe(false);
    expect(filtered.some(({ name }) => name === 'FOH')).toBe(false);
    expect(filterConcertTeleportLocations(locations, null)).toBe(locations);
  });

  it('places tribune and seated destinations at their block centers', () => {
    const outerDistrict = locations.find(({ name }) => name === 'NGOẠI Ô');
    const vip = locations.find(({ name }) => name === 'S-VIP 1');

    expect(outerDistrict.x).toBeCloseTo(-70.7291, 3);
    expect(outerDistrict.z).toBeCloseTo(-68.5042, 3);
    expect(vip).toMatchObject({ x: -50.5, z: -5 });
  });
});
