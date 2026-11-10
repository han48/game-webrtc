import { create } from 'zustand';

const initialPosition = { x: 7.3, z: 6.5 };

export const useOfficeStore = create((set) => ({
  target: null,
  path: [],
  position: initialPosition,
  direction: { x: 0, z: -1 },
  isMoving: false,
  setTarget: (target) => set({ target }),
  setPath: (path) => set({ path }),
  setPosition: (position) => set({ position }),
  setDirection: (direction) => set({ direction }),
  setIsMoving: (isMoving) => set({ isMoving }),
  reset: () => set({
    target: null,
    path: [],
    position: initialPosition,
    direction: { x: 0, z: -1 },
    isMoving: false,
  }),
}));
