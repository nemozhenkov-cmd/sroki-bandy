import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserMultiFormatReader} from '@zxing/browser';
import {BarcodeFormat, DecodeHintType} from '@zxing/library';
import {createClient} from '@supabase/supabase-js';
import {Camera, Search, Plus, PackageCheck, AlertTriangle, Clock3, LogOut, History, BarChart3, UserRound, X, Check, Trash2, RefreshCw, MapPin, ChevronDown, ChevronRight, List, Pencil} from 'lucide-react';
import './styles.css';
import OfflinePanel from './OfflinePanel.jsx';
import {readOffline,rememberedOwner,cacheSnapshot,queueChange,sendQueue,pendingCount,clearOffline,project} from './offline-store.mjs';
import {ACTION_WIDTH,swipeIntent,swipeOffset,shouldOpen} from './swipe-gesture.mjs';
import {Wordmark,Mascot,LoadingScreen,UpdateScreen,DateFields} from './Brand.jsx';
import {daysLeft, statusFor} from './expiry-status.mjs';
import ExpiryCalculator from './ExpiryCalculator.jsx';
import PushSettings from './PushSettings.jsx';
import {disablePush} from './push-client.mjs';
import {withDeadline, queryWithDeadline} from './request-timeout.mjs';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL, supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey):null;
const STORES=[{id:'163',name:'Видова 163В'},{id:'190',name:'Видова 190А'}];
const fmt=d=>d?new Intl.DateTimeFormat('ru-RU').format(new Date(d+'T00:00:00')):'';
function statusText(date){const d=daysLeft(date);return d===1?'Списать сегодня · Остался 1 день':d===0?'Просрочено':d<0?`Просрочен на ${Math.abs(d)} ${plural(Math.abs(d),['день','дня','дней'])}`:`Осталось ${d} ${plural(d,['день','дня','дней'])}`}
function plural(n,a){n=Math.abs(n)%100;let n1=n%10;return n>10&&n<20?a[2]:n1>1&&n1<5?a[1]:n1===1?a[0]:a[2]}
function localDate(){return new Date().toISOString().slice(0,10)}

