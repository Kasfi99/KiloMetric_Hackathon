import React from 'react';

// Minimal Markdown for Gemini's analysis text: headings, rules, two-level lists, **bold**, paragraphs.
// Builds React elements only (no HTML injection); anything else stays plain text.
export const bold=text=>text.split(/\*\*(.+?)\*\*/).map((part,i)=>i%2?<strong key={i}>{part}</strong>:part);
const HR=/^\s*([-*_])(\s*\1){2,}\s*$/,HEADING=/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,ITEM=/^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/,NOTE=/^\[Analysis cut off by .*\]$/;
const List=({items,key})=>{const Tag=items[0].ordered?'ol':'ul';return <Tag key={key} start={items[0].ordered&&items[0].n!==1?items[0].n:undefined}>{items.map((it,i)=><li key={i}>{bold(it.text)}{it.children.length>0&&List({items:it.children})}</li>)}</Tag>;};

export function Markdown({text}){
 const blocks=[];let para=[],list=null;
 const flush=()=>{if(para.length)blocks.push(<p key={blocks.length}>{para.flatMap((l,i)=>i?[<br key={'b'+i}/>,...bold(l)]:bold(l))}</p>);if(list)blocks.push(List({items:list,key:blocks.length}));para=[];list=null;};
 for(const line of String(text).split(/\r?\n/)){
  const t=line.trim(),h=line.match(HEADING),m=line.match(ITEM);
  if(!t){flush();continue;}
  if(HR.test(line)){flush();blocks.push(<hr key={blocks.length}/>);continue;}
  if(h){flush();const H=h[1].length>3?'h4':'h3';blocks.push(<H key={blocks.length}>{bold(h[2])}</H>);continue;}
  if(NOTE.test(t)){flush();blocks.push(<p key={blocks.length} className="ai-note">{t}</p>);continue;}
  if(m){
   const item={ordered:!m[2],n:Number(m[3]),text:m[4],children:[]},parent=list?.at(-1);
   if(para.length)flush();
   if(m[1].length>=2&&parent)parent.children.push(item);
   else if(list&&list[0].ordered===item.ordered)list.push(item);
   else{flush();list=[item];}
   continue;
  }
  // An indented line under a list item continues that item; an unindented one starts a paragraph.
  if(list&&/^\s/.test(line)){const last=list.at(-1),target=last.children.at(-1)||last;target.text+=' '+t;continue;}
  if(list)flush();
  para.push(t);
 }
 flush();
 return <div className="md">{blocks}</div>;
}
