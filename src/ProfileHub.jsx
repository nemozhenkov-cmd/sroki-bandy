import React,{useEffect,useRef,useState} from 'react';
import {Users,Store,Bell,ListChecks,ChevronRight,ArrowLeft,HelpCircle,Info,LogOut} from 'lucide-react';
import {Mascot} from './Brand.jsx';
import {roleLabel} from './roles.mjs';
const titles={staff:'Сотрудники',users:'Пользователи',tasks:'Задачи и графики',stores:'Магазины',store:'Мой магазин',push:'Мои уведомления',help:'Помощь',about:'О приложении'};
export default function ProfileHub({user,email,stores,tasks,db,sections,onLogout,error}){
 const [pane,setPane]=useState('home'),[visited,setVisited]=useState([]),[summary,setSummary]=useState(null),[leaving,setLeaving]=useState(false);
 const scrolls=useRef({}),heading=useRef(null),lastMenu=useRef(null);const store=stores.find(x=>x.id===user.store_id);
 useEffect(()=>{if(pane!=='home')return;let alive=true;setSummary(null);(async()=>{try{if(user.role==='manager'){const r=await db.functions.invoke('push-notifications',{body:{action:'staff-push-status'}});if(!r.error&&Array.isArray(r.data?.staff)&&alive)setSummary({count:r.data.staff.length,off:r.data.staff.filter(x=>!x.enabled).length})}else if(user.role==='admin'){const r=await db.from('users').select('id',{count:'exact',head:true});if(!r.error&&alive)setSummary({count:r.count})}}catch{}})();return()=>{alive=false}},[pane,user.id,user.role,db]);
 const open=id=>{scrolls.current[pane]=window.scrollY;lastMenu.current=id;setVisited(v=>v.includes(id)?v:[...v,id]);setPane(id);requestAnimationFrame(()=>{window.scrollTo(0,scrolls.current[id]||0);heading.current?.focus({preventScroll:true})})};
 const back=()=>{scrolls.current[pane]=window.scrollY;setPane('home');requestAnimationFrame(()=>{window.scrollTo(0,scrolls.current.home||0);document.getElementById('profile-link-'+lastMenu.current)?.focus({preventScroll:true})})};
 const row=(id,Icon,description,badge)=> <button key={id} id={'profile-link-'+id} className="profile-menu-row" onClick={()=>open(id)}><span className={'profile-menu-icon icon-'+id}><Icon size={22}/></span><span className="profile-menu-copy"><b>{titles[id]}</b><small>{description}</small></span>{badge!==undefined&&badge!==null&&<span className="profile-menu-badge">{badge}</span>}<ChevronRight size={18} className="profile-menu-arrow"/></button>;
 return <section className="page profile-hub">
 <div hidden={pane!=='home'}>
  <div className="profile-identity"><div className="profile-identity-copy"><span className="profile-role">{roleLabel(user.role)}</span><h2>{user.name}</h2>{store&&user.role!=='admin'&&user.role!=='tm'&&<p>{store.name}</p>}<small>{email}</small></div><Mascot className="profile-mascot"/></div>
  {['admin','manager'].includes(user.role)&&<><p className="profile-group-label">Управление</p><div className="profile-menu-group">
   {user.role==='manager'?<>{row('staff',Users,summary?.off?`Без уведомлений: ${summary.off}`:'Роли и уведомления сотрудников',summary?.count)}{row('tasks',ListChecks,'Напоминания и графики 2/2',tasks?.data?(tasks.data.enabled?'Вкл.':'Выкл.'):null)}{row('store',Store,'Информация о вашем магазине')}</>:<>{row('users',Users,'Поиск, роли и назначение магазинов',summary?.count)}{row('stores',Store,'Добавление и доступность магазинов',stores.length)}</>}
  </div></>}
  <p className="profile-group-label">Личные настройки</p><div className="profile-menu-group">{row('push',Bell,user.role==='admin'?'Новые регистрации на вашем телефоне':'Подключение телефона и проверка')}{row('help',HelpCircle,'Подсказки и поддержка')}{row('about',Info,'Версия и информация')}</div>
  <button className="profile-logout" disabled={leaving} onClick={async()=>{setLeaving(true);try{await onLogout()}finally{setLeaving(false)}}}><LogOut size={18}/>{leaving?'Выходим…':'Выйти из аккаунта'}</button>
 </div>
 {pane!=='home'&&<div className="profile-subhead"><button onClick={back} aria-label="Назад в профиль"><ArrowLeft size={20}/>Профиль</button><h2 ref={heading} tabIndex={-1}>{titles[pane]}</h2></div>}
 {visited.map(id=><div className="profile-pane" key={id} hidden={pane!==id}>{sections[id]?.()}</div>)}
 {error&&<p className="msg" role={error.includes('успешно')?'status':'alert'}>{error}</p>}
 </section>
}
