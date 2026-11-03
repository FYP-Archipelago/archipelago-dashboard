import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {build} from 'vite';

test('Explainability renders while the demo run selection is still loading',async()=>{
  await build({configFile:false,logLevel:'silent',build:{ssr:'src/explainability/ExplainabilityPage.jsx',outDir:'.superpowers/startup',emptyOutDir:false}});
  const {default:Page}=await import(new URL('../../.superpowers/startup/ExplainabilityPage.js',import.meta.url));
  for(const runId of [undefined,null]){
    assert.match(renderToString(React.createElement(Page,{runId})),/Loading attribution index/);
  }
});
