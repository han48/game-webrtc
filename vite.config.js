import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { attachRoomProtocol } from './server/room-protocol.js';

const certificateDirectory = path.resolve('.dev-certs');
const certificatePath = path.join(certificateDirectory, 'localhost.pem');
const privateKeyPath = path.join(certificateDirectory, 'localhost.key');
const localCertificate = fs.existsSync(certificatePath) && fs.existsSync(privateKeyPath)
  ? { cert: fs.readFileSync(certificatePath), key: fs.readFileSync(privateKeyPath) }
  : null;

function roomSignalingPlugin() {
  return {
    name: 'office-room-signaling',
    configureServer(server) {
      if (!server.httpServer) return;
      const webSocketServer = new WebSocketServer({ noServer: true });
      attachRoomProtocol(webSocketServer);
      server.httpServer.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname !== '/signal') return;
        webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
          webSocketServer.emit('connection', webSocket, request);
        });
      });
      server.httpServer.on('close', () => webSocketServer.close());
    },
  };
}

export default defineConfig({
  plugins: [react(), ...(localCertificate ? [] : [basicSsl()]), roomSignalingPlugin()],
  build: process.env.VITE_STATIC_ROOM_TYPE ? { emptyOutDir: false } : {},
  server: {
    port: 5173,
    host: '0.0.0.0',
    ...(localCertificate ? { https: localCertificate } : {}),
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
  },
});
