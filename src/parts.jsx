import React,{useState,useEffect,useRef} from 'react';
import {Package,Search,Pencil,Trash2,ArrowUpRight,AlertCircle} from 'lucide-react';
import {summarizePartCycles} from '../lib/analytics.js';
import {money,number,cpk,ratio,date} from './format.js';
import {plural,paginate,nextSort,SortHeader,FilterSelect,FilterChips,Pager,DetailModal,focusRow,listPosition,tabKeys} from './table-kit.jsx';

const LIMITED=5;
const EVIDENCE={completed:'Has completed lifecycles',none:'No completed lifecycle yet'};
const SORT_LABEL={cpk:'Observed CPK · IDR/unit/km',ratio:'vs best',life:'Avg life',price:'Unit price',evidence:'Evidence'};
// Lower cost is better, longer life and more evidence are better: each column's first click shows the better end first.
const FIRST_DIR={cpk:'asc',ratio:'asc',life:'desc',price:'asc',evidence:'desc'};
const HISTORY={all:'All',completed:'Replaced',active:'In service'};
const byName=(x,y)=>x.p.brand.localeCompare(y.p.brand)||x.p.name.localeCompare(y.p.name);
const limited=s=>s.completed>0&&s.completed<LIMITED;
const evidenceText=s=>`${s.completed} completed · ${s.active} in service`;
const fits=models=>!models.length?'—':models.length<=2?models.join(', '):`${models.slice(0,2).join(', ')} +${models.length-2}`;

// Observed figures per part for the chosen truck model, and each part's ratio to the lowest observed CPK in its own category.
export function rankParts(parts,cycles,model){
 const rows=parts.map(p=>({p,stats:summarizePartCycles(cycles,p.id,model)})),best=new Map(),measured=new Map();
 for(const {p,stats} of rows)if(stats.cpk!==null){measured.set(p.category,(measured.get(p.category)||0)+1);if(!(best.get(p.category)<=stats.cpk))best.set(p.category,stats.cpk);}
 return rows.map(r=>{const b=best.get(r.p.category)??null;return {...r,best:b,measured:measured.get(r.p.category)||0,lowest:r.stats.cpk!==null&&r.stats.cpk===b,ratio:r.stats.cpk!==null&&b>0?r.stats.cpk/b:null};});
}

