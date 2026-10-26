/**
 * Apocalypse Run War Room | independent frontend enhancement pack.
 * Uses the public payload only. No credentials or private game RPCs.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker as MapLibreMarker } from 'maplibre-gl';
import { cellToBoundary, cellToLatLng, isValidCell } from 'h3-js';
import {
  Activity, Castle, Crosshair, FlaskConical, Landmark, MapPin,
  RadioTower, Shield, Skull, Tent, Warehouse, X,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './war-enhancements.css';

export type WarFaction = 'HUMAN' | 'ZOMBIE';
export type WarTerritory = {
  id: string;
  owner: WarFaction | null;
  control: number;
  contagion: number;
  structure: string;
};
export type WarEventRecord = {
  id: string;
  kind: string;
  actorType?: string;
  faction?: WarFaction;
  at: string;
  structure?: string;
};

type StructureDefinition = {
  label: string;
  location: string;
  icon: typeof MapPin;
};

const STRUCTURES: Record<string, StructureDefinition> = {
  RUINAS: { label: 'Ruínas', location: 'as ruínas', icon: Landmark },
  ABRIGO: { label: 'Abrigo', location: 'um abrigo', icon: Tent },
  RADIO: { label: 'Estação de rádio', location: 'uma estação de rádio', icon: RadioTower },
  LABORATORIO: { label: 'Laboratório', location: 'um laboratório', icon: FlaskConical },
  DEPOSITO: { label: 'Depósito', location: 'um depósito', icon: Warehouse },
  FORTALEZA: { label: 'Fortaleza', location: 'uma fortaleza', icon: Castle },
};

const SIDE = {
  HUMAN: { label: 'Resistência', className: 'human' },
  ZOMBIE: { label: 'Horda', className: 'zombie' },
  NEUTRAL: { label: 'Neutro / contestado', className: 'neutral' },
} as const;

function side(owner: WarFaction | null) {
  return owner === 'HUMAN' ? SIDE.HUMAN : owner === 'ZOMBIE' ? SIDE.ZOMBIE : SIDE.NEUTRAL;
}

function labelStructure(structure: string) {
  return STRUCTURES[structure]?.label ?? (structure.replaceAll('_', ' ') || 'Estrutura');
}

function markerNode(cell: WarTerritory, onSelect: (id: string) => void) {
  const definition = STRUCTURES[cell.structure];
  const Icon = definition?.icon ?? MapPin;
  // MapLibre owns the wrapper's absolute position and transform. The visual
  // tip ends at this wrapper's bottom center, without per-territory offsets.
  const marker = document.createElement('div');
  marker.className = 'ar-site-marker';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ar-site-pin ar-site-pin--${side(cell.owner).className}`;
  button.setAttribute('aria-label', `${labelStructure(cell.structure)}. ${side(cell.owner).label}. Ver detalhes`);
  button.title = `${labelStructure(cell.structure)} · ${side(cell.owner).label}`;
  // Icon HTML is generated from a fixed, local component, not from API data.
  button.innerHTML = `<span class="ar-site-pin__surface">${renderToStaticMarkup(<Icon size={22} strokeWidth={2.1} aria-hidden="true" />)}</span><span class="ar-site-pin__stem"></span>`;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(cell.id);
  });
  marker.append(button);
  return marker;
}

export function EnhancedWarMap({ cells }: { cells: WarTerritory[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<MapLibreMarker[]>([]);
  const firstFit = useRef(false);
  const cellsRef = useRef(cells);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  cellsRef.current = cells;
  const selected = cells.find((cell) => cell.id === selectedId);
  const liveCells = useMemo(() => cells.filter((cell) => isValidCell(cell.id)), [cells]);

  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreMap;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [-43.2, -22.9],
        zoom: 9,
        attributionControl: false,
      });
      map.current = instance;
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      instance.addControl(new maplibregl.AttributionControl({ compact: true }));
      instance.on('load', () => {
        instance.addSource('ar-war-cells', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({
          id: 'ar-war-fill', type: 'fill', source: 'ar-war-cells',
          paint: {
            'fill-color': ['match', ['get', 'owner'], 'HUMAN', '#3dbd82', 'ZOMBIE', '#ff695f', '#a0adb0'],
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.2, 14, 0.32],
          },
        });
        instance.addLayer({
          id: 'ar-war-border', type: 'line', source: 'ar-war-cells',
          paint: {
            'line-color': ['match', ['get', 'owner'], 'HUMAN', '#8ff1b5', 'ZOMBIE', '#ff9388', '#c5d0ce'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.4, 13, 2.5],
            'line-opacity': 0.88,
          },
        });
        instance.on('click', 'ar-war-fill', (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === 'string' && cellsRef.current.some((cell) => cell.id === id)) setSelectedId(id);
        });
        instance.on('mouseenter', 'ar-war-fill', () => { instance.getCanvas().style.cursor = 'pointer'; });
        instance.on('mouseleave', 'ar-war-fill', () => { instance.getCanvas().style.cursor = ''; });
        setReady(true);
      });
    } catch {
      setFailed(true);
      return;
    }
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.current = null;
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const features = liveCells.map((cell) => ({
      type: 'Feature' as const,
      properties: { id: cell.id, owner: cell.owner ?? 'NEUTRAL' },
      geometry: { type: 'Polygon' as const, coordinates: [cellToBoundary(cell.id, true)] },
    }));
    const source = instance.getSource('ar-war-cells') as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features });

    markers.current.forEach((marker) => marker.remove());
    markers.current = liveCells.map((cell) => {
      const [latitude, longitude] = cellToLatLng(cell.id);
      return new maplibregl.Marker({
        element: markerNode(cell, setSelectedId),
        anchor: 'bottom',
        offset: [0, 0],
        subpixelPositioning: true,
      }).setLngLat([longitude, latitude]).addTo(instance);
    });
    if (!firstFit.current && features.length) {
      const bounds = new maplibregl.LngLatBounds();
      for (const feature of features) {
        for (const [longitude, latitude] of feature.geometry.coordinates[0]) bounds.extend([longitude, latitude]);
      }
      instance.fitBounds(bounds, { padding: 75, maxZoom: 13.6, duration: 500 });
      firstFit.current = true;
    }
  }, [liveCells, ready]);

  function focusOnWar() {
    const instance = map.current;
    if (!instance || !liveCells.length) return;
    const bounds = new maplibregl.LngLatBounds();
    liveCells.forEach((cell) => cellToBoundary(cell.id, true).forEach(([lon, lat]) => bounds.extend([lon, lat])));
    instance.fitBounds(bounds, { padding: 75, maxZoom: 13.6, duration: 600 });
  }

  return (
    <div className="ar-map-shell">
      <div className="ar-map-viewport" ref={container} role="region" aria-label="Mapa dos territórios em disputa" />
      {failed && <div className="ar-map-message">Mapa indisponível neste dispositivo. A lista de estruturas permanece abaixo.</div>}
      <div className="ar-map-tools">
        <button onClick={focusOnWar} type="button" disabled={!ready || !liveCells.length} title="Centralizar territórios" aria-label="Centralizar territórios">
          <Crosshair size={16} aria-hidden="true" /> <span>Centralizar</span>
        </button>
      </div>
      {selected && (
        <aside className={`ar-site-inspector ar-site-inspector--${side(selected.owner).className}`} aria-label="Detalhes do território">
          <div className="ar-site-inspector__top">
            <span className="ar-site-inspector__eyebrow">PONTO ESTRATÉGICO</span>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Fechar detalhes"><X size={16} /></button>
          </div>
          <strong>{labelStructure(selected.structure)}</strong>
          <div className="ar-site-inspector__faction">{selected.owner === 'HUMAN' ? <Shield size={14} /> : selected.owner === 'ZOMBIE' ? <Skull size={14} /> : <Crosshair size={14} />}{side(selected.owner).label}</div>
          <div className="ar-site-inspector__track-label"><span>Índice de controle</span><b>{Number.isFinite(selected.control) ? selected.control : 0} / 1000</b></div>
          <div className="ar-site-inspector__track"><span style={{width: `${Math.min(100,Math.max(0,selected.control / 10))}%`}} /></div>
          <div className="ar-site-inspector__foot"><span>Contágio: <b>{selected.contagion}</b></span><span>H3 • {selected.id.slice(-6)}</span></div>
        </aside>
      )}
      {!liveCells.length && <div className="ar-map-message">Nenhum território disponível para este filtro.</div>}
    </div>
  );
}

/** Compact structure inventory, counted from actual public territory records. */
export function StrategicStructureStrip({ cells }: { cells: WarTerritory[] }) {
  const items = Object.entries(STRUCTURES)
    .map(([id, definition]) => ({ id, definition, count: cells.filter((cell) => cell.structure === id).length }))
    .filter((item) => item.count > 0);
  if (!items.length) return null;
  return (
    <div className="ar-strategy-strip" aria-label="Estruturas descobertas por categoria">
      <span className="ar-strategy-strip__title">ESTRUTURAS DETECTADAS</span>
      <div className="ar-strategy-strip__items">
        {items.map(({ id, definition, count }) => {
          const Icon = definition.icon;
          return <span key={id} className="ar-strategy-strip__item" title={`${definition.label}: ${count}`}><Icon size={15} aria-hidden="true" /> {definition.label} <b>{count}</b></span>;
        })}
      </div>
    </div>
  );
}

