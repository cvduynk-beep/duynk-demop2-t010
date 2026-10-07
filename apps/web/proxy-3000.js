const http = require('http');

const server = http.createServer((req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});

  const headers = { ...req.headers, host: 'localhost:3001' };
  const options = {
    hostname: '127.0.0.1',
    port: 3001,
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

  const headers = { ...req.headers, host: 'localhost:3001' };
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: 3001,
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
  console.error('Proxy server error:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Proxy uncaught exception suppressed:', err.message);
});

server.listen(3000, () => {
  console.log('Crash-proof proxy from 3000 to 3001 running');
});
