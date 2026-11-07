/**
 * Apocalypse Run | Geocodificação de endereços, versão 2.1
 * Cloudflare Pages Function. A chave ORS_API_KEY fica somente no servidor.
 * Se o número não existir na base, jamais apresenta a rua como número confirmado.
 * Sem Supabase, D1, KV ou persistência dos endereços.
 */
const HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
};
const reply = (status, data) => new Response(JSON.stringify(data), {status, headers:HEADERS});
const validNumber = (v, a, b) => v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b;
const pointOk = p => Array.isArray(p) && p.length >= 2 && validNumber(p[0],-180,180) && validNumber(p[1],-90,90);

// Addresses of the form "Rua Primo Teixeira, 26 - Rio de Janeiro, RJ".
function splitNumber(q) {
  const match = q.match(/^(.+?),\s*(\d{1,6}[A-Za-z]?)\s*(?:[-,]\s*(.+))?$/u);
  if (!match) return null;
  const street = match[1].trim();
  const number = match[2].trim();
  const afterNumber = (match[3] || '').trim();
  if (street.length < 4) return null;
  const areas = afterNumber.split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean);
  return {street, number, locality:areas[0] || '', region:areas[1] || ''};
}
const normNumber = n => String(n || '').trim().replace(/^0+(?=\d)/, '').toLowerCase();
const normStreet = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^(?:rua|r\.?|avenida|av\.?)\s+/,'').replace(/[^a-z0-9]/g,'');
function mapResults(features, requestedNumber, requestedStreet='') {
  if (!Array.isArray(features)) return [];
  return features.slice(0,12).flatMap(f => {
    if (!pointOk(f?.geometry?.coordinates)) return [];
    const p=f?.properties || {};
    const base=String(p.label || p.name || '').trim().slice(0,140);
    if (!base) return [];
    let precision='place', notice='';
    const matched=normNumber(p.housenumber);
    const foundSameNumber=!!requestedNumber && matched===normNumber(requestedNumber);
    const rStreet=normStreet(requestedStreet),hitStreet=normStreet(p.street);
    const streetMatches=!requestedStreet || (hitStreet && rStreet && (hitStreet.includes(rStreet)||rStreet.includes(hitStreet)));
    const exact=foundSameNumber && streetMatches && p.layer === 'address' && p.match_type !== 'fallback' && p.match_type !== 'interpolated' && p.accuracy !== 'centroid';
    if (requestedNumber) {
      if (exact) precision='exact';
      else if (foundSameNumber && p.match_type === 'interpolated') {
        precision='interpolated';
        notice=`Nº ${requestedNumber} estimado por interpolação; confira no mapa.`;
      } else {
        precision='street';
        notice=`Nº ${requestedNumber} não confirmado. Ponto aproximado na rua/região.`;
      }
    }
    // 140 characters max: the existing Vite frontend rejects longer labels.
    const label=precision==='exact' ? `✓ Nº ${requestedNumber} CONFIRMADO · ${base}` :
      precision==='interpolated' ? `≈ Nº ${requestedNumber} ESTIMADO · ${base}` :
      requestedNumber ? `⚠ Nº ${requestedNumber} NÃO CONFIRMADO · ${base}` : base;
    return [{ label:label.slice(0,140),
      coordinates:[Number(f.geometry.coordinates[0]),Number(f.geometry.coordinates[1])],
      precision, numberConfirmed:precision==='exact',
      ...(requestedNumber ? {requestedNumber} : {}) }];
  });
}
async function provider(url, key) {
  let res;
  try {
    res=await fetch(url, {headers:{Authorization:key, Accept:'application/json'},signal:AbortSignal.timeout(11000)});
  } catch (e) {return {failure:'network',timeout:e?.name==='TimeoutError'||e?.name==='AbortError'};}
  if (res.status===401||res.status===403) return {failure:'auth'};
  if (res.status===429) return {failure:'quota'};
  if (!res.ok) return {failure:'upstream',status:res.status};
  try {
    const data=await res.json();
    if (!Array.isArray(data?.features)) return {failure:'invalid'};
    return {features:data.features};
  } catch {return {failure:'invalid'};}
}
const failureReply = result => {
  if(result.failure==='auth') return reply(503,{code:'GEOCODER_AUTH',error:'Chave ORS inválida ou sem acesso ao serviço de endereços. Verifique ORS_API_KEY.'});
  if(result.failure==='quota')return reply(429,{code:'GEOCODER_QUOTA',error:'Limite gratuito de buscas atingido. Tente mais tarde.'});
  if(result.failure==='network')return reply(503,{code:result.timeout?'GEOCODER_TIMEOUT':'GEOCODER_NETWORK',error:'Geocodificador temporariamente inacessível. Você pode continuar marcando pontos manualmente.'});
  return reply(502,{code:'GEOCODER_UPSTREAM',providerStatus:Number(result.status)||null,error:'Serviço de busca de endereços indisponível. Tente mais tarde.'});
};
export async function onRequestGet({request,env}) {
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return reply(403,{error:'Origem não autorizada.'});
  const url=new URL(request.url),q=(url.searchParams.get('q')||'').trim();
  if(q.length<3||q.length>140)return reply(400,{error:'Pesquise entre 3 e 140 caracteres.'});
  if(!env.ORS_API_KEY)return reply(503,{code:'GEOCODER_NOT_CONFIGURED',error:'Pesquisa não ativada. Configure ORS_API_KEY no Cloudflare.'});
  const part=splitNumber(q);
  const settings = [['size','6'],['lang','pt']];
  const lat=url.searchParams.get('lat'),lon=url.searchParams.get('lon');
  if(validNumber(lon,-180,180)&&validNumber(lat,-90,90))settings.push(['focus.point.lon',String(Number(lon))],['focus.point.lat',String(Number(lat))]);
  // Structured query avoids treating "Rua..., 26" as a generic street search.
  let structuredRows=[];
  if(part){
    const u=new URL('https://api.heigit.org/pelias/v1/search/structured');
    u.searchParams.set('address',`${part.number} ${part.street}`);
    if(part.locality)u.searchParams.set('locality',part.locality);
    if(part.region)u.searchParams.set('region',part.region);
    u.searchParams.set('country','Brazil');
    for(const [key,value] of settings)u.searchParams.set(key,value);
    const first=await provider(u,env.ORS_API_KEY);
    if(first.failure==='auth'||first.failure==='quota')return failureReply(first);
    if(!first.failure){
      const rows=mapResults(first.features,part.number,part.street);
      structuredRows=rows;
      if(rows.some(x=>x.precision==='exact'))return reply(200,{results:rows.slice(0,5),requestedNumber:part.number,numberConfirmed:true,attribution:'© HeiGIT / Pelias / OpenStreetMap contributors'});
    }
  }
  // One fallback search only if structured search had no verified house-number match.
  const search=new URL('https://api.heigit.org/pelias/v1/search');
  search.searchParams.set('text',q);
  for(const [key,value] of settings)search.searchParams.set(key,value);
  const second=await provider(search,env.ORS_API_KEY);
  if(second.failure)return failureReply(second);
  const rows=mapResults(second.features,part?.number,part?.street);
  // Keep useful structured approximations if free-text fallback has no result.
  if(part){
    const keys=new Set(rows.map(x=>x.coordinates.join(',')));
    for(const r of structuredRows){if(!keys.has(r.coordinates.join(','))){rows.push(r);keys.add(r.coordinates.join(','));}}
    rows.sort((a,b)=>({exact:0,interpolated:1,street:2,place:3}[a.precision]??3)-({exact:0,interpolated:1,street:2,place:3}[b.precision]??3));
  }
  return reply(200,{
    results:rows.slice(0,5),
    ...(part ? {requestedNumber:part.number,numberConfirmed:rows.some(x=>x.numberConfirmed),
      notice:rows.some(x=>x.numberConfirmed)?'Número do endereço localizado.':`O número ${part.number} não foi confirmado na base cartográfica. Selecione uma referência aproximada ou marque o ponto manualmente no mapa.`} : {}),
    attribution:'© HeiGIT / Pelias / OpenStreetMap contributors'
  });
}
export function onRequest(){return reply(405,{error:'Método não permitido.'});}
