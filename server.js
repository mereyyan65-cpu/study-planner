/* ================================================================
   本地开发服务器 - 考研打卡
   运行: node server.js
   然后用手机浏览器打开: http://<你的电脑IP>:3000
   ================================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>404 Not Found</h2>');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  console.log('╔══════════════════════════════════════════╗');
  console.log('║     📚 考研打卡 - 本地服务器已启动      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║                                          ║');
  console.log('║  电脑浏览器:                             ║');
  console.log(`║  http://localhost:${PORT}                  ║`);
  console.log('║                                          ║');
  if (addresses.length > 0) {
    console.log('║  手机浏览器（需同一 WiFi）:               ║');
    addresses.forEach(ip => {
      console.log(`║  http://${ip}:${PORT}                       ${' '.repeat(Math.max(0, 10 - ip.length))}║`);
    });
  }
  console.log('║                                          ║');
  console.log('║  手机打开后 → 浏览器菜单 → 添加到主屏幕  ║');
  console.log('║  然后就可以像普通 App 一样使用了！       ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('按 Ctrl+C 停止服务器');
});
