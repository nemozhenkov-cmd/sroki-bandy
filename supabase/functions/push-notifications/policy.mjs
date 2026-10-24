export const APP_URL = 'https://nemozhenkov-cmd.github.io/sroki-bandy/';
export function validSubscription(s) {
  try {
    const u = new URL(s.endpoint);
    const host = u.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    return allowed && u.protocol === 'https:' && !u.port && !u.username && !u.password && s.endpoint.length < 2048 && /^[A-Za-z0-9_-]+$/.test(s.keys.p256dh) && /^[A-Za-z0-9_-]+$/.test(s.keys.auth) && decode(s.keys.p256dh).length === 65 && decode(s.keys.auth).length === 16;
  } catch { return false; }
}
export function moscowDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function dispatchWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).split(':').map(Number);
  const minute = parts[0]*60+parts[1];
  return minute >= 510 && minute < 1320;
}
export function tomorrow(date) {
  return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
}
export function countsFor(user, stores, items, date) {
  const ids = new Set(stores.filter(s=>s.is_active && (['admin','tm'].includes(user.role) || s.id === user.store_id)).map(s=>s.id));
  if (!['admin','tm','manager','srtz_rtz'].includes(user.role)) return {expired:0,today:0};
  const next = tomorrow(date);
  return items.reduce((n,item)=> {
    if (!ids.has(item.store_id) || item.is_disposed) return n;
    if(item.expiry_date <= date) n.expired++;
    else if(item.expiry_date === next) n.today++;
    return n;
  },{expired:0,today:0});
}
export function notificationBody(counts) {
  return `Списать сегодня: ${counts.today}. Просрочено: ${counts.expired}. Откройте приложение, чтобы проверить товары.`;
}
