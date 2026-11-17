/* M2-SCENARIO-1.0. Illustrative scenario inputs, not provider observations.
   Pure service-unavailability trigger. Customer business backup does not change it.
   Reference analysis only: no mutation of policy/quote/claim state. */
(function (root) {
  'use strict';
  const version = 'M2-SCENARIO-1.0';
  const standard = {hourly:20000, waiting:30, maxHours:20, occLimit:400000, annualLimit:400000, riskLoad:15, expense:25};
  // p: annual chance of >=1 source event; reach: conditional service impact by peril.
  const regions = {
    'us-east':    {p:1.2, reach:[.28,.35,.18], recovery:.8,  hub:[337,170], note:'区域内供电与跨区通信依赖'},
    'eu-west':    {p:2.8, reach:[.45,.55,.25], recovery:1,   hub:[545,135], note:'跨境互联与共享供电依赖'},
    'singapore':  {p:2.2, reach:[.35,.72,.22], recovery:1.2, hub:[667,217], note:'跨境通信通道集中'},
    'japan':      {p:3.6, reach:[.40,.55,.28], recovery:1.1, hub:[765,192], note:'跨洋连接与区域供电依赖'},
    'middle-east':{p:12,  reach:[.68,.78,.45], recovery:1.8, hub:[560,202], note:'电力、通信与设施共同受影响'},
    'australia':  {p:.9,  reach:[.30,.60,.16], recovery:1.25,hub:[780,283], note:'长距离通信与绕行容量'},
    'brazil':     {p:1.8, reach:[.45,.58,.20], recovery:1.35,hub:[330,267], note:'区域供电与跨境连接依赖'}
  };
  const perils = [
    {id:'power',name:'供电设施受损',short:'供电',share:.4,duration:1},
    {id:'network',name:'通信设施受损',short:'通信',share:.45,duration:1.3},
    {id:'facility',name:'云设施受损',short:'云设施',share:.15,duration:1.5}
  ];
  const durationCases = [{name:'短时',hours:1,weight:.55},{name:'持续',hours:6,weight:.3},{name:'长时',hours:24,weight:.15}];
  const configurations = {
    regional:{name:'区域内冗余',scale:1},
    independent:{name:'独立路径冗余',scale:.55},
    shared:{name:'共同上游依赖',scale:1.35}
  };
  const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const round=x=>Math.round(x*100)/100;
  function normalize(t={}) {
    const positive=k=>Math.max(0,finite(t[k],standard[k]));
    return {...Object.fromEntries(['hourly','waiting','maxHours','occLimit','annualLimit','riskLoad'].map(k=>[k,positive(k)])),expense:Math.min(90,positive('expense'))};
  }
  function payout(hours,terms) {
    const t=normalize(terms);
    return Math.min(t.occLimit,Math.max(0,Math.min(t.maxHours,hours-t.waiting/60))*t.hourly);
  }
  // Exact discrete convolution in cents, with annual aggregate capping.
  // Poisson truncation error <= remaining probability * annual limit.
  function annualLoss(lambda, outcomes, limit) {
    const cap=Math.round(limit*100);
    if (!(lambda>0) || !cap) return 0;
    let states=new Map([[0,1]]),pn=Math.exp(-lambda),mass=pn,total=0;
    for(let n=1;n<=16;n++) {
      const next=new Map();
      for(const [loss,prob] of states) {
        if(loss===cap){next.set(cap,(next.get(cap)||0)+prob);continue;}
        for(const o of outcomes){const sum=Math.min(cap,loss+Math.round(o.payout*100));next.set(sum,(next.get(sum)||0)+prob*o.weight);}
      }
      states=next;pn*=lambda/n;mass+=pn;
      total+=pn*[...states].reduce((sum,[loss,p])=>sum+loss*p,0)/100;
      if(1-mass<1e-12) break;
    }
    return Math.min(limit,total);
  }
  const cache=new Map();
  function evaluate(id, options={}) {
    const r=regions[id];if(!r)return null;
    const t=normalize(options.terms),configuration=configurations[options.configuration]||configurations.regional;
    const api=options.kind==='AI API',serviceReach=api?1.08:1,serviceDuration=api?1.15:1;
    const key=JSON.stringify([id,t,configuration.name,api]);if(cache.has(key))return cache.get(key);
    const sourceLambda=-Math.log1p(-r.p/100);
    const paths=perils.map((peril,i)=>({...peril,reach:Math.min(.99,r.reach[i]*serviceReach)}));
    const reach=paths.reduce((sum,p)=>sum+p.share*p.reach,0);
    const outcomes=paths.flatMap(p=>durationCases.map(d=>{
      const hours=round(d.hours*r.recovery*p.duration*serviceDuration*configuration.scale);
      return {peril:p.id,name:d.name,hours,weight:p.share*p.reach/reach*d.weight,payout:round(payout(hours,t)),eligible:Math.max(0,Math.min(t.maxHours,hours-t.waiting/60))};
    }));
    const lambda=sourceLambda*reach;
    const qualifying=outcomes.filter(o=>o.eligible>0),q=qualifying.reduce((sum,o)=>sum+o.weight,0);
    const meanHours=outcomes.reduce((sum,o)=>sum+o.hours*o.weight,0);
    const coveredHours=q?qualifying.reduce((sum,o)=>sum+o.eligible*o.weight,0)/q:0;
    const sorted=[...outcomes].sort((a,b)=>a.hours-b.hours);let running=0,p90=sorted.at(-1).hours;
    for(const o of sorted){running+=o.weight;if(running>=.9-1e-10){p90=o.hours;break;}}
    const annual=annualLoss(lambda,outcomes,t.annualLimit);
    const premium=annual*(1+t.riskLoad/100)/(1-t.expense/100);
    // Geographic rating uses a constant monetary-free basis, not customer's chosen sum insured.
    const score=sourceLambda*reach*outcomes.reduce((sum,o)=>sum+o.weight*Math.max(0,Math.min(20,o.hours-.5)),0);
    const level=score<.05?'较低':score<.2?'中等':'较高';
    const result={id,terms:t,configuration:configuration.name,paths,outcomes,sourceP:r.p,reach:reach*100,lambda,
      triggerP:(t.hourly>0&&t.occLimit>0&&t.annualLimit>0)?-Math.expm1(-lambda*q)*100:0,
      meanHours,coveredHours,p90,annual:round(annual),premium:round(premium),
      severe:Math.min(t.annualLimit,round(payout(p90,t))),level,score,note:r.note,
      durationGroups:durationCases.map(d=>({name:d.name,weight:d.weight,hours:outcomes.filter(o=>o.name===d.name).reduce((s,o)=>s+o.hours*o.weight/d.weight,0)}))};
    if(cache.size>200)cache.clear();cache.set(key,result);return result;
  }
  const api={version,standard,regions,perils,configurations,normalize,payout,annualLoss,evaluate};
  root.CBM2Risk=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
