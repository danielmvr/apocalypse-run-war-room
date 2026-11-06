import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './patrulha.css';
import { blankPlan, cleanPoint, estimateSeconds, googleMapsLink, MAX_DISTANCE_METERS, MAX_LOCAL_PLANS,
  MAX_POINTS, parsePlan, segmentMeters, toGPX, totalMeters, type PatrolPlan, type LngLat } from './patrol-core';

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
function field<T extends HTMLInputElement | HTMLSelectElement>(name: string) { return $<T>(name); }
function touch() { current.updatedAt = now(); persist(STORAGE_DRAFT, current); render(); }
function replaceCurrent(plan: PatrolPlan) {
  current = parsePlan(plan); persist(STORAGE_DRAFT, current);
  field<HTMLInputElement>('plan-title').value = current.title;
  field<HTMLSelectElement>('plan-mode').value = current.mode;
  field<HTMLInputElement>('plan-speed').value = String(current.speedKmh);
  updateSpeed(); render(); fitRoute();
}
function addPoint(lngLat: LngLat) {
  const p = cleanPoint(lngLat);
  if (current.waypoints.length >= MAX_POINTS) { toast('Limite de 250 pontos por percurso.'); return; }
  if (current.waypoints.length) {
    const previous = current.waypoints[current.waypoints.length - 1];
    if (segmentMeters(previous, p) < 2) { toast('Selecione um ponto um pouco mais distante.'); return; }
    if (totalMeters(current.waypoints) + segmentMeters(previous, p) > MAX_DISTANCE_METERS) {
      toast('O limite de 100 km por plano foi atingido.'); return;
    }
  }
  current.waypoints.push(p); touch();
}
function routeFeature() {
  return { type: 'FeatureCollection' as const, features: current.waypoints.length >= 2 ? [{
    type: 'Feature' as const, properties: {}, geometry: {
      type: 'LineString' as const, coordinates: current.waypoints.map(p => [...p])
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
  const points = current.waypoints;
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
    stats.textContent=`${metersLabel(totalMeters(plan.waypoints))} · ${durationLabel(estimateSeconds(totalMeters(plan.waypoints),plan.speedKmh))} · ${plan.waypoints.length} pontos`;
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
  const meters = totalMeters(current.waypoints), seconds = estimateSeconds(meters,current.speedKmh);
  $('distance').textContent=metersLabel(meters);
  $('duration').textContent=durationLabel(seconds);
  $('waypoints-count').textContent=String(current.waypoints.length);
  $('pace').textContent=paceLabel(current.speedKmh);
  const list=$<HTMLOListElement>('waypoints');list.replaceChildren();
  if (!current.waypoints.length){const li=document.createElement('li');li.className='patrol-empty';li.textContent='Adicione o início tocando no mapa.';list.append(li);}
  else for(const [i,p] of current.waypoints.entries()){
    const li=document.createElement('li');const order=document.createElement('span');order.className='point-number';order.textContent=i===0?'INÍCIO':i===current.waypoints.length-1?'FIM':`P${i+1}`;
    const txt=document.createElement('span');txt.className='point-xy';txt.textContent=`${p[1].toFixed(5)}, ${p[0].toFixed(5)}`;
    const del=document.createElement('button');del.type='button';del.textContent='×';del.title=`Excluir ponto ${i+1}`;del.setAttribute('aria-label',`Excluir ponto ${i+1}`);
    del.onclick=()=>{current.waypoints.splice(i,1);touch();};li.append(order,txt,del);list.append(li);
  }
  $('undo').toggleAttribute('disabled', !current.waypoints.length);
  $('reverse').toggleAttribute('disabled', current.waypoints.length<2);
  $('close-loop').toggleAttribute('disabled', current.waypoints.length<3);
  $('fit-route').toggleAttribute('disabled', !current.waypoints.length);
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
  $('undo').onclick=()=>{current.waypoints.pop();touch();};
  $('reverse').onclick=()=>{current.waypoints.reverse();touch();};
  $('close-loop').onclick=()=>{if(current.waypoints.length<3)return;
    const start=current.waypoints[0],last=current.waypoints[current.waypoints.length-1];
    if(segmentMeters(start,last)<2){toast('O circuito já termina no ponto inicial.');return;}
    addPoint(start);
  };
  $('fit-route').onclick=()=>fitRoute();
  $('clear-route').onclick=()=>{if(!current.waypoints.length)return;if(!confirm('Limpar todos os pontos deste rascunho?'))return;
    current.waypoints=[];touch();};
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
updateSpeed();initEvents();initMap();render();
