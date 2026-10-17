import React,{useState,useEffect,useRef} from 'react';
import {Truck,Search,X,ChevronUp,ChevronDown,ChevronsUpDown,ChevronLeft,ChevronRight,Pencil,Trash2,Wrench,Ruler} from 'lucide-react';
import {eventCost} from '../lib/analytics.js';
import {openReports} from './truck-specs.jsx';
import {money,number,cpk,date} from './format.js';

const HIGH=1.2;
// Up to two decimals so a truck just under the threshold (1,18×) never reads as 1,2× without the highlight.
const ratio=v=>new Intl.NumberFormat('id-ID',{minimumFractionDigits:1,maximumFractionDigits:2}).format(v)+'×';
const share=v=>v>0&&v<0.01?'<1%':new Intl.NumberFormat('id-ID',{style:'percent',maximumFractionDigits:0}).format(v);
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
const COST={above:`Above similar trucks (≥ ${ratio(HIGH)})`,unknown:'CPK unknown'};
const SPECS={set:'Set',unset:'Not set',reports:'Open driver reports'};
const SORT_LABEL={cpk:'CPK · IDR/km',ratio:'vs similar trucks',spend:'Spend',distance:'Distance tracked',odometer:'Odometer'};

// Peer CPK is a ratio (total spend ÷ total distance) of the other trucks with the same model and profile that have distance.
// With no such peer the truck is compared with the fleet CPK instead, and the label says so.
export function comparison(t,trucks,fleetCpk){
 const peers=trucks.filter(p=>p.id!==t.id&&p.model===t.model&&p.duty===t.duty&&p.distance>0);
 const distance=peers.reduce((s,p)=>s+p.distance,0),spend=peers.reduce((s,p)=>s+p.spend,0);
 const base=peers.length?{scope:'peers',cpk:spend/distance,count:peers.length}:{scope:'fleet',cpk:fleetCpk??null,count:0};
 return {...base,ratio:t.cpk!=null&&base.cpk>0?t.cpk/base.cpk:null};
}
// Same arithmetic as eventCost, split into its components and by part category.
function costBreakdown(records,parts){
 const total={parts:0,install:0,labor:0,other:0},categories=new Map();
 for(const m of records){
  for(const i of m.items){const price=Number(i.quantity)*Number(i.unitCost),labor=Number(i.labor),category=parts.find(p=>p.id===i.partId)?.category||'Part not in catalog';total.parts+=price;total.install+=labor;categories.set(category,(categories.get(category)||0)+price+labor);}
  total.labor+=Number(m.labor);total.other+=Number(m.otherCost);
 }
 return {total,categories:[...categories].sort((a,b)=>b[1]-a[1])};
}
function pageList(pages,current){
 if(pages<=7)return Array.from({length:pages},(_,i)=>i+1);
 const keep=[...new Set([1,pages,current-1,current,current+1])].filter(p=>p>=1&&p<=pages).sort((a,b)=>a-b);
 return keep.flatMap((p,i)=>i&&p-keep[i-1]>1?['gap'+p,p]:[p]);
}

