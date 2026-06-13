/* ================================================================
   生成 PWA 图标 - 纯 Node.js，无需任何依赖
   运行: node generate-icons.js
   ================================================================ */

const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crcBuf]);
}

function createPNG(size, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // 生成像素数据（每行前加一个 0 表示 no filter）
  const rawData = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    rawData[rowOffset] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 3;

      // 中心圆形为白色，背景为给定颜色
      const cx = (size - 1) / 2;
      const cy = (size - 1) / 2;
      const radius = size * 0.35;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist < radius) {
        rawData[px] = 255;
        rawData[px + 1] = 255;
        rawData[px + 2] = 255;
      } else if (dist < radius + 2) {
        // 抗锯齿边缘
        const t = dist - radius;
        rawData[px] = Math.round(r + (255 - r) * (1 - t / 2));
        rawData[px + 1] = Math.round(g + (255 - g) * (1 - t / 2));
        rawData[px + 2] = Math.round(b + (255 - b) * (1 - t / 2));
      } else {
        rawData[px] = r;
        rawData[px + 1] = g;
        rawData[px + 2] = b;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // 在圆形中画一个简单的"书"形字母 S（用像素操作模拟）
  // ... 已经用圆点代替

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 生成 192x192 图标（蓝紫色背景 + 白色圆形）
const icon192 = createPNG(192, 74, 108, 247);
fs.writeFileSync('icons/icon-192.png', icon192);
console.log('✓ icons/icon-192.png');

// 生成 512x512 图标
const icon512 = createPNG(512, 74, 108, 247);
fs.writeFileSync('icons/icon-512.png', icon512);
console.log('✓ icons/icon-512.png');

console.log('图标生成完成！');
