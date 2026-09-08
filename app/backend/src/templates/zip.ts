export type ZipEntry = { name: string; content: Buffer };

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(content: Buffer): number {
  let value = 0xffffffff;
  for (const byte of content) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function localHeader(name: string, content: Buffer, checksum: number): Buffer {
  const nameLength = Buffer.byteLength(name);
  const result = Buffer.alloc(30 + nameLength);
  result.writeUInt32LE(0x04034b50, 0);
  result.writeUInt16LE(20, 4);
  result.writeUInt16LE(0x800, 6);
  result.writeUInt16LE(0, 8);
  result.writeUInt32LE(checksum, 14);
  result.writeUInt32LE(content.length, 18);
  result.writeUInt32LE(content.length, 22);
  result.writeUInt16LE(nameLength, 26);
  result.write(name, 30);
  return result;
}

function directoryHeader(name: string, content: Buffer, checksum: number, offset: number): Buffer {
  const nameLength = Buffer.byteLength(name);
  const result = Buffer.alloc(46 + nameLength);
  result.writeUInt32LE(0x02014b50, 0);
  result.writeUInt16LE(20, 4);
  result.writeUInt16LE(20, 6);
  result.writeUInt16LE(0x800, 8);
  result.writeUInt16LE(0, 10);
  result.writeUInt32LE(checksum, 16);
  result.writeUInt32LE(content.length, 20);
  result.writeUInt32LE(content.length, 24);
  result.writeUInt16LE(nameLength, 28);
  result.writeUInt32LE(offset, 42);
  result.write(name, 46);
  return result;
}

export async function* zip(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Buffer> {
  const directory: Buffer[] = [];
  let offset = 0;
  let count = 0;

  for await (const entry of entries) {
    const checksum = crc32(entry.content);
    const local = localHeader(entry.name, entry.content, checksum);
    directory.push(directoryHeader(entry.name, entry.content, checksum, offset));
    offset += local.length + entry.content.length;
    count += 1;
    yield local;
    yield entry.content;
  }

  const centralDirectory = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  yield centralDirectory;
  yield end;
}
