export const ACTIONS={added:'Добавлено',updated:'Изменено',disposed:'Списано'};
export const moscowDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function shiftDay(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function periodRange(period,now=new Date()){const to=moscowDay(now);return{from:shiftDay(to,period==='30'?-29:period==='7'?-6:0),to}}
export function validRange(from,to){return /^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&Number.isFinite(Date.parse(from))&&Number.isFinite(Date.parse(to))&&new Date(from+'T12:00:00Z').toISOString().slice(0,10)===from&&new Date(to+'T12:00:00Z').toISOString().slice(0,10)===to&&from<=to&&(Date.parse(to)-Date.parse(from))/86400000<=365}
export function unitsText(row){const known=Number(row.disposed_units||0),missing=Number(row.unknown_units||0);if(!Number(row.disposed))return 'Нет списаний';if(missing===Number(row.disposed))return 'Количество не сохранено';return missing?`${known} шт. · без количества: ${missing}`:`${known} шт.`}
export const actorKey=row=>row.user_id||'unknown';
export function mergeHistory(existing,next){const seen=new Set(existing.map(x=>x.id));return [...existing,...next.filter(x=>!seen.has(x.id))]}
export function groupDayLabel(day,today=moscowDay()){return day===today?'Сегодня':day===shiftDay(today,-1)?'Вчера':new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}