export function FleetPage({data,onEdit,onDelete,onLog,onSpecs}){
 const a=data.analytics;
 const [search,setSearch]=useState(''),[model,setModel]=useState(''),[duty,setDuty]=useState(''),[cost,setCost]=useState(''),[specs,setSpecs]=useState('');
 const [sort,setSort]=useState({key:'cpk',dir:'desc'}),[page,setPage]=useState(1),[size,setSize]=useState(10),[selectedId,setSelectedId]=useState(null);
 const reset=fn=>v=>{fn(v);setPage(1);};
 const rows=a.trucks.map(t=>{const record=data.trucks.find(v=>v.id===t.id)||t;return {t,record,cmp:comparison(t,a.trucks,a.fleetCpk),reports:openReports(record).length};});
 const models=[...new Set(a.trucks.map(t=>t.model))].sort(),duties=[...new Set(a.trucks.map(t=>t.duty))].sort();
 const q=search.trim().toLowerCase();
 const filtered=rows.filter(({t,record,cmp,reports})=>(!q||[t.plate,t.model,t.duty].some(v=>String(v).toLowerCase().includes(q)))&&(!model||t.model===model)&&(!duty||t.duty===duty)
  &&(!cost||(cost==='above'?cmp.ratio!==null&&cmp.ratio>=HIGH:t.cpk==null))
  &&(!specs||(specs==='set'?!!record.specifications:specs==='unset'?!record.specifications:reports>0)));
 // Unknown values (no CPK, no comparison, no visits) always sort to the end, whichever direction is chosen.
 const value=(r,key)=>key==='ratio'?r.cmp.ratio:key==='cpk'?r.t.cpk??null:key==='spend'?(r.t.visits?r.t.spend:null):r.t[key];
 const sorted=filtered.slice().sort((x,y)=>{const u=value(x,sort.key),v=value(y,sort.key);if(u==null||v==null)return u==null&&v==null?x.t.plate.localeCompare(y.t.plate):u==null?1:-1;return (sort.dir==='asc'?u-v:v-u)||x.t.plate.localeCompare(y.t.plate);});
 const pages=Math.max(1,Math.ceil(sorted.length/size)),current=Math.min(page,pages),start=(current-1)*size,visible=sorted.slice(start,start+size);
 const sortBy=key=>{setSort(s=>s.key===key?{key,dir:s.dir==='desc'?'asc':'desc'}:{key,dir:'desc'});setPage(1);};
 const chips=[search&&['Search',`“${search}”`,()=>reset(setSearch)('')],model&&['Model',model,()=>reset(setModel)('')],duty&&['Profile',duty,()=>reset(setDuty)('')],cost&&['Cost',COST[cost],()=>reset(setCost)('')],specs&&['Specs',SPECS[specs],()=>reset(setSpecs)('')]].filter(Boolean);
 const clear=()=>{setSearch('');setModel('');setDuty('');setCost('');setSpecs('');setPage(1);};
 const selected=rows.find(r=>r.t.id===selectedId);
 useEffect(()=>{if(selectedId&&!selected)setSelectedId(null);},[selectedId,!selected]);
 function closePanel(){const id=selectedId;setSelectedId(null);requestAnimationFrame(()=>document.querySelector(`.row-open[data-truck-id="${CSS.escape(id)}"]`)?.focus());}
 const th=(key)=>{const active=sort.key===key,Icon=active?(sort.dir==='desc'?ChevronDown:ChevronUp):ChevronsUpDown;return <th aria-sort={active?(sort.dir==='desc'?'descending':'ascending'):'none'}><button type="button" className={'sort-button'+(active?' active':'')} onClick={()=>sortBy(key)}>{SORT_LABEL[key]}<Icon size={13} aria-hidden="true"/></button></th>;};
 const select=(label,val,set,options)=><label className="fleet-filter"><span>{label}</span><select value={val} onChange={e=>reset(set)(e.target.value)}><option value="">All</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
 return <section className="card fleet-register">
  <div className="card-heading"><div className="title-count"><h2>Fleet register</h2><span className="count" aria-live="polite">{filtered.length===rows.length?plural(rows.length,'truck'):`${filtered.length} of ${plural(rows.length,'truck')}`}</span></div><label className="search"><Search size={16}/><input aria-label="Search plate, model or profile" placeholder="Search plate, model or profile…" value={search} onChange={e=>reset(setSearch)(e.target.value)}/></label></div>
  <div className="fleet-filters">{select('Truck model',model,setModel,models.map(m=>[m,m]))}{select('Operating profile',duty,setDuty,duties.map(d=>[d,d]))}{select('Cost status',cost,setCost,Object.entries(COST))}{select('Specs',specs,setSpecs,Object.entries(SPECS))}</div>
  {chips.length>0&&<div className="filter-chips">{chips.map(([label,val,remove])=><button type="button" className="filter-chip" key={label} aria-label={`Remove filter ${label}: ${val}`} onClick={remove}>{label}: {val}<X size={12} aria-hidden="true"/></button>)}<button type="button" className="text-button" onClick={clear}>Clear filters</button></div>}
  <div className="table-scroll"><table className="fleet-table"><thead><tr><th>Truck</th>{th('cpk')}{th('ratio')}{th('spend')}{th('distance')}{th('odometer')}<th>Operating profile</th><th>Specs</th></tr></thead>
  <tbody>{visible.map(({t,record,cmp,reports})=>{const high=cmp.ratio!==null&&cmp.ratio>=HIGH;return <tr key={t.id} className={'fleet-row'+(high?' row-high':'')} onClick={()=>setSelectedId(t.id)}>
   <td><button type="button" className="row-open" data-truck-id={t.id} aria-haspopup="dialog" aria-label={`Open details for ${t.plate}`} onClick={e=>{e.stopPropagation();setSelectedId(t.id);}}><span className="entity-icon"><Truck size={18}/></span><span><strong>{t.plate}</strong><small>{t.model}</small></span></button></td>
   <td>{t.cpk==null?<><strong>—</strong><small>CPK unknown · no distance tracked yet</small></>:<strong>{cpk(t.cpk)}</strong>}</td>
   <td>{cmp.ratio===null?'—':<span className={high?'ratio high':'ratio'}>{ratio(cmp.ratio)}</span>}{cmp.ratio!==null&&<small>{cmp.scope==='peers'?`${plural(cmp.count,'similar truck')} · ${cpk(cmp.cpk)} IDR/km`:`No similar truck · vs fleet ${cpk(cmp.cpk)} IDR/km`}</small>}</td>
   <td>{t.visits?money(t.spend):'—'}<small>{t.visits?plural(t.visits,'visit'):'No workshop visits'}</small></td>
   <td>{number(t.distance)} km<small>Since {date(t.baselineDate)}</small></td>
   <td>{number(t.odometer)} km</td>
   <td><span className="pill">{t.duty}</span></td>
   <td><button type="button" className="text-button spec-status" aria-haspopup="dialog" aria-label={`Specifications for ${t.plate}: ${record.specifications?'set':'not set'}${reports?`, ${plural(reports,'open driver report')}`:''}`} onClick={e=>{e.stopPropagation();onSpecs(t.id);}}>{record.specifications?'Set':'Not set'}{reports>0&&<span className="spec-reports-count"> · {plural(reports,'open report')}</span>}</button></td>
  </tr>;})}</tbody></table>
  {!rows.length&&<div className="empty"><Truck size={25}/><p>No trucks yet. Use Register at workshop to log a truck’s first visit.</p></div>}
  {rows.length>0&&!filtered.length&&<div className="empty"><Search size={25}/><p>No trucks match these filters.</p><button type="button" className="secondary" onClick={clear}>Clear filters</button></div>}
  </div>
  {sorted.length>0&&<div className="pager"><span>Showing {start+1}–{start+visible.length} of {sorted.length}</span><label className="page-size">Rows per page<select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <nav aria-label="Fleet register pages"><button type="button" className="page-button" aria-label="Previous page" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft size={15}/></button>{pageList(pages,current).map(p=>typeof p==='string'?<span key={p} className="page-gap">…</span>:<button type="button" key={p} className={'page-button'+(p===current?' current':'')} aria-label={`Page ${p}`} aria-current={p===current?'page':undefined} onClick={()=>setPage(p)}>{p}</button>)}<button type="button" className="page-button" aria-label="Next page" disabled={current===pages} onClick={()=>setPage(current+1)}><ChevronRight size={15}/></button></nav></div>}
  <div className="section-foot">Sorted by {SORT_LABEL[sort.key]}, {sort.dir==='desc'?'highest':'lowest'} first; unknown values last. Similar trucks = other trucks with the same model and operating profile; their CPK = total spend ÷ total distance. Highlighted rows are at least {ratio(HIGH)} their comparison.</div>
  {selected&&<TruckPanel row={selected} data={data} onClose={closePanel} onEdit={()=>onEdit(selected.t)} onDelete={()=>onDelete(selected.t)} onLog={()=>onLog(selected.t.id)} onSpecs={()=>onSpecs(selected.t.id)}/>}
 </section>;
}

