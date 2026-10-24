const BASE = '/sroki-bandy/';
export function pushSupport() {
  if(!globalThis.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in globalThis) || !('Notification' in globalThis)) return false;
  return true;
}
export async function pushRegistration() {
  const registration = await navigator.serviceWorker.getRegistration(BASE);
  if(!registration?.active) throw new Error('Установите обновление приложения и откройте его заново.');
  return registration;
}
export async function pushRequest(supabase, action, subscription) {
  const {data,error} = await supabase.functions.invoke('push-notifications',{body:{action,subscription:subscription?.toJSON()}});
  if(error) {
    let message = 'Не удалось связаться с сервисом уведомлений. Попробуйте позже.';
    try { message = (await error.context.json()).error || message; } catch { /* Network error has no JSON response. */ }
    throw new Error(message);
  }
  if(data?.error) throw new Error(data.error);
  return data;
}
export async function disablePush(supabase) {
  if(!pushSupport()) return;
  const registration = await navigator.serviceWorker.getRegistration(BASE);
  const subscription = await registration?.pushManager.getSubscription();
  if(!subscription) return;
  // Delete the server registration first, so an offline logout cannot leave account data on a shared phone.
  await pushRequest(supabase,'unsubscribe',subscription);
  await subscription.unsubscribe();
}
export function publicKeyBytes(value) {
  const base64 = value.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length/4)*4,'=')),c=>c.charCodeAt(0));
}
