import { memo, useMemo } from 'react';
import { createTrack } from './game/track';
import { createMinimapProjection, type MinimapCar } from './game/minimap';

const EMPTY_CARS: MinimapCar[] = [];
export default memo(function TrackMinimap({ cars = EMPTY_CARS }: { cars?: MinimapCar[] }) {
  const map = useMemo(() => {
    const track = createTrack();
    const projection = createMinimapProjection(track.samples.map(s => s.center));
    const path = track.samples.map((sample, i) => {
      const p = projection.project(sample.center.x, sample.center.z);
      return (i ? 'L' : 'M') + p.x.toFixed(2) + ',' + p.y.toFixed(2);
    }).join(' ') + ' Z';
    const start = track.samples[0];
    return { ...projection, path, start: projection.project(start.center.x, start.center.z), startAngle: -Math.atan2(start.tangent.x, start.tangent.z) * 180 / Math.PI };
  }, []);
  const player = cars.find(car => car.isPlayer);
  return <section className="trackMinimap" aria-label="Track overview and live car positions">
    <div className="minimapHeading"><strong>TRACK MAP</strong><span>LIVE</span></div>
    <svg viewBox="0 0 220 160" role="img" aria-label="Full circuit; yellow arrow is your car, colored dots are opponents">
      <path d={map.path} fill="none" stroke="#080f15" strokeWidth="12" strokeLinejoin="round" />
      <path d={map.path} fill="none" stroke="#a5bbc5" strokeWidth="6" strokeLinejoin="round" />
      <g transform={'translate(' + map.start.x + ' ' + map.start.y + ') rotate(' + map.startAngle + ')'}>
        <path d="M-6 0H6" stroke="#fff" strokeWidth="3" /><path d="M-6 0H-3M0 0H3" stroke="#14202b" strokeWidth="3" />
        <title>Start / finish</title>
      </g>
      {cars.filter(car => !car.isPlayer).map(car => {
        const p = map.project(car.x, car.z);
        return <circle key={car.name} data-map-car={car.name} cx={p.x} cy={p.y} r="3.3" fill={car.color} stroke="#fff" strokeWidth="1"><title>{car.name}</title></circle>;
      })}
      {player && (() => {
        const p = map.project(player.x, player.z);
        return <g data-map-player="true" transform={'translate(' + p.x + ' ' + p.y + ') rotate(' + (-player.heading * 180 / Math.PI) + ')'}>
          <circle r="8" fill="#ffd15d" fillOpacity=".17" />
          <path d="M0 7 L-5 -5 L0 -2 L5 -5 Z" fill="#ffd15d" stroke="#171d24" strokeWidth="1.5" strokeLinejoin="round" />
          <title>Your position and direction</title>
        </g>;
      })()}
    </svg>
    <div className="minimapLegend"><span><i /> YOU</span><span>● RIVALS</span><span>▥ START</span></div>
  </section>;
});
