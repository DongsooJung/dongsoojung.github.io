const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const BLOCKED_EXTENSIONS = new Set([
  '.keystore', '.jks', '.pem', '.p12', '.pfx', '.key', '.p8', '.cer', '.crt', '.der', '.mobileprovision',
]);
const BLOCKED_NAMES = new Set([
  'keystore.properties',
  'credentials.json',
  'secrets.json',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
]);

function isInside(rootReal, target) {
  const rootPrefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  const resolved = path.resolve(target);
  if (process.platform === 'win32') {
    return resolved.toLowerCase().startsWith(rootPrefix.toLowerCase());
  }
  return resolved.startsWith(rootPrefix);
}

function isBlockedRelative(relativePosix) {
  const parts = relativePosix.split('/').filter(Boolean);
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === '.git' || lower === 'node_modules' || lower.startsWith('.env')) return true;
    if (BLOCKED_NAMES.has(lower) || BLOCKED_EXTENSIONS.has(path.posix.extname(lower))) return true;
  }
  return false;
}

function fileResult(rootReal, filePath) {
  let stat;
  let realFile;
  try {
    stat = fs.statSync(filePath);
    realFile = fs.realpathSync(filePath);
  } catch {
    return { ok: false, status: 404 };
  }
  if (!stat.isFile() || !isInside(rootReal, realFile)) return { ok: false, status: 403 };
  return {
    ok: true,
    status: 200,
    filePath: realFile,
    size: stat.size,
    mtime: stat.mtime,
    contentType: MIME[path.extname(realFile).toLowerCase()] || 'application/octet-stream',
  };
}

function resolveRequestPath(root, rawPathname) {
  const rootReal = fs.realpathSync(root);
  let pathname = rawPathname || '/';
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return { ok: false, status: 400 };
  }
  if (pathname.includes('\0') || pathname.includes('\\')) {
    return { ok: false, status: 400 };
  }
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;

  const segments = pathname.split('/');
  if (segments.includes('..')) return { ok: false, status: 403 };
  const parts = segments.filter((part) => part !== '' && part !== '.');
  if (isBlockedRelative(parts.join('/'))) return { ok: false, status: 403 };

  const candidate = parts.length ? path.resolve(rootReal, ...parts) : rootReal;
  if (candidate !== rootReal && !isInside(rootReal, candidate)) {
    return { ok: false, status: 403 };
  }

  let stat;
  try {
    stat = fs.statSync(candidate);
  } catch {
    return { ok: false, status: 404 };
  }

  if (stat.isDirectory()) {
    return fileResult(rootReal, path.join(candidate, 'index.html'));
  }
  return fileResult(rootReal, candidate);
}

function createStaticServer(root) {
  return http.createServer((req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    const pathname = (req.url || '/').split('?')[0] || '/';

    const resolved = resolveRequestPath(root, pathname);
    if (!resolved.ok) {
      res.writeHead(resolved.status);
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': resolved.contentType,
      'Content-Length': resolved.size,
      'Cache-Control': 'no-store',
      'Last-Modified': resolved.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(resolved.filePath).pipe(res);
  });
}

function startStaticServer(root) {
  const server = createStaticServer(root);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

module.exports = {
  createStaticServer,
  resolveRequestPath,
  startStaticServer,
};
