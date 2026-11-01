import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker() {
  const events={},notifications=[],opened=[];
  const self={location:{href:'https://example.test/sroki-bandy/sw.js?v=test',origin:'https://example.test'},addEventListener:(type,callback)=>events[type]=callback,registration:{showNotification:async(title,options)=>notifications.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
  vm.runInNewContext(source,{self,URL});
  return {events,notifications,opened};
}
test('background push always displays notification and handles invalid JSON',async()=>{
  const w=worker();let task;
  w.events.push({data:{json:()=>{throw Error('invalid');}},waitUntil:p=>task=p});await task;
  assert.equal(w.notifications[0].title,'Сроки годности');
  assert.ok(w.notifications[0].options.body);
});
test('notification click opens only this app, ignoring payload navigation',async()=>{
  const w=worker();let task,closed=false;
  w.events.notificationclick({notification:{data:{url:'https://evil.test/'},close:()=>closed=true},waitUntil:p=>task=p});await task;
  assert.ok(closed);assert.deepEqual(w.opened,['https://example.test/sroki-bandy/']);
});
test('root and public worker copies stay identical',()=>assert.equal(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),source));

test('task push exposes two safe actions; malformed capability cannot enable buttons',async()=>{
 const w=worker();let pending;const payload={type:'store-task',task:{id:2,day:'2026-11-01',token:'a'.repeat(64)},body:'Пятиминутка'};
 w.events.push({data:{json:()=>payload},waitUntil:p=>pending=p});await pending;
 assert.deepEqual(Array.from(w.notifications[0].options.actions,x=>x.action),['task-done','task-snooze']);
 payload.task.token='invalid';w.events.push({data:{json:()=>payload},waitUntil:p=>pending=p});await pending;assert.equal(w.notifications[1].options.actions,undefined);
});
test('task action confirms server result without opening app; failed action opens safe task fallback',async()=>{
 for(const fail of [false,true]){
  const events={},shown=[],opened=[],requests=[];const self={location:{origin:'https://example.test',href:'https://example.test/sroki-bandy/sw.js'},addEventListener:(n,f)=>events[n]=f,registration:{showNotification:async(...x)=>shown.push(x)},clients:{matchAll:async()=>[],openWindow:async x=>opened.push(x)}};
  vm.runInNewContext(source,{self,URL,AbortSignal,fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});if(fail)throw Error('offline');return{ok:true,json:async()=>({status:'snoozed'})}}});let pending;
  events.notificationclick({action:'task-snooze',notification:{data:{task:{id:2,day:'2026-11-01',token:'a'.repeat(64)}},close(){}},waitUntil:p=>pending=p});await pending;
  assert.equal(requests[0].body.operation,'snooze');assert.equal(opened.length,fail?1:0);if(fail){assert.equal(shown.length,1);assert.equal(opened[0],'https://example.test/sroki-bandy/?view=tasks&task=2&day=2026-11-01')}
 }
});
