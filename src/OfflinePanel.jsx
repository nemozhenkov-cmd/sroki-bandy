import React,{useEffect,useState} from 'react';
import {WifiOff,CloudUpload,AlertTriangle} from 'lucide-react';
import {readOffline,discardLocal} from './offline-store.mjs';
export default function OfflinePanel({owner,online,refresh,storageError,cachedOnly}){
 const [state,setState]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expanded,setExpanded]=useState(false);
 useEffect(()=>{let alive=true;const read=()=>readOffline(owner).then(s=>{if(alive)setState(s)}).catch(()=>{});read();window.addEventListener('offline-data',read);return()=>{alive=false;window.removeEventListener('offline-data',read)}},[owner]);
 const countLabel=n=>`${n} ${n%10===1&&n%100!==11?'действие':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'действия':'действий'}`;
 const queue=state?.queue||[],failures=queue.filter(x=>x.conflict),pendingDisposals=queue.filter(x=>x.kind==='dispose').length;
 // The client is provided by App through refresh.send; never persisted in local storage.
 const submit=async()=>{setBusy(true);setMessage('');try{const r=await refresh.send();setMessage(`Отправлено: ${r.sent}. Осталось: ${r.remaining}.`);await refresh.load()}catch(e){setMessage(e.message)}finally{setBusy(false)}};
 if(online&&!cachedOnly&&!queue.length&&!message&&!storageError)return null;
 return <section className="offline-panel" aria-label="Связь и отправка изменений">
  <div className="offline-summary">{!online?<WifiOff size={17}/>:failures.length?<AlertTriangle size={17}/>:<CloudUpload size={17}/>}<div><b>{!online?'Без интернета':queue.length?'Есть неотправленные изменения':cachedOnly?'Показана сохранённая копия':'Состояние данных'}</b><span>{queue.length?`${countLabel(queue.length)} на телефоне${pendingDisposals?` · списаний: ${pendingDisposals}`:''}`:!online?'Показана сохранённая копия данных':''}</span></div></div>
  {state?.snapshot?.savedAt&&(!online||cachedOnly||queue.length>0)&&<small>Последняя загрузка: {new Date(state.snapshot.savedAt).toLocaleString('ru-RU')}</small>}
  {online&&cachedOnly&&!queue.length&&<button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await refresh.load()}finally{setBusy(false)}}}>Обновить данные</button>}
  {queue.length>0&&<div className="offline-buttons"><button className="offline-send" disabled={!online||busy||!!storageError} onClick={submit}>{busy?'Отправляем…':'Отправить изменения'}</button><button className="secondary" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>Подробнее</button></div>}
  {expanded&&<div className="offline-queue">{queue.map(op=><article key={op.id}><b>{op.row.products?.name||'Товар'}</b><span>{op.kind==='add'?'Добавление':op.kind==='dispose'?'Списание':'Изменение'} · {op.row.quantity} шт. · до {op.row.expiry_date}</span>{op.conflict&&<><p>{op.conflict.message}</p>{op.conflict.item&&<p>В базе: {op.conflict.item.is_disposed?'списан':`${op.conflict.item.quantity} шт. · до ${op.conflict.item.expiry_date}`}</p>}<p>Ваш вариант сохранён выше. Можно оставить данные базы, затем внести нужную правку заново.</p><button disabled={busy} className="secondary" onClick={async()=>{if(!window.confirm('Оставить данные базы и удалить все локальные изменения этой партии?'))return;setBusy(true);try{await discardLocal(owner,op.item_id);setMessage('Локальный вариант удалён. Оставлены данные базы.');await refresh.load()}catch(e){setMessage(e.message)}finally{setBusy(false)}}}>Оставить данные базы</button></>}</article>)}</div>}
  {storageError&&<p role="alert">{storageError}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
