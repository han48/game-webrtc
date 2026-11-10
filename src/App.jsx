import { Canvas } from '@react-three/fiber';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWolfPackBattalion } from '@fortawesome/free-brands-svg-icons';
import {
  faBars,
  faBuilding,
  faBuildingColumns,
  faCamera,
  faChess,
  faCircleQuestion,
  faDice,
  faComments,
  faCopy,
  faCrown,
  faBinoculars,
  faEye,
  faLocationCrosshairs,
  faLocationDot,
  faMap,
  faMoon,
  faMicrophone,
  faMicrophoneSlash,
  faMinus,
  faMusic,
  faPaperPlane,
  faPeopleGroup,
  faPersonWalking,
  faChair,
  faRightFromBracket,
  faRightToBracket,
  faShuffle,
  faSun,
  faUser,
  faUsers,
  faVideo,
  faVideoSlash,
  faVolumeHigh,
  faVolumeXmark,
} from '@fortawesome/free-solid-svg-icons';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import OfficeScene, { AvatarPreview } from './components/OfficeScene';
import MovementJoystick from './components/MovementJoystick';
import VideoRoom from './components/VideoRoom';
import WerewolfGamePanel from './components/WerewolfGamePanel';
import QuizGamePanel from './components/QuizGamePanel';
import LuckyNumberGamePanel from './components/LuckyNumberGamePanel';
import TeamGamePanel from './components/TeamGamePanel';
import ChessGamePanel from './components/ChessGamePanel';
import BattleshipGamePanel from './components/BattleshipGamePanel';
import ChessMatchPanel from './components/ChessMatchPanel';
import SabitechScene from './components/SabitechScene';
import NetworkTrafficPanel from './components/NetworkTrafficPanel';
import useRoomNetwork from './hooks/useRoomNetwork';
import { parseQuizCsv } from './game/quiz';
import {
  filterConcertTeleportLocations,
  getConcertTeleportLocations,
} from './game/concert-teleport.js';
import concertFloorPlan from './concert-floor-plan.json';
import roomTypes from './room-types.json';
import { CONCERT_TOUR_STORAGE_KEY, startConcertTour } from './guides/rooms/concert.js';
import { loadSavedAvatar } from './avatar';
import 'sweetalert2/dist/sweetalert2.min.css';
import './styles.css';

const roomTypeIcons = {
  'fa-solid fa-building': faBuilding,
  'fa-brands fa-wolf-pack-battalion': faWolfPackBattalion,
  'fa-solid fa-circle-question': faCircleQuestion,
  'fa-solid fa-dice': faDice,
  'fa-solid fa-people-group': faPeopleGroup,
  'fa-solid fa-chess': faChess,
  'fa-solid fa-building-columns': faBuildingColumns,
  'fa-solid fa-music': faMusic,
};

const buildRoomCode = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
};

