const ORIGIN = 'https://danielmvr.github.io';
const BASE = Deno.env.get('SUPABASE_URL') || '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const cors = {
'Access-Control-Allow-Origin': ORIGIN,
'Access-Control-Allow-Methods': 'GET, OPTIONS',
'Access-Control-Allow-Headers': 'content-type',
'Vary': 'Origin',
};

const jsonHeaders = {
...cors,
'Content-Type': 'application/json; charset=utf-8',
'X-Content-Type-Options': 'nosniff',
};

type Row = Record<string, unknown>;

type PublicSeason = {
number: number;
startsAt: string;
endsAt: string;
factions: { id: 'HUMAN' | 'ZOMBIE'; score: number }[];
leader: 'HUMAN' | 'ZOMBIE' | null;
};

// The server RPC is the sole authority for seasonal points and rollover.
// Do not forward its raw response, error body or individual records.
function publicSeason(value: unknown): PublicSeason | null {
if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
const season = value as Row;
if (!Number.isSafeInteger(season.number) || Number(season.number) < 1 ||
typeof season.startsAt !== 'string' || typeof season.endsAt !== 'string' ||
!Array.isArray(season.factions) || season.factions.length !== 2 ||
!['HUMAN', 'ZOMBIE', null].includes(season.leader as string | null)) return null;

const start = Date.parse(season.startsAt);
const end = Date.parse(season.endsAt);
if (!Number.isFinite(start) || !Number.isFinite(end) ||
start >= end || start > Date.now() || end <= Date.now()) return null;

const factions: PublicSeason['factions'] = [];
for (const id of ['HUMAN', 'ZOMBIE'] as const) {
const matches = season.factions.filter((row: unknown) =>
row && typeof row === 'object' && (row as Row).id === id);
const score = matches.length === 1 ? (matches[0] as Row).score : undefined;
if (!Number.isSafeInteger(score) || Number(score) < 0) return null;
factions.push({ id, score: score as number });
}

return {
number: season.number as number,
startsAt: new Date(start).toISOString(),
endsAt: new Date(end).toISOString(),
factions,
leader: season.leader as PublicSeason['leader'],
};
}

async function readSeason(): Promise<PublicSeason | null> {
try {
if (!BASE || !KEY) return null;
const response = await fetch(`${BASE}/rest/v1/rpc/ar_war_room_season`, {
method: 'POST',
headers: {
apikey: KEY,
Authorization: `Bearer ${KEY}`,
Accept: 'application/json',
'Content-Type': 'application/json',
},
body: '{}',
signal: AbortSignal.timeout(5000),
});
if (!response.ok) return null;
return publicSeason(await response.json());
} catch {
// An unavailable season must not hide territorial data or disclose diagnostics.
return null;
}
}

const str = (v: unknown) =>
typeof v === 'string' ? v : '';

const num = (v: unknown) =>
Number.isFinite(Number(v)) ? Number(v) : 0;

// Pontuação oficial das estruturas.
// Atualizar caso as regras do jogo mudem.
const POINTS: Record<string, number> = {
RUINAS: 100,
ABRIGO: 120,
RADIO: 180,
LABORATORIO: 200,
DEPOSITO: 150,
FORTALEZA: 300,
};

