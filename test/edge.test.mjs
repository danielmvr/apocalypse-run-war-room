import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../supabase/functions/war-room-public/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const NOW = Date.parse('2026-10-25T22:00:00Z');
const END = Date.parse('2026-10-26T03:00:00Z');
const key = 'server-only-test-key';

function season(overrides = {}) {
  return {
    number: 1,
    startsAt: '2026-10-19T03:00:00Z',
    endsAt: '2026-10-26T03:00:00Z',
    factions: [{ id: 'HUMAN', score: 375 }, { id: 'ZOMBIE', score: 125 }],
    leader: 'HUMAN',
    ...overrides,
  };
}

function fixture() {
  return {
    ar_cells: [
      { id: 'synthetic-cell-human', owner: 'HUMAN', structure: 'ABRIGO', control: 900, contagion: 10 },
      { id: 'synthetic-cell-zombie', owner: 'ZOMBIE', structure: 'FORTALEZA', control: 700, contagion: 800 },
    ],
    ar_players: [{ id: 'private-player-one' }, { id: 'private-player-two' }],
    ar_patrols: [{ player_id: 'private-player-one' }, { player_id: 'private-player-one' }],
    ar_events: [
      { id: 1, kind: 'CAPTURE', actor_type: 'PLAYER', actor_faction: 'HUMAN', created_at: '2026-10-25T21:36:47Z', cell_id: 'synthetic-cell-human', actorName: 'private-name' },
      { id: 2, kind: 'SEASON_REBALANCE', created_at: '2026-10-25T21:00:00Z' },
    ],
  };
}

function harness(options = {}) {
  let now = options.now ?? NOW;
  let handler;
  let seasonal = options.season === undefined ? season() : options.season;
  const rows = { ...fixture(), ...options.rows };
  const calls = [];
  const logs = [];
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = {
    Date: ClockDate, Request, Response, Headers, URL, AbortSignal,
    console: { error: (...args) => logs.push(args.join(' ')) },
    Deno: {
      env: { get: (name) => options.credentials === false ? undefined : ({ SUPABASE_URL: 'https://example.supabase.test', SUPABASE_SERVICE_ROLE_KEY: key })[name] },
      serve: (callback) => { handler = callback; },
    },
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      calls.push({ url, init });
      if (url.pathname === '/rest/v1/rpc/ar_war_room_season') {
        if (options.rpc) return await options.rpc({ calls, now, init });
        return Response.json(seasonal);
      }
      const table = url.pathname.split('/').at(-1);
      if (options.onRead) options.onRead(table, { advance: (ms) => { now += ms; } });
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      return Response.json(rows[table].slice(offset, offset + limit));
    },
  };
  vm.runInNewContext(compiled, context, { filename: 'war-room-public.js' });
  return {
    calls, logs,
    request: (method = 'GET', headers = {}) => handler(new Request('https://edge.example.test/war-room-public', { method, headers })),
    advance: (ms) => { now += ms; },
    setTime: (value) => { now = value; },
    setSeason: (value) => { seasonal = value; },
  };
}

test('canonical RPC runs first with server-only credentials and seasonal allowlist', async () => {
  const raw = season({ privatePlayer: 'secret-person', events: [{ patrol: 'private-patrol' }] });
  raw.factions[0].players = ['private-player-one'];
  const app = harness({ season: raw });
  const response = await app.request('GET', { Authorization: 'Bearer browser-token' });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.season, season({ startsAt: '2026-10-19T03:00:00.000Z', endsAt: '2026-10-26T03:00:00.000Z' }));
  assert.deepEqual(data.war.factions.map((f) => f.score), [120, 300]);
  assert.equal(app.calls.length, 5);
  assert.equal(app.calls[0].url.pathname, '/rest/v1/rpc/ar_war_room_season');
  assert.equal(app.calls[0].init.method, 'POST');
  assert.equal(app.calls[0].init.body, '{}');
  assert.equal(app.calls[0].init.headers.apikey, key);
  assert.equal(app.calls[0].init.headers.Authorization, `Bearer ${key}`);
  assert.ok(app.calls[0].init.signal instanceof AbortSignal);
  const publicText = JSON.stringify(data);
  for (const privateValue of [key, 'browser-token', 'secret-person', 'private-player-one', 'private-player-two', 'private-name', 'private-patrol']) {
    assert.ok(!publicText.includes(privateValue), privateValue);
  }
  assert.deepEqual(data.events.map((event) => event.at), ['2026-10-25T21:00:00.000Z']);
});

test('legitimate zero scores and a tie remain valid official seasons', async () => {
  for (const score of [0, 200]) {
    const app = harness({ season: season({ factions: [{ id: 'HUMAN', score }, { id: 'ZOMBIE', score }], leader: null }) });
    const data = await (await app.request()).json();
    assert.deepEqual(data.season.factions.map((f) => f.score), [score, score]);
    assert.equal(data.season.leader, null);
  }
});

test('RPC null preserves the rest of the public API', async () => {
  const app = harness({ season: null });
  const response = await app.request();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.season, null);
  assert.equal(data.cells.length, 2);
  assert.equal(data.events.length, 1);
  assert.deepEqual(data.war.players, { total: 2, active24h: 1 });
});

test('seasonal HTTP error, invalid JSON and timeout are isolated', async () => {
  for (const rpc of [
    async () => new Response('private database diagnostic', { status: 403 }),
    async () => new Response('invalid json'),
    async () => { throw new DOMException('private timeout detail', 'TimeoutError'); },
  ]) {
    const app = harness({ rpc });
    const response = await app.request();
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.season, null);
    assert.equal(data.cells.length, 2);
    assert.equal(app.calls.length, 5);
    assert.ok(!JSON.stringify(data).includes('private'));
    assert.deepEqual(app.logs, []);
  }
});

