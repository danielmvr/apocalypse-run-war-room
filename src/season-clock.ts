import type { PublicSeason } from './public-season';

/** Client-only presentation. Dates and season boundaries come from the official public API. */
export type SeasonCountdown =
  | { state: 'unavailable' | 'ended' | 'upcoming'; days: 0; hours: 0; minutes: 0; seconds: 0; progress: 0 }
  | { state: 'active'; days: number; hours: number; minutes: number; seconds: number; progress: number };

export function seasonCountdown(season: PublicSeason | null, now: number): SeasonCountdown {
  const empty = (state: 'unavailable' | 'ended' | 'upcoming'): SeasonCountdown => ({
    state, days: 0, hours: 0, minutes: 0, seconds: 0, progress: 0,
  });
  if (!season || !Number.isFinite(now)) return empty('unavailable');
  const start = Date.parse(season.startsAt);
  const end = Date.parse(season.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return empty('unavailable');
  if (now < start) return empty('upcoming');
  if (now >= end) return empty('ended');

  // Ceil preserves the last visible second and never displays a negative number.
  const remaining = Math.ceil((end - now) / 1000);
  return {
    state: 'active',
    days: Math.floor(remaining / 86400),
    hours: Math.floor(remaining % 86400 / 3600),
    minutes: Math.floor(remaining % 3600 / 60),
    seconds: remaining % 60,
    progress: Math.max(0, Math.min(100, 100 * (now - start) / (end - start))),
  };
}
