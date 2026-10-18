import { crc32, deflateSync } from "node:zlib";

/**
 * Encode RGBA pixels as a greyscale PNG with 1 or 2 bits per pixel
 * (2 or 4 shades), the formats TRMNL's firmware displays natively.
 * Each pixel snaps to the nearest shade. There's no dithering, so text edges stay clean.
 */
export function encodeGreyPng(rgba: Uint8Array, width: number, height: number, bitDepth: 1 | 2): Buffer {
  const levels = (1 << bitDepth) - 1; // 1 → black/white, 3 → black/dark/light/white
  const perByte = 8 / bitDepth;
  const stride = Math.ceil(width / perByte);
  const raw = Buffer.alloc((stride + 1) * height); // +1: filter-type byte per row (0 = none)

  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3] / 255;
      // Rec. 601 luma, composited over white.
      const grey = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha + 255 * (1 - alpha);
      const level = Math.round((grey / 255) * levels);
      raw[row + Math.floor(x / perByte)] |= level << (8 - bitDepth * (1 + (x % perByte)));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = 0; // colour type 0: greyscale

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
