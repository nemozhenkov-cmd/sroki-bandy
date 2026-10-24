import React,{useEffect,useState} from 'react';
import {pushSupport,pushRegistration,pushRequest,disablePush,publicKeyBytes} from './push-client.mjs';

export default function PushSettings({supabase,userId}) {
  const [enabled,setEnabled] = useState(false);
  const [busy,setBusy] = useState(false);
  const [checking,setChecking] = useState(true);
  const [message,setMessage] = useState('');
  const supported = pushSupport();
  useEffect(()=>{
    let alive = true;
    (async()=>{
      try {
        if(!supported) return;
        const registration = await pushRegistration();
        const subscription = await registration.pushManager.getSubscription();
        if(subscription) {
          const status = await pushRequest(supabase,'status',subscription);
          if(alive) setEnabled(status.subscribed && Notification.permission === 'granted');
        }
      } catch(e) { if(alive) setMessage(e.message); }
      finally { if(alive) setChecking(false); }
    })();
    return ()=>{alive=false;};
  },[supabase,userId,supported]);
  const run = async operation => {
    setBusy(true);setMessage('');
    try { await operation(); } catch(e) { setMessage(e.message); }
    finally { setBusy(false); }
  };
  const enable = ()=>{
    // Request permission immediately on the user's tap (required by iOS).
    const permission = Notification.requestPermission();
    run(async()=>{
      if(await permission !== 'granted') throw new Error('Разрешите уведомления для приложения в настройках телефона или браузера.');
      const registration = await pushRegistration();
      const config = await pushRequest(supabase,'config');
      let subscription = await registration.pushManager.getSubscription();
      // A fresh subscription avoids carrying an endpoint across accounts on a shared device.
      if(subscription) { await subscription.unsubscribe(); subscription=null; }
      subscription = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBytes(config.publicKey)});
      try { await pushRequest(supabase,'subscribe',subscription); }
      catch(e) { await subscription.unsubscribe(); throw e; }
      setEnabled(true);
      setMessage(config.enabled ? 'Уведомления включены на этом устройстве.' : 'Устройство подключено. Ежедневная отправка будет включена при публикации. Можно отправить проверку.');
    });
  };
  return <section className="push-settings" aria-labelledby="push-title">
    <h3 id="push-title">Уведомления на телефон</h3>
    <p>Ежедневно в 08:30 и 18:30 по Москве: товары, которые нужно списать сегодня, и просроченные. Если таких товаров нет, уведомление не придёт.</p>
    <p>Уведомления относятся к доступным вам магазинам и включаются отдельно на каждом устройстве.</p>
    {!supported ? <p>Добавьте приложение на главный экран и откройте его оттуда. На iPhone требуется iOS 16.4 или новее. Если кнопка не появилась, проверьте поддержку уведомлений в браузере.</p> : <>
      <p><b>{checking ? 'Проверяем подключение…' : enabled ? 'Включены на этом устройстве' : 'Выключены на этом устройстве'}</b></p>
      {Notification.permission === 'denied' && <p>Уведомления заблокированы. Разрешите их в настройках телефона или браузера, затем вернитесь в приложение.</p>}
      <div className="push-actions">
        <button className="secondary" disabled={busy || checking} onClick={enabled ? ()=>run(async()=>{await disablePush(supabase);setEnabled(false);setMessage('Уведомления на этом устройстве выключены.');}) : enable}>{busy ? 'Подождите…' : enabled ? 'Выключить уведомления' : 'Включить уведомления'}</button>
        {enabled && <button className="secondary" disabled={busy || checking} onClick={()=>run(async()=>{
          const subscription = await (await pushRegistration()).pushManager.getSubscription();
          if(!subscription) {setEnabled(false);throw new Error('Включите уведомления заново.');}
          await pushRequest(supabase,'test',subscription);
          setMessage('Проверка отправлена. Посмотрите уведомления телефона.');
        })}>Отправить проверку</button>}
      </div>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
