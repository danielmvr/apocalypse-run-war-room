/**
 * Apocalypse Run | Endereços nacionais v2.2
 * Primary: HeiGIT Pelias. Fallback: Geoapify when the requested house number
 * is not found or Pelias fails. Provider secrets stay in Cloudflare Pages.
 * No Supabase, KV, D1 or persistent server-side storage.
 */
const H = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply = (status,data)=>new Response(JSON.stringify(data),{status,headers:H});
const validNumber=(x,min,max)=>x!==null&&x!==''&&Number.isFinite(Number(x))&&Number(x)>=min&&Number(x)<=max;
const pointOk=p=>Array.isArray(p)&&p.length>=2&&validNumber(p[0],-180,180)&&validNumber(p[1],-90,90);
const compact=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const normNo=x=>compact(String(x??'').replace(/^0+(?=\d)/,'')).replace(/\s+/g,'');
const normStreet=s=>compact(s).replace(/^(?:rua|avenida|av|r|travessa|tv|estrada|rodovia|praca|alameda)\s+/,'');
const limit=s=>String(s??'').trim().slice(0,140);
function splitNumber(query){
  // Examples: "Rua X, 26 - Cidade, UF", "Rua X nº 26, Bairro, Cidade, UF"
  const m=query.match(/^(.+?),\s*(?:n[º°o.]?\s*)?(\d{1,6}[A-Za-z]?)\s*(?:[-,]\s*(.+))?$/u)
    || query.match(/^(.+?)\s+n[º°o.]?\s*(\d{1,6}[A-Za-z]?)\s*(?:[-,]\s*(.+))?$/u)
    || query.match(/^(.+?)\s+(\d{1,6}[A-Za-z]?)\s*,\s*(.+)$/u);
  if(!m||m[1].trim().length<4)return null;
  const areas=(m[3]||'').trim().split(/\s*,\s*/).filter(Boolean);
  const last=areas.at(-1)||'';
  const hasState=/^[a-z]{2}$/i.test(last);
  const city=hasState?(areas.at(-2)||''):last;
  return {street:m[1].trim(),number:m[2],city,region:hasState?last:''};
}
function streetMatches(expected,actual){
  const a=normStreet(expected),b=normStreet(actual);
  return !a||!!b&&(a===b || (Math.min(a.length,b.length)>8&&(a.startsWith(b)||b.startsWith(a))));
}
function cityMatches(expected,actual){const a=compact(expected),b=compact(actual);return !a||!!b&&(a===b||a.includes(b)&&b.length>4||b.includes(a)&&a.length>4);}
function countryBrazil(props,kind){
  const c=compact(kind==='geo'?props.country_code:(props.country_a||props.country));
  return !c||['br','bra','brazil','brasil'].includes(c);
}
const quality={verified:0,estimated:1,street:2,place:3};
function result({lat,lon,label,source,precision,requestedNumber,notice}){
  const coords=[Number(lon),Number(lat)];
  if(!pointOk(coords)||!label)return null;
  const status=precision==='verified'?'✓ NÚMERO NA BASE':precision==='estimated'?'≈ NÚMERO ESTIMADO':precision==='street'?'⚠ NÚMERO NÃO LOCALIZADO':'';
  const display=(status?`${status} · ${limit(label)}`:limit(label)).slice(0,140);
  return {label:display,coordinates:coords,precision,source,numberConfirmed:precision==='verified',...(requestedNumber?{requestedNumber}:{}),...(notice?{notice:limit(notice)}:{})};
}
function peliasResults(features,part){
  if(!Array.isArray(features))return [];
  return features.slice(0,12).flatMap(f=>{
    const p=f?.properties||{};
    if(!pointOk(f?.geometry?.coordinates)||!countryBrazil(p,'pelias'))return [];
    const label=limit(p.label||p.name);if(!label)return [];
    let precision='place';
    if(part){
      const numberEqual=normNo(p.housenumber)===normNo(part.number);
      const streetEqual=streetMatches(part.street,p.street);
      const cityEqual=cityMatches(part.city,p.locality||p.localadmin||p.region);
      if(numberEqual&&streetEqual&&cityEqual&&p.layer==='address'&&!['fallback','interpolated'].includes(p.match_type)&&p.accuracy!=='centroid')precision='verified';
      else if(numberEqual&&streetEqual&&cityEqual)precision='estimated';
      else precision='street';
    }
    const [lon,lat]=f.geometry.coordinates;
    return [result({lat,lon,label,source:'HeiGIT',precision,requestedNumber:part?.number,
      notice:precision==='street'?`Nº ${part.number} não comprovado. Ajuste o marcador no mapa.`:undefined})].filter(Boolean);
  });
}
function geoResults(data,part){
  if(!Array.isArray(data?.results))return [];
  return data.results.slice(0,8).flatMap(p=>{
    if(!countryBrazil(p,'geo'))return [];
    const label=limit(p.formatted||p.address_line1);if(!label)return [];
    let precision='place';
    if(part){
      const sameNumber=normNo(p.housenumber)===normNo(part.number);
      const matchStreet=streetMatches(part.street,p.street);
      const matchCity=cityMatches(part.city,p.city||p.county);
      const quality=p.rank||{};
      const confident=(typeof quality.confidence==='number'&&quality.confidence>=.9&&
        ['full_match','match_by_building'].includes(quality.match_type)) &&
        (quality.confidence_building_level===undefined||quality.confidence_building_level>=.85);
      if(sameNumber&&matchStreet&&matchCity&&p.result_type==='building'&&confident)precision='verified';
      else if(sameNumber&&matchStreet&&matchCity)precision='estimated';
      else precision='street';
    }
    return [result({lon:p.lon,lat:p.lat,label,source:'Geoapify',precision,requestedNumber:part?.number,
      notice:precision==='street'?`Nº ${part.number} não comprovado. Ajuste o marcador no mapa.`:undefined})].filter(Boolean);
  });
}
async function callProvider(url,headers){
  try{
    const res=await fetch(url,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(11000)});
    if(res.status===429)return {failure:'quota'};
    if(res.status===401||res.status===403)return {failure:'auth'};
    if(!res.ok)return {failure:'upstream',status:res.status};
    const data=await res.json();return {data};
  }catch(e){return {failure:e?.name==='TimeoutError'?'timeout':'network'};}
}
function merge(rows){
  const arr=[];
  for(const x of rows){
    const existing=arr.findIndex(y=>x.coordinates.every((v,i)=>Math.abs(v-y.coordinates[i])<0.000045) && x.precision===y.precision);
    if(existing<0)arr.push(x);
  }
  return arr.sort((a,b)=>(quality[a.precision]??3)-(quality[b.precision]??3)).slice(0,5);
}
function peliasUrl(path,q,part,center){
  const url=new URL(`https://api.heigit.org/pelias/v1/${path}`);
  if(path==='search/structured'){
    url.searchParams.set('address',`${part.number} ${part.street}`);
    if(part.city)url.searchParams.set('locality',part.city);
    if(part.region)url.searchParams.set('region',part.region);
    url.searchParams.set('country','Brazil');
  } else url.searchParams.set('text',q);
  url.searchParams.set('size','6');url.searchParams.set('lang','pt');
  if(center){url.searchParams.set('focus.point.lon',center[0]);url.searchParams.set('focus.point.lat',center[1]);}
  return url;
}
function geoUrl(q,part,center,apiKey){
  const u=new URL('https://api.geoapify.com/v1/geocode/search');
  if(part){
    u.searchParams.set('street',part.street);u.searchParams.set('housenumber',part.number);
    if(part.city)u.searchParams.set('city',part.city);
    if(part.region&&part.region.length>2)u.searchParams.set('state',part.region);
    u.searchParams.set('country','Brazil');
  }else u.searchParams.set('text',q);
  u.searchParams.set('format','json');u.searchParams.set('limit','5');u.searchParams.set('lang','pt');
  u.searchParams.set('filter','countrycode:br');
  if(center)u.searchParams.set('bias',`proximity:${center[0]},${center[1]}`);
  u.searchParams.set('apiKey',apiKey); // Only server-to-provider, never returned to browser.
  return u;
}
export async function onRequestGet({request,env}){
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return reply(403,{error:'Origem não autorizada.'});
  const u=new URL(request.url),q=(u.searchParams.get('q')||'').trim();
  if(q.length<3||q.length>140)return reply(400,{error:'Digite entre 3 e 140 caracteres para pesquisar.'});
  const part=splitNumber(q);
  const lat=u.searchParams.get('lat'),lon=u.searchParams.get('lon');
  const center=validNumber(lon,-180,180)&&validNumber(lat,-90,90)?[String(Number(lon)),String(Number(lat))]:null;
  const hasORS=!!env?.ORS_API_KEY,hasGeo=!!env?.GEOAPIFY_API_KEY;
  if(!hasORS&&!hasGeo)return reply(503,{code:'NO_PROVIDER',error:'Configure ORS_API_KEY ou GEOAPIFY_API_KEY no Cloudflare.'});
  const rows=[];const errors=[];
  if(hasORS){
    if(part){
      const first=await callProvider(peliasUrl('search/structured',q,part,center),{Authorization:env.ORS_API_KEY});
      if(first.data?.features)rows.push(...peliasResults(first.data.features,part));
      else if(first.failure)errors.push(`HeiGIT: ${first.failure}`);
    }
    if(!rows.some(x=>x.precision==='verified')){
      const fallback=await callProvider(peliasUrl('search',q,part,center),{Authorization:env.ORS_API_KEY});
      if(fallback.data?.features)rows.push(...peliasResults(fallback.data.features,part));
      else if(fallback.failure)errors.push(`HeiGIT: ${fallback.failure}`);
    }
  }
  const shouldFallback=hasGeo && (!rows.length||part&&!rows.some(x=>x.precision==='verified'));
  if(shouldFallback){
    const geo=await callProvider(geoUrl(q,part,center,env.GEOAPIFY_API_KEY),{});
    if(Array.isArray(geo.data?.results))rows.push(...geoResults(geo.data,part));
    else if(geo.failure)errors.push(`Geoapify: ${geo.failure}`);
  }
  const results=merge(rows);
  if(!results.length&&errors.length)return reply(503,{code:'GEOCODER_UNAVAILABLE',error:'Os serviços de busca estão temporariamente indisponíveis. Você pode ajustar um ponto manualmente.',providers:errors});
  const hasExact=results.some(x=>x.numberConfirmed);
  const notice=part?(hasExact?`Nº ${part.number} encontrado em uma base de endereços. Confira o ponto de entrada.`:`Nº ${part.number} não localizado com segurança. Use “Ajustar ponto” para selecionar o local correto no mapa.`):undefined;
  return reply(200,{results,...(part?{requestedNumber:part.number,numberConfirmed:hasExact,notice}:{}),
    sources:hasGeo?['HeiGIT','Geoapify']:['HeiGIT'],
    attribution:'© OpenStreetMap contributors; Powered by Geoapify (quando utilizado)'});
}
export function onRequest(){return reply(405,{error:'Método não permitido.'});}