const OPERATIONS: Record<string, string> = {
  BOT_ATTACK: 'Ofensiva autônoma',
  CAPTURE: 'Território conquistado',
  RETAKE: 'Território retomado',
  CONTEST: 'Território contestado',
  DEFENSE: 'Defesa territorial',
  PATROL: 'Patrulha registrada',
  PLAYER_ATTACK: 'Ataque de jogador',
  TERRITORY_CAPTURE: 'Território conquistado',
  TERRITORY_RETAKE: 'Território retomado',
};

function eventNarrative(event: WarEventRecord) {
  const faction = event.faction === 'HUMAN' ? 'Resistência' : event.faction === 'ZOMBIE' ? 'Horda' : 'Forças desconhecidas';
  const target = STRUCTURES[event.structure ?? '']?.location ?? 'um ponto estratégico';
  switch (event.kind) {
    case 'BOT_ATTACK': return `${faction} atacou ${target}`;
    case 'CAPTURE':
    case 'TERRITORY_CAPTURE': return `${faction} conquistou ${target}`;
    case 'RETAKE':
    case 'TERRITORY_RETAKE': return `${faction} retomou ${target}`;
    case 'CONTEST': return `${faction} contestou ${target}`;
    case 'DEFENSE': return `${faction} defendeu ${target}`;
    default: return OPERATIONS[event.kind] ?? event.kind.replaceAll('_', ' ').toLocaleLowerCase('pt-BR');
  }
}

