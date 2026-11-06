/**
 * Apocalypse Run | Portable patrol plan contract v2.
 * v1 manual files remain importable; routed v2 geometry remains local and is only an overlay.
 */
export const PLAN_KIND = 'apocalypse-run.patrol-plan' as const;
export const PLAN_VERSION = 2 as const;
export const MAX_POINTS = 250;
export const MAX_ROUTE_STOPS = 20;
export const MAX_ROUTE_GEOMETRY_POINTS = 1800;
export const MAX_LOCAL_PLANS = 20;
export const MAX_DISTANCE_METERS = 100_000;
export type LngLat = [number, number];
export type TravelMode = 'WALK' | 'RUN';
export type RouteShape = {
  provider: 'openrouteservice';
  coordinates: LngLat[];
  distanceMeters: number;
  calculatedAt: string;
};
export interface PatrolPlan {
  kind: typeof PLAN_KIND;
  schemaVersion: typeof PLAN_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: TravelMode;
  speedKmh: number;
  waypoints: LngLat[];
  waypointLabels: string[];
  geometryMode: 'MANUAL' | 'ROUTED';
  route?: RouteShape;
}
const deg = Math.PI / 180;
const rounding = (x: number) => Math.round(x * 1e6) / 1e6;
export function pointIsValid(v: unknown): v is LngLat {
  return Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && Number.isFinite(x)) &&
    v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
}
export function cleanPoint(p: LngLat): LngLat { return [rounding(p[0]), rounding(p[1])]; }
export function segmentMeters(a: LngLat, b: LngLat): number {
  const lat1 = a[1] * deg, lat2 = b[1] * deg;
  const dlat = (b[1] - a[1]) * deg, dlon = (b[0] - a[0]) * deg;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function totalMeters(points: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += segmentMeters(points[i - 1], points[i]);
  return total;
}
export function estimateSeconds(meters: number, kmh: number): number {
  if (!Number.isFinite(meters) || meters < 0 || !Number.isFinite(kmh) || kmh <= 0) return 0;
  return Math.round(meters / (kmh * 1000 / 3600));
}
export function blankPlan(): PatrolPlan {
  const now = new Date().toISOString();
  return { kind: PLAN_KIND, schemaVersion: PLAN_VERSION, id: crypto.randomUUID(), title: 'Minha patrulha',
    createdAt: now, updatedAt: now, mode: 'WALK', speedKmh: 4.5, waypoints: [], waypointLabels: [], geometryMode: 'MANUAL' };
}
export function invalidateRoute(plan: PatrolPlan) {
  plan.geometryMode = 'MANUAL';
  delete plan.route;
}
export function routePoints(plan: PatrolPlan): LngLat[] {
  return plan.geometryMode === 'ROUTED' && plan.route ? plan.route.coordinates : plan.waypoints;
}
export function effectiveMeters(plan: PatrolPlan): number {
  return plan.geometryMode === 'ROUTED' && plan.route ? plan.route.distanceMeters : totalMeters(plan.waypoints);
}
export function parsePlan(data: unknown): PatrolPlan {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Arquivo de patrulha inválido.');
  const p = data as Record<string, unknown>;
  if (p.kind !== PLAN_KIND || (p.schemaVersion !== 1 && p.schemaVersion !== 2))
    throw Error('Formato ou versão de plano não reconhecido.');
  if (typeof p.id !== 'string' || p.id.length > 100 || p.id.length < 8 || !/^[0-9A-Za-z-]+$/.test(p.id))
    throw Error('Identificador de plano inválido.');
  if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 60) throw Error('Nome de plano inválido.');
  if (p.mode !== 'WALK' && p.mode !== 'RUN') throw Error('Modalidade inválida.');
  if (typeof p.speedKmh !== 'number' || !Number.isFinite(p.speedKmh) || p.speedKmh < 2 || p.speedKmh > 8.5)
    throw Error('Velocidade de referência inválida.');
  if (typeof p.createdAt !== 'string' || typeof p.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(p.createdAt)) || !Number.isFinite(Date.parse(p.updatedAt)))
    throw Error('Datas do arquivo inválidas.');
  if (!Array.isArray(p.waypoints) || p.waypoints.length > MAX_POINTS || !p.waypoints.every(pointIsValid))
    throw Error('Pontos do percurso inválidos ou acima do limite.');
  const waypoints = (p.waypoints as LngLat[]).map(cleanPoint);
  if (totalMeters(waypoints) > MAX_DISTANCE_METERS) throw Error('Rota acima de 100 km. Divida o percurso.');
  const labels = p.schemaVersion === 2 && Array.isArray(p.waypointLabels) ? p.waypointLabels : [];
  if (!labels.every(v => typeof v === 'string' && v.length <= 140) || labels.length > waypoints.length)
    throw Error('Referências de endereço inválidas.');
  const waypointLabels = waypoints.map((_, i) => (labels[i] ?? '').trim());
  let route: RouteShape | undefined;
  if (p.schemaVersion === 1 && p.geometryMode !== 'MANUAL') throw Error('Modo de rota inválido.');
  if (p.schemaVersion === 2 && p.geometryMode !== 'MANUAL' && p.geometryMode !== 'ROUTED')
    throw Error('Modo de rota inválido.');
  if (p.geometryMode === 'ROUTED') {
    const r = p.route as Record<string, unknown> | undefined;
    if (!r || r.provider !== 'openrouteservice' || !Array.isArray(r.coordinates) ||
      r.coordinates.length < 2 || r.coordinates.length > MAX_ROUTE_GEOMETRY_POINTS ||
      !r.coordinates.every(pointIsValid) || typeof r.distanceMeters !== 'number' ||
      !Number.isFinite(r.distanceMeters) || r.distanceMeters <= 0 || r.distanceMeters > MAX_DISTANCE_METERS ||
      typeof r.calculatedAt !== 'string' || Number.isNaN(Date.parse(r.calculatedAt)) || waypoints.length < 2)
      throw Error('Dados da rota viária inválidos.');
    route = { provider: 'openrouteservice', coordinates: (r.coordinates as LngLat[]).map(cleanPoint),
      distanceMeters: Math.round(r.distanceMeters), calculatedAt: new Date(r.calculatedAt).toISOString() };
  }
  return { kind: PLAN_KIND, schemaVersion: PLAN_VERSION, id: p.id, title: p.title.trim(),
    createdAt: new Date(p.createdAt).toISOString(), updatedAt: new Date(p.updatedAt).toISOString(),
    mode: p.mode, speedKmh: p.speedKmh, waypoints, waypointLabels,
    geometryMode: route ? 'ROUTED' : 'MANUAL', ...(route ? { route } : {}) };
}
export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function toGPX(plan: PatrolPlan): string {
  const p = parsePlan(plan);
  const nodes = routePoints(p).map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Apocalypse Run - Planejador" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${xmlEscape(p.title)}</name></metadata>\n  <trk><name>${xmlEscape(p.title)}</name><type>${p.mode === 'RUN' ? 'running' : 'walking'}</type>\n    <trkseg>\n${nodes}\n    </trkseg>\n  </trk>\n</gpx>\n`;
}
/** Explicitly simplified Google Maps launch: max 3 intermediate waypoints on mobile browser. */
export function googleMapsLink(points: readonly LngLat[]): { url: string; reduced: boolean } {
  if (points.length < 2) throw Error('Adicione pelo menos dois pontos para abrir o trajeto.');
  const waypoints = points.length <= 5 ? [...points] : [points[0], points[Math.floor((points.length - 1) / 4)],
    points[Math.floor((points.length - 1) / 2)], points[Math.floor((points.length - 1) * 3 / 4)], points[points.length - 1]];
  const xy = (p: LngLat) => p[1].toFixed(6) + ',' + p[0].toFixed(6);
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');u.searchParams.set('travelmode', 'walking');
  u.searchParams.set('origin', xy(waypoints[0]));u.searchParams.set('destination', xy(waypoints[waypoints.length - 1]));
  if (waypoints.length > 2) u.searchParams.set('waypoints', waypoints.slice(1, -1).map(xy).join('|'));
  return { url: u.toString(), reduced: points.length > 5 };
}
