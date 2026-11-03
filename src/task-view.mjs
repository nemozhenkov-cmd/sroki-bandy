import {TASKS,moscowDate,isWorkingDay} from './task-core.mjs';
export const WORK_TASKS=TASKS.filter(t=>t.id!==14);
export function shiftState(data,now=Date.now()){
 const offset=data?.server_time&&data?._receivedAt?Date.parse(data.server_time)-data._receivedAt:0;
 const date=new Date(now+offset),day=moscowDate(date);const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const minutes=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
 const done=data?.day===day?(data.completions||[]).filter(c=>WORK_TASKS.some(t=>t.id===c.task_id)):[];
 const pending=WORK_TASKS.filter(t=>!done.some(c=>c.task_id===t.id));const late=t=>minutes>Number(t.deadline.slice(0,2))*60+Number(t.deadline.slice(3,5));
 return{day,date,minutes,done,pending,late,overdue:pending.filter(late).length,next:pending.find(t=>!late(t))?.id,greeting:minutes>=21*60+3};
}
export const taskTime=value=>new Date(value).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
export const scheduledToday=(schedules,day)=>(schedules||[]).filter(s=>isWorkingDay(day,s.start_date));
