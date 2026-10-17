import React,{useEffect,useRef} from 'react';
import {X,ChevronUp,ChevronDown,ChevronsUpDown,ChevronLeft,ChevronRight} from 'lucide-react';

// Building blocks shared by the Fleet and Spare parts tables: filters with chips, sortable headers, pagination and the side detail panel.
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
// Rows open their panel through a .row-open button carrying data-row-id; closing the panel returns focus there.
export function focusRow(id){requestAnimationFrame(()=>document.querySelector(`.row-open[data-row-id="${CSS.escape(String(id))}"]`)?.focus());}

// Behaves like the other dialogs (focus inside, Tab trapped, Esc closes), but only while it is the topmost dialog:
// record modals open on top of it and handle their own keys.
export function SidePanel({id,eyebrow,title,subtitle,closeLabel,onClose,actions,wide,children}){
 const panel=useRef(null),live=useRef(onClose);live.current=onClose;
 useEffect(()=>{const focusable=()=>[...panel.current.querySelectorAll('button:not(:disabled),a[href]')];panel.current.querySelector('.panel-close')?.focus();
  function key(e){const dialogs=document.querySelectorAll('[role="dialog"]');if(dialogs[dialogs.length-1]!==panel.current)return;if(e.key==='Escape'){e.preventDefault();live.current();}if(e.key==='Tab'){const all=focusable(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
  document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;};},[]);
 return <div className="side-panel-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><aside ref={panel} className={'side-panel'+(wide?' wide':'')} role="dialog" aria-modal="true" aria-labelledby={id}>
  <div className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2><small>{subtitle}</small></div><button type="button" className="icon-button panel-close" aria-label={closeLabel} onClick={onClose}><X size={22}/></button></div>
  <div className="side-panel-body">{children}</div>
  <div className="modal-footer side-panel-actions">{actions}</div>
 </aside></div>;
}
