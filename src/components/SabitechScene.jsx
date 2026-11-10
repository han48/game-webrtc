import { Suspense, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { CanvasTexture, MathUtils, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three';
import floorPlan from '../sabitech-floor-plan.json';
import sabitechContent from '../sabitech-content.json';
import { Character } from './OfficeScene';
import { DEFAULT_AVATAR } from '../avatar';

const FLOORS = floorPlan.floors;
const MOVE_SPEED = 4; // units/s
const EYE_HEIGHT = 1.7;
const FLOOR_HEIGHT = 4;
const ROOM_SIZE = 16;
const SOUTH_WALL_Z = ROOM_SIZE / 2;
const ROOM_HALF = 7.5;
const ELEVATOR_TRIGGER_DIST = 1.2;
const STAIR_ENTRANCE_Z = SOUTH_WALL_Z + 0.15;
const STAIR_ARRIVAL_Z = ROOM_HALF - 0.8;
const UP_STAIR_X = -2.65;
const DOWN_STAIR_X = 2.65;
const TELEPORT_COOLDOWN = 1500; // ms
const MOUSE_SENSITIVITY = 0.002;
const PANEL_INTERACTION_DISTANCE = 3.2;

function getPanelUrl(panel) {
  const candidate = panel.url
    || panel.lines.map((line) => line.match(/https?:\/\/[^\s]+/)?.[0]).find(Boolean);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function isPanelInteractive(panel) {
  return Boolean(panel.gallery || getPanelUrl(panel));
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((part) => part + part).join('')
    : value;
  const number = Number.parseInt(normalized, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  let lineIndex = 0;

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      lineIndex += 1;
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) context.fillText(line, x, y + lineIndex * lineHeight);
  return lineIndex + 1;
}

function createPanelArtwork(panel) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 800;
  const context = canvas.getContext('2d');
  if (!context) return new CanvasTexture(canvas);

  const accent = panel.accentColor || '#527a9e';
  const title = panel.title.toUpperCase();
  const url = getPanelUrl(panel);
  const isMobile = /mobile|スマホ|app/i.test(title);
  const isCertificate = /certif|資格/i.test(title);
  const isContact = /contact|office/i.test(title);

  context.fillStyle = '#f7f9fc';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const header = context.createLinearGradient(0, 0, canvas.width, 110);
  header.addColorStop(0, accent);
  header.addColorStop(1, '#263b54');
  context.fillStyle = header;
  context.fillRect(0, 0, canvas.width, 112);

  context.fillStyle = '#ffffff';
  context.font = '700 29px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.fillText('SBT', 34, 56);
  context.fillStyle = 'rgba(255,255,255,0.72)';
  context.font = '500 15px system-ui, sans-serif';
  context.fillText('SABITECH  /  EXPERIENCE CENTER', 116, 56);
  context.fillStyle = '#ffffff';
  context.font = `700 ${title.length > 27 ? 24 : 30}px system-ui, sans-serif`;
  const titleText = title.length > 44 ? `${title.slice(0, 42)}…` : title;
  context.fillText(titleText, 420, 57, 790);

  const artworkX = 32;
  const artworkY = 142;
  const artworkWidth = 335;
  const artworkHeight = 620;
  const artworkGradient = context.createLinearGradient(artworkX, artworkY, artworkX + artworkWidth, artworkY + artworkHeight);
  artworkGradient.addColorStop(0, colorWithAlpha(accent, 0.19));
  artworkGradient.addColorStop(1, '#e9f1f7');
  context.fillStyle = artworkGradient;
  context.beginPath();
  context.roundRect(artworkX, artworkY, artworkWidth, artworkHeight, 24);
  context.fill();

  context.save();
  context.beginPath();
  context.roundRect(artworkX, artworkY, artworkWidth, artworkHeight, 24);
  context.clip();
  context.strokeStyle = colorWithAlpha(accent, 0.3);
  context.lineWidth = 3;
  for (let index = 0; index < 7; index += 1) {
    const x = artworkX + 26 + index * 48;
    context.beginPath();
    context.moveTo(x, artworkY);
    context.lineTo(x, artworkY + artworkHeight);
    context.stroke();
  }
  for (let index = 0; index < 11; index += 1) {
    const y = artworkY + 20 + index * 57;
    context.beginPath();
    context.moveTo(artworkX, y);
    context.lineTo(artworkX + artworkWidth, y);
    context.stroke();
  }

  const centerX = artworkX + artworkWidth / 2;
  const centerY = artworkY + artworkHeight / 2 - 14;
  const orb = context.createRadialGradient(centerX - 36, centerY - 44, 8, centerX, centerY, 142);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(0.3, colorWithAlpha(accent, 0.7));
  orb.addColorStop(1, colorWithAlpha(accent, 0.04));
  context.fillStyle = orb;
  context.beginPath();
  context.arc(centerX, centerY, 142, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = colorWithAlpha(accent, 0.82);
  context.lineWidth = 5;
  [72, 104, 136].forEach((radius, index) => {
    context.beginPath();
    context.ellipse(centerX, centerY, radius, radius * (isMobile ? 0.78 : 0.58), index * 0.35, 0, Math.PI * 2);
    context.stroke();
  });

  const nodeCount = isCertificate ? 7 : isContact ? 4 : 6;
  for (let index = 0; index < nodeCount; index += 1) {
    const angle = (index / nodeCount) * Math.PI * 2 - Math.PI / 2;
    const radius = isMobile ? 112 : 128;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius * 0.7;
    context.fillStyle = '#ffffff';
    context.strokeStyle = accent;
    context.lineWidth = 6;
    context.beginPath();
    context.arc(x, y, isCertificate ? 23 : 17, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = accent;
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = '#ffffff';
  context.strokeStyle = accent;
  context.lineWidth = 8;
  if (isMobile) {
    context.beginPath();
    context.roundRect(centerX - 54, centerY - 96, 108, 192, 20);
    context.fill();
    context.stroke();
    context.fillStyle = colorWithAlpha(accent, 0.25);
    context.fillRect(centerX - 38, centerY - 62, 76, 112);
    context.fillStyle = accent;
    context.beginPath();
    context.arc(centerX, centerY + 72, 8, 0, Math.PI * 2);
    context.fill();
  } else if (isCertificate) {
    context.beginPath();
    context.arc(centerX, centerY, 66, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = accent;
    context.font = '700 64px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText('✓', centerX, centerY + 22);
    context.textAlign = 'start';
    context.beginPath();
    context.moveTo(centerX - 34, centerY + 62);
    context.lineTo(centerX - 52, centerY + 120);
    context.lineTo(centerX - 9, centerY + 101);
    context.fill();
    context.beginPath();
    context.moveTo(centerX + 34, centerY + 62);
    context.lineTo(centerX + 52, centerY + 120);
    context.lineTo(centerX + 9, centerY + 101);
    context.fill();
  } else if (isContact) {
    context.beginPath();
    context.arc(centerX, centerY - 24, 44, Math.PI, 0);
    context.lineTo(centerX + 44, centerY + 66);
    context.lineTo(centerX - 44, centerY + 66);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = accent;
    context.beginPath();
    context.arc(centerX, centerY - 24, 15, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.roundRect(centerX - 78, centerY - 52, 156, 104, 14);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(centerX - 100, centerY + 68);
    context.lineTo(centerX + 100, centerY + 68);
    context.lineTo(centerX + 68, centerY + 54);
    context.lineTo(centerX - 68, centerY + 54);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = colorWithAlpha(accent, 0.22);
    context.fillRect(centerX - 59, centerY - 34, 118, 62);
    context.strokeStyle = accent;
    context.lineWidth = 4;
    for (let index = 0; index < 3; index += 1) {
      context.beginPath();
      context.moveTo(centerX - 43, centerY - 16 + index * 19);
      context.lineTo(centerX + 8 + (index % 2) * 24, centerY - 16 + index * 19);
      context.stroke();
    }
  }
  context.restore();

  const contentLeft = 412;
  const contentWidth = 820;
  const lines = panel.lines.filter((line) => !/^https?:\/\//i.test(line));
  const fontSize = lines.length > 8 ? 23 : lines.length > 5 ? 26 : 30;
  context.font = `500 ${fontSize}px system-ui, sans-serif`;
  context.textBaseline = 'top';
  const lineHeight = fontSize * 1.55;
  const availableHeight = 548;
  const groupGap = lines.length > 6 ? 4 : 15;
  let cursorY = artworkY + 22;

  lines.forEach((line, index) => {
    context.fillStyle = colorWithAlpha(accent, 0.88);
    context.beginPath();
    context.arc(contentLeft + 9, cursorY + fontSize * 0.48, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#30445a';
    const usedLines = drawWrappedText(
      context,
      line.replace(/^[-•]\s*/, ''),
      contentLeft + 30,
      cursorY,
      contentWidth,
      lineHeight,
    );
    cursorY += Math.max(lineHeight, usedLines * lineHeight) + groupGap;

    if (index < lines.length - 1) {
      context.strokeStyle = 'rgba(41,65,89,0.11)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(contentLeft + 30, cursorY - groupGap / 2);
      context.lineTo(contentLeft + contentWidth, cursorY - groupGap / 2);
      context.stroke();
    }
  });

  context.fillStyle = colorWithAlpha(accent, 0.14);
  context.beginPath();
  context.roundRect(artworkX + 20, canvas.height - 69, 295, 42, 18);
  context.fill();
  context.fillStyle = accent;
  context.textAlign = 'center';
  if (url) {
    context.font = '700 16px system-ui, sans-serif';
    context.fillText(new URL(url).host, artworkX + artworkWidth / 2, canvas.height - 48);
    context.font = '600 12px system-ui, sans-serif';
    context.fillText('NHẤN E ĐỂ MỞ WEBSITE', artworkX + artworkWidth / 2, canvas.height - 31);
  } else {
    context.font = '700 17px system-ui, sans-serif';
    context.fillText(`SBT  ·  TẦNG ${panel.id.split('-')[0].slice(1)}`, artworkX + artworkWidth / 2, canvas.height - 42);
  }
  context.textAlign = 'start';

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createWallPatternTexture(accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new CanvasTexture(canvas);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = colorWithAlpha(accentColor, 0.2);
  context.lineWidth = 3;
  for (let x = 32; x < 512; x += 128) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 76);
    context.lineTo(x + 40, 108);
    context.lineTo(x + 40, 230);
    context.stroke();
    context.beginPath();
    context.arc(x + 40, 252, 22, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(x + 40, 274);
    context.lineTo(x + 40, 392);
    context.lineTo(x + 76, 422);
    context.lineTo(x + 76, 512);
    context.stroke();
    context.beginPath();
    context.arc(x + 76, 430, 8, 0, Math.PI * 2);
    context.fillStyle = colorWithAlpha(accentColor, 0.24);
    context.fill();
  }
  for (let y = 40; y < 512; y += 128) {
    context.beginPath();
    context.arc(470, y, 18, 0, Math.PI * 2);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 1);
  return texture;
}

// ─────────────────────────────────────────────
// HUD overlay (plain HTML, not drei Html)
// ─────────────────────────────────────────────
function HUD({ floorLabel, playerName, nearbyPanel }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.55)',
        color: '#fff',
        padding: '8px 18px',
        borderRadius: 8,
        fontSize: 13,
        pointerEvents: 'none',
        zIndex: 10,
        whiteSpace: 'nowrap',
      }}
    >
      {playerName && <span style={{ color: '#aaddff', marginRight: 8 }}>👤 {playerName}</span>}
      <strong>{floorLabel}</strong>
      {' · '}
      W/A/S/D hoặc ↑←↓→ di chuyển · Click để khóa chuột · ESC để mở khóa
      {nearbyPanel && (
        <span style={{ display: 'block', marginTop: 5, color: '#d9f99d', fontWeight: 700 }}>
          Nhấn E để mở: {nearbyPanel.title}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// InfoPanel — one information board
// ─────────────────────────────────────────────
function InfoPanel({ panel, floorY }) {
  const panelArtwork = useMemo(() => createPanelArtwork(panel), [panel]);

  useEffect(() => () => panelArtwork.dispose(), [panelArtwork]);

  return (
    <group
      position={[panel.x, floorY + panel.y, panel.z]}
      rotation={[0, panel.rotationY, 0]}
    >
      {/* Layered frame */}
      <mesh position={[0, 0, -0.07]} castShadow>
        <boxGeometry args={[panel.width + 0.2, panel.height + 0.2, 0.13]} />
        <meshStandardMaterial color={panel.accentColor || '#8bd0ff'} metalness={0.45} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, 0.005]} castShadow>
        <boxGeometry args={[panel.width + 0.08, panel.height + 0.08, 0.035]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[panel.width, panel.height, 0.025]} />
        <meshStandardMaterial color="#f5f8fc" roughness={0.68} />
      </mesh>
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[panel.width - 0.025, panel.height - 0.025]} />
        <meshBasicMaterial map={panelArtwork} toneMapped={false} />
      </mesh>
    </group>
  );
}

function GalleryContent({ galleryId, onOpenItem }) {
  const gallery = sabitechContent[galleryId];
  if (!gallery) return null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 28px' }}>
      <p style={{ margin: '0 0 12px', color: '#536b7f', font: '14px system-ui, sans-serif' }}>
        {gallery.items.length} mục · Nội dung xem được ngay trong thư viện; liên kết bài viết mở ở tab mới.
      </p>
      <nav aria-label="Trang nguồn chính thức" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {gallery.sourceUrls.map((url, index) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              borderRadius: 16,
              padding: '5px 10px',
              background: '#e8f0f6',
              color: '#315f86',
              font: '12px system-ui, sans-serif',
            }}
          >
            Nguồn {index + 1}
          </a>
        ))}
      </nav>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
        gap: 16,
      }}>
        {gallery.items.map((item) => (
          <article
            key={item.url}
            style={{
              overflow: 'hidden',
              border: '1px solid #d9e3eb',
              borderRadius: 12,
              background: '#ffffff',
              boxShadow: '0 3px 12px rgba(30,55,75,0.08)',
            }}
          >
            <button
              type="button"
              onClick={() => onOpenItem(item)}
              aria-label={`Xem thông tin ${item.title}`}
              style={{ display: 'block', width: '100%', padding: 0, border: 0, cursor: 'pointer' }}
            >
              <img
                src={item.image}
                alt=""
                loading="lazy"
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
                style={{ display: 'block', width: '100%', height: 150, objectFit: 'cover', background: '#e8eef3' }}
              />
            </button>
            <div style={{ padding: '12px 14px 14px' }}>
              {item.date && (
                <time style={{ color: '#61788c', font: '12px system-ui, sans-serif' }}>{item.date}</time>
              )}
              <h2 style={{ margin: '5px 0 8px', color: '#20364a', font: '600 15px/1.5 system-ui, sans-serif' }}>
                {item.title}
              </h2>
              {item.description && (
                <p style={{ margin: '0 0 10px', color: '#526779', font: '13px/1.6 system-ui, sans-serif' }}>
                  {item.description}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  style={{
                    padding: 0,
                    border: 0,
                    background: 'none',
                    color: '#276c9e',
                    cursor: 'pointer',
                    font: '600 13px system-ui, sans-serif',
                  }}
                >
                  Xem thông tin
                </button>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#276c9e', font: '600 13px system-ui, sans-serif' }}
                >
                  Mở tab mới ↗
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function GalleryItemDetail({ item }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, color: '#20364a' }}>
      {item.image && (
        <img
          src={item.image}
          alt=""
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '42vh',
            objectFit: 'contain',
            margin: '0 auto 18px',
            borderRadius: 10,
            background: '#e8eef3',
          }}
        />
      )}
      {item.date && (
        <time style={{ color: '#61788c', font: '13px system-ui, sans-serif' }}>{item.date}</time>
      )}
      {item.description && (
        <p style={{ maxWidth: 820, margin: '12px 0 20px', font: '16px/1.7 system-ui, sans-serif' }}>
          {item.description}
        </p>
      )}
      <p style={{ color: '#536b7f', font: '14px/1.6 system-ui, sans-serif' }}>
        Bài viết gốc được mở ở tab mới vì website không cho phép hiển thị bên trong khung nhúng.
      </p>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          marginTop: 4,
          borderRadius: 8,
          padding: '11px 16px',
          background: '#276c9e',
          color: '#ffffff',
          font: '600 14px system-ui, sans-serif',
          textDecoration: 'none',
        }}
      >
        Mở bài viết gốc ↗
      </a>
    </div>
  );
}