export function PartsPage({data,onEdit,onDelete,onCompare}){
 const categories=[...new Set(data.parts.map(p=>p.category))];
 const [tab,setTab]=useState(''),[search,setSearch]=useState(''),[brand,setBrand]=useState(''),[model,setModel]=useState(''),[evidence,setEvidence]=useState('');
 const [sort,setSort]=useState({key:'cpk',dir:'asc'}),[page,setPage]=useState(1),[size,setSize]=useState(10),[selectedId,setSelectedId]=useState(null);
 const reset=fn=>v=>{fn(v);setPage(1);};
 const activeTab=categories.includes(tab)?tab:'';
 const rows=rankParts(data.parts,data.analytics.cycles,model);
 const brands=[...new Set(data.parts.map(p=>p.brand))].sort(),models=[...new Set(data.trucks.map(t=>t.model))].sort();
 const inTab=rows.filter(r=>!activeTab||r.p.category===activeTab);
 const q=search.trim().toLowerCase();
 // A model filter keeps parts listed as fitting that model, plus any part with recorded installations on it.
 const filtered=inTab.filter(({p,stats})=>(!q||[p.name,p.brand,p.sku].some(v=>String(v??'').toLowerCase().includes(q)))&&(!brand||p.brand===brand)&&(!model||p.models.includes(model)||stats.cycles.length>0)&&(!evidence||(evidence==='completed')===(stats.completed>0)));
 const value=(r,key)=>key==='cpk'?r.stats.cpk:key==='ratio'?r.ratio:key==='life'?r.stats.avgLife:key==='price'?(Number.isFinite(r.p.price)?r.p.price:null):r.stats.completed;
 const order=new Map(categories.map((c,i)=>[c,i]));
 // CPK is only comparable within a category, so a CPK sort keeps categories together. Unknown values always sort last.
 const sorted=filtered.slice().sort((x,y)=>{
  if(sort.key==='cpk'&&x.p.category!==y.p.category)return order.get(x.p.category)-order.get(y.p.category);
  const u=value(x,sort.key),v=value(y,sort.key);
  if(u==null||v==null)return u==null&&v==null?byName(x,y):u==null?1:-1;
  const up=sort.dir==='asc';
  return (up?u-v:v-u)||(sort.key==='evidence'?(up?x.stats.active-y.stats.active:y.stats.active-x.stats.active):0)||byName(x,y);
 });
 const {pages,current,start,visible}=paginate(sorted,page,size);
 const sortBy=key=>{setSort(s=>nextSort(s,key,FIRST_DIR[key]));setPage(1);};
 const chips=[search&&['Search',`“${search}”`,()=>reset(setSearch)('')],brand&&['Brand',brand,()=>reset(setBrand)('')],model&&['Truck model',model,()=>reset(setModel)('')],evidence&&['Evidence',EVIDENCE[evidence],()=>reset(setEvidence)('')]].filter(Boolean);
 const clear=()=>{setSearch('');setBrand('');setModel('');setEvidence('');setPage(1);};
 const selected=rows.find(r=>r.p.id===selectedId);
 useEffect(()=>{if(selectedId&&!selected)setSelectedId(null);},[selectedId,!selected]);
 const ids=sorted.map(r=>r.p.id);
 // Closing returns focus to the row, turning the table to the page that holds it when ‹ › moved past the visible page.
 // A brand switch inside the modal can show a part outside the current list; focus then returns to the row it was opened from.
 const opened=useRef(null),openRow=id=>{opened.current=id;setSelectedId(id);};
 function closePanel(){const id=ids.includes(selectedId)?selectedId:opened.current,i=ids.indexOf(id);if(i>=0)setPage(Math.floor(i/size)+1);setSelectedId(null);focusRow(id);}
 const th=key=><SortHeader label={SORT_LABEL[key]} active={sort.key===key} dir={sort.dir} onSort={()=>sortBy(key)}/>;
 const select=(label,val,set,options)=><FilterSelect label={label} value={val} onChange={reset(set)} options={options}/>;
 const tabs=[['','All',data.parts.length],...categories.map(c=>[c,c,data.parts.filter(p=>p.category===c).length])];
 const tabId=i=>`parts-tab-${i}`,activeIndex=tabs.findIndex(([v])=>v===activeTab);
 const scope=activeTab?` in ${activeTab}`:'';
 return <>
 <section className="card parts-register">
  <div className="card-heading"><div className="title-count"><h2>Spare parts & CPK</h2><span className="count" aria-live="polite">{filtered.length===inTab.length?plural(inTab.length,'part'):`${filtered.length} of ${plural(inTab.length,'part')}`}{scope}</span></div><label className="search"><Search size={16}/><input aria-label="Search name, brand or SKU" placeholder="Search name, brand or SKU…" value={search} onChange={e=>reset(setSearch)(e.target.value)}/></label></div>
  {data.parts.length>0&&<div className="category-tabs" role="tablist" aria-label="Part categories" onKeyDown={tabKeys}>{tabs.map(([v,label,n],i)=><button type="button" role="tab" key={v||'all'} id={tabId(i)} aria-selected={v===activeTab} aria-controls="parts-table" tabIndex={v===activeTab?0:-1} className={'category-tab'+(v===activeTab?' active':'')} onClick={()=>{reset(setTab)(v);}}>{label}<span className="tab-count">{n}</span></button>)}</div>}
  <div className="list-filters">{select('Brand',brand,setBrand,brands.map(b=>[b,b]))}{select('Truck model',model,setModel,models.map(m=>[m,m]))}{select('Evidence',evidence,setEvidence,Object.entries(EVIDENCE))}</div>
  <FilterChips chips={chips} onClear={clear}/>
  <div className="table-scroll" id="parts-table" role={data.parts.length?'tabpanel':undefined} aria-labelledby={data.parts.length?tabId(activeIndex):undefined}><table className="list-table"><thead><tr><th>Part</th>{th('cpk')}{th('ratio')}{th('life')}{th('price')}{th('evidence')}<th>Fits</th></tr></thead>
  <tbody>{visible.map(({p,stats,lowest,ratio:r,best,measured})=><tr key={p.id} className="list-row" onClick={()=>openRow(p.id)}>
   <td><button type="button" className="row-open" data-row-id={p.id} aria-haspopup="dialog" aria-label={`Open details for ${p.brand} ${p.name}`} onClick={e=>{e.stopPropagation();openRow(p.id);}}><span className="entity-icon"><Package size={18}/></span><span><strong>{p.name}</strong><small>{p.brand} · {p.sku}</small></span></button></td>
   <td>{stats.cpk===null?<><strong>—</strong><small>No completed lifecycle yet</small></>:<strong className="num">{cpk(stats.cpk)}</strong>}</td>
   <td>{lowest?<span className="lowest">Lowest in {p.category}</span>:r!==null?<span className="ratio">{ratio(r)} best</span>:'—'}{lowest&&<small>{measured>1?`${measured} parts measured`:'Only part measured'}</small>}{!lowest&&r!==null&&<small>Best {cpk(best)} IDR/unit/km</small>}</td>
   <td>{stats.avgLife===null?'—':`${number(stats.avgLife)} km`}</td>
   <td>{Number.isFinite(p.price)?money(p.price):'—'}<small>Catalog price</small></td>
   <td>{evidenceText(stats)}{limited(stats)&&<small>limited evidence</small>}</td>
   <td title={p.models.join(', ')||undefined}>{fits(p.models)}</td>
  </tr>)}</tbody></table>
  {!data.parts.length&&<div className="empty"><Package size={25}/><p>No spare parts in the catalog yet. Use Add spare part to create the first one.</p></div>}
  {data.parts.length>0&&!filtered.length&&<div className="empty"><Search size={25}/><p>No parts{scope} match these filters.</p>{chips.length>0&&<button type="button" className="secondary" onClick={clear}>Clear filters</button>}</div>}
  </div>
  <Pager total={sorted.length} start={start} shown={visible.length} size={size} onSize={n=>{setSize(n);setPage(1);}} current={current} pages={pages} onPage={setPage} label="Spare parts pages"/>
  <div className="section-foot">Sorted by {sort.key==='cpk'?'observed CPK within each category':SORT_LABEL[sort.key]}, {sort.dir==='desc'?'highest':'lowest'} first; unknown values last. vs best = part CPK ÷ the lowest observed CPK in the same category{model?` on ${model} trucks`:''}. Fewer than {LIMITED} completed lifecycles is limited evidence.</div>
  {selected&&<PartPanel row={selected} rows={rows} model={model} position={listPosition(ids,selected.p.id,setSelectedId)} data={data} onClose={closePanel} onSelect={setSelectedId} onEdit={()=>onEdit(selected.p)} onDelete={()=>onDelete(selected.p)} onCompare={onCompare}/>}
 </section>
 <div className="method-note"><AlertCircle size={16}/><span>Observed CPK = actual purchase cost + installation labor of completed replacements ÷ completed unit-kilometers; catalog prices do not determine it. Average life is weighted by unit count. Figures mix positions and operating profiles; use Mix optimizer to compare under matching conditions.</span></div>
 </>;
}

