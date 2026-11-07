/**
 * Apocalypse Run | National geocoding v2.2: manual waypoint positioning.
 * Independent enhancement; no changes needed to patrol-core, no remote storage.
 */
import maplibregl, {type Map as MapLibreMap, type Marker} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './patrol-adjuster.css';
import {parsePlan, cleanPoint, pointIsValid, type LngLat} from './patrol-core';

const DRAFT='ar.patrol.draft.v1';
const points=document.getElementById('waypoints');
const canMap=Boolean(points&&document.getElementById('patrol-map'));
if(canMap){
  const dialog=document.createElement('dialog'); dialog.id='ar-adjust-dialog'; dialog.setAttribute('aria-labelledby','ar-adjust-title');
  const panel=document.createElement('section'); panel.className='ar-adjust-panel';
  const header=document.createElement('div');header.className='ar-adjust-header';
  const title=document.createElement('h2');title.id='ar-adjust-title';title.textContent='AJUSTAR PONTO NO MAPA';
  const close=document.createElement('button');close.className='ar-adjust-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Fechar ajuste');
  header.append(title,close);
  const description=document.createElement('p');description.className='ar-adjust-description';
  description.textContent='Arraste o marcador verde até a entrada correta ou toque no mapa. O local será marcado como posição manual, não como número confirmado por uma base de endereços.';
  const mapContainer=document.createElement('div');mapContainer.id='ar-adjust-map';mapContainer.setAttribute('aria-label','Mapa para posicionar manualmente o ponto da patrulha');
  const coords=document.createElement('p');coords.className='ar-adjust-coords';coords.setAttribute('aria-live','polite');
  const actions=document.createElement('div');actions.className='ar-adjust-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.className='ar-adjust-cancel';
  const save=document.createElement('button');save.type='button';save.textContent='✓ Confirmar posição';save.className='ar-adjust-save';
  actions.append(cancel,save); panel.append(header,description,mapContainer,coords,actions);dialog.append(panel);document.body.append(dialog);
  const attribution=document.createElement('span');attribution.className='ar-geocode-attribution';
  const link=document.createElement('a');link.href='https://www.geoapify.com/';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Powered by Geoapify';
  attribution.append('Pesquisa alternativa: ',link);
  document.querySelector('footer.patrol-footer')?.append(attribution);
  let map:MapLibreMap|null=null;let marker:Marker|null=null;let currentIndex=-1;
  let point:LngLat|null=null;
  let baseTitle='';
  function readDraft(){
    const raw=localStorage.getItem(DRAFT);if(!raw)throw Error('Nenhum rascunho local disponível.');
    return parsePlan(JSON.parse(raw));
  }
  function updateCoordinates(){
    if(!point)return;
    coords.textContent=`Latitude ${point[1].toFixed(6)} · Longitude ${point[0].toFixed(6)}. Aproximado até você confirmar.`;
  }
  function setPoint(lon:number,lat:number){
    if(!pointIsValid([lon,lat]))return;
    point=cleanPoint([lon,lat]);marker?.setLngLat(point);updateCoordinates();
  }
  function cleanup(){
    marker?.remove();marker=null;
    map?.remove();map=null;
    point=null;currentIndex=-1;
    if(dialog.open)dialog.close();
  }
  function open(index:number){
    try{
      const draft=readDraft();const existing=draft.waypoints[index];
      if(!existing||!pointIsValid(existing))throw Error('Ponto inválido. Recarregue a página.');
      cleanup();currentIndex=index;point=cleanPoint(existing);
      baseTitle=(draft.waypointLabels[index]||`Ponto ${index+1}`).replace(/^📍 Ponto ajustado manualmente ·\s*/,'');
      description.textContent=`Ponto ${index+1}: ${baseTitle}. Arraste o marcador até a entrada correta ou toque no mapa. A posição será identificada como ajuste manual.`;
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
      updateCoordinates();
      map=new maplibregl.Map({container:mapContainer,style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',center:point,zoom:17,attributionControl:true});
      marker=new maplibregl.Marker({color:'#a6ffbd',draggable:true}).setLngLat(point).addTo(map);
      marker.on('dragend',()=>{const p=marker?.getLngLat();if(p)setPoint(p.lng,p.lat);});
      map.on('click',(e:{lngLat:{lng:number;lat:number}})=>setPoint(e.lngLat.lng,e.lngLat.lat));
      map.on('load',()=>map?.resize());
    }catch(e){cleanup();alert(e instanceof Error?e.message:'Não foi possível abrir o mapa de ajuste.');}
  }
  function confirm(){
    try{
      if(currentIndex<0||!point)throw Error('Selecione uma posição antes de salvar.');
      const p=readDraft();if(currentIndex>=p.waypoints.length)throw Error('O ponto foi alterado por outra aba. Recarregue a página.');
      p.waypoints[currentIndex]=cleanPoint(point);
      p.waypointLabels[currentIndex]=('📍 Ponto ajustado manualmente · '+baseTitle).slice(0,140);
      p.geometryMode='MANUAL';delete p.route;
      p.updatedAt=new Date().toISOString();
      const safe=parsePlan(p);
      localStorage.setItem(DRAFT,JSON.stringify(safe));
      cleanup();window.location.reload();
    }catch(e){alert(e instanceof Error?e.message:'Não foi possível gravar a posição no dispositivo.');}
  }
  close.addEventListener('click',cleanup);cancel.addEventListener('click',cleanup);
  save.addEventListener('click',confirm);
  dialog.addEventListener('cancel',e=>{e.preventDefault();cleanup();});
  function addAdjustButtons(){
    if(!points)return;
    const list=Array.from(points.children).filter(li=>li.querySelector('.point-xy'));
    list.forEach((li,index)=>{
      if(li.querySelector('.ar-adjust-point-button'))return;
      const b=document.createElement('button');b.type='button';b.className='ar-adjust-point-button';
      b.textContent='⌖ Ajustar';b.title='Arrastar ponto até a posição correta no mapa';
      b.setAttribute('aria-label',`Ajustar manualmente a posição do ponto ${index+1}`);
      b.addEventListener('click',()=>open(index));li.append(b);
    });
  }
  const observer=new MutationObserver(addAdjustButtons);
  observer.observe(points!,{childList:true});
  addAdjustButtons();
}
