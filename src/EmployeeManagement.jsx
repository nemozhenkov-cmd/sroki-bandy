import React,{useEffect,useState} from 'react';
import {RefreshCw,UserRound} from 'lucide-react';
import {roleLabel} from './roles.mjs';
export default function EmployeeManagement({user,stores,onChanged,supabase}){
  const [employees,setEmployees]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(null);
  const [msg,setMsg]=useState('');
  const [duplicate,setDuplicate]=useState(null);

  const [roleFilter,setRoleFilter]=useState('all');
  const [newFilter,setNewFilter]=useState(false);
  const [search,setSearch]=useState(''),[storeFilter,setStoreFilter]=useState('all');

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
    if(storeFilter!=='all'&&employee.store_id!==storeFilter)return false;
    if(!(employee.name||'').toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))return false;
    if(roleFilter!=='all' && (employee.role==='srtz_rtz'?'rtz':employee.role)!==roleFilter){
      return false;
    }

    if(newFilter && !isNewUser(employee)){
      return false;
    }

    return true;
  });

  if(user.role!=='admin')return null;

  return (
    <div className="profile-users">

      <p className="muted">Находите пользователей и управляйте доступом. Изменения роли и магазина сохраняются сразу.</p>

      <div className="profile-filters">
        <input type="search" aria-label="Поиск пользователя" placeholder="Найти по имени" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select aria-label="Фильтр по магазину" value={storeFilter} onChange={e=>setStoreFilter(e.target.value)}><option value="all">Все магазины</option>{stores.map(x=><option key={x.id} value={x.id}>{x.name}{x.is_active?'':' · Неактивен'}</option>)}</select>

        <select
          aria-label="Фильтр по роли" value={roleFilter}
          onChange={e=>setRoleFilter(e.target.value)}
        >
          <option value="all">
            Все роли
          </option>

          <option value="rtz">РТЗ</option><option value="srtz">СРТЗ</option>

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

      <p className="profile-results" role="status">Найдено {filteredEmployees.length} из {employees.length}</p>
      {loading&&!employees.length ? (
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

                  {roleLabel(employee.role)
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
                    aria-label={`Роль: ${employee.name}`} value={employee.role}
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

                    <option value="rtz">РТЗ</option><option value="srtz">СРТЗ</option>

                    <option value="manager">
                      Управляющий магазина
                    </option>

                    <option value="tm">
                      Территориальный менеджер
                    </option>

                  </select>

                  {employee.role!=='tm' && (

                    <select
                      aria-label={`Магазин: ${employee.name}`} value={employee.store_id||''}
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