function ExternalPageNotice({ title, url }) {
  return (
    <div style={{
      flex: 1,
      display: 'grid',
      placeItems: 'center',
      overflowY: 'auto',
      padding: 24,
      textAlign: 'center',
      color: '#20364a',
    }}>
      <div style={{ maxWidth: 560 }}>
        <div aria-hidden="true" style={{ marginBottom: 12, color: '#347ca5', fontSize: 42 }}>↗</div>
        <h2 style={{ margin: '0 0 10px', font: '600 22px system-ui, sans-serif' }}>{title}</h2>
        <p style={{ margin: '0 0 20px', color: '#536b7f', font: '15px/1.65 system-ui, sans-serif' }}>
          Website này chặn việc nhúng trong ứng dụng. Hãy mở trang trong tab mới để xem nội dung.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            borderRadius: 8,
            padding: '11px 16px',
            background: '#276c9e',
            color: '#ffffff',
            font: '600 14px system-ui, sans-serif',
            textDecoration: 'none',
          }}
        >
          Mở website ↗
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FloorLighting — per-floor lights
// ─────────────────────────────────────────────
function FloorLighting({ floor }) {
  return (
    <>
      <hemisphereLight
        color="#fff8ed"
        groundColor="#a8bacb"
        intensity={0.9}
      />
      <ambientLight color={floor.ambientColor} intensity={floor.ambientIntensity} />
      <pointLight
        position={[-2, floor.y + 3.5, 1]}
        color={floor.pointLightColor}
        intensity={floor.pointLightIntensity}
        distance={24}
        decay={1.5}
      />
      <directionalLight
        position={[-5, floor.y + 7, 5]}
        color="#fff4df"
        intensity={1.1}
      />
    </>
  );
}

