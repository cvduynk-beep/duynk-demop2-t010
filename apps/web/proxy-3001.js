const http = require('http');

// Proxy traffic from 3001 -> 3000 so both localhost:3000 and localhost:3001 always work seamlessly
const server = http.createServer((req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});

  const headers = { ...req.headers, host: 'localhost:3000' };
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: req.url,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    proxyRes.on('error', () => {});
    try {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    } catch (_) {}
  });

  proxyReq.on('error', (err) => {
    try {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Bad Gateway: ' + err.message);
    } catch (_) {}
  });

  req.pipe(proxyReq, { end: true });
});

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {
    try { socket.destroy(); } catch (_) {}
  });

  const headers = { ...req.headers, host: 'localhost:3000' };
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: req.url,
    method: req.method,
    headers,
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    proxySocket.on('error', () => {
      try { proxySocket.destroy(); socket.destroy(); } catch (_) {}
    });
    socket.on('error', () => {
      try { proxySocket.destroy(); socket.destroy(); } catch (_) {}
    });

    try {
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}\r\n`)
          .join('') +
        '\r\n'
      );
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    } catch (_) {
      try { proxySocket.destroy(); socket.destroy(); } catch (_) {}
    }
  });

  proxyReq.on('error', () => {
    try { socket.destroy(); } catch (_) {}
  });

  proxyReq.end();
});

server.on('error', (err) => {
  console.error('Proxy 3001 server error:', err.message);
});

server.listen(3001, () => {
  console.log('Bridge proxy from 3001 to 3000 running');
});
