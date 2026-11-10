import { useEffect, useRef, useState } from 'react';

const DEAD_ZONE = 0.12;

export default function MovementJoystick({ inputRef, disabled = false }) {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [thumbPosition, setThumbPosition] = useState({ x: 0, y: 0 });
  const activePointerId = useRef(null);

  useEffect(() => {
    const coarsePointer = window.matchMedia('(any-pointer: coarse)');
    const updateTouchSupport = () => {
      setIsTouchDevice(coarsePointer.matches);
    };

    updateTouchSupport();
    coarsePointer.addEventListener('change', updateTouchSupport);
    return () => coarsePointer.removeEventListener('change', updateTouchSupport);
  }, []);

  useEffect(() => {
    if (disabled || !isTouchDevice) {
      inputRef.current = { x: 0, y: 0 };
      setThumbPosition({ x: 0, y: 0 });
      activePointerId.current = null;
    }
    return () => {
      inputRef.current = { x: 0, y: 0 };
      activePointerId.current = null;
    };
  }, [disabled, inputRef, isTouchDevice]);

  if (!isTouchDevice || disabled) return null;

  const releaseJoystick = () => {
    activePointerId.current = null;
    inputRef.current = { x: 0, y: 0 };
    setThumbPosition({ x: 0, y: 0 });
  };

  const updateJoystick = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const travel = Math.min(bounds.width, bounds.height) / 2 - 25;
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > travel ? travel / distance : 1;
    const x = (dx * scale) / travel;
    const y = (-dy * scale) / travel;
    const magnitude = Math.hypot(x, y);

    if (magnitude <= DEAD_ZONE) {
      inputRef.current = { x: 0, y: 0 };
    } else {
      const adjustedMagnitude = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE));
      const adjustment = adjustedMagnitude / magnitude;
      inputRef.current = { x: x * adjustment, y: y * adjustment };
    }

    setThumbPosition({ x: dx * scale, y: dy * scale });
  };

  const handlePointerDown = (event) => {
    if (activePointerId.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };

  const handlePointerMove = (event) => {
    if (activePointerId.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateJoystick(event);
  };

  const handlePointerRelease = (event) => {
    if (activePointerId.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    releaseJoystick();
  };

  return (
    <div
      className="movement-joystick"
      role="group"
      aria-label="Cần điều khiển di chuyển"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onLostPointerCapture={handlePointerRelease}
    >
      <span className="movement-joystick__direction movement-joystick__direction--up" aria-hidden="true">▲</span>
      <span className="movement-joystick__direction movement-joystick__direction--right" aria-hidden="true">▶</span>
      <span className="movement-joystick__direction movement-joystick__direction--down" aria-hidden="true">▼</span>
      <span className="movement-joystick__direction movement-joystick__direction--left" aria-hidden="true">◀</span>
      <span
        className="movement-joystick__thumb"
        style={{ transform: `translate(calc(-50% + ${thumbPosition.x}px), calc(-50% + ${thumbPosition.y}px))` }}
        aria-hidden="true"
      />
    </div>
  );
}
