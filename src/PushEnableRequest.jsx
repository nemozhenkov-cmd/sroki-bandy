import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Bell} from 'lucide-react';
import {withDeadline} from './request-timeout.mjs';
import {isStaff} from './roles.mjs';
import {enablePush,pushSupport} from './push-client.mjs';
export default function PushEnableRequest({supabase,user,online,visible=true}){
 const [request,setRequest]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const identity=useRef(''),inFlight=useRef(false);identity.current=[user?.id,user?.store_id,user?.role].join(':');
 const refresh=useCallback(async()=>{
  if(!online||!isStaff(user?.role)||inFlight.current)return;
  const owner=identity.current;inFlight.current=true;
  try{const r=await withDeadline(supabase.functions.invoke('push-notifications',{body:{action:'my-push-request'}}),15000);if(owner===identity.current&&!r.error)setRequest(r.data?.request||null)}catch{}finally{inFlight.current=false}
 },[supabase,user?.id,user?.store_id,user?.role,online]);
 useEffect(()=>{setRequest(null);setMessage('');refresh();const foreground=()=>{if(!document.hidden)refresh()};const enabled=()=>{setRequest(null);refresh()};const timer=setInterval(foreground,60000);document.addEventListener('visibilitychange',foreground);window.addEventListener('push-settings-changed',enabled);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',foreground);window.removeEventListener('push-settings-changed',enabled)}},[refresh]);
 const enable=()=>{
  setMessage('');
  if(!pushSupport()){setMessage('Добавьте приложение на главный экран телефона и откройте оттуда. На iPhone нужна iOS 16.4 или новее. Затем откройте «Профиль → Мои уведомления».');return;}
  setBusy(true);
  enablePush(supabase).then(()=>setRequest(null)).catch(e=>setMessage(e.message||'Не удалось подключить уведомления. Повторите попытку.')).finally(()=>setBusy(false));
 };
 const later=async()=>{setBusy(true);setMessage('');try{const r=await withDeadline(supabase.functions.invoke('push-notifications',{body:{action:'snooze-push-request',request_id:request.id}}),15000);if(r.error||!['snoozed','inactive'].includes(r.data?.request?.status))throw Error();setRequest(null)}catch{setMessage('Не удалось отложить запрос. Проверьте интернет и повторите.')}finally{setBusy(false)}};
 if(!visible||!online||!isStaff(user?.role)||!request)return null;
 return <section className="push-enable-request" aria-labelledby="enable-request-title"><span className="enable-request-icon"><Bell size={23}/></span><div><small>ПРОСЬБА УПРАВЛЯЮЩЕГО</small><h3 id="enable-request-title">Включите уведомления</h3><p>{request.manager_name?`${request.manager_name} просит`:'Управляющий просит'} подключить уведомления, чтобы вы получали рабочие напоминания.</p><div className="enable-request-actions"><button className="primary" disabled={busy} onClick={enable}>{busy?'Подождите…':'Включить уведомления'}</button><button className="secondary" disabled={busy} onClick={later}>Позже</button></div><span className="enable-request-hint">«Позже» — напомним не раньше следующего дня.</span>{message&&<p className="msg" role="status">{message}</p>}</div></section>;
}
