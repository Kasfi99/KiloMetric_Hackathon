import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {tourKey} from './tour-steps.js';

// Seen state is per device and role. Storage can be blocked; the tour then simply shows again.
export function tourSeen(role){try{return localStorage.getItem(tourKey(role))==='done';}catch{return false;}}
export function markTourSeen(role){try{localStorage.setItem(tourKey(role),'done');}catch{}}

const GAP=12,EDGE=16,PAD=6;
const find=target=>target?document.querySelector(`[data-tour="${target}"]`):null;
function visibleRect(el){
 if(!el)return null;
 const r=el.getBoundingClientRect();
 if(!(r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight))return null;
 // Clip to the viewport so a tall table does not push the outline off-screen.
 const top=Math.max(r.top-PAD,PAD),bottom=Math.min(r.bottom+PAD,innerHeight-PAD);
 return {top,left:r.left-PAD,width:r.width+PAD*2,height:bottom-top};
}

// Step-by-step guide: opens each step's page via go(), spotlights its [data-tour] target
// and keeps a small card beside it. A missing or hidden target gets a centred card.
export function Tour({steps,go,onClose}){
 const [i,setI]=useState(0),[rect,setRect]=useState(null),[pos,setPos]=useState(null),card=useRef(null),next=useRef(null);
 const step=steps[i],last=i===steps.length-1;
 useEffect(()=>{if(step.page)go(step.page);},[i]);
 useEffect(()=>{
  let frame,tries=0;
  const measure=()=>setRect(visibleRect(find(step.target)));
  // The page switched by go() renders a little later: retry for ~0.5 s, then fall back to a centred card.
  const settle=()=>{const el=find(step.target);if(!el&&step.target&&++tries<30){frame=requestAnimationFrame(settle);return;}el?.scrollIntoView({block:'center'});measure();next.current?.focus();};
  setRect(null);frame=requestAnimationFrame(settle);
  addEventListener('resize',measure);addEventListener('scroll',measure,true);
  return()=>{cancelAnimationFrame(frame);removeEventListener('resize',measure);removeEventListener('scroll',measure,true);};
 },[i]);
 useLayoutEffect(()=>{
  const h=card.current?.offsetHeight||0,w=card.current?.offsetWidth||0;
  if(!rect){setPos(null);return;}
  let top=rect.top+rect.height+GAP;
  if(top+h>innerHeight-EDGE)top=rect.top-h-GAP;
  if(top<EDGE)top=innerHeight-h-EDGE;
  setPos({top,left:Math.min(Math.max(rect.left,EDGE),innerWidth-w-EDGE)});
 },[rect,i]);
 const move=d=>{const n=i+d;if(n<0)return;if(n>=steps.length)onClose();else setI(n);};
 function keys(e){
  if(e.key==='Escape'){e.preventDefault();onClose();}
  else if(e.key==='ArrowRight'){e.preventDefault();move(1);}
  else if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}
  else if(e.key==='Tab'){const f=[...card.current.querySelectorAll('button')],k=f.indexOf(document.activeElement);e.preventDefault();f[(k+(e.shiftKey?-1:1)+f.length)%f.length]?.focus();}
 }
 return <>
  <div className={rect?'tour-block':'tour-block dim'} onClick={e=>e.stopPropagation()}/>
  {rect&&<div className="tour-spot" style={rect}/>}
  <div ref={card} className={pos?'tour-card':'tour-card centred'} style={pos||undefined} role="dialog" aria-modal="true" aria-labelledby="tour-title" onKeyDown={keys}>
   <div className="tour-head"><h2 id="tour-title">{step.title}</h2><span>{i+1} / {steps.length}</span></div>
   <p aria-live="polite">{step.body}</p>
   <div className="tour-actions">
    {!last&&<button className="text-button" onClick={onClose}>Skip guide</button>}
    <span/>
    {i>0&&<button className="secondary" onClick={()=>move(-1)}>Back</button>}
    <button ref={next} className="primary" onClick={()=>move(1)}>{last?'Done':'Next'}</button>
   </div>
  </div>
 </>;
}
