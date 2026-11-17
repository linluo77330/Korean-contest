(function(root){
  'use strict';
  const M=root.CBM2Risk;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(x,d=1)=>Number(x).toLocaleString('zh-CN',{maximumFractionDigits:d});
  const money=x=>'¥ '+num(x,2);
  const color=level=>level==='较低'?'#648575':level==='中等'?'#af8646':'#b87568';
  const layers=[['hazard','01','危险性','事件与外溢范围'],['exposure','02','风险暴露','服务与上游依赖'],['recovery','03','中断与恢复','不可用时长与冗余']];
  function context(a,model,ui){
    const source=a.policy?.terms||a,services=source.services||a.services;
    const service=services.find(s=>s.id===ui.m2Service)||services[0];
    const region=Object.hasOwn(M.regions,ui.region)?ui.region:service.region;
    const basis=ui.m2Basis||'standard',configuration=ui.m2Configuration||'regional';
    const terms=basis==='current'?{hourly:root.CBEngine.hourly(service),waiting:source.waiting,maxHours:source.maxHours,
      occLimit:Math.min(source.occLimit,service.limit),annualLimit:Math.min(source.annual2,source.annualTotal),
      riskLoad:(a.policy?.model||model).riskLoad,expense:(a.policy?.model||model).expense}:M.standard;
    const options={terms,kind:service.kind,configuration};
    const rows=root.CBData.regions.map(r=>({...r,...M.evaluate(r.id,options)}));
    return {source,services,service,region,basis,configuration,rows,selected:rows.find(r=>r.id===region)||rows[0]};
  }
  const option=(value,label,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;
  function render(a,model,ui){
    const c=context(a,model,ui),r=c.selected,layer=ui.m2Layer||'hazard',geo=root.CBWorldMap;
    const [sx,sy]=geo.points[r.id],[hx,hy]=M.regions[r.id].hub;
    const offsets={'us-east':[-12,-27],'eu-west':[-27,-28],singapore:[-20,35],japan:[36,-27],'middle-east':[5,-30],australia:[-30,36],brazil:[-10,37]};
    const metric=row=>layer==='hazard'?num(row.sourceP)+'%':layer==='exposure'?num(row.reach,0)+'%':num(row.meanHours)+'h';
    const tier=row=>layer==='hazard'?(row.sourceP<2?'较低':row.sourceP<5?'中等':'较高'):layer==='exposure'?(row.reach<40?'较低':row.reach<60?'中等':'较高'):(row.meanHours<6?'较低':row.meanHours<10?'中等':'较高');
    const layerTitle=layers.find(x=>x[0]===layer)[3];
    const points=c.rows.map(row=>{
      const [x,y]=geo.points[row.id],[dx,dy]=offsets[row.id],selected=row.id===r.id,fill=color(tier(row));
      return `<g class="m2-pin ${selected?'is-selected':''}" role="button" tabindex="0" data-region="${row.id}" aria-pressed="${selected}" aria-label="${row.name}，${layerTitle} ${metric(row)}"><title>${row.name} · ${metric(row)} · 参考年保费 ${money(row.premium)}</title>
        <circle class="m2-pin-halo" cx="${x}" cy="${y}" r="${selected?16:11}" fill="${fill}"/><circle class="m2-pin-ring" cx="${x}" cy="${y}" r="8" fill="white" stroke="${selected?'#397aad':fill}" stroke-width="${selected?3:1.5}"/><circle cx="${x}" cy="${y}" r="4" fill="${fill}"/>
        <path d="M${x},${y+(dy>0?10:-10)} L${x+dx},${y+dy+(dy>0?-10:10)}" stroke="${selected?'#397aad':'#a6b1bd'}" fill="none"/>
        <rect x="${x+dx-63}" y="${y+dy-13}" width="126" height="27" rx="4" fill="${selected?'#edf5fa':'#fff'}" stroke="${selected?'#8db6d2':'#dfe5eb'}"/>
        <text x="${x+dx}" y="${y+dy+5}" text-anchor="middle">${row.name} <tspan fill="${fill}">${metric(row)}</tspan></text></g>`;
    }).join('');
    const hazards=layer==='hazard'?c.rows.map(row=>{const [x,y]=geo.points[row.id];return `<ellipse cx="${x}" cy="${y}" rx="${30+row.sourceP*2}" ry="${20+row.sourceP}" fill="${color(tier(row))}" fill-opacity=".11" stroke="${color(tier(row))}" stroke-opacity=".3" stroke-dasharray="3 5"/>`;}).join(''):'';
    const nodes=[{x:hx,y:hy,label:'跨境通信',path:1},{x:sx-45,y:sy+(sy>260?-65:78),label:'区域供电',path:0},{x:sx+58,y:sy+(sy>260?-35:50),label:'云设施',path:2}];
    const dependencies=layer==='exposure'?nodes.map(n=>`<g aria-hidden="true"><path class="m2-dependency" d="M${n.x},${n.y} Q${(n.x+sx)/2},${Math.min(n.y,sy)-22} ${sx},${sy}" stroke-width="${1+r.paths[n.path].reach*3}"/><rect x="${n.x-4}" y="${n.y-4}" width="8" height="8" rx="1" fill="#728ba0"/><text class="m2-node-label" x="${n.x}" y="${n.y+19}" text-anchor="middle">${n.label}</text></g>`).join(''):'';
    const rings=layer==='recovery'?c.rows.map(row=>{const [x,y]=geo.points[row.id];return `<circle cx="${x}" cy="${y}" r="${16+row.meanHours}" fill="none" stroke="${color(tier(row))}" stroke-opacity=".3" stroke-width="3" stroke-dasharray="3 4"/>`;}).join(''):'';
    const detail=layer==='hazard'?`
      <div class="m2-focus-number">${num(r.sourceP)}<small>% / 年</small></div><p class="m2-focus-label">至少一次约定源事件</p>
      <div class="m2-bars">${r.paths.map(p=>`<div><span>${p.name}</span><b>${num(p.share*100,0)}%</b><i><em style="width:${p.share*100}%"></em></i></div>`).join('')}</div><p class="m2-detail-note">事件构成 · ${r.note}</p>`:
      layer==='exposure'?`<div class="m2-focus-number">${num(r.reach,0)}<small>%</small></div><p class="m2-focus-label">源事件发生后的服务受影响概率</p>
      <div class="m2-bars">${r.paths.map(p=>`<div><span>${p.short}路径 · 条件概率</span><b>${num(p.reach*100,0)}%</b><i><em style="width:${p.reach*100}%"></em></i></div>`).join('')}</div><p class="m2-detail-note">${esc(c.service.provider)} · ${esc(c.service.service)}<br>连接按区域情景假设</p>`:
      `<div class="m2-focus-number">${num(r.meanHours)}<small>小时</small></div><p class="m2-focus-label">服务受影响后的平均中断</p>
      <div class="m2-bars">${r.durationGroups.map(d=>`<div><span>${d.name}情景 · ${num(d.weight*100,0)}%</span><b>${num(d.hours)}h</b><i><em style="width:${d.hours/r.durationGroups[2].hours*100}%"></em></i></div>`).join('')}</div><p class="m2-detail-note">P90 中断 ${num(r.p90)}h · ${r.configuration}</p>`;
    const legend=layer==='hazard'?['< 2%','2–5%','≥ 5%']:layer==='exposure'?['< 40%','40–60%','≥ 60%']:['< 6h','6–10h','≥ 10h'];
    return `<div class="m2-explorer">
      <div class="map-toolbar"><div class="segmented" aria-label="风险模块"><button data-map="m1">M1 日常中断</button><button class="active" data-map="m2">M2 冲突外溢</button></div><span class="m2-model-label">${M.version} · 演示情景</span></div>
      <div class="m2-controls">
        <label class="field"><span>服务</span><select aria-label="M2分析服务" data-m2-option="m2Service">${c.services.map(s=>option(s.id,s.provider+' · '+s.service,c.service.id)).join('')}</select></label>
        <label class="field"><span>报价口径</span><select aria-label="M2报价口径" data-m2-option="m2Basis">${option('standard','标准保障',c.basis)}${option('current','当前投保条件',c.basis)}</select></label>
        <label class="field"><span>服务恢复配置</span><select aria-label="M2服务恢复配置" data-m2-option="m2Configuration">${Object.entries(M.configurations).map(([id,v])=>option(id,v.name,c.configuration)).join('')}</select></label>
        <button class="text-btn m2-compare" data-action="m2-compare">比较七个区域 ↗</button>
      </div>
      <div class="m2-layer-tabs" role="tablist" aria-label="M2风险图层">${layers.map(([id,n,title,sub])=>`<button type="button" role="tab" aria-selected="${layer===id}" aria-controls="m2-layer-panel" id="m2-tab-${id}" tabindex="${layer===id?0:-1}" class="${layer===id?'active':''}" data-m2-layer="${id}"><span>${n}</span><div><strong>${title}</strong><small>${sub}</small></div></button>`).join('')}</div>
      <div class="m2-map-layout" id="m2-layer-panel" role="tabpanel" aria-labelledby="m2-tab-${layer}">
        <div class="m2-map-canvas"><div class="m2-map-caption"><span>${layerTitle}</span><span>07 个区域 · ${layer==='hazard'?'影响范围示意':layer==='exposure'?'依赖连接示意':'服务恢复情景'}</span></div>
          <svg viewBox="0 35 960 365" role="group" aria-label="M2 ${layerTitle}地图，可选择七个区域">
          <defs><clipPath id="m2-world-clip"><path d="${geo.sphere}"/></clipPath></defs>
          <g clip-path="url(#m2-world-clip)"><path d="${geo.sphere}" fill="#f8fafc"/><path d="${geo.graticule}" fill="none" stroke="#e5eaf0" stroke-width=".7"/><path d="${geo.land}" fill="#e4e9ee" stroke="#bcc8d3" stroke-width=".6"/>${hazards}${rings}</g>${dependencies}${points}</svg>
          <div class="m2-map-bottom"><div class="m2-legend">${legend.map((v,i)=>`<span><i style="background:${color(['较低','中等','较高'][i])}"></i>${v}</span>`).join('')}</div><span>Natural Earth · 区域代表位置</span></div>
        </div>
        <aside class="m2-layer-detail" aria-label="所选区域图层详情"><div class="m2-place"><h3>${r.name}</h3><span>${r.country}</span></div>${detail}</aside>
      </div>
      <div class="m2-region-switch" aria-label="选择比较区域">${c.rows.map(row=>`<button data-region="${row.id}" class="${r.id===row.id?'active':''}" aria-pressed="${r.id===row.id}">${row.name}</button>`).join('')}</div>
      <div class="m2-results" aria-live="polite">
        <div><span>年度参数触发概率</span><strong>${num(r.triggerP,2)}<small>%</small></strong></div>
        <div><span>触发后平均可赔时长</span><strong>${num(r.coveredHours)}<small>小时</small></strong></div>
        <div><span>P90 中断对应赔款</span><strong><small>¥</small>${num(r.severe,0)}</strong></div>
        <div class="m2-premium"><span>${c.basis==='current'?'当前条件':'标准保障'} · M2参考年保费</span><strong><small>¥</small>${num(r.premium,2)}</strong></div>
      </div>
      <div class="m2-quote-context"><span><i style="background:${color(r.level)}"></i>综合风险 ${r.level}</span><span>${r.name} · ${esc(c.service.provider)} / ${esc(c.service.service)}</span><span>${c.basis==='current'?(r.id===c.service.region?'投保区域':'区域替换试算'):'统一保障条件比较'}</span>${!c.source.m2&&c.basis==='current'?'<span>本单未选择M2 · 附加保障试算</span>':''}</div>
      <details class="m2-terms"><summary>保障参数与计算依据</summary><div class="m2-terms-grid"><div>约定金额<strong>${money(r.terms.hourly)} / 小时</strong></div><div>等待期 / 最长赔付<strong>${num(r.terms.waiting)}分钟 / ${num(r.terms.maxHours)}小时</strong></div><div>事故 / 年度限额<strong>${money(r.terms.occLimit)} / ${money(r.terms.annualLimit)}</strong></div><div>预计年度赔款<strong>${money(r.annual)}</strong></div><div>风险附加 / 费用率<strong>${num(r.terms.riskLoad)}% / ${num(r.terms.expense)}%</strong></div><div>触发口径<strong>列明服务不可用 · 全天</strong></div></div><p>按三类事件与三档时长计算参数赔款，扣除等待期并应用事故及年度限额。年保费＝预计年度赔款 ×（1＋风险附加）÷（1－费用率）。客户业务备用不改变原服务中断指标。</p><p>区域概率、依赖关系和恢复配置为本版情景假设；参考价单独试算，投保单报价与保单仍使用原模型。当前条件读取${a.policy?'已确认保单快照':'所选服务及投保限额'}；营业日历不用于此处的全天服务指标。</p></details>
    </div>`;
  }
  function comparison(a,model,ui){const c=context(a,model,ui);return `<p>${esc(c.service.provider)} · ${esc(c.service.service)} / ${c.basis==='current'?'当前投保条件':'标准保障'} / ${M.configurations[c.configuration].name}</p><div class="table-wrap m2-comparison"><table><thead><tr><th>区域</th><th class="num">触发概率</th><th class="num">平均中断</th><th class="num">预计年赔款</th><th class="num">参考年保费</th></tr></thead><tbody>${[...c.rows].sort((a,b)=>a.premium-b.premium).map(r=>`<tr class="${r.id===c.region?'is-selected':''}"><td>${r.name}${r.id===c.region?' · 当前':''}</td><td class="num">${num(r.triggerP,2)}%</td><td class="num">${num(r.meanHours)}h</td><td class="num">${money(r.annual)}</td><td class="num"><strong>${money(r.premium)}</strong></td></tr>`).join('')}</tbody></table></div>`;}
  root.CBM2Map={render,context,comparison};
})(window);
