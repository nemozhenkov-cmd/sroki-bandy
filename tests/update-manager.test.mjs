import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/main.jsx', import.meta.url),'utf8');
function emitter(extra={}) {
  const listeners=new Map();
  return Object.assign(extra,{
    addEventListener(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},
    removeEventListener(n,f){listeners.get(n)?.delete(f)},
    emit(n){for(const f of listeners.get(n)||[])f()}
  });
}
async function harness({waiting=false,installing=false}={}) {
  let cleanup,effect,checks=0,reloads=0;const ready=[],errors=[];
  const worker=emitter({state:'installing'});
  const registration=emitter({waiting:waiting?worker:null,installing:installing?worker:null,update:async()=>{checks++}});
  const sw=emitter({controller:{},register:async(url,options)=>{assert.equal(url,'/sroki-bandy/sw.js');assert.equal(options.updateViaCache,'none');return registration}});
  const window=emitter({setInterval:()=>1,clearInterval(){},location:{reload(){reloads++}}});
  const document=emitter({visibilityState:'visible'});let states=0;
  let body=source.slice(source.indexOf('function UpdateManager()'),source.indexOf('createRoot(document.getElementById'));
  body=body.replaceAll('import.meta.env.PROD','true').replaceAll('import.meta.env.BASE_URL',"'/sroki-bandy/'").replace('return <UpdateScreen onApply={applyUpdate} error={updateError}/>;','return null;');
  vm.runInNewContext(body+'\nUpdateManager();',{
    useState:initial=>[initial,states++===0?v=>ready.push(v):v=>errors.push(v)],
    useRef:v=>({current:v}),useEffect:f=>{effect=f},navigator:{serviceWorker:sw},window,document,console
  });
  cleanup=effect();await new Promise(r=>setImmediate(r));
  return {registration,worker,window,document,ready,cleanup,checks:()=>checks,reloads:()=>reloads,sw};
}
test('cached startup discovers an existing waiting update',async()=>{
 const h=await harness({waiting:true});assert.deepEqual(h.ready,[true]);assert.ok(h.checks()>=1);h.cleanup();
});
test('installation already in progress before register resolves still opens update screen',async()=>{
 const h=await harness({installing:true});assert.deepEqual(h.ready,[]);
 h.worker.state='installed';h.registration.waiting=h.worker;h.worker.emit('statechange');assert.deepEqual(h.ready,[true]);h.cleanup();
});
test('reconnect and return to foreground check again; cleanup removes handlers',async()=>{
 const h=await harness();const n=h.checks();h.window.emit('online');h.document.emit('visibilitychange');assert.equal(h.checks(),n+2);
 h.cleanup();h.window.emit('online');h.document.emit('visibilitychange');assert.equal(h.checks(),n+2);
});
test('controller replacement reloads only once',async()=>{
 const h=await harness();h.sw.emit('controllerchange');h.sw.emit('controllerchange');assert.equal(h.reloads(),1);h.cleanup();
});
