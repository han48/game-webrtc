import { useCallback, useEffect, useRef, useState } from 'react';
import floorPlan from '../floor-plan.json';
import quizFloorPlan from '../quiz-floor-plan.json';
import luckyFloorPlan from '../lucky-floor-plan.json';
import teamsFloorPlan from '../teams-floor-plan.json';
import { getDefaultSpawn } from '../game/floor-plan';
import { WerewolfSession } from '../game/werewolf-session';
import { QuizSession } from '../game/quiz-session';
import { LuckyNumberSession } from '../game/lucky-number';
import { TeamSession } from '../game/teams';
import { ChessMatchSession, getMatchGameMeta } from '../game/chess-match';
import { DEFAULT_AVATAR, sanitizeAvatar } from '../avatar';
import LaravelSignalTransport from '../network/laravel-signal-transport';
import {
  getNetworkTopology,
  LEADER_RELAY_TOPOLOGY,
  makeRelayFrame,
  RELAY_FRAME_TYPE,
  shouldConnectPeer,
} from '../network/topology';
import { getPlayerStateSignature, makePlayerStateSnapshot } from '../network/player-state';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  ...(import.meta.env.VITE_TURN_URLS
    ? [{
      urls: import.meta.env.VITE_TURN_URLS.split(',').map((url) => url.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    }]
    : []),
];
if (ICE_SERVERS.length > 2
  && (!ICE_SERVERS[2].urls.length || !ICE_SERVERS[2].username || !ICE_SERVERS[2].credential)) {
  throw new Error('VITE_TURN_URLS requires valid TURN URLs, VITE_TURN_USERNAME, and VITE_TURN_CREDENTIAL.');
}
const NETWORK_TOPOLOGY = getNetworkTopology(
  typeof window === 'undefined' ? '' : window.location.search,
  import.meta.env.VITE_NETWORK_TOPOLOGY,
);

const DEFAULT_PLAYER_STATE = {
  position: getDefaultSpawn(floorPlan),
  direction: { x: 0, z: -1 },
  isMoving: false,
  isSitting: false,
};

function summarizeRelayPayload(payload) {
  if (payload.type === 'chat') return `Chat: ${String(payload.text || '').slice(0, 72)}`;
  if (payload.type === 'player-state' && payload.position) {
    return `Vị trí: ${Number(payload.position.x).toFixed(2)}, ${Number(payload.position.z).toFixed(2)}`;
  }
  if (payload.type === 'media-state') {
    return `Mic ${payload.audioEnabled ? 'bật' : 'tắt'} · Camera ${payload.videoEnabled ? 'bật' : 'tắt'}`;
  }
  if (payload.type === 'player-interaction') return `Tương tác: ${payload.action || 'unknown'}`;
  if (payload.command) return `${payload.type}: ${payload.command}`;
  return payload.type || 'data';
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function positionStorageKey(roomId) {
  return `office.position.v2.${roomId}`;
}

function loadSavedPosition(roomId) {
  try {
    const saved = JSON.parse(localStorage.getItem(positionStorageKey(roomId)) || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.z)
      && saved.x >= floorPlan.bounds.minX && saved.x <= floorPlan.bounds.maxX
      && saved.z >= floorPlan.bounds.minZ && saved.z <= floorPlan.bounds.maxZ) {
      return { x: saved.x, z: saved.z };
    }
  } catch {
    // Ignore invalid persisted position and use the server spawn.
  }
  return null;
}

