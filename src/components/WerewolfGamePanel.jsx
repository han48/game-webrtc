import { useEffect, useState } from 'react';

const roleNames = {
  werewolf: 'Ma Sói',
  seer: 'Tiên Tri',
  guard: 'Bảo Vệ',
  witch: 'Phù Thủy',
  villager: 'Dân Làng',
};

const phaseNames = {
  lobby: 'Sảnh hội đồng',
  collecting: 'Cướp bài',
  night: 'Ban đêm',
  discussion: 'Thảo luận',
  vote: 'Bỏ phiếu',
  revote: 'Bỏ phiếu lại',
  finished: 'Kết thúc',
};

export default function WerewolfGamePanel({
  game,
  localPeerId,
  isLeader,
  canPray,
  onJoin,
  onLeave,
  onPray,
  onAction,
}) {
  const [targetId, setTargetId] = useState('');
  const [poisonTargetId, setPoisonTargetId] = useState('');
  const [savePotion, setSavePotion] = useState(false);
  const [poisonPotion, setPoisonPotion] = useState(false);
  const [now, setNow] = useState(Date.now());
  const players = game.players || [];
  const ownPlayer = players.find((player) => player.peerId === localPeerId);
  const joined = Boolean(ownPlayer);
  const aliveTargets = players.filter((player) => player.alive && player.peerId !== localPeerId);
  const voteTargets = aliveTargets.filter((player) => game.phase !== 'revote' || game.tieIds?.includes(player.peerId));
  const cardCount = players.filter((player) => player.hasCard).length;
  const secondsLeft = game.endsAt ? Math.max(0, Math.ceil((game.endsAt - now) / 1000)) : 0;
  const canAct = ownPlayer?.alive && game.phase === 'night' && ownPlayer.role === game.nightStage;
  const canVote = ownPlayer?.alive && ['vote', 'revote'].includes(game.phase);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setTargetId('');
    setPoisonTargetId('');
    setSavePotion(false);
    setPoisonPotion(false);
  }, [game.phase, game.nightStage]);

  const submitAction = () => {
    if (game.nightStage === 'witch') {
      onAction('night-action', {
        save: savePotion,
        poison: poisonPotion,
        poisonTargetId,
      });
    } else if (targetId) {
      onAction('night-action', { targetId });
    }
  };

  const submitVote = () => {
    if (targetId) onAction('vote', { targetId });
  };

  return (
    <section className="werewolf-panel" aria-label="Trận Ma Sói">
      <header className="werewolf-panel__header">
        <span className="werewolf-panel__eyebrow">HỘI ĐỒNG DƯỚI TRĂNG</span>
        <strong>{phaseNames[game.phase] || 'Ma Sói'}</strong>
        {game.endsAt && <span className="werewolf-panel__timer">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span>}
      </header>

      {game.phase === 'lobby' && (
        <>
          <p className="werewolf-panel__copy">Tham gia để nhận một lá bài bí mật. Cần tối thiểu 5 người.</p>
          <div className="werewolf-panel__actions">
            {!joined ? <button type="button" onClick={onJoin}>Tham gia game</button> : (
              <button type="button" className="is-muted" onClick={onLeave}>Rời danh sách</button>
            )}
            {isLeader && (
              <button type="button" className="is-prayer" disabled={!canPray || players.length < 5} onClick={onPray}>
                Cầu nguyện
              </button>
            )}
          </div>
          {isLeader && !canPray && <small className="werewolf-panel__hint">Đến bàn thờ ở phía bắc vòng tròn, nhấn E để cầu nguyện.</small>}
        </>
      )}

      {game.phase === 'collecting' && (
        <p className="werewolf-panel__copy">{cardCount}/{players.length} lá đã được nhặt. Điều khiển nhân vật chạm vào lá bài đang di chuyển.</p>
      )}

      {game.phase === 'night' && (
        <div className="werewolf-panel__phase-copy">
          <p>{game.nightStage === 'werewolf' ? 'Ma Sói chọn người để tấn công.'
            : game.nightStage === 'seer' ? 'Tiên Tri chọn một người để soi.'
              : game.nightStage === 'guard' ? 'Bảo Vệ chọn một người để bảo vệ.'
                : 'Phù Thủy có thể cứu nạn nhân hoặc dùng thuốc độc.'}</p>
          {game.ownRole && <strong>Vai trò của bạn: {roleNames[game.ownRole]}</strong>}
          {game.seerResult && <strong className="werewolf-panel__result">{players.find((player) => player.peerId === game.seerResult.targetId)?.name}: {game.seerResult.isWerewolf ? 'Ma Sói' : 'Không phải Ma Sói'}</strong>}
          {game.ownRole === 'witch' && game.victimId && <span>Nạn nhân của Sói: {players.find((player) => player.peerId === game.victimId)?.name || 'Người chơi'}</span>}
        </div>
      )}

      {['discussion', 'vote', 'revote'].includes(game.phase) && (
        <p className="werewolf-panel__copy">{game.phase === 'discussion' ? 'Thảo luận qua khung chat để tìm Ma Sói.' : game.phase === 'revote' ? 'Phiếu cao nhất đang hòa. Chỉ chọn trong nhóm hòa phiếu.' : 'Chọn một người chơi còn sống để loại.'}</p>
      )}

      {canAct && game.nightStage === 'witch' && (
        <div className="werewolf-panel__form">
          <label className="werewolf-panel__check">
            <input type="checkbox" checked={savePotion} disabled={!game.potions?.save || !game.victimId} onChange={(event) => setSavePotion(event.target.checked)} />
            Cứu nạn nhân {game.potions?.save ? '' : '(đã dùng)'}
          </label>
          <label className="werewolf-panel__check">
            <input type="checkbox" checked={poisonPotion} disabled={!game.potions?.poison} onChange={(event) => setPoisonPotion(event.target.checked)} />
            Dùng thuốc độc {game.potions?.poison ? '' : '(đã dùng)'}
          </label>
          {poisonPotion && <select value={poisonTargetId} onChange={(event) => setPoisonTargetId(event.target.value)} aria-label="Chọn người trúng độc">
            <option value="">Chọn người trúng độc</option>
            {players.filter((player) => player.alive).map((player) => <option key={player.peerId} value={player.peerId}>{player.name}</option>)}
          </select>}
          <button type="button" disabled={!savePotion && (!poisonPotion || !poisonTargetId)} onClick={submitAction}>Xác nhận thuốc</button>
        </div>
      )}

      {canAct && game.nightStage !== 'witch' && (
        <div className="werewolf-panel__form">
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)} aria-label="Chọn mục tiêu ban đêm">
            <option value="">Chọn người chơi</option>
            {aliveTargets.map((player) => <option key={player.peerId} value={player.peerId}>{player.name}</option>)}
          </select>
          <button type="button" disabled={!targetId} onClick={submitAction}>Xác nhận</button>
        </div>
      )}

      {canVote && (
        <div className="werewolf-panel__form">
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)} aria-label="Chọn người để bỏ phiếu">
            <option value="">Chọn người chơi</option>
            {voteTargets.map((player) => <option key={player.peerId} value={player.peerId}>{player.name}</option>)}
          </select>
          <button type="button" disabled={!targetId} onClick={submitVote}>Bỏ phiếu</button>
        </div>
      )}

      {game.phase === 'finished' && <p className="werewolf-panel__winner">{game.winner === 'werewolves' ? 'Ma Sói chiến thắng' : 'Dân Làng chiến thắng'}</p>}
      {game.phase === 'finished' && isLeader && <button type="button" onClick={() => onAction('reset')}>Mở sảnh mới</button>}

      {players.length > 0 && (
        <ul className="werewolf-panel__players">
          {players.map((player) => (
            <li key={player.peerId} className={!player.alive ? 'is-dead' : ''}>
              <span>{player.name}{player.peerId === localPeerId ? ' · Bạn' : ''}</span>
              <small>{!player.alive ? roleNames[player.role] : game.phase === 'collecting' ? (player.hasCard ? 'Đã nhận bài' : 'Đang tìm bài') : player.alive ? 'Còn sống' : ''}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}