async function read(
table: string,
params: Record<string, string>,
max: number
): Promise<Row[]> {
if (!BASE || !KEY) {
throw new Error('Server credentials unavailable');
}

const out: Row[] = [];
const pageSize = 250;

for (let offset = 0; offset <= max; offset += pageSize) {
const limit = Math.min(pageSize, max + 1 - offset);

const url = new URL(`${BASE}/rest/v1/${table}`);

Object.entries(params).forEach(([k, v]) =>
url.searchParams.set(k, v)
);

url.searchParams.set('limit', String(limit));
url.searchParams.set('offset', String(offset));

const response = await fetch(url, {
method: 'GET',
headers: {
apikey: KEY,
Authorization: `Bearer ${KEY}`,
Accept: 'application/json',
},
signal: AbortSignal.timeout(12000),
});

if (!response.ok) {
throw new Error(`Read ${table}: ${response.status}`);
}

const result: unknown = await response.json();

if (!Array.isArray(result)) {
throw new Error(`Invalid response: ${table}`);
}

out.push(...result as Row[]);

if (result.length < limit) break;
}

if (out.length > max && table !== 'ar_events') {
throw new Error(`Maximum records exceeded: ${table}`);
}

return out;
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;
type CachedSnapshot = { until: number; data: Snapshot };
let cache: CachedSnapshot | null = null;
let inFlight: Promise<CachedSnapshot> | null = null;
let knownSeasonEnd: number | null = null;

async function snapshot() {
// This RPC performs the canonical lazy rollover. Territorial reads must follow
// it so their world snapshot reflects the same official season transition.
const season = await readSeason();
if (season) knownSeasonEnd = Date.parse(season.endsAt);
const cutoff = new Date(
Date.now() - 24 * 60 * 60 * 1000
).toISOString();

const [cells, players, patrols, events] =
await Promise.all([
read('ar_cells', {
select: 'id,owner,control,contagion,structure',
order: 'id.asc',
}, 3000),

read('ar_players', {
select: 'id',
enabled: 'eq.true',
}, 3000),

read('ar_patrols', {
select: 'player_id',
received_at: 'gte.' + cutoff,
}, 6000),

read('ar_events', {
select:
'id,kind,actor_type,actor_faction,created_at,cell_id',
order: 'id.desc',
}, 20),
]);

for (const cell of cells) {
if (!Object.hasOwn(POINTS, str(cell.structure))) {
throw new Error('Unknown structure type');
}
}

const ids = new Set(
players.map(p => str(p.id))
);

const active24h = new Set(
patrols
.map(p => str(p.player_id))
.filter(id => ids.has(id))
).size;

const factions = (['HUMAN', 'ZOMBIE'] as const)
.map(id => ({
id,
ownedCells: cells.filter(
c => c.owner === id
).length,

score: cells.reduce(
(sum, c) =>
sum + (
c.owner === id
? POINTS[str(c.structure)]
: 0
),
0
),
}));

const structureByCell = new Map(
cells.map(c => [
str(c.id),
str(c.structure),
])
);

return {
schemaVersion: 1,
asOf: new Date().toISOString(),

war: {
factions,
players: {
total: players.length,
active24h,
},
discoveredCells: cells.length,
contestedCells: cells.filter(
c =>
c.owner !== 'HUMAN' &&
c.owner !== 'ZOMBIE'
).length,
},

season,

events: events
.filter(e => e.kind !== 'SEASON_REBALANCE')
.slice(0, 12)
.map(e => ({
id: `war-${e.id}`,
kind: str(e.kind),

actorType:
e.actor_type === 'BOT'
? 'BOT'
: e.actor_type === 'PLAYER'
? 'PLAYER'
: 'SYSTEM',

faction:
e.actor_faction === 'HUMAN' ||
e.actor_faction === 'ZOMBIE'
? e.actor_faction
: null,

structure:
structureByCell.get(
str(e.cell_id)
) || null,

at: new Date(
new Date(
str(e.created_at)
).setUTCMinutes(0, 0, 0)
).toISOString(),
})),

cells: cells.map(c => ({
id: str(c.id),

owner:
c.owner === 'HUMAN' ||
c.owner === 'ZOMBIE'
? c.owner
: null,

control: num(c.control),
contagion: num(c.contagion),
structure: str(c.structure),
})),
};
}

async function getData() {
if (cache && Date.now() < cache.until) {
return cache;
}

if (inFlight) return inFlight;

inFlight = (async () => {
const startedAt = Date.now();
const data = await snapshot();
const now = Date.now();
const end = data.season ? Date.parse(data.season.endsAt) : null;
// If the request itself crosses the boundary, do not cache or publish the old
// season. The next read calls the canonical RPC again; no local score reset.
const crossedBoundary = (end !== null && end <= now) ||
(knownSeasonEnd !== null && startedAt < knownSeasonEnd && knownSeasonEnd <= now);
const until = crossedBoundary ? now : Math.min(
now + 120000,
knownSeasonEnd !== null && knownSeasonEnd > now ? knownSeasonEnd : Infinity,
);
const entry = { until, data: crossedBoundary ? { ...data, season: null } : data };
cache = entry;
return entry;
})();

try {
return await inFlight;
} finally {
inFlight = null;
}
}

Deno.serve(async (request: Request) => {
if (request.method === 'OPTIONS') {
return new Response(null, {
status: 204,
headers: cors,
});
}

if (request.method !== 'GET') {
return new Response(
JSON.stringify({
error: 'Method not allowed',
}),
{
status: 405,
headers: {
...jsonHeaders,
Allow: 'GET, OPTIONS',
},
}
);
}

try {
const entry = await getData();
const maxAge = Math.max(0, Math.min(60, Math.floor((entry.until - Date.now()) / 1000)));
const data = entry.data.season && Date.parse(entry.data.season.endsAt) <= Date.now()
? { ...entry.data, season: null }
: entry.data;

return new Response(
JSON.stringify(data),
{
status: 200,
headers: {
...jsonHeaders,
'Cache-Control':
`public, max-age=${maxAge}`,
},
}
);
} catch (error) {
console.error(
'War Room read error:',
error instanceof Error
? error.message
: 'unknown'
);

return new Response(
JSON.stringify({
error: 'Data unavailable',
}),
{
status: 503,
headers: {
...jsonHeaders,
'Cache-Control': 'no-store',
},
}
);
}
});

