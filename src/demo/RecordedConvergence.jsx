import React,{useEffect,useState} from 'react';
import {validateRecordedAnalytics} from './recorded-api.js';
import './recorded.css';

const COLORS=['#3b82f6','#e79039','#16a085','#bd6bc8','#d95265','#778448'];
const number=new Intl.NumberFormat('en',{maximumFractionDigits:4});
const show=value=>value===undefined?'—':number.format(value);

export default function RecordedConvergence({runId,api}) {
  const [state,setState]=useState({runId,data:null,error:''}),[retry,setRetry]=useState(0),[selected,setSelected]=useState('all');
  useEffect(()=>{
    let active=true;const controller=new AbortController();setState({runId,data:null,error:''});setSelected('all');
    Promise.resolve().then(()=>api.analytics(runId,{signal:controller.signal})).then(data=>validateRecordedAnalytics(data,runId)).then(data=>{if(active)setState({runId,data,error:''});}).catch(error=>{if(active)setState({runId,data:null,error:error.message});});
    return()=>{active=false;controller.abort();};
  },[runId,api,retry]);
  const data=state.runId===runId?state.data:null;
  if(state.runId===runId&&state.error)return <div className="notice" role="alert">{state.error} <button className="secondary" onClick={()=>setRetry(value=>value+1)}>Retry history</button></div>;
  if(!data)return <p role="status">Loading recorded generation summaries…</p>;
  const visible=island=>selected==='all'||String(island.island_id)===selected;
  const chart=data.chart;
  return <section className="recorded-history">
    <h2>Recorded fitness history</h2>
    <p>{data.maximising?'Maximisation · higher fitness is better.':'Minimisation · lower fitness is better.'} Values are recorded generation summaries; coordinates are prepared offline in Python. No missing generations are interpolated or extended beyond an island’s final record.</p>
    <label>Island <select aria-label="History island" value={selected} onChange={event=>setSelected(event.target.value)}><option value="all">All islands</option>{data.islands.map(island=><option key={island.island_id} value={island.island_id}>Island {island.island_id}</option>)}</select></label>
    <figure className="recorded-chart"><svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Recorded best fitness by generation">
      {chart.y_ticks.map(tick=><g key={tick.y}><line x1={chart.x_ticks[0].x} x2={chart.x_ticks.at(-1).x} y1={tick.y} y2={tick.y}/><text x="58" y={tick.y} textAnchor="end" dominantBaseline="middle">{tick.label}</text></g>)}
      {chart.x_ticks.map(tick=><text key={tick.x} x={tick.x} y="244" textAnchor="middle">{tick.label}</text>)}
      {chart.lines.map((line,index)=>visible(line)&&<polyline key={line.island_id} fill="none" stroke={COLORS[index%COLORS.length]} strokeWidth="2" points={line.points.map(point=>`${point.x},${point.y}`).join(' ')}><title>Island {line.island_id}</title></polyline>)}
    </svg><figcaption>{chart.metric==='best_so_far_fitness'?'Best-so-far fitness':'Generation best fitness'} · Generation on horizontal axis</figcaption></figure>
    <div className="recorded-legend">{data.islands.filter(visible).map(island=><span key={island.island_id} style={{borderColor:COLORS[data.islands.indexOf(island)%COLORS.length]}}>Island {island.island_id}</span>)}</div>
    <details><summary>Recorded generation values</summary><p>Diversity metric: {data.diversity_metric||'Not recorded'}. A dash indicates an unrecorded field.</p>
      <div className="run-table-wrap"><table><caption>Saved generation summaries</caption><thead><tr><th>Island</th><th>Generation</th><th>Evaluations</th><th>Best</th><th>Best so far</th><th>Mean</th><th>Fitness SD</th><th>Diversity</th></tr></thead><tbody>{data.islands.filter(visible).flatMap(island=>island.series.map(row=><tr key={`${island.island_id}-${row.generation}`}><td>{island.island_id}</td><td>{row.generation}</td><td>{show(row.evaluations)}</td><td>{show(row.best_fitness)}</td><td>{show(row.best_so_far_fitness)}</td><td>{show(row.mean_fitness)}</td><td>{show(row.fitness_std)}</td><td>{show(row.diversity)}</td></tr>))}</tbody></table></div>
    </details>
  </section>;
}
