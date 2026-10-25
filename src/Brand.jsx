import React from 'react';
import {RefreshCw} from 'lucide-react';

export function Wordmark(){return <div className="wordmark" aria-label="Чижик">Чижик</div>;}
export function Mascot({pose='welcome',className=''}){return <img className={`mascot ${className}`} src={`${import.meta.env.BASE_URL}brand/mascot-${pose}.webp`} width="320" height="320" alt="" draggable="false"/>;}
export function LoadingScreen(){return <main className="status-screen splash"><Wordmark/><Mascot pose="loading"/><h1>Загружаем<br/>приложение</h1><p>Проверяем подключение<br/>и получаем данные</p><div className="loading-dots" role="status" aria-label="Загрузка"><i/><i/><i/></div><small>Контроль сроков годности</small></main>;}
export function UpdateScreen({onApply,error}){return <div className="update-overlay"><section className="status-screen update-screen" role="dialog" aria-modal="true" aria-labelledby="update-title"><Wordmark/><Mascot pose="update"/><h1 id="update-title">Есть обновление</h1><p>Новая версия готова к установке</p><div className="update-info"><RefreshCw/><div><b>Обновим приложение</b><span>После установки оно откроется заново</span></div></div>{error&&<p className="msg" role="alert">{error}</p>}<button className="primary" onClick={onApply}>Обновить приложение</button></section></div>;}

export function DateFields({value,onChange,label='Годен до'}){
  const [year,month,day]=value.split('-').map(Number);
  const months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const update=(d,m,y)=>{
    const last=new Date(y,m,0).getDate();
    onChange(`${y}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`);
  };
  const years=[...new Set([year,...Array.from({length:7},(_,i)=>new Date().getFullYear()+i)])].sort((a,b)=>a-b);
  return <div className="date-field-group"><span>{label}</span><div className="date-fields" role="group" aria-label={label}>
    <select aria-label="День окончания срока" value={day} onChange={e=>update(Number(e.target.value),month,year)}>{Array.from({length:new Date(year,month,0).getDate()},(_,i)=>i+1).map(d=><option key={d} value={d}>{String(d).padStart(2,'0')}</option>)}</select>
    <select aria-label="Месяц окончания срока" value={month} onChange={e=>update(day,Number(e.target.value),year)}>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select>
    <select aria-label="Год окончания срока" value={year} onChange={e=>update(day,month,Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select>
  </div></div>;
}
