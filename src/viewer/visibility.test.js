import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationVisible, MIGRATION_VISIBILITY_DEFAULTS } from './visibility.js';
test('migrations for hidden islands or filtered paths are hidden by default',()=>{
  assert.equal(MIGRATION_VISIBILITY_DEFAULTS.includeHiddenPaths,false);
  assert.equal(migrationVisible({}),true);
  for(const flag of ['sourceVisible','targetVisible','sourcePathVisible','targetPathVisible'])assert.equal(migrationVisible({[flag]:false}),false);
});
test('explicit hidden-path opt-in preserves route switches',()=>{
  assert.equal(migrationVisible({sourceVisible:false,targetPathVisible:false,includeHiddenPaths:true}),true);
  assert.equal(migrationVisible({routeEnabled:false,includeHiddenPaths:true}),false);
});
