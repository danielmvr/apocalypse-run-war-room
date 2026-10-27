/** Visão local; não altera o mundo nem o placar oficial. */
export type TerritoryOwner = 'HUMAN' | 'ZOMBIE' | null;
export type TerritoryFilter = 'ALL' | 'HUMAN' | 'ZOMBIE' | 'CONTESTED';
export const TERRITORY_FILTERS: ReadonlyArray<{ id: TerritoryFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'HUMAN', label: 'Resistência' },
  { id: 'ZOMBIE', label: 'Horda' },
  { id: 'CONTESTED', label: 'Contestado' },
];

/** A API pública representa células sem domínio confirmado com owner=null. */
export function filterTerritories<T extends { owner: TerritoryOwner }>(
  cells: readonly T[], filter: TerritoryFilter,
): T[] {
  if (filter === 'ALL') return [...cells];
  if (filter === 'CONTESTED') return cells.filter((cell) => cell.owner === null);
  return cells.filter((cell) => cell.owner === filter);
}
