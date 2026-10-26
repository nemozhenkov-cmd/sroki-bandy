// Pure queue rules. Every request keeps its UUID until the server acknowledges it.
export const revision = x => Object.fromEntries(['product_id','store_id','expiry_date','quantity','note','is_disposed','updated_at'].map(k=>[k,x[k]??null]));
export function project(state){
 const rows=new Map((state?.snapshot?.items||[]).map(x=>[x.id,{...x}]));
 for(const op of state?.queue||[]){
  const old=rows.get(op.item_id)||{};
  rows.set(op.item_id,{...old,...op.row,_pending:true,_conflict:!!op.conflict});
 }
 return [...rows.values()].filter(x=>!x.is_disposed).sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date));
}
export function append(state,op){
 const previous=[...(state.queue||[])].reverse().find(x=>x.item_id===op.item_id)?.row || state.snapshot.items.find(x=>x.id===op.item_id);
 return {...state,queue:[...state.queue,{...op,expected:op.expected!==undefined?op.expected:previous?revision(previous):null}]};
}
export function acknowledge(state,op,result){
 if(!state.queue.some(x=>x.id===op.id))return state;
 const queue=state.queue.filter(x=>x.id!==op.id);
 const next=queue.find(x=>x.item_id===op.item_id);
 // Rebase only the next dependent local action, never an unrelated remote edit.
 if(next)next.expected=revision(result.item);
 const items=state.snapshot.items.filter(x=>x.id!==op.item_id);
 items.push({...op.row,...result.item,_pending:false,_conflict:false});
 const products=state.snapshot.products.filter(x=>x.barcode!==result.item.products?.barcode);
 if(result.item.products)products.push(result.item.products);
 return {...state,queue,snapshot:{...state.snapshot,items,products}};
}
export function discardConflict(state,itemId){
 const failed=state.queue.find(x=>x.item_id===itemId&&x.conflict);
 if(!failed)throw new Error('Сначала повторите отправку: результат этой операции ещё неизвестен.');
 const items=state.snapshot.items.filter(x=>x.id!==itemId&&x.id!==failed.conflict.item?.id);
 if(failed.conflict.item)items.push(failed.conflict.item);
 return {...state,queue:state.queue.filter(x=>x.item_id!==itemId),snapshot:{...state.snapshot,items}};
}

export async function deliverQueue({read,update,deliver}){
 let sent=0;const blocked=new Set();
 const initial=await read();
 for(const original of initial?.queue||[]){
  const state=await read(),op=state?.queue.find(x=>x.id===original.id);
  if(!op||blocked.has(op.item_id))continue;
  if(op.conflict){blocked.add(op.item_id);continue;}
  const result=await deliver(op);
  if(result?.status==='applied'&&result.item?.id){
   await update(s=>acknowledge(s,op,result));sent++;
  }else if(['conflict','rejected'].includes(result?.status)){
   await update(s=>({...s,queue:s.queue.map(x=>x.id===op.id?{...x,conflict:result}:x)}));blocked.add(op.item_id);
  }else throw new Error('Сервер не подтвердил сохранение. Повторите отправку.');
 }
 return {sent,remaining:(await read())?.queue.length||0};
}

// These PostgreSQL errors guarantee transaction rollback. Network/timeouts do not.
export function serverResult(response){
 if(!response.error)return response.data;
 if(['22P02','22003','23502','23503','23505','23514','42501','P0001'].includes(response.error.code))return {status:'rejected',message:response.error.code==='P0001'?response.error.message:'База не приняла изменение. Проверьте количество, дату и доступ к магазину. Локальный вариант сохранён.'};
 throw new Error(response.error.message);
}
