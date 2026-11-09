import test from 'node:test';
import assert from 'node:assert/strict';
import { compile,mount,makeApi,runId,input,click,button,submit,find,act,dom,React } from '../../test-support/dom.js';
import { rememberRun,readRecentRuns } from '../runs/recent-runs.js';
const Dashboard=await compile('src/app/DashboardApp.jsx');
const Configuration=await compile('src/app/RunConfiguration.jsx');
const Workspace=({runId,configuration})=>React.createElement(React.Fragment,null,React.createElement('p',null,`Selected ${runId}`),React.createElement(Configuration,{configuration}));

test('dashboard retains run browser and About without retired Scale study or upload controls',async()=>{
  const view=await mount(Dashboard,{api:makeApi(),Workspace});
  try{
    assert.ok(document.querySelector('aside[aria-label="Run browser"]'));
    assert.match(document.body.textContent,/Start a new run/);
    assert.equal(button('Scale study'),undefined);
    assert.equal(button('Run configuration'),undefined);
    assert.equal(button('Run details'),undefined);
    assert.ok(button('About'));
    assert.doesNotMatch(document.body.textContent,/Upload an existing run|Local file library/);
    for(const label of ['Migration','Convergence','Clustering','Run configurations'])assert.ok(button(label).disabled);
    assert.equal(find('preset').value,'de_rastrigin');
  }finally{await view.close();}
});

test('analysis tabs retain selected run ID and hand each view to the shared workspace',async()=>{
  let requests=0;
  const view=await mount(Dashboard,{api:makeApi({result:async()=>{requests++;}}),Workspace},()=>window.history.replaceState(null,'',`#archipelago?run_id=${runId}`));
  try{
    for(const [label,page] of [['Migration','migration'],['Convergence','convergence'],['Clustering','diagnostics'],['Run configurations','run']]){
      await click(button(label));assert.equal(window.location.hash,`#${page}?run_id=${runId}`);
      assert.match(document.body.textContent,new RegExp(`Selected ${runId}`));
    }
    assert.equal(requests,0);
  }finally{await view.close();}
});

test('accepted batch run appears in sidebar, opens workspace and retains accepted configuration through refresh',async()=>{
  let sent;
  const api=makeApi({createRun:async body=>{sent=body;return {run_id:runId,status:'queued',...body};}});
  const view=await mount(Dashboard,{api,Workspace});
  try{
    await input('evaluation_budget','2000');await click(find('final-only'));await submit();
    assert.equal(sent.stream,false);assert.match(document.body.textContent,new RegExp(`Selected ${runId}`));
    assert.equal(readRecentRuns(window.localStorage,'http://localhost:8000')[0].configuration.stream,false);
    await click(button('Run configurations'));
    assert.match(window.location.hash,/#run\?run_id=/);assert.match(document.body.textContent,/Final result only/);assert.match(document.body.textContent,/2000/);
    await act(async()=>window.dispatchEvent(new dom.window.PopStateEvent('popstate')));
    assert.match(document.body.textContent,/2000/);
    await click(button('New run'));assert.equal(find('evaluation_budget').value,'2000');
  }finally{await view.close();}
});

test('sidebar opens and removes remembered IDs and preserves current-run tab when switching',async()=>{
  const other='run-20261102T130000Z-11223344';
  const view=await mount(Dashboard,{api:makeApi(),Workspace},()=>{
    rememberRun(window.localStorage,'http://localhost:8000',{run_id:runId,preset:'first',source:'new'});
    rememberRun(window.localStorage,'http://localhost:8000',{run_id:other,preset:'second',source:'new'});
    window.history.replaceState(null,'',`#configuration?run_id=${runId}`);
  });
  try{
    await click(document.querySelector(`[data-run-id="${other}"]`));
    assert.equal(window.location.hash,`#run?run_id=${other}`);
    assert.match(document.body.textContent,/Request settings are not saved/);
    await click(document.querySelector(`[aria-label="Forget ${other}"]`));
    assert.equal(readRecentRuns(window.localStorage,'http://localhost:8000').length,1);
  }finally{await view.close();}
});

test('manual ID validation and storage failures retain an accepted run handoff',async()=>{
  const blocked={getItem:()=>null,setItem:()=>{throw Error('quota');}};
  const view=await mount(Dashboard,{api:makeApi(),Workspace,storage:blocked});
  try{
    await input('run_id','invalid');await submit('.open-run-form');assert.match(document.body.textContent,/Enter a valid run ID/);
    await submit();assert.match(window.location.hash,new RegExp(runId));assert.match(document.body.textContent,/could not remember/);
  }finally{await view.close();}
});

test('sidebar history is isolated when actual backend identity changes and handles native storage events',async()=>{
  let target='http://first:8000';const api=makeApi({identity:async()=>target});
  const view=await mount(Dashboard,{api,Workspace},()=>rememberRun(window.localStorage,target,{run_id:runId,preset:'first',source:'new'}));
  try{
    assert.ok(document.querySelector(`[data-run-id="${runId}"]`));
    target='http://second:8000';await click(button('Retry run browser'));assert.equal(document.querySelector(`[data-run-id="${runId}"]`),null);
    rememberRun(window.localStorage,target,{run_id:runId,preset:'second',source:'new'});
    await act(async()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'archipelago.backend-runs.v1'})));
    assert.ok(document.querySelector(`[data-run-id="${runId}"]`));
  }finally{await view.close();}
});

test('creation waits for backend identity so accepted settings cannot be lost during loading',async()=>{
  let identify,creates=0;const identity=new Promise(resolve=>identify=resolve);
  const view=await mount(Dashboard,{api:makeApi({identity:()=>identity,createRun:async body=>{creates++;return {run_id:runId,status:'queued',...body};}}),Workspace});
  try{
    assert.ok(button('Start run').disabled);await submit();assert.equal(creates,0);
    await act(async()=>identify('http://localhost:8000'));assert.equal(button('Start run').disabled,false);
    await input('evaluation_budget','3000');await submit();assert.equal(creates,1);
    assert.equal(readRecentRuns(window.localStorage,'http://localhost:8000')[0].configuration.overrides.evaluation_budget,3000);
    await click(button('Run configurations'));assert.match(document.body.textContent,/3000/);
  }finally{await view.close();}
});

test('identity retry enables creation only after a stable backend target is available',async()=>{
  let attempts=0;
  const view=await mount(Dashboard,{api:makeApi({identity:async()=>{if(!attempts++)throw Error('Backend identity unavailable.');return 'http://localhost:8000';}}),Workspace});
  try{
    assert.ok(button('Start run').disabled);assert.match(document.body.textContent,/Backend identity unavailable/);
    await click(button('Retry run browser'));assert.equal(button('Start run').disabled,false);
    await submit();assert.equal(readRecentRuns(window.localStorage,'http://localhost:8000')[0].run_id,runId);
  }finally{await view.close();}
});
