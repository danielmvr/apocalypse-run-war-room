export type Faction = 'HUMAN' | 'ZOMBIE';
export type PublicSeason = {
  number: number;
  startsAt: string;
  endsAt: string;
  factions: { id: Faction; score: number }[];
  leader: Faction | null;
};

/** An invalid season must never take the territorial response offline. */
export function parseSeason(value: unknown): PublicSeason | null {
  if (!value || typeof value !== 'object') return null;
  const season = value as PublicSeason;
  if (!Number.isSafeInteger(season.number) || season.number < 1 ||
      typeof season.startsAt !== 'string' || typeof season.endsAt !== 'string' ||
      !Number.isFinite(Date.parse(season.startsAt)) ||
      !Number.isFinite(Date.parse(season.endsAt)) ||
      Date.parse(season.endsAt) <= Date.parse(season.startsAt) ||
      !Array.isArray(season.factions) || season.factions.length !== 2 ||
      ![null, 'HUMAN', 'ZOMBIE'].includes(season.leader)) return null;
  const factions: PublicSeason['factions'] = [];
  for (const id of ['HUMAN', 'ZOMBIE'] as const) {
    const entries = season.factions.filter((entry) => entry?.id === id);
    if (entries.length !== 1 || !Number.isSafeInteger(entries[0].score) || entries[0].score < 0) return null;
    factions.push({ id, score: entries[0].score });
  }
  return { number: season.number, startsAt: season.startsAt, endsAt: season.endsAt, factions, leader: season.leader };
}

export function seasonAt(season: PublicSeason | null, now: number): PublicSeason | null {
  return season && Date.parse(season.startsAt) <= now && now < Date.parse(season.endsAt) ? season : null;
}
