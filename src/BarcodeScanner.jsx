import {createRearScanner} from './scanner-core.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {BrowserMultiFormatReader} from '@zxing/browser';
import {BarcodeFormat,DecodeHintType} from '@zxing/library';
import {Flashlight,RefreshCw} from 'lucide-react';
import AppDialog from './AppDialog.jsx';
export default function BarcodeScanner({onCode,onClose}){
 const video=useRef(null),callback=useRef(onCode),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[ready,setReady]=useState(false),[torch,setTorch]=useState(false),[canTorch,setCanTorch]=useState(false);callback.current=onCode;
 useEffect(()=>{let alive=true,session;
  setError('');setReady(false);setCanTorch(false);setTorch(false);
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Камера недоступна. Введите штрихкод вручную.');
   const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E]],[DecodeHintType.TRY_HARDER,true]]);
   session=createRearScanner({reader:new BrowserMultiFormatReader(hints),video:video.current,mediaDevices:navigator.mediaDevices,onCode:code=>callback.current(code)});
   session.ready.then(controls=>{if(!alive||!controls)return;setReady(true);const track=video.current?.srcObject?.getVideoTracks()[0];setCanTorch(!!track?.getCapabilities?.().torch)}).catch(e=>{if(alive)setError(['NotAllowedError','SecurityError'].includes(e.name)?'Разрешите камеру в настройках телефона или браузера. Можно вернуться и ввести штрихкод вручную.':e.message||'Не удалось открыть заднюю камеру. Введите код вручную.')});
  }catch(e){setError(e.message)}
  return()=>{alive=false;session?.cancel()};
 },[attempt]);
 const toggleTorch=async()=>{try{const track=video.current?.srcObject?.getVideoTracks()[0];await track.applyConstraints({advanced:[{torch:!torch}]});setTorch(x=>!x)}catch{setCanTorch(false);setError('Фонарик недоступен на этом устройстве. Сканирование можно продолжить.')}};
 return <AppDialog title="Сканировать штрихкод" onClose={onClose} fullScreen className="barcode-overlay"><div className="barcode-camera"><video ref={video} autoPlay playsInline muted/><div className="barcode-target" aria-hidden="true"><i/><i/><i/><i/></div>{!ready&&!error&&<p role="status">Открываем заднюю камеру…</p>}</div><div className="barcode-instructions"><b>Наведите рамку на штрихкод</b><p>После распознавания вернёмся к товару автоматически.</p>{canTorch&&<button className="secondary" aria-pressed={torch} onClick={toggleTorch}><Flashlight size={18}/>{torch?'Выключить фонарик':'Включить фонарик'}</button>}{error&&<p role="alert">{error}</p>}{error&&!ready&&<button className="secondary" onClick={()=>setAttempt(x=>x+1)}><RefreshCw size={16}/>Попробовать ещё</button>}<button className="barcode-manual" onClick={onClose}>Ввести штрихкод вручную</button></div></AppDialog>
}
