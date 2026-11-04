import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,mount,runId} from '../../test-support/dom.js';
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
