import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserMultiFormatReader} from '@zxing/browser';
import {BarcodeFormat, DecodeHintType} from '@zxing/library';
import {createClient} from '@supabase/supabase-js';
import {Camera, Search, Plus, PackageCheck, AlertTriangle, Clock3, LogOut, History, BarChart3, UserRound, X, Check, Trash2, RefreshCw} from 'lucide-react';
import './styles.css';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL, supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey):null;
const STORES=[{id:'163',name:'Видова 163В'},{id:'190',name:'Видова 190А'}];
const fmt=d=>d?new Intl.DateTimeFormat('ru-RU').format(new Date(d+'T00:00:00')):'';
function daysLeft(date){const a=new Date();a.setHours(0,0,0,0);const b=new Date(date+'T00:00:00');return Math.ceil((b-a)/86400000)}
function statusFor(date){const d=daysLeft(date);return d<0?'expired':d<=3?'soon':'ok'}
function statusText(date){const d=daysLeft(date);return d<0?`Просрочен на ${Math.abs(d)} ${plural(Math.abs(d),['день','дня','дней'])}`:`Осталось ${d} ${plural(d,['день','дня','дней'])}`}
function plural(n,a){n=Math.abs(n)%100;let n1=n%10;return n>10&&n<20?a[2]:n1>1&&n1<5?a[1]:n1===1?a[0]:a[2]}
function localDate(){return new Date().toISOString().slice(0,10)}

