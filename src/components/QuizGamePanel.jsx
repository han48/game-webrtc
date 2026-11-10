import { useEffect, useState } from 'react';

const ANSWERS = ['A', 'B', 'C', 'D'];

export default function QuizGamePanel({
  game,
  localPeerId,
  isLeader,
  canOpenChest,
  chestOpen,
  fileName,
  playerCount,
  p2pPlayerCount,
  error,
  onCloseChest,
  onFile,
  onStart,
  onReset,
}) {
  const [now, setNow] = useState(Date.now());
  const players = game.players || [];
  const secondsLeft = game.endsAt ? Math.max(0, Math.ceil((game.endsAt - now) / 1000)) : 0;
  const alivePlayers = players.filter((player) => player.alive);
  const winners = game.phase === 'finished' ? alivePlayers : [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="quiz-panel" aria-label="Trò chơi trả lời câu hỏi">
      <header className="quiz-panel__header">
        <span className="quiz-panel__eyebrow">ĐẤU TRƯỜNG KIẾN THỨC</span>
        <strong>{game.phase === 'question' ? `Câu ${game.questionIndex + 1}/${game.questionCount}` : game.phase === 'finished' ? 'Kết thúc' : 'Sẵn sàng'}</strong>
        {game.phase === 'question' && <span className="quiz-panel__timer">{secondsLeft}s</span>}
      </header>

      {game.phase === 'lobby' && (
        <>
          <p className="quiz-panel__copy">
            {game.questionCount
              ? `Đã nạp ${game.questionCount} câu${fileName ? ` từ ${fileName}` : ''}.`
              : 'Trưởng phòng đến hòm câu hỏi, nhấn E để nạp file CSV.'}
          </p>
          {isLeader && canOpenChest && !chestOpen && <p className="quiz-panel__hint">Nhấn E cạnh hòm để chọn file CSV.</p>}
          {isLeader && chestOpen && (
            <div className="quiz-panel__actions">
              <label className="quiz-panel__file">
                Chọn CSV
                <input type="file" accept=".csv,text/csv" onChange={onFile} />
              </label>
              <button type="button" onClick={onStart} disabled={!game.questionCount || !playerCount || p2pPlayerCount !== playerCount}>Bắt đầu</button>
              <button type="button" className="is-muted" onClick={onCloseChest}>Đóng</button>
            </div>
          )}
          {!isLeader && <p className="quiz-panel__hint">Chờ trưởng phòng nạp bộ câu hỏi và bắt đầu.</p>}
          {error && <p className="quiz-panel__error" role="alert">{error}</p>}
          {game.questionCount > 0 && (
            <p className="quiz-panel__hint">
              {!playerCount
                ? 'Cần ít nhất một người chơi khác trong phòng để bắt đầu.'
                : p2pPlayerCount !== playerCount
                  ? 'Đang chờ kết nối P2P đến tất cả người chơi.'
                  : 'Mỗi câu có 20 giây. Chạy vào vùng A, B, C hoặc D để trả lời.'}
            </p>
          )}
        </>
      )}

      {game.phase === 'question' && game.question && (
        <>
          <p className="quiz-panel__question">{game.question.question}</p>
          <div className="quiz-panel__options">
            {ANSWERS.map((answer) => (
              <div key={answer} className="quiz-panel__option">
                <strong>{answer}</strong>
                <span>{game.question.options[answer]}</span>
              </div>
            ))}
          </div>
          <p className="quiz-panel__hint">
            {players.find((player) => player.peerId === localPeerId)?.alive === false
              ? 'Bạn đã bị loại — đang ở trong chuồng heo.'
              : 'Chạy vào ô có chữ cái đáp án của bạn trước khi hết giờ.'}
          </p>
          {game.lastResult && <p className="quiz-panel__result">Câu trước: đáp án {game.lastResult.answer} · {game.lastResult.eliminated.length} người bị loại</p>}
        </>
      )}

      {game.phase === 'finished' && (
        <>
          <p className="quiz-panel__winner">
            {winners.length
              ? `Chiến thắng: ${winners.map((player) => player.name).join(', ')}`
              : 'Không còn người chơi sống sót.'}
          </p>
          {game.lastResult && <p className="quiz-panel__result">Đáp án cuối: {game.lastResult.answer}</p>}
          {isLeader && <button type="button" onClick={onReset}>Chơi lại</button>}
        </>
      )}

      {players.length > 0 && (
        <ul className="quiz-panel__players" aria-label="Người chơi">
          {players.map((player) => (
            <li key={player.peerId} className={player.alive ? '' : 'is-out'}>
              <span>{player.name}{player.peerId === localPeerId ? ' · Bạn' : ''}</span>
              <small>{player.alive ? 'Còn chơi' : 'Chuồng heo'}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
