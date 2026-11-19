/* Historical frequency display only; not a calibration of insured outage probabilities. */
(function(root){
 'use strict';
 const cache=new Map(),indexes=new Map();
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:1});
 const count=(n,t)=>t?n[t-1]:n.reduce((a,b)=>a+b,0);
 const available=()=>Object.keys(root.CBConflictData.years).map(Number).sort((a,b)=>a-b);
 function cell(year,id){if(!indexes.has(year))indexes.set(year,new Map(root.CBConflictData.years[year].cells.map(c=>[`${c.x},${c.y}`,c])));return indexes.get(year).get(id);}
 function aggregate(years){const key=years.join(',');if(cache.has(key))return cache.get(key);
  const result={total:[0,0,0],included:[0,0,0],excluded:[0,0,0],cells:[]},cells=new Map();
  for(const year of years){const data=root.CBConflictData.years[year];if(!data)throw Error('Missing history year '+year);
   for(const field of ['total','included','excluded'])for(let i=0;i<3;i++)result[field][i]+=data[field][i];
   for(const c of data.cells){const id=`${c.x},${c.y}`;if(!cells.has(id))cells.set(id,{x:c.x,y:c.y,n:[0,0,0],countries:new Set()});const target=cells.get(id);for(let i=0;i<3;i++)target.n[i]+=c.n[i];for(const country of c.countries)target.countries.add(country);}
  }
  result.cells=[...cells.values()].map(c=>({...c,countries:[...c.countries].sort()}));cache.set(key,result);return result;
 }
 function scope(ui){const all=available(),mode=['5','10','single'].includes(String(ui.evidenceWindow))?String(ui.evidenceWindow):'5',year=all.includes(Number(ui.evidenceYear))?Number(ui.evidenceYear):all.at(-1),years=mode==='single'?[year]:all.slice(-Number(mode));return {all,mode,year,years,divisor:years.length,period:years.length===1?String(year):years[0]+'–'+years.at(-1),annual:mode==='single',data:aggregate(years)};}
 function trend(ui,scope,type){const rows=scope.all.map(year=>({year,value:ui.evidenceCell?count(cell(year,ui.evidenceCell)?.n||[0,0,0],type):count(root.CBConflictData.years[year].included,type)}));return rows;}
 function detail(ui,scope,type){const full=aggregate(scope.all),selected=ui.evidenceCell?full.cells.find(c=>`${c.x},${c.y}`===ui.evidenceCell):null,observed=selected?scope.data.cells.find(c=>`${c.x},${c.y}`===ui.evidenceCell)?.n||[0,0,0]:scope.data.included,total=count(observed,type),series=trend(ui,scope,type),max=Math.max(1,...series.map(r=>r.value));
  return `<span class="evidence-badge">${scope.annual?'单年查询':'多年基准'}</span><h3>${selected?esc(selected.countries.join(' / ')):'全球历史基准'}</h3><div class="evidence-code">${scope.period} · <span>${scope.annual?'当年事件数':'年均事件数'}</span>${selected?`<br><span data-no-translate>${selected.x}° → ${selected.x+1}° E · ${selected.y}° → ${selected.y+1}° N</span>`:''}</div><div class="evidence-number" data-hazard-value="${total/scope.divisor}">${num(total/scope.divisor)}<small>${selected?(scope.annual?'网格事件数':'网格年均事件数'):(scope.annual?'纳入精细热图':'年均纳入热图')}</small></div>${!scope.annual?`<div class="hazard-period-total"><span>期间累计</span><strong>${num(total)}</strong><span>条记录</span></div>`:''}
  <div class="hazard-trend"><div class="hazard-trend-heading"><strong>逐年趋势</strong><span>${scope.all[0]}–${scope.all.at(-1)}</span></div><p>${selected?'所选网格 · 纳入热图事件':'全球 · 纳入热图事件'}</p><div class="hazard-trend-bars">${series.map(({year,value})=>`<button type="button" data-trend-year="${year}" data-trend-count="${value}" class="${scope.years.includes(year)?'in-window':''} ${scope.annual&&scope.year===year?'selected-year':''}" aria-label="${year} · ${value}"><span>${year}</span><span class="hazard-bar-track"><i style="width:${value/max*100}%"></i></span><b>${num(value)}</b></button>`).join('')}</div><small>点击年份查看当年事件</small></div>
  ${selected?`<details class="hazard-type-breakdown"><summary>事件类型构成</summary><div class="evidence-type-list">${['国家型冲突','非国家冲突','单方面暴力'].map((label,i)=>`<div><span>${label}</span><b>${num(observed[i]/scope.divisor)}</b></div>`).join('')}</div></details>`:'<p class="evidence-note">点击热图网格查看局部趋势与事件目录。</p>'}<p class="evidence-note">统计位置精度 1–2 的事件；年均事件数不等于中断概率。</p>`;
 }
 root.CBHazardHistory={scope,aggregate,trend,detail,cell,available};
})(window);
