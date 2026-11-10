import { useEffect, useState } from 'react';
import { isLuckyNumber } from '../game/lucky-number';

function makeRandomNumber() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

export default function LuckyNumberGamePanel({
  game,
  localPeerId,
  isLeader,
  canSpin,
  canChoose,
  onChoose,
  onSpin,
  onFinish,
  onReset,
}) {
  const localPlayer = game.players?.find((player) => player.peerId === localPeerId);
  const [number, setNumber] = useState(localPlayer?.number || '');
  const [displayNumber, setDisplayNumber] = useState(game.currentNumber || '0000');

  useEffect(() => {
    setNumber(localPlayer?.number || '');
  }, [localPlayer?.number]);

  useEffect(() => {
    if (game.phase !== 'spinning' || !game.spinEndsAt) {
      if (game.currentNumber) setDisplayNumber(game.currentNumber);
      return undefined;
    }
    const timer = window.setInterval(() => setDisplayNumber(makeRandomNumber()), 65);
    return () => window.clearInterval(timer);
  }, [game.currentNumber, game.phase, game.spinEndsAt]);

  const chooseNumber = (event) => {
    event.preventDefault();
    if (!isLuckyNumber(number)) return;
    onChoose(number);
  };
  const canChooseNumber = game.phase === 'choosing' && !game.locked;
  const winners = (game.players || []).filter((player) => game.winners?.includes(player.peerId));
  const remainingNumbers = (game.players || []).filter((player) => player.number
    && !game.drawnNumbers?.includes(player.number)).length;
  const allNumbersChosen = (game.players || []).every((player) => isLuckyNumber(player.number));

  return (
    <section className="lucky-panel" aria-label="Trò chơi con số may mắn">
      <header className="lucky-panel__header">
        <span className="lucky-panel__eyebrow">VÒNG QUAY MAY MẮN</span>
        <strong>{game.phase === 'finished' ? 'Kết thúc' : game.locked ? 'Đã khóa số' : 'Chọn con số'}</strong>
        <span>{game.drawnNumbers?.length || 0} lượt quay</span>
      </header>

      {canChooseNumber && canChoose && (
        <form className="lucky-panel__choice" onSubmit={chooseNumber}>
          <label htmlFor="lucky-number-choice">Tự chọn số may mắn (0000–9999)</label>
          <div className="lucky-panel__choice-row">
            <input
              id="lucky-number-choice"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              pattern="\d{4}"
              placeholder="0000"
              value={number}
              onChange={(event) => setNumber(event.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-describedby="lucky-number-hint"
            />
            <button type="submit" disabled={!isLuckyNumber(number)}>Lưu số</button>
          </div>
          <small id="lucky-number-hint">Bạn tự chọn một số gồm 4 chữ số; không phải chọn ô 1, 2, 3 hoặc 4.</small>
        </form>
      )}
      {canChooseNumber && !canChoose && <p className="lucky-panel__hint">Đang chờ kết nối P2P đến trưởng phòng để gửi lựa chọn.</p>}

      {!canChooseNumber && game.phase === 'choosing' && (
        <p className="lucky-panel__hint">
          {localPlayer?.number ? `Số của bạn: ${localPlayer.number}` : 'Tự chọn một số bất kỳ từ 0000 đến 9999 để tham gia.'}
          {' '}Trưởng phòng tiến đến vòng quay và nhấn E để khóa số, bắt đầu quay.
        </p>
      )}
      {canChooseNumber && !allNumbersChosen && <p className="lucky-panel__hint">Chờ mọi người chọn số hợp lệ trước khi quay.</p>}

      {game.phase !== 'choosing' && (
        <div className={`lucky-panel__number${game.phase === 'spinning' ? ' is-spinning' : ''}`} aria-live="polite">
          {displayNumber}
        </div>
      )}

      {game.phase === 'spinning' && <p className="lucky-panel__hint is-center">Đang quay... hồi hộp chờ kết quả!</p>}
      {game.phase === 'revealed' && (
        <>
          <p className="lucky-panel__result">Kết quả: <strong>{game.currentNumber}</strong></p>
          <p className="lucky-panel__hint">
            {winners.length ? `Người trúng thưởng: ${winners.map((player) => player.name).join(', ')}` : 'Chưa có người trúng thưởng.'}
          </p>
          {isLeader && (
            <div className="lucky-panel__actions">
              <button type="button" onClick={onFinish}>
                {remainingNumbers > 0 ? 'Công bố người thắng' : 'Kết thúc và công bố người thắng'}
              </button>
              {canSpin && <span className="lucky-panel__hint">Hoặc nhấn E trong vùng quay để quay lượt tiếp theo.</span>}
            </div>
          )}
        </>
      )}
      {game.phase === 'finished' && (
        <>
          <p className="lucky-panel__winner">
            {winners.length ? `Chiến thắng: ${winners.map((player) => player.name).join(', ')}` : 'Không có người trúng thưởng.'}
          </p>
          {isLeader && <button type="button" onClick={onReset}>Chơi lại</button>}
        </>
      )}
      {isLeader && canSpin && remainingNumbers > 0 && allNumbersChosen && ['choosing', 'revealed'].includes(game.phase) && (
        <button type="button" className="lucky-panel__spin" onClick={onSpin}>
          {game.phase === 'choosing' ? 'Khóa số và quay' : 'Quay số tiếp'}
        </button>
      )}

      <ul className="lucky-panel__players" aria-label="Số đã chọn">
        {(game.players || []).map((player) => (
          <li key={player.peerId} className={game.winners?.includes(player.peerId) ? 'is-winner' : ''}>
            <span>{player.name}{player.peerId === localPeerId ? ' · Bạn' : ''}</span>
            <strong>{player.number || 'Chưa chọn'}</strong>
            {game.winners?.includes(player.peerId) && <small>Trúng thưởng</small>}
          </li>
        ))}
      </ul>
      {game.phase === 'choosing' && !game.locked && <p className="lucky-panel__hint">Sau khi lượt quay đầu tiên bắt đầu, mọi lựa chọn sẽ bị khóa.</p>}
    </section>
  );
}
