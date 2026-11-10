import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,runId,click,button,input} from '../../test-support/dom.js';
import {emptyGraph} from './graph-model.js';
const Viewer=await compile('src/backend/GraphViewer.jsx');
test('empty and switched runs destroy old geometry, while live updates retain the viewer',async()=>{
  let created=0,destroyed=0,updates=0;
  const mountViewer=()=>{created++;return {destroy(){destroyed++;},setBackendGraph(){updates++;}};};
  const full={...emptyGraph(),nodes:new Map([[1,{id:1}]])};
  const view=await mount(Viewer,{runId,graph:full,mountViewer});
  try{
    assert.equal(created,1);await view.rerender({graph:{...full}});assert.equal(created,1);
    await view.rerender({graph:emptyGraph()});assert.equal(destroyed,1);assert.match(document.body.textContent,/No graph nodes/);
    await view.rerender({graph:full});assert.equal(created,2);
    await view.rerender({runId:'other'});assert.equal(destroyed,2);assert.equal(created,3);assert.ok(updates>=3);
  }finally{await view.close();}
});
test('saved result can be replayed from initial island nodes and returned to the full graph',async()=>{
  const shown=[],objectives=[];
  const mountViewer=root=>{root.innerHTML='<div class="rail-foot"><button>Reset all</button><button>Save image</button></div>';return {destroy(){root.innerHTML='';},setBackendGraph(graph,runId,options){shown.push(graph);objectives.push(options.maximising);}};};
  const graph={...emptyGraph(),nodes:new Map([
    [1,{id:1,island:0,first_eval:0}],
    [2,{id:2,island:1,first_eval:0}],
    [3,{id:3,island:0,first_eval:12}],
  ]),edges:new Map([[10,{id:10,source:1,target:3}]]),migrations:new Map([[20,{id:20,source:2,target:3,count:4}]])};
  const view=await mount(Viewer,{runId,graph,canReplay:true,maximising:true,mountViewer});
  try{
    assert.equal(objectives.at(-1),true);
    assert.ok(document.querySelector('.run-replay').classList.contains('idle'));
    const footer=document.querySelector('.rail-foot');
    assert.ok(footer.contains(button('Replay run')));
    assert.ok(footer.lastElementChild.contains(button('Replay run')));
    assert.equal(document.querySelector('.view-tabs'),null);
    await click(button('Replay run'));
    assert.ok(document.querySelector('.run-replay').classList.contains('active'));
    assert.deepEqual([...shown.at(-1).nodes.keys()],[1,2]);
    assert.equal(shown.at(-1).migrations.size,0);
    assert.match(document.body.textContent,/migration timing is unavailable/);
    await input('replay-progress','100');
    assert.equal(shown.at(-1).migrations.size,1);
    await input('replay-progress','0');
    assert.equal(shown.at(-1).migrations.size,0);
    await input('replay-speed','2');
    assert.equal(document.querySelector('[name="replay-speed"]').value,'2');
    await click(button('Play'));assert.ok(button('Pause'));
    await click(button('Pause'));assert.ok(button('Play'));
    await click(button('Show full graph'));
    assert.equal(shown.at(-1),graph);
    assert.ok(button('Replay run'));
    assert.ok(document.querySelector('.run-replay').classList.contains('idle'));
  }finally{await view.close();}
});