function validDate(raw: string) {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function WarEventFeed({ events, available }: { events: WarEventRecord[]; available: boolean }) {
  const [filter, setFilter] = useState<'ALL' | WarFaction>('ALL');
  const current = events.filter((event) => filter === 'ALL' || event.faction === filter).slice(0, 12);
  return (
    <div className="ar-activity-feed">
      <div className="ar-event-filter" role="group" aria-label="Filtrar eventos por facção">
        {([['ALL', 'Todos'], ['HUMAN', 'Resistência'], ['ZOMBIE', 'Horda']] as const).map(([id, label]) => (
          <button type="button" key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={filter === id ? 'active' : ''}>{label}</button>
        ))}
        <span className="ar-event-filter__count">{current.length} {current.length === 1 ? 'ocorrência' : 'ocorrências'}</span>
      </div>
      {current.length ? (
        <ol className="ar-event-list">
          {current.map((event) => {
            const factionClass = event.faction === 'HUMAN' ? 'human' : event.faction === 'ZOMBIE' ? 'zombie' : 'neutral';
            const Icon = event.faction === 'HUMAN' ? Shield : event.faction === 'ZOMBIE' ? Skull : Activity;
            const date = validDate(event.at);
            const source = event.actorType === 'BOT' ? 'Ação de NPC' : event.actorType === 'PLAYER' ? 'Ação de jogador' : 'Registro de guerra';
            return (
              <li key={event.id} className="ar-event-entry">
                <div className={`ar-event-entry__icon ar-event-entry__icon--${factionClass}`}><Icon size={17} aria-hidden="true" /></div>
                <div className="ar-event-entry__body">
                  <strong>{eventNarrative(event)}</strong>
                  <div className="ar-event-entry__meta"><span>{source}</span><span className="ar-event-entry__separator">·</span><span>{OPERATIONS[event.kind] ?? 'Movimentação'}</span></div>
                </div>
                <time dateTime={date?.toISOString()} className="ar-event-entry__time">{date ? date.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'Hora n/d'}</time>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="ar-event-empty">{!available ? 'O histórico será exibido quando a API estiver conectada.' : events.length ? 'Nenhuma ocorrência dessa facção nos eventos recebidos.' : 'Ainda não há ocorrências no reporte público.'}</div>
      )}
      <div className="ar-event-disclaimer">Horários arredondados pela API pública. Nenhuma localização individual de jogadores é exibida.</div>
    </div>
  );
}
