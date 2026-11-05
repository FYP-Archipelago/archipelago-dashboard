import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,click,button,act} from '../../test-support/dom.js';
import {readFileSync} from 'node:fs';
const Page=await compile('src/demo/RecordedConvergence.jsx');
const id='run-20260903T230838Z-4891f68f';
const data=JSON.parse(readFileSync(new URL(`../../public/recorded-analytics/${id}.json`,import.meta.url)));
test('saved convergence renders provided chart coordinates and recorded summary rows',async()=>{
  const view=await mount(Page,{runId:id,api:{analytics:async()=>data}});
  try{assert.match(document.body.textContent,/Recorded fitness history/);assert.match(document.body.textContent,/Minimisation/);assert.equal(document.querySelectorAll('polyline').length,4);assert.equal(document.querySelectorAll('tbody tr').length,73);assert.match(document.body.textContent,/No missing generations are interpolated/);}finally{await view.close();}
});
test('failed history can be retried and stale responses cannot replace a new recording',async()=>{
  let fail=true,resolve;const old=new Promise(r=>{resolve=r;});
  const view=await mount(Page,{runId:id,api:{analytics:async()=>{if(fail)throw Error('History unavailable');return data;}}});
  try{assert.match(document.body.textContent,/History unavailable/);fail=false;await click(button('Retry history'));assert.equal(document.querySelectorAll('polyline').length,4);
    await view.rerender({api:{analytics:()=>old}});await view.rerender({runId:'run-20260903T230942Z-c7f38cc1',api:{analytics:async()=>{throw Error('New selection');}}});await act(async()=>resolve(data));assert.match(document.body.textContent,/New selection/);assert.equal(document.querySelector('polyline'),null);
  }finally{await view.close();}
});
