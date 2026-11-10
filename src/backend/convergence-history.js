// Presentation only: retain module statistics and map their values to SVG coordinates.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const fields = {best_fitness:'best_fitness',best_so_far_fitness:'best_so_far_fitness',mean_fitness:'mean_fitness',fitness_std:'std_fitness',diversity:'diversity',evaluations:'evaluations_total'};
export function convergenceHistory(result) {
  const history = result?.generation_history;
  if (history == null || (Array.isArray(history) && !history.length)) return null;
  if (!Array.isArray(history)) throw Error('The run result has malformed generation history.');
  const grouped = new Map();
  for (const sample of history) {
    if (!count(sample?.island_id) || !count(sample.generation)) throw Error('The run result has malformed generation history.');
    const series = grouped.get(sample.island_id) || [];
    const row = {generation:sample.generation};
    for (const [target,source] of Object.entries(fields)) {
      const value = sample[source];
      if (value != null && !(source==='evaluations_total'?count(value):finite(value))) throw Error('The run result has malformed generation metrics.');
      row[target] = value ?? null;
    }
    row.diversity_metric = sample.diversity_metric;
    row.diversity_sample_size = sample.diversity_sample_size;
    series.push(row); grouped.set(sample.island_id,series);
  }
  const islands = [...grouped].sort(([a],[b])=>a-b).map(([island_id,series])=>({island_id,series:series.sort((a,b)=>a.generation-b.generation)}));
  if (islands.some(island=>island.series.some((row,i)=>i>0&&row.generation===island.series[i-1].generation))) throw Error('The run result has duplicate generation summaries.');
  const samples = islands.flatMap(island=>island.series);
  const charts = {};
  for (const metric of ['best_so_far_fitness','best_fitness','mean_fitness','diversity']) {
    const values = samples.map(row=>row[metric]).filter(finite);
    if (!values.length) continue;
    // Do not compare different diversity definitions on the same axis.
    if (metric==='diversity' && new Set(samples.filter(row=>finite(row.diversity)).map(row=>row.diversity_metric)).size>1) continue;
    let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    for(const row of samples){xmin=Math.min(xmin,row.generation);xmax=Math.max(xmax,row.generation);}
    for(const value of values){ymin=Math.min(ymin,value);ymax=Math.max(ymax,value);}
    if(xmin===xmax){xmin=Math.max(0,xmin-1);xmax+=1;}
    if(ymin===ymax){const padding=Math.abs(ymin)*0.05||1;ymin-=padding;ymax+=padding;}
    const x=value=>120+(value-xmin)/(xmax-xmin)*756;
    const y=value=>280-(value-ymin)/(ymax-ymin)*252;
    const ticks=Array.from({length:5},(_,i)=>ymin+(ymax-ymin)*i/4);
    let precision=6;
    while(precision<17 && new Set(ticks.map(value=>value.toPrecision(precision))).size<new Set(ticks).size) precision++;
    charts[metric]={width:900,height:330,metric,
      x_ticks:[...new Set(Array.from({length:5},(_,i)=>Math.round(xmin+(xmax-xmin)*i/4)))].map(value=>({x:x(value),label:String(value)})),
      y_ticks:ticks.map(value=>({y:y(value),label:value.toPrecision(precision)})),
      lines:islands.map(island=>({island_id:island.island_id,points:island.series.map(row=>finite(row[metric])?{x:x(row.generation),y:y(row[metric])}:null)}))};
  }
  return {islands,charts,chart:Object.values(charts)[0]??null};
}
