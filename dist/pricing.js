/* Versioned, frozen 200,000-year actuarial outputs. No silent extrapolation to unmodeled exposures. */
(function(root){
'use strict';
const version='CB-CONFLICT-3.0',defaults={scenario:'baseline',capitalRate:8,expense:25,reinsuranceLoad:40},round=n=>Math.round((n+Number.EPSILON)*100)/100;
const U=()=>root.CBUnifiedData;
function signature(t){
 const keys=['model','olaVersion','olaSuccess','olaResponse','olaWindow','olaRecovery','usageCountry','provider','region','regionCode','kind','service','endpoint','volume','margin','irrecoverable','backup','backupDate','rto','limit','sharedDependency'];
 return JSON.stringify({coverageVersion:t.coverageVersion,currency:t.currency,calendar:t.calendar,waiting:t.waiting,maxHours:t.maxHours,occLimit:t.occLimit,annual1:t.annual1,annual2:t.annual2,annualTotal:t.annualTotal,m2:t.m2,
  services:t.services.map(s=>Object.fromEntries(keys.map(k=>[k,s[k]??(s.kind==='AI API'?root.CBData.olaDefaults?.[k]:undefined)]))).sort((a,b)=>a.kind.localeCompare(b.kind))});
}
function match(a){const t=a.policy?.terms||a,p=U().book.find(x=>x.id===t.pricingProfile);if(!p)return null;const ref=root.CBData.makeApp(p.id);return signature(t)===signature(ref)&&new Set(t.services.map(s=>s.group)).size===t.services.length&&root.CBEngine.stamp(t.periodEnd+'T00:00')-root.CBEngine.stamp(t.periodStart+'T00:00')===365*1440?p:null;}
function financial(r,m){const p={...defaults,...m},el=r.EL,recovery=r.expected_recovery,rc=recovery*p.reinsuranceLoad/100,capitalCost=r.K*p.capitalRate/100,total=(el+rc+capitalCost+r.F)/(1-p.expense/100);
 return {total,costs:{el,rc,capital:r.K,capitalCost,fixed:r.F,variable:total*p.expense/100,recovery,rePremium:recovery+rc,netEL:el-recovery,tailMean:r.K+el-recovery,capitalRate:p.capitalRate,expense:p.expense,reinsuranceLoad:p.reinsuranceLoad}};
}
function quote(a,m={}){
 const t=a.policy?.terms||a,rows=t.services.map(s=>({id:s.id,hourly:root.CBEngine.hourly(s),region:root.CBData.regions.find(r=>r.id===s.region)||{name:s.region,code:s.region}})),hourly=rows.reduce((sum,s)=>sum+s.hourly,0);
 if(a.policy&&a.policy.quote?.pricingVersion!==version)return a.policy.quote;
 const p=match(a),scenario=U().scenarios[m.scenario||'baseline'],meta={rows,hourly,modelVersion:m.version||version,pricingVersion:version,currency:'USD',profile:p?.id||null,scenario:m.scenario||'baseline'};
 if(!p||!scenario)return {...meta,available:false,total:null,p1:null,p2:null,pure1:null,pure2:null,costs:null,errors:['投保条件已超出本版测算范围，请重新测算后报价。']};
 const r=scenario.policies.find(x=>x.id===p.id),f=financial(r,m),sp=scenario.portfolio,clients=scenario.policies.map(v=>({id:v.id,company:v.id,el:v.EL,recovery:v.expected_recovery,net:v.EL-v.expected_recovery,capital:v.K}));
 const result={...meta,available:true,bindable:!['concentrated','noBackup','testedBackup'].includes(m.scenario),total:round(f.total),pure1:r.EL_M1,pure2:r.EL_M2,p1:round(f.total*r.EL_M1/r.EL),p2:0,costs:f.costs,
  portfolio:{years:200000,tailYears:2000,policies:100,rePremium:sp.expected_recovery*(1+(m.reinsuranceLoad??40)/100),tailNet:sp.net_TVaR,meanNet:sp.mean_net,clients,summary:sp},contract:{...U().reinsurance,scope:sp.scope},basis:'Frozen research scenario; exposure, calendar, net-loss caps and shared annual limits included.'};
 result.p2=round(result.total-result.p1);return result;
}
const api={version,defaults,years:200000,quote,match,signature,financial};root.CBPricing=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
