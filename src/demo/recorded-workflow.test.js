import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,mount,click,button,input,submit,dom,act} from '../../test-support/dom.js';
import {createRecordedApi} from './recorded-api.js';

const originalFetch=globalThis.fetch,requests=[];
const fileFetch=async target=>{
  const path=new URL(target,'http://localhost').pathname;requests.push(path);
  assert.match(path,/^\/(recorded-runs|recorded-analytics|sample-explanations)\/[a-zA-Z0-9.-]+\.json$/,'Demo must use only published recording files.');
  return new Response(await readFile(new URL('../../public'+path,import.meta.url)),{headers:{'content-type':'application/json'}});
};
globalThis.fetch=fileFetch;
after(()=>{globalThis.fetch=originalFetch;});
dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
const Page=await compile('src/demo/RecordedDashboard.jsx');
async function ready(predicate) {
  for(let attempt=0;attempt<200&&!predicate();attempt++)await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
  assert.ok(predicate(),document.body.textContent);
}

test('both published recordings load through actual workspace and analysis tabs without a backend',async()=>{
  const view=await mount(Page,{api:createRecordedApi({fetchImpl:fileFetch})});
  try{
    await ready(()=>button('Open recording'));
    await click(button('Open recording'));
    for(const identity of ['run-20260903T230838Z-4891f68f','run-20260903T230942Z-c7f38cc1']){
      await input('run_id',identity);await submit('.open-run-form');
      await click(button('Archipelago'));
      await ready(()=>/Recorded result loaded/.test(document.body.textContent));
      assert.match(document.body.textContent,/Recorded result loaded/);
      assert.ok(document.querySelector('.backend-stn-host #rail'));
      assert.ok(document.querySelector('.backend-stn-host .stage').contains(button('Reset view')));
      assert.equal(document.querySelector('.backend-stn-host .rail-foot').contains(button('Reset view')),false);
      assert.equal(document.querySelectorAll('.backend-stn-host #rail-left .sec').length,4);
      assert.equal(document.querySelectorAll('.backend-stn-host #rail .sec').length,3);
      assert.ok([...document.querySelectorAll('.backend-stn-host .sec')].every(section=>section.open));
      assert.equal(document.querySelector('.backend-viz-wrap .view-tabs'),null);
      assert.ok(document.querySelector('.backend-stn-host .rail-foot').contains(button('Replay run')));
      await click(button('Replay run'));
      assert.ok(button('Play'));
      await click(button('Show full graph'));
      await click(button('Migration'));await ready(()=>document.querySelectorAll('tbody tr').length>0);
      await click(button('Clustering'));await ready(()=>/Clustering stages and settings/.test(document.body.textContent));assert.match(document.body.textContent,/MMD/);
      await click(button('Run configurations'));await ready(()=>document.querySelector('.run-outcomes'));assert.match(document.querySelector('.run-identity').textContent,/Rastrigin/);
      assert.equal(button('Run configuration'),undefined);assert.match(document.body.textContent,/Recorded runner settings/);assert.match(document.body.textContent,/Offline clustering/);
      await click(button('Convergence'));await ready(()=>document.querySelectorAll('polyline').length>0);assert.match(document.body.textContent,/Fitness history/);
      await click(button('Explainability'));await ready(()=>document.querySelector('[data-attribution]'));
      await click(button('Migration routes'));assert.match(document.body.textContent,/Migration-route contributions/);
    }
    assert.ok(requests.length>0);assert.equal(document.querySelector('[role="alert"]'),null);
  }finally{await view.close();}
});
