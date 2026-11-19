/* Deterministic demo engine. No language model decides prices or indemnity. */
(function (root) {
  'use strict';
  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, finite(v)));
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function hourly(service) {
    return Math.max(0, finite(service.volume)) * Math.max(0, finite(service.margin)) * clamp(service.irrecoverable, 0, 100) / 100;
  }
  function quote(app, model, regions) {
    const rows = app.services.map(s => {
      const r = regions.find(x => x.id === s.region) || regions[0];
      const h = hourly(s);
      const m1p = clamp(model.regionOverrides?.[r.id]?.m1 ?? r.m1, 0, 99.9) / 100;
      const m2p = clamp(model.regionOverrides?.[r.id]?.m2 ?? r.m2, 0, 99.9) / 100;
      const wait = finite(app.waiting) / 60;
      const limit = Math.max(0, Math.min(finite(app.occLimit), finite(s.limit)));
      const provider = ({ Azure: 1, AWS: .95, 'Google Cloud': 1.02, Cloudflare: 1.08, '其他': 1.15 })[s.provider] || 1;
      const resilience = s.backup === 'tested' ? .72 : s.backup === 'untested' ? .9 : 1;
      const m1event = Math.min(h * Math.max(0, Math.min(finite(app.maxHours), finite(model.duration1) - wait)), limit);
      const m2event = Math.min(h * Math.max(0, Math.min(finite(app.maxHours), finite(model.duration2) - wait)), limit);
      const pure1 = -Math.log(1 - m1p) * m1event * (finite(model.businessImpact) / 100) * provider * resilience;
      const pure2 = app.m2 ? -Math.log(1 - m2p) * m2event * (finite(model.businessImpact) / 100) * (1 + finite(model.correlation) / 100) * resilience : 0;
      const factor = (1 + finite(model.riskLoad) / 100) / (1 - clamp(model.expense, 0, 90) / 100);
      return { id: s.id, region: r, hourly: h, m1p, m2p, pure1, pure2, premium1: pure1 * factor, premium2: pure2 * factor, resilience, provider, m1event, m2event };
    });
    const sum = key => rows.reduce((a, r) => a + r[key], 0);
    const p1 = round(sum('premium1')), p2 = round(sum('premium2'));
    return { rows, hourly: sum('hourly'), pure1: sum('pure1'), pure2: sum('pure2'), p1, p2, total: round(p1 + p2), modelVersion: model.version };
  }
  function validateApplication(app) {
    const errors = [];
    if(app.coverageVersion!=='EE-CONFLICT-3.0'&&app.termsVersion==='CB-UNIFIED-2.0'&&(!app.firstInception||app.firstInception>app.periodStart))errors.push('首次承保日期不得晚于本期起保日期');
    if (!app.company.trim()) errors.push('请填写企业名称');
    if (app.termsVersion!=='CB-UNIFIED-2.0'&&(!app.contact.trim() || !app.email.trim())) errors.push('请填写联系人与联系邮箱');
    if (app.termsVersion!=='CB-UNIFIED-2.0'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(app.email)) errors.push('请输入有效联系邮箱');
    if (!app.services.length) errors.push('至少列明一项承保服务');
    if (!(finite(app.occLimit) > 0) || !(finite(app.annual1) > 0) || !(finite(app.annualTotal) > 0)) errors.push('事故及年度限额必须大于零');
    if (app.m2 && !(finite(app.annual2) > 0)) errors.push('选择M2时需设置其年度限额');
    if (finite(app.waiting) < 0 || !(finite(app.maxHours) > 0)) errors.push('等待期不得为负，最长赔偿时长须大于零');
    if (!app.periodStart || !app.periodEnd || app.periodEnd <= app.periodStart) errors.push('保险终止日期须晚于起始日期');
    app.services.forEach((s, i) => {
      if (!s.service.trim() || !s.business.trim() || !s.group.trim()) errors.push(`服务${i + 1}的名称、业务和独立业务组不能为空`);
      if (s.kind === 'AI API' && !s.endpoint.trim()) errors.push(`服务${i + 1}需列明模型/部署端点`);
      if(s.kind==='AI API'&&s.olaVersion){if(!s.model?.trim()||!s.endpoint?.trim()||!s.usageCountry?.trim())errors.push('OLA需列明模型、接口与使用地区');if(!(s.olaSuccess>0&&s.olaSuccess<=100&&s.olaResponse>0&&s.olaResponse<=3600&&Number.isInteger(s.olaWindow)&&s.olaWindow>=1&&s.olaWindow<=60&&Number.isInteger(s.olaRecovery)&&s.olaRecovery>=1&&s.olaRecovery<=60))errors.push('请填写有效的OLA成功率、响应时间及判定窗口');}
      if (!(finite(s.volume) > 0) || !(finite(s.margin) > 0) || !(hourly(s) > 0)) errors.push(`服务${i + 1}的业务量、毛利与不可挽回比例须支持正的小时金额`);
      if (!(finite(s.limit) > 0)) errors.push(`服务${i + 1}限额须大于零`);
      if (s.backup === 'tested' && !s.backupDate) errors.push(`服务${i + 1}需补充备用方案演练日期`);
    });
    const groups = app.services.map(s => s.group.trim());
    if (new Set(groups).size !== groups.length) errors.push('存在重复业务组：当前演示模型仅支持独立业务组；请合并同一业务的多项依赖后再报价，避免重复计价');
    return [...new Set(errors)];
  }
  // Parse local business timestamps as a uniform, timezone-free calendar for replay.
  function stamp(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return NaN;
    return Date.parse(s + ':00Z') / 60000;
  }
  function union(intervals) {
    const a = intervals.map(x => [...x]).sort((x,y) => x[0] - y[0]);
    return a.reduce((r, x) => { const p = r[r.length - 1]; if (p && x[0] <= p[1]) p[1] = Math.max(p[1], x[1]); else r.push(x); return r; }, []);
  }
  function formatStamp(t) { return new Date(t * 60000).toISOString().slice(11,16); }
  function assessSingle(app, claim) {
    const policy = app.policy;
    const source = policy?.terms || app;
    const s = source.services.find(x => x.id === claim.serviceId) || source.services[0];
    const errors = [];
    const raw = claim.segments.map(x => [stamp(x.start), stamp(x.end)]);
    if (!raw.length || raw.some(x => !Number.isFinite(x[0]) || !Number.isFinite(x[1]) || x[1] <= x[0])) errors.push('请填写有效的中断和恢复时间，恢复须晚于中断');
    if(claim.module==='m2'&&claim.reportedCause!=='physical')errors.push('M2须由地缘政治冲突损坏数字依赖并传导至列明服务');
    const biStart = stamp(claim.impactStart), biEnd = stamp(claim.impactEnd);
    if (!Number.isFinite(biStart) || !Number.isFinite(biEnd) || biEnd <= biStart) errors.push('业务受影响时段无效');
    if (finite(claim.declaredLoss) < 0) errors.push('声明损失不能为负');
    const failover = claim.switched ? stamp(claim.switchTime) : Infinity;
    if (claim.switched && !Number.isFinite(failover)) errors.push('成功切换时必须填写业务恢复时间');
    if (errors.length) return { errors, amount: 0, eligibleMinutes: 0, rawMinutes: 0, groups: [], s };
    const ranges = union(raw);
    const groups = [];
    ranges.forEach(x => { const p=groups[groups.length-1]; if (p && x[0] - p[p.length-1][1] <= 30) p.push(x); else groups.push([x]); });
    const periodA = stamp(source.periodStart + 'T00:00'), periodB = stamp(source.periodEnd + 'T00:00');
    const unified=source.termsVersion==='CB-UNIFIED-2.0';
    if(unified&&groups.some(g=>g[0][0]<periodA||g[0][0]>=periodB))errors.push('首次实际中断须在本保单责任年度内');
    const h = hourly(s);
    const entries = groups.map(group => {
      let wait = finite(source.waiting), payable = 0, rawMinutes = 0;
      const payableRanges = [];
      group.forEach(([a,b]) => {
        // Cap malformed long submissions at 90 days for safe browser evaluation.
        if (b - a > 90*1440) { errors.push('单段事故超过90天，请转人工分段调查'); return; }
        for (let t=a; t<b; t++) {
          if (t < periodA || (!unified&&t >= periodB)) continue;
          rawMinutes++;
          if (wait > 0) { wait--; continue; }
          const d=new Date(t*60000), weekday=d.getUTCDay(), minute=d.getUTCHours()*60+d.getUTCMinutes();
          const operating = source.calendar === '24x7' || (weekday >= 1 && weekday <= 5 && minute >= 540 && minute < 1020);
          if (t >= biStart && t < Math.min(biEnd,failover) && operating && payable < finite(source.maxHours)*60) {
            payable++;
            const prev=payableRanges[payableRanges.length-1]; if (prev && prev[1]===t) prev[1]++; else payableRanges.push([t,t+1]);
          }
        }
      });
      const parameter = h*payable/60;
      return { rawMinutes, payable, parameter, capped: Math.min(parameter, finite(s.limit), finite(source.occLimit)), ranges: payableRanges.map(x=>`${formatStamp(x[0])}–${formatStamp(x[1])}`) };
    });
    const used = app.paid || { m1: 0, m2: 0, total: 0 };
    const netLoss=Math.max(0,finite(claim.declaredLoss)-Math.max(0,finite(claim.otherCompensation)));
    const parameter=entries.reduce((a,x)=>a+x.parameter,0), eventCapped=entries.reduce((a,x)=>a+x.capped,0);
    const totalRemaining=Math.max(0,finite(source.annualTotal)-finite(used.total));
    const remaining1=Math.max(0,finite(source.annual1)-finite(used.m1));
    const remaining2=source.m2 ? Math.max(0,finite(source.annual2)-finite(used.m2)) : 0;
    const m1=round(Math.min(eventCapped,netLoss,remaining1,totalRemaining));
    const m2=round(Math.min(eventCapped,netLoss,remaining2,totalRemaining));
    const amount=claim.module==='m2'?m2:claim.module==='m1'?m1:claim.module==='pending'&&claim.bothCovered?Math.min(m1,m2):0;
    return { errors, s, groups: entries, groupCount: groups.length, rawMinutes:entries.reduce((a,x)=>a+x.rawMinutes,0), eligibleMinutes:entries.reduce((a,x)=>a+x.payable,0), parameter, netLoss, m1, m2, amount, remaining1,remaining2,totalRemaining, hourly:h };
  }
  function assess(app, claim){
    const source=app.policy?.terms||app;
    if(source.termsVersion!=='CB-UNIFIED-2.0')return assessSingle(app,claim);
    const additional=claim.additionalBusinesses||[],ids=[claim.serviceId,...additional.map(b=>b.serviceId)];
    const invalid=new Set(ids).size!==ids.length||ids.some(id=>!source.services.some(s=>s.id===id));
    const individual=[claim,...additional.map(b=>({...claim,serviceId:b.serviceId,segments:[{start:b.start,end:b.end}],impactStart:b.start,impactEnd:b.end,switched:false,declaredLoss:b.declaredLoss,otherCompensation:b.otherCompensation,additionalBusinesses:[]}))];
    const noAnnual={...source,occLimit:Number.MAX_SAFE_INTEGER,annual1:Number.MAX_SAFE_INTEGER,annual2:Number.MAX_SAFE_INTEGER,annualTotal:Number.MAX_SAFE_INTEGER};
    const rows=individual.map(c=>assessSingle({...app,policy:{terms:noAnnual},paid:{m1:0,m2:0,total:0}},c));
    const errors=[...new Set(rows.flatMap(r=>r.errors))];if(invalid)errors.push('业务必须已列明且不可重复申报');
    const used=app.paid||{},remaining1=Math.max(0,finite(source.annual1)-finite(used.m1)),remaining2=source.m2?Math.max(0,finite(source.annual2)-finite(used.m2)):0,totalRemaining=Math.max(0,finite(source.annualTotal)-finite(used.total));
    const capped=rows.reduce((sum,r)=>sum+(r.m1||0),0),m1=round(Math.min(capped,source.occLimit,remaining1,totalRemaining)),m2=round(Math.min(capped,source.occLimit,remaining2,totalRemaining));
    const raw=individual.flatMap(c=>c.segments.map(x=>[stamp(x.start),stamp(x.end)])).filter(x=>x.every(Number.isFinite));
    return {...rows[0],errors,businessRows:rows,rawMinutes:union(raw).reduce((n,[a,b])=>n+b-a,0),groupCount:Math.max(...rows.map(r=>r.groupCount||0)),eligibleMinutes:rows.reduce((n,r)=>n+r.eligibleMinutes,0),parameter:rows.reduce((n,r)=>n+(r.parameter||0),0),netLoss:rows.reduce((n,r)=>n+(r.netLoss||0),0),hourly:rows.reduce((n,r)=>n+(r.hourly||0),0),m1,m2,remaining1,remaining2,totalRemaining,amount:errors.length?0:claim.module==='m1'?m1:claim.module==='m2'?m2:claim.module==='pending'&&claim.bothCovered?Math.min(m1,m2):0};
  }
  const api={hourly,quote,validateApplication,assess,stamp,union,round};
  root.CBEngine=api;
  if (typeof module!=='undefined') module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
