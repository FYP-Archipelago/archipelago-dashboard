import test from 'node:test';
import assert from 'node:assert/strict';
import {placeBestLabel} from './best-labels.js';

test('overlapping best nodes retain separate labels inside the offset canvas',()=>{
  for(const anchor of [[600,580],[302,5],[899,599]]){
    const bounds={x:300,y:0,width:600,height:600},boxes=[];
    for(let i=0;i<6;i++){
      const b=placeBestLabel(anchor,bounds,boxes);
      assert.ok(b.x>=bounds.x&&b.x+b.width<=bounds.x+bounds.width);
      assert.ok(b.y>=bounds.y&&b.y+b.height<=bounds.y+bounds.height);
      assert.ok(boxes.every(a=>b.x+b.width<=a.x||a.x+a.width<=b.x||b.y+b.height<=a.y||a.y+a.height<=b.y));
      boxes.push(b);
    }
  }
});