const buildRandomName = () => {
  const adjectives = ['Swift', 'Bright', 'Cool', 'Bold', 'Keen', 'Calm', 'Smart', 'Witty'];
  const nouns = ['Panda', 'Falcon', 'Tiger', 'Otter', 'Lynx', 'Raven', 'Fox', 'Bear'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}${noun}${num}`;
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(() => new URLSearchParams(window.location.search).get('room') || 'OFFICE-01');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('office.displayName') || buildRandomName());
  const [avatar, setAvatar] = useState(loadSavedAvatar);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('messages');
  const [roomControlsOpen, setRoomControlsOpen] = useState(true);
  const [characterResetRequest, setCharacterResetRequest] = useState(0);
  const [canPray, setCanPray] = useState(false);
  const [canOpenQuizChest, setCanOpenQuizChest] = useState(false);
  const [quizChestOpen, setQuizChestOpen] = useState(false);
  const [quizFileName, setQuizFileName] = useState('');
  const [quizError, setQuizError] = useState('');
  const [canSpinLuckyNumber, setCanSpinLuckyNumber] = useState(false);
  const [chessBotTable, setChessBotTable] = useState(() => {
    // Dev/test: ?testPanel=caro|xiangqi|chess opens the panel immediately
    const tp = new URLSearchParams(window.location.search).get('testPanel');
    if (tp === 'caro') return { type: 'caro', label: 'Cờ Ca Rô' };
    if (tp === 'xiangqi') return { type: 'xiangqi', label: 'Cờ Tướng' };
    if (tp === 'chess') return { type: 'chess', label: 'Cờ Vua' };
    if (tp === 'dongtay') return { type: 'dongtay', label: 'Cờ Đông Tây' };
    if (tp === 'xiangqi-up') return { type: 'xiangqi-up', label: 'Cờ Tướng Úp' };
    if (tp === 'chess-up') return { type: 'chess-up', label: 'Cờ Vua Úp' };
    if (tp === 'dongtay-up') return { type: 'dongtay-up', label: 'Cờ Đông Tây Úp' };
    return null;
  });
  const [battleshipOpen, setBattleshipOpen] = useState(null); // null | { difficulty, timeLimit, totalTime }
  // Concert environment + camera controls live outside the 3D canvas so they
  // persist when the camera view changes.
  const [concertNight, setConcertNight] = useState(true);
  const [concertAudioStatus, setConcertAudioStatus] = useState({ isMuted: true, ready: false });
  const [concertView, setConcertView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return ['1', 'true', 'yes'].includes((params.get('debug') || '').toLowerCase()) ? 'god' : 'iso';
  });
  const [concertTeleportOpen, setConcertTeleportOpen] = useState(false);
  const [concertTeleportMaxPrice, setConcertTeleportMaxPrice] = useState('');
  const [concertTeleportRequest, setConcertTeleportRequest] = useState(null);
  const concertTeleportLocations = getConcertTeleportLocations(concertFloorPlan.layout);
  const concertTeleportPrices = [...new Set(
    concertTeleportLocations
      .map(({ priceLabel }) => priceLabel)
      .filter(Boolean),
  )].sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
  const filteredConcertTeleportLocations = filterConcertTeleportLocations(
    concertTeleportLocations,
    concertTeleportMaxPrice === '' ? null : Number(concertTeleportMaxPrice),
  );
  const chatLogRef = useRef(null);
  const joystickInputRef = useRef({ x: 0, y: 0 });
  const concertAudioControlRef = useRef(null);
  const concertTourRef = useRef(null);
  const processedMessageCount = useRef(0);
  const toastQueue = useRef(Promise.resolve());
  const autoJoinAttemptedRef = useRef(false);
  const urlRoomTypeAppliedRef = useRef(false);

  // Dev/test bridge: window.__openChessPanel('caro', 'Cờ Ca Rô')
  useEffect(() => {
    window.__openChessPanel = (type, label) => setChessBotTable({ type, label });
    return () => { delete window.__openChessPanel; };
  }, []);

  // Dev/test bridge: ?testPanel=battleship opens BattleshipGamePanel immediately
  useEffect(() => {
    const tp = new URLSearchParams(window.location.search).get('testPanel');
    if (tp === 'battleship') setBattleshipOpen(true);
  }, []);
  const {
    inRoom,
    localPeerId,
    roomLeaderId,
    roomType,
    gameState,
    quizState,
    luckyNumberState,
    teamGameState,
    localSpawn,
    peers,
    messages,
    networkEvents,
    networkTopology,
    status,
    audioEnabled,
    videoEnabled,
    mediaPending,
    localMediaStream,
    mediaError,
    joinRoom: connectToRoom,
    leaveRoom,
    changeRoomType,
    sendWerewolfCommand,
    sendQuizCommand,
    sendLuckyNumberCommand,
    sendTeamGameCommand,
    chessMatch,
    chessInvite,
    inviteToChess,
    acceptChessInvite,
    declineChessInvite,
    sendChessMove,
    leaveChessMatch,
    sendChat,
    sendPlayerState,
    sendPlayerInteraction,
    toggleAudio,
    toggleVideo,
    togglePeerMedia,
  } = useRoomNetwork(avatar);
  const ownGamePlayer = gameState.players?.find((player) => player.peerId === localPeerId);
  const gameChatDisabled = roomType === 'werewolf' && ownGamePlayer && !ownGamePlayer.alive
    && !['lobby', 'finished'].includes(gameState.phase);
  const searchParams = new URLSearchParams(location.search);
  const requestedSoloRoomType = searchParams.get('roomType');
  const staticRoomType = import.meta.env.VITE_STATIC_ROOM_TYPE;
  const staticMode = Boolean(roomTypes[staticRoomType]);
  const soloMode = ['1', 'true', 'yes'].includes((searchParams.get('solo') || '').toLowerCase())
    && Boolean(roomTypes[requestedSoloRoomType]);
  const debugMode = ['1', 'true', 'yes'].includes((searchParams.get('debug') || '').toLowerCase())
    && Boolean(roomTypes[requestedSoloRoomType]);
  const standaloneMode = staticMode || soloMode || debugMode;
  const activeRoomType = staticMode
    ? staticRoomType
    : standaloneMode ? requestedSoloRoomType : roomType;
  const standalonePath = staticMode ? '/office/' : '/office';
  const selectedRoomType = roomTypes[activeRoomType] || roomTypes.office;
  const ownQuizPlayer = quizState.players?.find((player) => player.peerId === localPeerId);
  const isConcertPage = activeRoomType === 'concert'
    && (staticMode || location.pathname.replace(/\/+$/, '') === '/office');

  useEffect(() => {
    if (!isConcertPage) return undefined;

    if (localStorage.getItem(CONCERT_TOUR_STORAGE_KEY)) return undefined;

    const startTimer = window.setTimeout(() => {
      if (localStorage.getItem(CONCERT_TOUR_STORAGE_KEY)) return;
      localStorage.setItem(CONCERT_TOUR_STORAGE_KEY, 'true');

      const concertTour = startConcertTour();
      concertTourRef.current = concertTour;
    }, 250);

    return () => {
      window.clearTimeout(startTimer);
      if (concertTourRef.current?.isActive()) concertTourRef.current.destroy();
      concertTourRef.current = null;
    };
  }, [isConcertPage]);

  const gameP2PReadyCount = peers.filter((peer) => peer.dataChannelOpen).length + 1;
  const leaderP2PReady = localPeerId === roomLeaderId || peers.some((peer) => (
    peer.peerId === roomLeaderId && peer.dataChannelOpen
  ));

  const updateAvatar = (field, value) => {
    setAvatar((current) => {
      const next = { ...current, [field]: value };
      localStorage.setItem('office.avatar', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatOpen || activeTab !== 'messages' || !chatLog) return;
    chatLog.scrollTop = chatLog.scrollHeight;
  }, [messages, chatOpen, activeTab]);

  useEffect(() => {
    const incomingMessages = messages.slice(processedMessageCount.current);
    processedMessageCount.current = messages.length;

    incomingMessages.filter((message) => !message.mine).forEach((message) => {
      const isSystemMessage = message.sender === 'System';
      const isDeparture = isSystemMessage && message.text.includes('rời phòng');
      toastQueue.current = toastQueue.current.then(() => Swal.fire({
        toast: true,
        position: 'top-end',
        icon: isDeparture ? 'warning' : isSystemMessage ? 'success' : 'info',
        titleText: isSystemMessage ? message.text : `${message.sender}: ${message.text}`,
        showConfirmButton: false,
        timer: 500,
        timerProgressBar: false,
        customClass: {
          popup: 'office-event-toast',
        },
      }));
    });
  }, [messages]);

  const handleJoinRoom = async (overrides = {}) => {
    if (staticMode) return null;

    try {
      const nameToUse = (overrides.name ?? displayName).trim();
      const joinedRoom = (overrides.room ?? roomId).trim();
      const joined = await connectToRoom(joinedRoom, nameToUse);
      const canonicalRoomId = joined.roomId || joinedRoom.toLowerCase();
      const params = new URLSearchParams(location.search);
      const topology = params.get('topology');
      const desiredRoomType = params.get('roomType');
      if (nameToUse) localStorage.setItem('office.displayName', nameToUse);
      setRoomId(canonicalRoomId);
      setRoomControlsOpen(false);
      const nextSearch = new URLSearchParams();
      nextSearch.set('room', canonicalRoomId);
      const mode = params.get('mode');
      if (mode) nextSearch.set('mode', mode);
      if (topology) nextSearch.set('topology', topology);
      if (desiredRoomType) nextSearch.set('roomType', desiredRoomType);
      navigate({
        pathname: mode === 'sabitech'
          ? '/'
          : (location.pathname === '/' || location.pathname === '') ? '/video' : location.pathname,
        search: `?${nextSearch.toString()}`,
      }, { replace: true });
      return joined;
    } catch {
      // The network hook exposes the connection error in the room status.
      return null;
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setRoomControlsOpen(true);
    const topology = new URLSearchParams(location.search).get('topology');
    navigate({
      pathname: location.pathname === '/' ? '/video' : location.pathname,
      search: topology ? `?topology=${encodeURIComponent(topology)}` : '',
    }, { replace: true });
  };

  // Auto-connect from the URL: ?room=<id>&autojoin=1 (alias: connect=1), with an
  // optional ?name=<display name>. Runs once; needs a non-empty name (from the
  // URL or a previously saved name) because the signaling join requires one.
  useEffect(() => {
    if (standaloneMode) return undefined;
    if (inRoom) {
      autoJoinAttemptedRef.current = false;
      return undefined;
    }
    if (autoJoinAttemptedRef.current) return undefined;
    const params = new URLSearchParams(location.search);
    const wantsAutoJoin = ['1', 'true', 'yes'].includes(
      (params.get('autojoin') || params.get('connect') || '').toLowerCase(),
    );
    if (!wantsAutoJoin) return undefined;
    const urlRoom = params.get('room');
    const urlName = (params.get('name') || '').trim();
    const nameToUse = urlName || displayName.trim() || buildRandomName();
    if (!urlRoom || !nameToUse) return undefined;

    const attemptTimer = window.setTimeout(async () => {
      if (autoJoinAttemptedRef.current) return;
      autoJoinAttemptedRef.current = true;
      if (urlName && urlName !== displayName) setDisplayName(urlName);
      const joined = await handleJoinRoom({ room: urlRoom, name: nameToUse });
      if (!joined) autoJoinAttemptedRef.current = false;
    }, 0);
    return () => window.clearTimeout(attemptTimer);
  }, [location.search, inRoom, displayName, standaloneMode]);

  // Apply a room type requested via the URL (?roomType=chess-room). Only the room
  // leader may change the room type, so non-leaders simply skip it. Applied once
  // per session, after we are in the room and leadership is known.
  useEffect(() => {
    if (standaloneMode) return;
    if (urlRoomTypeAppliedRef.current || !inRoom || !localPeerId || !roomLeaderId) return;
    const params = new URLSearchParams(location.search);
    const desired = params.get('roomType');
    if (!desired || !roomTypes[desired]) return;
    // Not the leader → ignore the room-type setting as requested.
    if (localPeerId !== roomLeaderId) {
      urlRoomTypeAppliedRef.current = true;
      return;
    }
    urlRoomTypeAppliedRef.current = true;
    if (desired !== roomType) changeRoomType(desired);
  }, [inRoom, localPeerId, roomLeaderId, roomType, location.search, changeRoomType, standaloneMode]);

  const handleCopyRoom = async () => {
    const urlRoomId = new URLSearchParams(location.search).get('room');
    const room = (inRoom ? urlRoomId || roomId : roomId).trim().toLowerCase() || 'OFFICE-01';
    const shareUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    shareUrl.searchParams.set('room', room);
    const mode = new URLSearchParams(location.search).get('mode');
    if (mode) shareUrl.searchParams.set('mode', mode);
    const topology = new URLSearchParams(location.search).get('topology');
    if (topology) shareUrl.searchParams.set('topology', topology);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl.toString());
      } else {
        throw new Error('Clipboard API is unavailable.');
      }
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', titleText: 'Đã sao chép liên kết phòng.', showConfirmButton: false, timer: 1600 });
    } catch (clipboardError) {
      const fallback = document.createElement('textarea');
      fallback.value = shareUrl.toString();
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      fallback.remove();
      if (copied) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', titleText: 'Đã sao chép liên kết phòng.', showConfirmButton: false, timer: 1600 });
      } else {
        console.error('Unable to copy room invitation URL.', clipboardError);
        Swal.fire({ icon: 'error', titleText: 'Không thể sao chép liên kết phòng.', text: shareUrl.toString() });
      }
    }
  };

  const handleSendMessage = (event) => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    if (sendChat(text)) setChatInput('');
  };

  const handleQuizFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const questions = parseQuizCsv(await file.text());
      if (!sendQuizCommand('load', { questions })) throw new Error('Không thể nạp câu hỏi vào phòng.');
      setQuizFileName(file.name);
      setQuizError('');
    } catch (error) {
      setQuizError(error.message || 'Không thể đọc file CSV.');
    }
  };

  const toggleChat = () => {
    setChatOpen((current) => !current);
  };

  return (
    <>
      <div className="game-shell">
        <div className={`game-topbar${inRoom || standaloneMode ? ' is-in-room' : ''}${isConcertPage ? ' is-concert' : ''}`}>
          <div className="brand-box">
            <span className="brand-mark"><FontAwesomeIcon icon={faBuilding} aria-hidden="true" /></span>
            <nav className="mode-switch" aria-label="Chế độ hiển thị">
              <NavLink
                to={{ pathname: staticMode ? '/office/' : '/office', search: location.search }}
                className={({ isActive }) => `mode-link${isActive ? ' is-active' : ''}${!inRoom && !standaloneMode ? ' is-disabled' : ''}`}
                aria-label="Office 2.5D"
                title="Office 2.5D"
                aria-disabled={!inRoom && !standaloneMode}
                onClick={(event) => {
                  if (!inRoom && !standaloneMode) event.preventDefault();
                }}
              >
                <FontAwesomeIcon icon={faPersonWalking} aria-hidden="true" />
              </NavLink>
              {!standaloneMode && (
                <NavLink
                  to={{ pathname: '/video', search: location.search }}
                  className={({ isActive }) => `mode-link${isActive ? ' is-active' : ''}`}
                  aria-label="Video"
                  title="Video"
                >
                  <FontAwesomeIcon icon={faVideo} aria-hidden="true" />
                </NavLink>
              )}
            </nav>
          </div>

          <div className={`room-menu${!inRoom && !standaloneMode || roomControlsOpen ? ' is-expanded' : ''}`}>
            {(inRoom || standaloneMode) && (
              <label className="room-type-control">
                <FontAwesomeIcon icon={roomTypeIcons[selectedRoomType.icon]} aria-hidden="true" />
                {standaloneMode ? (
                  <span>{selectedRoomType.label}{staticMode ? ' · Static' : debugMode ? ' · Debug' : ' · Solo'}</span>
                ) : (
                  <select
                    value={roomType}
                    onChange={(event) => changeRoomType(event.target.value)}
                    disabled={localPeerId !== roomLeaderId}
                    aria-label={localPeerId === roomLeaderId ? `Đổi loại phòng, hiện tại ${selectedRoomType.label}` : 'Loại phòng, chỉ trưởng phòng được đổi'}
                    title={localPeerId === roomLeaderId ? `Loại phòng: ${selectedRoomType.label}` : 'Chỉ trưởng phòng được đổi loại phòng'}
                  >
                    {Object.entries(roomTypes).map(([value, room]) => (
                      <option key={value} value={value}>{room.label}</option>
                    ))}
                  </select>
                )}
              </label>
            )}
            {inRoom && (
              location.pathname === '/office' && (
                <button
                  type="button"
                  className="room-menu-toggle character-reset-button"
                  onClick={() => setCharacterResetRequest((request) => request + 1)}
                  aria-label="Đặt lại vị trí nhân vật"
                  title="Đặt lại vị trí nhân vật"
                >
                  <FontAwesomeIcon icon={faLocationCrosshairs} aria-hidden="true" />
                </button>
              )
            )}
            {inRoom && (
              <button
                type="button"
                className="room-menu-toggle"
                onClick={() => setRoomControlsOpen((open) => !open)}
                aria-label={roomControlsOpen ? 'Thu gọn room controls' : 'Mở room controls'}
                aria-expanded={roomControlsOpen}
                title={roomControlsOpen ? 'Thu gọn room controls' : 'Mở room controls'}
              >
                <FontAwesomeIcon icon={faBars} aria-hidden="true" />
              </button>
            )}
            {!standaloneMode && <div className="room-controls">
              <div className="room-input-wrap">
                <input
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value.toUpperCase())}
                  placeholder="Nhập mã phòng"
                  disabled={inRoom}
                />
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setRoomId(buildRoomCode())}
                  disabled={inRoom}
                  aria-label="Tạo mã phòng ngẫu nhiên"
                  title="Tạo mã phòng ngẫu nhiên"
                >
                  <FontAwesomeIcon icon={faShuffle} aria-hidden="true" />
                </button>
              </div>
              <input
                className="name-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Tên hiển thị"
                maxLength={32}
                aria-label="Tên hiển thị"
                disabled={inRoom}
              />
              <button
                type="button"
                className="primary-button"
                onClick={inRoom ? handleLeaveRoom : () => handleJoinRoom()}
                aria-label={inRoom ? 'Rời phòng' : 'Vào phòng'}
                title={inRoom ? 'Rời phòng' : 'Vào phòng'}
              >
                <FontAwesomeIcon icon={inRoom ? faRightFromBracket : faRightToBracket} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleCopyRoom}
                aria-label="Sao chép liên kết phòng"
                title="Sao chép liên kết phòng"
              >
                <FontAwesomeIcon icon={faCopy} aria-hidden="true" />
              </button>
              <div className="avatar-editor-wrap">
                <button
                  type="button"
                  className="avatar-editor-toggle"
                  onClick={() => setAvatarEditorOpen((open) => !open)}
                  aria-expanded={avatarEditorOpen}
                  aria-label="Tùy chỉnh avatar"
                  title="Tùy chỉnh avatar"
                >
                  <FontAwesomeIcon icon={faUser} aria-hidden="true" />
                </button>
                {avatarEditorOpen && (
                  <div className="avatar-editor" role="dialog" aria-label="Tùy chỉnh avatar">
                    <div className="avatar-editor-heading">
                      <strong>Tùy chỉnh avatar</strong>
                      <span>Được lưu tự động</span>
                    </div>
                    <div className="avatar-preview" aria-label="Xem trước avatar, kéo chuột để xoay">
                      <Canvas camera={{ position: [0, 1.65, -6], fov: 30 }} dpr={[1, 1.5]}>
                        <AvatarPreview avatar={avatar} />
                      </Canvas>
                      <span>Kéo xoay · lăn zoom</span>
                    </div>
                    <label>Da<input type="color" value={avatar.skin} onChange={(event) => updateAvatar('skin', event.target.value)} /></label>
                    <label>Áo<input type="color" value={avatar.shirt} onChange={(event) => updateAvatar('shirt', event.target.value)} /></label>
                    <label>Quần<input type="color" value={avatar.pants} onChange={(event) => updateAvatar('pants', event.target.value)} /></label>
                    <label>Màu tóc<input type="color" value={avatar.hair} onChange={(event) => updateAvatar('hair', event.target.value)} /></label>
                    <label>Mắt<input type="color" value={avatar.eye} onChange={(event) => updateAvatar('eye', event.target.value)} /></label>
                    <label>Miệng<input type="color" value={avatar.mouth} onChange={(event) => updateAvatar('mouth', event.target.value)} /></label>
                    <label>Kiểu tóc<select value={avatar.hairstyle} onChange={(event) => updateAvatar('hairstyle', event.target.value)}>
                      <option value="short">Ngắn</option><option value="spiky">Dựng</option><option value="long">Dài</option><option value="bob">Tóc bob</option><option value="curly">Xoăn</option><option value="ponytail">Buộc đuôi</option><option value="bald">Không tóc</option>
                    </select></label>
                    <label>Phụ kiện<select value={avatar.accessory} onChange={(event) => updateAvatar('accessory', event.target.value)}>
                      <option value="none">Không có</option><option value="glasses">Kính</option><option value="cap">Mũ lưỡi trai</option><option value="headphones">Tai nghe</option><option value="crown">Vương miện</option><option value="bow">Nơ</option>
                    </select></label>
                  </div>
                )}
              </div>
            </div>}
          </div>
        </div>

        <Routes>
          <Route
            path={staticMode ? '/__static-home-disabled' : '/'}
            element={new URLSearchParams(location.search).get('mode') === 'sabitech'
              ? <SabitechScene playerName={displayName} peers={peers} onPlayerState={sendPlayerState} />
              : <Navigate to={{ pathname: '/video', search: location.search }} replace />}
          />
          <Route
            path={staticMode ? '/*' : '/office'}
            element={staticMode && staticRoomType === 'sabitech'
              ? <SabitechScene playerName={displayName} peers={peers} onPlayerState={sendPlayerState} />
              : inRoom || standaloneMode ? (
              <>
                <Canvas
                  shadows
                  className={`game-canvas${activeRoomType === 'concert' && concertView === 'first' ? ' is-first-person' : ''}`}
                  camera={{ position: [12, 15, 12], fov: 35 }}
                  dpr={[1, 2]}
                >
                  <Suspense fallback={null}>
                    <OfficeScene
                      roomType={activeRoomType}
                      debugMode={debugMode}
                      joystickInputRef={joystickInputRef}
                      playerName={displayName || 'Bạn'}
                      initialSpawn={standaloneMode ? null : localSpawn}
                      resetPositionRequest={characterResetRequest}
                      teleportRequest={concertTeleportRequest}
                      localMediaStream={localMediaStream}
                      localAudioEnabled={audioEnabled}
                      localVideoEnabled={videoEnabled}
                      localPeerId={localPeerId}
                      localAvatar={avatar}
                      remotePlayers={peers}
                      werewolfCards={gameState.cards || []}
                      teamCards={teamGameState.cards || []}
                      isQuizEliminated={activeRoomType === 'quiz' && quizState.phase !== 'lobby' && ownQuizPlayer?.alive === false}
                      canManageQuiz={localPeerId === roomLeaderId}
                      canManageLuckyNumber={localPeerId === roomLeaderId}
                      onRitualRangeChange={setCanPray}
                      onRitualInteract={() => sendWerewolfCommand('pray')}
                      onQuizRangeChange={setCanOpenQuizChest}
                      onQuizInteract={() => {
                        setQuizChestOpen(true);
                        setQuizError('');
                      }}
                      onLuckyNumberRangeChange={setCanSpinLuckyNumber}
                      onLuckyNumberInteract={() => sendLuckyNumberCommand('spin')}
                      onChessBotRangeChange={() => {}}
                      onChessBotOpen={(type, label) => {
                        if (type === 'battleship') { setBattleshipOpen({ difficulty: 'Trung bình', timeLimit: 30, totalTime: 900 }); return; }
                        setChessBotTable({ type, label });
                      }}
                      onPlayerInteraction={sendPlayerInteraction}
                      onPlayerState={sendPlayerState}
                      concertNight={concertNight}
                      concertView={concertView}
                      onConcertViewChange={setConcertView}
                      audioControlRef={concertAudioControlRef}
                      onAudioStatusChange={setConcertAudioStatus}
                    />
                  </Suspense>
                </Canvas>
                <MovementJoystick
                  inputRef={joystickInputRef}
                  disabled={activeRoomType === 'quiz' && quizState.phase !== 'lobby' && ownQuizPlayer?.alive === false}
                />
                {activeRoomType === 'concert' && (
                  <div className="concert-controls">
                    <div className="concert-controls__views" role="group" aria-label="Góc nhìn">
                      {[
                        ['iso', faMap, 'Góc nhìn mặc định'],
                        ['third', faCamera, 'Góc nhìn thứ 3'],
                        ['first', faEye, 'Góc nhìn thứ 1'],
                      ].map(([mode, icon, label]) => (
                        <button
                          key={mode}
                          type="button"
                          className={`concert-controls__btn${concertView === mode ? ' is-active' : ''}`}
                          onClick={() => setConcertView(mode)}
                          aria-pressed={concertView === mode}
                          aria-label={label}
                          title={label}
                        >
                          <FontAwesomeIcon icon={icon} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                    <div className="concert-controls__actions">
                      <button
                        type="button"
                        className="concert-controls__btn concert-controls__daynight"
                        onClick={() => setConcertNight((value) => !value)}
                        aria-pressed={concertNight}
                        title={concertNight ? 'Chuyển sang ban ngày' : 'Chuyển sang ban đêm'}
                      >
                        <FontAwesomeIcon icon={concertNight ? faMoon : faSun} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="concert-controls__btn concert-controls__audio"
                        onClick={() => concertAudioControlRef.current?.toggleMute()}
                        disabled={!concertAudioStatus.ready}
                        aria-pressed={!concertAudioStatus.isMuted}
                        aria-label={concertAudioStatus.isMuted ? 'Bật tiếng sân khấu' : 'Tắt tiếng sân khấu'}
                        title={concertAudioStatus.isMuted ? 'Bật tiếng sân khấu' : 'Tắt tiếng sân khấu'}
                      >
                        <FontAwesomeIcon icon={concertAudioStatus.isMuted ? faVolumeHigh : faVolumeXmark} aria-hidden="true" />
                      </button>
                      <div className="concert-teleport">
                        <button
                          type="button"
                          className={`concert-controls__btn${concertTeleportOpen ? ' is-active' : ''}`}
                          onClick={() => setConcertTeleportOpen((open) => !open)}
                          aria-label="Chọn khu vực để dịch chuyển"
                          aria-expanded={concertTeleportOpen}
                          aria-controls="concert-teleport-list"
                          title="Dịch chuyển đến khu vực"
                        >
                          <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
                        </button>
                        {concertTeleportOpen && (
                          <div
                            id="concert-teleport-list"
                            className="concert-teleport__list"
                            role="region"
                            aria-label="Chọn khu vực concert để dịch chuyển"
                            onWheel={(event) => event.stopPropagation()}
                          >
                            <div className="concert-teleport__header">
                              <strong>Chọn khu vực</strong>
                              <span>Khoảng cách ước tính từ tâm khu đến tâm sân khấu</span>
                              <label className="concert-teleport__filter">
                                <span>Giá tối đa</span>
                                <select
                                  value={concertTeleportMaxPrice}
                                  onChange={(event) => setConcertTeleportMaxPrice(event.target.value)}
                                  aria-label="Lọc khu vực theo giá vé tối đa"
                                >
                                  <option value="">Tất cả mức giá</option>
                                  {concertTeleportPrices.map((price) => (
                                    <option key={price} value={price.replace(/\D/g, '')}>
                                      Tối đa {price}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="concert-teleport__table-wrap">
                              <table className="concert-teleport__table">
                                <thead>
                                  <tr>
                                    <th scope="col">Khu vực</th>
                                    <th scope="col">Loại</th>
                                    <th scope="col">Giá vé</th>
                                    <th scope="col">Cách sân khấu</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredConcertTeleportLocations.map((area) => (
                                    <tr key={area.id}>
                                      <td>
                                        <button
                                          type="button"
                                          className="concert-teleport__item"
                                          onClick={() => {
                                            setConcertTeleportRequest((current) => ({
                                              ...area,
                                              requestId: (current?.requestId ?? 0) + 1,
                                            }));
                                            setConcertTeleportOpen(false);
                                          }}
                                        >
                                          {area.name}
                                        </button>
                                      </td>
                                      <td>
                                        {area.type === 'Đứng' || area.type === 'Ngồi' ? (
                                          <span
                                            className={`concert-teleport__type-icon concert-teleport__type-icon--${area.type === 'Đứng' ? 'standing' : 'seated'}`}
                                            title={area.type}
                                            aria-label={area.type}
                                          >
                                            <FontAwesomeIcon
                                              icon={area.type === 'Đứng' ? faPersonWalking : faChair}
                                              aria-hidden="true"
                                            />
                                          </span>
                                        ) : area.type}
                                      </td>
                                      <td>{area.priceLabel || '—'}</td>
                                      <td>
                                        {area.distanceToStage === null
                                          ? '—'
                                          : `${Math.round(area.distanceToStage)} m`}
                                      </td>
                                    </tr>
                                  ))}
                                  {filteredConcertTeleportLocations.length === 0 && (
                                    <tr>
                                      <td colSpan={4} className="concert-teleport__empty">
                                        Không có khu vực phù hợp.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {concertView === 'first' && (
                      <p className="concert-controls__hint">
                        Click để khóa chuột · WASD/mũi tên di chuyển · chuột xoay góc nhìn · Esc thoát
                      </p>
                    )}
                  </div>
                )}
                {debugMode && (
                  <div className="debug-controls" role="status">
                    <strong>DEBUG</strong>
                    <button
                      type="button"
                      className="debug-controls__view-button"
                      onClick={() => setConcertView('god')}
                      aria-label="Góc nhìn debug từ trên xuống"
                      title="Góc nhìn debug từ trên xuống"
                    >
                      <FontAwesomeIcon icon={faBinoculars} aria-hidden="true" />
                    </button>
                    <span>WASD / phím mũi tên: di chuyển · Page Up / Page Down: lên / xuống · Wheel: đổi góc nhìn</span>
                  </div>
                )}
              </>
            ) : <Navigate to={{ pathname: '/video', search: location.search }} replace />}
          />
          <Route
            path="/video"
            element={standaloneMode ? <Navigate to={{ pathname: standalonePath, search: location.search }} replace /> : <VideoRoom inRoom={inRoom} roomId={roomId} displayName={displayName} localMediaStream={localMediaStream} videoEnabled={videoEnabled} peers={peers} roomType={roomType} onStartGame={(type, label, difficulty, timeLimit, totalTime) => {
                if (type === 'battleship') { setBattleshipOpen({ difficulty, timeLimit, totalTime }); return; }
                setChessBotTable({ type, label, difficulty, timeLimit, totalTime });
              }} localPeerId={localPeerId} onInviteChess={inviteToChess} chessMatch={chessMatch} />}
          />
          <Route
            path="/sabitech"
            element={staticMode
              ? <Navigate to={{ pathname: standalonePath, search: location.search }} replace />
              : <SabitechScene playerName={displayName} peers={peers} onPlayerState={sendPlayerState} />}
          />
          <Route path="*" element={<Navigate to={{ pathname: standaloneMode ? standalonePath : '/video', search: location.search }} replace />} />
        </Routes>

        {inRoom && roomType === 'werewolf' && (
          <WerewolfGamePanel
            game={gameState}
            localPeerId={localPeerId}
            isLeader={localPeerId === roomLeaderId}
            canPray={canPray}
            onJoin={() => sendWerewolfCommand('join')}
            onLeave={() => sendWerewolfCommand('leave')}
            onPray={() => sendWerewolfCommand('pray')}
            onAction={sendWerewolfCommand}
          />
        )}

        {inRoom && roomType === 'quiz' && (
          <QuizGamePanel
            game={quizState}
            localPeerId={localPeerId}
            isLeader={localPeerId === roomLeaderId}
            canOpenChest={canOpenQuizChest}
            chestOpen={quizChestOpen}
            fileName={quizFileName}
            playerCount={peers.length}
            p2pPlayerCount={peers.filter((peer) => peer.dataChannelOpen).length}
            error={quizError}
            onCloseChest={() => setQuizChestOpen(false)}
            onFile={handleQuizFile}
            onStart={() => sendQuizCommand('start')}
            onReset={() => sendQuizCommand('reset')}
          />
        )}

        {inRoom && roomType === 'lucky-number' && (
          <LuckyNumberGamePanel
            game={luckyNumberState}
            localPeerId={localPeerId}
            isLeader={localPeerId === roomLeaderId}
            canSpin={canSpinLuckyNumber}
            canChoose={leaderP2PReady}
            onChoose={(number) => sendLuckyNumberCommand('set-number', { number })}
            onSpin={() => sendLuckyNumberCommand('spin')}
            onFinish={() => sendLuckyNumberCommand('finish')}
            onReset={() => sendLuckyNumberCommand('reset')}
          />
        )}

        {inRoom && roomType === 'teams' && (
          <TeamGamePanel
            game={teamGameState}
            isLeader={localPeerId === roomLeaderId}
            connectedPlayers={peers.length + 1}
            p2pReadyPlayers={gameP2PReadyCount}
            onConfigure={(playerCount, teamCount) => sendTeamGameCommand('configure', { playerCount, teamCount })}
            onStart={() => sendTeamGameCommand('start')}
            onReset={() => sendTeamGameCommand('reset')}
          />
        )}

        {!standaloneMode && <aside className={`chat-dock ${chatOpen ? '' : 'collapsed'}`}>
          <button type="button" className="chat-bubble" onClick={toggleChat} aria-label="Mở chat">
            <FontAwesomeIcon icon={faComments} aria-hidden="true" />
            <span>{peers.length + (inRoom ? 1 : 0)}</span>
          </button>

          <div className="chat-tabs">
            <button
              type="button"
              className={`chat-tab ${activeTab === 'messages' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('messages')}
              aria-label="Tin nhắn"
              title="Tin nhắn"
            >
              <FontAwesomeIcon icon={faComments} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`chat-tab ${activeTab === 'online' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('online')}
              aria-label="Thành viên online"
              title="Thành viên online"
            >
              <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
            </button>
          </div>

          <header className="chat-header">
            <div className="panel-label">{inRoom ? `LIVE · ${roomId}` : 'ROOM CHAT'}</div>
            <button type="button" className="chat-toggle" onClick={toggleChat} aria-label="Thu gọn chat" title="Thu gọn chat">
              <FontAwesomeIcon icon={faMinus} aria-hidden="true" />
            </button>
          </header>

          <div className="chat-body">
            <div className={`chat-panel ${activeTab === 'messages' ? 'is-active' : ''}`}>
              <div ref={chatLogRef} className="chat-log">
                {messages.length === 0 && <p className="chat-empty">Vào phòng để bắt đầu trò chuyện.</p>}
                {messages.map((message) => (
                  <div key={message.id} className={`chat-message ${message.mine ? 'mine' : ''} ${message.sender === 'System' ? 'system-message' : ''}`}>
                    <small>{message.sender === 'System' ? 'System' : `${message.sender}`}</small>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>

              <form className="chat-form" onSubmit={handleSendMessage}>
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Nhắn cho mọi người..."
                  disabled={!inRoom || peers.length === 0 || gameChatDisabled}
                />
                <button type="submit" disabled={!inRoom || peers.length === 0 || gameChatDisabled} aria-label="Gửi tin nhắn" title="Gửi tin nhắn">
                  <FontAwesomeIcon icon={faPaperPlane} aria-hidden="true" />
                </button>
              </form>
            </div>

            <div className={`chat-panel ${activeTab === 'online' ? 'is-active' : ''}`}>
              <div className="online-list">
                {mediaPending && <div className="media-device-status" role="status">Đang chờ quyền thiết bị...</div>}
                {mediaError && <div className="media-device-status is-error" role="status">{mediaError}</div>}
                {inRoom && (
                  <div className="online-user self">
                    <span className="online-user-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
                    <span className="online-user-name">
                      {displayName} (Bạn)
                      {localPeerId === roomLeaderId && (
                        <small className="room-leader-badge" role="img" aria-label="Trưởng phòng" title="Trưởng phòng">
                          <FontAwesomeIcon icon={faCrown} aria-hidden="true" />
                        </small>
                      )}
                    </span>
                    <span className="online-user-status is-connected" title="Bạn đang ở trong phòng" />
                    <div className="online-user-media">
                      <button
                        type="button"
                        className={`online-media-toggle${audioEnabled ? ' is-enabled' : ''}`}
                        onClick={toggleAudio}
                        disabled={mediaPending || gameChatDisabled}
                        aria-label={audioEnabled ? 'Tắt microphone của bạn' : 'Bật microphone của bạn'}
                        aria-pressed={audioEnabled}
                        title={audioEnabled ? 'Tắt microphone của bạn' : 'Bật microphone của bạn'}
                      >
                        <FontAwesomeIcon icon={audioEnabled ? faMicrophone : faMicrophoneSlash} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`online-media-toggle${videoEnabled ? ' is-enabled' : ''}`}
                        onClick={toggleVideo}
                        disabled={mediaPending}
                        aria-label={videoEnabled ? 'Tắt camera của bạn' : 'Bật camera của bạn'}
                        aria-pressed={videoEnabled}
                        title={videoEnabled ? 'Tắt camera của bạn' : 'Bật camera của bạn'}
                      >
                        <FontAwesomeIcon icon={videoEnabled ? faCamera : faVideoSlash} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
                {peers.map((peer) => (
                  <div key={peer.peerId} className="online-user">
                    <span className="online-user-avatar">{peer.name.slice(0, 1).toUpperCase()}</span>
                    <span className="online-user-name">
                      {peer.name}
                      {peer.peerId === roomLeaderId && (
                        <small className="room-leader-badge" role="img" aria-label="Trưởng phòng" title="Trưởng phòng">
                          <FontAwesomeIcon icon={faCrown} aria-hidden="true" />
                        </small>
                      )}
                    </span>
                    <span
                      className={`online-user-status ${peer.connectionState === 'connected' ? 'is-connected' : peer.connectionState === 'failed' ? 'is-failed' : 'is-connecting'}`}
                      title={peer.connectionState === 'failed' ? 'Kết nối P2P bị lỗi; thành viên vẫn ở trong phòng' : peer.connectionState === 'connected' ? 'Đã kết nối P2P' : 'Đang kết nối P2P'}
                    />
                    <div className="online-user-media">
                      <button
                        type="button"
                        className={`online-media-toggle${peer.hasAudioTrack && !peer.audioMutedBySelf ? ' is-enabled' : ''}`}
                        onClick={() => togglePeerMedia(peer.peerId, 'audio')}
                        disabled={!peer.hasAudioTrack}
                        aria-label={`${peer.audioMutedBySelf ? 'Bật' : 'Tắt'} microphone của ${peer.name}`}
                        aria-pressed={peer.hasAudioTrack && !peer.audioMutedBySelf}
                        title="Bật hoặc tắt âm thanh của người này trên thiết bị của bạn"
                      >
                        <FontAwesomeIcon icon={peer.audioMutedBySelf ? faMicrophoneSlash : faMicrophone} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`online-media-toggle${peer.hasVideoTrack && !peer.videoHiddenBySelf ? ' is-enabled' : ''}`}
                        onClick={() => togglePeerMedia(peer.peerId, 'video')}
                        disabled={!peer.hasVideoTrack}
                        aria-label={`${peer.videoHiddenBySelf ? 'Bật' : 'Tắt'} camera của ${peer.name} trên thiết bị này`}
                        aria-pressed={peer.hasVideoTrack && !peer.videoHiddenBySelf}
                        title="Hiện hoặc ẩn camera của người này trên thiết bị của bạn"
                      >
                        <FontAwesomeIcon icon={peer.videoHiddenBySelf ? faVideoSlash : faCamera} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
                {peers.length === 0 && <div className="chat-empty">{inRoom ? 'Đang chờ người chơi khác...' : 'Chưa vào phòng.'}</div>}
              </div>
            </div>
          </div>
        </aside>}

        {inRoom && networkTopology === 'leader-relay' && localPeerId === roomLeaderId && (
          <NetworkTrafficPanel
            displayName={displayName || 'Trưởng phòng'}
            localPeerId={localPeerId}
            peers={peers}
            events={networkEvents}
          />
        )}

        {chessBotTable && (
          <ChessGamePanel
            tableType={chessBotTable.type}
            tableLabel={chessBotTable.label}
            initialDifficulty={chessBotTable.difficulty}
            initialTimeLimit={chessBotTable.timeLimit}
            initialTotalTime={chessBotTable.totalTime}
            onClose={() => setChessBotTable(null)}
          />
        )}

        {battleshipOpen && (
          <BattleshipGamePanel onClose={() => setBattleshipOpen(false)} />
        )}

        {/* PvP match (invite-based, synced over P2P) */}
        {chessMatch && (
          <ChessMatchPanel
            match={chessMatch}
            localPeerId={localPeerId}
            onMove={sendChessMove}
            onLeave={leaveChessMatch}
          />
        )}

        {/* Incoming chess invite prompt */}
        {chessInvite && (
          <div className="chess-invite-prompt" role="dialog" aria-label="Lời mời đánh cờ">
            <div className="chess-invite-prompt__card">
              <p className="chess-invite-prompt__text">
                <strong>{chessInvite.fromName}</strong> mời bạn chơi{' '}
                <strong>{{ caro: 'Cờ Ca Rô', chess: 'Cờ Vua', xiangqi: 'Cờ Tướng', dongtay: 'Cờ Đông Tây' }[chessInvite.game] || 'cờ'}</strong>
              </p>
              <div className="chess-invite-prompt__actions">
                <button type="button" className="chess-invite-prompt__btn chess-invite-prompt__btn--accept" onClick={acceptChessInvite}>
                  Chấp nhận
                </button>
                <button type="button" className="chess-invite-prompt__btn" onClick={declineChessInvite}>
                  Từ chối
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
