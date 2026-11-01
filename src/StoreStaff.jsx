import React,{useEffect,useState} from 'react';
import {roleLabel,isStaff} from './roles.mjs';
export default function StoreStaff({supabase,user}) {
 const [rows,setRows]=useState([]),[draft,setDraft]=useState({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(null),[message,setMessage]=useState(''),[success,setSuccess]=useState(false);
 const [query,setQuery]=useState(''),[roleFilter,setRoleFilter]=useState('all'),[notificationFilter,setNotificationFilter]=useState('all');
 const [pushStatus,setPushStatus]=useState({}),[pushError,setPushError]=useState(false),[pushChecking,setPushChecking]=useState(true);
 const load=async()=>{
  setLoading(true);setPushStatus({});setPushError(false);setPushChecking(true);
  try{
   const {data,error}=await supabase.from('users').select('id,name,role,store_id').eq('store_id',user.store_id).in('role',['rtz','srtz','srtz_rtz']).order('name');
   if(error)throw error;
   const staff=(data||[]).filter(x=>x.store_id===user.store_id&&isStaff(x.role)&&x.id!==user.id);
   // Status lookup must not block the staff list or role controls.
   supabase.functions.invoke('push-notifications',{body:{action:'staff-push-status'}}).then(push=>{
    if(push.error||!Array.isArray(push.data?.staff))setPushError(true);
    else setPushStatus(Object.fromEntries(push.data.staff.map(x=>[x.user_id,x.enabled])));
   }).catch(()=>setPushError(true)).finally(()=>setPushChecking(false));
   setRows(staff);setDraft(Object.fromEntries(staff.map(x=>[x.id,x.role==='srtz'?'srtz':'rtz'])));return true;
  }catch(e){setRows([]);setSuccess(false);setMessage(e.message||'Не удалось загрузить сотрудников.');return false;}finally{setLoading(false);}
 };
 useEffect(()=>{load()},[user.id,user.store_id]);
 const save=async employee=>{
  setBusy(employee.id);setMessage('');setSuccess(false);
  try{
   const {error}=await supabase.rpc('manager_set_staff_role',{p_user_id:employee.id,p_role:draft[employee.id]});
   if(error)throw error;
   if(await load()){setSuccess(true);setMessage('Роль сотрудника сохранена.');}
  }catch(e){setMessage(e.message||'Не удалось изменить роль.');}finally{setBusy(null);}
 };
 const filtered=rows.filter(x=>(x.name||'').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))&&(roleFilter==='all'||(x.role==='srtz'?'srtz':'rtz')===roleFilter)&&(notificationFilter==='all'||(notificationFilter==='on'?pushStatus[x.id]===true:pushStatus[x.id]===false)));
 if(user.role!=='manager')return null;
 return <section className="store-staff" aria-labelledby="store-staff-title">
  <div className="staff-heading"><h3 id="store-staff-title">Сотрудники магазина</h3><button type="button" className="link" disabled={loading||!!busy} onClick={()=>{setMessage('');load()}}>Обновить</button></div>
  <p className="muted">Новые сотрудники получают РТЗ. Назначьте СРТЗ тем, кто работает старшим.</p>
  <div className="profile-filters"><input type="search" aria-label="Поиск сотрудника" placeholder="Найти сотрудника" value={query} onChange={e=>setQuery(e.target.value)}/><div><select aria-label="Фильтр по роли" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">Все роли</option><option value="rtz">РТЗ</option><option value="srtz">СРТЗ</option></select><select aria-label="Фильтр по уведомлениям" value={notificationFilter} onChange={e=>setNotificationFilter(e.target.value)}><option value="all">Все уведомления</option><option value="on">Включены</option><option value="off">Выключены</option></select></div></div>
  {!loading&&<p className="profile-results" role="status">Найдено {filtered.length} из {rows.length}</p>}
  {loading&&!rows.length?<p role="status">Загрузка сотрудников…</p>:filtered.length?<div className="staff-list">{filtered.map(employee=><article className="staff-card" key={employee.id}>
   <b>{employee.name||'Без имени'}</b><span className="muted">Сейчас: {roleLabel(employee.role)}</span>
   <span className={'staff-push-status '+(pushStatus[employee.id]===true?'push-on':pushStatus[employee.id]===false?'push-off':'push-unknown')}>{pushStatus[employee.id]===true?'● Уведомления включены':pushStatus[employee.id]===false?'○ Уведомления выключены':pushChecking?'Проверяем уведомления…':'? Статус уведомлений недоступен'}</span>
   <div className="staff-controls"><label>Роль<select aria-label={`Роль: ${employee.name}`} value={draft[employee.id]} disabled={!!busy} onChange={e=>setDraft({...draft,[employee.id]:e.target.value})}><option value="rtz">РТЗ</option><option value="srtz">СРТЗ</option></select></label><button type="button" className="primary" disabled={!!busy||draft[employee.id]===(employee.role==='srtz'?'srtz':'rtz')} onClick={()=>save(employee)}>{busy===employee.id?'Сохраняем…':'Сохранить'}</button></div>
  </article>)}</div>:<p>{rows.length?'По выбранным фильтрам сотрудников нет. Измените поиск или фильтры.':'В вашем магазине пока нет сотрудников РТЗ / СРТЗ.'}</p>}
  {!loading&&rows.length>0&&<p className="muted staff-push-hint">{pushError?'Не удалось проверить уведомления. Нажмите «Обновить».':'«Включены» — подключено хотя бы одно устройство. Блокировку в настройках телефона проверить удалённо нельзя. Статусы обновляются кнопкой «Обновить».'}</p>}
  {message&&<p role={success?'status':'alert'} className={'msg'+(success?' staff-success':'')}>{message}</p>}
 </section>;
}
