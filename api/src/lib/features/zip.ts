// A minimal ZIP writer for the album's "download all" (STORE only: photos are
// already compressed, so deflate would cost CPU for nothing). One file is
// held in memory at a time (album photos are capped at 10 MB), and the
// archive is pushed out as it is built, so a 200-photo album never sits in
// memory whole. No ZIP64: 200 x 10 MB stays far below the 4 GB limit.
// Tested in zip.test.ts.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

type Central = { name: Buffer; crc: number; size: number; offset: number; time: number; date: number };

/** Builds a zip incrementally: call `add` per file, then `finish`; each returns the bytes to write next. */
export class ZipWriter {
  private offset = 0;
  private central: Central[] = [];

  add(name: string, data: Buffer, when = new Date()): Buffer {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const { time, date } = dosDateTime(when);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4); // version needed
    h.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    h.writeUInt16LE(0, 8); // method: store
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    this.central.push({ name: nameBuf, crc, size: data.length, offset: this.offset, time, date });
    const out = Buffer.concat([h, nameBuf, data]);
    this.offset += out.length;
    return out;
  }

  finish(): Buffer {
    const parts: Buffer[] = [];
    let size = 0;
    for (const c of this.central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4); // version made by
      h.writeUInt16LE(20, 6); // version needed
      h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(0, 10);
      h.writeUInt16LE(c.time, 12);
      h.writeUInt16LE(c.date, 14);
      h.writeUInt32LE(c.crc, 16);
      h.writeUInt32LE(c.size, 20);
      h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.name.length, 28);
      h.writeUInt16LE(0, 30); // extra
      h.writeUInt16LE(0, 32); // comment
      h.writeUInt16LE(0, 34); // disk
      h.writeUInt16LE(0, 36); // internal attrs
      h.writeUInt32LE(0, 38); // external attrs
      h.writeUInt32LE(c.offset, 42);
      parts.push(h, c.name);
      size += h.length + c.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.central.length, 8);
    end.writeUInt16LE(this.central.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(this.offset, 16);
    end.writeUInt16LE(0, 20);
    parts.push(end);
    return Buffer.concat(parts);
  }
}

/** Unique, filesystem-safe names inside the archive ("photo-001-meera.jpg"). */
export function albumEntryName(index: number, uploader: string | null, ext: string): string {
  const who = (uploader ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .toLowerCase();
  return `photo-${String(index + 1).padStart(3, "0")}${who ? `-${who}` : ""}.${ext}`;
}
