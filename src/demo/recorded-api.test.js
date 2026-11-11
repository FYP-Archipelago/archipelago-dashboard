import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecordedApi,recordingStorage} from './recorded-api.js';
import {readRecentRuns} from '../runs/recent-runs.js';
import {result} from '../../test-support/backend-fixture.js';
import {readFileSync} from 'node:fs';
import {validateRecordedAnalytics} from './recorded-api.js';

const runId=result.run.run_id;
const entry={run_id:runId,label:'DE · Rastrigin · ring',recorded_at:'2026-09-03T23:08:38Z',configuration:{preset:'Saved ring run',overrides:{num_islands:4},stream:false,clustering:{lsh:true,birch:true}}};
const index={schema_version:1,runs:[entry]};
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

test('recorded API loads only published Results and never makes an execution request',async()=>{
  const calls=[];const api=createRecordedApi({fetchImpl:async(url,options)=>{calls.push({url,options});return response(url.endsWith('index.json')?index:result);}});
  assert.deepEqual(await api.recordings(),[entry]);
  assert.deepEqual(await api.result(runId),result);
  await assert.rejects(api.createRun({}),/recorded-data demonstration/);
  await assert.rejects(api.cancelRun(runId),/recorded-data demonstration/);
  assert.ok(calls.every(({url,options})=>url.startsWith('/recorded-runs/')&&!options.method));
  const storage=recordingStorage([entry],await api.identity());
  assert.equal(readRecentRuns(storage,await api.identity())[0].configuration.overrides.num_islands,4);
  assert.equal(readRecentRuns(storage,'http://localhost:8000').length,0);
});

test('unknown IDs, wrong-result identities and malformed catalogs fail safely',async()=>{
  let payload=index,calls=0;
  const api=createRecordedApi({fetchImpl:async url=>{calls++;return response(url.endsWith('index.json')?payload:{...result,run:{...result.run,run_id:'another-run'}});}});
  await assert.rejects(api.result('run-20261102T120000Z-11223344'),error=>error.status===404&&/run not found/.test(error.message));
  assert.equal(calls,1);
  await assert.rejects(api.result(runId),/another run/);
  for(const change of [{...entry,recorded_at:'invalid'},{...entry,configuration:null},{...entry,run_id:'../private'}]){
    payload={schema_version:1,runs:[change]};
    await assert.rejects(createRecordedApi({fetchImpl:async()=>response(payload)}).recordings(),/recording index/);
  }
});

test('static transport errors are retryable and cancelled requests stay cancelled',async()=>{
  let fail=true;const api=createRecordedApi({fetchImpl:async()=>fail?new Response('html',{headers:{'content-type':'text/html'}}):response(index)});
  await assert.rejects(api.recordings(),/recording data/);fail=false;
  assert.equal((await api.recordings()).length,1);
  const abort=new AbortController();abort.abort();
  await assert.rejects(api.recordings({signal:abort.signal}),error=>error.name==='AbortError');
});

test('recorded generation summaries reject invalid metrics, coordinates and identity',()=>{
  const id='run-20260903T230838Z-4891f68f';
  const data=JSON.parse(readFileSync(new URL(`../../public/recorded-analytics/${id}.json`,import.meta.url)));
  assert.equal(validateRecordedAnalytics(data,id),data);
  for(const alter of [value=>value.run_id='other',value=>value.islands[0].series[0].best_fitness={},value=>value.chart.lines[0].points[0].x=-1,value=>value.chart.lines[0].points.pop(),value=>value.islands.push(value.islands[0])]){
    const value=structuredClone(data);alter(value);assert.throws(()=>validateRecordedAnalytics(value,id),/recorded history/);
  }
});
