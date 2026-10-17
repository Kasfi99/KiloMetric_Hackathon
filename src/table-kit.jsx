import React,{useEffect,useRef,useState} from 'react';
import {X,ChevronUp,ChevronDown,ChevronsUpDown,ChevronLeft,ChevronRight} from 'lucide-react';

// Building blocks shared by the Fleet and Spare parts tables: filters with chips, sortable headers, pagination, tabs and the detail modal.
export const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;

function pageList(pages,current){
 if(pages<=7)return Array.from({length:pages},(_,i)=>i+1);
 const keep=[...new Set([1,pages,current-1,current,current+1])].filter(p=>p>=1&&p<=pages).sort((a,b)=>a-b);
 return keep.flatMap((p,i)=>i&&p-keep[i-1]>1?['gap'+p,p]:[p]);
}
export function paginate(rows,page,size){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(page,pages),start=(current-1)*size;return {pages,current,start,visible:rows.slice(start,start+size)};}
// Clicking the active column flips its direction; a new column starts in its own first direction.
export const nextSort=(s,key,first='desc')=>s.key===key?{key,dir:s.dir==='desc'?'asc':'desc'}:{key,dir:first};

export function SortHeader({label,active,dir,onSort}){const Icon=active?(dir==='desc'?ChevronDown:ChevronUp):ChevronsUpDown;return <th aria-sort={active?(dir==='desc'?'descending':'ascending'):'none'}><button type="button" className={'sort-button'+(active?' active':'')} onClick={onSort}>{label}<Icon size={13} aria-hidden="true"/></button></th>;}
export function FilterSelect({label,value,onChange,options}){return <label className="list-filter"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}><option value="">All</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;}
export function FilterChips({chips,onClear}){
 if(!chips.length)return null;
 return <div className="filter-chips">{chips.map(([label,val,remove])=><button type="button" className="filter-chip" key={label} aria-label={`Remove filter ${label}: ${val}`} onClick={remove}>{label}: {val}<X size={12} aria-hidden="true"/></button>)}<button type="button" className="text-button" onClick={onClear}>Clear filters</button></div>;
}
export function Pager({total,start,shown,size,onSize,current,pages,onPage,label}){
 if(!total)return null;
 return <div className="pager"><span>Showing {start+1}–{start+shown} of {total}</span><label className="page-size">Rows per page<select value={size} onChange={e=>onSize(Number(e.target.value))}>{[10,25,50].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
  <nav aria-label={label}><button type="button" className="page-button" aria-label="Previous page" disabled={current===1} onClick={()=>onPage(current-1)}><ChevronLeft size={15}/></button>{pageList(pages,current).map(p=>typeof p==='string'?<span key={p} className="page-gap">…</span>:<button type="button" key={p} className={'page-button'+(p===current?' current':'')} aria-label={`Page ${p}`} aria-current={p===current?'page':undefined} onClick={()=>onPage(p)}>{p}</button>)}<button type="button" className="page-button" aria-label="Next page" disabled={current===pages} onClick={()=>onPage(current+1)}><ChevronRight size={15}/></button></nav></div>;
}
// Rows open their detail modal through a .row-open button carrying data-row-id; closing the modal returns focus there.
export function focusRow(id){requestAnimationFrame(()=>document.querySelector(`.row-open[data-row-id="${CSS.escape(String(id))}"]`)?.focus());}
// Previous / next through the table's rows in their current filter and sort order (all pages). index -1: the row is not in that list.
export function listPosition(ids,id,select){const index=ids.indexOf(id);return {index,total:ids.length,prev:index>0?()=>select(ids[index-1]):null,next:index>=0&&index<ids.length-1?()=>select(ids[index+1]):null};}
// Arrow keys, Home and End move between tabs; the focused tab is activated.
export function tabKeys(e){const step={ArrowRight:1,ArrowLeft:-1}[e.key],list=[...e.currentTarget.querySelectorAll('[role="tab"]')];let i=list.indexOf(document.activeElement);if(i<0)return;
 if(step)i=(i+step+list.length)%list.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=list.length-1;else return;e.preventDefault();list[i].focus();list[i].click();}

// Centred, tabbed detail dialog for a table row. Behaves like the other dialogs (focus inside, Tab trapped, Esc closes),
// but only while it is the topmost dialog: record and specification modals open on top of it and handle their own keys.
// tabs: [{id,label,count?,content}]; without tabs the children fill the body.
export function DetailModal({id,itemId,eyebrow,title,subtitle,summary,position,noun,closeLabel,onClose,tabs,actions,children}){
 const dialog=useRef(null),body=useRef(null),live=useRef(onClose);live.current=onClose;
 const [tab,setTab]=useState(tabs?.[0]?.id);
 const active=tabs?.length?tabs.find(t=>t.id===tab)||tabs[0]:null;
 const start=()=>dialog.current.querySelector('[role="tab"][aria-selected="true"]')||dialog.current.querySelector('.detail-close');
 useEffect(()=>{const focusable=()=>[...dialog.current.querySelectorAll('button:not(:disabled):not([tabindex="-1"]),a[href],select,input,[tabindex="0"]')];start().focus();
  function key(e){const dialogs=document.querySelectorAll('[role="dialog"]');if(dialogs[dialogs.length-1]!==dialog.current)return;if(e.key==='Escape'){e.preventDefault();live.current();}if(e.key==='Tab'){const all=focusable(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
  document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;};},[]);
 // At the end of the list the button just used becomes disabled; keep focus inside on the other one.
 useEffect(()=>{const a=document.activeElement;if(!dialog.current.contains(a)||a.disabled)(dialog.current.querySelector('.detail-nav .page-button:not(:disabled)')||start()).focus();},[itemId]);
 useEffect(()=>{body.current.scrollTop=0;},[itemId,active?.id]);
 return <div className="modal-backdrop detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby={id}>
  <div className="modal-header"><div className="detail-title"><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2><small>{subtitle}</small></div>
   <div className="detail-nav">{position&&<><span className="detail-pos">{position.index<0?'Not in the current list':`${position.index+1} of ${position.total}`}</span><button type="button" className="page-button" aria-label={`Previous ${noun}`} disabled={!position.prev} onClick={position.prev||undefined}><ChevronLeft size={15}/></button><button type="button" className="page-button" aria-label={`Next ${noun}`} disabled={!position.next} onClick={position.next||undefined}><ChevronRight size={15}/></button></>}<button type="button" className="icon-button detail-close" aria-label={closeLabel} onClick={onClose}><X size={22}/></button></div></div>
  {summary&&<div className="detail-summary">{summary}</div>}
  {active&&<div className="category-tabs detail-tabs" role="tablist" aria-label={`${eyebrow.toLowerCase()} sections`} onKeyDown={tabKeys}>{tabs.map(t=><button type="button" role="tab" key={t.id} id={`${id}-tab-${t.id}`} aria-selected={t===active} aria-controls={`${id}-panel`} tabIndex={t===active?0:-1} className={'category-tab'+(t===active?' active':'')} onClick={()=>setTab(t.id)}>{t.label}{t.count!=null&&<span className="tab-count">{t.count}</span>}</button>)}</div>}
  <div ref={body} className="detail-body" id={`${id}-panel`} role={active?'tabpanel':undefined} aria-labelledby={active?`${id}-tab-${active.id}`:undefined} tabIndex={active?0:undefined}>{active?active.content:children}</div>
  <div className="modal-footer detail-actions">{actions}</div>
 </section></div>;
}
