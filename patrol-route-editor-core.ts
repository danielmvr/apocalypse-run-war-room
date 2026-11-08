/**
 * Apocalypse Run | v2.3: pure helpers for user-selected walking-route via points.
 * Neither geocodes nor makes route API calls. Existing waypoint order is preserved.
 */
export type Coord = [number, number];
export type EditablePlan = {
  waypoints: Coord[];
  waypointLabels: string[];
  geometryMode: 'MANUAL' | 'ROUTED';
  route?: unknown;
  updatedAt: string;
};

export const MAX_ROUTING_WAYPOINTS = 20;
export const MAX_ROUTE_LENGTH_METERS = 100_000;

const radians = (angle: number) => (angle * Math.PI) / 180;
function isCoord(p: unknown): p is Coord {
  return Array.isArray(p) && p.length === 2 &&
    p.every(v => typeof v === 'number' && Number.isFinite(v)) &&
    p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
}
export function straightMeters(a: Coord, b: Coord): number {
  const dy = radians(b[1] - a[1]);
  const dx = radians(b[0] - a[0]);
  const h = Math.sin(dy / 2) ** 2 + Math.cos(radians(a[1])) *
    Math.cos(radians(b[1])) * Math.sin(dx / 2) ** 2;
  return 12_742_017.6 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function waypointMeters(points: Coord[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += straightMeters(points[i-1], points[i]);
  return total;
}
export function midpoint(a: Coord, b: Coord): Coord {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
export function insertWalkingViaPoint<T extends EditablePlan>(
  plan: T, segmentIndex: number, desired: Coord, timestamp: string,
): T {
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= plan.waypoints.length - 1) {
    throw new Error('Trecho inválido. Selecione duas paradas consecutivas.');
  }
  if (plan.waypoints.length >= MAX_ROUTING_WAYPOINTS) {
    throw new Error('Já existem 20 pontos. Remova algum antes de adicionar outro desvio.');
  }
  if (!isCoord(desired)) throw new Error('Posição inválida para o ponto de passagem.');
  const rounded: Coord = [Math.round(desired[0] * 1e6) / 1e6, Math.round(desired[1] * 1e6) / 1e6];
  if (straightMeters(plan.waypoints[segmentIndex], rounded) < 5 ||
      straightMeters(plan.waypoints[segmentIndex + 1], rounded) < 5) {
    throw new Error('Coloque o desvio pelo menos 5 metros distante das duas paradas do trecho.');
  }
  const waypoints = plan.waypoints.map(p => [...p] as Coord);
  waypoints.splice(segmentIndex + 1, 0, rounded);
  if (waypointMeters(waypoints) > MAX_ROUTE_LENGTH_METERS) {
    throw new Error('O percurso ultrapassaria 100 km. Use um desvio mais próximo.');
  }
  const labels = [...plan.waypointLabels];
  labels.splice(segmentIndex + 1, 0, '↪ Passagem escolhida pelo jogador (a pé)');
  const next = { ...plan, waypoints, waypointLabels: labels,
    geometryMode: 'MANUAL' as const, updatedAt: timestamp };
  delete next.route;
  return next as T;
}