function PartPanel({row,rows,model,position,data,onClose,onSelect,onEdit,onDelete,onCompare}){
 const {p,stats,lowest,ratio:r,best,measured}=row;
 // The status filter and history page start fresh for each part (the modal itself stays open across ‹ › and brand switches).
 const [filter,setFilter]=useState({id:p.id,status:'all',page:1,size:10}),cur=filter.id===p.id?filter:{id:p.id,status:'all',page:1,size:10},status=cur.status,setStatus=s=>setFilter({...cur,status:s,page:1});
 const peers=rows.filter(x=>x.p.category===p.category).sort((x,y)=>(x.stats.cpk===null)-(y.stats.cpk===null)||(x.stats.cpk??0)-(y.stats.cpk??0)||byName(x,y));
 const history=stats.cycles.slice().sort((a,b)=>b.startDate.localeCompare(a.startDate));
 const counts={all:history.length,completed:history.filter(c=>c.status==='completed').length,active:history.filter(c=>c.status==='active').length};
 const shown=status==='all'?history:history.filter(c=>c.status===status),hist=paginate(shown,cur.page,cur.size);
 const plate=id=>data.trucks.find(t=>t.id===id)?.plate||'Truck not registered';
 const on=model?` on ${model} trucks`:'';
 const actions=<><button type="button" className="secondary panel-delete" onClick={onDelete}><Trash2 size={15}/>Delete</button><button type="button" className="secondary" onClick={onEdit}><Pencil size={15}/>Edit part</button>{onCompare&&<button type="button" className="primary panel-compare" onClick={onCompare}>Compare by model & profile in Mix optimizer<ArrowUpRight size={15}/></button>}</>;
 const summary=<><dl className="panel-summary">
   <div><dt>Observed CPK</dt><dd>{stats.cpk===null?'unknown':<>{cpk(stats.cpk)} <span>IDR/unit/km</span></>}</dd>{stats.cpk===null&&<small>No completed lifecycle yet</small>}</div>
   <div><dt>vs best</dt><dd>{lowest?'Lowest':r!==null?ratio(r):'—'}</dd><small>{stats.cpk===null?'No completed lifecycle yet':lowest?`Lowest in ${p.category} · ${measured>1?`${measured} parts measured`:'only part measured'}`:r!==null?`${ratio(r)} the best in ${p.category} (${cpk(best)})`:'No comparison available'}</small></div>
   <div><dt>Average life</dt><dd>{stats.avgLife===null?'—':<>{number(stats.avgLife)} <span>km</span></>}</dd><small>{stats.units?`${plural(stats.units,'unit')} with a completed life`:'No completed lifecycle yet'}</small></div>
   <div><dt>Evidence</dt><dd>{stats.completed} <span>completed</span></dd><small>{stats.active} in service{limited(stats)?' · limited evidence':''}</small></div>
  </dl><p className="panel-note">Figures for {model?`${model} trucks`:'all truck models'}. Change the Truck model filter to recompute.</p></>;
 const tabs=[
  {id:'overview',label:'Overview',content:<>
  <section className="panel-section"><h3>Catalog price</h3><p className="panel-text">{Number.isFinite(p.price)?money(p.price):'—'}</p><p className="panel-note">Saved visits keep the price actually paid.</p></section>
  <section className="panel-section"><h3>Compatible models</h3>{p.models.length?<p className="panel-text">{p.models.join(', ')}</p>:<p className="panel-note">No compatible models listed. Edit the part to add them.</p>}</section>
  <section className="panel-section"><h3>Other brands in {p.category}</h3>{peers.length>1?<><p className="panel-note">Lowest observed CPK first{on}.</p><ul className="peer-list">{peers.map(x=><li key={x.p.id}><div>{x.p.id===p.id?<strong>{x.p.brand} · {x.p.name}</strong>:<button type="button" className="text-button" onClick={()=>onSelect(x.p.id)}>{x.p.brand} · {x.p.name}</button>}<small>{x.p.id===p.id?'This part':x.p.sku}</small></div><div><strong>{x.stats.cpk===null?'—':`${cpk(x.stats.cpk)} IDR/unit/km`}</strong><small>{x.stats.avgLife===null?'No completed lifecycle yet':`${number(x.stats.avgLife)} km avg life`} · {evidenceText(x.stats)}{limited(x.stats)?' · limited evidence':''}</small></div></li>)}</ul></>:<p className="panel-note">No other part in {p.category} in the catalog. Add one to compare brands.</p>}</section></>},
  {id:'history',label:'Lifecycle history',count:history.length,content:<section className="panel-section"><h3>Installation & replacement history</h3>
   {history.length>0&&<div className="segmented" role="group" aria-label="Filter history by status">{Object.entries(HISTORY).map(([k,label])=><button type="button" key={k} aria-pressed={status===k} className={'segment'+(status===k?' active':'')} onClick={()=>setStatus(k)}>{label}<span>{counts[k]}</span></button>)}</div>}
   {shown.length>0&&<div className="table-scroll"><table className="panel-table"><thead><tr><th>Truck / position</th><th>Installed</th><th>Replaced</th><th>Life / distance</th><th>Installed cost</th><th>Part CPK</th><th>Status</th></tr></thead><tbody>{hist.visible.map((c,i)=><tr key={c.installationId||i}>
    <td><strong>{plate(c.truckId)}</strong><small>{c.model} · {c.duty}</small><small>{c.position}{c.quantity>1?` · ${c.quantity} units tracked together`:''}</small></td>
    <td>{number(c.odometer)} km<small>{date(c.startDate)}</small></td>
    <td>{c.status==='completed'?`${number(c.endOdometer)} km`:'—'}<small>{c.endDate?date(c.endDate):'Still installed'}</small></td>
    <td><strong>{number(c.distance)} km</strong><small>{c.status==='active'?'Distance so far':'Completed lifespan'}</small></td>
    <td>{money(c.cost)}<small>{c.quantity>1?`Total for ${c.quantity} units`:'Part + installation labor'}</small></td>
    <td><strong className="num">{c.status==='active'?'—':cpk(c.unitCpk)}</strong><small>{c.status==='active'?'Awaiting replacement':c.distance===0?'No distance recorded':c.quantity>1?'IDR/unit/km · allocated':'IDR/km'}</small></td>
    <td><span className="pill">{c.status==='active'?'In service':'Replaced'}</span></td>
   </tr>)}</tbody></table></div>}
   {shown.length>10&&<Pager total={shown.length} start={hist.start} shown={hist.visible.length} size={cur.size} onSize={n=>setFilter({...cur,size:n,page:1})} current={hist.current} pages={hist.pages} onPage={n=>setFilter({...cur,page:n})} label="Lifecycle history pages"/>}
   {!history.length&&<p className="panel-note">No installations of this part recorded{on}. Log one during a workshop visit to start tracking.</p>}
   {history.length>0&&!shown.length&&<p className="panel-note">No {status==='active'?'installations still in service':'replaced installations'}{on}.</p>}
   <p className="panel-note history-note">A replacement at the same category and position closes the old part’s life, even when the new brand differs. Grouped records allocate installation labor evenly across units and assume a shared lifespan.</p>
  </section>},
 ];
 return <DetailModal id="part-panel-title" itemId={p.id} eyebrow="SPARE PART" title={`${p.brand} · ${p.name}`} subtitle={`${p.category} · SKU ${p.sku}`} summary={summary} position={position} noun="part" closeLabel="Close part details" onClose={onClose} tabs={tabs} actions={actions}/>;
}