function App(){
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[tab,setTab]=useState('home'),[store,setStore]=useState('all'),[q,setQ]=useState(''),[filter,setFilter]=useState('all'),[items,setItems]=useState([]),[products,setProducts]=useState([]),[stores,setStores]=useState(STORES),[user,setUser]=useState(null),[edit,setEdit]=useState(null),[scanner,setScanner]=useState(false),[error,setError]=useState('');
 const load=async()=>{
  if(!supabase){
    setLoading(false);
    return;
  }

  const {data:{session}}=await supabase.auth.getSession();

  setSession(session);

  if(session){
    await loadData(session.user.id);
  }

  setLoading(false);
};
 const loadData=async(uid)=>{const [
  {data:it,error:e1},
  {data:p,error:e2},
  {data:u,error:e3},
  {data:s,error:e4},
  {data:a,error:e5}
]=await Promise.all([
  supabase
  .from('expiry_items')
  .select('*,products(*),stores(*),created:created_by(name),updated:updated_by(name)')
  .eq('is_disposed',false)
  .order('expiry_date'),
  supabase.from('products').select('*'),
  supabase.from('users').select('*').eq('id',uid).maybeSingle(),
  supabase.from('stores').select('*').order('name'),
  supabase.from('user_activity').select('user_id,last_seen_at')
]);if(e1||e2||e3||e4||e5){setError((e1||e2||e3||e4||e5).message)}else{setItems(it||[]);setProducts(p||[]);setUser(u);if(u)if(u){
  const {error:activityError}=await supabase
    .rpc('touch_user_activity');

  if(activityError){
    console.error('Ошибка обновления активности:',activityError);
    setError('Ошибка активности: '+activityError.message);
  }
}if(s?.length)setStores(s)}};
 useEffect(()=>{
  load();

  if(!supabase)return;

  const {data:{subscription}}=supabase.auth.onAuthStateChange(
    async (_event,newSession)=>{
      setSession(newSession);

      if(newSession){
        await loadData(newSession.user.id);
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
      ()=>{
        if(session?.user?.id){
          loadData(session.user.id);
        }
      }
    )
    .subscribe();

  return()=>{
    subscription.unsubscribe();
    supabase.removeChannel(ch);
  };
},[session?.user?.id]);
 if(loading)return <Splash/>; if(!supabase)return <Setup/>; if(!session)return <Auth/>; if(!user)return <Onboard session={session} onDone={()=>loadData(session.user.id)}/>;
 const filtered=items.filter(x=>store==='all'||x.store_id===store).filter(x=>{const st=statusFor(x.expiry_date);return filter==='all'||st===filter}).filter(x=>{const s=(x.products?.name+' '+(x.products?.brand||'')+' '+x.products?.barcode).toLowerCase();return s.includes(q.toLowerCase())});
 const counts={expired:items.filter(x=>statusFor(x.expiry_date)==='expired'&&(store==='all'||x.store_id===store)).length,soon:items.filter(x=>statusFor(x.expiry_date)==='soon'&&(store==='all'||x.store_id===store)).length,ok:items.filter(x=>statusFor(x.expiry_date)==='ok'&&(store==='all'||x.store_id===store)).length};
 return <div className="app"><header><div className="brand">Контроль Сроков Годности<span>Выберите ваш магазин для отображения данных</span></div><button className="icon" onClick={()=>setTab('profile')}><UserRound/></button></header>
 {tab==='home'&&<><div className="store-tabs">{[['all','ВСЕ'],...stores.map(s=>[s.id,s.name.toUpperCase()])].map(([id,n])=><button className={store===id?'active':''} onClick={()=>setStore(id)} key={id}>{n}</button>)}</div><div className="stats"><Stat n={counts.expired} t="Просрочено" c="expired" on={()=>setFilter('expired')}/><Stat n={counts.soon} t="Скоро истекает" c="soon" on={()=>setFilter('soon')}/><Stat n={counts.ok} t="В порядке" c="ok" on={()=>setFilter('ok')}/></div><div className="search"><Search size={20}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Поиск товара или штрихкода"/>{q&&<X onClick={()=>setQ('')}/>}</div><div className="list-head"><b>{filter==='all'?'Все товары':filter==='expired'?'Просрочено':filter==='soon'?'Скоро истекает':'В порядке'}</b><button onClick={()=>setFilter('all')}>Сбросить</button></div><div className="list">{filtered.length?filtered.map(x=><Item key={x.id} x={x} onClick={()=>setEdit(x)}/>):<Empty/>}</div></>}
 {tab==='add'&&<Add stores={stores} products={products} user={user} onClose={()=>setTab('home')} onSaved={()=>{loadData(user.id);setTab('home')}}/>}
 {tab==='stats'&&<Stats items={items} stores={stores}/>} {tab==='history'&&<HistoryView/>} {tab==='profile'&&<Profile user={user} session={session} onLogout={()=>supabase.auth.signOut()}/>}<nav><button className={tab==='home'?'sel':''} onClick={()=>setTab('home')}><PackageCheck/>Список</button><button className={tab==='stats'?'sel':''} onClick={()=>setTab('stats')}><BarChart3/>Статистика</button><button className="add" onClick={()=>setTab('add')}><Plus/></button><button className={tab==='history'?'sel':''} onClick={()=>setTab('history')}><History/>История</button><button className={tab==='profile'?'sel':''} onClick={()=>setTab('profile')}><UserRound/>Профиль</button></nav>{edit&&<Edit x={edit} stores={stores} onClose={()=>setEdit(null)} onSaved={()=>{loadData(user.id);setEdit(null)}}/>}{error&&<div className="toast">{error}<X onClick={()=>setError('')}/></div>}</div>
}
function Splash(){
  return (
    <div className="splash">
      <div className="logo">С</div>
      <h1>Банда Видова</h1>
      <p>Контроль сроков годности</p>
      <small>Автор: Неможенко В. 2787320</small>
    </div>
  );
}function Setup(){return <div className="center"><h1>КОНТРОЛЬ СГ</h1><p>Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env</p></div>}
function Auth(){
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [name,setName]=useState('');
  const [reg,setReg]=useState(false);
  const [msg,setMsg]=useState('');

  const go=async()=>{
    let r=reg
      ?await supabase.auth.signUp({
          email,
          password:pass,
          options:{data:{name}}
        })
      :await supabase.auth.signInWithPassword({
          email,
          password:pass
        });

    if(r.error){
      setMsg(r.error.message);
    }else if(reg){
      setMsg('Проверьте почту для подтверждения аккаунта.');
    }
  };

  return (
    <div className="auth">
      <div className="logo">С</div>

      <h1>Банда Видова</h1>
      <p>Контроль сроков годности</p>

      {reg&&
        <input
          placeholder="Имя"
          value={name}
          onChange={e=>setName(e.target.value)}
        />
      }

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e=>setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Пароль"
        value={pass}
        onChange={e=>setPass(e.target.value)}
      />

      <button className="primary" onClick={go}>
        {reg?'СОЗДАТЬ АККАУНТ':'ВОЙТИ'}
      </button>

      {msg&&<p className="msg">{msg}</p>}

      <button className="link" onClick={()=>setReg(!reg)}>
        {reg?'У меня уже есть аккаунт':'Создать аккаунт'}
      </button>

      <div className="auth-author">
        Автор: Неможенко В. 2787320
      </div>
    </div>
  );
}function Onboard({session,onDone}){const [name,setName]=useState(session.user.user_metadata?.name||''),[store,setStore]=useState('163'),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');const save=async()=>{const cleanName=name.trim();if(!cleanName){setMsg('Введите имя сотрудника.');return}setBusy(true);setMsg('');try{const check=await supabase.from('users').select('id').eq('id',session.user.id).maybeSingle();if(check.error)throw check.error;let r;if(check.data){r=await supabase.from('users').update({name:cleanName,store_id:store}).eq('id',session.user.id).select().single()}else{r=await supabase.from('users').insert({id:session.user.id,name:cleanName,store_id:store,role:'employee'}).select().single()}if(r.error)throw r.error;onDone()}catch(e){setMsg('Не удалось сохранить профиль: '+(e?.message||'неизвестная ошибка'))}finally{setBusy(false)}};return <div className="auth"><div className="logo">С</div><h2>Профиль сотрудника</h2><input placeholder="Имя" value={name} onChange={e=>setName(e.target.value)}/><select value={store} onChange={e=>setStore(e.target.value)}>{STORES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="primary" disabled={busy} onClick={save}>{busy?'СОХРАНЕНИЕ…':'СОХРАНИТЬ'}</button>{msg&&<p className="msg">{msg}</p>}</div>}
function Stat({n,t,c,on}){return <button className={'stat '+c} onClick={on}><b>{n}</b><span>{t}</span></button>}
function Item({x,onClick}){const s=statusFor(x.expiry_date);return <button className="item" onClick={onClick}><div className={'dot '+s}/><div className="itemmain"><h3>{x.products?.name||'Без названия'}</h3><div className="muted">EAN {x.products?.barcode} · {x.stores?.name}</div><strong>Срок: {fmt(x.expiry_date)}</strong><div className="days">{statusText(x.expiry_date)}</div><div className="muted">Количество: {x.quantity} · Добавил: {x.created?.name||'—'}</div></div></button>}
function Empty(){return <div className="empty"><PackageCheck size={42}/><b>Ничего не найдено</b><span>Попробуйте изменить фильтр или добавить товар.</span></div>}
function Add({stores,products,user,onClose,onSaved}){
 const [barcode,setBarcode]=useState(''),[name,setName]=useState(''),[brand,setBrand]=useState(''),[expiry,setExpiry]=useState(localDate()),[qty,setQty]=useState(1),[store,setStore]=useState(user.store_id),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[scanning,setScanning]=useState(false),videoRef=useRef(null),scannerRef=useRef(null);
 useEffect(()=>()=>{scannerRef.current?.stop?.();scannerRef.current?.reset?.();scannerRef.current=null},[]);
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
    // Останавливаем предыдущий сканер
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

    // Ждём появления <video>
    await new Promise(resolve=>{
      requestAnimationFrame(()=>{
        requestAnimationFrame(resolve);
      });
    });

    if(!videoRef.current){
      throw new Error('Не удалось подготовить окно камеры.');
    }

    // ВАЖНО:
    // Не ищем список устройств заранее.
    // ZXing сам запрашивает доступ к камере.
    const constraints={
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:1280},
        height:{ideal:720}
      }
    };

    const controls=await reader.decodeFromConstraints(
      constraints,
      videoRef.current,
      (result,error)=>{
        if(!result)return;

        const code=result.getText().trim();
        if(!code)return;

        try{controls.stop?.()}catch{}
        try{reader.reset()}catch{}

        scannerRef.current=null;
        setScanning(false);
        setBarcode(code);

        find(code);
      }
    );

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
      setMsg('Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера.');
    }else{
      setMsg('Не удалось запустить камеру: '+m);
    }
  }
};
 const find = async (rawCode) => {
  const code = String(rawCode || '').replace(/\D/g, '');
  setBarcode(code);
  setMsg('Ищем товар…');
  const own = products.find(p => String(p.barcode || '').replace(/\D/g, '') === code);
  if (own) {
    setName(own.name || '');
    setBrand(own.brand || '');
    setMsg('Товар найден в нашей базе');
    return;
  }
  setBusy(true);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?fields=code,product_name,brands`,{headers:{Accept:'application/json'}});
    const j = await r.json();
    const product = j?.product;
    const productName = product?.product_name || '';
    const brand = product?.brands || '';
    if (productName.trim()) {
      setName(productName.trim());
      setBrand(brand.trim());
      setMsg('Товар найден в Open Food Facts');
    } else {
      setName('');
      setBrand('');
      setMsg('Товар не найден — введите название вручную');
    }
  } catch (error) {
    console.error('Open Food Facts error:', error);
    setName('');
    setBrand('');
    setMsg('Не удалось выполнить поиск — введите название вручную');
  } finally {
    setBusy(false);
  }
 };
 const save=async()=>{if(!barcode||!name||!expiry)return setMsg('Заполните штрихкод, название и срок.');setBusy(true);let p=products.find(p=>p.barcode===barcode);if(!p){const r=await supabase.from('products').insert({barcode,name,brand}).select().single();if(r.error){setMsg(r.error.message);setBusy(false);return}p=r.data}const r=await supabase.from('expiry_items').insert({product_id:p.id,store_id:store,expiry_date:expiry,quantity:qty,note,created_by:user.id,updated_by:user.id});if(r.error)setMsg(r.error.message);else onSaved();setBusy(false)};
 return <section className="sheet"><div className="sheethead"><h2>Добавить товар</h2><button onClick={onClose}><X/></button></div>{msg&&<div className="msg top-msg">{msg}</div>}<button className="scan" onClick={scan}><Camera/>СКАНИРОВАТЬ ШТРИХКОД</button>{scanning&&<div className="scanner"><video ref={videoRef} autoPlay playsInline muted/><button onClick={()=>{scannerRef.current?.reset();scannerRef.current=null;setScanning(false)}}>ОТМЕНА</button></div>}<input value={barcode} onChange={e=>setBarcode(e.target.value)} onBlur={()=>barcode&&find(barcode)} placeholder="Штрихкод EAN" inputMode="numeric"/><input value={name} onChange={e=>setName(e.target.value)} placeholder="Название товара"/><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Бренд (необязательно)"/><label>Срок годности<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><label>Количество<input type="number" min="1" value={qty} onChange={e=>setQty(+e.target.value)}/></label><label>Магазин<select value={store} onChange={e=>setStore(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Комментарий (необязательно)"/><button className="primary" disabled={busy} onClick={save}>{busy?'СОХРАНЕНИЕ…':'СОХРАНИТЬ'}</button></section>
}
function Edit({x,stores,onClose,onSaved}){const [expiry,setExpiry]=useState(x.expiry_date),[qty,setQty]=useState(x.quantity),[store,setStore]=useState(x.store_id),[note,setNote]=useState(x.note||''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const save=async()=>{setBusy(true);const {data:{user}}=await supabase.auth.getUser();const r=await supabase.from('expiry_items').update({expiry_date:expiry,quantity:qty,store_id:store,note,updated_by:user.id}).eq('id',x.id);if(r.error)setMsg(r.error.message);else onSaved();setBusy(false)};
 const dispose=async()=>{setBusy(true);setMsg('');const {data:{user}}=await supabase.auth.getUser();const {error}=await supabase.from('expiry_items').update({is_disposed:true,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',x.id).eq('is_disposed',false);if(error){setMsg(error.message);setBusy(false);return}onSaved();};
 return <div className="modal"><div className="dialog"><div className="sheethead"><h2>{x.products?.name}</h2><button onClick={onClose}><X/></button></div><div className="muted">EAN {x.products?.barcode}</div><label>Срок<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><label>Количество<input type="number" min="1" value={qty} onChange={e=>setQty(+e.target.value)}/></label><label>Магазин<select value={store} onChange={e=>setStore(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Комментарий"/><button className="primary" disabled={busy} onClick={save}>{busy?'СОХРАНЕНИЕ…':'СОХРАНИТЬ ИЗМЕНЕНИЯ'}</button><button className="danger" disabled={busy} onClick={dispose}><Trash2/>СПИСАТЬ</button>{msg&&<p className="msg">{msg}</p>}</div></div>}
function Stats({items,stores}){
  const [store,setStore]=useState('all');
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
          <b>{filtered.filter(x=>statusFor(x.expiry_date)==='soon').length}</b>
          <span>≤ 3 дней</span>
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
 return <section className="page"><h2>История</h2>{loading?<div className="empty"><RefreshCw/><span>Загрузка…</span></div>:msg?<div className="empty"><AlertTriangle/><span>{msg}</span></div>:rows.length?<div className="history-list">{rows.map(r=><div className="history-row" key={r.id}><b>{new Date(r.created_at).toLocaleString('ru-RU')}</b><span>{r.users?.name||'Сотрудник'} · {r.action==='added'?'добавил товар':r.action==='disposed'?'списал товар':'изменил товар'}</span><small>{r.expiry_items?.products?.name||'Товар'} · {r.expiry_items?.stores?.name||'—'}</small></div>)}</div>:<div className="empty"><History size={42}/><b>История пока пуста</b><span>Изменения появятся здесь автоматически.</span></div>}</section>}
function Profile({user,session,onLogout}){return <section className="page"><h2>Профиль</h2><div className="profile"><UserRound size={42}/><b>{user.name}</b><span>{user.role==='admin'?'Администратор':'Сотрудник'} · {STORES.find(s=>s.id===user.store_id)?.name}</span><small>{session.user.email}</small></div><button className="secondary" onClick={onLogout}><LogOut/>ВЫЙТИ</button></section>}
if(import.meta.env.PROD && 'serviceWorker' in navigator) {window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
createRoot(document.getElementById('root')).render(<App/>);