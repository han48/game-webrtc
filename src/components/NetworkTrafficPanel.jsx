import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';

function nodePosition(index) {
  return {
    x: index % 2 === 0 ? 55 : 305,
    y: 34 + Math.floor(index / 2) * 56,
  };
}

function routePath(start, end) {
  const midpoint = (start.x + end.x) / 2;
  return `M ${start.x} ${start.y} Q ${midpoint} ${start.y} ${end.x} ${end.y}`;
}

function PacketDot({ event, route, start, end, color, begin = '0s' }) {
  const path = routePath(start, end);
  return [0, 1, 2].map((index) => (
    <circle
      key={`${event.id}-${route}-${index}`}
      className="network-traffic-panel__packet"
      r={index === 0 ? 4 : 2.5}
      fill={color}
      style={{ color }}
      aria-hidden="true"
    >
      <animateMotion
        path={path}
        dur="0.46s"
        begin={`${begin === '0s' ? 0 : 0.46 + index * 0.12}s`}
        fill="freeze"
      />
    </circle>
  ));
}

export default function NetworkTrafficPanel({
  displayName,
  localPeerId,
  peers,
  events,
}) {
  const [, setClock] = useState(Date.now());
  const [geometry, setGeometry] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const interactionRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 400);
    return () => window.clearInterval(timer);
  }, []);

  const handlePointerDown = (event, mode) => {
    if (event.button !== 0 || (mode === 'drag' && event.target.closest('button'))) return;
    const bounds = panelRef.current.getBoundingClientRect();
    interactionRef.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const dx = event.clientX - interaction.pointerX;
    const dy = event.clientY - interaction.pointerY;
    const margin = 8;
    if (interaction.mode === 'drag') {
      setGeometry((current) => ({
        left: Math.max(margin, Math.min(window.innerWidth - margin - interaction.width, interaction.left + dx)),
        top: Math.max(margin, Math.min(window.innerHeight - margin - interaction.height, interaction.top + dy)),
        width: current?.width,
        height: current?.height,
      }));
      return;
    }
    setGeometry((current) => ({
      left: current?.left ?? interaction.left,
      top: current?.top ?? interaction.top,
      width: Math.min(
        window.innerWidth - interaction.left - margin,
        Math.max(Math.min(280, window.innerWidth - 24), interaction.width + dx),
      ),
      height: Math.min(
        window.innerHeight - interaction.top - margin,
        Math.max(Math.min(260, window.innerHeight - 24), interaction.height + dy),
      ),
    }));
  };

  const stopPointerInteraction = () => {
    if (interactionRef.current) {
    interactionRef.current = null;
    }
  };

  const rows = Math.max(1, Math.ceil(peers.length / 2));
  const height = rows * 56 + 28;
  const leaderPosition = { x: 180, y: height / 2 };
  const positions = new Map(peers.map((peer, index) => [peer.peerId, nodePosition(index)]));
  const activeEvents = events.filter((event) => Date.now() - event.timestamp < 1100).slice(0, 8);
  const activePeerIds = new Set(activeEvents.flatMap((event) => [event.fromPeerId, ...event.toPeerIds]));
  const connectedCount = peers.filter((peer) => peer.dataChannelOpen).length;

  return (
    <section
      ref={panelRef}
      className={`network-traffic-panel${collapsed ? ' is-collapsed' : ''}`}
      aria-label="Luồng dữ liệu P2P"
      style={geometry ? {
        left: `${geometry.left}px`,
        top: `${geometry.top}px`,
        right: 'auto',
        width: !collapsed && geometry.width ? `${geometry.width}px` : undefined,
        height: !collapsed && geometry.height ? `${geometry.height}px` : undefined,
      } : undefined}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPointerInteraction}
      onPointerCancel={stopPointerInteraction}
    >
      <header
        className="network-traffic-panel__header"
        onPointerDown={(event) => handlePointerDown(event, 'drag')}
        title="Kéo để di chuyển khung"
      >
        <span className="network-traffic-panel__eyebrow">LIVE · LEADER RELAY</span>
        <strong>Luồng dữ liệu</strong>
        <span className="network-traffic-panel__status">
          <i aria-hidden="true" />
          {connectedCount}/{peers.length} P2P
        </span>
        <button
          type="button"
          className="network-traffic-panel__collapse"
          aria-label={collapsed ? 'Mở rộng khung network' : 'Thu gọn khung network'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Mở rộng network' : 'Thu gọn network'}
          onClick={() => setCollapsed((value) => !value)}
        >
          <FontAwesomeIcon icon={collapsed ? faPlus : faMinus} aria-hidden="true" />
        </button>
      </header>

      {!collapsed && <>
      <div className="network-traffic-panel__graph">
        <svg
          viewBox={`0 0 360 ${height}`}
          role="img"
          aria-label="Sơ đồ P2P: người dùng gửi dữ liệu tới trưởng phòng, sau đó trưởng phòng chuyển tiếp tới các người dùng khác."
        >
          {peers.map((peer) => {
            const position = positions.get(peer.peerId);
            const isActive = activePeerIds.has(peer.peerId);
            const isIncoming = activeEvents.some((event) => event.fromPeerId === peer.peerId);
            const isOutgoing = activeEvents.some((event) => event.toPeerIds.includes(peer.peerId));
            return (
              <line
                key={`link-${peer.peerId}`}
                x1={position.x}
                y1={position.y}
                x2={leaderPosition.x}
                y2={leaderPosition.y}
                className={[
                  'network-traffic-panel__link',
                  peer.dataChannelOpen ? 'is-connected' : peer.connectionState === 'failed' ? 'is-failed' : 'is-connecting',
                  isActive ? 'is-active' : '',
                  isIncoming ? 'is-incoming' : '',
                  isOutgoing ? 'is-outgoing' : '',
                ].filter(Boolean).join(' ')}
              />
            );
          })}
          {activeEvents.map((event) => {
            const origin = event.fromPeerId === localPeerId
              ? leaderPosition
              : positions.get(event.fromPeerId);
            if (!origin) return null;
            return (
              <g key={`packets-${event.id}`}>
                {event.fromPeerId !== localPeerId && (
                  <g>
                    <PacketDot event={event} route="incoming" start={origin} end={leaderPosition} color="#a8ed69" />
                  </g>
                )}
                {event.toPeerIds.map((peerId) => {
                  const destination = positions.get(peerId);
                  return destination ? (
                    <g key={`${event.id}-${peerId}`}>
                      <PacketDot
                        event={event}
                        route={`outgoing-${peerId}`}
                        start={leaderPosition}
                        end={destination}
                        color="#c8a8ff"
                        begin={event.fromPeerId === localPeerId ? '0s' : '0.46s'}
                      />
                    </g>
                  ) : null;
                })}
              </g>
            );
          })}
          {peers.map((peer, index) => {
            const position = positions.get(peer.peerId);
            const shortName = peer.name.length > 12 ? `${peer.name.slice(0, 11)}…` : peer.name;
            return (
              <g
                key={peer.peerId}
                className={[
                  'network-traffic-panel__peer',
                  peer.dataChannelOpen ? 'is-connected' : peer.connectionState === 'failed' ? 'is-failed' : 'is-connecting',
                  activePeerIds.has(peer.peerId) ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
              >
                {activePeerIds.has(peer.peerId) && <circle className="network-traffic-panel__pulse" cx={position.x} cy={position.y} r="19" />}
                <circle cx={position.x} cy={position.y} r="13" />
                <text x={position.x} y={position.y + 3}>{index + 1}</text>
                <text x={position.x} y={position.y + 25} className="network-traffic-panel__name">
                  {shortName}
                </text>
              </g>
            );
          })}
          <g className="network-traffic-panel__leader">
            <circle cx={leaderPosition.x} cy={leaderPosition.y} r="18" />
            <text x={leaderPosition.x} y={leaderPosition.y + 4}>HOST</text>
            <text x={leaderPosition.x} y={leaderPosition.y + 31} className="network-traffic-panel__name">
              {displayName.length > 12 ? `${displayName.slice(0, 11)}…` : displayName}
            </text>
          </g>
        </svg>
      </div>

      <div className="network-traffic-panel__legend">
        <span><i className="is-connecting" /> Đang nối</span>
        <span><i className="is-connected" /> Đã nối</span>
        <span><i className="is-incoming" /> User → Host</span>
        <span><i className="is-outgoing" /> Host → Users</span>
      </div>

      <ol className="network-traffic-panel__log" aria-live="polite" aria-label="Gói dữ liệu gần đây">
        {events.slice(0, 6).map((event) => {
          const source = event.fromPeerId === localPeerId ? 'Trưởng phòng' : event.fromName;
          const destinations = event.toNames.length
            ? event.toNames.join(', ')
            : 'chưa có kênh nhận mở';
          const route = event.fromPeerId === localPeerId
            ? `Trưởng phòng → ${destinations}`
            : `${source} → Trưởng phòng → ${destinations}`;
          return (
            <li key={event.id} className={event.payloadType.startsWith('media-') ? 'is-media' : ''}>
              <small>{route} · {new Date(event.timestamp).toLocaleTimeString()}</small>
              <span>{event.summary}</span>
            </li>
          );
        })}
        {events.length === 0 && <li className="is-empty">Đang chờ dữ liệu từ các user...</li>}
      </ol>
      <button
        type="button"
        className="network-traffic-panel__resize-handle"
        aria-label="Đổi kích thước khung network"
        title="Kéo để đổi kích thước"
        onPointerDown={(event) => handlePointerDown(event, 'resize')}
      />
      </>}
    </section>
  );
}
