import {isRunId} from '../runs/recent-runs.js';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const percent=value=>finite(value)&&value>=0&&value<=100.000001;
const positive=value=>finite(value)&&value>=0;
const count=value=>Number.isSafeInteger(value)&&value>=0;
const optionalText=value=>value==null||typeof value==='string';
const validPlayer=p=>p&&typeof p.id==='string'&&typeof p.label==='string'&&positive(p.value)&&positive(p.standard_error)&&percent(p.share_percent)&&percent(p.bar_percent);
function validGame(game) {
  if(!game||!['exact','permutation-sampling'].includes(game.method)||!Array.isArray(game.players)||game.players.length>64||!game.players.every(validPlayer))return false;
  if(!count(game.seed)||!count(game.evaluated_coalitions)||
    (game.method==='permutation-sampling'&&(!count(game.permutations)||game.permutations<2)))return false;
  const ids=new Set(game.players.map(p=>p.id));
  return ids.size===game.players.length&&['empty_value','full_value','allocated_gain','evaluated_coalitions'].every(key=>positive(game[key]))&&finite(game.efficiency_error)&&
    Array.isArray(game.coalitions)&&game.coalitions.length<=1024&&game.coalitions.every(c=>typeof c.id==='string'&&Array.isArray(c.players)&&c.players.every(id=>ids.has(id))&&positive(c.value)&&percent(c.value_percent))&&
    Array.isArray(game.examples)&&game.examples.every(example=>typeof example.id==='string'&&Array.isArray(example.steps)&&example.steps.every(s=>ids.has(s.player_id)&&typeof s.label==='string'&&['before','after','marginal'].every(key=>positive(s[key]))&&percent(s.bar_percent)));
}

export function createExplanationClient({baseUrl='/sample-explanations',fetchImpl=globalThis.fetch}={}) {
  const root=baseUrl.replace(/\/+$/,'');
  async function read(file,{signal}={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    try{
      const response=await fetchImpl(`${root}/${file}`,{signal:controller.signal,cache:'no-store'});
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Local explanation artifacts are unavailable. Run npm run explainability:prepare from the dashboard folder, then retry.');
      return await response.json();
    }catch(error){
      if(controller.signal.aborted){if(signal?.aborted)throw error;throw new Error('Loading the explanation timed out. Retry when the local server is ready.');}
      if(error instanceof TypeError)throw new Error('Could not load the local explanation. Check that the dashboard server is running.');
      throw error;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  return {
    async index(options) {
      const value=await read('index.json',options);
      if(value?.schema_version!==1||!Array.isArray(value.runs)||!value.runs.every(r=>isRunId(r?.run_id)&&count(r.islands)&&percent(r.coverage_percent)&&optionalText(r.algorithm)&&optionalText(r.benchmark))||
        new Set(value.runs.map(r=>r.run_id)).size!==value.runs.length||!Array.isArray(value.errors)||!value.errors.every(e=>isRunId(e?.run_id)&&typeof e.detail==='string'))throw new Error('Unsupported explanation index. Regenerate the local artifacts.');
      return value;
    },
    async run(id,options) {
      if(!isRunId(id))throw new Error('Invalid run ID.');
      const value=await read(`${encodeURIComponent(id)}.json`,options);
      if(value?.schema_version!==1||value.run_id!==id||typeof value.maximising!=='boolean'||!['baseline_fitness','observed_best_fitness','supported_best_fitness'].every(key=>finite(value[key]))||
        !value.coverage||!['total','supported','excluded'].every(key=>count(value.coverage[key]))||!percent(value.coverage.percent)||!Array.isArray(value.warnings)||!value.warnings.every(x=>typeof x==='string')||
        (value.source!=null&&(!optionalText(value.source.algorithm)||!optionalText(value.source.benchmark)||!optionalText(value.source.topology)))||
        !validGame(value.games?.islands)||!validGame(value.games?.routes))throw new Error('The explanation artifact is malformed or belongs to another run. Regenerate it before opening this run.');
      return value;
    },
  };
}
export const explanationClient=createExplanationClient();