export default function useRoomNetwork(localAvatar = DEFAULT_AVATAR) {
  const [inRoom, setInRoom] = useState(false);
  const [localPeerId, setLocalPeerId] = useState(null);
  const [roomLeaderId, setRoomLeaderId] = useState(null);
  const [roomType, setRoomTypeState] = useState('office');
  const [gameState, setGameState] = useState({ phase: 'lobby', players: [] });
  const [quizState, setQuizState] = useState({ phase: 'lobby', players: [] });
  const [luckyNumberState, setLuckyNumberState] = useState({ phase: 'choosing', players: [] });
  const [teamGameState, setTeamGameState] = useState({ phase: 'lobby', players: [], cards: [] });
  const [chessMatch, setChessMatch] = useState(null); // PvP board-game match snapshot | null
  const [localSpawn, setLocalSpawn] = useState(DEFAULT_PLAYER_STATE.position);
  const [peers, setPeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [networkEvents, setNetworkEvents] = useState([]);
  const [status, setStatus] = useState('Chưa kết nối');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [mediaPending, setMediaPending] = useState(false);
  const [localMediaStream, setLocalMediaStream] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const socketRef = useRef(null);
  const localPeerIdRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const createOfferRef = useRef(null);
  const streamOwnersRef = useRef(new Map());
  const pendingRemoteStreamsRef = useRef(new Map());
  const localMediaStreamRef = useRef(null);
  const localStateRef = useRef({ ...DEFAULT_PLAYER_STATE, avatar: sanitizeAvatar(localAvatar) });
  const localAvatarRef = useRef(sanitizeAvatar(localAvatar));
  const stateTimerRef = useRef(null);
  const sessionRef = useRef(0);
  const roomRef = useRef('');
  const nameRef = useRef('');
  const localTracksRef = useRef({ audio: null, video: null });
  const mediaStateRef = useRef({ audioEnabled: false, videoEnabled: false });
  const mediaSessionRef = useRef(0);
  const networkEventThrottleRef = useRef(new Map());
  const gameSessionRef = useRef(null);
  const gameTimerRef = useRef(null);
  const quizSessionRef = useRef(null);
  const quizTimerRef = useRef(null);
  const luckyTimerRef = useRef(null);
  const luckySessionRef = useRef(null);
  const teamSessionRef = useRef(null);
  const teamLastTickRef = useRef(0);
  const teamLastPublishRef = useRef(0);
  const chessMatchSessionRef = useRef(null); // leader-owned ChessMatchSession | null
  const [chessInvite, setChessInvite] = useState(null); // incoming invite { fromPeerId, fromName, game } | null
  const roomTypeRef = useRef(roomType);
  const roomLeaderIdRef = useRef(roomLeaderId);
  const pendingWerewolfJoinRef = useRef(false);
  roomTypeRef.current = roomType;
  roomLeaderIdRef.current = roomLeaderId;

  const recordNetworkEvent = useCallback((fromPeerId, toPeerIds, payloadType, summary) => {
    const now = Date.now();
    const throttleKey = payloadType === 'player-state' ? `${fromPeerId}:${payloadType}` : null;
    if (throttleKey && now - (networkEventThrottleRef.current.get(throttleKey) || 0) < 250) return;
    if (throttleKey) networkEventThrottleRef.current.set(throttleKey, now);
    const fromPeer = peerConnectionsRef.current.get(fromPeerId);
    const toPeers = toPeerIds.map((peerId) => peerConnectionsRef.current.get(peerId)).filter(Boolean);
    setNetworkEvents((current) => [{
      id: makeId(),
      timestamp: now,
      fromPeerId,
      fromName: fromPeer?.name || (fromPeerId === localPeerIdRef.current ? nameRef.current : 'Người chơi'),
      toPeerIds: toPeers.map((peer) => peer.peerId),
      toNames: toPeers.map((peer) => peer.name),
      payloadType,
      summary,
    }, ...current].slice(0, 18));
  }, []);

  const publishPeers = useCallback(() => {
    const leaderChannelOpen = peerConnectionsRef.current.get(roomLeaderIdRef.current)?.channel?.readyState === 'open';
    setPeers([...peerConnectionsRef.current.values()].map((peer) => ({
      peerId: peer.peerId,
      name: peer.name,
      connectionState: peer.connectionState,
      dataChannelOpen: peer.channel?.readyState === 'open' || (!peer.connection && leaderChannelOpen),
      mediaStream: peer.mediaStream,
      ...peer.playerState,
      hasAudioTrack: peer.mediaStream.getAudioTracks().length > 0,
      hasVideoTrack: peer.mediaStream.getVideoTracks().length > 0,
      audioMutedBySelf: !peer.remoteMediaEnabled.audio,
      videoHiddenBySelf: !peer.remoteMediaEnabled.video,
      hasAudio: peer.remoteMediaEnabled.audio && peer.mediaStream.getAudioTracks().length > 0 && peer.playerState.audioEnabled !== false,
      hasVideo: peer.remoteMediaEnabled.video && peer.mediaStream.getVideoTracks().length > 0 && peer.playerState.videoEnabled !== false,
    })));
  }, []);

  const appendMessage = useCallback((message) => {
    setMessages((current) => [...current, message]);
  }, []);

  const sendSignal = useCallback((type, to, payload = {}) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, to, ...payload }));
    }
  }, []);

  const sendToPeers = useCallback((payload) => {
    const data = JSON.stringify(payload);
    const recipients = [];
    for (const peer of peerConnectionsRef.current.values()) {
      if (peer.channel?.readyState === 'open') {
        peer.channel.send(data);
        recipients.push(peer.peerId);
      }
    }
    if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY
      && localPeerIdRef.current === roomLeaderIdRef.current && recipients.length) {
      recordNetworkEvent(localPeerIdRef.current, recipients, payload.type, summarizeRelayPayload(payload));
    }
    return recipients.length;
  }, [recordNetworkEvent]);

  const sendPlayerStateToPeers = useCallback((playerState) => {
    const signature = getPlayerStateSignature(playerState);
    const data = JSON.stringify({ type: 'player-state', ...playerState });
    const recipients = [];
    for (const peer of peerConnectionsRef.current.values()) {
      if (peer.channel?.readyState !== 'open' || peer.lastPlayerStateSignature === signature) continue;
      peer.channel.send(data);
      peer.lastPlayerStateSignature = signature;
      recipients.push(peer.peerId);
    }
    if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY
      && localPeerIdRef.current === roomLeaderIdRef.current && recipients.length) {
      recordNetworkEvent(localPeerIdRef.current, recipients, 'player-state', summarizeRelayPayload(playerState));
    }
    return recipients.length;
  }, [recordNetworkEvent]);

  const destroyPeer = useCallback((peerId) => {
    const peer = peerConnectionsRef.current.get(peerId);
    if (!peer) return;
    peer.channel?.close();
    peer.connection?.close();
    peerConnectionsRef.current.delete(peerId);
    for (const [streamId, ownerId] of streamOwnersRef.current) {
      if (ownerId === peerId) streamOwnersRef.current.delete(streamId);
    }
    publishPeers();
    appendMessage({ id: makeId(), sender: 'System', text: `${peer.name} đã rời phòng.`, mine: false });
  }, [appendMessage, publishPeers]);

  const createVirtualPeer = useCallback((peerId, name, spawn) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) {
      if (name) existing.name = name;
      return existing;
    }
    const peer = {
      peerId,
      name: name || `Người chơi ${peerId.slice(0, 6)}`,
      connection: null,
      connectionState: 'connected',
      channel: null,
      mediaStream: new MediaStream(),
      remoteMediaEnabled: { audio: true, video: true },
      playerState: {
        ...DEFAULT_PLAYER_STATE,
        avatar: { ...DEFAULT_AVATAR },
        position: spawn ? { x: spawn.x, z: spawn.z } : { ...DEFAULT_PLAYER_STATE.position },
      },
    };
    peerConnectionsRef.current.set(peerId, peer);
    publishPeers();
    return peer;
  }, [publishPeers]);

  const publishWerewolfState = useCallback(() => {
    const session = gameSessionRef.current;
    if (!session) return;
    for (const peer of peerConnectionsRef.current.values()) {
      if (peer.channel?.readyState === 'open') {
        peer.channel.send(JSON.stringify({ type: 'werewolf-state', game: session.snapshot(peer.peerId) }));
      }
    }
    const localId = localPeerIdRef.current;
    if (localId) setGameState(session.snapshot(localId));
  }, []);
  const publishQuizState = useCallback(() => {
    const session = quizSessionRef.current;
    if (!session) return;
    const game = session.snapshot();
    for (const peer of peerConnectionsRef.current.values()) {
      if (peer.channel?.readyState === 'open') peer.channel.send(JSON.stringify({ type: 'quiz-state', game }));
    }
    setQuizState(game);
  }, []);
  const publishLuckyNumberState = useCallback(() => {
    const session = luckySessionRef.current;
    if (!session) return;
    const game = session.snapshot();
    for (const peer of peerConnectionsRef.current.values()) {
      if (peer.channel?.readyState === 'open') peer.channel.send(JSON.stringify({ type: 'lucky-number-state', game }));
    }
    setLuckyNumberState(game);
  }, []);
  const scheduleLuckyNumberTimer = useCallback(() => {
    if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current);
    luckyTimerRef.current = null;
    const session = luckySessionRef.current;
    if (!session || session.phase !== 'spinning' || !session.spinEndsAt) return;
    const expectedSession = session;
    luckyTimerRef.current = setTimeout(() => {
      if (luckySessionRef.current !== expectedSession || roomTypeRef.current !== 'lucky-number') return;
      if (expectedSession.finishSpin()) {
        publishLuckyNumberState();
        scheduleLuckyNumberTimer();
      }
    }, Math.max(0, session.spinEndsAt - Date.now()));
  }, [publishLuckyNumberState]);
  const handleLuckyNumberCommand = useCallback((peerId, command, payload = {}) => {
    if (roomTypeRef.current !== 'lucky-number') return false;
    const isLeader = localPeerIdRef.current === roomLeaderIdRef.current;
    let session = luckySessionRef.current;
    if (!session) return false;

    let changed = false;
    if (command === 'set-number' && !isLeader) {
      if (peerId !== localPeerIdRef.current) return false;
      changed = session.setNumber(localPeerIdRef.current, payload.number);
    } else if (command === 'set-number' && isLeader) {
      const playerExists = peerId === localPeerIdRef.current || peerConnectionsRef.current.has(peerId);
      if (playerExists) changed = session.setNumber(peerId, payload.number);
    } else if (command === 'spin' && isLeader && peerId === localPeerIdRef.current) {
      const wheel = luckyFloorPlan.layout.wheel;
      const position = localStateRef.current.position;
      if (Math.hypot(position.x - wheel.x, position.z - wheel.z) <= 3.4) {
        changed = session.spin();
      }
    } else if (command === 'finish' && isLeader && peerId === localPeerIdRef.current) {
      changed = session.finish();
    } else if (command === 'reset' && isLeader && peerId === localPeerIdRef.current && session.phase === 'finished') {
      session.reset();
      changed = true;
    }

    if (changed) {
      publishLuckyNumberState();
      scheduleLuckyNumberTimer();
    }
    return changed;
  }, [publishLuckyNumberState, scheduleLuckyNumberTimer]);
  const handleLuckyNumberMessage = useCallback((payload, peerId) => {
    if (payload.type === 'lucky-number-request-state') {
      if (localPeerIdRef.current !== roomLeaderIdRef.current) return;
      if (!luckySessionRef.current) {
        luckySessionRef.current = new LuckyNumberSession();
        luckySessionRef.current.addPlayer(localPeerIdRef.current, nameRef.current || 'Khách');
        peerConnectionsRef.current.forEach((peer) => luckySessionRef.current.addPlayer(peer.peerId, peer.name));
      }
      const peer = peerConnectionsRef.current.get(peerId);
      if (peer?.channel?.readyState === 'open') {
        peer.channel.send(JSON.stringify({ type: 'lucky-number-state', game: luckySessionRef.current.snapshot() }));
      }
      return;
    }
    if (payload.type === 'lucky-number-state' && peerId === roomLeaderIdRef.current) {
      setLuckyNumberState(payload.game || { phase: 'choosing', players: [] });
      return;
    }
    if (payload.type === 'lucky-number-command') {
      handleLuckyNumberCommand(peerId, payload.command, payload);
    }
  }, [handleLuckyNumberCommand]);
  const publishTeamGameState = useCallback(() => {
    const session = teamSessionRef.current;
    if (!session) return;
    const game = session.snapshot();
    for (const peer of peerConnectionsRef.current.values()) {
      if (peer.channel?.readyState === 'open') peer.channel.send(JSON.stringify({ type: 'team-game-state', game }));
    }
    setTeamGameState(game);
  }, []);
  const handleTeamGameCommand = useCallback((peerId, command, payload = {}) => {
    if (roomTypeRef.current !== 'teams'
      || localPeerIdRef.current !== roomLeaderIdRef.current
      || peerId !== localPeerIdRef.current) return false;
    let session = teamSessionRef.current;
    if (!session) return false;

    let changed = false;
    if (command === 'configure') {
      changed = session.configure(Number(payload.playerCount), Number(payload.teamCount));
    } else if (command === 'start') {
      if ([...peerConnectionsRef.current.values()].some((peer) => peer.channel?.readyState !== 'open')) return false;
      const players = [
        { peerId: localPeerIdRef.current, name: nameRef.current || 'Khách' },
        ...[...peerConnectionsRef.current.values()].map((peer) => ({ peerId: peer.peerId, name: peer.name })),
      ];
      changed = session.start(players, teamsFloorPlan.layout.arena);
      teamLastTickRef.current = Date.now();
      teamLastPublishRef.current = 0;
    } else if (command === 'reset' && session.phase === 'finished') {
      session.reset();
      changed = true;
    }

    if (changed) publishTeamGameState();
    return changed;
  }, [publishTeamGameState]);
  const handleTeamGameMessage = useCallback((payload, peerId) => {
    if (payload.type === 'team-game-request-state') {
      if (localPeerIdRef.current !== roomLeaderIdRef.current) return;
      if (!teamSessionRef.current) {
        teamSessionRef.current = new TeamSession();
        teamSessionRef.current.addPlayer(localPeerIdRef.current, nameRef.current || 'Khách');
        peerConnectionsRef.current.forEach((peer) => teamSessionRef.current.addPlayer(peer.peerId, peer.name));
      }
      const peer = peerConnectionsRef.current.get(peerId);
      if (peer?.channel?.readyState === 'open') {
        peer.channel.send(JSON.stringify({ type: 'team-game-state', game: teamSessionRef.current.snapshot() }));
      }
      return;
    }
    if (payload.type === 'team-game-state' && peerId === roomLeaderIdRef.current) {
      setTeamGameState(payload.game || { phase: 'lobby', players: [], cards: [] });
      return;
    }
    if (payload.type === 'team-game-command') handleTeamGameCommand(peerId, payload.command, payload);
  }, [handleTeamGameCommand]);

  // ── PvP board-game match (invite-based, leader-authoritative) ────────────────
  const publishChessMatch = useCallback(() => {
    const snap = chessMatchSessionRef.current ? chessMatchSessionRef.current.snapshot() : null;
    for (const peer of peerConnectionsRef.current.values()) {
      if (peer.channel?.readyState === 'open') peer.channel.send(JSON.stringify({ type: 'chess-match-state', match: snap }));
    }
    setChessMatch(snap);
  }, []);

  const nameOf = useCallback((peerId) => (
    peerId === localPeerIdRef.current
      ? (nameRef.current || 'Khách')
      : (peerConnectionsRef.current.get(peerId)?.name || `Người chơi ${String(peerId).slice(0, 6)}`)
  ), []);

  // Leader applies all match commands and re-broadcasts the snapshot.
  const handleChessMatchCommand = useCallback((peerId, command, payload = {}) => {
    if (localPeerIdRef.current !== roomLeaderIdRef.current) return;

    if (command === 'invite') {
      // Forward the invite to the invitee only.
      const toPeerId = payload.toPeerId;
      if (!toPeerId || !getMatchGameMeta(payload.game)) return;
      const invitePayload = { type: 'chess-match-invite', fromPeerId: peerId, fromName: nameOf(peerId), game: payload.game, toPeerId };
      if (toPeerId === localPeerIdRef.current) {
        setChessInvite({ fromPeerId: peerId, fromName: nameOf(peerId), game: payload.game });
      } else {
        const peer = peerConnectionsRef.current.get(toPeerId);
        if (peer?.channel?.readyState === 'open') peer.channel.send(JSON.stringify(invitePayload));
      }
      return;
    }

    if (command === 'accept') {
      const hostId = payload.fromPeerId;
      const game = payload.game;
      if (!hostId || !getMatchGameMeta(game)) return;
      const session = new ChessMatchSession(game, hostId, { hostName: nameOf(hostId) });
      session.sitChallenger(peerId, nameOf(peerId));
      chessMatchSessionRef.current = session;
      publishChessMatch();
      return;
    }

    if (command === 'decline') {
      const toPeerId = payload.fromPeerId;
      if (toPeerId === localPeerIdRef.current) {
        appendMessage({ id: makeId(), sender: 'System', text: `${nameOf(peerId)} đã từ chối lời mời đánh cờ.`, mine: false });
      } else {
        const peer = peerConnectionsRef.current.get(toPeerId);
        if (peer?.channel?.readyState === 'open') {
          peer.channel.send(JSON.stringify({ type: 'chess-match-declined', byName: nameOf(peerId) }));
        }
      }
      return;
    }

    const session = chessMatchSessionRef.current;
    if (!session) return;

    if (command === 'move') {
      if (session.applyMove(peerId, payload.move)) publishChessMatch();
    } else if (command === 'viewer') {
      if (session.addViewer(peerId, nameOf(peerId))) publishChessMatch();
    } else if (command === 'handover') {
      if (session.handOverSeat(peerId, payload.toPeerId, nameOf(payload.toPeerId))) publishChessMatch();
    } else if (command === 'resign' || command === 'leave' || command === 'end') {
      chessMatchSessionRef.current = null;
      publishChessMatch();
    }
  }, [appendMessage, nameOf, publishChessMatch]);

  const handleChessMatchMessage = useCallback((payload, peerId) => {
    if (payload.type === 'chess-match-request-state') {
      if (localPeerIdRef.current !== roomLeaderIdRef.current) return;
      const peer = peerConnectionsRef.current.get(peerId);
      const snap = chessMatchSessionRef.current ? chessMatchSessionRef.current.snapshot() : null;
      if (peer?.channel?.readyState === 'open') peer.channel.send(JSON.stringify({ type: 'chess-match-state', match: snap }));
      return;
    }
    if (payload.type === 'chess-match-state' && peerId === roomLeaderIdRef.current) {
      setChessMatch(payload.match || null);
      return;
    }
    if (payload.type === 'chess-match-invite' && payload.toPeerId === localPeerIdRef.current) {
      setChessInvite({ fromPeerId: payload.fromPeerId, fromName: payload.fromName, game: payload.game });
      return;
    }
    if (payload.type === 'chess-match-declined') {
      appendMessage({ id: makeId(), sender: 'System', text: `${payload.byName || 'Đối thủ'} đã từ chối lời mời đánh cờ.`, mine: false });
      return;
    }
    if (payload.type === 'chess-match-command') handleChessMatchCommand(peerId, payload.command, payload);
  }, [appendMessage, handleChessMatchCommand]);
  const scheduleQuizTimer = useCallback(() => {
    if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
    quizTimerRef.current = null;
    const session = quizSessionRef.current;
    if (!session || session.phase !== 'question' || !session.endsAt) return;
    const expectedSession = session;
    quizTimerRef.current = setTimeout(() => {
      if (quizSessionRef.current !== expectedSession || roomTypeRef.current !== 'quiz') return;
      const positions = new Map([[localPeerIdRef.current, localStateRef.current.position]]);
      peerConnectionsRef.current.forEach((peer) => positions.set(peer.peerId, peer.playerState.position));
      if (expectedSession.advance(positions, quizFloorPlan.layout.answerZones)) {
        publishQuizState();
        scheduleQuizTimer();
      }
    }, Math.max(0, session.endsAt - Date.now()));
  }, [publishQuizState]);
  const handleQuizCommand = useCallback((peerId, command, payload = {}) => {
    if (roomTypeRef.current !== 'quiz'
      || localPeerIdRef.current !== roomLeaderIdRef.current
      || peerId !== localPeerIdRef.current) return false;
    let session = quizSessionRef.current;
    if (!session) {
      session = new QuizSession();
      quizSessionRef.current = session;
    }

    let changed = false;
    if (command === 'load') changed = session.load(payload.questions);
    else if (command === 'start') {
      if (!peerConnectionsRef.current.size
        || [...peerConnectionsRef.current.values()].some((peer) => peer.channel?.readyState !== 'open')) return false;
      const players = [...peerConnectionsRef.current.values()]
        .map((peer) => ({ peerId: peer.peerId, name: peer.name }));
      changed = session.start(players);
    } else if (command === 'reset' && peerId === localPeerIdRef.current && session.phase === 'finished') {
      changed = session.reset();
    }

    if (changed) {
      publishQuizState();
      scheduleQuizTimer();
    }
    return changed;
  }, [publishQuizState, scheduleQuizTimer]);
  const handleQuizMessage = useCallback((payload, peerId) => {
    if (payload.type === 'quiz-request-state') {
      if (localPeerIdRef.current !== roomLeaderIdRef.current) return;
      if (!quizSessionRef.current) quizSessionRef.current = new QuizSession();
      const peer = peerConnectionsRef.current.get(peerId);
      if (peer?.channel?.readyState === 'open') {
        peer.channel.send(JSON.stringify({ type: 'quiz-state', game: quizSessionRef.current.snapshot() }));
      }
      return;
    }
    if (payload.type === 'quiz-state' && peerId === roomLeaderIdRef.current) {
      setQuizState(payload.game || { phase: 'lobby', players: [] });
      return;
    }
    if (payload.type === 'quiz-command' && localPeerIdRef.current === roomLeaderIdRef.current
      && peerId === localPeerIdRef.current) {
      handleQuizCommand(peerId, payload.command, payload);
    }
  }, [handleQuizCommand]);
  const scheduleWerewolfTimer = useCallback(() => {
    if (gameTimerRef.current) clearTimeout(gameTimerRef.current);
    gameTimerRef.current = null;
    const session = gameSessionRef.current;
    if (!session || !session.endsAt || ['lobby', 'collecting', 'finished'].includes(session.phase)) return;
    const expectedSession = session;
    gameTimerRef.current = setTimeout(() => {
      if (gameSessionRef.current !== expectedSession) return;
      expectedSession.advance();
      publishWerewolfState();
      scheduleWerewolfTimer();
    }, Math.max(0, session.endsAt - Date.now()));
  }, [publishWerewolfState]);

  const handleWerewolfCommand = useCallback((peerId, command, payload = {}) => {
    if (roomTypeRef.current !== 'werewolf' || localPeerIdRef.current !== roomLeaderIdRef.current) return false;
    let session = gameSessionRef.current;
    if (!session && command === 'join') {
      session = new WerewolfSession();
      gameSessionRef.current = session;
    }
    if (!session) return false;

    const playerName = peerId === localPeerIdRef.current
      ? nameRef.current || 'Khách'
      : peerConnectionsRef.current.get(peerId)?.name || `Người chơi ${peerId.slice(0, 6)}`;
    let changed = false;
    if (command === 'join') changed = session.join(peerId, playerName);
    else if (command === 'leave') changed = session.leave(peerId);
    else if (command === 'reset' && session.phase === 'finished' && peerId === localPeerIdRef.current) {
      gameSessionRef.current = new WerewolfSession();
      publishWerewolfState();
      return true;
    }
    else if (command === 'pray') {
      const altar = { x: 0, z: -8 };
      const position = localStateRef.current.position;
      if (Math.hypot(position.x - altar.x, position.z - altar.z) > 3.2) {
        appendMessage({ id: makeId(), sender: 'System', text: 'Hãy đến gần bàn thờ dưới trăng để cầu nguyện.', mine: false });
        return false;
      }
      changed = session.start();
      if (!changed) appendMessage({ id: makeId(), sender: 'System', text: 'Cần ít nhất 5 người tham gia game.', mine: false });
    } else if (command === 'night-action') changed = session.act(peerId, payload);
    else if (command === 'vote') changed = session.vote(peerId, payload.targetId);

    if (changed) {
      publishWerewolfState();
      scheduleWerewolfTimer();
    }
    return changed;
  }, [appendMessage, publishWerewolfState, scheduleWerewolfTimer]);

  const handleWerewolfMessage = useCallback((payload, peerId) => {
    if (payload.type === 'werewolf-request-state') {
      if (localPeerIdRef.current !== roomLeaderIdRef.current) return;
      if (!gameSessionRef.current) gameSessionRef.current = new WerewolfSession();
      const peer = peerConnectionsRef.current.get(peerId);
      if (peer?.channel?.readyState === 'open') {
        peer.channel.send(JSON.stringify({ type: 'werewolf-state', game: gameSessionRef.current.snapshot(peerId) }));
      }
      return;
    }
    if (payload.type === 'werewolf-state' && peerId === roomLeaderIdRef.current) {
      setGameState(payload.game || { phase: 'lobby', players: [] });
      const ownPlayer = payload.game?.players?.find((player) => player.peerId === localPeerIdRef.current);
      const audioTrack = localTracksRef.current.audio;
      if (ownPlayer && !ownPlayer.alive && (audioTrack?.enabled || mediaStateRef.current.audioEnabled)) {
        if (audioTrack) audioTrack.enabled = false;
        setAudioEnabled(false);
        mediaStateRef.current = { ...mediaStateRef.current, audioEnabled: false };
        localStateRef.current = { ...localStateRef.current, audioEnabled: false };
        sendToPeers({ type: 'media-state', audioEnabled: false, videoEnabled: Boolean(mediaStateRef.current.videoEnabled) });
      }
      return;
    }
    if (payload.type === 'werewolf-command' && localPeerIdRef.current === roomLeaderIdRef.current) {
      handleWerewolfCommand(peerId, payload.command, payload);
    }
  }, [handleWerewolfCommand, sendToPeers]);

  const createPeer = useCallback((peerId, name, spawn) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing?.connection) {
      if (name) existing.name = name;
      publishPeers();
      return existing;
    }

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = {
      ...existing,
      peerId,
      name: name || `Người chơi ${peerId.slice(0, 6)}`,
      connection,
      connectionState: connection.connectionState,
      audioTransceiver: connection.addTransceiver('audio', { direction: 'sendrecv' }),
      videoTransceiver: connection.addTransceiver('video', { direction: 'sendrecv' }),
      channel: null,
      pendingCandidates: [],
      offerInFlight: false,
      offerPending: false,
      localTrackReady: Promise.resolve(),
      mediaStream: existing?.mediaStream || new MediaStream(),
      remoteMediaEnabled: existing?.remoteMediaEnabled || { audio: true, video: true },
      playerState: {
        ...DEFAULT_PLAYER_STATE,
        ...existing?.playerState,
        avatar: existing?.playerState?.avatar || { ...DEFAULT_AVATAR },
        position: spawn
          ? { x: spawn.x, z: spawn.z }
          : existing?.playerState?.position || { ...DEFAULT_PLAYER_STATE.position },
      },
    };
    peerConnectionsRef.current.set(peerId, peer);

    const trackUpdates = [];
    if (localTracksRef.current.audio) {
      trackUpdates.push(peer.audioTransceiver.sender.replaceTrack(localTracksRef.current.audio));
      if (localMediaStreamRef.current && peer.audioTransceiver.sender.setStreams) {
        peer.audioTransceiver.sender.setStreams(localMediaStreamRef.current);
      }
    }
    if (localTracksRef.current.video) {
      trackUpdates.push(peer.videoTransceiver.sender.replaceTrack(localTracksRef.current.video));
      if (localMediaStreamRef.current && peer.videoTransceiver.sender.setStreams) {
        peer.videoTransceiver.sender.setStreams(localMediaStreamRef.current);
      }
    }
    peer.localTrackReady = Promise.all(trackUpdates);

    const attachChannel = (channel) => {
      peer.channel = channel;
      const sendPeerDiagnostic = (event, state, extra = {}) => {
        if (socketRef.current instanceof LaravelSignalTransport) {
          sendSignal('peer-diagnostic', peerId, {
            diagnostic: { event, state, ...extra },
          });
        }
      };
      sendPeerDiagnostic('data-channel-state', channel.readyState);
      channel.onopen = () => {
        sendPeerDiagnostic('data-channel-state', channel.readyState);
        const initialPlayerState = makePlayerStateSnapshot(localStateRef.current);
        channel.send(JSON.stringify({ type: 'player-state', ...initialPlayerState }));
        peer.lastPlayerStateSignature = getPlayerStateSignature(initialPlayerState);
        if (localMediaStreamRef.current && localPeerIdRef.current) {
          channel.send(JSON.stringify({
            type: 'media-stream-owner',
            ownerPeerId: localPeerIdRef.current,
            streamId: localMediaStreamRef.current.id,
          }));
        }
        if (localPeerIdRef.current === roomLeaderIdRef.current) {
          for (const [streamId, ownerPeerId] of streamOwnersRef.current) {
            channel.send(JSON.stringify({
              type: 'media-stream-owner',
              ownerPeerId,
              streamId,
            }));
          }
        }
        publishPeers();
        if (roomTypeRef.current === 'werewolf') {
          channel.send(JSON.stringify({ type: 'werewolf-request-state' }));
          if (peer.peerId === roomLeaderIdRef.current && pendingWerewolfJoinRef.current) {
            pendingWerewolfJoinRef.current = false;
            channel.send(JSON.stringify({ type: 'werewolf-command', command: 'join' }));
          }
        }
        if (roomTypeRef.current === 'quiz') {
          channel.send(JSON.stringify({ type: 'quiz-request-state' }));
        }
        if (roomTypeRef.current === 'lucky-number') {
          channel.send(JSON.stringify({ type: 'lucky-number-request-state' }));
        }
        if (roomTypeRef.current === 'teams') {
          channel.send(JSON.stringify({ type: 'team-game-request-state' }));
        }
      };
      channel.onclose = () => {
        sendPeerDiagnostic('data-channel-state', channel.readyState);
        publishPeers();
      };
      channel.onerror = () => sendPeerDiagnostic('data-channel-state', 'error');
      channel.onmessage = ({ data }) => {
        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          payload = { type: 'chat', text: String(data) };
        }

        let messagePeer = peer;
        if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY) {
          if (payload.type === RELAY_FRAME_TYPE
            && localPeerIdRef.current !== roomLeaderIdRef.current
            && payload.payload && typeof payload.fromPeerId === 'string') {
            messagePeer = createVirtualPeer(payload.fromPeerId);
            payload = payload.payload;
          } else if (localPeerIdRef.current === roomLeaderIdRef.current
            && peer.peerId !== roomLeaderIdRef.current
            && payload.type !== RELAY_FRAME_TYPE) {
            const frame = JSON.stringify(makeRelayFrame(peer.peerId, payload));
            const recipients = [];
            for (const recipient of peerConnectionsRef.current.values()) {
              if (recipient.peerId !== peer.peerId && recipient.channel?.readyState === 'open') {
                recipient.channel.send(frame);
                recipients.push(recipient.peerId);
              }
            }
            recordNetworkEvent(peer.peerId, recipients, payload.type, summarizeRelayPayload(payload));
          }
        }

        if (payload.type === 'media-stream-owner'
          && typeof payload.ownerPeerId === 'string'
          && typeof payload.streamId === 'string') {
          streamOwnersRef.current.set(payload.streamId, payload.ownerPeerId);
          const pendingStream = pendingRemoteStreamsRef.current.get(payload.streamId);
          if (pendingStream) {
            const owner = createVirtualPeer(payload.ownerPeerId);
            owner.mediaStream = pendingStream;
            pendingRemoteStreamsRef.current.delete(payload.streamId);
            publishPeers();
          }
          return;
        }

        if (payload.type === 'player-state' && payload.position && payload.direction) {
          messagePeer.playerState = {
            ...messagePeer.playerState,
            position: { x: Number(payload.position.x), z: Number(payload.position.z) },
            direction: { x: Number(payload.direction.x), z: Number(payload.direction.z) },
            isMoving: Boolean(payload.isMoving),
            isSitting: Boolean(payload.isSitting),
            audioEnabled: Boolean(payload.audioEnabled),
            videoEnabled: Boolean(payload.videoEnabled),
            avatar: sanitizeAvatar(payload.avatar),
          };
          publishPeers();
        } else if (payload.type === 'player-interaction' && ['hug', 'punch'].includes(payload.action)) {
          messagePeer.playerState = {
            ...messagePeer.playerState,
            interaction: payload.action,
            interactionAt: Date.now(),
            interactionTargetId: typeof payload.targetPeerId === 'string' ? payload.targetPeerId : null,
          };
          publishPeers();
        } else if (payload.type === 'avatar-state') {
          messagePeer.playerState = {
            ...messagePeer.playerState,
            avatar: sanitizeAvatar(payload.avatar),
          };
          publishPeers();
        } else if (payload.type === 'media-state') {
          messagePeer.playerState = {
            ...messagePeer.playerState,
            audioEnabled: Boolean(payload.audioEnabled),
            videoEnabled: Boolean(payload.videoEnabled),
          };
          publishPeers();
        } else if (payload.type === 'chat' && typeof payload.text === 'string') {
          appendMessage({ id: makeId(), sender: messagePeer.name, text: payload.text, mine: false });
        } else if (payload.type === 'werewolf-request-state' || payload.type === 'werewolf-command' || payload.type === 'werewolf-state') {
          handleWerewolfMessage(payload, messagePeer.peerId);
        } else if (payload.type === 'quiz-request-state' || payload.type === 'quiz-command' || payload.type === 'quiz-state') {
          handleQuizMessage(payload, messagePeer.peerId);
        } else if (payload.type === 'lucky-number-request-state' || payload.type === 'lucky-number-command' || payload.type === 'lucky-number-state') {
          handleLuckyNumberMessage(payload, messagePeer.peerId);
        } else if (payload.type === 'team-game-request-state' || payload.type === 'team-game-command' || payload.type === 'team-game-state') {
          handleTeamGameMessage(payload, messagePeer.peerId);
        } else if (payload.type && payload.type.startsWith('chess-match')) {
          handleChessMatchMessage(payload, messagePeer.peerId);
        }
      };
    };

    connection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal('ice-candidate', peerId, { candidate });
        if (socketRef.current instanceof LaravelSignalTransport) {
          const candidateType = candidate.candidate.match(/\btyp\s+(host|srflx|prflx|relay)\b/)?.[1] || 'unknown';
          sendSignal('peer-diagnostic', peerId, {
            diagnostic: { event: 'ice-candidate', candidateType },
          });
        }
      }
    };
    connection.onicecandidateerror = (event) => {
      if (socketRef.current instanceof LaravelSignalTransport) {
        sendSignal('peer-diagnostic', peerId, {
          diagnostic: { event: 'ice-candidate-error', errorCode: event.errorCode },
        });
      }
    };
    connection.ontrack = ({ track, streams }) => {
      track.enabled = peer.remoteMediaEnabled[track.kind];
      const remoteStream = streams?.[0] || new MediaStream([track]);
      if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY && localPeerIdRef.current !== roomLeaderIdRef.current) {
        const ownerId = streamOwnersRef.current.get(remoteStream.id);
        if (ownerId) {
          createVirtualPeer(ownerId).mediaStream = remoteStream;
        } else {
          pendingRemoteStreamsRef.current.set(remoteStream.id, remoteStream);
        }
      } else {
        peer.mediaStream = remoteStream;
      }

      if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY && localPeerIdRef.current === roomLeaderIdRef.current
        && peer.peerId !== roomLeaderIdRef.current) {
        streamOwnersRef.current.set(remoteStream.id, peer.peerId);
        sendToPeers({
          type: 'media-stream-owner',
          ownerPeerId: peer.peerId,
          streamId: remoteStream.id,
        });
        const forwardedTo = [];
        for (const recipient of peerConnectionsRef.current.values()) {
          if (recipient.peerId === peer.peerId || !recipient.connection) continue;
          let sender = recipient.forwardedMediaSenders?.get(`${peer.peerId}:${track.kind}`);
          if (!sender) {
            const transceiver = recipient.connection.addTransceiver(track, {
              direction: 'sendonly',
              streams: [remoteStream],
            });
            sender = transceiver.sender;
            recipient.forwardedMediaSenders ||= new Map();
            recipient.forwardedMediaSenders.set(`${peer.peerId}:${track.kind}`, sender);
            forwardedTo.push(recipient.peerId);
            createOfferRef.current?.(recipient.peerId, recipient.name).catch((error) => {
              setStatus(`Không thể chuyển tiếp media tới ${recipient.name}: ${error.message}`);
            });
          } else {
            forwardedTo.push(recipient.peerId);
            sender.replaceTrack(track).catch((error) => {
              setStatus(`Không thể cập nhật media của ${peer.name}: ${error.message}`);
            });
          }
        }
        if (forwardedTo.length) {
          recordNetworkEvent(peer.peerId, forwardedTo, `media-${track.kind}`, `${track.kind === 'audio' ? 'Âm thanh' : 'Video'} trực tiếp`);
        }
      }
      track.addEventListener('ended', () => {
        if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY && localPeerIdRef.current === roomLeaderIdRef.current) {
          for (const recipient of peerConnectionsRef.current.values()) {
            recipient.forwardedMediaSenders?.get(`${peer.peerId}:${track.kind}`)?.replaceTrack(null);
          }
        }
        const ownerId = streamOwnersRef.current.get(remoteStream.id);
        const mediaPeer = ownerId ? peerConnectionsRef.current.get(ownerId) || peer : peer;
        mediaPeer.mediaStream = new MediaStream(mediaPeer.mediaStream.getTracks().filter((item) => item.id !== track.id));
        publishPeers();
      });
      publishPeers();
    };
    connection.ondatachannel = ({ channel }) => attachChannel(channel);
    connection.onconnectionstatechange = () => {
      peer.connectionState = connection.connectionState;
      if (socketRef.current instanceof LaravelSignalTransport) {
        sendSignal('peer-diagnostic', peerId, {
          diagnostic: { event: 'connection-state', state: connection.connectionState },
        });
      }
      publishPeers();
    };
    connection.oniceconnectionstatechange = () => {
      if (socketRef.current instanceof LaravelSignalTransport) {
        sendSignal('peer-diagnostic', peerId, {
          diagnostic: { event: 'ice-connection-state', state: connection.iceConnectionState },
        });
      }
      publishPeers();
    };
    connection.onicegatheringstatechange = () => {
      if (socketRef.current instanceof LaravelSignalTransport) {
        sendSignal('peer-diagnostic', peerId, {
          diagnostic: { event: 'ice-gathering-state', state: connection.iceGatheringState },
        });
      }
    };
    connection.onsignalingstatechange = () => {
      if (socketRef.current instanceof LaravelSignalTransport) {
        sendSignal('peer-diagnostic', peerId, {
          diagnostic: { event: 'signaling-state', state: connection.signalingState },
        });
      }
      publishPeers();
    };
    peer.attachChannel = attachChannel;
    publishPeers();
    return peer;
  }, [appendMessage, createVirtualPeer, handleLuckyNumberMessage, handleQuizMessage, handleTeamGameMessage, handleChessMatchMessage, handleWerewolfMessage, publishPeers, recordNetworkEvent, sendSignal, sendToPeers]);

  const flushCandidates = useCallback(async (peer) => {
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate);
    }
  }, []);

  const createOffer = useCallback(async (peerId, name) => {
    const peer = createPeer(peerId, name);
    await peer.localTrackReady;
    if (peer.offerInFlight || peer.connection.signalingState !== 'stable') {
      peer.offerPending = true;
      return;
    }

    peer.offerInFlight = true;
    peer.offerPending = false;
    try {
      if (!peer.channel) peer.attachChannel(peer.connection.createDataChannel('office-room'));
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      sendSignal('offer', peerId, { offer });
    } finally {
      peer.offerInFlight = false;
      if (peer.offerPending && peer.connection.signalingState === 'stable') {
        peer.offerPending = false;
        await createOffer(peerId, peer.name);
      }
    }
  }, [createPeer, sendSignal]);
  createOfferRef.current = createOffer;

  const handleSignal = useCallback(async (message) => {
    if (message.type === 'joined') {
      setNetworkEvents([]);
      localPeerIdRef.current = message.peerId;
      setLocalPeerId(message.peerId);
      setRoomLeaderId(message.roomLeaderId || message.peerId);
      roomLeaderIdRef.current = message.roomLeaderId || message.peerId;
      setRoomTypeState(message.roomType || 'office');
      roomTypeRef.current = message.roomType || 'office';
      pendingWerewolfJoinRef.current = false;
      gameSessionRef.current = roomTypeRef.current === 'werewolf' && message.peerId === roomLeaderIdRef.current
        ? new WerewolfSession()
        : null;
      setGameState({ phase: 'lobby', players: [] });
      quizSessionRef.current = roomTypeRef.current === 'quiz' && message.peerId === roomLeaderIdRef.current
        ? new QuizSession()
        : null;
      setQuizState({ phase: 'lobby', players: [] });
      luckySessionRef.current = roomTypeRef.current === 'lucky-number' && message.peerId === roomLeaderIdRef.current
        ? new LuckyNumberSession()
        : null;
      if (luckySessionRef.current) {
        luckySessionRef.current.addPlayer(message.peerId, message.name || 'Khách');
        for (const peer of message.peers || []) luckySessionRef.current.addPlayer(peer.peerId, peer.name);
      }
      setLuckyNumberState({ phase: 'choosing', players: [] });
      teamSessionRef.current = roomTypeRef.current === 'teams' && message.peerId === roomLeaderIdRef.current
        ? new TeamSession()
        : null;
      if (teamSessionRef.current) {
        teamSessionRef.current.addPlayer(message.peerId, message.name || 'Khách');
        for (const peer of message.peers || []) teamSessionRef.current.addPlayer(peer.peerId, peer.name);
      }
      setTeamGameState({ phase: 'lobby', players: [], cards: [] });
      setLocalSpawn(loadSavedPosition(message.roomId) || message.spawn || DEFAULT_PLAYER_STATE.position);
      setInRoom(true);
      setStatus(`Đã vào phòng ${message.roomId}`);
      appendMessage({ id: makeId(), sender: 'System', text: `Đã vào phòng ${message.roomId}.`, mine: false });
      if (stateTimerRef.current) clearInterval(stateTimerRef.current);
      stateTimerRef.current = setInterval(() => {
        const playerState = makePlayerStateSnapshot(localStateRef.current);
        sendPlayerStateToPeers(playerState);
        if (roomTypeRef.current === 'werewolf' && localPeerIdRef.current === roomLeaderIdRef.current) {
          const session = gameSessionRef.current;
          if (session?.phase === 'collecting') {
            const positions = new Map([[localPeerIdRef.current, localStateRef.current.position]]);
            peerConnectionsRef.current.forEach((peer) => positions.set(peer.peerId, peer.playerState.position));
            if (session.tick(positions)) {
              publishWerewolfState();
              if (session.phase === 'night') scheduleWerewolfTimer();
            }
          }
        }
        if (roomTypeRef.current === 'teams' && localPeerIdRef.current === roomLeaderIdRef.current) {
          const session = teamSessionRef.current;
          if (session?.phase === 'collecting') {
            const now = Date.now();
            const delta = Math.min((now - teamLastTickRef.current) / 1000, 0.1);
            teamLastTickRef.current = now;
            const positions = new Map([[localPeerIdRef.current, localStateRef.current.position]]);
            peerConnectionsRef.current.forEach((peer) => positions.set(peer.peerId, peer.playerState.position));
            session.tick(positions, delta, teamsFloorPlan.layout.arena);
            if (session.phase === 'finished' || now - teamLastPublishRef.current >= 100) {
              teamLastPublishRef.current = now;
              publishTeamGameState();
            }
          }
        }
      }, 50);

      for (const peerInfo of message.peers || []) {
        if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY && peerInfo.peerId !== message.roomLeaderId) {
          createVirtualPeer(peerInfo.peerId, peerInfo.name, peerInfo.spawn);
          continue;
        }
        createPeer(peerInfo.peerId, peerInfo.name, peerInfo.spawn);
        if (shouldConnectPeer(NETWORK_TOPOLOGY, message.peerId, message.roomLeaderId, peerInfo.peerId)
          && (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY
            ? message.peerId === message.roomLeaderId
            : message.peerId < peerInfo.peerId)) {
          await createOffer(peerInfo.peerId, peerInfo.name);
        } else {
          publishPeers();
        }
      }
      return;
    }

    if (message.type === 'peer-joined') {
      if (message.roomLeaderId) setRoomLeaderId(message.roomLeaderId);
      if (message.roomType) setRoomTypeState(message.roomType);
      if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY
        && localPeerIdRef.current !== roomLeaderIdRef.current
        && message.peerId !== roomLeaderIdRef.current) {
        createVirtualPeer(message.peerId, message.name, message.spawn);
      } else {
        createPeer(message.peerId, message.name, message.spawn);
      }
      if (roomTypeRef.current === 'lucky-number' && localPeerIdRef.current === roomLeaderIdRef.current) {
        if (luckySessionRef.current?.addPlayer(message.peerId, message.name || 'Khách')) {
          publishLuckyNumberState();
        }
      }
      if (roomTypeRef.current === 'teams' && localPeerIdRef.current === roomLeaderIdRef.current
        && teamSessionRef.current?.addPlayer(message.peerId, message.name || 'Khách')) {
        publishTeamGameState();
      }
      appendMessage({ id: makeId(), sender: 'System', text: `${message.name || 'Người chơi'} đã vào phòng.`, mine: false });
      if (localPeerIdRef.current
        && shouldConnectPeer(NETWORK_TOPOLOGY, localPeerIdRef.current, roomLeaderIdRef.current, message.peerId)
        && (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY
          ? localPeerIdRef.current === roomLeaderIdRef.current
          : localPeerIdRef.current < message.peerId)) {
        await createOffer(message.peerId, message.name);
      }
      return;
    }

    if (message.type === 'renegotiate') {
      const peer = peerConnectionsRef.current.get(message.from);
      if (peer && (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY
        ? localPeerIdRef.current === roomLeaderIdRef.current
        : localPeerIdRef.current < message.from)) {
        await createOffer(message.from, peer.name);
      }
      return;
    }

    if (message.type === 'offer') {
      const peer = createPeer(message.from);
      await peer.localTrackReady;
      await peer.connection.setRemoteDescription(message.offer);
      await flushCandidates(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      sendSignal('answer', message.from, { answer });
      return;
    }

    if (message.type === 'answer') {
      const peer = peerConnectionsRef.current.get(message.from);
      if (peer && peer.connection.signalingState === 'have-local-offer') {
        await peer.connection.setRemoteDescription(message.answer);
        await flushCandidates(peer);
        if (peer.offerPending) await createOffer(peer.peerId, peer.name);
      }
      return;
    }

    if (message.type === 'ice-candidate') {
      const peer = peerConnectionsRef.current.get(message.from);
      if (peer) {
        if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(message.candidate);
        else peer.pendingCandidates.push(message.candidate);
      }
      return;
    }

    if (message.type === 'peer-left') {
      const wasLeader = message.peerId === roomLeaderIdRef.current;
      setRoomLeaderId(message.roomLeaderId || null);
      roomLeaderIdRef.current = message.roomLeaderId || null;
      if (message.roomType) setRoomTypeState(message.roomType);
      destroyPeer(message.peerId);
      if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY && wasLeader && message.roomLeaderId) {
        if (localPeerIdRef.current === message.roomLeaderId) {
          for (const peer of [...peerConnectionsRef.current.values()]) {
            if (peer.peerId === localPeerIdRef.current) continue;
            createPeer(peer.peerId, peer.name, peer.playerState.position);
            await createOffer(peer.peerId, peer.name);
          }
        } else {
          const nextLeader = peerConnectionsRef.current.get(message.roomLeaderId);
          if (nextLeader && !nextLeader.connection) {
            createPeer(nextLeader.peerId, nextLeader.name, nextLeader.playerState.position);
          }
        }
      }
      if (wasLeader && localPeerIdRef.current === roomLeaderIdRef.current && roomTypeRef.current === 'werewolf') {
        if (gameTimerRef.current) clearTimeout(gameTimerRef.current);
        gameSessionRef.current = new WerewolfSession();
        publishWerewolfState();
      } else if (!wasLeader && localPeerIdRef.current === roomLeaderIdRef.current && gameSessionRef.current) {
        gameSessionRef.current.leave(message.peerId);
        publishWerewolfState();
      }
      if (roomTypeRef.current === 'quiz' && localPeerIdRef.current === roomLeaderIdRef.current) {
        if (wasLeader) {
          if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
          quizSessionRef.current = new QuizSession();
        } else {
          quizSessionRef.current?.leave(message.peerId);
        }
        publishQuizState();
        scheduleQuizTimer();
      }
      if (roomTypeRef.current === 'lucky-number' && localPeerIdRef.current === roomLeaderIdRef.current) {
        if (wasLeader) {
          if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current);
          luckySessionRef.current = new LuckyNumberSession();
          luckySessionRef.current.addPlayer(localPeerIdRef.current, nameRef.current || 'Khách');
          peerConnectionsRef.current.forEach((peer) => luckySessionRef.current.addPlayer(peer.peerId, peer.name));
        } else {
          luckySessionRef.current?.leave(message.peerId);
        }
        publishLuckyNumberState();
        scheduleLuckyNumberTimer();
      }
      if (roomTypeRef.current === 'teams' && localPeerIdRef.current === roomLeaderIdRef.current) {
        if (wasLeader) {
          teamSessionRef.current = new TeamSession();
          teamSessionRef.current.addPlayer(localPeerIdRef.current, nameRef.current || 'Khách');
          peerConnectionsRef.current.forEach((peer) => teamSessionRef.current.addPlayer(peer.peerId, peer.name));
        } else {
          teamSessionRef.current?.leave(message.peerId);
        }
        publishTeamGameState();
      }
      return;
    }

    if (message.type === 'room-updated') {
      setRoomLeaderId(message.roomLeaderId || null);
      roomLeaderIdRef.current = message.roomLeaderId || null;
      setRoomTypeState(message.roomType || 'office');
      roomTypeRef.current = message.roomType || 'office';
      pendingWerewolfJoinRef.current = false;
      if (gameTimerRef.current) clearTimeout(gameTimerRef.current);
      gameTimerRef.current = null;
      gameSessionRef.current = null;
      setGameState({ phase: 'lobby', players: [] });
      if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
      quizTimerRef.current = null;
      quizSessionRef.current = null;
      setQuizState({ phase: 'lobby', players: [] });
      if (roomTypeRef.current === 'quiz' && localPeerIdRef.current === roomLeaderIdRef.current) {
        quizSessionRef.current = new QuizSession();
      }
      teamSessionRef.current = null;
      setTeamGameState({ phase: 'lobby', players: [], cards: [] });
      if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current);
      luckyTimerRef.current = null;
      luckySessionRef.current = null;
      setLuckyNumberState({ phase: 'choosing', players: [] });
      if (roomTypeRef.current === 'lucky-number' && localPeerIdRef.current === roomLeaderIdRef.current) {
        luckySessionRef.current = new LuckyNumberSession();
        luckySessionRef.current.addPlayer(localPeerIdRef.current, nameRef.current || 'Khách');
        peerConnectionsRef.current.forEach((peer) => luckySessionRef.current.addPlayer(peer.peerId, peer.name));
        publishLuckyNumberState();
      }
      teamSessionRef.current = null;
      if (roomTypeRef.current === 'teams' && localPeerIdRef.current === roomLeaderIdRef.current) {
        teamSessionRef.current = new TeamSession();
        teamSessionRef.current.addPlayer(localPeerIdRef.current, nameRef.current || 'Khách');
        peerConnectionsRef.current.forEach((peer) => teamSessionRef.current.addPlayer(peer.peerId, peer.name));
        publishTeamGameState();
      }
      if (message.spawn) setLocalSpawn(message.spawn);
      return;
    }

    if (message.type === 'room-update-rejected') {
      setStatus(message.message || 'Không thể cập nhật phòng.');
      return;
    }

    if (message.type === 'error' || message.type === 'full') {
      setStatus(message.message || 'Lỗi signaling.');
      socketRef.current?.close();
    }
  }, [appendMessage, createOffer, createPeer, createVirtualPeer, destroyPeer, flushCandidates, publishLuckyNumberState, publishPeers, publishQuizState, publishTeamGameState, publishWerewolfState, scheduleLuckyNumberTimer, scheduleQuizTimer, scheduleWerewolfTimer, sendPlayerStateToPeers, sendSignal, sendToPeers]);

  const leaveRoom = useCallback(() => {
    sessionRef.current += 1;
    mediaSessionRef.current += 1;
    if (stateTimerRef.current) clearInterval(stateTimerRef.current);
    stateTimerRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    setNetworkEvents([]);
    for (const peerId of [...peerConnectionsRef.current.keys()]) {
      const peer = peerConnectionsRef.current.get(peerId);
      peer?.channel?.close();
      peer?.connection?.close();
    }
    peerConnectionsRef.current.clear();
    setPeers([]);
    setInRoom(false);
    setRoomLeaderId(null);
    roomLeaderIdRef.current = null;
    setRoomTypeState('office');
    roomTypeRef.current = 'office';
    pendingWerewolfJoinRef.current = false;
    if (gameTimerRef.current) clearTimeout(gameTimerRef.current);
    gameTimerRef.current = null;
    gameSessionRef.current = null;
    setGameState({ phase: 'lobby', players: [] });
    if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
    quizTimerRef.current = null;
    quizSessionRef.current = null;
    setQuizState({ phase: 'lobby', players: [] });
    if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current);
    luckyTimerRef.current = null;
    luckySessionRef.current = null;
    setLuckyNumberState({ phase: 'choosing', players: [] });
    teamSessionRef.current = null;
    setTeamGameState({ phase: 'lobby', players: [], cards: [] });
    setLocalSpawn(DEFAULT_PLAYER_STATE.position);
    for (const track of Object.values(localTracksRef.current)) track?.stop();
    localTracksRef.current = { audio: null, video: null };
    localMediaStreamRef.current = null;
    streamOwnersRef.current.clear();
    pendingRemoteStreamsRef.current.clear();
    setLocalMediaStream(null);
    setAudioEnabled(false);
    setVideoEnabled(false);
    mediaStateRef.current = { audioEnabled: false, videoEnabled: false };
    localPeerIdRef.current = null;
    setLocalPeerId(null);
    setStatus('Đã rời phòng');
    roomRef.current = '';
  }, []);

  const joinRoom = useCallback((roomId, displayName) => {
    leaveRoom();
    const sessionId = sessionRef.current;
    const normalizedRoom = roomId.trim().toLowerCase();
    const normalizedName = displayName.trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!normalizedRoom || !normalizedName) {
      setStatus('Nhập mã phòng và tên hiển thị.');
      return Promise.reject(new Error('Room code and display name are required.'));
    }

    roomRef.current = normalizedRoom;
    nameRef.current = normalizedName;
    setStatus('Đang kết nối signaling...');

    return new Promise((resolve, reject) => {
      const useLaravelSignaling = import.meta.env.VITE_SIGNAL_TRANSPORT === 'laravel';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const signalUrl = import.meta.env.VITE_SIGNAL_URL || `${protocol}//${window.location.host}/signal`;
      const socket = useLaravelSignaling
        ? new LaravelSignalTransport('/api/office-game/signal')
        : new WebSocket(signalUrl);
      socketRef.current = socket;
      let settled = false;

      socket.onopen = () => {
        if (sessionId !== sessionRef.current) return;
        if (!useLaravelSignaling) {
          socket.send(JSON.stringify({ type: 'join', roomId: normalizedRoom, name: normalizedName }));
        }
      };
      socket.onmessage = async ({ data }) => {
        if (sessionId !== sessionRef.current) return;
        try {
          const message = JSON.parse(data);
          await handleSignal(message);
          if (message.type === 'joined' && !settled) {
            settled = true;
            resolve(message);
          } else if ((message.type === 'error' || message.type === 'full') && !settled) {
            settled = true;
            reject(new Error(message.message || 'Không thể vào phòng.'));
          }
        } catch (error) {
          setStatus('Lỗi khi thiết lập kết nối WebRTC.');
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      };
      socket.onerror = () => {
        if (sessionId !== sessionRef.current) return;
        setStatus('Không thể kết nối signaling server.');
        if (!settled) {
          settled = true;
          reject(new Error('Signaling server is unavailable.'));
        }
      };
      socket.onclose = () => {
        if (sessionId !== sessionRef.current) return;
        if (stateTimerRef.current) clearInterval(stateTimerRef.current);
        stateTimerRef.current = null;
        for (const peerId of [...peerConnectionsRef.current.keys()]) {
          const peer = peerConnectionsRef.current.get(peerId);
          peer?.channel?.close();
          peer?.connection?.close();
        }
        peerConnectionsRef.current.clear();
        setPeers([]);
        setInRoom(false);
        setRoomLeaderId(null);
        roomLeaderIdRef.current = null;
        setRoomTypeState('office');
        roomTypeRef.current = 'office';
        pendingWerewolfJoinRef.current = false;
        if (gameTimerRef.current) clearTimeout(gameTimerRef.current);
        gameTimerRef.current = null;
        gameSessionRef.current = null;
        setGameState({ phase: 'lobby', players: [] });
        if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
        quizTimerRef.current = null;
        quizSessionRef.current = null;
        setQuizState({ phase: 'lobby', players: [] });
        if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current);
        luckyTimerRef.current = null;
        luckySessionRef.current = null;
        setLuckyNumberState({ phase: 'choosing', players: [] });
        teamSessionRef.current = null;
        setTeamGameState({ phase: 'lobby', players: [], cards: [] });
        setLocalSpawn(DEFAULT_PLAYER_STATE.position);
        localPeerIdRef.current = null;
        setLocalPeerId(null);
        if (!settled) {
          settled = true;
          reject(new Error('Kết nối signaling đã đóng.'));
        }
        setStatus('Signaling đã ngắt kết nối.');
      };
      if (useLaravelSignaling) socket.connect(normalizedRoom, normalizedName);
    });
  }, [handleSignal, leaveRoom]);

  const sendChat = useCallback((text) => {
    if (!inRoom || !text.trim()) return false;
    const ownPlayer = gameState.players?.find((player) => player.peerId === localPeerIdRef.current);
    if (roomType === 'werewolf' && ownPlayer && !ownPlayer.alive && gameState.phase !== 'lobby' && gameState.phase !== 'finished') return false;
    const message = { type: 'chat', text: text.trim() };
    const openChannels = [...peerConnectionsRef.current.values()].filter((peer) => peer.channel?.readyState === 'open');
    if (peers.length > 0 && openChannels.length === 0) return false;
    sendToPeers(message);
    appendMessage({ id: makeId(), sender: nameRef.current, text: text.trim(), mine: true });
    return true;
  }, [appendMessage, gameState, inRoom, peers.length, roomType, sendToPeers]);

  const changeRoomType = useCallback((nextRoomType) => {
    const socket = socketRef.current;
    if (!inRoom || socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: 'set-room-type', roomType: nextRoomType }));
    return true;
  }, [inRoom]);

  const sendWerewolfCommand = useCallback((command, payload = {}) => {
    if (!inRoom || roomTypeRef.current !== 'werewolf') return false;
    const localId = localPeerIdRef.current;
    if (localId === roomLeaderIdRef.current) return handleWerewolfCommand(localId, command, payload);
    const hostConnection = peerConnectionsRef.current.get(roomLeaderIdRef.current);
    if (command === 'join' && hostConnection?.channel?.readyState !== 'open') {
      pendingWerewolfJoinRef.current = true;
      return true;
    }
    sendToPeers({ type: 'werewolf-command', command, ...payload });
    return true;
  }, [handleWerewolfCommand, inRoom, sendToPeers]);

  // PvP chess-match: route a command to the leader (who owns the session).
  const sendChessMatchCommand = useCallback((command, payload = {}) => {
    if (!inRoom) return false;
    const localId = localPeerIdRef.current;
    if (localId === roomLeaderIdRef.current) handleChessMatchCommand(localId, command, payload);
    else sendToPeers({ type: 'chess-match-command', command, ...payload });
    return true;
  }, [inRoom, handleChessMatchCommand, sendToPeers]);

  // Convenience wrappers used by the UI.
  const inviteToChess = useCallback((toPeerId, game) => sendChessMatchCommand('invite', { toPeerId, game }), [sendChessMatchCommand]);
  const acceptChessInvite = useCallback(() => {
    if (!chessInvite) return false;
    sendChessMatchCommand('accept', { fromPeerId: chessInvite.fromPeerId, game: chessInvite.game });
    setChessInvite(null);
    return true;
  }, [chessInvite, sendChessMatchCommand]);
  const declineChessInvite = useCallback(() => {
    if (!chessInvite) return false;
    sendChessMatchCommand('decline', { fromPeerId: chessInvite.fromPeerId });
    setChessInvite(null);
    return true;
  }, [chessInvite, sendChessMatchCommand]);
  const sendChessMove = useCallback((move) => sendChessMatchCommand('move', { move }), [sendChessMatchCommand]);
  const leaveChessMatch = useCallback(() => sendChessMatchCommand('leave', {}), [sendChessMatchCommand]);

  const sendQuizCommand = useCallback((command, payload = {}) => {
    if (!inRoom || roomTypeRef.current !== 'quiz') return false;
    const localId = localPeerIdRef.current;
    if (localId !== roomLeaderIdRef.current) return false;
    return handleQuizCommand(localId, command, payload);
  }, [handleQuizCommand, inRoom]);

  const sendLuckyNumberCommand = useCallback((command, payload = {}) => {
    if (!inRoom || roomTypeRef.current !== 'lucky-number') return false;
    const localId = localPeerIdRef.current;
    if (command === 'set-number') {
      if (localId === roomLeaderIdRef.current) {
        return handleLuckyNumberCommand(localId, command, payload);
      }
      const leader = peerConnectionsRef.current.get(roomLeaderIdRef.current);
      if (leader?.channel?.readyState !== 'open') return false;
      leader.channel.send(JSON.stringify({
        type: 'lucky-number-command',
        command,
        number: payload.number,
      }));
      return true;
    }
    if (localId !== roomLeaderIdRef.current) return false;
    return handleLuckyNumberCommand(localId, command, payload);
  }, [handleLuckyNumberCommand, inRoom, sendToPeers]);

  const sendTeamGameCommand = useCallback((command, payload = {}) => {
    if (!inRoom || roomTypeRef.current !== 'teams'
      || localPeerIdRef.current !== roomLeaderIdRef.current) return false;
    return handleTeamGameCommand(localPeerIdRef.current, command, payload);
  }, [handleTeamGameCommand, inRoom]);

  const sendPlayerState = useCallback((playerState) => {
    if (roomRef.current && Number.isFinite(playerState.position?.x) && Number.isFinite(playerState.position?.z)) {
      try {
        localStorage.setItem(positionStorageKey(roomRef.current), JSON.stringify({
          x: playerState.position.x,
          z: playerState.position.z,
        }));
      } catch {
        // Position persistence is optional when storage is unavailable.
      }
    }
    localStateRef.current = { ...playerState, ...mediaStateRef.current, avatar: localAvatarRef.current };
  }, []);

  const sendPlayerInteraction = useCallback((action, targetPeerId) => {
    if (!inRoom || !['hug', 'punch'].includes(action) || typeof targetPeerId !== 'string') return false;
    sendToPeers({ type: 'player-interaction', action, targetPeerId });
    return true;
  }, [inRoom, sendToPeers]);

  useEffect(() => {
    const nextAvatar = sanitizeAvatar(localAvatar);
    localAvatarRef.current = nextAvatar;
    localStateRef.current = { ...localStateRef.current, avatar: nextAvatar };
    sendToPeers({ type: 'avatar-state', avatar: nextAvatar });
  }, [localAvatar, sendToPeers]);

  const toggleMedia = useCallback(async (kind) => {
    const track = localTracksRef.current[kind];
    const setEnabled = kind === 'audio' ? setAudioEnabled : setVideoEnabled;
    const publishMediaState = (enabled) => {
      const nextState = {
        ...localStateRef.current,
        [`${kind}Enabled`]: enabled,
      };
      mediaStateRef.current = {
        ...mediaStateRef.current,
        [`${kind}Enabled`]: enabled,
      };
      localStateRef.current = nextState;
      sendToPeers({ type: 'media-state', audioEnabled: Boolean(nextState.audioEnabled), videoEnabled: Boolean(nextState.videoEnabled) });
    };
    if (track) {
      track.enabled = !track.enabled;
      setEnabled(track.enabled);
      publishMediaState(track.enabled);
      setMediaError('');
      return;
    }

    const mediaSession = mediaSessionRef.current;
    setMediaPending(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(window.isSecureContext
          ? 'Browser này không cung cấp quyền truy cập media. Hãy thử Chrome hoặc Edge mới nhất.'
          : 'Mic/camera cần HTTPS. Trên cùng máy hãy mở bằng localhost; truy cập qua IP/LAN cần HTTPS.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: kind === 'audio', video: kind === 'video' });
      if (mediaSession !== mediaSessionRef.current) {
        stream.getTracks().forEach((item) => item.stop());
        return;
      }
      const acquiredTrack = stream.getTracks()[0];
      localTracksRef.current[kind] = acquiredTrack;
      acquiredTrack.enabled = true;

      const localStream = localMediaStreamRef.current || new MediaStream();
      if (!localStream.getTracks().some((track) => track.id === acquiredTrack.id)) {
        localStream.addTrack(acquiredTrack);
      }
      localMediaStreamRef.current = localStream;
      streamOwnersRef.current.set(localStream.id, localPeerIdRef.current);
      setLocalMediaStream(new MediaStream(localStream.getTracks()));
      setEnabled(true);
      publishMediaState(true);
      sendToPeers({
        type: 'media-stream-owner',
        ownerPeerId: localPeerIdRef.current,
        streamId: localStream.id,
      });
      setMediaError('');

      for (const peer of peerConnectionsRef.current.values()) {
        if (!peer.connection) continue;
        const transceivers = [
          [peer.audioTransceiver, localTracksRef.current.audio],
          [peer.videoTransceiver, localTracksRef.current.video],
        ];
        for (const [transceiver, track] of transceivers) {
          await transceiver.sender.replaceTrack(track);
          if (transceiver.sender.setStreams) transceiver.sender.setStreams(localStream);
        }
        if (NETWORK_TOPOLOGY === LEADER_RELAY_TOPOLOGY
          ? localPeerIdRef.current === roomLeaderIdRef.current
          : localPeerIdRef.current < peer.peerId) {
          await createOffer(peer.peerId, peer.name);
        } else {
          sendSignal('renegotiate', peer.peerId);
        }
      }
    } catch (error) {
      const deviceName = kind === 'audio' ? 'microphone' : 'camera';
      const message = error.name === 'NotAllowedError'
        ? `Quyền ${deviceName} bị từ chối. Hãy cho phép thiết bị trong cài đặt trang.`
        : error.name === 'NotFoundError'
          ? `Không tìm thấy ${deviceName} trên thiết bị này.`
          : error.name === 'NotReadableError'
            ? `${deviceName} đang được ứng dụng khác sử dụng.`
            : error.message || `Không thể bật ${deviceName}.`;
      setMediaError(message);
    } finally {
      setMediaPending(false);
    }
  }, [createOffer, sendSignal, sendToPeers]);

  const toggleAudio = useCallback(() => toggleMedia('audio'), [toggleMedia]);
  const toggleVideo = useCallback(() => toggleMedia('video'), [toggleMedia]);

  const togglePeerMedia = useCallback((peerId, kind) => {
    const peer = peerConnectionsRef.current.get(peerId);
    if (!peer || !['audio', 'video'].includes(kind)) return;

    peer.remoteMediaEnabled[kind] = !peer.remoteMediaEnabled[kind];
    const tracks = kind === 'audio'
      ? peer.mediaStream.getAudioTracks()
      : peer.mediaStream.getVideoTracks();
    tracks.forEach((track) => {
      track.enabled = peer.remoteMediaEnabled[kind];
    });
    publishPeers();
  }, [publishPeers]);

  useEffect(() => () => {
    sessionRef.current += 1;
    mediaSessionRef.current += 1;
    if (stateTimerRef.current) clearInterval(stateTimerRef.current);
    if (gameTimerRef.current) clearTimeout(gameTimerRef.current);
    if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
    if (luckyTimerRef.current) clearTimeout(luckyTimerRef.current);
    socketRef.current?.close();
    for (const peer of peerConnectionsRef.current.values()) {
      peer.channel?.close();
      peer.connection?.close();
    }
    Object.values(localTracksRef.current).forEach((track) => track?.stop());
    if (quizTimerRef.current) clearTimeout(quizTimerRef.current);
  }, []);

  return {
    inRoom,
    localPeerId,
    roomLeaderId,
    roomType,
    gameState,
    quizState,
    luckyNumberState,
    teamGameState,
    chessMatch,
    chessInvite,
    localSpawn,
    peers,
    messages,
    networkEvents,
    networkTopology: NETWORK_TOPOLOGY,
    status,
    audioEnabled,
    videoEnabled,
    mediaPending,
    localMediaStream,
    mediaError,
    joinRoom,
    leaveRoom,
    changeRoomType,
    sendWerewolfCommand,
    sendQuizCommand,
    sendLuckyNumberCommand,
    sendTeamGameCommand,
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
  };
}
