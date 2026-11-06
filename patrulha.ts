import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './patrulha.css';
import { blankPlan, cleanPoint, effectiveMeters, estimateSeconds, googleMapsLink, invalidateRoute, MAX_DISTANCE_METERS,
  MAX_LOCAL_PLANS, MAX_POINTS, MAX_ROUTE_STOPS, parsePlan, pointIsValid, routePoints, segmentMeters,
  toGPX, totalMeters, type PatrolPlan, type LngLat } from './patrol-core';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORAGE_DRAFT = 'ar.patrol.draft.v1';
const STORAGE_SAVED = 'ar.patrol.saved.v1';
const format = (n: number, digits = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
const metersLabel = (m: number) => m < 1000 ? `${format(Math.round(m))} m` : `${format(m / 1000, 2)} km`;
const durationLabel = (seconds: number) => {
  if (seconds <= 0) return '0 min';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min`;
};
const paceLabel = (kmh: number) => `${Math.floor(60 / kmh)}:${String(Math.round((60 / kmh % 1) * 60)).padStart(2, '0')}/km`;
const now = () => new Date().toISOString();
let toastTimeout = 0;
function toast(message: string) {
  const box = $<HTMLDivElement>('patrol-toast'); box.textContent = message; box.hidden = false;
  window.clearTimeout(toastTimeout); toastTimeout = window.setTimeout(() => box.hidden = true, 5500);
}
function readDraft(): PatrolPlan | null {
  try { const v = localStorage.getItem(STORAGE_DRAFT); return v ? parsePlan(JSON.parse(v)) : null; } catch { return null; }
}
function readSaved(): PatrolPlan[] {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(STORAGE_SAVED) ?? '[]');
    if (!Array.isArray(p)) return [];
    return p.slice(0, MAX_LOCAL_PLANS).flatMap(v => { try { return [parsePlan(v)]; } catch { return []; } });
  } catch { return []; }
}
function persist(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch {
    $('storage-note').textContent = 'Armazenamento local indisponível. Exporte seu plano JSON para não perder a rota.';
    return false;
  }
}
let current = readDraft() ?? blankPlan();
let saved = readSaved();
let map: MapLibreMap | null = null;
let mapReady = false;
let geolocationBusy = false;
let addressBusy = false;
let routeBusy = false;
let addressRequestSeq = 0;
let addressLastSearchedAt = 0;
const ORS_GEOCODE = './api/patrol-geocode';
const ORS_ROUTE = './api/patrol-route';
function setRouteStatus(message: string, kind: 'info'|'success'|'error'='info') {
  const el = $('route-status'); el.textContent = message;el.dataset.kind = kind;
}
function updateRouteStatus() {
  const pill = $('route-mode-pill');
  const routed = current.geometryMode === 'ROUTED' && !!current.route;
  pill.textContent = routed ? 'ROTA VIÁRIA ✓' : 'TRAÇADO MANUAL';
  pill.classList.toggle('is-routed', routed);
  if (routed) setRouteStatus('✓ Rota de pedestres calculada pelas ruas. A distância exibida usa o trajeto viário salvo neste dispositivo.', 'success');
  else setRouteStatus('Distância aproximada em linha reta entre os pontos. Para seguir as ruas, clique em “Calcular rota pelas ruas”.');
}

function field<T extends HTMLInputElement | HTMLSelectElement>(name: string) { return $<T>(name); }
function touch() { current.updatedAt = now(); persist(STORAGE_DRAFT, current); render(); }
function replaceCurrent(plan: PatrolPlan) {
  current = parsePlan(plan); persist(STORAGE_DRAFT, current);
  updateRouteStatus();
  field<HTMLInputElement>('plan-title').value = current.title;
  field<HTMLSelectElement>('plan-mode').value = current.mode;
  field<HTMLInputElement>('plan-speed').value = String(current.speedKmh);
  updateSpeed(); render(); fitRoute();
}
function addPoint(lngLat: LngLat, label = '') {
  const p = cleanPoint(lngLat);
  if (current.waypoints.length >= MAX_POINTS) { toast('Limite de 250 pontos por percurso.'); return; }
  if (current.waypoints.length) {
    const previous = current.waypoints[current.waypoints.length - 1];
    if (segmentMeters(previous, p) < 2) { toast('Selecione um ponto um pouco mais distante.'); return; }
    if (totalMeters(current.waypoints) + segmentMeters(previous, p) > MAX_DISTANCE_METERS) {
      toast('O limite de 100 km por plano foi atingido.'); return;
    }
  }
  invalidateRoute(current);
  current.waypoints.push(p);current.waypointLabels.push(label.trim().slice(0,140));
  updateRouteStatus();touch();
}
function routeFeature() {
  return { type: 'FeatureCollection' as const, features: current.waypoints.length >= 2 ? [{
    type: 'Feature' as const, properties: {}, geometry: {
      type: 'LineString' as const, coordinates: routePoints(current).map(p => [...p])
    }
  }] : [] };
}
function pointsFeature() {
  return { type: 'FeatureCollection' as const, features: current.waypoints.map((p, i) => ({
    type: 'Feature' as const, properties: { role: i === 0 ? 'start' : i === current.waypoints.length - 1 ? 'end' : 'via' },
    geometry: { type: 'Point' as const, coordinates: [...p] }
  })) };
}
function updateMap() {
  if (!map || !mapReady) return;
  (map.getSource('patrol-line') as GeoJSONSource | undefined)?.setData(routeFeature());
  (map.getSource('patrol-points') as GeoJSONSource | undefined)?.setData(pointsFeature());
}
function fitRoute() {
  if (!map || !mapReady) return;
  const points = routePoints(current);
  if (!points.length) return;
  if (points.length === 1) { map.flyTo({ center: points[0], zoom: 15 }); return; }
  const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
  for (const p of points) bounds.extend(p);
  map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 500 });
}
function renderSaved() {
  const container = $<HTMLDivElement>('saved-plans');container.replaceChildren();
  if (!saved.length) {
    const p = document.createElement('p');p.className='patrol-empty';p.textContent='Nenhuma patrulha salva neste navegador.';
    container.append(p);return;
  }
  for (const plan of saved) {
    const block = document.createElement('div');block.className = 'patrol-saved-item';
    const title = document.createElement('div');title.className='patrol-saved-title';title.textContent=plan.title;
    const stats = document.createElement('div');stats.className='patrol-saved-meta';
    stats.textContent=`${metersLabel(effectiveMeters(plan))} · ${durationLabel(estimateSeconds(effectiveMeters(plan),plan.speedKmh))} · ${plan.waypoints.length} paradas · ${plan.geometryMode === 'ROUTED'?'pelas ruas':'manual'}`;
    const actions = document.createElement('div');actions.className='patrol-saved-buttons';
    const load = document.createElement('button');load.type='button';load.textContent='Abrir';
    load.onclick=()=>{ if(current.waypoints.length && !confirm('Abrir esta patrulha? O rascunho atual será substituído.'))return;replaceCurrent(plan);toast('Plano carregado do dispositivo.');};
    const del = document.createElement('button');del.type='button';del.textContent='Apagar';
    del.onclick=()=>{ if(!confirm(`Apagar o plano "${plan.title}" somente deste dispositivo?`))return;
      saved=saved.filter(v=>v.id!==plan.id);if(persist(STORAGE_SAVED,saved)){renderSaved();toast('Plano removido do armazenamento local.');}};
    actions.append(load,del);block.append(title,stats,actions);container.append(block);
  }
}
function render() {
  const meters = effectiveMeters(current), seconds = estimateSeconds(meters,current.speedKmh);
  $('distance-kind').textContent=current.geometryMode==='ROUTED'?'DISTÂNCIA PELAS RUAS':'DISTÂNCIA MANUAL (ESTIMADA)';
  $('distance').textContent=metersLabel(meters);
  $('duration').textContent=durationLabel(seconds);
  $('waypoints-count').textContent=String(current.waypoints.length);
  $('pace').textContent=paceLabel(current.speedKmh);
  const list=$<HTMLOListElement>('waypoints');list.replaceChildren();
  if (!current.waypoints.length){const li=document.createElement('li');li.className='patrol-empty';li.textContent='Adicione o início tocando no mapa.';list.append(li);}
  else for(const [i,p] of current.waypoints.entries()){
    const li=document.createElement('li');const order=document.createElement('span');order.className='point-number';order.textContent=i===0?'INÍCIO':i===current.waypoints.length-1?'FIM':`P${i+1}`;
    const txt=document.createElement('span');txt.className='point-xy';
    const label=current.waypointLabels[i];
    if(label){const name=document.createElement('span');name.className='point-label';name.textContent=label;txt.append(name);}
    const xy=document.createElement('span');xy.className='point-coordinate';xy.textContent=`${p[1].toFixed(5)}, ${p[0].toFixed(5)}`;txt.append(xy);
    const del=document.createElement('button');del.type='button';del.textContent='×';del.title=`Excluir ponto ${i+1}`;del.setAttribute('aria-label',`Excluir ponto ${i+1}`);
    del.onclick=()=>{current.waypoints.splice(i,1);current.waypointLabels.splice(i,1);invalidateRoute(current);updateRouteStatus();touch();};li.append(order,txt,del);list.append(li);
  }
  $('undo').toggleAttribute('disabled', !current.waypoints.length);
  $('reverse').toggleAttribute('disabled', current.waypoints.length<2);
  $('close-loop').toggleAttribute('disabled', current.waypoints.length<3);
  $('fit-route').toggleAttribute('disabled', !current.waypoints.length);
  $('route-compute').toggleAttribute('disabled', routeBusy || current.waypoints.length < 2 || current.waypoints.length > MAX_ROUTE_STOPS);
  $('route-compute').textContent=routeBusy?'↻ Calculando percurso...':'↝ Calcular rota pelas ruas';
  const missing=current.waypoints.length<2;
  for(const id of ['export-json','export-gpx','share-plan','open-google']) $(id).toggleAttribute('disabled',missing);
  updateMap();renderSaved();
}
function updateSpeed(){ $('speed-number').textContent=format(current.speedKmh,1); }
function download(name:string, content:string, type:string) {
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function filename(plan:PatrolPlan,ext:string){const base=plan.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w -]/g,'').trim().replace(/\s+/g,'-').slice(0,40)||'patrulha';return `${base}.${ext}`;}
function createExportFile() {
  if(current.waypoints.length<2)throw Error('Adicione ao menos dois pontos.');
  return new File([JSON.stringify(parsePlan(current),null,2)], filename(current,'arpatrol.json'), {type:'application/json'});
}
/** Address lookups happen on a deliberate Search click, not on each keystroke. */
function renderAddressResults(rows: {label:string,coordinates:LngLat}[]) {
  const el=$<HTMLUListElement>('address-results'); el.replaceChildren();el.hidden=!rows.length;
  for(const result of rows){
    const li=document.createElement('li');const button=document.createElement('button');button.type='button';
    button.textContent='＋ '+result.label;
    const detail=document.createElement('small');detail.textContent='Adicionar '+(current.waypoints.length?'parada/destino':'origem')+' ao percurso';button.append(detail);
    button.onclick=()=>{
      if(current.waypoints.length>=MAX_POINTS){toast('Limite de pontos atingido.');return;}
      addPoint(result.coordinates,result.label);map?.flyTo({center:result.coordinates,zoom:15});
      el.replaceChildren();el.hidden=true;
      $<HTMLInputElement>('address-query').value='';
      $('address-status').textContent='Endereço adicionado. Inclua outros pontos e calcule a rota pelas ruas.';
    };li.append(button);el.append(li);
  }
}
async function searchAddress(event: Event) {
  event.preventDefault();
  if(addressBusy)return;
  const text=$<HTMLInputElement>('address-query').value.trim();
  if(text.length<3||text.length>140){toast('Digite pelo menos 3 caracteres de endereço.');return;}
  if(Date.now()-addressLastSearchedAt<2000){toast('Aguarde um instante antes de outra pesquisa.');return;}
  addressLastSearchedAt=Date.now();addressBusy=true;
  const button=$<HTMLButtonElement>('address-submit');button.disabled=true;
  const seq=++addressRequestSeq;
  $('address-status').textContent='Procurando endereços...';renderAddressResults([]);
  const url=new URL(ORS_GEOCODE,location.href);url.searchParams.set('q',text);
  if(map){const center=map.getCenter();url.searchParams.set('lon',String(center.lng));url.searchParams.set('lat',String(center.lat));}
  try {
    const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const data=await res.json();
    if(!res.ok)throw Error(data?.error||'Serviço de endereços indisponível.');
    if(seq!==addressRequestSeq)return;
    const results: {label:string,coordinates:LngLat}[]=Array.isArray(data.results) ?
      data.results.slice(0,5).filter((r:unknown)=>{
        if(!r||typeof r!=='object')return false;
        const v=r as {label?:unknown,coordinates?:unknown};
        return typeof v.label==='string'&&v.label.length>0&&v.label.length<=140&&pointIsValid(v.coordinates);
      }).map((v:{label:string,coordinates:LngLat})=>v) : [];
    renderAddressResults(results);
    $('address-status').textContent=results.length?`${results.length} resultado(s) encontrado(s). Escolha o endereço desejado.`:'Nenhum endereço encontrado. Tente incluir cidade ou bairro.';
  }catch(e){$('address-status').textContent=e instanceof Error?e.message:'Não foi possível pesquisar. Você ainda pode tocar no mapa.';}
  finally{addressBusy=false;button.disabled=false;}
}
async function calculateStreetRoute() {
  if(routeBusy||current.waypoints.length<2)return;
  if(current.waypoints.length>MAX_ROUTE_STOPS){toast(`Para calcular pelas ruas, use no máximo ${MAX_ROUTE_STOPS} pontos.`);return;}
  routeBusy=true;render();setRouteStatus('Consultando a rede de caminhos para pedestres...');
  const signature=JSON.stringify(current.waypoints);
  try{
    const res=await fetch(new URL(ORS_ROUTE,location.href),{
      method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({coordinates:current.waypoints}),cache:'no-store',signal:AbortSignal.timeout(22000)
    });
    const data=await res.json();
    if(!res.ok)throw Error(data?.error||'Não foi possível calcular o percurso.');
    if(signature!==JSON.stringify(current.waypoints))throw Error('Pontos alterados durante o cálculo. Calcule novamente.');
    const candidate=parsePlan({...current,geometryMode:'ROUTED',route:data,updatedAt:now()});
    current=candidate;persist(STORAGE_DRAFT,current);updateRouteStatus();render();fitRoute();
    toast('✓ Rota calculada pelas ruas e salva no rascunho deste dispositivo.');
  }catch(e){setRouteStatus(e instanceof Error?e.message:'Não foi possível calcular a rota.', 'error');}
  finally{routeBusy=false;render();}
}
function initMap(){
  try{
    map=new maplibregl.Map({container:'patrol-map',style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center:[-43.206,-22.907],zoom:11,attributionControl:true});
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    map.on('load',()=>{
      if(!map)return;
      map.addSource('patrol-line',{type:'geojson',data:routeFeature()});
      map.addLayer({id:'patrol-line-halo',type:'line',source:'patrol-line',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0c2d20','line-width':10,'line-opacity':.82}});
      map.addLayer({id:'patrol-line-main',type:'line',source:'patrol-line',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#7be7a9','line-width':5,'line-opacity':.97}});
      map.addSource('patrol-points',{type:'geojson',data:pointsFeature()});
      map.addLayer({id:'patrol-point-ring',type:'circle',source:'patrol-points',paint:{'circle-radius':10,'circle-color':'#102d1f','circle-stroke-color':'#d7ffdc','circle-stroke-width':2}});
      map.addLayer({id:'patrol-point-fill',type:'circle',source:'patrol-points',paint:{'circle-radius':6,'circle-color':['match',['get','role'],'start','#76f5a4','end','#ff8f86','#d4ffde']}});
      mapReady=true;updateMap();fitRoute();
    });
    map.on('click',(e: { lngLat: { lng: number; lat: number } }) => addPoint([e.lngLat.lng,e.lngLat.lat]));
  }catch{const fallback=$('map-fallback');fallback.hidden=false;}
}
function initEvents() {
  field<HTMLInputElement>('plan-title').value=current.title;
  field<HTMLSelectElement>('plan-mode').value=current.mode;
  field<HTMLInputElement>('plan-speed').value=String(current.speedKmh);
  field<HTMLInputElement>('plan-title').addEventListener('change',e=>{const title=(e.target as HTMLInputElement).value.trim().slice(0,60)||'Minha patrulha';
    current.title=title;(e.target as HTMLInputElement).value=title;touch();});
  field<HTMLSelectElement>('plan-mode').addEventListener('change',e=>{current.mode=(e.target as HTMLSelectElement).value==='RUN'?'RUN':'WALK';
    current.speedKmh=current.mode==='RUN'?7:4.5;field<HTMLInputElement>('plan-speed').value=String(current.speedKmh);updateSpeed();touch();});
  field<HTMLInputElement>('plan-speed').addEventListener('input',e=>{current.speedKmh=Number((e.target as HTMLInputElement).value);updateSpeed();touch();});
  $('undo').onclick=()=>{current.waypoints.pop();current.waypointLabels.pop();invalidateRoute(current);updateRouteStatus();touch();};
  $('reverse').onclick=()=>{current.waypoints.reverse();current.waypointLabels.reverse();invalidateRoute(current);updateRouteStatus();touch();};
  $('close-loop').onclick=()=>{if(current.waypoints.length<3)return;
    const start=current.waypoints[0],last=current.waypoints[current.waypoints.length-1];
    if(segmentMeters(start,last)<2){toast('O circuito já termina no ponto inicial.');return;}
    addPoint(start);
  };
  $('fit-route').onclick=()=>fitRoute();
  $<HTMLFormElement>('address-form').addEventListener('submit',e=>void searchAddress(e));
  $('route-compute').addEventListener('click',()=>void calculateStreetRoute());
  $('clear-route').onclick=()=>{if(!current.waypoints.length)return;if(!confirm('Limpar todos os pontos deste rascunho?'))return;
    current.waypoints=[];current.waypointLabels=[];invalidateRoute(current);updateRouteStatus();touch();};
  $('locate').onclick=()=>{if(geolocationBusy)return;
    if(!navigator.geolocation){toast('Geolocalização indisponível neste navegador.');return;}
    geolocationBusy=true;$('locate').setAttribute('disabled','');
    navigator.geolocation.getCurrentPosition(position=>{
      geolocationBusy=false;$('locate').removeAttribute('disabled');
      const pt:LngLat=[position.coords.longitude,position.coords.latitude];
      if(current.waypoints.length===0)addPoint(pt);
      else toast('Localização encontrada. Toque no mapa para adicioná-la ao percurso.');
      map?.flyTo({center:pt,zoom:16});
    },()=>{geolocationBusy=false;$('locate').removeAttribute('disabled');toast('Não foi possível acessar sua localização. Verifique a permissão de GPS do navegador.');},
    {enableHighAccuracy:true,timeout:12000,maximumAge:15000});
  };
  $('save-plan').onclick=()=>{
    const newPlan=parsePlan(current);
    const copy=[newPlan,...saved.filter(s=>s.id!==newPlan.id)].slice(0,MAX_LOCAL_PLANS);
    if(persist(STORAGE_SAVED,copy)){saved=copy;renderSaved();toast('Patrulha salva somente neste dispositivo.');}
  };
  $('new-plan').onclick=()=>{if(current.waypoints.length&&!confirm('Criar uma nova patrulha? O rascunho atual será substituído.'))return;replaceCurrent(blankPlan());};
  $('export-json').onclick=()=>{if(current.waypoints.length<2)return;const file=createExportFile();
    download(file.name,JSON.stringify(parsePlan(current),null,2),'application/json');toast('Arquivo JSON criado para guardar ou transferir.');};
  $('export-gpx').onclick=()=>{if(current.waypoints.length<2)return;download(filename(current,'gpx'),toGPX(current),'application/gpx+xml');toast('Trilha GPX exportada.');};
  $('share-plan').onclick=async()=>{
    const file=createExportFile();const obj={files:[file],title:'Plano de patrulha - Apocalypse Run',text:'Arquivo local de planejamento de patrulha.'};
    try{
      if(typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){await navigator.share(obj);return;}
      download(file.name,await file.text(),'application/json');toast('Compartilhamento de arquivos indisponível. JSON baixado para você enviar manualmente.');
    }catch(e){if((e as DOMException).name!=='AbortError')toast('Não foi possível compartilhar. Use Exportar JSON.');}
  };
  $('open-google').onclick=()=>{
    try{const {url,reduced}=googleMapsLink(current.waypoints);
      if(reduced&&!confirm('No navegador móvel, o Google Maps aceita até três paradas intermediárias. Abriremos uma rota simplificada. Continuar?'))return;
      window.open(url,'_blank','noopener,noreferrer');
    }catch(e){toast((e as Error).message);}
  };
  field<HTMLInputElement>('import-plan').addEventListener('change',async e=>{
    const input=e.target as HTMLInputElement;const f=input.files?.[0];input.value='';if(!f)return;
    if(f.size>150000){toast('Arquivo muito grande. Limite de 150 KB.');return;}
    try{const loaded=parsePlan(JSON.parse(await f.text()));
      if(current.waypoints.length&&!confirm('Importar este arquivo? O rascunho atual será substituído.'))return;
      replaceCurrent(loaded);toast('Plano importado localmente. Salve para incluí-lo no arquivo deste dispositivo.');
    }catch(e){toast(e instanceof Error?e.message:'Arquivo inválido.');}
  });
}
updateSpeed();initEvents();initMap();updateRouteStatus();render();
