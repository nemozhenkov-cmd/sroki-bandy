// Retain the video element so cancellation also stops a stream acquired after unmount.
export function createRearScanner({reader,video,mediaDevices,onCode}){
 let cancelled=false,accepted=false,controls;
 const stop=()=>{try{controls?.stop?.()}catch{}try{reader.reset?.()}catch{}try{video.srcObject?.getTracks().forEach(t=>t.stop())}catch{}};
 const detected=result=>{if(cancelled||accepted||!result)return;const code=String(result.getText()||'').trim();if(!code)return;accepted=true;stop();onCode(code)};
 const ready=(async()=>{try{
  try{controls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{exact:'environment'},width:{ideal:1280},height:{ideal:720}}},video,detected)}catch(first){if(cancelled)return null;const devices=await mediaDevices.enumerateDevices();if(cancelled)return null;const rear=devices.find(d=>d.kind==='videoinput'&&/back|rear|environment/i.test(d.label||''));if(!rear)throw first;controls=await reader.decodeFromConstraints({audio:false,video:{deviceId:{exact:rear.deviceId},width:{ideal:1280},height:{ideal:720}}},video,detected)}
  if(cancelled||accepted){stop();return null}return controls;
 }catch(e){stop();if(!cancelled)throw e;return null}})();
 return{ready,cancel(){cancelled=true;stop()}};
}
