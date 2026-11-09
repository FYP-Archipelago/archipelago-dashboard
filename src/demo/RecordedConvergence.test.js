import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,click,button,act,dom} from '../../test-support/dom.js';
import {readFileSync} from 'node:fs';
const Page=await compile('src/demo/RecordedConvergence.jsx');
const id='run-20260903T230838Z-4891f68f';
const data=JSON.parse(readFileSync(new URL(`../../public/recorded-analytics/${id}.json`,import.meta.url)));
test('saved convergence renders provided chart coordinates and recorded summary rows',async()=>{
  const view=await mount(Page,{runId:id,api:{analytics:async()=>data}});
  try{assert.match(document.body.textContent,/Fitness history/);assert.doesNotMatch(document.body.textContent,/Minimise fitness|Maximise fitness/);assert.equal(document.querySelectorAll('polyline').length,4);assert.equal(document.querySelectorAll('tbody tr').length,73);assert.equal(document.querySelector('.history-data').open,false);}finally{await view.close();}
});

test('island, metric and generation controls inspect supplied samples and preserve small nonzero values',async()=>{
  const history=structuredClone(data);
  history.chart.y_ticks[0].label='0.00000149109';
  history.islands[0].series.at(-1).best_so_far_fitness=0.00000149109;
  const view=await mount(Page,{runId:id,api:{analytics:async()=>history}});
  try {
    assert.match(document.querySelector('svg').textContent,/0\.00000149109/);
    assert.doesNotMatch(document.querySelector('svg').textContent,/\de-\d/i);
    assert.equal(document.querySelector('.history-point-value strong').textContent,'0.00000149109');
    await click(button('Island 2'));
    assert.equal(document.querySelectorAll('polyline').length,1);
    const metric=document.querySelector('[aria-label="Chart metric"]');
    await act(async()=>{metric.value='diversity';metric.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    assert.match(document.querySelector('.history-axis-label').textContent,/Diversity/);
    assert.equal(document.querySelector('polyline').getAttribute('points'),history.charts.diversity.lines[2].points.map(p=>`${p.x},${p.y}`).join(' '));
    const slider=document.querySelector('[aria-label="Inspect generation"]');
    await act(async()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(slider,'0');
      slider.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      slider.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    });
    assert.equal(document.querySelector('.history-scrubber output').textContent,'0');
    assert.equal(document.querySelector('.history-point-value strong').textContent,new Intl.NumberFormat('en',{maximumSignificantDigits:21}).format(history.islands[2].series[0].diversity));
    await click(button('All islands'));assert.equal(document.querySelectorAll('polyline').length,4);
  } finally {await view.close();}
});

test('legacy history supports a single metric and a single recorded generation',async()=>{
  const history=structuredClone(data);
  delete history.charts;
  history.islands=history.islands.slice(0,1);
  history.islands[0].series=history.islands[0].series.slice(0,1);
  history.chart.lines=history.chart.lines.slice(0,1);
  history.chart.lines[0].points=history.chart.lines[0].points.slice(0,1);
  const view=await mount(Page,{runId:id,api:{analytics:async()=>history}});
  try {
    assert.equal(document.querySelectorAll('polyline').length,1);
    assert.equal(document.querySelectorAll('[aria-label="Chart metric"] option').length,1);
    assert.equal(document.querySelector('[aria-label="Inspect generation"]').max,'0');
    assert.ok(document.querySelector('.history-marker'));
  } finally {await view.close();}
});

test('point inspection and generation data retain recorded precision and exact evaluation counts',async()=>{
  const history=structuredClone(data);
  const row=history.islands[0].series.at(-1);
  row.best_so_far_fitness=1.49109123456789e-6;
  row.evaluations=123456789;
  history.chart.y_ticks[0].label='1.0000001';
  history.chart.y_ticks[1].label='1.0000004';
  const view=await mount(Page,{runId:id,api:{analytics:async()=>history}});
  try {
    assert.equal(document.querySelector('.history-point-value strong').textContent,'0.00000149109123456789');
    const cells=document.querySelectorAll('tbody tr')[history.islands[0].series.length-1].querySelectorAll('td');
    assert.equal(cells[2].textContent,'123,456,789');
    assert.equal(cells[4].textContent,'0.00000149109123456789');
    assert.match(document.querySelector('svg').textContent,/1\.0000001/);
    assert.match(document.querySelector('svg').textContent,/1\.0000004/);
  } finally {await view.close();}
});
test('failed history can be retried and stale responses cannot replace a new recording',async()=>{
  let fail=true,resolve;const old=new Promise(r=>{resolve=r;});
  const view=await mount(Page,{runId:id,api:{analytics:async()=>{if(fail)throw Error('History unavailable');return data;}}});
  try{assert.match(document.body.textContent,/History unavailable/);fail=false;await click(button('Retry history'));assert.equal(document.querySelectorAll('polyline').length,4);
    await view.rerender({api:{analytics:()=>old}});await view.rerender({runId:'run-20260903T230942Z-c7f38cc1',api:{analytics:async()=>{throw Error('New selection');}}});await act(async()=>resolve(data));assert.match(document.body.textContent,/New selection/);assert.equal(document.querySelector('polyline'),null);
  }finally{await view.close();}
});
