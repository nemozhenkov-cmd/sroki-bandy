import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTION_WIDTH,swipeIntent,swipeOffset,shouldOpen} from '../src/swipe-gesture.mjs';
test('vertical scrolling and small accidental movements never start a swipe',()=>{
 assert.equal(swipeIntent(2,24),'scroll');
 assert.equal(swipeIntent(-8,3),'pending');
 assert.equal(swipeIntent(-30,8),'swipe');
});
test('card stays within action bounds and can swipe closed in reverse',()=>{
 assert.equal(swipeOffset(0,-300),-ACTION_WIDTH);
 assert.equal(swipeOffset(0,50),0);
 assert.equal(swipeOffset(-ACTION_WIDTH,300),0);
});
test('short swipe snaps closed; cancellation cannot expose or trigger disposal',()=>{
 assert.equal(shouldOpen(-30),false);
 assert.equal(shouldOpen(-100),true);
 assert.equal(shouldOpen(-156,true),false);
});
