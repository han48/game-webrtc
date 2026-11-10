import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { WebSocket, WebSocketServer } from 'ws';
import { attachRoomProtocol } from './room-protocol.js';
import { getSpawnPoints } from '../src/game/floor-plan.js';

const floorPlan = JSON.parse(readFileSync(new URL('../src/floor-plan.json', import.meta.url), 'utf8'));
const werewolfFloorPlan = JSON.parse(readFileSync(new URL('../src/werewolf-floor-plan.json', import.meta.url), 'utf8'));
const gameFloorPlans = {
  quiz: JSON.parse(readFileSync(new URL('../src/quiz-floor-plan.json', import.meta.url), 'utf8')),
  'lucky-number': JSON.parse(readFileSync(new URL('../src/lucky-floor-plan.json', import.meta.url), 'utf8')),
  teams: JSON.parse(readFileSync(new URL('../src/teams-floor-plan.json', import.meta.url), 'utf8')),
  'chess-room': JSON.parse(readFileSync(new URL('../src/chess-floor-plan.json', import.meta.url), 'utf8')),
};

let server;
let webSocketServer;
const clients = [];

function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      clearTimeout(timeout);
      target.off(eventName, onEvent);
      reject(error);
    };
    const onEvent = (...args) => {
      clearTimeout(timeout);
      target.off('error', onError);
      resolve(args);
    };
    const timeout = setTimeout(() => {
      target.off(eventName, onEvent);
      target.off('error', onError);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 3000);
    target.once(eventName, onEvent);
    target.once('error', onError);
  });
}

