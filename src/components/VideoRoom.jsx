import { useEffect, useRef, useState } from 'react';

function VideoTile({ name, stream, videoEnabled, local = false }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const hasVideo = videoEnabled && stream?.getVideoTracks().length > 0;

  useEffect(() => {
    if (!videoRef.current || !hasVideo) return undefined;
    videoRef.current.srcObject = stream || null;
    if (stream) videoRef.current.play().catch(() => {});
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [hasVideo, stream]);

  useEffect(() => {
    if (local || !stream?.getAudioTracks().length || !audioRef.current) return undefined;
    audioRef.current.srcObject = stream;
    audioRef.current.play().catch(() => {});
    return () => {
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [local, stream]);

  return (
    <article className="video-room-tile">
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted className="video-room-feed" />
      ) : (
        <div className="video-room-placeholder">
          <span className="video-room-avatar">{name.trim().slice(0, 1).toUpperCase()}</span>
          <strong>{name}</strong>
          <small>{stream ? 'Camera đang tắt' : 'Đang chờ video'}</small>
        </div>
      )}
      {!local && <audio ref={audioRef} autoPlay />}
      <div className="video-room-name">{name}{local ? ' · Bạn' : ''}</div>
    </article>
  );
}

const VIDEO_GAMES = [
  { type: 'caro', label: 'Cờ Ca Rô', pvp: true, icon: '⭕', sub: 'Gomoku · 5 quân thắng' },
  { type: 'chess', label: 'Cờ Vua', pvp: true, icon: '♟', sub: 'Chess · cổ điển' },
  { type: 'xiangqi', label: 'Cờ Tướng', pvp: true, icon: '將', sub: 'Xiangqi · cờ Trung Hoa' },
  { type: 'dongtay', label: 'Cờ Đông Tây', pvp: true, icon: '⚔', sub: 'Vua đấu Tướng' },
  { type: 'xiangqi-up', label: 'Cờ Tướng Úp', pvp: false, icon: '🀫', sub: 'Quân úp · may rủi' },
  { type: 'chess-up', label: 'Cờ Vua Úp', pvp: false, icon: '🂠', sub: 'Chess úp · may rủi' },
  { type: 'dongtay-up', label: 'Cờ Đông Tây Úp', pvp: false, icon: '🎴', sub: 'Đông Tây · quân úp' },
  { type: 'battleship', label: 'Bắn Tàu', pvp: false, icon: '⚓', sub: 'Battleship · đánh chìm hạm đội' },
];

const BOT_LEVELS = ['Dễ', 'Trung bình', 'Khó'];
const DEFAULT_LEVEL = 'Khó'; // default to the highest difficulty
const BOT_LEVEL_META = {
  'Dễ': { icon: '🙂', hint: 'Người mới' },
  'Trung bình': { icon: '😎', hint: 'Cân bằng' },
  'Khó': { icon: '🔥', hint: 'Thử thách' },
};
const TIME_OPTIONS = [
  { value: 15, label: '15 giây' },
  { value: 30, label: '30 giây' },
  { value: 60, label: '60 giây' },
  { value: 120, label: '120 giây' },
  { value: 0, label: 'Tắt' },
];
const DEFAULT_TIME_LIMIT = 30;
const TOTAL_TIME_OPTIONS = [
  { value: 300, label: '5 phút' },
  { value: 600, label: '10 phút' },
  { value: 900, label: '15 phút' },
  { value: 1800, label: '30 phút' },
];
const DEFAULT_TOTAL_TIME = 900;

export default function VideoRoom({
  inRoom, roomId, displayName, localMediaStream, videoEnabled, peers, roomType, onStartGame,
  localPeerId, onInviteChess, chessMatch,
}) {
  // Per-game chosen opponent: 'bot:Dễ' | 'bot:Trung bình' | 'bot:Khó' | `peer:<id>`.
  const [opponent, setOpponent] = useState({});
  // Per-game think-time settings (both run in parallel).
  const [timeLimits, setTimeLimits] = useState({}); // type -> seconds per move
  const [totalTimes, setTotalTimes] = useState({}); // type -> total bank seconds
  const [invitePeer, setInvitePeer] = useState(null); // peerId being invited via the quick button
  if (!inRoom) return null;

  const participants = peers.length + 1;
  const showGames = onStartGame && roomType === 'chess-room';
  const canInvite = typeof onInviteChess === 'function' && !chessMatch;

  const startGame = (game) => {
    const choice = opponent[game.type] || `bot:${DEFAULT_LEVEL}`;
    const timeLimit = timeLimits[game.type] ?? DEFAULT_TIME_LIMIT;
    const totalTime = totalTimes[game.type] ?? DEFAULT_TOTAL_TIME;
    if (choice.startsWith('peer:')) {
      const peerId = choice.slice(5);
      if (canInvite) onInviteChess(peerId, game.type);
      return;
    }
    const difficulty = choice.slice(4); // after 'bot:'
    onStartGame(game.type, game.label, difficulty, timeLimit, totalTime);
  };

  return (
    <main className="video-room-mode">
      <header className="video-room-heading">
      </header>

      {showGames && (
        <div className="chess-lobby" role="group" aria-label="Sảnh chơi cờ">
          <div className="chess-lobby__head">
            <span className="chess-lobby__title">♟ Sảnh chơi cờ</span>
            <span className="chess-lobby__sub">Chọn loại cờ và đối thủ để bắt đầu</span>
          </div>
          <div className="chess-lobby__grid">
            {VIDEO_GAMES.map((game) => {
              const choice = opponent[game.type] || `bot:${DEFAULT_LEVEL}`;
              const isPeerChoice = choice.startsWith('peer:');
              const selectedLevel = isPeerChoice ? null : choice.slice(4);
              const availablePeers = (game.pvp && canInvite) ? peers : [];
              const setChoice = (val) => setOpponent((o) => ({ ...o, [game.type]: val }));
              const perMove = timeLimits[game.type] ?? DEFAULT_TIME_LIMIT;
              const total = totalTimes[game.type] ?? DEFAULT_TOTAL_TIME;
              return (
                <article key={game.type} className="chess-card">
                  <div className="chess-card__banner" aria-hidden="true">
                    <span className="chess-card__icon">{game.icon}</span>
                  </div>
                  <div className="chess-card__body">
                    <h3 className="chess-card__name">{game.label}</h3>
                    <p className="chess-card__sub">{game.sub}</p>

                    <span className="chess-card__section-label">Đối thủ máy</span>
                    <div className="chess-card__chips" role="radiogroup" aria-label={`Độ khó bot cho ${game.label}`}>
                      {BOT_LEVELS.map((lv) => {
                        const meta = BOT_LEVEL_META[lv];
                        const active = !isPeerChoice && selectedLevel === lv;
                        return (
                          <button
                            key={lv}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            className={`chess-chip${active ? ' is-active' : ''}`}
                            onClick={() => setChoice(`bot:${lv}`)}
                            title={meta.hint}
                          >
                            <span className="chess-chip__icon">{meta.icon}</span>
                            {lv}
                          </button>
                        );
                      })}
                    </div>

                    {availablePeers.length > 0 && (
                      <>
                        <span className="chess-card__section-label">Hoặc mời người chơi</span>
                        <div className="chess-card__peers">
                          {availablePeers.map((p) => {
                            const val = `peer:${p.peerId}`;
                            const active = choice === val;
                            return (
                              <button
                                key={p.peerId}
                                type="button"
                                className={`chess-peer-chip${active ? ' is-active' : ''}`}
                                onClick={() => setChoice(val)}
                                title={`Mời ${p.name}`}
                              >
                                <span className="chess-peer-chip__avatar">
                                  {p.name.trim().slice(0, 1).toUpperCase()}
                                </span>
                                {p.name}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    <span className="chess-card__section-label">Thời gian suy nghĩ</span>                    <div className="chess-card__time-row">
                      <span className="chess-card__time-tag" title="Giới hạn thời gian cho mỗi nước đi">Mỗi nước</span>
                      <select
                        className="chess-card__time-select"
                        value={perMove}
                        onChange={(e) => setTimeLimits((t) => ({ ...t, [game.type]: Number(e.target.value) }))}
                        aria-label={`Thời gian mỗi nước cho ${game.label}`}
                      >
                        {TIME_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="chess-card__time-row">
                      <span className="chess-card__time-tag" title="Tổng quỹ thời gian cho mỗi bên; hết quỹ là thua">Tổng</span>
                      <select
                        className="chess-card__time-select"
                        value={total}
                        onChange={(e) => setTotalTimes((t) => ({ ...t, [game.type]: Number(e.target.value) }))}
                        aria-label={`Tổng thời gian cho ${game.label}`}
                      >
                        {TOTAL_TIME_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className="chess-card__play"
                      onClick={() => startGame(game)}
                      title={`Bắt đầu ${game.label}`}
                    >
                      {isPeerChoice ? '✉ Mời đấu' : '▶ Chơi ngay'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="video-room-grid">
        <VideoTile
          name={displayName || 'Bạn'}
          stream={localMediaStream}
          videoEnabled={videoEnabled}
          local
        />
        {peers.map((peer) => (
          <div key={peer.peerId} className="video-room-peer">
            <VideoTile
              name={peer.name}
              stream={peer.mediaStream}
              videoEnabled={peer.hasVideo}
            />
            {canInvite && (
              <div className="video-room-invite">
                {invitePeer === peer.peerId ? (
                  <div className="video-room-invite__games" role="group" aria-label={`Mời ${peer.name} đánh cờ`}>
                    {VIDEO_GAMES.filter((g) => g.pvp).map((g) => (
                      <button
                        key={g.type}
                        type="button"
                        className="video-room-invite__game"
                        onClick={() => { onInviteChess(peer.peerId, g.type); setInvitePeer(null); }}
                      >
                        {g.label}
                      </button>
                    ))}
                    <button type="button" className="video-room-invite__cancel" onClick={() => setInvitePeer(null)}>Hủy</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="video-room-invite__btn"
                    onClick={() => setInvitePeer(peer.peerId)}
                    title={`Mời ${peer.name} đánh cờ`}
                  >
                    ♟ Mời đánh cờ
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
