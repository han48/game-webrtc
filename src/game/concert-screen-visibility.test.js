import { describe, expect, it } from 'vitest';
import { Object3D, PerspectiveCamera } from 'three';
import { isConcertScreenInView } from './concert-screen-visibility.js';

function createCamera(position) {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe('concert LED screen camera visibility', () => {
  it('shows the screen when it is in front of and inside the camera frustum', () => {
    const camera = createCamera([0, 0, 10]);
    const screen = new Object3D();

    expect(isConcertScreenInView(camera, screen, 10, 5)).toBe(true);
  });

  it('hides the screen when viewed from behind', () => {
    const camera = createCamera([0, 0, -10]);
    const screen = new Object3D();

    expect(isConcertScreenInView(camera, screen, 10, 5)).toBe(false);
  });

  it('hides the screen when it is outside the camera frustum', () => {
    const camera = createCamera([0, 0, 10]);
    const screen = new Object3D();
    screen.position.x = 100;

    expect(isConcertScreenInView(camera, screen, 10, 5)).toBe(false);
  });
});
