import { Frustum, Matrix4, Quaternion, Sphere, Vector3 } from 'three';

const screenPosition = new Vector3();
const screenNormal = new Vector3();
const cameraDirection = new Vector3();
const cameraPosition = new Vector3();
const screenScale = new Vector3();
const screenQuaternion = new Quaternion();
const projectionView = new Matrix4();
const cameraFrustum = new Frustum();
const screenBounds = new Sphere();

export function isConcertScreenInView(camera, screenObject, width, height) {
  camera.updateMatrixWorld();
  screenObject.updateWorldMatrix(true, false);
  screenObject.getWorldPosition(screenPosition);
  screenObject.getWorldQuaternion(screenQuaternion);
  screenNormal.set(0, 0, 1).applyQuaternion(screenQuaternion).normalize();
  camera.getWorldPosition(cameraPosition);
  cameraDirection.subVectors(cameraPosition, screenPosition).normalize();

  if (screenNormal.dot(cameraDirection) <= 0) return false;

  screenObject.getWorldScale(screenScale);
  const radius = Math.hypot(width, height) * 0.5 * Math.max(
    screenScale.x,
    screenScale.y,
    screenScale.z,
  );
  screenBounds.center.copy(screenPosition);
  screenBounds.radius = radius;
  projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  cameraFrustum.setFromProjectionMatrix(projectionView);
  return cameraFrustum.intersectsSphere(screenBounds);
}
