import { useEffect, useState } from 'react';

export default function TeamGamePanel({ game, isLeader, connectedPlayers, p2pReadyPlayers, onConfigure, onStart, onReset }) {
  const [playerCount, setPlayerCount] = useState(String(game.playerCount || connectedPlayers));
  const [teamCount, setTeamCount] = useState(String(game.teamCount || 2));

  useEffect(() => {
    setPlayerCount(String(game.playerCount || connectedPlayers));
    setTeamCount(String(game.teamCount || 2));
  }, [connectedPlayers, game.playerCount, game.teamCount]);

  const expectedPlayers = Number(playerCount);
  const teams = Number(teamCount);
  const validSetup = Number.isInteger(expectedPlayers) && expectedPlayers >= 2 && expectedPlayers <= 20
    && Number.isInteger(teams) && teams >= 2 && teams <= 10
    && teams <= expectedPlayers && expectedPlayers % teams === 0;
  const hasMatchingRoom = game.playerCount > 0 && game.playerCount === connectedPlayers;
  const assignedPlayers = (game.players || []).filter((player) => player.teamId);

  return (
    <section className="team-panel" aria-label="Trò chơi chia team">
      <header className="team-panel__header">
        <span className="team-panel__eyebrow">SĂN BÀI CHIA ĐỘI</span>
        <strong>{game.phase === 'collecting' ? 'Bắt bài đang bay!' : game.phase === 'finished' ? 'Chia đội hoàn tất' : 'Thiết lập đội'}</strong>
        {game.phase === 'collecting' && <span>{assignedPlayers.length}/{game.playerCount}</span>}
      </header>

      {game.phase === 'lobby' && isLeader && (
        <div className="team-panel__setup">
          <label>
            Số người chơi
            <input type="number" min="2" max="20" value={playerCount} onChange={(event) => setPlayerCount(event.target.value)} />
          </label>
          <label>
            Số team
            <input type="number" min="2" max="10" value={teamCount} onChange={(event) => setTeamCount(event.target.value)} />
          </label>
          <button type="button" disabled={!validSetup} onClick={() => onConfigure(expectedPlayers, teams)}>Xác nhận cấu hình</button>
          {game.playerCount > 0 && (
            <>
              <p className="team-panel__hint">
                Mỗi team có {game.playerCount / game.teamCount} người. Trong phòng: {connectedPlayers}/{game.playerCount}.
              </p>
              <button type="button" className="team-panel__start" disabled={!hasMatchingRoom || p2pReadyPlayers !== connectedPlayers} onClick={onStart}>
                Bắt đầu săn bài
              </button>
              {!hasMatchingRoom && <p className="team-panel__hint">Cần đúng số người chơi đã cấu hình trước khi bắt đầu.</p>}
              {hasMatchingRoom && p2pReadyPlayers !== connectedPlayers && <p className="team-panel__hint">Đang chờ kết nối P2P đến tất cả người chơi.</p>}
            </>
          )}
          {!validSetup && <p className="team-panel__error">Số người chơi phải chia đều cho số team.</p>}
        </div>
      )}

      {game.phase === 'lobby' && !isLeader && (
        <p className="team-panel__hint">Chờ trưởng phòng cấu hình số người, số team và bắt đầu.</p>
      )}

      {game.phase === 'collecting' && (
        <>
          <p className="team-panel__hint">Chạy đến những lá bài đang bay để bắt một lá. Lá bài quyết định team của bạn!</p>
          <p className="team-panel__hint">{assignedPlayers.length}/{game.playerCount} người đã bắt được bài.</p>
        </>
      )}

      {game.phase === 'finished' && isLeader && (
        <>
          <p className="team-panel__hint">Tất cả người chơi đã nhận team.</p>
          <button type="button" onClick={onReset}>Tạo lượt chia team mới</button>
        </>
      )}

      {game.players?.length > 0 && (
        <ul className="team-panel__players" aria-label="Danh sách team">
          {game.players.map((player) => (
            <li key={player.peerId} className={player.teamId ? 'is-assigned' : ''}>
              <span>{player.name}</span>
              <strong>{player.teamId ? `Team ${player.teamId.replace('team-', '')}` : game.phase === 'lobby' ? 'Chờ bắt đầu' : 'Đang tìm bài'}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
