import {append,project,discardConflict,revision,deliverQueue,serverResult} from './offline-core.mjs';
import {withDeadline} from './request-timeout.mjs';
const DB='sroki-offline-v1',OWNER='sroki-offline-owner';
let opening;
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(DB):null;
const notify=()=>{window.dispatchEvent(new Event('offline-data'));channel?.postMessage('changed')};
if(channel)channel.onmessage=()=>window.dispatchEvent(new Event('offline-data'));
function db(){
 if(typeof indexedDB==='undefined')return Promise.reject(new Error('Хранилище телефона недоступно в этом браузере. Откройте приложение в обычном режиме.'));
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('accounts',{keyPath:'owner'});
  request.onsuccess=()=>{const value=request.result;value.onversionchange=()=>{value.close();opening=null};resolve(value)};
  request.onerror=()=>{opening=null;reject(new Error('Не удалось открыть хранилище телефона. Освободите место и повторите.'))};
  request.onblocked=()=>{opening=null;reject(new Error('Закройте другие вкладки приложения и повторите.'))};
 });
 return opening;
}
async function transact(owner,update){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('accounts',update?'readwrite':'readonly'),store=tx.objectStore('accounts');
  let value,failure;
  const req=store.get(owner);
  req.onsuccess=()=>{try{value=req.result;if(update){const generation=(value?.generation||0)+1;value=update(value);value.generation=generation;store.put(value)}}catch(e){failure=e;tx.abort()}};
  tx.oncomplete=()=>{if(update)notify();resolve(value)};
  tx.onerror=tx.onabort=()=>reject(failure||new Error('Не удалось сохранить на телефоне. Изменение не принято. Проверьте свободное место.'));
 });
}
export const readOffline=owner=>transact(owner);
export function rememberedOwner(){try{return localStorage.getItem(OWNER)}catch{return null}}
export function forgetOwner(){try{localStorage.removeItem(OWNER)}catch{}}
export async function cacheSnapshot(owner,snapshot,expectedGeneration){
 let skipped=false;
 const result=await transact(owner,old=>{if(expectedGeneration!==undefined&&(old?.generation||0)!==expectedGeneration){skipped=true;return old;}return {owner,snapshot:{...snapshot,savedAt:new Date().toISOString()},queue:old?.queue||[]}});
 try{localStorage.setItem(OWNER,owner)}catch{}
 return {...result,cacheSkipped:skipped};
}
export const pendingCount=async owner=>(await readOffline(owner))?.queue.length||0;
export async function queueChange(owner,kind,row,base){
 const op={id:crypto.randomUUID(),kind,item_id:row.id,row,expected:kind==='add'?null:revision(base),createdAt:new Date().toISOString()};
 await transact(owner,state=>{if(!state?.snapshot?.user)throw new Error('Сначала загрузите приложение с интернетом.');if(kind!=='add'){const current=project(state).find(x=>x.id===row.id);if(!current||JSON.stringify(revision(current))!==JSON.stringify(revision(base)))throw new Error('Карточка уже изменилась. Закройте её и откройте заново.');}return append(state,op)});
 navigator.storage?.persist?.().catch(()=>{});
 return op;
}
export async function discardLocal(owner,itemId){return transact(owner,s=>discardConflict(s,itemId))}
export async function clearOffline(owner){
 const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('accounts','readwrite');const store=tx.objectStore('accounts'),req=store.get(owner);req.onsuccess=()=>{if(req.result?.queue.length){tx.abort();return;}store.delete(owner)};tx.oncomplete=resolve;tx.onabort=()=>reject(new Error('Сначала отправьте локальные изменения.'));tx.onerror=()=>reject(tx.error)});forgetOwner();notify();
}
const syncing=new Map();
export function sendQueue(supabase,owner){
 if(syncing.has(owner))return syncing.get(owner);
 const task=async()=>{
  if(!navigator.onLine)throw new Error('Нет связи. Изменения сохранены на телефоне.');
  const {data,error}=await withDeadline(supabase.auth.getUser(),30000);
  if(error||data.user?.id!==owner)throw new Error('Для отправки войдите в ту же учётную запись. Локальные изменения сохранены.');
  return deliverQueue({read:()=>readOffline(owner),update:fn=>transact(owner,fn),deliver:async op=>{
   const controller=new AbortController();
   const response=await withDeadline(Promise.resolve(supabase.rpc('sync_offline_operation',{
    operation_id:op.id,operation_kind:op.kind,item_id:op.item_id,expected:op.expected,desired:op.row
   }).abortSignal(controller.signal)),45000,'Не удалось подтвердить отправку. Повторите её: дубли не появятся.',()=>controller.abort());
   return serverResult(response);
  }});
 };
 const run=()=>navigator.locks?navigator.locks.request(`${DB}-sync-${owner}`,task):task();
 const promise=run().finally(()=>syncing.delete(owner));syncing.set(owner,promise);return promise;
}
export {project};
