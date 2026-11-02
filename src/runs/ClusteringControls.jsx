import React from 'react';
import { CLUSTER_FIELDS } from './run-form.js';

const STAGES = [['lsh','LSH'],['birch','BIRCH'],['denstream','DenStream']];
export default function ClusteringControls({value,onChange,errors={}}) {
  const set = (key,next) => onChange({...value,[key]:next});
  return <section className="clustering-controls" aria-labelledby="clustering-title">
    <h3 id="clustering-title">Clustering</h3>
    <p className="caption">Stages run in order: LSH → BIRCH → DenStream. Enable at least one.</p>
    <div className="stage-row">{STAGES.map(([key,label])=><label className="check" key={key}><input name={key} type="checkbox" checked={value[key]} onChange={event=>set(key,event.target.checked)}/>{label}</label>)}</div>
    {errors.stages && <p className="field-error" role="alert">{errors.stages}</p>}
    <label>Clustering detail<input name="detail" type="number" min="0.5" max="2" step="0.1" value={value.detail} onChange={event=>set('detail',event.target.value)} aria-invalid={!!errors.detail}/><small>0.5 is coarser; 2 is finer. Applies to automatically chosen BIRCH and DenStream distances.</small></label>
    <details><summary>Advanced clustering settings</summary><div className="details-body param-grid">
      {Object.entries(CLUSTER_FIELDS).filter(([key,rule])=>key !== 'detail' && (!rule.stage || value[rule.stage])).map(([key,rule])=><div key={key}>
        {rule.auto && <label className="check"><input type="checkbox" checked={value[key] == null} onChange={event=>set(key,event.target.checked?null:'')}/>Automatic {rule.label.toLowerCase()}</label>}
        <label>{rule.label}<input name={`clustering.${key}`} type="number" min={rule.min ?? (rule.positive ? '0' : undefined)} max={rule.max} step={rule.step} value={value[key] ?? ''} disabled={rule.auto && value[key] == null} onChange={event=>set(key,event.target.value)} aria-invalid={!!errors[key]} placeholder={rule.auto?'Measured from the run':undefined}/></label>
        {errors[key] && <p className="field-error">{errors[key]}</p>}
      </div>)}
    </div></details>
  </section>;
}
