'use strict';
// Offline fixture checks for migration preflight rules. No browser, credentials, or database calls.
const normName=s=>String(s||'').trim().normalize('NFKC').toLocaleLowerCase('id');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function preflight(rows){
 const parsed=rows.map(r=>({name:String(r.name||'').trim(),period:String(r.period||'').slice(0,10),amount:Number(r.amount),status:r.status==='paid'?'paid':'unpaid'}));
 if(parsed.some(r=>!r.name||!validDate(r.period)||!Number.isSafeInteger(r.amount)||r.amount<=0))return {ok:false,reason:'invalid'};
 const map=new Map();for(const b of parsed){const k=normName(b.name)+'|'+b.period;const p=map.get(k);if(!p)map.set(k,b);else if(p.amount!==b.amount||p.status!==b.status)return {ok:false,reason:'conflict'};}
 return {ok:true,unique:map.size};
}
const cases=[
 ['valid',{ok:true},[{name:'Ayu',period:'2026-10-01',amount:100000,status:'unpaid'}]],
 ['bad date',{ok:false,reason:'invalid'},[{name:'Ayu',period:'2026-02-30',amount:100000,status:'unpaid'}]],
 ['nonpositive amount',{ok:false,reason:'invalid'},[{name:'Ayu',period:'2026-10-01',amount:0,status:'unpaid'}]],
 ['conflicting amount',{ok:false,reason:'conflict'},[{name:'Ayu',period:'2026-10-01',amount:100000,status:'unpaid'},{name:' ayu ',period:'2026-10-01',amount:200000,status:'unpaid'}]],
 ['identical duplicate',{ok:true,unique:1},[{name:'Ayu',period:'2026-10-01',amount:100000,status:'unpaid'},{name:'ayu',period:'2026-10-01',amount:100000,status:'unpaid'}]],
 ['different period',{ok:true,unique:2},[{name:'Ayu',period:'2026-10-01',amount:100000,status:'unpaid'},{name:'Ayu',period:'2026-11-01',amount:100000,status:'unpaid'}]]
];
let failed=0;for(const [name,expected,rows] of cases){const got=preflight(rows);const ok=Object.keys(expected).every(k=>got[k]===expected[k]);console.log((ok?'PASS ':'FAIL ')+name+' '+JSON.stringify(got));if(!ok)failed++;}
if(failed)process.exit(1);console.log('All fixture cases passed.');
