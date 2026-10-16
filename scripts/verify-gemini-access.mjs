// Diagnose Gemini access: one minimal call to GEMINI_MODEL and the list of models available to this key.
// Run: node --env-file=.env scripts/verify-gemini-access.mjs   (never prints the key)
const key=process.env.GEMINI_API_KEY;if(!key){console.error('Set GEMINI_API_KEY');process.exit(1);}
const call=async model=>{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(30000),body:JSON.stringify({contents:[{role:'user',parts:[{text:'Jawab satu kata: halo'}]}]})});const j=await r.json();console.log(model,r.status,j.error?JSON.stringify({code:j.error.code,status:j.error.status,message:j.error.message.slice(0,300)}):j.candidates?.[0]?.content?.parts?.[0]?.text);};
await call(process.env.GEMINI_MODEL||'gemini-3.8-flash');
const l=await (await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',{headers:{'x-goog-api-key':key}})).json();
console.log('flash/pro models with generateContent:',(l.models||[]).filter(x=>x.supportedGenerationMethods?.includes('generateContent')).map(x=>x.name.replace('models/','')).filter(n=>/flash|pro/.test(n)).join(', ')||JSON.stringify(l.error));
