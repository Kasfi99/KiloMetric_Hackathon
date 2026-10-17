import React,{useState,useEffect,useRef} from 'react';
import {AlertCircle,X} from 'lucide-react';
import {api,SPEC_FIELDS} from './driver.jsx';

const blank=Object.fromEntries(SPEC_FIELDS.map(([k])=>[k,'']));
const fmt=v=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(v);
export const openReports=truck=>(truck?.specReports||[]).filter(r=>!r.resolvedAt);
export function specSummary(s){return s?`${fmt(s.heightM)} × ${fmt(s.widthM)} × ${fmt(s.lengthM)} m · ${s.axles} axles · ${fmt(s.maxGrossKg)} kg max`:null;}

// Truck master specifications in a modal (admin and workshop edit, manager reads). Trips and route checks read these values.
export function TruckSpecsPanel({truck,role,reload,notify,onClose}){
 const editable=['admin','workshop'].includes(role);
 const [form,setForm]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef(null),live=useRef({busy,onClose});live.current={busy,onClose};
 useEffect(()=>{setForm(truck.specifications?Object.fromEntries(SPEC_FIELDS.map(([k])=>[k,String(truck.specifications[k])])):blank);setError('');},[truck.id,JSON.stringify(truck.specifications)]);
 // Same dialog behaviour as RecordModal: focus inside, Tab trapped, Esc closes, page behind does not scroll.
 useEffect(()=>{const previous=document.activeElement,focusable=()=>[...dialog.current.querySelectorAll('button:not(:disabled),input')];(focusable().find(e=>e.tagName==='INPUT')||focusable()[0])?.focus();
  function key(e){if(e.key==='Escape'&&!live.current.busy)live.current.onClose();if(e.key==='Tab'){const all=focusable(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
  document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;previous?.focus();};},[]);
 async function send(body,message){setBusy(true);setError('');try{await api(`/api/trucks/${truck.id}/specifications`,'PUT',body);await reload();notify(message);onClose();}catch(e){setError(e.message);setBusy(false);}}
 const save=e=>{e.preventDefault();send(Object.fromEntries(SPEC_FIELDS.map(([k])=>[k,form[k]===''?null:Number(form[k])])),`Specifications saved for ${truck.plate}.`);};
 const reports=[...(truck.specReports||[])].reverse(),open=openReports(truck);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section ref={dialog} className="modal truck-specs-modal" role="dialog" aria-modal="true" aria-labelledby="specs-title">
  <div className="modal-header"><div><span className="eyebrow">TRUCK SPECIFICATIONS</span><h2 id="specs-title">{truck.plate}</h2></div><button type="button" className="icon-button" aria-label="Close specifications" onClick={onClose} disabled={busy}><X size={22}/></button></div>
  <div className="modal-body">
   <p>Used for truck route restrictions and weight checks on every trip. Drivers see these values and cannot change them.</p>
   {!truck.specifications&&<div className="spec-warning" role="status"><AlertCircle size={16}/>Not set. Trips on this truck start without height, width, length and weight checks.</div>}
   <form onSubmit={save}><div className="spec-form-grid">{SPEC_FIELDS.map(([key,label,unit])=><label className="form-field" key={key}><span>{label}{unit&&` (${unit})`}</span><input type="number" required readOnly={!editable} step={key==='axles'?1:'any'} min={{heightM:0.5,widthM:0.5,lengthM:1,axles:2,tareKg:500,maxGrossKg:500}[key]} max={{heightM:10,widthM:10,lengthM:50,axles:20,tareKg:200000,maxGrossKg:250000}[key]} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></label>)}</div>
    {error&&<div className="inline-error" role="alert">{error}</div>}
    {editable?<div className="user-editor-actions">{truck.specifications&&<button type="button" className="secondary" disabled={busy} onClick={()=>window.confirm(`Clear the specifications of ${truck.plate}? Route restrictions will not be checked for its trips.`)&&send({specifications:null},`Specifications cleared for ${truck.plate}.`)}>Clear</button>}<button className="primary" disabled={busy}>{busy?'Saving…':'Save specifications'}</button></div>:<small className="spec-note">Only administrators and workshop staff can change specifications.</small>}
    {editable&&open.length>0&&<small className="spec-note">Saving marks the {open.length} open driver report{open.length>1?'s':''} as resolved.</small>}
   </form>
   <div className="spec-reports"><h3>Driver mismatch reports <span className="count">{open.length} open</span></h3>
    {reports.length?reports.map(r=><div className={'spec-report'+(r.resolvedAt?' resolved':'')} key={r.id}><p>“{r.note}”</p><small>{r.driverName} · {new Date(r.at).toLocaleString('en-GB')}{r.resolvedAt?` · resolved ${new Date(r.resolvedAt).toLocaleDateString('en-GB')}`:' · open'}</small></div>):<p className="spec-note">No reports from drivers.</p>}
   </div>
  </div>
 </section></div>;
}
