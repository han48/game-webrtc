import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getOverflowSpawn, getSpawnPoints } from '../src/game/floor-plan.js';

const floorPlans = {
  office: JSON.parse(readFileSync(new URL('../src/floor-plan.json', import.meta.url), 'utf8')),
  werewolf: JSON.parse(readFileSync(new URL('../src/werewolf-floor-plan.json', import.meta.url), 'utf8')),
  quiz: JSON.parse(readFileSync(new URL('../src/quiz-floor-plan.json', import.meta.url), 'utf8')),
  'lucky-number': JSON.parse(readFileSync(new URL('../src/lucky-floor-plan.json', import.meta.url), 'utf8')),
  teams: JSON.parse(readFileSync(new URL('../src/teams-floor-plan.json', import.meta.url), 'utf8')),
  'chess-room': JSON.parse(readFileSync(new URL('../src/chess-floor-plan.json', import.meta.url), 'utf8')),
  concert: JSON.parse(readFileSync(new URL('../src/concert-floor-plan.json', import.meta.url), 'utf8')),
};

export function attachRoomProtocol(webSocketServer) {
  const rooms = new Map();

  function send(socket, message) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  function broadcast(room, sender, message) {
    room.peers.forEach((peer) => {
      if (peer !== sender) send(peer, message);
    });
  }

  function getRoomLeaderId(room) {
    return room.peers.keys().next().value || null;
  }

  function leaveRoom(socket) {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (room) {
      const peerName = socket.displayName || 'Người dùng';
      room.peers.delete(socket.peerId);
      broadcast(room, socket, {
        type: 'peer-left',
        peerId: socket.peerId,
        name: peerName,
        roomLeaderId: getRoomLeaderId(room),
        roomType: room.roomType,
      });
      if (room.peers.size === 0) rooms.delete(socket.roomId);
    }
    socket.roomId = null;
    socket.peerId = null;
    socket.displayName = null;
    socket.spawn = null;
  }

  webSocketServer.on('connection', (socket) => {
    socket.on('message', (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        send(socket, { type: 'error', message: 'Tin nhắn signaling không hợp lệ.' });
        return;
      }

      if (message.type === 'join') {
        const roomId = String(message.roomId || '').trim().toLowerCase();
        const displayName = String(message.name || '').replace(/\s+/g, ' ').trim().slice(0, 32) || 'Khách';
        if (!roomId || roomId.length > 48) {
          send(socket, { type: 'error', message: 'Mã phòng không hợp lệ.' });
          return;
        }

        leaveRoom(socket);
        const room = rooms.get(roomId) || { peers: new Map(), roomType: 'office' };
        const peerId = randomUUID();
        const floorPlan = floorPlans[room.roomType];
        const spawnPoints = getSpawnPoints(floorPlan);
        const assignedSpawns = new Set([...room.peers.values()].map((peer) => `${peer.spawn.x},${peer.spawn.z}`));
        const spawn = spawnPoints.find((point) => !assignedSpawns.has(`${point.x},${point.z}`))
          || getOverflowSpawn(floorPlan, room.peers.size - spawnPoints.length);
        const existingPeers = [...room.peers].map(([existingPeerId, peer]) => ({
          peerId: existingPeerId,
          name: peer.displayName,
          spawn: peer.spawn,
        }));
        room.peers.set(peerId, socket);
        rooms.set(roomId, room);
        socket.roomId = roomId;
        socket.peerId = peerId;
        socket.displayName = displayName;
        socket.spawn = spawn;
        send(socket, {
          type: 'joined',
          roomId,
          peerId,
          name: displayName,
          spawn,
          peers: existingPeers,
          roomLeaderId: getRoomLeaderId(room),
          roomType: room.roomType,
        });
        broadcast(room, socket, {
          type: 'peer-joined',
          peerId,
          name: displayName,
          spawn,
          roomLeaderId: getRoomLeaderId(room),
          roomType: room.roomType,
        });
        return;
      }

      if (!socket.roomId) {
        send(socket, { type: 'error', message: 'Hãy vào phòng trước.' });
        return;
      }

      if (message.type === 'set-room-type') {
        const room = rooms.get(socket.roomId);
        if (socket.peerId !== getRoomLeaderId(room)) {
          send(socket, { type: 'room-update-rejected', message: 'Chỉ trưởng phòng mới có thể đổi loại phòng.' });
          return;
        }
        const floorPlan = floorPlans[message.roomType];
        if (!floorPlan) {
          send(socket, { type: 'room-update-rejected', message: 'Loại phòng không hợp lệ.' });
          return;
        }

        room.roomType = message.roomType;
        const spawnPoints = getSpawnPoints(floorPlan);
        [...room.peers.values()].forEach((peer, index) => {
          peer.spawn = spawnPoints[index] || getOverflowSpawn(floorPlan, index - spawnPoints.length);
          send(peer, {
            type: 'room-updated',
            roomLeaderId: getRoomLeaderId(room),
            roomType: room.roomType,
            spawn: peer.spawn,
          });
        });
        return;
      }

      if (['offer', 'answer', 'ice-candidate', 'renegotiate'].includes(message.type)) {
        const room = rooms.get(socket.roomId);
        const recipient = room?.peers.get(message.to);
        if (!recipient) return;

        const relayedMessage = { type: message.type, from: socket.peerId };
        if (message.type === 'ice-candidate') relayedMessage.candidate = message.candidate;
        else if (message.type !== 'renegotiate') relayedMessage[message.type] = message[message.type];
        send(recipient, relayedMessage);
      }
    });

    socket.on('close', () => leaveRoom(socket));
  });
}