function App(){
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[tab,setTab]=useState('home'),[store,setStore]=useState('all'),[q,setQ]=useState(''),[filter,setFilter]=useState('all'),[items,setItems]=useState([]),[products,setProducts]=useState([]),[stores,setStores]=useState(STORES),[user,setUser]=useState(null),[edit,setEdit]=useState(null),[disposeOnly,setDisposeOnly]=useState(false),[scanner,setScanner]=useState(false),[error,setError]=useState('');
const [recoveryMode,setRecoveryMode]=useState(
  ()=>window.location.hash.includes('type=recovery')||
     window.location.search.includes('type=recovery')
);
const [confirmationMessage,setConfirmationMessage]=useState(false);
const [recommendations,setRecommendations]=useState([]);
const [online,setOnline]=useState(navigator.onLine),[storageError,setStorageError]=useState(''),[cachedOnly,setCachedOnly]=useState(false);
const accountRef=useRef(null),sessionRef=useRef(null),dataLoadsRef=useRef(new Map());
const restore=async(uid,activate=false)=>{
 const state=await readOffline(uid);
 if(!state?.snapshot?.user||(!activate&&accountRef.current!==uid)||(activate&&accountRef.current&&accountRef.current!==uid))return false;
 accountRef.current=uid;setItems(project(state));setProducts([...state.snapshot.products,...state.queue.filter(x=>x.kind==='add').map(x=>x.row.products)]);setUser(state.snapshot.user);setStores(state.snapshot.stores);
 if(state.snapshot.user.role!=='admin')setStore(state.snapshot.user.store_id);
 return true;
};
const commit=async(kind,row,base)=>{
 if(storageError)throw new Error(storageError);
 const owner=accountRef.current;if(!owner)throw new Error('Сначала загрузите профиль.');
 const before=await pendingCount(owner);
 await queueChange(owner,kind,row,base);await restore(owner);
 if(navigator.onLine&&before===0){
  sendQueue(supabase,owner).then(()=>restore(owner)).catch(e=>{if(accountRef.current===owner)setError('Сохранено на телефоне. '+e.message)});
 }
};
useEffect(()=>{
 const status=()=>{setOnline(navigator.onLine);if(navigator.onLine&&accountRef.current)loadData(accountRef.current)};
 const changed=()=>{if(accountRef.current)restore(accountRef.current).catch(e=>setStorageError(e.message))};
 window.addEventListener('online',status);window.addEventListener('offline',status);window.addEventListener('offline-data',changed);
 return()=>{window.removeEventListener('online',status);window.removeEventListener('offline',status);window.removeEventListener('offline-data',changed)};
},[]);



const load=async()=>{
  if(!supabase){
    setLoading(false);
    return;
  }


  try{
    setError('');
    const cachedOwner=rememberedOwner();
    if(cachedOwner){
      try{if(await withDeadline(restore(cachedOwner,true),1500)){
        setCachedOnly(true);setSession({user:{id:cachedOwner},offline:true});setLoading(false);
      }}catch{/* Local storage cannot hold the startup screen indefinitely. */}
    }
    if(!navigator.onLine){
      setCachedOnly(true);const owner=rememberedOwner();
      if(owner&&await restore(owner,true)){setSession({user:{id:owner},offline:true});return;}
      throw new Error('Для первого входа и загрузки товаров нужен интернет.');
    }

    const {data:{session},error:sessionError}=await withDeadline(
      supabase.auth.getSession(),
      30000
    );

    if(sessionError) throw sessionError;

    sessionRef.current=session;setSession(session);

    if(session){
      await loadData(session.user.id);
    }
  }catch(err){
    console.error('Ошибка загрузки приложения:',err);
    const owner=rememberedOwner();
    let restored=false;try{restored=!!owner&&await restore(owner,true)}catch{}
    if(restored){setCachedOnly(true);setSession({user:{id:owner},offline:true});}
    setError(restored?'Показана сохранённая копия. Проверьте связь перед отправкой.':err?.message||'Не удалось загрузить данные. Попробуйте ещё раз.');
  }finally{
    setLoading(false);
  }
};



const loadData=(uid,token)=>{
  if(dataLoadsRef.current.has(uid))return dataLoadsRef.current.get(uid);
  const task=performLoadData(uid,token).finally(()=>dataLoadsRef.current.delete(uid));
  dataLoadsRef.current.set(uid,task);return task;
};
const performLoadData=async(uid,token)=>{
  accountRef.current=uid;
  if(!navigator.onLine){setCachedOnly(true);try{if(await restore(uid))return;}catch(e){setStorageError(e.message)}setError('Нет сохранённых данных. Подключитесь к интернету.');return;}

  const queryTimeout=(label,query)=>queryWithDeadline(label,query);

  try{
    let activeSession=sessionRef.current;
    if(!token&&(!activeSession?.access_token||activeSession.user.id!==uid)){
      const result=await withDeadline(supabase.auth.getSession(),30000);
      if(result.error)throw result.error;activeSession=result.data.session;
      sessionRef.current=activeSession;
    }
    const accessToken=token||activeSession?.access_token;
    if(!accessToken)throw new Error('Для обновления данных войдите в приложение с интернетом.');
    // Data reads use the already obtained token, never re-enter Auth initialization/refresh.
    const reader=createClient(supabaseUrl,supabaseKey,{accessToken:async()=>accessToken});
    const fetchGeneration=(await withDeadline(readOffline(uid),1500).catch(()=>null))?.generation||0;
    console.log('[Контроль СГ] Начало загрузки данных');

    const [
      {data:it},
      {data:p},
      {data:u},
      {data:s}
    ]=await Promise.all([
      queryTimeout(
        'Сроки годности',
        reader.from('expiry_items')
          .select('*,products(*),stores(*),created:created_by(name),updated:updated_by(name)')
          .eq('is_disposed',false)
          .order('expiry_date')
      ),
      queryTimeout(
        'Справочник товаров',
        reader.from('products').select('*')
      ),
      queryTimeout(
        'Профиль пользователя',
        reader.from('users').select('*')
          .eq('id',uid).maybeSingle()
      ),
      queryTimeout(
        'Список магазинов',
        reader.from('stores').select('*').order('name')
      )
    ]);

    if(accountRef.current!==uid)return;
    try{
      const cached=await cacheSnapshot(uid,{items:it||[],products:p||[],user:u,stores:s||[]},fetchGeneration);
      if(cached.cacheSkipped){await restore(uid);return;}
      setCachedOnly(false);
      setStorageError('');setItems(project(cached));
    }catch(e){setStorageError(e.message);setItems(it||[])}
    setProducts(p||[]);
    try{const cached=await readOffline(uid);if(cached?.queue.length)setProducts([...(p||[]),...cached.queue.filter(x=>x.kind==='add').map(x=>x.row.products)])}catch{}
    setUser(u);

    if(u && (u.role==='manager'||u.role==='srtz_rtz')){
      supabase.rpc('get_store_recommendations')
        .then(({data,error})=>{
          if(error){
            console.error('[Контроль СГ] Рекомендации:',error);
            setRecommendations([]);
          }else{
            setRecommendations(data||[]);
          }
        })
        .catch(err=>console.error('[Контроль СГ] Рекомендации:',err));
    }else{
      setRecommendations([]);
    }

    if(u && u.role!=='admin' && u.store_id){
      setStore(u.store_id);
    }

    if(u){
      supabase.rpc('touch_user_activity')
        .then(({error})=>{
          if(error) console.error('[Контроль СГ] Активность:',error);
        })
        .catch(err=>console.error('[Контроль СГ] Активность:',err));
    }

    if(s?.length) setStores(s);

    console.log('[Контроль СГ] Все основные данные загружены');
  }catch(err){
    console.error('[Контроль СГ] Ошибка загрузки:',err);
    try{if(await restore(uid))setCachedOnly(true)}catch{}
    setError(err?.message||'Не удалось загрузить данные.');
  }
};


useEffect(()=>{
  if(!supabase){
    load();
    return;
  }

  load();
  let reloadTimer;

  const {data:{subscription}}=supabase.auth.onAuthStateChange(
    (_event,newSession)=>{
      if(
        _event==='SIGNED_IN'&&
        window.location.hash.includes('type=signup')
      ){
        setConfirmationMessage(true);
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }

      if(
        _event==='PASSWORD_RECOVERY' ||
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('type=recovery')
      ){
        setRecoveryMode(true);
      }

      if(!newSession&&!navigator.onLine&&accountRef.current)return;
      if(newSession&&accountRef.current&&accountRef.current!==newSession.user.id){accountRef.current=newSession.user.id;setUser(null);setItems([]);setProducts([]);setStores([])}
      sessionRef.current=newSession;setSession(newSession);

      // Первичную загрузку выполняет load().
      // Остальные события авторизации обрабатываем здесь.
      if(_event!=='INITIAL_SESSION'&&newSession){
        clearTimeout(reloadTimer);
        reloadTimer=setTimeout(()=>loadData(newSession.user.id,newSession.access_token),0);
      }
    }
  );

  const ch=supabase
    .channel('expiry-sync')
    .on(
      'postgres_changes',
      {
        event:'*',
        schema:'public',
        table:'expiry_items'
      },
      async ()=>{
        const {data:{session:currentSession}}=
          await supabase.auth.getSession();

        if(currentSession){
          loadData(currentSession.user.id);
        }
      }
    )
    .subscribe();

  return()=>{
    clearTimeout(reloadTimer);
    subscription.unsubscribe();
    supabase.removeChannel(ch);
  };
},[]);


if(loading)return <Splash/>;
if(error&&!session&&!navigator.onLine)return <div className="center"><h1>Нет связи</h1><p>{error}</p><button className="primary" onClick={()=>{setLoading(true);load()}}>Повторить</button></div>;
if(!supabase)return <Setup/>;
if(error && session && !user)return (
  <div className="center">
    <h1>Не удалось загрузить приложение</h1>
    <p>{error}</p>
    <button className="primary" onClick={()=>{
      setError('');
      setLoading(true);
      load();
    }}>
      ПОВТОРИТЬ
    </button>
  </div>
);

if(confirmationMessage)return (
  <div className="auth">
    <Wordmark/>
    <h1>Почта подтверждена</h1>
    <p>Почта подтверждена, вернитесь в приложение для продолжения.</p>
    <button className="primary" onClick={()=>setConfirmationMessage(false)}>
      ПРОДОЛЖИТЬ
    </button>
  </div>
);
if(recoveryMode)return <PasswordRecovery onDone={()=>{
  setRecoveryMode(false);
  setSession(null);
}}/>;
if(!session)return <Auth/>;
if(!user)return <Onboard session={session} onDone={()=>loadData(session.user.id)}/>;
const visibleStores=user?.role==='admin'
  ?stores
  :user?.store_id
    ?stores.filter(s=>s.id===user.store_id && s.is_active)
    :[];
 const filtered=items.filter(x=>store==='all'||x.store_id===store).filter(x=>{const st=statusFor(x.expiry_date);return filter==='all'||st===filter}).filter(x=>{const s=(x.products?.name+' '+(x.products?.brand||'')+' '+x.products?.barcode).toLowerCase();return s.includes(q.toLowerCase())});
 const counts={today:items.filter(x=>statusFor(x.expiry_date)==='today'&&(store==='all'||x.store_id===store)).length,expired:items.filter(x=>statusFor(x.expiry_date)==='expired'&&(store==='all'||x.store_id===store)).length,soon:items.filter(x=>statusFor(x.expiry_date)==='soon'&&(store==='all'||x.store_id===store)).length,ok:items.filter(x=>statusFor(x.expiry_date)==='ok'&&(store==='all'||x.store_id===store)).length};

 return (
  <div className={`app ${tab === 'add' ? 'adding-product' : tab === 'home' ? 'home-screen' : ''}`}>
<header className="app-header"><Wordmark/></header>
 <OfflinePanel owner={user.id} online={online} cachedOnly={cachedOnly} storageError={storageError} refresh={{send:()=>sendQueue(supabase,user.id),load:async()=>{if(navigator.onLine)await loadData(user.id);else await restore(user.id)}}}/>

 {tab==='home'&&<><section className="home-hero"><div className="hero-copy"><h1>Сроки<br/>под контролем</h1><div className="store-picker"><MapPin size={18}/><select aria-label="Магазин" value={store} onChange={e=>setStore(e.target.value)}>{user.role==='admin'&&<option value="all">Все магазины</option>}{visibleStores.map(s=><option key={s.id} value={s.id}>{s.name}{!s.is_active?' · Неактивен':''}</option>)}</select><ChevronDown size={16}/></div></div><Mascot className="hero-mascot"/></section>{(user.role==='manager'||user.role==='srtz_rtz')&&recommendations.length>0&&(
  <button
    className="recommend-button"
    onClick={()=>setTab('recommendations')}
  >
    🟡 РЕКОМЕНДУЕМ ПРОВЕРИТЬ
  </button>
)}<div className="stats"><Stat n={counts.expired} t="Просрочено" c="expired" selected={filter==='expired'} on={()=>setFilter('expired')}/><Stat n={counts.today} t="Списать сегодня" c="today" selected={filter==='today'} on={()=>setFilter('today')}/><Stat n={counts.soon} t="Скоро истекает" c="soon" selected={filter==='soon'} on={()=>setFilter('soon')}/><Stat n={counts.ok} t="В порядке" c="ok" selected={filter==='ok'} on={()=>setFilter('ok')}/></div><div className="search"><Search size={20}/><input value={q} onChange={e=>setQ(e.target.value)} aria-label="Поиск товара или штрихкода" placeholder="Название или штрихкод"/>{q&&<button className="search-clear" aria-label="Очистить поиск" onClick={()=>setQ('')}><X size={18}/></button>}</div><div className="list-head"><b>{filter==='all'?'Все товары':filter==='expired'?'Просрочено':filter==='today'?'Списать сегодня':filter==='soon'?'Скоро истекает':'В порядке'}</b><button onClick={()=>setFilter('all')}>Сбросить</button></div><div className="list">{filtered.length?<SwipeItems items={filtered} onEdit={x=>{setDisposeOnly(false);setEdit(x)}} onDispose={x=>{setDisposeOnly(true);setEdit(x)}}/>:<Empty/>}</div></>}
 {tab==='add'&&<Add stores={visibleStores} products={products} user={user} items={items} onCommit={commit} onClose={()=>setTab('home')} onSaved={()=>{loadData(user.id);setTab('home')}}/>}
{tab==='recommendations'&&(
  <section className="recommendations">

    <div className="recommendation-header">
      <div>
        <b>Рекомендуем проверить</b>
      </div>

      <button
        className="recommendation-back"
        onClick={()=>setTab('home')}
      >
        ← НАЗАД
      </button>
    </div>

    <p className="recommendation-subtitle">
      Товары из других магазинов с ближайшим сроком годности.
    </p>

    <div className="recommendation-list">
      {recommendations.map((item,index)=>(
        <div className="recommendation-card" key={index}>

          <div className="recommendation-product">
            {item.product_name}
          </div>

          {item.brand&&(
            <div className="recommendation-brand">
              {item.brand}
            </div>
          )}

          <div className="recommendation-info">
            <span>Срок годности</span>
            <b>
              {item.expiry_date.split('-').reverse().join('.')}
            </b>
          </div>

          <div className="recommendation-info">
            <span>Магазин</span>
            <b>
              {item.store_names.join(', ')}
            </b>
          </div>

        </div>
      ))}
    </div>

  </section>
)}
 {tab==='stats'&&!online&&<section className="page"><h2>Статистика</h2><p>Для отчёта по общей базе подключитесь к интернету. Сохранённый список товаров доступен на главном экране.</p></section>}{tab==='stats'&&online&&<Stats
  items={items}
  stores={visibleStores}
  user={user}
/>} {tab==='history'&&(!online?<section className="page"><h2>История</h2><p>История общей базы доступна с интернетом. Неотправленные действия — в разделе «Подробнее» над списком.</p></section>:<HistoryView/>)} {tab==='profile'&&!online&&<section className="page"><h2>Профиль</h2><p>{user.name}</p><p>Настройки профиля и магазинов доступны при подключении к интернету.</p></section>}{tab==='profile'&&online&&(
  <Profile
    user={user}
    session={session}
    stores={stores}
    onStoresChanged={()=>loadData(user.id)}
    onLogout={async()=>{if(await pendingCount(user.id))throw new Error('Сначала отправьте локальные изменения. Они ещё не сохранены в общей базе.');await disablePush(supabase);await clearOffline(user.id);accountRef.current=null;const r=await supabase.auth.signOut();if(r.error)throw r.error;setUser(null);setItems([]);}}
  />
)}<nav aria-label="Основная навигация"><button className={tab==='home'?'sel':''} onClick={()=>setTab('home')}><List/>Список</button><button className={tab==='stats'?'sel':''} onClick={()=>setTab('stats')}><BarChart3/>Статистика</button><button className="add" aria-label="Добавить товар" onClick={()=>setTab('add')}><Plus/></button><button className={tab==='history'?'sel':''} onClick={()=>setTab('history')}><History/>История</button><button className={tab==='profile'?'sel':''} onClick={()=>setTab('profile')}><UserRound/>Профиль</button></nav>{edit&&<Edit x={edit} onCommit={commit} disposeOnly={disposeOnly} stores={visibleStores} onClose={()=>setEdit(null)} onSaved={()=>{loadData(user.id);setEdit(null)}}/>}
{error&&<div className="toast">{error}<X onClick={()=>setError('')}/></div>}
</div>
 );
}
function Splash(){return <LoadingScreen/>;}function Setup(){return <div className="center"><h1>КОНТРОЛЬ СГ</h1><p>Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env</p></div>}
function Auth(){
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [name,setName]=useState('');
  const [reg,setReg]=useState(false);
  const [recover,setRecover]=useState(false);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const friendlyError=(error)=>{
    const m=(error?.message||'').toLowerCase();

    if(m.includes('invalid login credentials'))
      return 'Неверная почта или пароль.';
    if(m.includes('email not confirmed'))
      return 'Почта ещё не подтверждена. Откройте письмо и подтвердите адрес.';
    if(m.includes('user already registered'))
      return 'Аккаунт с такой почтой уже существует. Попробуйте войти или восстановить пароль.';
    if(m.includes('password should be at least'))
      return 'Пароль слишком короткий. Используйте не менее 6 символов.';
    if(m.includes('unable to validate email address'))
      return 'Проверьте правильность адреса электронной почты.';
    if(m.includes('rate limit'))
      return 'Слишком много попыток. Подождите немного и попробуйте снова.';

    return error?.message||'Не удалось выполнить действие. Попробуйте ещё раз.';
  };

  const go=async()=>{
    const cleanEmail=email.trim();

    setMsg('');

    if(!cleanEmail){
      setMsg('Введите адрес электронной почты.');
      return;
    }

    if(!recover&&!pass){
      setMsg('Введите пароль.');
      return;
    }

    if(reg&&!name.trim()){
      setMsg('Введите фамилию и имя.');
      return;
    }

    setBusy(true);

    try{
      if(recover){
        const {error}=await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo:window.location.origin+import.meta.env.BASE_URL+'?type=recovery'
          }
        );

        if(error){
          setMsg(friendlyError(error));
        }else{
          setMsg('Если аккаунт с этой почтой существует, на неё придёт письмо со ссылкой для восстановления пароля.');
        }

        return;
      }

      const r=reg
        ?await supabase.auth.signUp({
            email:cleanEmail,
            password:pass,
            options:{
              data:{name:name.trim()},
              emailRedirectTo:window.location.origin+import.meta.env.BASE_URL
            }
          })
        :await supabase.auth.signInWithPassword({
            email:cleanEmail,
            password:pass
          });

      if(r.error){
        setMsg(friendlyError(r.error));
      }else if(reg){
        if(r.data?.session){
          setMsg('Регистрация выполнена.');
        }else{
          setMsg('Проверьте почту и подтвердите адрес. Затем вернитесь в приложение.');
        }
      }
    }catch(e){
      setMsg(friendlyError(e));
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <Wordmark/>

      <Mascot className="auth-mascot"/>
      <h1>Сроки под контролем</h1>
      <p>{recover?'Восстановите доступ к аккаунту':reg?'Создайте аккаунт для работы':'Войдите, чтобы начать работу'}</p>

      {reg&&!recover&&
        <input
          aria-label="Фамилия и имя" placeholder="Фамилия и Имя"
          value={name}
          onChange={e=>setName(e.target.value)}
        />
      }

      <input
        type="email"
        aria-label="Email" autoComplete="email" placeholder="Email"
        value={email}
        onChange={e=>setEmail(e.target.value)}
      />

      {!recover&&
        <input
          type="password"
          aria-label="Пароль" autoComplete={reg?'new-password':'current-password'} placeholder="Пароль"
          value={pass}
          onChange={e=>setPass(e.target.value)}
        />
      }

      <button
        className="primary"
        onClick={go}
        disabled={busy}
      >
        {busy
          ?'ПОДОЖДИТЕ...'
          :recover
            ?'ОТПРАВИТЬ ССЫЛКУ'
            :reg
              ?'СОЗДАТЬ АККАУНТ'
              :'ВОЙТИ'}
      </button>

      {msg&&<p className="msg">{msg}</p>}

      {!reg&&!recover&&
        <button
          className="link"
          onClick={()=>{
            setRecover(true);
            setMsg('');
          }}
        >
          Забыли пароль?
        </button>
      }

      {recover&&
        <button
          className="link"
          onClick={()=>{
            setRecover(false);
            setMsg('');
          }}
        >
          Вернуться ко входу
        </button>
      }

      {!recover&&
        <button
          className="link"
          onClick={()=>{
            setReg(!reg);
            setMsg('');
          }}
        >
          {reg?'У меня уже есть аккаунт':'Создать аккаунт'}
        </button>
      }

      <div className="auth-author">
        Автор: Неможенко В. 2787320
      </div>
    </div>
  );
}
function PasswordRecovery({onDone}){
  const [pass,setPass]=useState('');
  const [confirmPass,setConfirmPass]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const save=async()=>{
    setMsg('');

    if(pass.length<6){
      setMsg('Пароль должен содержать не менее 6 символов.');
      return;
    }

    if(pass!==confirmPass){
      setMsg('Пароли не совпадают.');
      return;
    }

    setBusy(true);

    try{
      const {error}=await supabase.auth.updateUser({password:pass});

      if(error){
        setMsg(error.message);
        return;
      }

      await supabase.auth.signOut();
      setMsg('Пароль изменён. Теперь войдите с новым паролем.');

      setTimeout(()=>{
        onDone();
      },1500);
    }catch(e){
      setMsg(e?.message||'Не удалось изменить пароль.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <Wordmark/>
      <h1>Новый пароль</h1>
      <p>Придумайте новый пароль для входа.</p>

      <input
        type="password"
        placeholder="Новый пароль"
        value={pass}
        onChange={e=>setPass(e.target.value)}
      />

      <input
        type="password"
        placeholder="Повторите новый пароль"
        value={confirmPass}
        onChange={e=>setConfirmPass(e.target.value)}
      />

      <button className="primary" onClick={save} disabled={busy}>
        {busy?'СОХРАНЕНИЕ...':'СОХРАНИТЬ ПАРОЛЬ'}
      </button>

      {msg&&<p className="msg">{msg}</p>}
    </div>
  );
}


function Onboard({session,onDone}){
  const [name,setName]=useState(session.user.user_metadata?.name||'');
  const [store,setStore]=useState('');
  const [stores,setStores]=useState([]);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  useEffect(()=>{
    (async()=>{
      const {data,error}=await supabase
        .from('stores')
        .select('*')
        .eq('is_active',true)
        .order('name');

      if(error){
        setMsg('Не удалось загрузить магазины: '+error.message);
        return;
      }

      const activeStores=data||[];
      setStores(activeStores);

      if(activeStores.length){
        setStore(String(activeStores[0].id));
      }
    })();
  },[]);

  const save=async()=>{
    const cleanName=name.trim();

    if(!cleanName){
      setMsg('Введите имя сотрудника.');
      return;
    }

    if(!store){
      setMsg('Выберите магазин.');
      return;
    }

    setBusy(true);
    setMsg('');

    try{
      const check=await supabase
        .from('users')
        .select('id')
        .eq('id',session.user.id)
        .maybeSingle();

      if(check.error)throw check.error;

      let r;

      if(check.data){
        r=await supabase
          .from('users')
          .update({
            name:cleanName,
            store_id:store
          })
          .eq('id',session.user.id)
          .select()
          .single();
      }else{
        r=await supabase
          .from('users')
          .insert({
            id:session.user.id,
            name:cleanName,
            store_id:store,
            role:'srtz_rtz'
          })
          .select()
          .single();
      }

      if(r.error)throw r.error;

      onDone();

    }catch(e){
      setMsg(
        'Не удалось сохранить профиль: '+
        (e?.message||'неизвестная ошибка')
      );
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <Wordmark/>

      <h2>Профиль сотрудника</h2>

      <input
        placeholder="Имя"
        value={name}
        onChange={e=>setName(e.target.value)}
      />

      <select
        value={store}
        onChange={e=>setStore(e.target.value)}
        disabled={!stores.length}
      >
        {!stores.length ? (
          <option value="">
            Нет доступных магазинов
          </option>
        ) : (
          <>
            <option value="">
              Выберите магазин
            </option>

            {stores.map(s=>(
              <option
                key={s.id}
                value={s.id}
              >
                {s.name}
              </option>
            ))}
          </>
        )}
      </select>

      <button
        className="primary"
        disabled={busy||!stores.length}
        onClick={save}
      >
        {busy?'СОХРАНЕНИЕ…':'СОХРАНИТЬ'}
      </button>

      {msg&&<p className="msg">{msg}</p>}
    </div>
  );
}
const statusLabels={expired:'Просрочено',today:'Списать сегодня',soon:'Скоро истекает',ok:'В порядке'};
function Stat({n,t,c,on,selected}){return <button className={'stat '+c+(selected?' selected':'')} onClick={on} aria-pressed={selected}><b>{n}</b><span>{t}</span>{selected&&<Check size={12} className="stat-check"/>}</button>;}
function SwipeItems({items,onEdit,onDispose}){
 const [open,setOpen]=useState(null),root=useRef(null);
 useEffect(()=>{const close=e=>{if(!root.current?.contains(e.target))setOpen(null)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
 useEffect(()=>{setOpen(null)},[items]);
 return <div className="swipe-list" ref={root}>{items.map(x=><SwipeItem key={x.id} x={x} open={open===x.id} onOpen={()=>setOpen(x.id)} onClose={()=>setOpen(null)} onEdit={()=>{setOpen(null);onEdit(x)}} onDispose={()=>{setOpen(null);onDispose(x)}}/>)}</div>;
}
function SwipeItem({x,open,onOpen,onClose,onEdit,onDispose}){
 const start=useRef(null),suppress=useRef(false),[drag,setDrag]=useState(null);
 const width=ACTION_WIDTH;
 const finish=e=>{const g=start.current;if(!g||g.id!==e.pointerId)return;start.current=null;if(g.horizontal){suppress.current=true;if(shouldOpen(g.offset,e.type==='pointercancel'))onOpen();else onClose()}setDrag(null)};
 const gestureProps={
  onPointerDown:e=>{if(!e.isPrimary||e.button!==0)return;suppress.current=false;start.current={id:e.pointerId,x:e.clientX,y:e.clientY,base:open?-width:0,offset:open?-width:0,horizontal:false}},
  onPointerMove:e=>{const g=start.current;if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.horizontal){const intent=swipeIntent(dx,dy);if(intent==='scroll'){start.current=null;return}if(intent==='pending')return;g.horizontal=true;e.currentTarget.setPointerCapture(e.pointerId)}g.offset=swipeOffset(g.base,dx);setDrag(g.offset)},
  onPointerUp:finish,onPointerCancel:finish,
  onKeyDown:e=>{if(e.key==='ArrowLeft'){e.preventDefault();onOpen()}if(e.key==='Escape'||e.key==='ArrowRight')onClose()},
  'aria-expanded':open,'aria-label':`${x.products?.name||'Товар'}. Свайп влево или стрелка влево — действия`
 };
 return <div className={'swipe-item'+(open?' is-open':'')+(drag!==null?' is-dragging':'')}>
  <div className="swipe-actions" aria-hidden={!open} inert={!open?true:undefined}><button className="swipe-edit" onClick={onEdit}><Pencil size={20}/><span>Изменить</span></button><button className="swipe-dispose" onClick={onDispose}><Trash2 size={20}/><span>Списать</span></button></div>
  <Item x={x} gestureProps={gestureProps} style={{transform:`translateX(${drag??(open?-width:0)}px)`}} onClick={()=>{if(suppress.current){suppress.current=false;return}if(open)onClose();else onEdit()}}/>
 </div>;
}
function Item({x,onClick,gestureProps={},style}){
  const s=statusFor(x.expiry_date);
  return <button {...gestureProps} style={style} className={'item '+s+(x._pending?' pending-item':'')} onClick={onClick} title={x.products?.name}>
    <div className="itemmain">
      <h3>{x.products?.name||'Без названия'}</h3>{x._pending&&<small className={'pending-mark'+(x._conflict?' conflict':'')}>{x._conflict?'Нужно проверить':'Не отправлено'}</small>}
      <div className="item-details">
        <div><span className={'status-badge '+s}>{s==='expired'?<AlertTriangle size={13}/>:s==='ok'?<Check size={13}/>:<Clock3 size={13}/>} {statusLabels[s]}</span><strong>Годен до <b>{fmt(x.expiry_date)}</b></strong></div>
        <span className="item-quantity">{x.quantity} <small>шт.</small></span><ChevronRight size={18} className="item-chevron"/>
      </div>
    </div>
  </button>;
}
function Empty(){return <div className="empty"><Mascot/><b>Ничего не найдено</b><span>Попробуйте изменить фильтр<br/>или добавить товар.</span></div>;}
function Add({stores,products,user,items,onCommit,onClose,onSaved}){
 const [barcode,setBarcode]=useState(''),
 [name,setName]=useState(''),
 [brand,setBrand]=useState(''),
 [expiry,setExpiry]=useState(localDate()),
 [qty,setQty]=useState(1),
 [store,setStore]=useState(user.store_id),
 [note,setNote]=useState(''),
 [busy,setBusy]=useState(false),
 [msg,setMsg]=useState(''),
 [duplicate,setDuplicate]=useState(null),
 [scanning,setScanning]=useState(false),
 videoRef=useRef(null),
 scannerRef=useRef(null);

 useEffect(
  ()=>()=>{scannerRef.current?.stop?.();scannerRef.current?.reset?.();scannerRef.current=null},
  []
 );

 const months=[
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь'
 ];

 const expiryParts=expiry
  ? expiry.split('-')
  : localDate().split('-');

 const expiryYear=expiryParts[0]||String(new Date().getFullYear());
 const expiryMonth=expiryParts[1]||String(new Date().getMonth()+1).padStart(2,'0');
 const expiryDay=expiryParts[2]||String(new Date().getDate()).padStart(2,'0');

 const daysInMonth=new Date(
  Number(expiryYear),
  Number(expiryMonth),
  0
 ).getDate();

 const updateExpiry=(day,month,year)=>{
  let d=Number(day);
  const maxDay=new Date(
   Number(year),
   Number(month),
   0
  ).getDate();

  if(d>maxDay)d=maxDay;

  setExpiry(
   `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  );
 };

 const scan=async()=>{
  setMsg('');

  if(!window.isSecureContext){
    setMsg('Камера доступна только через HTTPS или localhost.');
    return;
  }

  if(!navigator.mediaDevices?.getUserMedia){
    setMsg('Браузер не предоставляет доступ к камере. Используйте Chrome или Samsung Internet.');
    return;
  }

  try{
    try{scannerRef.current?.stop?.()}catch{}
    try{scannerRef.current?.reset?.()}catch{}
    scannerRef.current=null;

    const hints=new Map();

    hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E
      ]
    );

    hints.set(DecodeHintType.TRY_HARDER,true);

    const reader=new BrowserMultiFormatReader(hints);
    scannerRef.current=reader;

    setScanning(true);

    await new Promise(resolve=>{
      requestAnimationFrame(()=>{
        requestAnimationFrame(resolve);
      });
    });

    if(!videoRef.current){
      throw new Error('Не удалось подготовить окно камеры.');
    }

    /*
     * ГЛАВНОЕ:
     * Сначала строго запрашиваем ЗАДНЮЮ камеру.
     * exact: environment не позволяет браузеру
     * самостоятельно выбрать фронтальную.
     */
    const rearConstraints={
      audio:false,
      video:{
        facingMode:{
          exact:'environment'
        },
        width:{
          ideal:1280
        },
        height:{
          ideal:720
        }
      }
    };

    let controls;

    try{

      controls=await reader.decodeFromConstraints(
        rearConstraints,
        videoRef.current,
        (result,error)=>{
          if(!result)return;

          const code=result.getText().trim();
          if(!code)return;

          try{controls?.stop?.()}catch{}
          try{reader.reset()}catch{}

          scannerRef.current=null;
          setScanning(false);
          setBarcode(code);

          find(code);
        }
      );

    }catch(rearError){

      console.warn(
        'Не удалось открыть заднюю камеру через exact environment:',
        rearError
      );

      /*
       * Второй вариант.
       *
       * Получаем список камер и ищем только те,
       * которые браузер помечает как задние.
       */
      let devices=[];

      try{
        devices=await navigator.mediaDevices.enumerateDevices();
      }catch{}

      const cameras=devices.filter(
        device=>device.kind==='videoinput'
      );

      console.log('Камеры устройства:',cameras);

      /*
       * Никогда не берём камеру вслепую.
       * Сначала ищем rear/back/environment.
       */
      const rearCamera=cameras.find(camera=>{
        const label=(camera.label||'').toLowerCase();

        return(
          label.includes('back') ||
          label.includes('rear') ||
          label.includes('environment')
        );
      });

      if(!rearCamera?.deviceId){
        throw rearError;
      }

      controls=await reader.decodeFromConstraints(
        {
          audio:false,
          video:{
            deviceId:{
              exact:rearCamera.deviceId
            },
            width:{
              ideal:1280
            },
            height:{
              ideal:720
            }
          }
        },
        videoRef.current,
        (result,error)=>{
          if(!result)return;

          const code=result.getText().trim();
          if(!code)return;

          try{controls?.stop?.()}catch{}
          try{reader.reset()}catch{}

          scannerRef.current=null;
          setScanning(false);
          setBarcode(code);

          find(code);
        }
      );
    }

    scannerRef.current=controls;

  }catch(e){
    console.error('Scanner error:',e);

    try{scannerRef.current?.stop?.()}catch{}
    try{scannerRef.current?.reset?.()}catch{}

    scannerRef.current=null;
    setScanning(false);

    const m=e?.message||'';

    if(
      m.toLowerCase().includes('permission') ||
      m.toLowerCase().includes('notallowed') ||
      m.toLowerCase().includes('denied')
    ){
      setMsg(
        'Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера.'
      );
    }else{
      setMsg('Не удалось запустить камеру: '+m);
    }
  }
};
 const find=async(rawCode)=>{
  const code=String(rawCode||'').replace(/\D/g,'');
  setBarcode(code);
  setMsg('Ищем товар…');

  const own=products.find(
   p=>String(p.barcode||'').replace(/\D/g,'')===code
  );

  if(own){
   setName(own.name||'');
   setBrand(own.brand||'');
   setMsg('Товар найден в нашей базе');
   return;
  }

  if(!navigator.onLine){setName('');setBrand('');setMsg('Нет связи — введите название вручную.');return;}
  setBusy(true);

  try{
   const r=await fetch(
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?fields=code,product_name,brands`,
    {
     headers:{
      Accept:'application/json'
     }
    }
   );

   const j=await r.json();
   const product=j?.product;
   const productName=product?.product_name||'';
   const brand=product?.brands||'';

   if(productName.trim()){
    setName(productName.trim());
    setBrand(brand.trim());
    setMsg('Товар найден в Open Food Facts');
   }else{
    setName('');
    setBrand('');
    setMsg('Товар не найден — введите название вручную');
   }

  }catch(error){
   console.error('Open Food Facts error:',error);
   setName('');
   setBrand('');
   setMsg('Не удалось выполнить поиск — введите название вручную');
  }finally{
   setBusy(false);
  }
 };


const makeRow=(id,product,quantity,old={})=>({...old,id,product_id:product.id,products:product,store_id:store,stores:stores.find(s=>s.id===store),expiry_date:expiry,quantity,note,created_by:old.created_by||user.id,updated_by:user.id,is_disposed:false,created:old.created||{name:user.name}});
const save=async()=>{
 if(!barcode||!name.trim()||!expiry)return setMsg('Заполните штрихкод, название и срок.');
 if(!Number.isInteger(Number(qty))||Number(qty)<1||Number(qty)>2147483647)return setMsg('Количество должно быть целым числом от 1 до 2147483647.');
 if(!store)return setMsg('Выберите магазин.');
 const cleanBarcode=String(barcode).replace(/\D/g,'');
 if(!cleanBarcode)return setMsg('Укажите штрихкод цифрами.');
 const product=products.find(p=>String(p.barcode||'').replace(/\D/g,'')===cleanBarcode)||{id:crypto.randomUUID(),barcode:cleanBarcode,name:name.trim(),brand};
 const existing=items.find(x=>x.products?.barcode===cleanBarcode&&x.store_id===store&&x.expiry_date===expiry);
 if(existing){setDuplicate({id:existing.id,currentQuantity:Number(existing.quantity),newQuantity:Number(qty),name,expiry,note,product});return;}
 setBusy(true);setMsg('');
 try{await onCommit('add',makeRow(crypto.randomUUID(),product,Number(qty)));onSaved()}catch(e){setMsg(e.message)}finally{setBusy(false)}
};
const finishDuplicate=async(action)=>{
 if(!duplicate)return;
 if(action==='cancel'){setDuplicate(null);setMsg('');return;}
 const current=items.find(x=>x.id===duplicate.id);
 if(!current){setDuplicate(null);setMsg('Партия уже недоступна. Повторите добавление.');return;}
 if(Number(current.quantity)!==duplicate.currentQuantity){setDuplicate({...duplicate,currentQuantity:Number(current.quantity)});setMsg('Количество изменилось. Проверьте его ещё раз.');return;}
 setBusy(true);setMsg('');
 try{await onCommit('update',makeRow(current.id,current.products,action==='sum'?Number(current.quantity)+duplicate.newQuantity:duplicate.newQuantity,current),current);setDuplicate(null);onSaved()}catch(e){setMsg(e.message)}finally{setBusy(false)}
};
 return (
  <section className="sheet">

   <div className="sheethead">
    <h2>Добавить товар</h2>
    <button className="close-button" aria-label="Закрыть" onClick={onClose}>
     <X/>
    </button>
   </div>

   <div className={'form-notice'+(msg?' has-message':'')} role="status">
     {msg||'Введите штрихкод или воспользуйтесь камерой.'}
   </div>

   <button
    className="scan"
    onClick={scan}
   >
    <Camera/>
    СКАНИРОВАТЬ ШТРИХКОД
   </button>

   {scanning&&(
    <div className="scanner">

     <div className="scanner-video">
      <video
       ref={videoRef}
       autoPlay
       playsInline
       muted
      />

      <div className="scanner-frame"></div>
     </div>

     <div className="scanner-hint">
      Наведите камеру на штрихкод
     </div>

     <button
      onClick={()=>{
       const controls=scannerRef.current;

       try{
        controls?.stop?.();
       }catch{}

       try{
        controls?.reset?.();
       }catch{}

       scannerRef.current=null;
       setScanning(false);
      }}
     >
      ОТМЕНА
     </button>

    </div>
   )}

   <input
    value={barcode}
    onChange={e=>setBarcode(e.target.value)}
    onBlur={()=>barcode&&find(barcode)}
    aria-label="Штрихкод EAN" placeholder="Штрихкод EAN"
    inputMode="numeric"
   />

   <input
    value={name}
    onChange={e=>setName(e.target.value)}
    aria-label="Название товара" placeholder="Название товара"
   />

   <input
    value={brand}
    onChange={e=>setBrand(e.target.value)}
    aria-label="Бренд" placeholder="Бренд (необязательно)"
   />

   <ExpiryCalculator onApply={setExpiry}/>

   <label>
    Годен до

    <div
     style={{
      display:'grid',
      gridTemplateColumns:'1fr 1.5fr 1fr',
      gap:8,
      marginTop:6
     }}
    >

     <select
      aria-label="День окончания срока" value={expiryDay}
      onChange={e=>updateExpiry(
       e.target.value,
       expiryMonth,
       expiryYear
      )}
     >
      {Array.from(
       {length:daysInMonth},
       (_,i)=>i+1
      ).map(day=>(
       <option
        key={day}
        value={String(day).padStart(2,'0')}
       >
        {String(day).padStart(2,'0')}
       </option>
      ))}
     </select>

     <select
      aria-label="Месяц окончания срока" value={expiryMonth}
      onChange={e=>updateExpiry(
       expiryDay,
       e.target.value,
       expiryYear
      )}
     >
      {months.map((month,index)=>(
       <option
        key={index+1}
        value={String(index+1).padStart(2,'0')}
       >
        {month}
       </option>
      ))}
     </select>

     <select
      aria-label="Год окончания срока" value={expiryYear}
      onChange={e=>updateExpiry(
       expiryDay,
       expiryMonth,
       e.target.value
      )}
     >
      {[...new Set([Number(expiryYear),...Array.from(
       {length:6},
       (_,i)=>new Date().getFullYear()+i
      )])].sort((a,b)=>a-b).map(year=>(
       <option
        key={year}
        value={year}
       >
        {year}
       </option>
      ))}
     </select>

    </div>
   </label>

   <label>
    Количество
    <input
     type="number"
     min="1"
     value={qty}
     onChange={e=>setQty(+e.target.value)}
    />
   </label>

   <label>
    Магазин
    <select
     value={store}
     onChange={e=>setStore(e.target.value)}
    >
     {stores.map(s=>(
      <option
       key={s.id}
       value={s.id}
      >
       {s.name}
      </option>
     ))}
    </select>
   </label>

   <textarea
    value={note}
    onChange={e=>setNote(e.target.value)}
    placeholder="Комментарий (необязательно)"
   />

   <button
    className="primary"
    disabled={busy}
    onClick={save}
   >
    {busy?'СОХРАНЕНИЕ…':'СОХРАНИТЬ'}
   </button>
    {duplicate&&(
      <div className="modal">
        <div className="dialog">
          <h2>Товар уже добавлен</h2>

          <p><b>{duplicate.name}</b></p>

          <p>
            Срок годности: {
              duplicate.expiry.split('-').reverse().join('.')
            }
          </p>

          <p>Текущее количество: {duplicate.currentQuantity}</p>
          <p>Новое количество: {duplicate.newQuantity}</p>

          <button
            className="primary"
            disabled={busy}
            onClick={()=>finishDuplicate('sum')}
          >
            Суммировать: {duplicate.currentQuantity} + {duplicate.newQuantity} = {
              duplicate.currentQuantity+duplicate.newQuantity
            }
          </button>

          <button
            className="secondary"
            disabled={busy}
            onClick={()=>finishDuplicate('replace')}
          >
            Заменить: {duplicate.newQuantity}
          </button>

          <button
            className="secondary"
            disabled={busy}
            onClick={()=>finishDuplicate('cancel')}
          >
            Отказаться
          </button>
        </div>
      </div>
    )}

   </section>
 );
}

function Edit({x,stores,onClose,onSaved,onCommit,disposeOnly=false}){const [expiry,setExpiry]=useState(x.expiry_date),[qty,setQty]=useState(x.quantity),[store,setStore]=useState(x.store_id),[note,setNote]=useState(x.note||''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const save=async()=>{
 if(!Number.isInteger(Number(qty))||Number(qty)<1||Number(qty)>2147483647){setMsg('Количество должно быть целым числом от 1 до 2147483647.');return;}
 setBusy(true);setMsg('');try{await onCommit('update',{...x,expiry_date:expiry,quantity:Number(qty),store_id:store,stores:stores.find(s=>s.id===store),note},x);onSaved()}catch(e){setMsg(e.message)}finally{setBusy(false)}
 };
 const dispose=async()=>{setBusy(true);setMsg('');try{await onCommit('dispose',{...x,is_disposed:true},x);onSaved()}catch(e){setMsg(e.message)}finally{setBusy(false)}};
 if(disposeOnly)return <div className="modal"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dispose-title"><div className="sheethead"><h2 id="dispose-title">Списать товар?</h2><button className="close-button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X/></button></div><p className="dispose-name">{x.products?.name||'Без названия'}</p><p>Будет списано: <b>{x.quantity} шт.</b></p><div className="dispose-actions"><button className="secondary" autoFocus disabled={busy} onClick={onClose}>Отмена</button><button className="danger" disabled={busy} onClick={dispose}><Trash2 size={18}/>{busy?'Списываем…':'Списать'}</button></div>{msg&&<p className="msg" role="alert">{msg}</p>}</div></div>;
 return <div className="modal"><div className="dialog"><div className="sheethead"><h2>{x.products?.name}</h2><button className="close-button" aria-label="Закрыть" onClick={onClose}><X/></button></div><div className="item-info"><b>{statusText(x.expiry_date)}</b><span>EAN {x.products?.barcode}</span><span>Магазин: {x.stores?.name||'—'}</span><span>Добавил: {x.created?.name||'—'}</span></div><DateFields value={expiry} onChange={setExpiry}/><label>Количество<input type="number" min="1" value={qty} onChange={e=>setQty(+e.target.value)}/></label><label>Магазин<select value={store} onChange={e=>setStore(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Комментарий"/><button className="primary" disabled={busy} onClick={save}>{busy?'СОХРАНЕНИЕ…':'СОХРАНИТЬ ИЗМЕНЕНИЯ'}</button><button className="danger" disabled={busy} onClick={dispose}><Trash2/>СПИСАТЬ</button>{msg&&<p className="msg">{msg}</p>}</div></div>}
function Stats({items,stores,user}){
  const [store,setStore]=useState(
    user?.role==='admin' ? 'all' : user?.store_id || 'all'
  );
  const [history,setHistory]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      const [
        {data:historyData,error:historyError},
        {data:employeesData,error:employeesError},
        {data:userActivity,error:userActivityError}
      ] = await Promise.all([
        supabase
          .from('history')
          .select('*,users(id,name),expiry_items(store_id,stores(name))')
          .order('created_at',{ascending:false})
          .limit(1000),

        supabase
          .from('users')
          .select('id,name,role,store_id')
          .order('name'),

        supabase
          .from('user_activity')
          .select('user_id,last_seen_at')
      ]);

      if(historyError){
        console.error('Ошибка истории:',historyError);
      }

      if(employeesError){
        console.error('Ошибка сотрудников:',employeesError);
      }

      if(userActivityError){
        console.error('Ошибка активности:',userActivityError);
      }

      setHistory(historyData||[]);
      setEmployees(
        (employeesData||[]).map(employee=>({
          ...employee,
          last_seen_at:
            (userActivity||[]).find(
              activity=>activity.user_id===employee.id
            )?.last_seen_at||null
        }))
      );

      setLoading(false);
    })();
  },[]);

  const filtered=store==='all'
    ?items
    :items.filter(x=>x.store_id===store);

  const employeeStats=employees.map(employee=>{
    const rows=history.filter(r=>{
      if(r.user_id!==employee.id)return false;
      return r.expiry_items?.store_id===store;
    });

    return {
      ...employee,
      added:rows.filter(r=>r.action==='added').length,
      edited:rows.filter(r=>r.action==='edited').length,
      disposed:rows.filter(r=>r.action==='disposed').length
    };
  }).filter(e=>e.added||e.edited||e.disposed||e.last_seen_at);

  return (
    <section className="page">
      <h2>Статистика</h2>

      <div className="store-tabs">
        <button
          className={store==='all'?'active':''}
          onClick={()=>setStore('all')}
        >
          ВСЕ
        </button>

        {stores.map(s=>(
          <button
            key={s.id}
            className={store===s.id?'active':''}
            onClick={()=>setStore(s.id)}
          >
            {s.name.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="bigstats">
        <div>
          <b>{filtered.length}</b>
          <span>Активных</span>
        </div>

        <div>
          <b>{filtered.filter(x=>statusFor(x.expiry_date)==='expired').length}</b>
          <span>Просрочено</span>
        </div>

        <div>
          <b>{filtered.filter(x=>statusFor(x.expiry_date)==='today').length}</b>
          <span>Списать сегодня</span>
        </div>

        <div>
          <b>{filtered.filter(x=>statusFor(x.expiry_date)==='soon').length}</b>
          <span>От 2 до 3 дней</span>
        </div>

        <div>
          <b>{filtered.filter(x=>statusFor(x.expiry_date)==='ok').length}</b>
          <span>В порядке</span>
        </div>
      </div>

      {/* Сотрудники только для конкретного магазина */}
      {store!=='all' && (
        <>
          <h3 style={{marginTop:24}}>Работа сотрудников</h3>

          {loading ? (
            <div className="empty">
              <RefreshCw/>
              <span>Загрузка…</span>
            </div>
          ) : employeeStats.length ? (
            <div className="employee-table-wrap">
              <table className="employee-table">
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Внесено</th>
                    <th>Изменено</th>
                    <th>Списано</th>
                    <th>Последняя активность</th>
                  </tr>
                </thead>

                <tbody>
                  {employeeStats.map(employee=>(
                    <tr key={employee.id}>
                      <td>
                        <b>{employee.name||'Сотрудник'}</b>
                      </td>

                      <td>{employee.added}</td>

                      <td>{employee.edited}</td>

                      <td>{employee.disposed}</td>

                      <td>
                        {employee.last_seen_at
                          ? new Date(employee.last_seen_at)
                              .toLocaleString('ru-RU')
                          : '—'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <UserRound/>
<b>Данных о работе сотрудников пока нет</b>
            </div>
          )}
        </>
      )}

      {store==='all' &&
        stores.map(s=>(
          <div className="store-stat" key={s.id}>
            <b>{s.name}</b>
            <span>
              {items.filter(x=>x.store_id===s.id).length} активных
            </span>
          </div>
        ))
      }

      {store!=='all' && (
        <div className="store-stat">
          <b>{stores.find(s=>s.id===store)?.name}</b>
          <span>{filtered.length} активных</span>
        </div>
      )}
    </section>
  );
}
function HistoryView(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[msg,setMsg]=useState('');
 useEffect(()=>{(async()=>{const {data,error}=await supabase.from('history').select('*,users(name),expiry_items(products(name),stores(name))').order('created_at',{ascending:false}).limit(100);if(error)setMsg(error.message);else setRows(data||[]);setLoading(false)})()},[]);
 return <section className="page"><h2>История</h2>{loading?<div className="empty"><RefreshCw/><span>Загрузка…</span></div>:msg?<div className="empty"><AlertTriangle/><span>{msg}</span></div>:rows.length?<div className="history-list">{rows.map(r=><article className={'history-row '+r.action} key={r.id}><div className="history-icon">{r.action==='added'?<Plus size={19}/>:r.action==='disposed'?<Trash2 size={18}/>:<RefreshCw size={18}/>}</div><div className="history-content"><b>{r.action==='added'?'Добавлен товар':r.action==='disposed'?'Списан товар':'Изменён товар'}</b><p>{r.expiry_items?.products?.name||'Товар'}</p><small>{r.users?.name||'Сотрудник'} · {r.expiry_items?.stores?.name||'—'}</small><time>{new Date(r.created_at).toLocaleString('ru-RU')}</time></div></article>)}</div>:<div className="empty"><History size={42}/><b>История пока пуста</b><span>Изменения появятся здесь автоматически.</span></div>}</section>;
}
function EmployeeManagement({user,stores,onChanged}){
  const [employees,setEmployees]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(null);
  const [msg,setMsg]=useState('');
  const [duplicate,setDuplicate]=useState(null);

  const [roleFilter,setRoleFilter]=useState('all');
  const [newFilter,setNewFilter]=useState(false);

  const [editingName,setEditingName]=useState(null);
  const [nameDraft,setNameDraft]=useState('');

  const loadEmployees=async()=>{
    setLoading(true);

    const {data,error}=await supabase
      .from('users')
      .select('id,name,role,store_id,created_at')
      .order('name');

    if(error){
      setMsg(error.message);
    }else{
      setEmployees(data||[]);
    }

    setLoading(false);
  };

  useEffect(()=>{
    loadEmployees();
  },[]);

  const changeUser=async(employee,role,storeId)=>{
    setBusy(employee.id);
    setMsg('');

    const {error}=await supabase.rpc('admin_update_user',{
      p_user_id:employee.id,
      p_role:role,
      p_store_id:storeId||null
    });

    if(error){
      setMsg(error.message);
    }else{
      await loadEmployees();

      if(typeof onChanged==='function'){
        await onChanged();
      }
    }

    setBusy(null);
  };

  const saveName=async(employee)=>{
    const newName=nameDraft.trim();

    if(!newName){
      setMsg('Имя пользователя не может быть пустым.');
      return;
    }

    setBusy(employee.id);
    setMsg('');

    const {error}=await supabase
      .from('users')
      .update({
        name:newName
      })
      .eq('id',employee.id);

    if(error){
      setMsg(error.message);
    }else{
      setEditingName(null);
      setNameDraft('');
      await loadEmployees();

      if(typeof onChanged==='function'){
        await onChanged();
      }
    }

    setBusy(null);
  };

  const isNewUser=(employee)=>{
    if(!employee.created_at)return false;

    const created=new Date(employee.created_at).getTime();
    const now=Date.now();

    return now-created<=3*24*60*60*1000;
  };

  const filteredEmployees=employees.filter(employee=>{
    if(roleFilter!=='all' && employee.role!==roleFilter){
      return false;
    }

    if(newFilter && !isNewUser(employee)){
      return false;
    }

    return true;
  });

  if(user.role!=='admin')return null;

  return (
    <div style={{marginTop:24}}>

      <h3>Сотрудники</h3>

      <div
        style={{
          display:'grid',
          gap:8,
          marginBottom:16
        }}
      >

        <select
          value={roleFilter}
          onChange={e=>setRoleFilter(e.target.value)}
        >
          <option value="all">
            Все роли
          </option>

          <option value="srtz_rtz">
            СРТЗ / РТЗ
          </option>

          <option value="manager">
            Управляющие
          </option>

          <option value="tm">
            Территориальные менеджеры
          </option>

          <option value="admin">
            Администратор
          </option>
        </select>

        <button
          type="button"
          className={newFilter?'primary':'secondary'}
          onClick={()=>setNewFilter(v=>!v)}
        >
          {newFilter
            ?'✓ НОВЫЕ ЗА ПОСЛЕДНИЕ 3 ДНЯ'
            :'НОВЫЕ ЗА ПОСЛЕДНИЕ 3 ДНЯ'
          }
        </button>

      </div>

      {loading ? (
        <div className="empty">
          <RefreshCw/>
          <span>Загрузка…</span>
        </div>

      ) : filteredEmployees.length ? (

        <div className="store-admin-list">

          {filteredEmployees.map(employee=>(
            <div
              key={employee.id}
              className="store-admin-row"
              style={{display:'block'}}
            >

              <div>

                {editingName===employee.id ? (

                  <div
                    style={{
                      display:'grid',
                      gap:8
                    }}
                  >

                    <input
                      value={nameDraft}
                      onChange={e=>setNameDraft(e.target.value)}
                      placeholder="Фамилия Имя"
                      disabled={busy===employee.id}
                      autoFocus
                    />

                    <div
                      style={{
                        display:'flex',
                        gap:8
                      }}
                    >

                      <button
                        className="primary"
                        disabled={busy===employee.id}
                        onClick={()=>saveName(employee)}
                      >
                        {busy===employee.id
                          ?'СОХРАНЕНИЕ…'
                          :'СОХРАНИТЬ ИМЯ'
                        }
                      </button>

                      <button
                        className="secondary"
                        disabled={busy===employee.id}
                        onClick={()=>{
                          setEditingName(null);
                          setNameDraft('');
                        }}
                      >
                        ОТМЕНА
                      </button>

                    </div>

                  </div>

                ) : (

                  <div
                    style={{
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'space-between',
                      gap:10
                    }}
                  >

                    <div>
                      <b>
                        {employee.name||'Без имени'}
                      </b>

                      {isNewUser(employee)&&(
                        <span
                          style={{
                            marginLeft:8,
                            color:'#e53935',
                            fontSize:12,
                            fontWeight:700
                          }}
                        >
                          НОВЫЙ
                        </span>
                      )}
                    </div>

                    <button
                      className="secondary"
                      style={{
                        width:'auto',
                        flexShrink:0,
                        padding:'6px 9px',
                        fontSize:11
                      }}
                      disabled={busy===employee.id}
                      onClick={()=>{
                        setEditingName(employee.id);
                        setNameDraft(employee.name||'');
                        setMsg('');
                      }}
                    >
                      ИЗМЕНИТЬ
                    </button>

                  </div>

                )}

                <div className="muted">

                  {employee.role==='admin'
                    ?'Администратор'
                    :employee.role==='tm'
                      ?'Территориальный менеджер'
                      :employee.role==='manager'
                        ?'Управляющий магазина'
                        :'СРТЗ / РТЗ'
                  }

                  {employee.store_id && (
                    <>
                      {' · '}
                      {stores.find(s=>s.id===employee.store_id)?.name || employee.store_id}
                    </>
                  )}

                </div>

                {employee.created_at&&(
                  <small className="muted">
                    Регистрация: {new Date(employee.created_at).toLocaleDateString('ru-RU')}
                  </small>
                )}

              </div>

              {employee.role!=='admin' && editingName!==employee.id && (

                <div
                  style={{
                    display:'grid',
                    gap:8,
                    marginTop:12
                  }}
                >

                  <select
                    value={employee.role}
                    disabled={busy===employee.id}
                    onChange={e=>{
                      const newRole=e.target.value;

                      if(newRole==='tm'){
                        changeUser(
                          employee,
                          'tm',
                          null
                        );
                      }else{
                        changeUser(
                          employee,
                          newRole,
                          employee.store_id ||
                          stores.find(s=>s.is_active)?.id
                        );
                      }
                    }}
                  >

                    <option value="srtz_rtz">
                      СРТЗ / РТЗ
                    </option>

                    <option value="manager">
                      Управляющий магазина
                    </option>

                    <option value="tm">
                      Территориальный менеджер
                    </option>

                  </select>

                  {employee.role!=='tm' && (

                    <select
                      value={employee.store_id||''}
                      disabled={busy===employee.id}
                      onChange={e=>{
                        changeUser(
                          employee,
                          employee.role,
                          e.target.value
                        );
                      }}
                    >

                      <option value="">
                        Выберите магазин
                      </option>

                      {stores
                        .filter(s=>s.is_active)
                        .map(store=>(
                          <option
                            key={store.id}
                            value={store.id}
                          >
                            {store.name}
                          </option>
                        ))
                      }

                    </select>

                  )}

                  {busy===employee.id&&(
                    <small>
                      Сохранение…
                    </small>
                  )}

                </div>

              )}

            </div>
          ))}

        </div>

      ) : (

        <div className="empty">
          <UserRound/>
          <b>
            {newFilter
              ?'Новых пользователей за последние 3 дня нет'
              :'По выбранному фильтру сотрудников нет'
            }
          </b>
        </div>

      )}

      {msg&&(
        <p className="msg">
          {msg}
        </p>
      )}

    </div>
  );
}
function Profile({user,session,stores,onStoresChanged,onLogout}){
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
  return (
    <section className="page">
      <h2>Профиль</h2>

      <div className="profile">
        <UserRound size={42}/>
        <b>{user.name}</b>

        <span>
          {user.role==='admin'
            ?'Администратор'
            :user.role==='tm'
              ?'Территориальный менеджер'
              :user.role==='manager'
                ?'Управляющий магазина'
                :'СРТЗ / РТЗ'
          }
          {user.role!=='tm' &&
  user.role!=='admin' &&
  user.store_id && (
    <>
      {' · '}
      {stores.find(s=>s.id===user.store_id)?.name || user.store_id}
    </>
  )
}
        </span>

        <small>{session.user.email}</small>
      </div>

      <PushSettings supabase={supabase} userId={session.user.id}/>
      <div className="profile-note"><Mascot/><b>Сроки под контролем!</b></div>
      {user.role==='admin' && (
        <>
          <h3 style={{marginTop:24}}>Магазины</h3>
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

          {msg&&<p className="msg">{msg}</p>}
        </>
      )}
{user.role==='admin' && (
  <EmployeeManagement
    user={user}
    stores={stores}
    onChanged={onStoresChanged}
  />
)}

      {msg && user.role!=='admin' && <p className="msg" role="status">{msg}</p>}
      <button
        className="secondary"
        onClick={async()=>{try{await onLogout();}catch(e){setMsg(e.message||'Не удалось выйти. Проверьте соединение и повторите.');}}}
      >
        <LogOut/>
        ВЫЙТИ
      </button>
    </section>
  );
}


function UpdateManager() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const registrationRef = useRef(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    let registration;
    let checkTimer;

    const checkForUpdate = async () => {
      try {
        if (registrationRef.current) {
          await registrationRef.current.update();
        }
      } catch (error) {
        console.error('Ошибка проверки обновления:', error);
      }
    };

    const showWaitingWorker = () => {
      if (registration?.waiting && navigator.serviceWorker.controller) {
        setUpdateReady(true);
        setUpdateError('');
      }
    };

    const handleControllerChange = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    const start = async () => {
      try {
        registration = await navigator.serviceWorker.register(
          `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__APP_VERSION__)}`,
          { updateViaCache: 'none' }
        );

        registrationRef.current = registration;

        showWaitingWorker();

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              showWaitingWorker();
            }
          });
        });

        await registration.update();

        checkTimer = window.setInterval(checkForUpdate, 60000);
      } catch (error) {
        console.error('Ошибка регистрации Service Worker:', error);
      }
    };

    const hadController = Boolean(navigator.serviceWorker.controller);

    if (hadController) {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleControllerChange
      );
    }

    document.addEventListener('visibilitychange', handleVisibility);
    start();

    return () => {
      if (checkTimer) window.clearInterval(checkTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange
      );
    };
  }, []);

  const applyUpdate = () => {
    const worker = registrationRef.current?.waiting;

    if (!worker) {
      setUpdateError('Обновление ещё загружается. Попробуйте нажать кнопку ещё раз.');
      registrationRef.current?.update().catch(console.error);
      return;
    }

    setUpdateError('');
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!updateReady) return null;
  return <UpdateScreen onApply={applyUpdate} error={updateError}/>;
}

createRoot(document.getElementById('root')).render(
  <>
    <App />
    <UpdateManager />
  </>
);
