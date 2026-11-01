// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { deflateRawSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let k = 0; k < 8; k += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[n] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime() {
  // ZIP's earliest portable timestamp. Fixed for byte-for-byte reproducibility.
  return { date: 0x0021, time: 0x0000 }; // 1980-01-01 00:00:00
}

function u16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

export async function writeDeterministicZip(outputPath, entries) {
  const ordered = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const timestamp = dosDateTime();

  for (const entry of ordered) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const data = entry.data ?? await readFile(entry.path);
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(8),
      u16(timestamp.time),
      u16(timestamp.date),
      u32(checksum),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name
    ]);
    localParts.push(localHeader, compressed);

    centralParts.push(Buffer.concat([
      u32(0x02014b50),
      u16(0x0314),
      u16(20),
      u16(0x0800),
      u16(8),
      u16(timestamp.time),
      u16(timestamp.date),
      u32(checksum),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0o100644 << 16),
      u32(offset),
      name
    ]));

    offset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(ordered.length),
    u16(ordered.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  await writeFile(outputPath, Buffer.concat([...localParts, centralDirectory, end]));
}