function TruckPanel({row,data,onClose,onEdit,onDelete,onLog,onSpecs}){
 const {t,cmp,record,reports}=row,panel=useRef(null),live=useRef(onClose);live.current=onClose;
 // Behaves like the other dialogs (focus inside, Tab trapped, Esc closes), but only while it is the topmost dialog:
 // the record and specs modals open on top of it and handle their own keys.
 useEffect(()=>{const focusable=()=>[...panel.current.querySelectorAll('button:not(:disabled),a[href]')];panel.current.querySelector('.panel-close')?.focus();
  function key(e){const dialogs=document.querySelectorAll('[role="dialog"]');if(dialogs[dialogs.length-1]!==panel.current)return;if(e.key==='Escape'){e.preventDefault();live.current();}if(e.key==='Tab'){const all=focusable(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
  document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;};},[]);
 const records=data.maintenance.filter(m=>m.truckId===t.id);
 const {total,categories}=costBreakdown(records,data.parts);
 const parts=[['Parts',total.parts,'seg-1'],['Part installation labor',total.install,'seg-2'],['General labor',total.labor,'seg-3'],['Other charges',total.other,'seg-4']];
 const spend=records.reduce((s,m)=>s+eventCost(m),0);
 const top=records.slice().sort((x,y)=>eventCost(y)-eventCost(x)||y.date.localeCompare(x.date)).slice(0,5);
 const active=data.analytics.cycles.filter(c=>c.truckId===t.id&&c.status==='active').sort((x,y)=>x.category.localeCompare(y.category)||x.position.localeCompare(y.position));
 const partName=id=>{const p=data.parts.find(p=>p.id===id);return p?`${p.brand} · ${p.name}`:'Part not in catalog';};
 const peerText=cmp.scope==='peers'?`Similar trucks: ${cpk(cmp.cpk)} IDR/km · ${plural(cmp.count,'other truck')} on ${t.model} · ${t.duty}`:cmp.cpk==null?`No other ${t.model} · ${t.duty} truck with distance, and fleet CPK is unknown`:`Fleet CPK ${cpk(cmp.cpk)} IDR/km · no other ${t.model} · ${t.duty} truck with distance`;
 return <div className="truck-panel-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><aside ref={panel} className="truck-panel" role="dialog" aria-modal="true" aria-labelledby="truck-panel-title">
  <div className="modal-header"><div><span className="eyebrow">TRUCK DETAIL</span><h2 id="truck-panel-title">{t.plate}</h2><small>{t.model} · {t.duty}</small></div><button type="button" className="icon-button panel-close" aria-label="Close truck details" onClick={onClose}><X size={22}/></button></div>
  <div className="truck-panel-body">
   <dl className="panel-summary">
    <div><dt>Maintenance CPK</dt><dd>{t.cpk==null?'unknown':<>{cpk(t.cpk)} <span>IDR/km</span></>}</dd>{t.cpk==null&&<small>No distance tracked yet</small>}</div>
    <div><dt>{cmp.scope==='peers'?'vs similar trucks':'vs fleet'}</dt><dd className={cmp.ratio!==null&&cmp.ratio>=HIGH?'ratio high':''}>{cmp.ratio===null?'—':ratio(cmp.ratio)}</dd><small>{peerText}</small></div>
    <div><dt>Maintenance spend</dt><dd>{records.length?money(spend):'—'}</dd><small>{plural(records.length,'workshop visit')}</small></div>
    <div><dt>Distance tracked</dt><dd>{number(t.distance)} <span>km</span></dd><small>Since {date(t.baselineDate)} · odometer {number(t.odometer)} km</small></div>
   </dl>
   {!records.length?<div className="empty panel-empty"><Wrench size={25}/><p>No workshop visits yet. Log maintenance to start tracking CPK.</p><button type="button" className="primary" onClick={onLog}><Wrench size={15}/>Log maintenance</button></div>:<>
   <section className="panel-section"><h3>Where the cost comes from</h3>
    {spend>0?<><div className="cost-bar" aria-hidden="true">{parts.filter(p=>p[1]>0).map(([label,amount,cls])=><span key={label} className={cls} style={{width:`${amount/spend*100}%`}}/>)}</div>
    <ul className="cost-legend">{parts.map(([label,amount,cls])=><li key={label}><span className={'swatch '+cls}/><span>{label}</span><strong>{money(amount)}</strong><small>{share(amount/spend)}</small></li>)}</ul>
    <h4>Parts and installation by category</h4>{categories.length?<ul className="category-list">{categories.map(([name,amount])=><li key={name}><span>{name}</span><strong>{money(amount)}</strong><small>{share(amount/spend)} of spend</small></li>)}</ul>:<p className="panel-note">No parts recorded. All visits were labor or other charges only.</p>}</>
    :<p className="panel-note">The recorded visits have no costs entered.</p>}
   </section>
   <section className="panel-section"><h3>Most expensive visits</h3><p className="panel-note">{records.length>5?`Top 5 of ${records.length} visits by total cost`:`All ${plural(records.length,'visit')}, by total cost`}</p>
    <ol className="visit-list">{top.map(m=><li key={m.id}><div className="visit-head"><strong>{money(eventCost(m))}</strong><span>{date(m.date)} · {number(m.odometer)} km · {m.workshop}</span></div>{m.notes&&<p>{m.notes}</p>}
     <ul>{m.items.map((i,k)=><li key={k}>{partName(i.partId)} · {i.position} · {number(i.quantity)} × {money(i.unitCost)}{Number(i.labor)>0&&` + ${money(i.labor)} installation`}</li>)}{!m.items.length&&<li>No parts · labor or other charges only</li>}{(Number(m.labor)>0||Number(m.otherCost)>0)&&<li>General labor {money(m.labor)} · other charges {money(m.otherCost)}</li>}</ul></li>)}</ol>
   </section>
   <section className="panel-section"><h3>Parts in service</h3>{active.length?<ul className="service-list">{active.map(c=><li key={c.installationId}><div><strong>{c.brand} · {c.category}</strong><small>{c.position}{c.quantity>1?` · ${c.quantity} units tracked together`:''}</small></div><div><strong>{number(c.distance)} km</strong><small>since install on {date(c.startDate)} at {number(c.odometer)} km</small></div></li>)}</ul>:<p className="panel-note">No parts recorded as installed. Parts appear here after a workshop visit logs them.</p>}</section>
   </>}
  </div>
  <div className="modal-footer truck-panel-actions"><button type="button" className="secondary panel-delete" onClick={onDelete}><Trash2 size={15}/>Delete</button><button type="button" className="secondary" onClick={onEdit}><Pencil size={15}/>Edit truck</button><button type="button" className="secondary" aria-haspopup="dialog" onClick={onSpecs}><Ruler size={15}/>View specs{reports>0&&` · ${plural(reports,'report')}`}</button><button type="button" className="primary" onClick={onLog}><Wrench size={15}/>Log maintenance</button></div>
 </aside></div>;
}
