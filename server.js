import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { attachRoomProtocol } from './server/room-protocol.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const buildDir = path.join(directory, 'dist');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((request, response) => {
  const requestedPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const resolvedPath = path.resolve(buildDir, `.${requestedPath === '/' ? '/index.html' : requestedPath}`);
  if (!resolvedPath.startsWith(`${buildDir}${path.sep}`) && resolvedPath !== path.join(buildDir, 'index.html')) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (error, file) => {
    if (error) {
      const fallbackPath = path.join(buildDir, 'index.html');
      fs.readFile(fallbackPath, (fallbackError, fallback) => {
        if (fallbackError) {
          response.writeHead(404);
          response.end('Build not found. Run npm run build first.');
          return;
        }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(fallback);
      });
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(resolvedPath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(file);
  });
});

const webSocketServer = new WebSocketServer({ server });
attachRoomProtocol(webSocketServer);

server.listen(PORT, () => {
  console.log(`Office game signaling server listening on port ${PORT}`);
});
