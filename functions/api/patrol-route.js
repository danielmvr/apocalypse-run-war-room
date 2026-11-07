/**
 * Apocalypse Run | Rota de pedestres 2.1, Cloudflare Pages Function.
 * Correção: categoriza erros do ORS, sem expor segredo/coord. em logs.
 * Nunca inventa distância nem desenha caminhos quando ORS falha.
 * Independente de Supabase, D1 ou qualquer armazenamento remoto.
 */
const HEADERS={ 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff' };
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(x=>typeof x==='number'&&Number.isFinite(x))&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90;
const rad=x=>x*Math.PI/180;
function haversine(a,b){const dy=rad(b[1]-a[1]),dx=rad(b[0]-a[0]),h=Math.sin(dy/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dx/2)**2;return 12742017.6*Math.asin(Math.min(1,Math.sqrt(h)));}
function manualMeters(points){let d=0;for(let i=1;i<points.length;i++)d+=haversine(points[i-1],points[i]);return d;}
// Preserve geometry quality while bounding exported JSON size (Ramer-Douglas-Peucker).
function simplify(points,tolerance=2){
  if(points.length<=2)return points;
  const sq=tolerance*tolerance,keep=new Uint8Array(points.length);
  keep[0]=keep[points.length-1]=1;
  const stack=[[0,points.length-1]];
  while(stack.length){
    const [a,b]=stack.pop();let far=-1,at=-1;
    const c=Math.cos(rad((points[a][1]+points[b][1])/2))*111195;
    const p=[points[a][0]*c,points[a][1]*111195],q=[points[b][0]*c,points[b][1]*111195];
    const dx=q[0]-p[0],dy=q[1]-p[1],d=dx*dx+dy*dy;
    for(let i=a+1;i<b;i++){
      const v=[points[i][0]*c,points[i][1]*111195];
      const t=d?Math.max(0,Math.min(1,((v[0]-p[0])*dx+(v[1]-p[1])*dy)/d)):0;
      const error=(v[0]-p[0]-t*dx)**2+(v[1]-p[1]-t*dy)**2;
      if(error>far){far=error;at=i;}
    }
    if(far>sq&&at>=0){keep[at]=1;stack.push([a,at],[at,b]);}
  }
  return points.filter((_,i)=>keep[i]);
}
function upstreamError(status){
  if(status===401||status===403)return reply(503,{code:'ROUTER_ACCESS',providerStatus:status,error:'A chave ORS não tem acesso ao roteamento de pedestres (HTTP '+status+'). Verifique as permissões da chave HeiGIT.'});
  if(status===429)return reply(429,{code:'ROUTER_QUOTA',providerStatus:status,error:'Cota gratuita de rotas de pedestres esgotada. Tente novamente mais tarde.'});
  if(status===400||status===404||status===422)return reply(422,{code:'ROUTER_NO_PATH',providerStatus:status,error:'O provedor não encontrou um caminho de pedestres entre os pontos. Ajuste as paradas para ruas acessíveis.'});
  if(status===502||status===503||status===504)return reply(503,{code:'ROUTER_PROVIDER_DOWN',providerStatus:status,error:`Serviço de roteamento para pedestres instável (ORS HTTP ${status}). Pode estar em manutenção; tente novamente mais tarde.`});
  return reply(502,{code:'ROUTER_UPSTREAM',providerStatus:status,error:`O ORS rejeitou o cálculo (HTTP ${status}). Nenhuma distância viária foi calculada.`});
}
export async function onRequestPost({request,env}){
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return reply(403,{code:'ORIGIN_BLOCKED',error:'Origem não autorizada.'});
  if(!env.ORS_API_KEY)return reply(503,{code:'ROUTER_NOT_CONFIGURED',error:'Roteamento não configurado. Adicione o segredo ORS_API_KEY no Cloudflare.'});
  const length=Number(request.headers.get('content-length')||0);
  if(length>10000)return reply(413,{code:'TOO_LARGE',error:'Percurso muito grande.'});
  let body;
  try {const txt=await request.text();if(txt.length>10000)return reply(413,{code:'TOO_LARGE',error:'Percurso muito grande.'});body=JSON.parse(txt);}
  catch {return reply(400,{code:'BAD_JSON',error:'Requisição JSON inválida.'});}
  const coords=body?.coordinates;
  if(!Array.isArray(coords)||coords.length<2||coords.length>20||!coords.every(validPoint)||manualMeters(coords)>100000)
    return reply(400,{code:'BAD_WAYPOINTS',error:'Use de 2 a 20 paradas válidas, em um percurso de até 100 km.'});
  let res;
  try{
    res=await fetch('https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson',{
      method:'POST',headers:{Authorization:env.ORS_API_KEY,Accept:'application/geo+json, application/json','Content-Type':'application/json'},
      body:JSON.stringify({coordinates:coords,instructions:false}),signal:AbortSignal.timeout(18000)
    });
  }catch(e){
    const timeout=e?.name==='TimeoutError'||e?.name==='AbortError';
    return reply(503,{code:timeout?'ROUTER_TIMEOUT':'ROUTER_CONNECTION',error:timeout?'O roteador de pedestres não respondeu em 18 segundos. Pode estar em manutenção.':'Falha na conexão com o roteador de pedestres. Tente mais tarde.'});
  }
  if(!res.ok)return upstreamError(res.status);
  let data;
  try{data=await res.json();}catch{return reply(502,{code:'ROUTER_INVALID_JSON',error:'O provedor de rotas retornou um formato inválido.'});}
  const feature=data?.features?.[0],raw=feature?.geometry?.coordinates,summary=feature?.properties?.summary;
  if(!Array.isArray(raw)||raw.length<2||raw.length>80000||!raw.every(validPoint)||
    !summary||typeof summary.distance!=='number'||!Number.isFinite(summary.distance)||summary.distance<=0||summary.distance>100000)
    return reply(502,{code:'ROUTER_INVALID_ROUTE',error:'O provedor não retornou uma geometria de rota válida. Não é possível calcular distância pelas ruas.'});
  let reduced=raw;
  for(let tol=2;tol<=256;tol*=2){reduced=simplify(raw,tol);if(reduced.length<=1800)break;}
  if(reduced.length>1800)return reply(502,{code:'ROUTER_TOO_DETAILED',error:'Trajeto muito detalhado para o planejador. Divida a patrulha em percursos menores.'});
  const coordinates=reduced.map(([lon,lat])=>[Math.round(lon*1e6)/1e6,Math.round(lat*1e6)/1e6]);
  return reply(200,{provider:'openrouteservice',coordinates,distanceMeters:Math.round(summary.distance),calculatedAt:new Date().toISOString()});
}
export function onRequest(){return reply(405,{code:'METHOD_NOT_ALLOWED',error:'Método não permitido.'});}
