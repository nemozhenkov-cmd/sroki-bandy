import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function install(html,failAssets=false){
 let callback,task;const assets=[],pages=[];
 const cache={addAll:async urls=>{assets.push(...urls);if(failAssets)throw Error('network lost')},put:async url=>pages.push(url)};
 const response={ok:true,clone:()=>({text:async()=>html})};
 const self={location:{href:'https://example.test/sroki-bandy/sw.js?v=test',origin:'https://example.test'},addEventListener:(name,fn)=>{if(name==='install')callback=fn}};
 vm.runInNewContext(source,{self,URL,caches:{open:async()=>cache},fetch:async()=>response});
 callback({waitUntil:p=>task=p});return {task,assets,pages};
}
test('offline installation precaches the actual script, stylesheet and all mascot poses',async()=>{
 const w=install('<script src="/sroki-bandy/assets/app-123.js"></script><link href="/sroki-bandy/assets/style-123.css">');await w.task;
 assert.ok(w.assets.includes('https://example.test/sroki-bandy/assets/app-123.js'));
 assert.ok(w.assets.includes('https://example.test/sroki-bandy/assets/style-123.css'));
 assert.ok(w.assets.includes('/sroki-bandy/brand/mascot-welcome.webp'));
 assert.deepEqual(w.pages,['/sroki-bandy/','/sroki-bandy/index.html']);
});
test('missing script or incomplete download prevents activation of an incomplete offline shell',async()=>{
 await assert.rejects(install('<html>No script</html>').task,/script missing/);
 const w=install('<script src="/sroki-bandy/assets/app.js"></script>',true);await assert.rejects(w.task,/network lost/);assert.deepEqual(w.pages,[]);
});
