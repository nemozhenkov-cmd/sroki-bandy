import React,{useState} from 'react';
import {MapPin} from 'lucide-react';
import {Mascot} from './Brand.jsx';
import ProfileHub from './ProfileHub.jsx';
import StoreStaff from './StoreStaff.jsx';
import EmployeeManagement from './EmployeeManagement.jsx';
import PushSettings from './PushSettings.jsx';
import {TaskSettings} from './StoreTasks.jsx';
export default function Profile({user,session,stores,onStoresChanged,onLogout,tasks,supabase,initialSection='home'}){
  const [busy,setBusy]=useState(null);
  const [msg,setMsg]=useState('');
  const [showAddStore,setShowAddStore]=useState(false);
  const [newStoreName,setNewStoreName]=useState('');
  const [newStoreAddress,setNewStoreAddress]=useState('');

  const toggleStore=async(store)=>{
    setBusy(store.id);
    setMsg('');

    const {error}=await supabase
      .from('stores')
      .update({is_active:!store.is_active})
      .eq('id',store.id);

    if(error){
      setMsg(error.message);
    }else{
      await onStoresChanged();
    }

    setBusy(null);
  };
const addStore=async()=>{
    const name=newStoreName.trim();
    const address=newStoreAddress.trim();

    if(!name){
      setMsg('Введите название магазина.');
      return;
    }

    if(!address){
      setMsg('Введите адрес магазина.');
      return;
    }

    setBusy('add-store');
    setMsg('');

    const {data:lastStore,error:lastStoreError}=await supabase
  .from('stores')
  .select('id')
  .order('id',{ascending:false})
  .limit(1)
  .maybeSingle();

if(lastStoreError){
  setMsg(lastStoreError.message);
  setBusy(null);
  return;
}

const newId=(lastStore?.id||0)+1;

const {error}=await supabase
  .from('stores')
  .insert({
    id:newId,
    name,
    address,
    is_active:true
  });

    if(error){
      setMsg(error.message);
    }else{
      setNewStoreName('');
      setNewStoreAddress('');
      setShowAddStore(false);
      await onStoresChanged();
      setMsg('Магазин успешно добавлен.');
    }

    setBusy(null);
  };
  const selectedStore=stores.find(s=>s.id===user.store_id);
  const sections={
   staff:()=>user.role==='manager'?<StoreStaff supabase={supabase} user={user}/>:null,
   users:()=>user.role==='admin'?<EmployeeManagement supabase={supabase} user={user} stores={stores} onChanged={onStoresChanged}/>:null,
   tasks:()=>user.role==='manager'?<TaskSettings tasks={tasks} db={supabase} user={user} embedded/>:null,
   push:()=> <PushSettings supabase={supabase} userId={session.user.id} userRole={user.role}/>,
   store:()=> <div className="profile-info-card"><MapPin size={26}/><h3>{selectedStore?.name||'Магазин не назначен'}</h3>{selectedStore?.address&&<p>{selectedStore.address}</p>}<span className="profile-status-pill">{selectedStore?(selectedStore.is_active?'Активный магазин':'Магазин неактивен'):'Обратитесь к администратору'}</span><p className="muted">Для изменения данных магазина обратитесь к администратору приложения.</p></div>,
   stores:()=>user.role==='admin'?<div className="profile-stores">
          <button
            type="button"
            className="primary"
            onClick={()=>{
              setShowAddStore(v=>!v);
              setMsg('');
            }}
            disabled={busy==='add-store'}
            style={{marginBottom:12}}
          >
            ＋ ДОБАВИТЬ МАГАЗИН
          </button>

          {showAddStore && (
            <div
              style={{
                display:'grid',
                gap:8,
                marginBottom:16,
                padding:14,
                border:'1px solid #e5e5e5',
                borderRadius:14,
                background:'#fff'
              }}
            >
              <input
                value={newStoreName}
                onChange={e=>setNewStoreName(e.target.value)}
                placeholder="Название магазина"
                disabled={busy==='add-store'}
              />

              <input
                value={newStoreAddress}
                onChange={e=>setNewStoreAddress(e.target.value)}
                placeholder="Адрес магазина"
                disabled={busy==='add-store'}
              />

              <div style={{display:'flex',gap:8}}>
                <button
                  type="button"
                  className="primary"
                  onClick={addStore}
                  disabled={busy==='add-store'}
                >
                  {busy==='add-store'
                    ?'ДОБАВЛЕНИЕ…'
                    :'ДОБАВИТЬ'
                  }
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={()=>{
                    setShowAddStore(false);
                    setNewStoreName('');
                    setNewStoreAddress('');
                    setMsg('');
                  }}
                  disabled={busy==='add-store'}
                >
                  ОТМЕНА
                </button>
              </div>
            </div>
          )}
          <div className="store-admin-list">
            {stores.map(store=>(
              <div
                key={store.id}
                className="store-admin-row"
              >
                <div>
                  <b>{store.name}</b>

                  <div className="muted">
                    {store.is_active
                      ?'🟢 Активен'
                      :'🔴 Неактивен'
                    }
                  </div>
                </div>

                <button
                  className={store.is_active?'danger':'secondary'}
                  disabled={busy===store.id}
                  onClick={()=>toggleStore(store)}
                >
                  {busy===store.id
                    ?'СОХРАНЕНИЕ…'
                    :store.is_active
                      ?'Сделать неактивным'
                      :'Сделать активным'
                  }
                </button>
              </div>
            ))}
          </div>


   </div>:null,
   help:()=> <div className="profile-help"><div className="profile-info-card"><h3>Нужна помощь?</h3><p>{user.role==='manager'?'Если не получается решить вопрос, обратитесь к автору приложения.':user.role==='admin'?'По вопросам работы приложения обратитесь к его автору.':'По вопросам работы приложения обратитесь к управляющему вашего магазина.'}</p></div><div className="profile-info-card"><h3>Уведомления не приходят</h3><p>Откройте «Мои уведомления», включите их и отправьте проверку. Проверьте разрешения в настройках телефона.</p><p>На iPhone приложение нужно добавить на главный экран и открывать оттуда.</p></div><div className="profile-info-card"><h3>Нет интернета</h3><p>Товары можно добавлять, изменять и списывать без сети. Когда связь появится, отправьте локальные изменения через панель над списком товаров.</p><p>Для изменения настроек и отметки выполнения задач нужен интернет.</p></div></div>,
   about:()=> <div className="profile-info-card profile-about"><Mascot/><h3>КСГ — Чижик</h3><p>Контроль сроков годности</p><span className="profile-status-pill" data-build={__APP_VERSION__}>Версия {__APP_RELEASE__}</span></div>
  };
  return <ProfileHub initialSection={initialSection} user={user} email={session.user.email} stores={stores} tasks={tasks} db={supabase} sections={sections} error={msg} onLogout={async()=>{try{await onLogout()}catch(e){setMsg(e.message||'Не удалось выйти. Проверьте соединение и повторите.')}}}/>;
}
