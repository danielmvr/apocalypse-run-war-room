import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeason, seasonAt } from '../src/public-season.ts';

const season = (human = 10, zombie = 5, leader = 'HUMAN') => ({
  number: 2, startsAt: '2026-10-19T03:00:00Z', endsAt: '2026-10-26T03:00:00Z',
  factions: [{ id: 'HUMAN', score: human }, { id: 'ZOMBIE', score: zombie }], leader,
});

test('official scores, leadership, ties and legitimate zeros are retained', () => {
  for (const value of [season(), season(5, 10, 'ZOMBIE'), season(8, 8, null), season(8, 8, 'HUMAN'), season(0, 0, null)]) {
    assert.deepEqual(parseSeason(value), value);
  }
});

test('null, incomplete or invalid season becomes unavailable without made-up scores', () => {
  for (const value of [null, undefined, {}, season(-1), season(NaN),
    { ...season(), endsAt: 'invalid' }, { ...season(), endsAt: season().startsAt },
    { ...season(), factions: [{ id: 'HUMAN', score: 0 }] },
    { ...season(), factions: [{ id: 'HUMAN', score: 0 }, { id: 'HUMAN', score: 1 }] },
    { ...season(), leader: 'PLAYER' }]) assert.equal(parseSeason(value), null);
});

test('public allowlist excludes extra fields, including faction-level fields', () => {
  assert.deepEqual(parseSeason({ ...season(), events: [{ actorName: 'synthetic' }],
    factions: season().factions.map(f => ({ ...f, players: ['synthetic'] })) }), season());
});

test('season changes at the authoritative boundary, without local score calculation', () => {
  const value = season();
  assert.equal(seasonAt(value, Date.parse(value.startsAt) - 1), null);
  assert.equal(seasonAt(value, Date.parse(value.startsAt)), value);
  assert.equal(seasonAt(value, Date.parse(value.endsAt) - 1), value);
  assert.equal(seasonAt(value, Date.parse(value.endsAt)), null);
  const next = { ...season(0, 0, null), number: 3, startsAt: value.endsAt, endsAt: '2026-11-02T03:00:00Z' };
  assert.equal(seasonAt(next, Date.parse(value.endsAt)), next);
});
