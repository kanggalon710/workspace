// Util batching murni - dipakai storage untuk multi-row INSERT ber-chunk
// (MySQL punya batas max_allowed_packet + jumlah placeholder, jadi insert
// besar dipecah per ~500 baris).

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`chunkArray: size harus bilangan bulat positif (dapat ${size})`);
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
