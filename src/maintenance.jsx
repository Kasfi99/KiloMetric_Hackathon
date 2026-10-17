import React,{useState,useEffect,useRef} from 'react';
import {Search,Pencil,Trash2,Wrench} from 'lucide-react';
import {paginate,nextSort,SortHeader,FilterSelect,FilterChips,Pager,plural} from './table-kit.jsx';
import {money,number,date} from './format.js';

// Cost of one visit, the same sum as eventCost in lib/analytics.js.
const visitCost=m=>m.items.reduce((s,i)=>s+Number(i.unitCost)*Number(i.quantity)+Number(i.labor),0)+Number(m.labor)+Number(m.otherCost);
const SORTS={date:(a,b)=>a.date.localeCompare(b.date)||a.odometer-b.odometer,odometer:(a,b)=>a.odometer-b.odometer,cost:(a,b)=>a.cost-b.cost};
const SORT_LABEL={date:'Service date',odometer:'Odometer',cost:'Total cost'};

function DateFilter({label,value,onChange,min,max}){return <label className="list-filter"><span>{label}</span><input type="date" value={value} min={min} max={max} onChange={e=>onChange(e.target.value)}/></label>;}

// Workshop visit history: search, truck / workshop / date filters, sortable columns and pagination.
// initialTruck presets the truck filter (Fleet detail "See all visits"); the history then takes focus so keyboard users land on it.
export function MaintenanceHistory({data,onEdit,onDelete,onLog,initialTruck=''}){
 const heading=useRef(null);
 useEffect(()=>{if(initialTruck){heading.current?.scrollIntoView({block:'start'});heading.current?.focus({preventScroll:true});}},[]);
 const [query,setQuery]=useState(''),[truck,setTruck]=useState(initialTruck),[workshop,setWorkshop]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [sort,setSort]=useState({key:'date',dir:'desc'}),[page,setPage]=useState(1),[size,setSize]=useState(10);
 const reset=fn=>v=>{fn(v);setPage(1);};
 const plateOf=id=>data.trucks.find(t=>t.id===id);
 const rows=data.maintenance.map(m=>({...m,truck:plateOf(m.truckId),cost:visitCost(m)}));
 const q=query.trim().toLowerCase();
 const filtered=rows.filter(m=>(!truck||m.truckId===truck)&&(!workshop||m.workshop===workshop)&&(!from||m.date>=from)&&(!to||m.date<=to)
  &&(!q||[m.truck?.plate,m.truck?.model,m.workshop,m.notes].some(v=>String(v||'').toLowerCase().includes(q))));
 const sorted=[...filtered].sort((a,b)=>(sort.dir==='desc'?-1:1)*SORTS[sort.key](a,b));
 const {pages,current,start,visible}=paginate(sorted,page,size);
 const spend=filtered.reduce((s,m)=>s+m.cost,0);
 const trucks=[...data.trucks].sort((a,b)=>a.plate.localeCompare(b.plate)).map(t=>[t.id,t.plate]);
 const workshops=[...new Set(rows.map(m=>m.workshop))].sort().map(w=>[w,w]);
 const chips=[truck&&['Truck',plateOf(truck)?.plate,()=>reset(setTruck)('')],workshop&&['Workshop',workshop,()=>reset(setWorkshop)('')],from&&['From',date(from),()=>reset(setFrom)('')],to&&['To',date(to),()=>reset(setTo)('')],q&&['Search',query.trim(),()=>reset(setQuery)('')]].filter(Boolean);
 const clear=()=>{setQuery('');setTruck('');setWorkshop('');setFrom('');setTo('');setPage(1);};
 const sortBy=key=>{setSort(s=>nextSort(s,key));setPage(1);};
 return <section className="card">
  <div className="card-heading"><div className="title-count"><h2 ref={heading} tabIndex={-1}>Maintenance history</h2><span className="count">{chips.length?`${filtered.length} of ${rows.length} visits`:plural(rows.length,'visit')}</span></div><label className="search"><Search size={16}/><input aria-label="Search truck, workshop or notes" placeholder="Search truck, workshop or notes…" value={query} onChange={e=>reset(setQuery)(e.target.value)}/></label></div>
  {rows.length>0&&<div className="list-filters">
   <FilterSelect label="Truck" value={truck} onChange={reset(setTruck)} options={trucks}/>
   <FilterSelect label="Workshop" value={workshop} onChange={reset(setWorkshop)} options={workshops}/>
   <DateFilter label="From" value={from} max={to||undefined} onChange={reset(setFrom)}/>
   <DateFilter label="To" value={to} min={from||undefined} onChange={reset(setTo)}/>
  </div>}
  <FilterChips chips={chips} onClear={clear}/>
  <div className="table-scroll"><table className="list-table"><thead><tr><th>Truck</th><SortHeader label="Service date" active={sort.key==='date'} dir={sort.dir} onSort={()=>sortBy('date')}/><th>Workshop / work</th><SortHeader label="Odometer" active={sort.key==='odometer'} dir={sort.dir} onSort={()=>sortBy('odometer')}/><SortHeader label="Total cost" active={sort.key==='cost'} dir={sort.dir} onSort={()=>sortBy('cost')}/><th>Actions</th></tr></thead>
   <tbody>{visible.map(m=><tr key={m.id}><td><strong>{m.truck?.plate||'Unknown truck'}</strong><small>{m.truck?.model}</small></td><td>{date(m.date)}</td><td>{m.workshop}<small>{plural(m.items.length,'part line')} · {m.notes||'Maintenance service'}</small></td><td>{number(m.odometer)} km</td><td><strong>{money(m.cost)}</strong></td>
    <td><div className="actions"><button className="icon-button" aria-label={`Edit visit on ${date(m.date)} for ${m.truck?.plate||'truck'}`} onClick={()=>onEdit(m)}><Pencil size={15}/></button><button className="icon-button danger-icon" aria-label={`Delete visit on ${date(m.date)} for ${m.truck?.plate||'truck'}`} onClick={()=>onDelete(m)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>
   {!rows.length&&<div className="empty"><Wrench size={25}/><p>No workshop visits yet. Log the first maintenance visit to start tracking mileage and CPK.</p><button className="primary" onClick={onLog}>Log maintenance</button></div>}
   {rows.length>0&&!filtered.length&&<div className="empty"><Wrench size={25}/><p>No visits match these filters.</p><button className="secondary" onClick={clear}>Clear filters</button></div>}
  </div>
  <Pager total={sorted.length} start={start} shown={visible.length} size={size} onSize={n=>{setSize(n);setPage(1);}} current={current} pages={pages} onPage={setPage} label="Maintenance history pages"/>
  {filtered.length>0&&<div className="section-foot">Sorted by {SORT_LABEL[sort.key].toLowerCase()}, {sort.dir==='desc'?'newest or highest':'oldest or lowest'} first. {chips.length?`Filtered visits total ${money(spend)}.`:`All visits total ${money(spend)}.`}</div>}
 </section>;
}
