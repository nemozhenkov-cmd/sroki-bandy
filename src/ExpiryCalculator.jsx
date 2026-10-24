import {useState} from 'react';
import {calculateExpiry, localDate} from './expiry-date.mjs';

export default function ExpiryCalculator({onApply}) {
  const [open,setOpen]=useState(false);
  const [manufactured,setManufactured]=useState(localDate());
  const [amount,setAmount]=useState('');
  const [unit,setUnit]=useState('days');
  const expiry=calculateExpiry(manufactured,amount,unit);
  const formatted=expiry?expiry.split('-').reverse().join('.'):'';

  return <div className="expiry-tools">
    <div className="expiry-mode" role="group" aria-label="Способ ввода срока годности">
      <button type="button" aria-pressed={!open} onClick={()=>setOpen(false)}>Вручную</button>
      <button type="button" aria-pressed={open} onClick={()=>setOpen(true)}>Калькулятор</button>
    </div>
    {open&&<div className="expiry-calculator">
      <label>Дата изготовления
        <input type="date" value={manufactured} onChange={e=>setManufactured(e.target.value)}/>
      </label>
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
      <p role="status">{expiry?`Дата окончания: ${formatted}`:'Укажите дату изготовления и целый положительный срок.'}</p>
      <button type="button" className="primary" disabled={!expiry} onClick={()=>{onApply(expiry);setOpen(false)}}>ПОДСТАВИТЬ ДАТУ</button>
      <small>Дата изготовления + указанный срок. Проверьте результат по маркировке товара.</small>
    </div>}
  </div>;
}
