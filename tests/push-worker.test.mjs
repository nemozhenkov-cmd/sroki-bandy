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
