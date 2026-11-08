/**
 * Apocalypse Run | Planejador v2.3: corrigir um trecho com um ponto de passagem.
 * Browser-only, no server storage, no automatic API requests. Clicking "Calcular
 * rota pelas ruas" still calls the existing foot-walking Cloudflare Function.
 */
import maplibregl, { type Map as MapLibreMap, type Marker, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './patrol-route-editor.css';
import { parsePlan, type PatrolPlan, type LngLat } from './patrol-core';
import { insertWalkingViaPoint, midpoint, MAX_ROUTING_WAYPOINTS } from './patrol-route-editor-core';

const DRAFT_KEY = 'ar.patrol.draft.v1';
const computeButton = document.getElementById('route-compute');
const mapParent = document.getElementById('patrol-map');
const ui = document.querySelector('.patrol-map-tools');

if (computeButton && mapParent && ui) {
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.id = 'ar-route-edit-button';
  editButton.className = 'patrol-btn minor';
  editButton.textContent = '✎ Corrigir trecho';
  editButton.title = 'Insira um ponto de passagem entre duas paradas e recalcule a rota a pé';
  ui.insertBefore(editButton, computeButton);

  const dialog = document.createElement('dialog');
  dialog.id = 'ar-route-edit-dialog';
  dialog.setAttribute('aria-labelledby', 'ar-route-edit-title');
  const panel = document.createElement('section');
  panel.className = 'ar-route-edit-panel';
  const header = document.createElement('div');
  header.className = 'ar-route-edit-head';
  const title = document.createElement('h2');
  title.id = 'ar-route-edit-title';
  title.textContent = 'CORRIGIR TRECHO DA PATRULHA';
  const close = document.createElement('button');
  close.className = 'ar-route-edit-close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Fechar correção de trecho');
  header.append(title, close);

  const explain = document.createElement('p');
  explain.className = 'ar-route-edit-explain';
  explain.textContent = 'Escolha o trecho e arraste o marcador laranja até a rua, caminho ou travessia por onde quer passar. O desvio será uma parada intermediária obrigatória na próxima rota a pé.';
  const label = document.createElement('label');
  label.htmlFor = 'ar-route-edit-segment';
  label.className = 'ar-route-edit-label';
  label.textContent = 'Trecho que deseja corrigir';
  const selector = document.createElement('select');
  selector.id = 'ar-route-edit-segment';
  const mapBox = document.createElement('div');
  mapBox.id = 'ar-route-edit-map';
  mapBox.setAttribute('aria-label', 'Mapa para indicar por onde a patrulha deve passar');
  const coordinates = document.createElement('p');
  coordinates.className = 'ar-route-edit-coords';
  coordinates.setAttribute('aria-live','polite');
  const note = document.createElement('p');
  note.className = 'ar-route-edit-note';
  note.textContent = 'Nenhum cálculo será feito agora. Após confirmar, clique em “Calcular rota pelas ruas” para redesenhar o caminho de pedestres e atualizar distância e tempo.';
  const actions = document.createElement('div');
  actions.className = 'ar-route-edit-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancelar';
  cancel.className = 'ar-route-edit-cancel';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.textContent = '✓ Incluir passagem';
  confirm.className = 'ar-route-edit-confirm';
  actions.append(cancel, confirm);
  panel.append(header, explain, label, selector, mapBox, coordinates, note, actions);
  dialog.append(panel);
  document.body.append(dialog);

  let map: MapLibreMap | null = null;
  let via: Marker | null = null;
  let first: Marker | null = null;
  let last: Marker | null = null;
  let selected: LngLat | null = null;
  let initialContent: string | null = null;
  let plan: PatrolPlan | null = null;

  function readDraft(): { data: PatrolPlan; serialized: string } {
    const serialized = localStorage.getItem(DRAFT_KEY);
    if (!serialized) throw new Error('Crie pelo menos duas paradas antes de corrigir um trecho.');
    return { data: parsePlan(JSON.parse(serialized)), serialized };
  }
  function segmentName(index: number, p: PatrolPlan): string {
    const name = (i: number) => {
      const role = i === 0 ? 'INÍCIO' : i === p.waypoints.length - 1 ? 'FIM' : `P${i + 1}`;
      const description = (p.waypointLabels[i] || '').replace(/^[✓⚠≈]\s*/u, '').slice(0, 42);
      return description ? `${role} (${description})` : role;
    };
    return `${name(index)} → ${name(index + 1)}`;
  }
  function refreshCoords() {
    if (!selected || !plan) return;
    coordinates.textContent = `Passagem escolhida: ${selected[1].toFixed(6)}, ${selected[0].toFixed(6)} · trecho ${Number(selector.value) + 1} de ${plan.waypoints.length - 1}`;
  }
  function setVia(lng: number, lat: number) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return;
    selected = [lng, lat];
    via?.setLngLat(selected);
    refreshCoords();
    updatePreview();
  }
  function lines() {
    if (!plan || !selected) return { type: 'FeatureCollection' as const, features: [] };
    const i = Number(selector.value);
    return { type: 'FeatureCollection' as const, features: [{
      type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [plan.waypoints[i], selected, plan.waypoints[i + 1]] }, properties: {}
    }] };
  }
  function updatePreview() {
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource('ar-edit-preview') as GeoJSONSource | undefined)?.setData(lines());
  }
  function switchSegment() {
    if (!plan || !map) return;
    const i = Number(selector.value);
    if (!Number.isInteger(i) || i < 0 || i >= plan.waypoints.length - 1) return;
    first?.remove();last?.remove();
    first = new maplibregl.Marker({ color: '#7ce6a5' }).setLngLat(plan.waypoints[i]).addTo(map);
    last = new maplibregl.Marker({ color: '#f39990' }).setLngLat(plan.waypoints[i+1]).addTo(map);
    const mid = midpoint(plan.waypoints[i],plan.waypoints[i+1]);
    setVia(mid[0],mid[1]);
    const bounds = new maplibregl.LngLatBounds(plan.waypoints[i],plan.waypoints[i]);
    bounds.extend(plan.waypoints[i+1]);
    map.fitBounds(bounds, { padding: 65, maxZoom: 17, duration: 250 });
  }
  function cleanup() {
    via?.remove();via=null;
    first?.remove();first=null;
    last?.remove();last=null;
    map?.remove();map=null;
    plan=null;selected=null;initialContent=null;
    if (dialog.open) dialog.close();
  }
  function showEditor() {
    try {
      cleanup();
      const read = readDraft();
      const fresh = read.data;
      if (fresh.waypoints.length < 2) throw new Error('Marque pelo menos dois pontos para corrigir um trecho.');
      if (fresh.waypoints.length >= MAX_ROUTING_WAYPOINTS) {
        throw new Error('O roteador permite no máximo 20 pontos. Remova algum antes de incluir um desvio.');
      }
      if (typeof dialog.showModal !== 'function') throw new Error('Seu navegador não oferece suporte à janela de ajuste.');
      plan=fresh;initialContent=read.serialized;
      selector.replaceChildren();
      for (let i=0;i<fresh.waypoints.length-1;i++) {
        const option=document.createElement('option');option.value=String(i);option.textContent=segmentName(i,fresh);selector.append(option);
      }
      selector.value='0';
      dialog.showModal();
      map = new maplibregl.Map({
        container: mapBox,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: fresh.waypoints[0],zoom:14,attributionControl:true,
      });
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      map.on('load',()=>{
        if (!map || !plan) return;
        const base: LngLat[] = plan.geometryMode === 'ROUTED' && plan.route ? plan.route.coordinates : plan.waypoints;
        map.addSource('ar-edit-original',{ type:'geojson',data:{
          type:'Feature',geometry:{type:'LineString',coordinates:base},properties:{}
        }});
        map.addLayer({id:'ar-edit-original-line',type:'line',source:'ar-edit-original',layout:{'line-cap':'round','line-join':'round'},
          paint:{'line-color':'#7ce6a5','line-opacity':0.85,'line-width':5}});
        map.addSource('ar-edit-preview',{type:'geojson',data:lines()});
        map.addLayer({id:'ar-edit-preview-line',type:'line',source:'ar-edit-preview',layout:{'line-cap':'round','line-join':'round'},
          paint:{'line-color':'#ffbd70','line-opacity':0.95,'line-width':4,'line-dasharray':[2,1.5]}});
        map.resize();updatePreview();
      });
      via = new maplibregl.Marker({color:'#ffb65b',draggable:true}).setLngLat(fresh.waypoints[0]).addTo(map);
      via.on('dragend',()=>{const loc=via?.getLngLat();if(loc)setVia(loc.lng,loc.lat);});
      map.on('click',(event:{lngLat:{lng:number;lat:number}})=>setVia(event.lngLat.lng,event.lngLat.lat));
      switchSegment();
      // Delay only fixes sizing after dialog becomes visible; it never contacts APIs.
      requestAnimationFrame(()=>map?.resize());
    } catch (error) {
      cleanup();
      alert(error instanceof Error ? error.message : 'Não foi possível abrir o editor de trechos.');
    }
  }
  function save() {
    try {
      if (!plan || !initialContent || !selected) throw new Error('Selecione o desvio antes de confirmar.');
      if (localStorage.getItem(DRAFT_KEY)!==initialContent) throw new Error('O plano foi alterado em outra aba. Recarregue o Planejador antes de corrigir o trecho.');
      const candidate=insertWalkingViaPoint(plan,Number(selector.value),selected,new Date().toISOString());
      const checked=parsePlan(candidate);
      localStorage.setItem(DRAFT_KEY,JSON.stringify(checked));
      cleanup();
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar o desvio.');
    }
  }
  editButton.addEventListener('click',showEditor);
  selector.addEventListener('change',switchSegment);
  confirm.addEventListener('click',save);
  close.addEventListener('click',cleanup);
  cancel.addEventListener('click',cleanup);
  dialog.addEventListener('cancel',(event)=>{event.preventDefault();cleanup();});
}
