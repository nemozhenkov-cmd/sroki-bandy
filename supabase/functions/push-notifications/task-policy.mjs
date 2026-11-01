export const TASKS = [
 [1,'Утренний отчёт в группу','08:30'],[2,'Проведение пятиминутки','08:45'],[3,'Пересчет главной кассы','09:00'],[4,'Пересчет ТОП','10:00'],[5,'Пересчет ЛИ','12:00'],[6,'Закрытие смены сотруднику Клининга','14:00'],[7,'Проверка сроков годности','18:30'],[8,'Пересчет ГАП','19:00'],[9,'Подготовка склада на след. день','20:00'],[10,'Пересчет главной кассы','20:30'],[11,'Проверка холодильных бонет (створки/работоспособность)','20:45'],[12,'Проверка дверей магазина','20:58'],[13,'Проведение табеля сотрудникам в т.ч. СМЗ','21:00'],[14,'Вы отлично провели смену! Доброй ночи :)','21:03']
].map(([id,title,deadline])=>({id,title,deadline}));
export const defaultReminders=()=>TASKS.map(t=>({task_id:t.id,enabled:false,time:t.deadline}));
export function isWorkingDay(day,start){const diff=(Date.parse(day+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;return Number.isInteger(diff)&&diff>=0&&diff%4<2;}
export const taskRole=role=>role==='manager'||role==='srtz';
export const moscowDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function taskNotification(row){return {type:'store-task',title:'Задача на смену',body:`${row.title}. До ${row.deadline.slice(0,5)}.`,tag:`task-${row.notice_id}-${row.generation}`,task:{token:row.action_token,id:row.task_id,day:row.task_day},actions:[{action:'task-done',title:'Выполнено'},{action:'task-snooze',title:'Отложить'}]};}
export async function dispatchTasks({db,config,send,validSubscription,now=Date.now}){
 if(!config.enabled)return {sent:0,skipped:true};
 const check=r=>{if(r.error)throw Error('Task notification database operation failed');return r.data};
 check(await db.rpc('prepare_store_task_push'));
 let sent=0;const deadline=now()+45000;
 while(now()<deadline){
  const row=check(await db.rpc('claim_next_store_task_push'));if(!row)break;
  try{
   if(!validSubscription(row.subscription)){check(await db.rpc('finish_store_task_push',{p_delivery_id:row.delivery_id,p_state:'skipped'}));continue;}
   const result=await send(row.subscription,config,taskNotification(row));
   check(await db.rpc('finish_store_task_push',{p_delivery_id:row.delivery_id,p_state:result==='sent'?'sent':'skipped'}));
   if(result==='sent')sent++;
  }catch{check(await db.rpc('finish_store_task_push',{p_delivery_id:row.delivery_id,p_state:'failed'}));}
 }
 return {sent};
}
