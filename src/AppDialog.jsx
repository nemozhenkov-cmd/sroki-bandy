import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
export default function AppDialog({title,onClose,children,fullScreen=false,busy=false,className=''}){
 const ref=useRef(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement,old=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.querySelector('button')?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();close.current()}if(e.key==='Tab'){const nodes=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true})}},[]);
 return createPortal(<div className={'modal app-dialog-overlay '+(fullScreen?'full-dialog-overlay ':'')+className}><section ref={ref} className={'dialog '+(fullScreen?'full-dialog':'')} role="dialog" aria-modal="true" aria-label={title}><div className="sheethead"><h2>{title}</h2><button className="close-button" aria-label="Закрыть окно" disabled={busy} onClick={onClose}><X/></button></div>{children}</section></div>,document.body)
}