function StairFlight({ stair, floorY, direction, color }) {
  const stepCount = 16;
  const stepDepth = 0.31;
  const stepRise = FLOOR_HEIGHT / stepCount;
  const verticalDirection = direction === 'up' ? 1 : -1;
  const outward = 1;
  const lightSteps = [0, 4, 8, 12];

  return (
    <group>
      {Array.from({ length: stepCount }, (_, index) => {
        const stepZ = stair.z + outward * (index + 0.5) * stepDepth;
        const stepY = floorY + verticalDirection * (index + 0.5) * stepRise;
        return (
          <group key={index}>
            <mesh position={[stair.x, stepY, stepZ]} castShadow receiveShadow>
              <boxGeometry args={[1.6, stepRise, stepDepth]} />
              <meshStandardMaterial color={index % 2 ? color : '#d7e4ed'} metalness={0.28} roughness={0.42} />
            </mesh>
            <mesh position={[stair.x, stepY + stepRise / 2 + 0.012, stepZ]} receiveShadow>
              <boxGeometry args={[1.62, 0.025, stepDepth + 0.02]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.68 * (1 - index / stepCount) ** 1.7 + 0.025}
                metalness={0.4}
                roughness={0.3}
              />
            </mesh>
          </group>
        );
      })}

      {lightSteps.map((index) => {
        const fade = 1 - index / (stepCount - 1);
        return (
          <pointLight
            key={`stair-light-${index}`}
            position={[
              stair.x,
              floorY + verticalDirection * (index + 0.5) * stepRise + 0.24,
              stair.z + (index + 0.5) * stepDepth,
            ]}
            color={color}
            intensity={4.5 * fade ** 1.8 + 0.08}
            distance={3.4}
            decay={2}
          />
        );
      })}

      {[-1, 1].map((side) => (
        <group key={side}>
          {Array.from({ length: stepCount }, (_, index) => (
            <mesh
              key={index}
              position={[
                stair.x + side * 0.84,
                floorY + verticalDirection * (index + 0.5) * stepRise + 0.35,
                stair.z + outward * (index + 0.5) * stepDepth,
              ]}
              castShadow
            >
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              <meshStandardMaterial color="#b7c9d6" metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
          <mesh
            position={[
              stair.x + side * 0.84,
              floorY + verticalDirection * FLOOR_HEIGHT / 2 + 0.35,
              stair.z + outward * stepCount * stepDepth / 2,
            ]}
            rotation={[-outward * verticalDirection * Math.atan2(stepRise, stepDepth), 0, 0]}
            castShadow
          >
            <boxGeometry args={[0.08, 0.08, stepCount * stepDepth]} />
            <meshStandardMaterial color="#d8e5ed" metalness={0.65} roughness={0.28} />
          </mesh>
        </group>
      ))}

    </group>
  );
}

// ─────────────────────────────────────────────
// BuildingFloor — geometry for one floor level
// ─────────────────────────────────────────────
function BuildingFloor({ floor }) {
  const { y, floorColor, ceilingColor, wallColor, accentColor, elevator, elevatorDown, panels, label } = floor;
  const wallThickness = 0.3;
  const roomSize = ROOM_SIZE;
  const halfRoom = roomSize / 2;
  const wallPattern = useMemo(() => createWallPatternTexture(accentColor), [accentColor]);
  const hasUpStairwell = Boolean(elevator);
  const hasDownStairwell = Boolean(elevatorDown);
  const southWallOpenings = [
    ...(hasUpStairwell ? [{ x: UP_STAIR_X, width: 1.9 }] : []),
    ...(hasDownStairwell ? [{ x: DOWN_STAIR_X, width: 1.9 }] : []),
  ].sort((a, b) => a.x - b.x);
  const southWallSegments = [];
  let wallStart = -halfRoom;
  southWallOpenings.forEach(({ x, width }) => {
    const openingStart = x - width / 2;
    const openingEnd = x + width / 2;
    if (openingStart > wallStart) southWallSegments.push([wallStart, openingStart]);
    wallStart = openingEnd;
  });
  if (wallStart < halfRoom) southWallSegments.push([wallStart, halfRoom]);
  useEffect(() => () => wallPattern.dispose(), [wallPattern]);
  const horizontalWallTrims = [
    { position: [0, y + 0.3, -halfRoom + wallThickness / 2], size: [roomSize - 0.5, 0.07, 0.08] },
    { position: [0, y + 3.7, -halfRoom + wallThickness / 2], size: [roomSize - 0.5, 0.07, 0.08] },
    { position: [0, y + 0.3, halfRoom - wallThickness / 2], size: [roomSize - 0.5, 0.07, 0.08] },
    { position: [0, y + 3.7, halfRoom - wallThickness / 2], size: [roomSize - 0.5, 0.07, 0.08] },
    { position: [-halfRoom + wallThickness / 2, y + 0.3, 0], size: [0.08, 0.07, roomSize - 0.5] },
    { position: [-halfRoom + wallThickness / 2, y + 3.7, 0], size: [0.08, 0.07, roomSize - 0.5] },
    { position: [halfRoom - wallThickness / 2, y + 0.3, 0], size: [0.08, 0.07, roomSize - 0.5] },
    { position: [halfRoom - wallThickness / 2, y + 3.7, 0], size: [0.08, 0.07, roomSize - 0.5] },
  ];
  const wallSlats = [
    ...[-6.1, 6.1].flatMap((x) => [
      [x, y + 2, -halfRoom + wallThickness / 2],
      [x, y + 2, halfRoom - wallThickness / 2],
    ]),
    ...[-5.8, 5.8].flatMap((z) => [
      [-halfRoom + wallThickness / 2, y + 2, z],
      [halfRoom - wallThickness / 2, y + 2, z],
    ]),
  ];

  return (
    <group>
      {/* Floor plane */}
      <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roomSize, roomSize]} />
        <meshStandardMaterial color={floorColor} roughness={0.8} />
      </mesh>

      {/* Ceiling plane */}
      <mesh position={[0, y + FLOOR_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomSize, roomSize]} />
        <meshStandardMaterial color={ceilingColor} roughness={0.9} />
      </mesh>

      {/* North wall (z = -halfRoom) */}
      <mesh position={[0, y + FLOOR_HEIGHT / 2, -halfRoom]} castShadow receiveShadow>
        <boxGeometry args={[roomSize, FLOOR_HEIGHT, wallThickness]} />
        <meshStandardMaterial color={wallColor} map={wallPattern} roughness={0.8} />
      </mesh>

      {/* South wall openings connect the room to staircases behind the wall. */}
      {southWallSegments.map(([start, end], index) => (
        <mesh
          key={index}
          position={[(start + end) / 2, y + FLOOR_HEIGHT / 2, halfRoom]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[end - start, FLOOR_HEIGHT, wallThickness]} />
          <meshStandardMaterial color={wallColor} map={wallPattern} roughness={0.8} />
        </mesh>
      ))}

      {/* West wall (x = -halfRoom) */}
      <mesh position={[-halfRoom, y + FLOOR_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, FLOOR_HEIGHT, roomSize]} />
        <meshStandardMaterial color={wallColor} map={wallPattern} roughness={0.8} />
      </mesh>

      {/* East wall (x = +halfRoom) */}
      <mesh position={[halfRoom, y + FLOOR_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, FLOOR_HEIGHT, roomSize]} />
        <meshStandardMaterial color={wallColor} map={wallPattern} roughness={0.8} />
      </mesh>

      {/* Corner pillars */}
      {[[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]].map(([px, pz], idx) => (
        <mesh key={idx} position={[px, y + FLOOR_HEIGHT / 2, pz]} castShadow>
          <boxGeometry args={[0.4, FLOOR_HEIGHT, 0.4]} />
          <meshStandardMaterial color={accentColor} metalness={0.2} roughness={0.6} />
        </mesh>
      ))}

      {/* Architectural trim and vertical accent slats */}
      {horizontalWallTrims.map((trim, index) => (
        <mesh key={`trim-${index}`} position={trim.position} castShadow>
          <boxGeometry args={trim.size} />
          <meshStandardMaterial
            color={index % 2 === 0 ? '#ffffff' : accentColor}
            emissive={index % 2 === 0 ? '#ffffff' : accentColor}
            emissiveIntensity={index % 2 === 0 ? 0.08 : 0.16}
            metalness={0.25}
            roughness={0.4}
          />
        </mesh>
      ))}
      {wallSlats.map((position, index) => (
        <mesh
          key={`slat-${index}`}
          position={position}
          castShadow
        >
          <boxGeometry args={[
            Math.abs(position[0]) > halfRoom - 1 ? 0.1 : 0.08,
            2.55,
            Math.abs(position[0]) > halfRoom - 1 ? 0.08 : 0.1,
          ]} />
          <meshStandardMaterial color={accentColor} metalness={0.35} roughness={0.38} />
        </mesh>
      ))}

      {/* Recessed soft-white ceiling lights */}
      {[-4.5, 0, 4.5].map((x) => (
        <group key={`ceiling-light-${x}`} position={[x, y + FLOOR_HEIGHT - 0.09, -2]}>
          <mesh>
            <boxGeometry args={[2.4, 0.08, 0.48]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#fff2d8"
              emissiveIntensity={0.75}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}

      {/* 3D staircases linking adjacent floors */}
      {elevator && (
        <StairFlight
          stair={{ ...elevator, x: UP_STAIR_X, z: STAIR_ENTRANCE_Z }}
          floorY={y}
          direction="up"
          color={accentColor}
        />
      )}
      {elevatorDown && (
        <StairFlight
          stair={{ ...elevatorDown, x: DOWN_STAIR_X, z: STAIR_ENTRANCE_Z }}
          floorY={y}
          direction="down"
          color="#65c9ff"
        />
      )}

      {/* Floor label floating in the centre */}
      <Text
        position={[0, y + 3.5, 0]}
        fontSize={0.35}
        color={accentColor}
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {label}
      </Text>

      {/* Info panels */}
      {panels.map((panel) => (
        <InfoPanel key={panel.id} panel={panel} floorY={y} />
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────
// PlayerController — FPS WASD + pointer lock
// Runs inside Canvas via useFrame
// ─────────────────────────────────────────────
function PlayerController({
  currentFloorIndex,
  onFloorChange,
  onPlayerState,
  onOpenPanelUrl,
  onNearbyPanelChange,
  isPanelOpen,
}) {
  const { camera, gl } = useThree();
  const currentFloorIndexRef = useRef(currentFloorIndex);
  const keysRef = useRef({});
  const isLockedRef = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const posRef = useRef(new Vector3(0, FLOORS[0].y + EYE_HEIGHT, 5));
  const lastTeleportRef = useRef(0);
  const stateBroadcastTime = useRef(0);
  const onPlayerStateRef = useRef(onPlayerState);
  const onOpenPanelUrlRef = useRef(onOpenPanelUrl);
  const onNearbyPanelChangeRef = useRef(onNearbyPanelChange);
  const isPanelOpenRef = useRef(isPanelOpen);
  const nearbyPanelIdRef = useRef(null);
  currentFloorIndexRef.current = currentFloorIndex;
  onPlayerStateRef.current = onPlayerState;
  onOpenPanelUrlRef.current = onOpenPanelUrl;
  onNearbyPanelChangeRef.current = onNearbyPanelChange;
  isPanelOpenRef.current = isPanelOpen;

  // Sync camera to initial position
  useEffect(() => {
    camera.position.copy(posRef.current);
  }, [camera]);

  // Keyboard listeners
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isPanelOpenRef.current) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyE' && !e.repeat) {
        const position = posRef.current;
        const floor = FLOORS[currentFloorIndexRef.current];
        const closestPanel = floor.panels
          .filter(isPanelInteractive)
          .map((panel) => ({
            panel,
            distance: Math.hypot(
              position.x - panel.x,
              position.y - (floor.y + panel.y),
              position.z - panel.z,
            ),
          }))
          .sort((a, b) => a.distance - b.distance)[0];

        if (closestPanel && closestPanel.distance <= PANEL_INTERACTION_DISTANCE) {
          e.preventDefault();
          onOpenPanelUrlRef.current?.({
            title: closestPanel.panel.title,
            url: getPanelUrl(closestPanel.panel),
            gallery: closestPanel.panel.gallery,
          });
        }
      }
      keysRef.current[e.code] = true;
    };
    const onKeyUp = (e) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Pointer lock listeners
  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => {
      if (!isLockedRef.current) {
        canvas.requestPointerLock();
      }
    };

    const onPointerLockChange = () => {
      isLockedRef.current = document.pointerLockElement === canvas;
    };

    const onPointerLockError = () => {
      isLockedRef.current = false;
    };

    const onMouseMove = (e) => {
      if (!isLockedRef.current) return;
      yawRef.current -= e.movementX * MOUSE_SENSITIVITY;
      pitchRef.current -= e.movementY * MOUSE_SENSITIVITY;
      pitchRef.current = MathUtils.clamp(pitchRef.current, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    };

    canvas.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    document.addEventListener('mousemove', onMouseMove);

    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
      document.removeEventListener('mousemove', onMouseMove);
      // Release pointer lock on unmount
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    };
  }, [gl]);

  useEffect(() => {
    if (isPanelOpen) keysRef.current = {};
  }, [isPanelOpen]);

  useFrame((_, delta) => {
    if (isPanelOpen) return;
    const floor = FLOORS[currentFloorIndex];
    const floorY = floor.y + EYE_HEIGHT;

    // Movement direction from yaw
    const keys = keysRef.current;
    const moveForward = keys['KeyW'] || keys['ArrowUp'] ? 1 : 0;
    const moveBack = keys['KeyS'] || keys['ArrowDown'] ? 1 : 0;
    const moveLeft = keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0;
    const moveRight = keys['KeyD'] || keys['ArrowRight'] ? 1 : 0;

    const dx = Math.sin(yawRef.current);
    const dz = Math.cos(yawRef.current);

    // right vector = (dz, -dx); left = negate right
    const moveX = (-dx * moveForward + dx * moveBack - dz * moveLeft + dz * moveRight);
    const moveZ = (-dz * moveForward + dz * moveBack + dx * moveLeft - dx * moveRight);

    const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
    const pos = posRef.current;

    if (length > 0) {
      const norm = 1 / length;
      pos.x += moveX * norm * MOVE_SPEED * delta;
      pos.z += moveZ * norm * MOVE_SPEED * delta;
    }

    // Clamp to room bounds
    pos.x = MathUtils.clamp(pos.x, -ROOM_HALF + 0.5, ROOM_HALF - 0.5);
    pos.z = MathUtils.clamp(pos.z, -ROOM_HALF + 0.5, ROOM_HALF - 0.5);

    // Snap Y to current floor eye height
    pos.y = floorY;

    const nearestPanel = floor.panels
      .filter(isPanelInteractive)
      .map((panel) => ({
        panel,
        distance: Math.hypot(
          pos.x - panel.x,
          pos.y - (floor.y + panel.y),
          pos.z - panel.z,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    const nearbyPanel = nearestPanel && nearestPanel.distance <= PANEL_INTERACTION_DISTANCE
      ? { id: nearestPanel.panel.id, title: nearestPanel.panel.title }
      : null;
    if (nearbyPanel?.id !== nearbyPanelIdRef.current) {
      nearbyPanelIdRef.current = nearbyPanel?.id ?? null;
      onNearbyPanelChangeRef.current?.(nearbyPanel);
    }

    // Stair trigger check
    const stairs = [
      floor.elevator && { ...floor.elevator, x: UP_STAIR_X, z: STAIR_ENTRANCE_Z },
      floor.elevatorDown && { ...floor.elevatorDown, x: DOWN_STAIR_X, z: STAIR_ENTRANCE_Z },
    ].filter(Boolean);
    const now = Date.now();
    if (now - lastTeleportRef.current > TELEPORT_COOLDOWN) {
      for (const stair of stairs) {
        const distToStair = Math.sqrt((pos.x - stair.x) ** 2 + (pos.z - stair.z) ** 2);
        if (distToStair >= ELEVATOR_TRIGGER_DIST) continue;
        const nextFloorId = stair.toFloorId;
        const nextFloorIndex = FLOORS.findIndex((f) => f.id === nextFloorId);
        if (nextFloorIndex !== -1) {
          lastTeleportRef.current = now;
          const nextFloor = FLOORS[nextFloorIndex];
          pos.set(stair.x, nextFloor.y + EYE_HEIGHT, STAIR_ARRIVAL_Z);
          yawRef.current = 0;
          pitchRef.current = 0;
          onFloorChange(nextFloorIndex);
          break;
        }
      }
    }

    // Apply to camera
    camera.position.copy(pos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

    // Broadcast player state to peers (~20Hz)
    stateBroadcastTime.current += delta;
    if (stateBroadcastTime.current >= 0.05) {
      stateBroadcastTime.current = 0;
      const isMoving = (moveForward + moveBack + moveLeft + moveRight) > 0;
      onPlayerStateRef.current?.({
        position: { x: pos.x, z: pos.z },
        direction: { x: -Math.sin(yawRef.current), z: -Math.cos(yawRef.current) },
        isMoving,
        isSitting: false,
      });
    }
  });

  return null;
}

// ─────────────────────────────────────────────
// SabitechWorld — inner scene
// ─────────────────────────────────────────────
function SabitechWorld() {
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);

  const handleFloorChange = useCallback((index) => {
    setCurrentFloorIndex(index);
  }, []);

  const currentFloor = FLOORS[currentFloorIndex];

  return (
    <>
      {/* Per-floor lighting for current floor only */}
      <FloorLighting floor={currentFloor} />

      {/* All 5 floor geometries visible at once */}
      {FLOORS.map((floor) => (
        <BuildingFloor key={floor.id} floor={floor} />
      ))}

      {/* FPS Player controller */}
      <PlayerController
        currentFloorIndex={currentFloorIndex}
        onFloorChange={handleFloorChange}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// SabitechScene — default export, owns Canvas
// ─────────────────────────────────────────────
export default function SabitechScene({ playerName = '', peers = [], onPlayerState }) {
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);
  const [nearbyPanel, setNearbyPanel] = useState(null);
  const [openPanel, setOpenPanel] = useState(null);
  const currentFloor = FLOORS[currentFloorIndex];

  // We track floor index at this level too, for the HUD label.
  // PlayerController notifies via onFloorChange which bubbles up.
  // Since PlayerController is inside Canvas, we share state via a ref-callback trick:
  // we store setCurrentFloorIndex in a ref accessible to the inner world.
  const setFloorIndexRef = useRef(setCurrentFloorIndex);
  setFloorIndexRef.current = setCurrentFloorIndex;
  const handleOpenPanelUrl = useCallback((panel) => {
    if (document.pointerLockElement) document.exitPointerLock();
    setOpenPanel(panel);
  }, []);

  useEffect(() => {
    if (!openPanel) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenPanel(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openPanel]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        background: '#000',
      }}
    >
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 200, position: [0, FLOORS[0].y + EYE_HEIGHT, 5] }}
        dpr={[1, 1.5]}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <SabitechWorldWithCallback
            setFloorIndexRef={setFloorIndexRef}
            peers={peers}
            onPlayerState={onPlayerState}
            onOpenPanelUrl={handleOpenPanelUrl}
            onNearbyPanelChange={setNearbyPanel}
            isPanelOpen={Boolean(openPanel)}
          />
        </Suspense>
      </Canvas>
      <HUD
        floorLabel={`Tầng ${currentFloorIndex + 1}: ${currentFloor.label}`}
        playerName={playerName}
        nearbyPanel={nearbyPanel}
      />
      {openPanel && (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="sabitech-web-panel-title"
          style={{
            position: 'fixed',
            inset: '6vh 6vw',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.72)',
            borderRadius: 16,
            background: 'rgba(247,250,253,0.98)',
            boxShadow: '0 24px 80px rgba(14,31,48,0.38)',
          }}
        >
          <header style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '12px 16px',
            color: '#20364a',
            font: '600 14px system-ui, sans-serif',
          }}>
            <strong id="sabitech-web-panel-title" style={{ flex: 1 }}>
              {openPanel.selectedItem?.title || openPanel.title}
            </strong>
            {openPanel.selectedItem && (
              <button
                type="button"
                onClick={() => setOpenPanel((panel) => ({ ...panel, selectedItem: null }))}
                style={{
                  border: 0,
                  borderRadius: 8,
                  padding: '7px 11px',
                  background: '#e5edf4',
                  color: '#20364a',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                Quay lại thư viện
              </button>
            )}
            {(openPanel.selectedItem?.url || openPanel.url) && (
              <a
                href={openPanel.selectedItem?.url || openPanel.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#315f86', fontSize: 12 }}
              >
                Mở tab mới
              </a>
            )}
            <button
              type="button"
              onClick={() => setOpenPanel(null)}
              aria-label="Đóng trang web"
              style={{
                border: 0,
                borderRadius: 8,
                padding: '7px 11px',
                background: '#e5edf4',
                color: '#20364a',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Đóng (Esc)
            </button>
          </header>
          {openPanel.gallery && !openPanel.selectedItem ? (
            <GalleryContent
              galleryId={openPanel.gallery}
              onOpenItem={(item) => setOpenPanel((panel) => ({ ...panel, selectedItem: item }))}
            />
          ) : openPanel.selectedItem ? (
            <GalleryItemDetail item={openPanel.selectedItem} />
          ) : (
            <ExternalPageNotice title={openPanel.title} url={openPanel.url} />
          )}
        </section>
      )}
    </div>
  );
}

// Inner world that fires setFloorIndex callback outward for HUD sync
function SabitechWorldWithCallback({
  setFloorIndexRef,
  peers,
  onPlayerState,
  onOpenPanelUrl,
  onNearbyPanelChange,
  isPanelOpen,
}) {
  const [currentFloorIndex, setCurrentFloorIndex] = useState(0);

  const handleFloorChange = useCallback((index) => {
    setCurrentFloorIndex(index);
    // Also notify the outer component for HUD
    if (setFloorIndexRef.current) setFloorIndexRef.current(index);
  }, [setFloorIndexRef]);

  const currentFloor = FLOORS[currentFloorIndex];

  return (
    <>
      <FloorLighting floor={currentFloor} />
      {FLOORS.map((floor) => (
        <BuildingFloor key={floor.id} floor={floor} />
      ))}
      <PlayerController
        currentFloorIndex={currentFloorIndex}
        onFloorChange={handleFloorChange}
        onPlayerState={onPlayerState}
        onOpenPanelUrl={onOpenPanelUrl}
        onNearbyPanelChange={onNearbyPanelChange}
        isPanelOpen={isPanelOpen}
      />
      {/* Remote players */}
      {peers.map((player) => (
        <Character
          key={player.peerId}
          name={player.name}
          position={player.position ?? { x: 0, z: 0 }}
          direction={player.direction ?? { x: 0, z: 1 }}
          isMoving={player.isMoving ?? false}
          isSitting={player.isSitting ?? false}
          avatar={player.avatar ?? DEFAULT_AVATAR}
          stream={player.mediaStream}
          hasAudio={player.hasAudio}
          hasVideo={player.hasVideo}
          remote
        />
      ))}
    </>
  );
}
