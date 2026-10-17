// Display formatters shared by the dashboard pages: Indonesian numbers, en-GB dates. Unknown CPK renders as "—".
export const money=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v||0);
export const number=v=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(v||0);
export const cpk=v=>v===null||v===undefined?'—':new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
// Always two decimals, so a value just under a threshold (1,18×) never reads as the threshold itself.
export const ratio=v=>new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+'×';
export const date=v=>new Date(v+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
