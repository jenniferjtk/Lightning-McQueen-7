import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the Vite build (dist/) from Lambda behind the HTTP API's catch-all
// route, so the React app and the /api/* Lambdas share one origin on AWS.
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serve(file, cacheControl) {
  const body = await readFile(file);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': cacheControl,
    },
    body: body.toString('base64'),
    isBase64Encoded: true,
  };
}

export const handler = async (event) => {
  const requestPath = decodeURIComponent(event.rawPath || '/');

  // API paths with no Lambda behind them should fail as JSON, not as the app shell.
  if (requestPath.startsWith('/api/')) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Not found.' }),
    };
  }

  const file = path.join(DIST, path.normalize(requestPath));
  if (file.startsWith(DIST + path.sep) && path.extname(file)) {
    try {
      return await serve(file, 'public, max-age=31536000, immutable');
    } catch {
      return { statusCode: 404, body: 'Not found' };
    }
  }

  // Client-side routes (/about, /account, ...) all load the app shell.
  return serve(path.join(DIST, 'index.html'), 'no-cache');
};
