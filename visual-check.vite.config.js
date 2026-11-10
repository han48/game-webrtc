import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { WebSocketServer } from 'ws';
import { attachRoomProtocol } from './server/room-protocol.js';

function roomSignalingPlugin() {
  return {
    name: 'visual-check-room-signaling',
    configureServer(server) {
      if (!server.httpServer) return;
      const webSocketServer = new WebSocketServer({ noServer: true });
      attachRoomProtocol(webSocketServer);
      server.httpServer.on('upgrade', (request, socket, head) => {
        if (new URL(request.url, 'http://localhost').pathname !== '/signal') return;
        webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
          webSocketServer.emit('connection', webSocket, request);
        });
      });
      server.httpServer.on('close', () => webSocketServer.close());
    },
  };
}

export default defineConfig({
  plugins: [react(), roomSignalingPlugin()],
  server: { host: '127.0.0.1', port: 5175 },
});