test('malformed or noncurrent season fails closed without inventing points', async () => {
  for (const value of [
    [], {}, season({ number: 0 }), season({ number: '1' }),
    season({ startsAt: 'bad date' }), season({ startsAt: '2026-10-26T02:00:00Z' }),
    season({ endsAt: '2026-10-24T03:00:00Z' }), season({ leader: 'DRAW' }),
    season({ factions: [{ id: 'HUMAN', score: 1 }, { id: 'HUMAN', score: 2 }] }),
    season({ factions: [{ id: 'HUMAN', score: '1' }, { id: 'ZOMBIE', score: 2 }] }),
    season({ factions: [{ id: 'HUMAN', score: -1 }, { id: 'ZOMBIE', score: 2 }] }),
  ]) {
    const app = harness({ season: value });
    const data = await (await app.request()).json();
    assert.equal(data.season, null, JSON.stringify(value));
    assert.equal(data.cells.length, 2);
  }
});

test('memory cache stays at 120 seconds and HTTP max-age stays at most 60', async () => {
  const app = harness();
  const first = await app.request();
  assert.equal(first.headers.get('Cache-Control'), 'public, max-age=60');
  app.advance(119000);
  const cached = await app.request();
  assert.equal(app.calls.length, 5);
  assert.equal(cached.headers.get('Cache-Control'), 'public, max-age=1');
  app.advance(1000);
  await app.request();
  assert.equal(app.calls.length, 10);
});

test('both caches stop at the canonical boundary and next access reads the new season', async () => {
  const app = harness({ now: END - 45000 });
  const first = await app.request();
  assert.equal(first.headers.get('Cache-Control'), 'public, max-age=45');
  app.setTime(END - 500);
  const last = await app.request();
  assert.equal(last.headers.get('Cache-Control'), 'public, max-age=0');
  assert.equal(app.calls.length, 5);
  app.setTime(END);
  app.setSeason(season({ number: 2, startsAt: '2026-10-26T03:00:00Z', endsAt: '2026-11-02T03:00:00Z', factions: [{ id: 'HUMAN', score: 0 }, { id: 'ZOMBIE', score: 0 }], leader: null }));
  const data = await (await app.request()).json();
  assert.equal(data.season.number, 2);
  assert.deepEqual(data.season.factions.map((f) => f.score), [0, 0]);
  assert.equal(app.calls.length, 10);
});

test('a null fallback also respects a previously known upcoming boundary', async () => {
  const app = harness({ now: END - 180000 });
  await app.request();
  app.advance(120000);
  app.setSeason(null);
  const fallback = await app.request();
  assert.equal((await fallback.json()).season, null);
  assert.equal(fallback.headers.get('Cache-Control'), 'public, max-age=60');
  app.advance(60000);
  await app.request();
  assert.equal(app.calls.length, 15);
});

test('request crossing a boundary never returns or caches the expired season', async () => {
  let crossed = false;
  const app = harness({
    now: END - 1000,
    onRead: (table, { advance }) => {
      if (table === 'ar_cells' && !crossed) { crossed = true; advance(2000); }
    },
  });
  const response = await app.request();
  assert.equal((await response.json()).season, null);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0');
  await app.request();
  assert.equal(app.calls.length, 10);
});

test('null fallback crossing a known boundary is not cached past the transition', async () => {
  let cellReads = 0;
  const app = harness({
    now: END - 130000,
    onRead: (table, { advance }) => {
      if (table === 'ar_cells' && ++cellReads === 2) advance(20000);
    },
  });
  await app.request();
  app.advance(120000);
  app.setSeason(null);
  const response = await app.request();
  assert.equal((await response.json()).season, null);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0');
  await app.request();
  assert.equal(app.calls.length, 15);
});

test('concurrent requests share the seasonal RPC and complete snapshot', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const app = harness({ rpc: async () => { await pending; return Response.json(season()); } });
  const first = app.request();
  const second = app.request();
  assert.equal(app.calls.length, 1);
  release();
  const responses = await Promise.all([first, second]);
  assert.deepEqual(await responses[0].json(), await responses[1].json());
  assert.equal(app.calls.length, 5);
});

test('OPTIONS, unsupported methods and the fixed CORS origin stay unchanged', async () => {
  const app = harness();
  const preflight = await app.request('OPTIONS', { Origin: 'https://untrusted.example' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://danielmvr.github.io');
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  const post = await app.request('POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, OPTIONS');
  assert.equal(app.calls.length, 0);
});

test('missing credentials returns the existing generic unavailable response', async () => {
  const app = harness({ credentials: false });
  const response = await app.request();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Data unavailable' });
  assert.equal(app.calls.length, 0);
});

test('territory row limits still fail closed and failed snapshots are retryable', async () => {
  const rows = Array.from({ length: 3001 }, (_, i) => ({ id: `synthetic-${i}`, structure: 'RUINAS', owner: null }));
  const app = harness({ rows: { ar_cells: rows } });
  assert.equal((await app.request()).status, 503);
  const callsAfterFailure = app.calls.length;
  assert.equal((await app.request()).status, 503);
  assert.ok(app.calls.length > callsAfterFailure);
});

test('public events stay capped at 12 and rounded to the hour', async () => {
  const events = Array.from({ length: 30 }, (_, i) => ({ id: i, kind: 'CAPTURE', actor_type: 'BOT', actor_faction: 'ZOMBIE', created_at: '2026-10-25T20:59:59Z' }));
  const app = harness({ rows: { ar_events: events } });
  const data = await (await app.request()).json();
  assert.equal(data.events.length, 12);
  assert.ok(data.events.every((event) => event.at === '2026-10-25T20:00:00.000Z'));
});
