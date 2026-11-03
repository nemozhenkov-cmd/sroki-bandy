import React from 'react';
import {Calculator} from 'lucide-react';
import AppDialog from './AppDialog.jsx';
import {useState} from 'react';
import {calculateExpiry, localDate} from './expiry-date.mjs';

export default function ExpiryCalculator({onApply}) {
  const [open,setOpen]=useState(false);
  const [manufactured,setManufactured]=useState(localDate());
  const [amount,setAmount]=useState('');
  const [unit,setUnit]=useState('days');
  const expiry=calculateExpiry(manufactured,amount,unit);
  const formatted=expiry?expiry.split('-').reverse().join('.'):'';
  const [year,month,day]=manufactured.split('-');
  const months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const daysInMonth=new Date(Number(year),Number(month),0).getDate();
  const currentYear=new Date().getFullYear();
  const years=Array.from({length:22},(_,i)=>currentYear-20+i);
  const changeManufactured=(nextDay,nextMonth,nextYear)=>{
    const lastDay=new Date(Number(nextYear),Number(nextMonth),0).getDate();
    setManufactured(`${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(Math.min(Number(nextDay),lastDay)).padStart(2,'0')}`);
  };

  return <div className="expiry-tools compact-expiry-tools">
    <button type="button" className="calculator-trigger" onClick={()=>setOpen(true)}><Calculator size={16}/>Рассчитать</button>
    {open&&<AppDialog title="Калькулятор срока" onClose={()=>setOpen(false)} className="calculator-overlay"><div className="expiry-calculator">
      <div>
        <div className="expiry-date-label">Дата изготовления</div>
        <div className="expiry-manufactured-date" role="group" aria-label="Дата изготовления">
          <select aria-label="День изготовления" value={day} onChange={e=>changeManufactured(e.target.value,month,year)}>
            {Array.from({length:daysInMonth},(_,i)=>String(i+1).padStart(2,'0')).map(value=><option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Месяц изготовления" value={month} onChange={e=>changeManufactured(day,e.target.value,year)}>
            {months.map((name,i)=><option key={name} value={String(i+1).padStart(2,'0')}>{name}</option>)}
          </select>
          <select aria-label="Год изготовления" value={year} onChange={e=>changeManufactured(day,month,e.target.value)}>
            {[...new Set([Number(year),...years])].sort((a,b)=>a-b).map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>
      <div className="expiry-duration">
        <label>Срок годности
          <input type="number" min="1" step="1" inputMode="numeric" placeholder="Например, 30" value={amount} onChange={e=>setAmount(e.target.value)}/>
        </label>
        <label>Единица
          <select value={unit} onChange={e=>setUnit(e.target.value)}>
            <option value="days">Дней</option>
            <option value="months">Месяцев</option>
            <option value="years">Лет</option>
          </select>
        </label>
      </div>
      <p role="status">{expiry?`Годен до: ${formatted}`:'Укажите дату изготовления и целый положительный срок.'}</p>
      <button type="button" className="primary" disabled={!expiry} onClick={()=>{onApply(expiry);setOpen(false)}}>{expiry?`Применить: годен до ${formatted}`:'Укажите срок годности'}</button>
      <small>К дате изготовления прибавляется полный срок. Полученная дата — первый день, когда товар уже просрочен. Проверьте результат по маркировке товара.</small>
    </div></AppDialog>}
  </div>;
}
