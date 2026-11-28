import { test } from "node:test";
import assert from "node:assert/strict";
import { albumEntryName, crc32, ZipWriter } from "./zip.js";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("zip has local headers, a central directory and a correct end record", () => {
  const z = new ZipWriter();
  const a = z.add("a.txt", Buffer.from("hello"), new Date("2026-12-01T10:20:30Z"));
  const b = z.add("b.txt", Buffer.from("world!"));
  const end = z.finish();
  const all = Buffer.concat([a, b, end]);

  assert.equal(all.readUInt32LE(0), 0x04034b50);
  assert.equal(all.readUInt32LE(14), crc32(Buffer.from("hello")));
  assert.equal(all.subarray(30, 35).toString(), "a.txt");
  assert.equal(all.subarray(35, 40).toString(), "hello");
  assert.equal(all.readUInt32LE(a.length), 0x04034b50);

  const eocd = all.length - 22;
  assert.equal(all.readUInt32LE(eocd), 0x06054b50);
  assert.equal(all.readUInt16LE(eocd + 10), 2);
  const cdSize = all.readUInt32LE(eocd + 12);
  const cdOffset = all.readUInt32LE(eocd + 16);
  assert.equal(cdOffset, a.length + b.length);
  assert.equal(cdOffset + cdSize, eocd);
  assert.equal(all.readUInt32LE(cdOffset), 0x02014b50);
  // Second central entry points at the second local header.
  const second = cdOffset + 46 + "a.txt".length;
  assert.equal(all.readUInt32LE(second), 0x02014b50);
  assert.equal(all.readUInt32LE(second + 42), a.length);
});

test("entry names are numbered and safe", () => {
  assert.equal(albumEntryName(0, "Meera Iyer", "jpg"), "photo-001-meera-iyer.jpg");
  assert.equal(albumEntryName(41, "../../etc", "png"), "photo-042-etc.png");
  assert.equal(albumEntryName(9, null, "webp"), "photo-010.webp");
});
