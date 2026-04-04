import { createServer } from 'node:http';
import { createApp } from './app/bootstrap.js';
import { getConfig } from './config.js';

const config = getConfig();
const { app } = createApp();

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === 'POST' && request.url === '/command') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', async () => {
      try {
        const parsed = JSON.parse(body) as { userId?: string; text?: string };
        const reply = await app.handleMessage(parsed.userId || 'http-user', parsed.text || 'help');
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ reply }));
      } catch (error) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Invalid request'
          })
        );
      }
    });
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(config.httpPort, () => {
  console.log(`HTTP server listening on http://localhost:${config.httpPort}`);
});

