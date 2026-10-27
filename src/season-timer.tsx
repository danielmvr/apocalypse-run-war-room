import { useEffect, useState } from 'react';
import type { PublicSeason } from './public-season';
import { seasonCountdown } from './season-clock';

/** Isolated one-second rendering, so ticking cannot cause the War Room map to rerender. */
export function SeasonTimer({ season }: { season: PublicSeason | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (!season || Date.parse(season.endsAt) <= Date.now()) return;
    const id = window.setInterval(() => {
      tick();
      if (Date.now() >= Date.parse(season.endsAt)) window.clearInterval(id);
    }, 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [season?.startsAt, season?.endsAt]);

  const clock = seasonCountdown(season, now);
  const label = clock.state === 'active' ? 'Tempo restante da temporada'
    : clock.state === 'ended' ? 'Temporada encerrada'
    : clock.state === 'upcoming' ? 'A temporada ainda não começou'
    : 'Cronômetro da temporada indisponível';

  return (
    <div className={`ar-season-timer ar-season-timer--${clock.state}`} role="timer" aria-label={label} aria-live="off">
      <div className="ar-season-timer__heading"><span>TEMPO RESTANTE DA TEMPORADA</span><span className="ar-season-timer__source">HORÁRIO OFICIAL · BRASÍLIA</span></div>
      {clock.state === 'active' ? <>
        <div className="ar-season-timer__digits">
          {([['DIAS', clock.days], ['HORAS', clock.hours], ['MIN', clock.minutes], ['SEG', clock.seconds]] as const).map(([unit, value]) =>
            <div className="ar-season-timer__unit" key={unit}><strong>{String(value).padStart(2, '0')}</strong><span>{unit}</span></div>)}
        </div>
        <div className="ar-season-timer__progress" role="progressbar" aria-label="Tempo decorrido da temporada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clock.progress)}><span style={{ width: `${clock.progress}%` }} /></div>
      </> : <p className="ar-season-timer__message">{
        clock.state === 'ended' ? 'Temporada encerrada. Aguardando confirmação da próxima pelo servidor.' :
        clock.state === 'upcoming' ? 'A temporada oficial ainda não começou.' :
        'Aguardando confirmação do calendário oficial.'
      }</p>}
      <p className="ar-season-timer__fine">Contagem estimada pelo relógio do dispositivo. O servidor determina a virada e os pontos oficiais.</p>
    </div>
  );
}
