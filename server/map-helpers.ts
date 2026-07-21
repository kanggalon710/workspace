/**
 * Decide which mitra's map data to serve. The cross-tenant override (?mitra) is
 * honored ONLY for JABNET-root; everyone else always gets their own active mitra.
 * Pure - unit-tested in map-helpers.test.ts.
 */
export function resolveMapMitraId(args: {
  isJabnetRoot: boolean;
  queryMitra: number;
  activeMitraId: number;
}): number {
  const { isJabnetRoot, queryMitra, activeMitraId } = args;
  if (isJabnetRoot && Number.isFinite(queryMitra) && queryMitra > 0) return queryMitra;
  return activeMitraId;
}