async function createClient() {
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/signal`);
  clients.push(client);
  await waitForEvent(client, 'open');
  return client;
}

function receiveJson(client) {
  return waitForEvent(client, 'message').then(([data]) => JSON.parse(data.toString()));
}

describe('room signaling protocol', () => {
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.terminate());
    if (webSocketServer) await new Promise((resolve) => webSocketServer.close(resolve));
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    webSocketServer = null;
    server = null;
  });

  it('keeps three members in one room and relays peer offers', async () => {
    server = http.createServer();
    webSocketServer = new WebSocketServer({ server });
    attachRoomProtocol(webSocketServer);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const first = await createClient();
    const firstJoinedPromise = receiveJson(first);
    first.send(JSON.stringify({ type: 'join', roomId: 'qa-room', name: 'First' }));
    const firstJoined = await firstJoinedPromise;

    const second = await createClient();
    const joinedNoticePromise = receiveJson(first);
    const secondJoinedPromise = receiveJson(second);
    second.send(JSON.stringify({ type: 'join', roomId: 'qa-room', name: 'Second' }));
    const [joinedNotice, secondJoined] = await Promise.all([joinedNoticePromise, secondJoinedPromise]);

    expect(joinedNotice.type).toBe('peer-joined');
    expect(firstJoined.spawn).toEqual(floorPlan.entrance.spawn);
    expect(secondJoined.spawn).toEqual({
      x: floorPlan.entrance.spawn.x + floorPlan.spawnOffsets[1].x,
      z: floorPlan.entrance.spawn.z + floorPlan.spawnOffsets[1].z,
    });
    expect(firstJoined.spawn).not.toEqual(secondJoined.spawn);
    expect(secondJoined.peers).toHaveLength(1);
    expect(firstJoined.roomLeaderId).toBe(firstJoined.peerId);
    expect(secondJoined.roomLeaderId).toBe(firstJoined.peerId);
    expect(secondJoined.roomType).toBe('office');

    const offer = { type: 'offer', to: firstJoined.peerId, offer: { type: 'offer', sdp: 'test-sdp' } };
    const relayedOfferPromise = receiveJson(first);
    second.send(JSON.stringify(offer));
    const relayedOffer = await relayedOfferPromise;

    expect(relayedOffer).toMatchObject({
      type: 'offer',
      from: secondJoined.peerId,
      offer: offer.offer,
    });

    const renegotiatePromise = receiveJson(first);
    second.send(JSON.stringify({ type: 'renegotiate', to: firstJoined.peerId }));
    expect(await renegotiatePromise).toMatchObject({
      type: 'renegotiate',
      from: secondJoined.peerId,
    });

    const third = await createClient();
    const firstThirdNoticePromise = receiveJson(first);
    const secondThirdNoticePromise = receiveJson(second);
    const thirdJoinedPromise = receiveJson(third);
    third.send(JSON.stringify({ type: 'join', roomId: 'qa-room', name: 'Third' }));
    const [firstThirdNotice, secondThirdNotice, thirdJoined] = await Promise.all([
      firstThirdNoticePromise,
      secondThirdNoticePromise,
      thirdJoinedPromise,
    ]);

    expect(firstThirdNotice).toMatchObject({ type: 'peer-joined', name: 'Third' });
    expect(secondThirdNotice).toMatchObject({ type: 'peer-joined', name: 'Third' });
    expect(thirdJoined.peers).toHaveLength(2);
    expect(thirdJoined.peers.map((peer) => peer.name)).toEqual(['First', 'Second']);
    expect(thirdJoined.roomLeaderId).toBe(firstJoined.peerId);
    expect(thirdJoined.roomType).toBe('office');

    const rejectedTypeChange = receiveJson(second);
    second.send(JSON.stringify({ type: 'set-room-type', roomType: 'office' }));
    expect(await rejectedTypeChange).toMatchObject({ type: 'room-update-rejected' });

    const firstTypeUpdate = receiveJson(first);
    const secondTypeUpdate = receiveJson(second);
    const thirdTypeUpdate = receiveJson(third);
    first.send(JSON.stringify({ type: 'set-room-type', roomType: 'werewolf' }));
    const werewolfSpawns = getSpawnPoints(werewolfFloorPlan);
    expect(await Promise.all([firstTypeUpdate, secondTypeUpdate, thirdTypeUpdate])).toEqual([
      { type: 'room-updated', roomLeaderId: firstJoined.peerId, roomType: 'werewolf', spawn: werewolfSpawns[0] },
      { type: 'room-updated', roomLeaderId: firstJoined.peerId, roomType: 'werewolf', spawn: werewolfSpawns[1] },
      { type: 'room-updated', roomLeaderId: firstJoined.peerId, roomType: 'werewolf', spawn: werewolfSpawns[2] },
    ]);

    const firstFourthNotice = receiveJson(first);
    const secondFourthNotice = receiveJson(second);
    const thirdFourthNotice = receiveJson(third);
    const fourth = await createClient();
    const fourthJoinedPromise = receiveJson(fourth);
    fourth.send(JSON.stringify({ type: 'join', roomId: 'qa-room', name: 'Fourth' }));
    const [firstFourthNoticeValue, secondFourthNoticeValue, thirdFourthNoticeValue, fourthJoined] = await Promise.all([
      firstFourthNotice,
      secondFourthNotice,
      thirdFourthNotice,
      fourthJoinedPromise,
    ]);
    expect(firstFourthNoticeValue).toMatchObject({ type: 'peer-joined', name: 'Fourth', roomType: 'werewolf' });
    expect(secondFourthNoticeValue).toMatchObject({ type: 'peer-joined', name: 'Fourth', roomType: 'werewolf' });
    expect(thirdFourthNoticeValue).toMatchObject({ type: 'peer-joined', name: 'Fourth', roomType: 'werewolf' });
    expect(fourthJoined.roomType).toBe('werewolf');
    expect(fourthJoined.spawn).toEqual(werewolfSpawns[3]);

    for (const [roomType, plan] of Object.entries(gameFloorPlans)) {
      const updatePromises = [first, second, third, fourth].map((client) => receiveJson(client));
      first.send(JSON.stringify({ type: 'set-room-type', roomType }));
      const updates = await Promise.all(updatePromises);
      const spawns = getSpawnPoints(plan);
      expect(updates.map((update) => update.roomType)).toEqual(Array(4).fill(roomType));
      expect(updates.map((update) => update.spawn)).toEqual(spawns.slice(0, 4));
    }

    const leaderChanged = receiveJson(second);
    const firstClosed = waitForEvent(first, 'close');
    first.close();
    // roomType is whatever the last type in gameFloorPlans is after the loop
    const lastRoomType = Object.keys(gameFloorPlans).at(-1);
    expect(await leaderChanged).toMatchObject({
      type: 'peer-left',
      peerId: firstJoined.peerId,
      roomLeaderId: secondJoined.peerId,
      roomType: lastRoomType,
    });
    await firstClosed;

    expect(first.readyState).toBe(WebSocket.CLOSED);
    expect(second.readyState).toBe(WebSocket.OPEN);
  });
});
