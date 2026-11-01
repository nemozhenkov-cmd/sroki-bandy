export {TASKS,defaultReminders,isWorkingDay,taskRole,moscowDate} from '../supabase/functions/push-notifications/task-policy.mjs';
export const taskCacheKey=id=>'store-tasks-v1:'+id;
export function readTaskCache(user){try{const s=JSON.parse(localStorage.getItem(taskCacheKey(user.id)));return s?.store_id===user.store_id?s:null}catch{return null}}
export function clearTaskCache(id){localStorage.removeItem(taskCacheKey(id));}
