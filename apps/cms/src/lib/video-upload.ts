// Some otherwise playable MP4s have a final mdat box whose declared size stops
// just before the end of the file. Keep every byte and correct only that size;
// Payload still checks the resulting container and the worker checks the video.
export function repairTrailingMediaData(data: Buffer): Buffer {
  // Leave larger discrepancies and ambiguous structures to normal validation.
  const maxTrailingBytes = 1024 * 1024;
  const maxBoxes = 10_000;
  let position = 0;
  let sawMovie = false;
  let lastMediaBox: { offset: number; extended: boolean } | undefined;

  const repair = () => {
    if (
      !lastMediaBox ||
      data.length - position > maxTrailingBytes ||
      (!lastMediaBox.extended && data.length - lastMediaBox.offset > 0xffffffff)
    )
      return data;
    const repaired = Buffer.from(data);
    const size = data.length - lastMediaBox.offset;
    if (lastMediaBox.extended)
      repaired.writeBigUInt64BE(BigInt(size), lastMediaBox.offset + 8);
    else repaired.writeUInt32BE(size, lastMediaBox.offset);
    return repaired;
  };

  for (let count = 0; position < data.length && count < maxBoxes; count++) {
    const remaining = data.length - position;
    if (remaining < 8) return repair();
    const size32 = data.readUInt32BE(position);
    const type = data.toString("latin1", position + 4, position + 8);
    const extended = size32 === 1;
    if (extended && remaining < 16) return repair();
    const size64 = extended ? data.readBigUInt64BE(position + 8) : null;
    if (size64 !== null && size64 > BigInt(Number.MAX_SAFE_INTEGER))
      return repair();
    const size =
      size32 === 0 ? remaining : size64 !== null ? Number(size64) : size32;
    const headerSize = extended ? 16 : 8;
    if (size < headerSize || size > remaining) return repair();

    // Only repair files with a valid MP4 file-type box and a preceding moov.
    if (position === 0) {
      const payloadSize = size - headerSize;
      if (
        type !== "ftyp" ||
        size32 === 0 ||
        payloadSize < 8 ||
        (payloadSize - 8) % 4 !== 0 ||
        size === data.length
      )
        return data;
    }
    if (type === "moov") sawMovie = true;
    lastMediaBox =
      type === "mdat" && sawMovie && size32 !== 0
        ? { offset: position, extended }
        : undefined;
    position += size;
  }
  return data;
}
