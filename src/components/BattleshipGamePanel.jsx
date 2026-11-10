// BattleshipGamePanel — single-player Battleship (Bắn Tàu) vs AI bot
// Human places ships on the left grid, then alternates firing at the right grid.
import { useState, useEffect, useCallback, useRef } from 'react';
import './BattleshipGamePanel.css';
import BattleshipScene3D from './BattleshipScene3D.jsx';
import {
  SHIPS,
  createEmptyGrid,
  placeShip,
  autoPlace,
  fire,
  checkWin,
  botMove,
} from '../game/battleship.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_HUNT_TARGET = { mode: 'hunt', queue: [], hits: [], lastSunkSize: 0 };

// ── Probability density AI (Khó mode) ────────────────────────────────────────
// Computes a density map: for each unsunk ship size, count how many valid
// placements cover each cell. Fire the highest-density unhit cell.
function computeDensityMove(grid, unsunkSizes) {
  const density = Array.from({ length: 10 }, () => new Array(10).fill(0));

  for (const size of unsunkSizes) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        // Horizontal
        if (c + size <= 10) {
          let valid = true;
          for (let i = 0; i < size; i++) {
            const cell = grid[r][c + i];
            // Invalid if miss or already confirmed sunk ship cell
            if (cell.hit && cell.ship === null) { valid = false; break; }
            if (cell.hit && cell.ship !== null) { valid = false; break; } // sunk cell
          }
          if (valid) for (let i = 0; i < size; i++) density[r][c + i]++;
        }
        // Vertical
        if (r + size <= 10) {
          let valid = true;
          for (let i = 0; i < size; i++) {
            const cell = grid[r + i][c];
            if (cell.hit && cell.ship === null) { valid = false; break; }
            if (cell.hit && cell.ship !== null) { valid = false; break; }
          }
          if (valid) for (let i = 0; i < size; i++) density[r + i][c]++;
        }
      }
    }
  }

  // Find max density among unhit cells
  let maxDensity = -1;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if (!grid[r][c].hit && density[r][c] > maxDensity) maxDensity = density[r][c];
    }
  }

  if (maxDensity <= 0) {
    // Fallback: random unhit
    const unhit = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!grid[r][c].hit) unhit.push({ row: r, col: c });
    return unhit[Math.floor(Math.random() * unhit.length)];
  }

  const candidates = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if (!grid[r][c].hit && density[r][c] === maxDensity) candidates.push({ row: r, col: c });
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BattleshipGamePanel({ onClose, initialDifficulty, initialTimeLimit, initialTotalTime }) {
  // ── Game state
  const [phase, setPhase] = useState('placement'); // 'placement' | 'battle' | 'won' | 'lost'
  const [playerGrid, setPlayerGrid] = useState(() => createEmptyGrid());
  const [enemyGrid, setEnemyGrid] = useState(() => autoPlace(SHIPS));
  const [huntTarget, setHuntTarget] = useState(INITIAL_HUNT_TARGET);
  const [sunkByBot, setSunkByBot] = useState(new Set()); // ship ids sunk on player grid
  const [sunkByPlayer, setSunkByPlayer] = useState(new Set()); // ship ids sunk on enemy grid

  // Placement
  const [currentShipIdx, setCurrentShipIdx] = useState(0);
  const [isHorizontal, setIsHorizontal] = useState(true);
  const [hoverCell, setHoverCell] = useState(null);

  // Battle
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [difficulty, setDifficulty] = useState(
    ['Dễ', 'Trung bình', 'Khó'].includes(initialDifficulty) ? initialDifficulty : 'Trung bình',
  );
  const [statusMsg, setStatusMsg] = useState('Đặt tàu: chọn ô để đặt Tàu Sân Bay (5 ô)');
  const [statusClass, setStatusClass] = useState('');

  // ── Clocks (same pattern as ChessGamePanel) ───────────────────────────────
  const resolvedTimeLimit = [15, 30, 60, 120, 0].includes(initialTimeLimit) ? initialTimeLimit : 30;
  const resolvedTotalTime = Number.isFinite(initialTotalTime) && initialTotalTime >= 0
    ? Math.round(initialTotalTime) : 900;

  const [timeLimit, setTimeLimit] = useState(resolvedTimeLimit);
  const [timeLeft, setTimeLeft] = useState(resolvedTimeLimit || 30);
  const timeLimitRef = useRef(resolvedTimeLimit);
  const timeLeftRef  = useRef(resolvedTimeLimit || 30);
  const totalTimeRef = useRef(resolvedTotalTime);

  const [humanBank, setHumanBank] = useState(resolvedTotalTime);
  const [botBank,   setBotBank]   = useState(resolvedTotalTime);
  const humanBankRef = useRef(resolvedTotalTime);
  const botBankRef   = useRef(resolvedTotalTime);

  const timerActiveRef = useRef(false);
  const timerOwnerRef  = useRef('human'); // 'human' | 'bot'

  useEffect(() => { timeLimitRef.current = timeLimit; }, [timeLimit]);
  useEffect(() => { timeLeftRef.current  = timeLeft;  }, [timeLeft]);
  useEffect(() => { humanBankRef.current = humanBank; }, [humanBank]);
  useEffect(() => { botBankRef.current   = botBank;   }, [botBank]);

  const formatClock = (s) => {
    const v = Math.max(0, Math.floor(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  };

  // Start per-move + total clock for owner ('human' | 'bot')
  const startClock = useCallback((owner) => {
    timerOwnerRef.current = owner;
    timeLeftRef.current = timeLimitRef.current;
    setTimeLeft(timeLimitRef.current);
    timerActiveRef.current = timeLimitRef.current > 0 || totalTimeRef.current > 0;
  }, []);

  const stopClock = useCallback(() => { timerActiveRef.current = false; }, []);

  const handleTimeout = useCallback((owner) => {
    timerActiveRef.current = false;
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    if (owner === 'human') {
      setPhase('lost');
      setStatusMsg('⏱ Hết giờ! Bạn đã thua.');
    } else {
      setPhase('won');
      setStatusMsg('⏱ Bot hết giờ! Bạn thắng!');
    }
    setIsPlayerTurn(false);
  }, []);

  // 1-second ticker
  useEffect(() => {
    const id = setInterval(() => {
      if (!timerActiveRef.current) return;
      const owner = timerOwnerRef.current;
      let timedOut = false;

      if (timeLimitRef.current > 0) {
        const next = Math.max(0, timeLeftRef.current - 1);
        timeLeftRef.current = next;
        setTimeLeft(next);
        if (next === 0) timedOut = true;
      }

      if (totalTimeRef.current > 0) {
        const ref = owner === 'human' ? humanBankRef : botBankRef;
        const setBank = owner === 'human' ? setHumanBank : setBotBank;
        const next = Math.max(0, ref.current - 1);
        ref.current = next;
        setBank(next);
        if (next === 0) timedOut = true;
      }

      if (timedOut) handleTimeout(owner);
    }, 1000);
    return () => clearInterval(id);
  }, [handleTimeout]);

  // Drive clock from phase + whose turn it is
  useEffect(() => {
    if (phase !== 'battle') { stopClock(); return; }
    startClock(isPlayerTurn ? 'human' : 'bot');
  }, [phase, isPlayerTurn, startClock, stopClock]);

  // Bot timer ref so we can cancel if "Ván mới" is clicked mid-turn
  const botTimerRef = useRef(null);
  // Stable refs so doBotTurn callback always sees latest state
  const playerGridRef = useRef(playerGrid);
  const huntTargetRef = useRef(huntTarget);
  const sunkByBotRef  = useRef(sunkByBot);
  useEffect(() => { playerGridRef.current = playerGrid; }, [playerGrid]);
  useEffect(() => { huntTargetRef.current = huntTarget; }, [huntTarget]);
  useEffect(() => { sunkByBotRef.current  = sunkByBot; },  [sunkByBot]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const startNewGame = useCallback(() => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    stopClock();
    // Reset time banks
    humanBankRef.current = totalTimeRef.current;
    botBankRef.current   = totalTimeRef.current;
    setHumanBank(totalTimeRef.current);
    setBotBank(totalTimeRef.current);
    const freshPlayerGrid = createEmptyGrid();
    const freshHuntTarget = INITIAL_HUNT_TARGET;
    const freshSunkByBot = new Set();
    playerGridRef.current = freshPlayerGrid;
    huntTargetRef.current = freshHuntTarget;
    sunkByBotRef.current  = freshSunkByBot;
    setPhase('placement');
    setPlayerGrid(freshPlayerGrid);
    setEnemyGrid(autoPlace(SHIPS));
    setHuntTarget(freshHuntTarget);
    setSunkByBot(freshSunkByBot);
    setSunkByPlayer(new Set());
    setCurrentShipIdx(0);
    setIsHorizontal(true);
    setHoverCell(null);
    setIsPlayerTurn(true);
    setStatusMsg('Đặt tàu: chọn ô để đặt Tàu Sân Bay (5 ô)');
    setStatusClass('');
  }, []);

  // ── R key → rotate during placement ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'placement') return;
    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') setIsHorizontal((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  // Cleanup bot timer on unmount
  useEffect(() => () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); }, []);

  // ── Placement click ──────────────────────────────────────────────────────────
  function handlePlacementClick(row, col) {
    if (phase !== 'placement') return;
    const ship = SHIPS[currentShipIdx];
    if (!ship) return;
    try {
      const newGrid = placeShip(playerGrid, ship, row, col, isHorizontal);
      setPlayerGrid(newGrid);
      const nextIdx = currentShipIdx + 1;
      if (nextIdx >= SHIPS.length) {
        // All ships placed → start battle
        setCurrentShipIdx(SHIPS.length);
        setPhase('battle');
        setIsPlayerTurn(true);
        setStatusMsg('Lượt của bạn — chọn ô bắn trên bàn đối phương');
        setStatusClass('');
      } else {
        setCurrentShipIdx(nextIdx);
        const next = SHIPS[nextIdx];
        setStatusMsg(`Đặt tàu: ${next.name} (${next.size} ô)${isHorizontal ? ' — nằm ngang' : ' — thẳng đứng'}`);
      }
    } catch {
      setStatusMsg('⚠ Không thể đặt ở đây — ra ngoài hoặc bị chồng lấp');
      setStatusClass('battleship-status--warning');
    }
  }

  // ── Player fires ─────────────────────────────────────────────────────────────
  function handleEnemyClick(row, col) {
    if (phase !== 'battle' || !isPlayerTurn) return;
    if (enemyGrid[row][col].hit) return;

    const { grid: newEnemyGrid, result, sunkShip } = fire(enemyGrid, row, col);
    setEnemyGrid(newEnemyGrid);

    if (result === 'sunk' && sunkShip) {
      const newSunk = new Set(sunkByPlayer);
      newSunk.add(sunkShip.id);
      setSunkByPlayer(newSunk);
      if (checkWin(newEnemyGrid)) {
        setPhase('won');
        stopClock();
        setStatusMsg('🎉 Bạn đã đánh chìm toàn bộ hạm đội địch!');
        return;
      }
      setStatusMsg(`💥 Bắn trúng và đánh chìm ${sunkShip.name}! Bot đang phản công...`);
      setStatusClass('');
    } else if (result === 'hit') {
      setStatusMsg('🎯 Trúng! Bot đang phản công...');
      setStatusClass('');
    } else {
      setStatusMsg('💧 Trượt. Bot đang phản công...');
      setStatusClass('');
    }

    setIsPlayerTurn(false);
    // Bot fires after a short delay
    botTimerRef.current = setTimeout(() => doBotTurn(newEnemyGrid), 650);
  }

  // ── Bot fires ─────────────────────────────────────────────────────────────────
  function doBotTurn(_ignoredEnemyGrid) {
    const currentPlayerGrid = playerGridRef.current;
    const currentHuntTarget = huntTargetRef.current;
    const currentSunkByBot  = sunkByBotRef.current;

    let row, col, nextHunt;

    if (difficulty === 'Dễ') {
      // Easy: random unhit cell
      const unhit = [];
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!currentPlayerGrid[r][c].hit) unhit.push({ row: r, col: c });
      const chosen = unhit[Math.floor(Math.random() * unhit.length)];
      row = chosen.row; col = chosen.col;
      nextHunt = currentHuntTarget;
    } else if (difficulty === 'Khó' && currentHuntTarget.mode === 'hunt') {
      // Hard hunt: probability density
      const unsunkSizes = SHIPS.filter((s) => !currentSunkByBot.has(s.id)).map((s) => s.size);
      const chosen = computeDensityMove(currentPlayerGrid, unsunkSizes);
      row = chosen.row; col = chosen.col;
      // Derive next hunt state from this chosen cell
      const cell = currentPlayerGrid[row][col];
      if (cell.ship !== null) {
        const ship = cell.ship;
        let hitCount = 0;
        for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (currentPlayerGrid[r][c].ship?.id === ship.id && currentPlayerGrid[r][c].hit) hitCount++;
        if (hitCount + 1 === ship.size) {
          nextHunt = { mode: 'hunt', queue: [], hits: [], lastSunkSize: ship.size };
        } else {
          const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
          const newNeighbors = dirs
            .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
            .filter(({ row: nr, col: nc }) => nr >= 0 && nr <= 9 && nc >= 0 && nc <= 9 && !currentPlayerGrid[nr][nc].hit);
          nextHunt = { mode: 'target', queue: newNeighbors, hits: [{ row, col }], lastSunkSize: currentHuntTarget.lastSunkSize };
        }
      } else {
        nextHunt = currentHuntTarget; // miss: stay hunt
      }
    } else {
      // Medium / Hard target mode: engine botMove
      const result = botMove(currentPlayerGrid, currentHuntTarget);
      row = result.row; col = result.col; nextHunt = result.huntTarget;
    }

    const { grid: newPlayerGrid, result: fireResult, sunkShip } = fire(currentPlayerGrid, row, col);
    playerGridRef.current = newPlayerGrid;
    setPlayerGrid(newPlayerGrid);
    huntTargetRef.current = nextHunt;
    setHuntTarget(nextHunt);

    if (fireResult === 'sunk' && sunkShip) {
      const newSunk = new Set(currentSunkByBot);
      newSunk.add(sunkShip.id);
      sunkByBotRef.current = newSunk;
      setSunkByBot(newSunk);
      if (checkWin(newPlayerGrid)) {
        setPhase('lost');
        stopClock();
        setStatusMsg('💀 Hạm đội của bạn bị đánh chìm hoàn toàn!');
        setIsPlayerTurn(false);
        return;
      }
      setStatusMsg(`🤖 Bot đánh chìm ${sunkShip.name} của bạn! Đến lượt bạn.`);
      setStatusClass('battleship-status--danger');
    } else if (fireResult === 'hit') {
      setStatusMsg('🤖 Bot bắn trúng! Đến lượt bạn.');
      setStatusClass('battleship-status--warning');
    } else {
      setStatusMsg('🤖 Bot trượt. Đến lượt bạn.');
      setStatusClass('');
    }
    setIsPlayerTurn(true);
  }

  // ── Ship list ──────────────────────────────────────────────────────────────────
  function renderShipList(sunkSet, showActiveCurrent) {
    return (
      <div className="battleship-ship-list">
        <div className="battleship-ship-list__title">Hạm đội</div>
        {SHIPS.map((ship, idx) => {
          const isPlaced = idx < currentShipIdx;
          const isActive = showActiveCurrent && idx === currentShipIdx;
          const isSunk = sunkSet.has(ship.id);
          let cls = 'battleship-ship-item';
          if (isActive) cls += ' is-active';
          else if (isSunk) cls += ' is-sunk';
          else if (isPlaced || phase !== 'placement') cls += ' is-placed';
          return (
            <div key={ship.id} className={cls}>
              <div className="battleship-ship-item__name">{ship.name}</div>
              <div className="battleship-ship-item__cells">
                {Array.from({ length: ship.size }).map((_, i) => (
                  <div key={i} className="battleship-ship-item__cell" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── End-game screens ──────────────────────────────────────────────────────────
  if (phase === 'won') {
    return (
      <>
        <div className="battleship-confetti-layer" aria-hidden="true">
          {Array.from({ length: 80 }).map((_, i) => (
            <span
              key={i}
              className="battleship-confetti"
              style={{
                left: `${(i * 97) % 100}%`,
                animationDelay: `${(i % 12) * 0.1}s`,
                animationDuration: `${2.4 + ((i * 7) % 10) * 0.16}s`,
                background: ['#42d392', '#4a90e2', '#ffd23f', '#ff6b6b', '#c77dff', '#7fe8a0'][i % 6],
              }}
            />
          ))}
        </div>
        <div className="battleship-endgame battleship-endgame--win" role="dialog" aria-label="Chiến thắng">
          <div className="battleship-endgame__card">
            <div className="battleship-endgame__icon">🏆</div>
            <h2 className="battleship-endgame__title">Bạn thắng!</h2>
            <p className="battleship-endgame__sub">Toàn bộ hạm đội địch đã bị đánh chìm!</p>
            <div className="battleship-endgame__actions">
              <button type="button" className="battleship-endgame__btn battleship-endgame__btn--primary" onClick={startNewGame}>Ván mới</button>
              <button type="button" className="battleship-endgame__btn" onClick={onClose}>Đóng</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (phase === 'lost') {
    return (
      <div className="battleship-endgame battleship-endgame--lose" role="dialog" aria-label="Thua cuộc">
        <div className="battleship-endgame__card">
          <div className="battleship-endgame__icon">💀</div>
          <h2 className="battleship-endgame__title">Bạn thua!</h2>
          <p className="battleship-endgame__sub">Hạm đội của bạn đã bị đánh chìm hoàn toàn.</p>
          <div className="battleship-endgame__actions">
            <button type="button" className="battleship-endgame__btn battleship-endgame__btn--primary" onClick={startNewGame}>Ván mới</button>
            <button type="button" className="battleship-endgame__btn" onClick={onClose}>Đóng</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className='battleship-overlay' role='dialog' aria-modal='true' aria-label='Bắn Tàu'>
      {/* 3D Canvas fills the whole overlay */}
      <BattleshipScene3D
        phase={phase}
        playerGrid={playerGrid}
        enemyGrid={enemyGrid}
        isPlayerTurn={isPlayerTurn}
        hoverCell={hoverCell}
        isHorizontal={isHorizontal}
        currentShipSize={SHIPS[currentShipIdx]?.size ?? 0}
        sunkByBot={sunkByBot}
        sunkByPlayer={sunkByPlayer}
        onPlayerCellClick={(r, c) => handlePlacementClick(r, c)}
        onPlayerCellHover={(r, c) => setHoverCell({ row: r, col: c, isPlayer: true })}
        onPlayerCellLeave={() => setHoverCell(null)}
        onEnemyCellClick={(r, c) => handleEnemyClick(r, c)}
        onEnemyCellHover={(r, c) => setHoverCell({ row: r, col: c, isPlayer: false })}
        onEnemyCellLeave={() => setHoverCell(null)}
      />
      {/* HUD overlay — top-right HTML panel */}
      <div className='battleship-hud'>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className='battleship-hud__title'>⚓ Bắn Tàu</div>
          <button type='button' className='battleship-hud__close' aria-label='Đóng' onClick={onClose}>✕</button>
        </div>
        <div className='battleship-panel__controls'>
          <span style={{ color: '#8ab8d8', fontSize: 13 }}>
            Độ khó: <strong style={{ color: '#e0f0ff' }}>{difficulty}</strong>
          </span>
          <label htmlFor='bs-timelimit'>Thời gian/nước:</label>
          <select
            id='bs-timelimit'
            value={timeLimit}
            disabled={phase === 'battle'}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimeLimit(v);
              timeLimitRef.current = v;
            }}
          >
            <option value={15}>15 giây</option>
            <option value={30}>30 giây</option>
            <option value={60}>60 giây</option>
            <option value={120}>120 giây</option>
            <option value={0}>Tắt</option>
          </select>
          <label htmlFor='bs-totaltime'>Tổng thời gian:</label>
          <select
            id='bs-totaltime'
            value={totalTimeRef.current}
            disabled={phase === 'battle'}
            onChange={(e) => {
              const v = Number(e.target.value);
              totalTimeRef.current = v;
              humanBankRef.current = v;
              botBankRef.current   = v;
              setHumanBank(v);
              setBotBank(v);
            }}
          >
            <option value={0}>Tắt</option>
            <option value={300}>5 phút</option>
            <option value={600}>10 phút</option>
            <option value={900}>15 phút</option>
            <option value={1800}>30 phút</option>
          </select>
          {phase === 'placement' && (
            <button type='button' className='battleship-rotate-btn' onClick={() => setIsHorizontal((h) => !h)} title='Phím R để xoay'>
              {isHorizontal ? '↔ Ngang' : '↕ Dọc'} (R)
            </button>
          )}
          <button type='button' onClick={startNewGame}>Ván mới</button>
        </div>
        {/* Per-move clock */}
        {phase === 'battle' && timeLimit > 0 && (
          <div className={`battleship-hud__clock${timeLeft <= 10 ? ' is-warning' : ''}`} aria-live='polite'>
            ⏱ {isPlayerTurn ? 'Bạn' : 'Bot'}: {timeLeft}s
            {timeLeft <= 10 && <span> — Sắp hết giờ!</span>}
          </div>
        )}
        {/* Total time banks */}
        {phase === 'battle' && totalTimeRef.current > 0 && (
          <div className='battleship-hud__banks' aria-live='polite'>
            <span className={`battleship-hud__bank${isPlayerTurn ? ' is-active' : ''}${humanBank <= 30 ? ' is-low' : ''}`}>
              🧑 Bạn: {formatClock(humanBank)}
            </span>
            <span className={`battleship-hud__bank${!isPlayerTurn ? ' is-active' : ''}${botBank <= 30 ? ' is-low' : ''}`}>
              🤖 Bot: {formatClock(botBank)}
            </span>
          </div>
        )}
        <div className={`battleship-hud__status ${statusClass}`} aria-live='polite'>
          {phase === 'placement'
            ? (currentShipIdx < SHIPS.length
                ? `Đặt tàu [${currentShipIdx + 1}/${SHIPS.length}]: ${SHIPS[currentShipIdx].name} (${SHIPS[currentShipIdx].size} ô) — ${isHorizontal ? 'nằm ngang' : 'thẳng đứng'}`
                : statusMsg)
            : statusMsg}
        </div>
        {/* Player fleet list */}
        {renderShipList(phase === 'placement' ? new Set() : sunkByBot, phase === 'placement')}
        {/* Enemy fleet list (battle phase) */}
        {phase === 'battle' && (
          <div className='battleship-ship-list'>
            <div className='battleship-ship-list__title'>Địch</div>
            {SHIPS.map((ship) => (
              <div key={ship.id} className={`battleship-ship-item${sunkByPlayer.has(ship.id) ? ' is-sunk' : ''}`}>
                <div className='battleship-ship-item__name'>{ship.name}</div>
                <div className='battleship-ship-item__cells'>
                  {Array.from({ length: ship.size }).map((_, i) => <div key={i} className='battleship-ship-item__cell' />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
