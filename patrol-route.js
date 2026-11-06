/**
 * Cloudflare Pages Function for foot-walking route, without storing any route.
 * No public API token. Validation and bounded response keep free quota safer.
 */
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' };
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers });
const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number' && Number.isFinite(x)) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
const radians = x => x * Math.PI / 180;
function dist(a,b){const dlat=radians(b[1]-a[1]),dlon=radians(b[0]-a[0]);const h=Math.sin(dlat/2)**2 + Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(dlon/2)**2;return 12742017.6*Math.asin(Math.min(1,Math.sqrt(h)));}
function meters(points){let d=0;for(let i=1;i<points.length;i++)d+=dist(points[i-1],points[i]);return d;}
/** Reduce geometry size by preserving greater-than-tolerance deviations (RDP). */
function simplify(points, tolerance=2){
  if(points.length<=2)return points;
  const sq=tolerance*tolerance;
  const keep = new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
  const queue=[[0,points.length-1]];
  while(queue.length){
    const [start,end]=queue.pop();let max=-1,idx=-1;
    const lat0=radians((points[start][1]+points[end][1])/2);
    const c=Math.cos(lat0)*111195;
    const a=[points[start][0]*c,points[start][1]*111195],b=[points[end][0]*c,points[end][1]*111195];
    const dx=b[0]-a[0],dy=b[1]-a[1],div=dx*dx+dy*dy;
    for(let i=start+1;i<end;i++){
      const p=[points[i][0]*c,points[i][1]*111195];
      const t=div?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/div)):0;
      const err=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
      if(err>max){max=err;idx=i;}
    }
    if(max>sq&&idx>0){keep[idx]=1;queue.push([start,idx],[idx,end]);}
  }
  return points.filter((_,i)=>keep[i]);
}
export async function onRequestPost({ request,env }) {
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json(403,{error:'Origem não autorizada.'});
  if (!env.ORS_API_KEY) return json(503,{error:'Roteamento ainda não ativado. Configure ORS_API_KEY no Cloudflare.'});
  const length=Number(request.headers.get('content-length')||0);
  if(length>10000)return json(413,{error:'Percurso muito grande.'});
  let payload;
  try { payload=await request.text();if(payload.length>10000)return json(413,{error:'Percurso muito grande.'});payload=JSON.parse(payload); }
  catch {return json(400,{error:'Pedido inválido.'});}
  const points=payload?.coordinates;
  if(!Array.isArray(points)||points.length<2||points.length>20||!points.every(validPoint)||meters(points)>100000)
    return json(400,{error:'Selecione de 2 a 20 paradas em um percurso de até 100 km.'});
  try {
    const res=await fetch('https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson',{
      method:'POST', headers:{Authorization:env.ORS_API_KEY,Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({coordinates:points,instructions:false}),signal:AbortSignal.timeout(18000)
    });
    if(res.status===401||res.status===403)return json(503,{error:'Chave ORS inválida ou sem permissão. Revise ORS_API_KEY no Cloudflare.'});
    if(res.status===429)return json(429,{error:'Cota de rotas do plano gratuito atingida. Tente mais tarde.'});
    if(res.status===400||res.status===404||res.status===422)return json(422,{error:'Não foi possível encontrar uma rota de pedestres entre esses pontos. Ajuste as paradas.'});
    if(!res.ok)return json(502,{error:'Serviço de roteamento indisponível. Use o modo manual por enquanto.'});
    const data=await res.json(),feat=data?.features?.[0],raw=feat?.geometry?.coordinates,summary=feat?.properties?.summary;
    if(!Array.isArray(raw)||raw.length<2||raw.length>80000||!raw.every(validPoint)||!summary||typeof summary.distance!=='number'||!Number.isFinite(summary.distance)||summary.distance<=0||summary.distance>100000)
      return json(502,{error:'O provedor retornou uma rota inválida ou acima do limite.'});
    let reduced=raw;
    for(let tol=2;tol<=256;tol*=2){reduced=simplify(raw,tol);if(reduced.length<=1800)break;}
    if(reduced.length>1800)return json(502,{error:'Rota muito detalhada. Tente dividir em percursos menores.'});
    const coordinates=reduced.map(([lon,lat])=>[Math.round(lon*1e6)/1e6,Math.round(lat*1e6)/1e6]);
    return json(200,{ provider:'openrouteservice',coordinates,distanceMeters:Math.round(summary.distance),calculatedAt:new Date().toISOString() });
  } catch {return json(503,{error:'Não foi possível calcular a rota agora. Seus pontos continuam salvos localmente.'});}
}
export function onRequest() {return json(405,{error:'Método não permitido.'});}
