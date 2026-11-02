export const catalog={overrides:{
  num_islands:{type:'int',min:4,max:6},evaluation_budget:{type:'int',min:1000,max:250000},target_generations:{type:'int',min:2},
  'migration.enabled':{type:'bool'},'migration.topology':{type:'choice',choices:['ring','torus']},'migration.interval':{type:'int',min:1},seed:{type:'int',min:0,max:4294967295,optional:true},
},presets:[{preset:'de_rastrigin',algorithm:'de',benchmark:'shifted_rotated',description:'Five islands explore Rastrigin.',defaults:{num_islands:5,evaluation_budget:100000,target_generations:200,'migration.enabled':true,'migration.topology':'ring','migration.interval':20}}]};
