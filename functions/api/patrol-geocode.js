/**
 * Cloudflare Pages Function, same-origin POST-free geocode search.
 * API key stays in Cloudflare secret ORS_API_KEY, never in browser JavaScript.
 * Does not use Supabase, KV, D1, or persist search history.
 */
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers });
const coord = (v, min, max) => Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json(403, { error: 'Origem não autorizada.' });
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 3 || q.length > 140) return json(400, { error: 'Pesquise entre 3 e 140 caracteres.' });
  if (!env.ORS_API_KEY) return json(503, { error: 'Pesquisa por endereço ainda não ativada. Configure ORS_API_KEY no Cloudflare.' });
  const upstream = new URL('https://api.heigit.org/pelias/v1/search');
  upstream.searchParams.set('text', q);
  upstream.searchParams.set('size', '5');
  upstream.searchParams.set('lang', 'pt');
  const lon = url.searchParams.get('lon'), lat = url.searchParams.get('lat');
  if (lon !== null && lat !== null && coord(lon,-180,180) && coord(lat,-90,90)) {
    upstream.searchParams.set('focus.point.lon', String(Number(lon)));
    upstream.searchParams.set('focus.point.lat', String(Number(lat)));
  }
  try {
    const res = await fetch(upstream, { headers: { Authorization: env.ORS_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (res.status === 401 || res.status === 403) return json(503, {error:'Chave ORS inválida ou sem permissão. Configure ORS_API_KEY no Cloudflare.'});
    if (res.status === 429) return json(429, {error:'Limite gratuito de pesquisas atingido. Tente mais tarde.'});
    if (!res.ok) return json(502, {error:'Serviço de endereços indisponível. Continue marcando pontos no mapa.'});
    const payload = await res.json();
    if (!Array.isArray(payload.features)) return json(502,{error:'Resposta de endereços inválida.'});
    const results = payload.features.slice(0,5).flatMap(f => {
      const p = f?.geometry?.coordinates;
      if (!Array.isArray(p) || p.length < 2 || !coord(p[0],-180,180) || !coord(p[1],-90,90)) return [];
      const label = String(f?.properties?.label || f?.properties?.name || '').slice(0,140);
      return label ? [{label,coordinates:[Number(p[0]),Number(p[1])]}] : [];
    });
    return json(200, { results, attribution:'© openrouteservice / HeiGIT / OpenStreetMap contributors' });
  } catch { return json(503, {error:'Pesquisa temporariamente indisponível. O modo manual continua funcionando.'}); }
}
export function onRequest() {return json(405,{error:'Método não permitido.'});}
