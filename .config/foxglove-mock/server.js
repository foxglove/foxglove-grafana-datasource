const http = require('http');

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/v1/devices') {
    return sendJson(res, 200, { devices: [] });
  }

  if (req.method === 'POST' && path === '/v1/data/stream') {
    await readBody(req);
    return sendJson(res, 200, { url: 'http://foxglove-mock:8080/mock-download' });
  }

  if (req.method === 'GET' && path === '/mock-download') {
    return sendJson(res, 200, {
      messages: [
        { timestamp: 1, value: 10 },
        { timestamp: 2, value: 20 },
      ],
    });
  }

  if (req.method === 'GET' && path === '/healthz') {
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'not found', method: req.method, path });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('foxglove-mock listening on :8080');
});
