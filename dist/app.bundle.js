window.CBEventManifest={"2016":"packed/events-2016.json.gz?v=97005699cfe4","2017":"packed/events-2017.json.gz?v=b22bfc09941d","2018":"packed/events-2018.json.gz?v=a7a23a1fdf9d","2019":"packed/events-2019.json.gz?v=188440962ce2","2020":"packed/events-2020.json.gz?v=e3e955ce00b0","2021":"packed/events-2021.json.gz?v=43c990cc8204","2022":"packed/events-2022.json.gz?v=64032e0f05d6","2023":"packed/events-2023.json.gz?v=76b10ce0231c","2024":"packed/events-2024.json.gz?v=616c7746ec57","2025":"packed/events-2025.json.gz?v=830a57fbd5ac"};
;
window.CBRiskManifest={"world":{"global":"CBWorldMap","packed":"packed/world.json.gz?v=08f191cc36e7","script":"world-map.js?v=e109bfe1ad20"},"m1":{"global":"CBM1PublicData","packed":"packed/m1.json.gz?v=8601d9bb0165","script":"m1-public-data.js?v=dc753d5050d1","summary":{"pricingSample":{"version":"CB-CONFLICT-3.0","reviewed":39,"included":34,"observationYears":[2023,2024,2025],"frozenHash":"45ac563de7365b01d49f639be82cc5095c447f19c11eb033e1bf1f4dc91af180","olaCalibrated":false},"count":5582}},"conflict":{"global":"CBConflictData","packed":"packed/conflict.json.gz?v=a881a7700d05","script":"conflict-data.js?v=d35c15a74045"},"exposure":{"global":"CBExposureData","packed":"packed/exposure.json.gz?v=de9e65001f65","script":"exposure-data.js?v=0771edcdb35f"}};
;
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

;
/* Conflict-linked digital dependency interruption. */
(function(root){
'use strict';
const version='EE-CONFLICT-3.0',esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults={usageCountry:'中国',upstream:'待核实',backupLegal:'unconfirmed',backupCapacity:'unconfirmed',migrationHours:48};
function verified(s){return s.backup==='tested'&&!!s.backupDate&&s.sharedDependency==='no';}
function effectiveHours(raw,s){return verified(s)?Math.min(Math.max(0,Number(raw)||0),Math.max(0,Number(s.rto)||0)/60):Math.max(0,Number(raw)||0);}
function claimErrors(a,c){if(c.module!=='m2')return [];const t=a.policy?.terms||a,errors=[];if(!t.m2)errors.push('保单未选择M2');if(c.reportedCause!=='physical')errors.push('M2须由地缘政治冲突损坏数字依赖并传导至列明服务');if(!c.eventReference?.trim())errors.push('请填写冲突事件或证据编号');if(!c.damagedDependency?.trim()||!c.causalChain?.trim())errors.push('请补充受损依赖与中断传导');return errors;}
function policyText(t){if(t.coverageVersion!==version)return '历史保单按归档条款与报价快照执行。';return 'M2外部事件中断：地缘政治冲突损坏企业依赖的数字服务、数据中心、供电或通信设施，传导至列明服务并造成业务中断损失。按约定标准计量实际中断，原服务或备用恢复后停止计时；赔款受贡献毛利净损失与保单限额约束。';}
function timeline(c){return `<div class="conflict-chain"><span>地缘政治冲突</span><b>→</b><span>数字依赖受损</span><b>→</b><span>企业服务中断</span><b>→</b><span>业务损失</span></div>`;}
function dependency(s){return `<div class="external-dependency"><span>关键数字依赖</span><strong data-user-text>${esc(s.upstream||s.provider)}</strong><span>企业使用地区</span><strong data-user-text>${esc(s.usageCountry||'待核实')}</strong></div>`;}
const api={version,defaults,verified,effectiveHours,claimErrors,policyText,timeline,dependency};root.CBExternal=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

;
(function () {
  'use strict';
  const regions = [
    {id:'us-east',name:'美国东部',country:'美国',code:'East US',x:208,y:114,m1:18,m2:.6,level:'较低',desc:'成熟云区域；关注网络配置、容量与跨服务共同依赖。'},
    {id:'eu-west',name:'西欧',country:'荷兰',code:'West Europe',x:391,y:83,m1:16,m2:1.2,level:'较低',desc:'关注跨区网络依赖、设施供电与区域集中度。'},
    {id:'singapore',name:'东南亚',country:'新加坡',code:'Southeast Asia',x:568,y:194,m1:20,m2:.8,level:'中等',desc:'区域业务枢纽；核查备用区域是否共享上游网络。'},
    {id:'japan',name:'日本东部',country:'日本',code:'Japan East',x:638,y:121,m1:22,m2:1.8,level:'中等',desc:'关注备用可用性及物理风险；自然灾害不自动归入M2。'},
    {id:'middle-east',name:'中东区域',country:'阿联酋',code:'UAE North',x:464,y:150,m1:25,m2:9,level:'较高',desc:'演示较高外溢风险；M2仍须逐案验证设施所在国及完整因果链。'},
    {id:'australia',name:'澳大利亚东部',country:'澳大利亚',code:'Australia East',x:640,y:252,m1:15,m2:.4,level:'较低',desc:'关注单一区域集中度、跨洋链路与备用恢复时间。'},
    {id:'brazil',name:'巴西南部',country:'巴西',code:'Brazil South',x:268,y:234,m1:23,m2:1,level:'中等',desc:'关注本地与跨境网络依赖，区分服务恢复与业务恢复。'}
  ];
  const model={version:'DEMO-1.0',duration1:3,duration2:8,businessImpact:65,riskLoad:15,expense:25,correlation:30,regionOverrides:{},activatedAt:'2026-10-26',status:'演示生效'};
  const service={...window.CBExternal?.defaults,id:'SVC-01',provider:'Azure',kind:'云计算',service:'Virtual Machines',region:'us-east',endpoint:'生产数据面 / vm-prod-eastus',business:'跨境电商订单处理',group:'BIZ-01',volume:100,margin:400,irrecoverable:50,backup:'none',backupDate:'',rto:60,limit:400000,dependency:'订单校验、库存确认与支付后履约必须调用该生产服务；备用系统尚未通过端到端演练。'};
  function base() { return {id:'CB-A-2026-001',company:'远帆跨境科技有限公司',industry:'跨境电商',contact:'陈晓 · 财务负责人',email:'chen@example.com',registration:'DEMO-91310000',periodStart:'2026-11-01',periodEnd:'2027-11-01',calendar:'business',waiting:30,maxHours:20,occLimit:400000,annual1:800000,annual2:400000,annualTotal:1200000,m2:true,coverageVersion:'EE-2.0',services:[structuredClone(service)],stage:'submitted',consent:true,quote:null,policy:null,paid:{m1:0,m2:0,total:0},history:[{at:'2026-10-26 09:20',text:'客户提交投保问卷 · 等待核保'}]}; }
  function claim(app) {
    const physical=app.sampleKind==='m2-physical',access=app.sampleKind==='m2'||(!physical&&app.id.endsWith('003'));
    const margin=Number(app.services[0].margin)||400;
    const result={id:'CB-C-'+app.id.slice(5),serviceId:app.services[0].id,module:physical||access?'m2':'m1',reportedCause:physical?'physical':access?'access':'ordinary',segments:[{start:'2026-11-17T10:00',end:'2026-11-17T11:50'}],impactStart:'2026-11-17T10:00',impactEnd:'2026-11-17T11:50',switched:false,switchTime:'2026-11-17T10:40',attempted:true,
      measures:'10:08 启动备用方案；10:18 验证失败，未成功接管。持续重试并暂停新增任务，恢复后核对积压队列。',
      recovery:'11:50 服务及关键交易恢复；11:55 完成连续五分钟恢复确认。',
      description:physical?'情景假设：第三国设施上游供电因约定物理事件受损，导致列明服务中断。须调查设施国地位及因果链。':'模拟服务商网络配置故障，导致生产数据面连接失败。关键订单无法完成，未成功切换。',
      declaredLoss:80*margin,otherCompensation:0,lostTasks:80,taskMargin:margin,financialBasis:`80笔最终取消且无法补做的付费任务 × 每笔${margin}元贡献毛利；已扣除节省的可变成本。`,financeSigner:app.contact,
      declaration:false,submitted:false,reviewed:false,approved:false,paid:false,playback:false,bothCovered:false,physicalVerified:false,countryVerified:false,causalVerified:false,account:'演示对公账户 · 尾号0000',evidence:{E01:true,E02:true,E03:true,E04:true,E05:false,E07:true},uploads:[],notes:'',
      reviewNote:'示例调查记录：监测、业务交易和切换记录的事故时段相互吻合。待核赔人逐项复核。',
      liabilityNote:physical?'演示调查意见：按M2物理冲突外溢情景审查，须核实约定物理事件、非直接交战国设施及完整因果链后方可核定。':'演示调查意见：模拟网络配置故障按M1审查，列明服务与业务影响相对应；须核查原始材料及具体除外事实后确认责任。',checked:[]};
    if(physical)Object.assign(result,{eventReference:'DEMO-PHYSICAL-01',noticeAt:'2026-11-17T09:50',effectiveAt:'2026-11-17T09:50'});
    if(access)Object.assign(result,{noticeAt:'2026-11-03T09:00',effectiveAt:'2026-11-17T10:00',eventReference:'DEMO-ACCESS-01',knownAtInception:false,segments:[{start:'2026-11-17T10:00',end:'2026-11-17T18:00'}],switched:true,switchTime:'2026-11-17T11:50',description:'示例供应商因新的技术服务准入限制，于11月3日通知客户在11月17日停止列明端点服务。原服务停供后，迁移适配尚未完成，关键业务实际中断110分钟。',measures:'11月3日启动替代方案；11月17日10:00原服务停供，11:20完成适配，11:50替代环境通过关键交易验证。',recovery:'11:50合格替代服务恢复业务，原端点18:00恢复；赔付计时在11:50停止。',liabilityNote:'待核验公告适用主体与服务范围、关键依赖、合理迁移措施和合格恢复记录；公告及准备期不计入赔付。'});
    return result;
  }
  const a=base(),b=base(),c=base();
  b.id='CB-A-2026-002';b.company='语桥智能服务有限公司';b.industry='AI应用服务';b.stage='draft';b.contact='林远 · 运营负责人';b.email='lin@example.com';b.services=[{...structuredClone(service),kind:'AI API',service:'Azure OpenAI',endpoint:'gpt-4.1 / deployment-prod（示例）',business:'按次收费的多语种内容生成',group:'BIZ-AI',volume:120,margin:100,irrecoverable:60,backup:'tested',backupDate:'2026-10-20',backupLegal:'yes',backupCapacity:'yes',sharedDependency:'no',migrationHours:12,rto:15,dependency:'按唯一付费任务归集调用；失败重试不重复计算，恢复后可补做部分不计永久损失。'}];b.history=[{at:'2026-10-26 08:50',text:'客户保存AI API投保草稿'}];
  c.id='CB-A-2026-003';c.company='星链出海软件有限公司';c.industry='跨境SaaS';c.contact='周宁 · 技术负责人';c.email='zhou@example.com';c.services=[{...structuredClone(service),provider:'其他',service:'Example Cloud API',region:'singapore',business:'跨境SaaS付费任务处理',upstream:'Example Compute',contractEntity:'星链出海软件有限公司',dependency:'列明服务依赖跨境通信链路；冲突损坏上游通信设施后，服务中断传导至企业业务。'}];c.history=[{at:'2026-10-26 09:10',text:'客户提交外部事件中断投保单'}];
  [a,b,c].forEach(x=>x.claim=claim(x));
  const events=[
    {date:'2024.07.30',title:'Azure Front Door 连接异常',provider:'Azure',region:'多地区',module:'M1参考',summary:'微软披露部分客户出现连接错误、超时和延迟；涉及DDoS防护、网络路由及控制面问题。',url:'https://azure.status.microsoft/status/history/?trackingId=KTY1-HW8',source:'Microsoft Azure · 官方事后报告'},
    {date:'2021.12.07',title:'AWS US-EAST-1 服务事件',provider:'AWS',region:'美国东部',module:'M1参考',summary:'AWS披露北弗吉尼亚区域服务中断。用于说明区域及上游依赖，不等同于本客户事故。',url:'https://aws.amazon.com/message/12721/',source:'Amazon Web Services · 官方事件总结'},
    {date:'2025.06.12',title:'Cloudflare 多项服务中断',provider:'Cloudflare',region:'多地区',module:'M1参考',summary:'官方披露Workers KV等多项服务受到影响，展示公共上游依赖带来的跨服务传播。',url:'https://blog.cloudflare.com/cloudflare-service-outage-june-12-2025/',source:'Cloudflare · 官方事故复盘'}
  ];
  window.CBData={regions,model,apps:[a,b,c],events,base,claim,service};
})();

;
window.CBWorldMap={"points":{"us-east":[302.5,135.3],"eu-west":[490.3,92.9],"singapore":[732.8,236.2],"japan":[799.5,139],"middle-east":[610.7,168.8],"australia":[828.1,335.9],"brazil":[369.5,306.7]}};
;
/* Local, accessible select presentation. Native selects remain the data source. */
(function () {
  'use strict';
  let opened=null,typeBuffer='',typeTimer;
  const glyphs={
    industry:'M4 21V9l8-6 8 6v12M9 21v-7h6v7M8 10h.01M16 10h.01',
    clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    cloud:'M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11 1 4.5 4.5 0 0 1 0 9Z',
    globe:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20',
    shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',
    layers:'m12 3 10 5-10 5L2 8ZM2 12l10 5 10-5M2 16l10 5 10-5'
  };
  const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  function close(){
    if(!opened)return;
    opened.button.setAttribute('aria-expanded','false');
    opened.button.removeAttribute('aria-activedescendant');
    opened.button.removeAttribute('aria-controls');
    opened.menu.remove();opened=null;typeBuffer='';clearTimeout(typeTimer);
  }
  function position(){
    if(!opened)return;
    const {button,menu}=opened;
    if(!button.isConnected){close();return;}
    const r=button.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight;
    if(r.bottom<0||r.top>vh){close();return;}
    const width=Math.min(Math.max(r.width,220),vw-24),desired=Math.min(menu.scrollHeight,288),below=vh-r.bottom-12,above=r.top-12;
    const up=below<desired&&above>below,height=Math.max(60,Math.min(desired,up?above:below));
    Object.assign(menu.style,{width:width+'px',maxHeight:height+'px',left:Math.max(12,Math.min(r.left,vw-width-12))+'px',top:(up?r.top-height-6:r.bottom+6)+'px'});
  }
  function highlight(index){
    if(!opened)return;
    const {select,button,menu}=opened,options=[...select.options];
    index=Math.max(0,Math.min(index,options.length-1));
    opened.active=index;
    [...menu.children].forEach((item,i)=>item.classList.toggle('is-active',i===index));
    const item=menu.children[index];
    button.setAttribute('aria-activedescendant',item.id);
    item.scrollIntoView({block:'nearest'});
  }
  function commit(index){
    if(!opened||opened.select.options[index]?.disabled)return;
    const {select,button}=opened,key=button.dataset.selectKey;
    const changed=select.selectedIndex!==index;
    select.selectedIndex=index;close();
    if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));
    const replacement=[...document.querySelectorAll('.select-trigger')].find(x=>x.dataset.selectKey===key);
    (replacement||button).focus({preventScroll:true});
  }
  function open(select,button,initial){
    close();if(select.disabled)return;
    const menu=document.createElement('div');menu.className='select-menu';menu.id=button.id+'-list';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',button.getAttribute('aria-label'));
    [...select.options].forEach((option,index)=>{
      const item=document.createElement('div');item.className='select-option';item.id=menu.id+'-'+index;item.setAttribute('role','option');item.setAttribute('aria-selected',String(index===select.selectedIndex));
      if(option.disabled)item.setAttribute('aria-disabled','true');
      const text=document.createElement('span');text.textContent=option.textContent;item.append(text);
      if(index===select.selectedIndex){item.classList.add('is-selected');item.insertAdjacentHTML('beforeend',svg('m5 12 4 4L19 6'));}
      item.addEventListener('pointerdown',event=>event.preventDefault());
      item.addEventListener('click',()=>commit(index));
      menu.append(item);
    });
    // Keep the menu in a dialog's top layer when a dialog owns the field.
    (button.closest('dialog')||document.body).append(menu);
    opened={select,button,menu,active:select.selectedIndex};button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',menu.id);
    position();highlight(initial??select.selectedIndex);
  }
  function enhance(root){
    root.querySelectorAll('select:not([data-enhanced])').forEach((select,index)=>{
      const field=select.closest('.field'),label=field?.querySelector('span')?.textContent||'选择选项';
      const key=['a','s','c','seg','m','r'].map(k=>select.dataset[k]?'data-'+k+':'+select.dataset[k]:'').filter(Boolean).join('|')||label+index;
      const name=/行业/.test(label)?'industry':/时间|等待/.test(label)?'clock':/区域|地区/.test(label)?'globe':/厂商/.test(label)?'cloud':/备份|保障|责任/.test(label)?'shield':'layers';
      // Replace the wrapping label so clicking the custom button does not activate the hidden native control.
      if(field?.tagName==='LABEL'){const div=document.createElement('div');div.className=field.className;while(field.firstChild)div.append(field.firstChild);field.replaceWith(div);}
      const button=document.createElement('button');button.type='button';button.className='select-trigger';button.id='cb-select-'+index;button.dataset.selectKey=key;button.disabled=select.disabled;
      button.setAttribute('role','combobox');button.setAttribute('aria-label',label);button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
      button.innerHTML=`<span class="select-leading">${svg(glyphs[name])}</span><span class="select-value"></span><span class="select-chevron">${svg('m7 10 5 5 5-5')}</span>`;
      button.querySelector('.select-value').textContent=select.selectedOptions[0]?.textContent||'请选择';
      const note=select.parentElement.querySelector('small');if(note){note.id=button.id+'-hint';button.setAttribute('aria-describedby',note.id);}
      select.dataset.enhanced='true';select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(button);
      button.addEventListener('click',()=>opened?.button===button?close():open(select,button));
      button.addEventListener('keydown',event=>{
        if(['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(event.key)){
          event.preventDefault();
          if(event.key==='Escape'){close();return;}
          if(event.key==='Enter'||event.key===' '){if(opened?.button===button)commit(opened.active);else open(select,button);return;}
          if(opened?.button!==button)open(select,button);
          const step=event.key==='ArrowDown'?1:-1;
          let next=event.key==='Home'?0:event.key==='End'?select.options.length-1:opened.active+step;
          while(select.options[next]?.disabled)next+=step;
          highlight(next);return;
        }
        if(event.key==='Tab'){close();return;}
        if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
          if(opened?.button!==button)open(select,button);
          clearTimeout(typeTimer);typeBuffer+=event.key.toLocaleLowerCase();typeTimer=setTimeout(()=>{typeBuffer='';},700);
          const match=[...select.options].findIndex(o=>!o.disabled&&o.textContent.toLocaleLowerCase().startsWith(typeBuffer));if(match>=0)highlight(match);
        }
      });
    });
  }
  document.addEventListener('pointerdown',event=>{if(opened&&!opened.button.contains(event.target)&&!opened.menu.contains(event.target))close();});
  document.addEventListener('focusin',event=>{if(opened&&!opened.button.contains(event.target)&&!opened.menu.contains(event.target))close();});
  window.addEventListener('resize',position);
  document.addEventListener('scroll',event=>{if(opened&&!opened.menu.contains(event.target))position();},true);
  window.CBSelectUI={enhance,close};
})();

;
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

;

;

;
/* Public infrastructure catalog UI; does not read or mutate insurance pricing inputs. */
(function(root){
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 const labels={'Azure':'Azure','AWS':'AWS','Google Cloud':'Google Cloud','Alibaba Cloud':'阿里云','Tencent Cloud':'腾讯云','Huawei Cloud':'华为云','Volcengine':'火山引擎','Oracle Cloud':'Oracle Cloud','IBM Cloud':'IBM Cloud','Cloudflare':'Cloudflare'};
 const types={'cloud-region':'云区域','classic-datacenter':'经典数据中心','edge-pop':'边缘节点'};
 const statuses={listed:'目录收录',restricted:'受限访问',retired:'已退役',announced:'已公告',unknown:'待核实'};
 const data=()=>root.CBExposureData;
 const kind=r=>r.infrastructureType||'cloud-region';
 const status=r=>r.catalogStatus||'listed';
 const located=r=>Array.isArray(r?.representativeLonLat)&&r.representativeLonLat.length===2&&r.representativeLonLat.every(Number.isFinite);
 function countryName(code){if(!code)return '位置待核实';try{return new Intl.DisplayNames([root.CBI18n?.locale||'zh-CN'],{type:'region'}).of(code)||code;}catch{return code;}}
 function select(label,key,value,options){return `<label class="field"><span>${label}</span><select aria-label="${label}" data-evidence="${key}" ${options.length?'':'disabled'}>${(options.length?options:[['','没有匹配结果']]).map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
 function filter(ui){
  const query=String(ui.evidenceSearch||'').trim().toLowerCase();
  return data().records.filter(r=>(!ui.evidenceProvider||ui.evidenceProvider==='all'||r.provider===ui.evidenceProvider)&&(!ui.evidenceCountry||ui.evidenceCountry==='all'||r.countryCode===ui.evidenceCountry)&&(!ui.evidenceKind||ui.evidenceKind==='all'||kind(r)===ui.evidenceKind)&&((ui.evidenceStatus||'current')==='all'||['listed','restricted'].includes(status(r)))&&(!query||[r.provider,labels[r.provider],r.code,r.name,r.publishedLocation,r.countryCode,countryName(r.countryCode),...(r.searchAliases||[])].join(' ').toLowerCase().includes(query)));
 }
 function controls(ui,records,region){
  const providers=[...new Set(data().records.map(r=>r.provider))];
  const countries=[...new Set(data().records.map(r=>r.countryCode).filter(Boolean))].sort((a,b)=>countryName(a).localeCompare(countryName(b)));
  return `<div class="catalog-controls">
    ${select('云服务商','evidenceProvider',ui.evidenceProvider||'all',[['all','全部厂商'],...providers.map(p=>[p,labels[p]||p])])}
    ${select('国家 / 地区','evidenceCountry',ui.evidenceCountry||'all',[['all','全部国家 / 地区'],...countries.map(c=>[c,countryName(c)])])}
    ${select('基础设施类型','evidenceKind',ui.evidenceKind||'all',[['all','全部类型'],...Object.entries(types)])}
    ${select('目录状态','evidenceStatus',ui.evidenceStatus||'current',[['current','现行目录'],['all','包含公告与退役记录']])}
    <label class="field catalog-search"><span>搜索目录</span><input type="search" data-exposure-search="true" value="${esc(ui.evidenceSearch||'')}" placeholder="搜索区域、城市或代码" autocomplete="off" aria-label="搜索目录"></label>
    <div class="catalog-actions"><button class="text-btn" data-catalog-action="china">查看中国区域</button><button class="text-btn" data-catalog-action="reset">清空筛选</button><a href="cloud-infrastructure.csv" download>下载完整目录 ↗</a></div>
  </div><div class="catalog-region-row">${select('区域 / 节点','evidenceRegion',region?.id||'',records.map(r=>[r.id,(labels[r.provider]||r.provider)+' · '+r.code+' · '+r.name]))}</div>`;
 }
 function summary(records){return `<div class="evidence-summary catalog-summary"><div><span>完整目录记录</span><strong>${data().records.length}</strong></div><div><span>符合筛选条件</span><strong>${records.length}</strong></div><div><span>可定位记录</span><strong>${records.filter(located).length}</strong></div></div>`;}
 function detail(r){if(!r)return `<div class="catalog-empty"><h3>没有匹配结果</h3><p>调整厂商、地区、类型或搜索条件。</p><button class="text-btn" data-catalog-action="reset">清空筛选</button></div>`;
  const precision={country:'国家级',admin1:'行政区级',metro:'都市圈',city:'城市级',unknown:'位置待核实'}[r.publishedAccuracy]||'近似区域';
  const zones=r.zones||[],zoneCount=r.zoneCount??zones.length;
  const zoneText=zones.map(z=>typeof z==='string'?z:z.code||z.id||z.name).filter(Boolean);
  const note=Array.isArray(r.notes)?r.notes.join(' '):r.notes||r.sourceNote||'';
  return `<span class="evidence-badge">${types[kind(r)]||kind(r)}</span><h3 data-no-translate>${esc(r.name)}</h3><div class="evidence-code" data-no-translate>${esc(r.provider)} · ${esc(r.code)}</div>
   ${r.codeStatus==='editorial_city_identifier_not_provider_region_code'?'<p class="evidence-note">城市目录标识，非厂商区域代码。</p>':''}<dl><div><dt>官方公布位置</dt><dd data-no-translate>${esc(r.publishedLocation||'—')}</dd></div><div><dt>国家 / 地区</dt><dd data-no-translate>${esc(countryName(r.countryCode))}</dd></div><div><dt>位置精度</dt><dd>${precision}</dd></div><div><dt>目录状态</dt><dd>${statuses[status(r)]||'待核实'}${r.restricted&&status(r)!=='restricted'?' · 受限访问':''}</dd></div>
   ${r.partition?`<div><dt>运营分区</dt><dd data-no-translate>${esc(r.partition)}</dd></div>`:''}${r.operator?`<div><dt>运营方</dt><dd data-no-translate>${esc(r.operator)}</dd></div>`:''}
   ${zoneCount?`<div><dt>目录可用区 / 可用域</dt><dd>${zoneCount}</dd></div>`:''}<div><dt>服务可用性</dt><dd>以具体产品目录为准</dd></div></dl>
   <p class="evidence-note">${located(r)?'地图标记为城市或区域代表位置，不是具体机房地址。':'位置未公开或尚未核实，保留目录记录，不在地图定位。'}</p>
   <div class="evidence-links">${link(r.sourceUrl,'官方目录来源')}${r.serviceEvidence?.url&&r.serviceEvidence.url!==r.sourceUrl?link(r.serviceEvidence.url,'服务区域目录'):''}</div>
   ${zoneText.length?`<details><summary>可用区 / 可用域标识</summary><p class="catalog-zone-list" data-no-translate>${zoneText.map(esc).join(' · ')}</p></details>`:''}
   ${note?`<details><summary>目录核对备注</summary><p class="evidence-note" data-no-translate>${esc(note)}</p>${r.statusSourceUrl?link(r.statusSourceUrl,'状态依据'):''}</details>`:''}
   ${kind(r)==='edge-pop'?'<p class="evidence-note">边缘网络节点不等于可部署虚拟机的云区域。</p>':''}`;
 }
 function sourceSummary(){return `<div><b>公开云基础设施目录</b><span>${data().records.length} · ${[...new Set(data().records.map(r=>r.provider))].length} <span>家厂商</span></span><p>按官方目录收录云区域、经典数据中心与边缘节点；分别标明运营分区、状态和位置精度。</p>${link('cloud-infrastructure.csv','下载完整目录')} · ${link('DATA-SOURCES.md','数据来源与方法')}</div>`;}
 function coverage(){
  const providers=[...new Set(data().records.map(r=>r.provider))];
  return `<details class="catalog-coverage"><summary>目录覆盖与官方来源</summary><p>记录数量按目录条目计算，不等于物理机房数量。边缘节点、云区域和经典数据中心分开筛选。</p><div class="table-wrap"><table><thead><tr><th>云服务商</th><th class="num">目录记录</th><th class="num">中国内地</th><th>官方来源</th></tr></thead><tbody>${providers.map(p=>{const rows=data().records.filter(r=>r.provider===p),urls=[...new Set(rows.map(r=>r.sourceUrl))];return `<tr><td>${labels[p]||esc(p)}</td><td class="num">${rows.length}</td><td class="num">${rows.filter(r=>r.countryCode==='CN').length}</td><td>${urls.map((url,i)=>link(url,urls.length>1?'来源 '+(i+1):'官方目录')).join(' · ')}</td></tr>`;}).join('')}</tbody></table></div><p>核对日期：2026-11-17。具体产品、配额与实时运行状态需另行核验。</p><p>城市参考坐标：GeoNames · CC BY 4.0 · ${link('https://www.geonames.org/export/','坐标来源')}</p></details>`;
 }
 root.CBExposureCatalog={filter,controls,summary,detail,sourceSummary,coverage,located};
})(window);

;
(function(root){
 'use strict';
 const cache=new Map(),pending=new Map(),size=5;let current={years:[],key:'',type:0,cell:'',page:0};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const types=['全部事件','国家型冲突','非国家冲突','单方面暴力'];
 const tr=x=>root.CBI18n?root.CBI18n.t(x):x;
 const period=years=>years.length===1?String(years[0]):years[0]+'–'+years.at(-1);
 function shell(years,type,cell){const values=(Array.isArray(years)?years:[Number(years)]).map(Number);return `<div id="event-directory" data-years="${values.join(',')}" data-type="${type}" data-cell="${esc(cell||'')}"><p>${cell?'正在加载事件目录…':'点击热图网格查看该区域的事件'}</p></div>`;}
 function rows(){return current.years.flatMap(year=>(cache.get(year)?.get(current.cell)||[]).filter(r=>!current.type||r[3]===current.type).map(r=>({r,year}))).sort((a,b)=>b.year-a.year||b.r[1].localeCompare(a.r[1])||Number(b.r[0])-Number(a.r[0]));}
 function paint(){const host=document.getElementById('event-directory');if(!host||current.key!==host.dataset.years||current.cell!==host.dataset.cell||current.years.some(y=>!cache.has(y)))return;
  const selected=rows(),pages=Math.max(1,Math.ceil(selected.length/size));current.page=Math.min(current.page,pages-1);
  const [x,y]=current.cell.split(',').map(Number);
  host.innerHTML=`<div class="event-directory-toolbar"><div><strong>具体事件目录</strong><p>UCDP GED 26.1 · ${period(current.years)} · <span>${types[current.type]}</span> · <b data-event-count>${selected.length.toLocaleString('en-US')}</b> <span>条记录</span></p></div><div class="event-cell-label"><span>所选网格</span><b data-no-translate>${x}° → ${x+1}° E · ${y}° → ${y+1}° N</b></div></div>
  <div class="table-wrap"><table><thead><tr><th>事件编号</th><th>日期区间</th><th>事件类型</th><th>地点与行政区</th><th>位置精度</th></tr></thead><tbody>${selected.slice(current.page*size,(current.page+1)*size).map(({r,year})=>`<tr data-event-id="${esc(r[0])}" data-event-year="${year}"><td>GED #${esc(r[0])}</td><td>${esc(r[1])}${r[2]!==r[1]?'<br>→ '+esc(r[2]):''}<small>${year} · date_prec ${r[8]}</small></td><td>${types[r[3]]}</td><td><span data-no-translate>${esc(r[6])}<small>${esc([r[5],r[4]].filter(Boolean).join(' · '))}</small></span></td><td>${r[7]}<small>${r[7]===1?'具体地点':'已知点周边'}</small></td></tr>`).join('')||'<tr><td colspan="5">该网格在当前时段及类型下没有事件</td></tr>'}</tbody></table></div>
  <div class="event-pagination"><span><b data-event-current>${current.page+1}</b> / <b data-event-pages>${pages}</b> <span>页</span> · <span>每页</span> ${size}</span><div class="event-page-controls"><button data-event-page="first" ${current.page===0?'disabled':''}>首页</button><button data-event-page="prev" ${current.page===0?'disabled':''}>上一页</button><button data-event-page="next" ${current.page>=pages-1?'disabled':''}>下一页</button><button data-event-page="last" ${current.page>=pages-1?'disabled':''}>末页</button><form data-event-jump-form><label><span>跳至</span><input type="number" data-event-jump aria-label="页码" min="1" max="${pages}" step="1" value="${current.page+1}" required><span>页</span></label><button type="submit">跳转</button></form></div></div>`;
  root.CBI18n?.apply();
 }
 async function load(year){if(cache.has(year))return;if(!pending.has(year))pending.set(year,(root.CBEventManifest&&location.protocol!=='file:'&&typeof DecompressionStream!=='undefined'?root.CBRiskAssets.json(root.CBEventManifest[year]):fetch(`events/${year}.json`).then(r=>{if(!r.ok)throw Error(r.status);return r.json();})).then(d=>{if(d.year!==year)throw Error('Wrong event year');const cells=new Map();for(const r of d.records){if(!r[9])continue;if(!cells.has(r[9]))cells.set(r[9],[]);cells.get(r[9]).push(r);}cache.set(year,cells);}).finally(()=>pending.delete(year)));await pending.get(year);}
 async function mount(){const host=document.getElementById('event-directory');if(!host)return;const key=host.dataset.years,years=key.split(',').map(Number),type=Number(host.dataset.type),cell=host.dataset.cell||'';
  if(current.key!==key||current.type!==type||current.cell!==cell)current={years,key,type,cell,page:0};
  if(!cell){root.CBI18n?.apply();return;}
  if(years.every(y=>cache.has(y))){paint();return;}
  try{await Promise.all(years.map(load));if(document.getElementById('event-directory')===host)paint();}
  catch{if(host.isConnected)host.innerHTML=`<p>${tr('事件目录加载失败，请重试。')}</p><button data-event-retry>${tr('重试')}</button>`;}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-event-page],[data-event-retry]');if(!b||b.disabled)return;if(b.hasAttribute('data-event-retry')){mount();return;}const last=Math.max(0,Math.ceil(rows().length/size)-1);current.page=b.dataset.eventPage==='first'?0:b.dataset.eventPage==='last'?last:Math.max(0,Math.min(last,current.page+(b.dataset.eventPage==='next'?1:-1)));paint();document.querySelector(`[data-event-page="${b.dataset.eventPage}"]`)?.focus({preventScroll:true});});
 document.addEventListener('submit',e=>{if(!e.target.matches('[data-event-jump-form]'))return;e.preventDefault();const input=e.target.querySelector('[data-event-jump]');if(!input.reportValidity())return;current.page=Number(input.value)-1;paint();document.querySelector('[data-event-jump]')?.focus({preventScroll:true});});
 root.CBEventDirectory={shell,mount};
})(window);

;
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

;
/* Historical evidence explorer. Never converts conflict counts to insured probabilities. */
(function(root){
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:1});
  const link=(url,text)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`;
  const types=['全部事件','国家型冲突','非国家冲突','单方面暴力'];
  const layers=[['hazard','01','危险性','地缘政治冲突观测'],['exposure','02','风险暴露','设施与关键依赖'],['recovery','03','中断与恢复','情景参数']];
  const focuses={world:['全球',0,20,960],europe:['欧洲',30,47,330],middleEast:['中东',44,28,240],africa:['非洲',20,3,430],asia:['亚洲',104,25,450],china:['中国',105,33,260],americas:['美洲',-85,5,470]};
  function raw(lon,lat){const l=lon*Math.PI/180,p=lat*Math.PI/180,p2=p*p,p4=p2*p2;return [l*(.8707-.131979*p2+p4*(-.013791+p4*(.003971*p2-.001529*p4))),p*(1.007226+p2*(.015085+p4*(-.044475+.028874*p2-.005916*p4)))];}
  const scale=228/raw(0,90)[1];
  function project(lon,lat){const [x,y]=raw(lon,lat);return [480+x*scale,240-y*scale];}
  const sum=a=>a.reduce((n,x)=>n+x,0),count=(a,t)=>t?a[t-1]:sum(a);
  const fill=n=>n>=500?'#a74737':n>=100?'#c96a45':n>=20?'#de9565':n>=5?'#eac397':'#f1dfc4';
  const option=(v,t,s)=>`<option value="${esc(v)}" ${String(v)===String(s)?'selected':''}>${esc(t)}</option>`;
  function select(label,key,value,options){return `<label class="field"><span>${label}</span><select aria-label="${label}" data-evidence="${key}">${options.map(([v,t])=>option(v,t,value)).join('')}</select></label>`;}
  function baseMap(){const geo=root.CBWorldMap;return `<path class="risk-ocean" d="${geo.sphere}" fill="#f7f9fb"/><path class="risk-grid" d="${geo.graticule}" fill="none" stroke="#e3e8ed" stroke-width=".5"/><path class="risk-land" d="${geo.land}" fill="#e5e9ec" stroke="#bac6ce" stroke-width=".35"/>`;}
  function sourcePanel(){return `<div class="evidence-sources">
    <div><b>UCDP GED 26.1</b><span>观测数据 · 2016–2025</span><p>致死的有组织暴力；按事件数聚合，不按死亡人数加权。空白网格不代表零风险。</p>${link(root.CBConflictData.source,'下载原始数据')} · ${link(root.CBConflictData.codebook,'字段代码本')}</div>
    ${root.CBExposureCatalog.sourceSummary()}
    <div><b>RIPE Atlas · ACLED</b><span>后续数据候选 · 未接入</span><p>网络测量可补充链路证据；更多政治暴力事件需另行取得数据许可。尚无客户级网络路由或设施故障数据。</p>${link('https://atlas.ripe.net/','网络测量')} · ${link('https://acleddata.com/faq/how-can-i-access-and-use-acled-data','事件数据访问')}</div>
    <p class="evidence-footnote">UCDP / Uppsala University · CC BY 4.0 · 数据整理：2026-11-17。网格为 1° × 1°，面积随纬度变化；只纳入 where_prec 1–2。${link('DATA-SOURCES.md','数据来源与方法')}</p>
  </div>`;}
  function context(a,model,ui){const source=a.policy?.terms||a,services=source.services||a.services,service=services.find(s=>s.id===ui.m2Service)||services[0];const region=Object.hasOwn(root.CBM2Risk.regions,ui.region)?ui.region:service.region;return {source,services,service,region};}
  function recovery(a,model,ui){return root.CBUnifiedUI.recovery(a,model,ui);}
  // Geographic browsing, not a calibrated conflict impact footprint or capacity ranking.
  const hubs=[['美国东部',-77.5,39],['西欧',8.7,50.1],['中国北部',116.4,39.9],['中国东部',121.5,31.2],['新加坡',103.8,1.3],['日本',139.7,35.7],['澳大利亚',151.2,-33.9],['巴西',-46.6,-23.6]];
  const lonDistance=(a,b)=>Math.abs(((a-b+540)%360)-180);
  function nearby(records,center,span){return center?records.filter(r=>root.CBExposureCatalog.located(r)&&lonDistance(r.representativeLonLat[0],center[0])<=span&&Math.abs(r.representativeLonLat[1]-center[1])<=span):[];}
  function unproject(x,y){let low=-90,high=90;for(let i=0;i<50;i++){const mid=(low+high)/2;if(project(0,mid)[1]>y)low=mid;else high=mid;}const lat=(low+high)/2,lon=(x-480)/(project(180,lat)[0]-480)*180;return Math.abs(lon)<=180&&y>=12&&y<=468?[lon,lat]:null;}
  const facilityType=r=>r.infrastructureType||'cloud-region';
  const typeLabels={'cloud-region':'云区域','classic-datacenter':'经典数据中心','edge-pop':'边缘节点'};
  const typeOrder={'cloud-region':0,'classic-datacenter':1,'edge-pop':2};
  function neighborhood(ui){const span=[15,25,40].includes(Number(ui.exposureSpan))?Number(ui.exposureSpan):25,center=ui.exposureCenter;
    const records=root.CBExposureCatalog.filter({}).filter(root.CBExposureCatalog.located),rows=(center?nearby(records,center,span):records).slice().sort((a,b)=>(typeOrder[facilityType(a)]??3)-(typeOrder[facilityType(b)]??3)||a.id.localeCompare(b.id));
    const groups=new Map();for(const r of rows){const point=project(...r.representativeLonLat),match=[...groups.entries()].find(([,rs])=>{const anchor=project(...rs[0].representativeLonLat);return Math.hypot(point[0]-anchor[0],point[1]-anchor[1])<Math.max(.015,(center?26:40)*(Number(ui.evidenceViewportWidth)||(center?300:960))/960);});if(match)match[1].push(r);else groups.set(r.representativeLonLat.map(n=>n.toFixed(2)).join(','),[r]);}
    return {span,center,rows,groups,records};
  }
  function neighborhoodPins(n,ui,width){const k=width/800;
    return [...n.groups.entries()].map(([key,rs])=>{const [x,y]=project(...rs[0].representativeLonLat),kind=rs.length>1&&rs.some(r=>facilityType(r)!=='edge-pop')?'cluster':facilityType(rs[0]),selected=rs.some(r=>r.id===ui.evidenceRegion),cloud=kind==='cloud-region'||kind==='cluster',edge=kind==='edge-pop';
      const radius=(cloud?Math.min(15,6+Math.sqrt(rs.length)*.9):edge?Math.min(5,2.8+Math.log2(rs.length)*.55):Math.min(10,4.5+Math.sqrt(rs.length)*.7))*k;
      const counts=Object.keys(typeLabels).map(type=>[type,rs.filter(r=>facilityType(r)===type).length]).filter(([,v])=>v),label=counts.map(([type,v])=>typeLabels[type]+' '+v).join(' · '),names=[...new Set(rs.map(r=>r.provider))].join(' / ');
      return `<g class="nearby-facility facility-${kind} ${selected?'is-selected':''}" data-exposure-group="${key}" data-facility-type="${kind}" data-entry-count="${rs.length}" role="button" tabindex="0" aria-label="${esc(label+' · '+names)}"><title>${esc(label)}
${esc(names)}</title><circle cx="${x}" cy="${y}" r="${Math.max(radius+2*k,10*k)}" fill="transparent"/>${selected?`<circle cx="${x}" cy="${y}" r="${radius+4*k}" fill="none" stroke="#83b0cf" stroke-opacity=".6" stroke-width="${k}"/>`:''}<circle class="facility-symbol" cx="${x}" cy="${y}" r="${radius}" fill="${cloud?'#dcebf5':edge?'#a8b8c4':'#668fac'}" fill-opacity="${cloud?'.82':'.95'}" stroke="${cloud?'#6596b8':'#fff'}" stroke-width="${(cloud?1.2:1)*k}"/>${rs.length>1&&!edge?`<text x="${x}" y="${y+3*k}" text-anchor="middle" font-size="${9*k}" font-weight="600" fill="${cloud?'#376b91':'#fff'}" pointer-events="none">${rs.length}</text>`:cloud?`<circle cx="${x}" cy="${y}" r="${2*k}" fill="#6596b8" pointer-events="none"/>`:''}</g>`;}).join('');
  }
  function facilityLegend(){return `<div class="facility-legend"><span><i class="legend-cluster">n</i>区域聚合</span><span><i class="legend-cloud"></i>云区域</span><span><i class="legend-datacenter"></i>经典数据中心</span><span><i class="legend-edge"></i>边缘节点</span><small>圆圈大小表示聚合数量</small></div>`;}
  function neighborhoodDetail(n,ui){if(!n.center)return `<span class="evidence-badge">全球总览</span><h3>全球设施分布</h3><p class="exposure-empty">点击设施圆点展开，滚轮或双指缩放地图。</p><div class="facility-overview-stats">${Object.entries(typeLabels).map(([type,label])=>`<div><span><i class="type-dot type-${type}"></i>${label}</span><b>${n.records.filter(r=>facilityType(r)===type).length}</b></div>`).join('')}</div><details class="facility-quick-nav"><summary>快速定位</summary><div class="exposure-hub-links">${hubs.map(([name,x,y])=>`<button data-exposure-hub="${x},${y}">${name} ↗</button>`).join('')}</div></details><p class="evidence-note">按设施类型分层，非容量或机房等级排名。</p>`;
    const focused=ui.exposureGroup?n.groups.get(ui.exposureGroup):null,rows=focused||n.rows,selected=n.rows.find(r=>r.id===ui.evidenceRegion);
    return `<span class="evidence-badge">周边设施</span><h3>${n.rows.length} <span>条目录记录</span></h3><p class="evidence-code"><span>经纬度各 ±</span> ${n.span}° · <span>现行目录</span></p>${focused?`<div class="nearby-list-heading"><span>邻近合并目录</span><b>${rows.length}</b><button data-exposure-show-all>查看周边全部</button></div>`:''}<div class="nearby-facility-list">${rows.map(r=>`<button data-evidence-region="${esc(r.id)}" class="${r.id===ui.evidenceRegion?'active':''}"><strong data-no-translate>${esc(r.provider+' · '+r.code)}</strong><span data-no-translate>${esc(r.name)}</span><small>${r.infrastructureType==='edge-pop'?'边缘节点':r.infrastructureType==='classic-datacenter'?'经典数据中心':'云区域'}</small></button>`).join('')||'<p class="exposure-empty">此范围内暂无可定位设施，可扩大检索范围。</p>'}</div>${selected?`<details class="nearby-facility-detail" open><summary>所选设施</summary>${root.CBExposureCatalog.detail(selected)}</details>`:''}<p class="evidence-note">邻近用于地图检索，不代表设施已受事件影响。</p>`;
  }
  function render(a,model,ui){
    const noticeMode=false,history=root.CBHazardHistory.scope(ui),year=String(history.year),layer=ui.m2Layer||'hazard',type=Number(ui.evidenceType)||0,provider=ui.evidenceProvider||'all',focus=ui.evidenceFocus||'world';
    const data=history.data,divisor=history.divisor,cells=data.cells.filter(c=>count(c.n,type)>0),ranked=[...cells].sort((a,b)=>count(b.n,type)-count(a.n,type));
    let selected=cells.find(c=>`${c.x},${c.y}`===ui.evidenceCell)||ranked[0];
    const insured=context(a,model,ui).services.filter(s=>(ui.exposureServices||[]).includes(s.id)),areas=[...new Set(insured.map(s=>s.region))];
    const n=neighborhood(ui);
    const records=root.CBExposureCatalog.filter(ui);let region=records.find(r=>r.id===ui.evidenceRegion)||records[0];
    const f=focuses[focus]||focuses.world;let center=project(f[1],f[2]),width=f[3];
    const inFocus=([x,y])=>focus==='world'||Math.abs(x-center[0])<width/2&&Math.abs(y-center[1])<width/4;
    const focusRanked=ranked.filter(c=>inFocus(project(c.x+.5,c.y+.5)));
    if(!ui.evidenceCell)selected=focusRanked[0]||selected;
    if(!ui.evidenceRegion)region=records.find(r=>root.CBExposureCatalog.located(r)&&inFocus(project(...r.representativeLonLat)))||region;
    if(ui.evidenceCenter==='selected'){if(layer==='exposure'&&areas.length&&root.CBWorldMap.points[areas[0]])center=root.CBWorldMap.points[areas[0]];else if(cells.some(c=>`${c.x},${c.y}`===ui.evidenceCell))center=project(selected.x+.5,selected.y+.5);else if(areas.length&&root.CBWorldMap.points[areas[0]])center=root.CBWorldMap.points[areas[0]];}
    if(focus==='world'&&ui.evidenceCenter!=='selected')center=[480,250];
    if(layer==='exposure'&&n.center){center=project(...n.center);width=Math.min(960,Math.max(220,(project(0,Math.max(-89,n.center[1]-n.span))[1]-project(0,Math.min(89,n.center[1]+n.span))[1])*2.25));}
    if(ui.evidenceViewportCenter)center=ui.evidenceViewportCenter;
    width=Math.max(12,Math.min(960,Number(ui.evidenceViewportWidth)||(width/Math.pow(1.6,Number(ui.evidenceZoom)||0))));const height=width*.50;
    const viewBox=`${center[0]-width/2} ${center[1]-height/2} ${width} ${height}`;
    const cellPath=c=>[[c.x,c.y],[c.x+1,c.y],[c.x+1,c.y+1],[c.x,c.y+1]].map(([x,y],i)=>`${i?'L':'M'}${project(x,y).map(v=>v.toFixed(3)).join(',')}`).join('')+'Z';
    const hasSelected=cells.some(c=>`${c.x},${c.y}`===ui.evidenceCell);
    const heat=noticeMode?root.CBExternal.noticePins(ui,project,width):cells.map(c=>{const id=`${c.x},${c.y}`,is=id===ui.evidenceCell;return `<g data-evidence-cell="${id}" role="button" aria-pressed="${is}" tabindex="${is||(!ui.evidenceCell&&c===selected)?0:-1}" aria-label="${esc(c.countries.join(', '))} · ${id} · ${num(count(c.n,type)/divisor)}"><title>${esc(c.countries.join(', '))} · ${id} · ${num(count(c.n,type)/divisor)}</title><path d="${cellPath(c)}" fill="${fill(count(c.n,type)/divisor)}" fill-opacity="${layer==='exposure'&&!is?'.58':'.95'}" stroke="${is?'#286b9b':'#ffffff'}" stroke-width="${is?'1.7':'.15'}" vector-effect="non-scaling-stroke"/></g>`;}).join('');
    const missingSelected=ui.evidenceCell&&!hasSelected?root.CBHazardHistory.aggregate(history.all).cells.find(c=>`${c.x},${c.y}`===ui.evidenceCell):null;
    const selectionOutline=!noticeMode&&missingSelected?`<g data-evidence-cell="${ui.evidenceCell}" role="button" tabindex="0" aria-pressed="true" aria-label="${esc(ui.evidenceCell)} · 0"><path d="${cellPath(missingSelected)}" fill="transparent" stroke="#286b9b" stroke-width="1.7" vector-effect="non-scaling-stroke"/></g>`:'';
    // Policy region markers: one per selected region, never one per public facility.
    const pins=areas.map(id=>{const point=root.CBWorldMap.points[id];if(!point)return '';const [x,y]=point,r=root.CBData.regions.find(r=>r.id===id),services=insured.filter(s=>s.region===id),scale=Math.min(1,width/550);return `<g class="insured-exposure-marker" data-insured-region="${esc(id)}" pointer-events="none"><title>${esc(r?.name||id)} · ${esc(services.map(s=>s.provider+' '+s.service).join(' / '))}</title><circle cx="${x}" cy="${y}" r="${24*scale}" fill="#659bc2" fill-opacity=".16" stroke="#4a86b1" stroke-width="1.4" vector-effect="non-scaling-stroke"/><circle cx="${x}" cy="${y}" r="${3*scale}" fill="#4a86b1"/><text x="${x+28*scale}" y="${y+3*scale}" font-size="${10*scale}" fill="#35698f" stroke="#f7f9fb" stroke-width="${3*scale}" paint-order="stroke" data-no-translate>${esc(r?.name||id)} · ${services.length}</text></g>`;}).join('');
    const exposureDetail=`<span class="evidence-badge">列明承保区域</span><h3>${insured.length} <span>项列明服务</span> · ${areas.length} <span>个区域</span></h3>${insured.length?`<div class="insured-exposure-list">${areas.map(id=>`<div><strong>${esc(root.CBData.regions.find(r=>r.id===id)?.name||id)}</strong>${insured.filter(s=>s.region===id).map(s=>`<span data-user-text>${esc(s.provider+' · '+s.service)}</span><small data-user-text>${esc(s.business)}</small>${root.CBExternal.dependency(s)}`).join('')}</div>`).join('')}</div><p class="evidence-note">标记表示列明承保区域，不是具体设施地址。</p>`:'<p class="exposure-empty">勾选下方列明服务，查看对应区域的风险暴露。</p>'}`;
    const detail=layer==='exposure'?neighborhoodDetail(n,ui)+(insured.length?`<details class="insured-selected-details"><summary>列明承保区域</summary>${exposureDetail}</details>`:''):noticeMode?root.CBExternal.noticeDetail(ui):root.CBHazardHistory.detail(ui,history,type);
    return `<div class="m2-explorer evidence-explorer risk-explorer"><div class="map-toolbar"><div class="segmented" aria-label="风险模块"><button data-map="m1">M1 普通中断</button><button class="active" data-map="m2">M2 外部事件中断</button></div><span class="m2-model-label">${noticeMode?'OFAC · GitHub · Amazon':'UCDP GED 26.1 · 2016–2025'}</span></div>
      <div class="m2-layer-tabs" role="tablist" aria-label="M2风险图层">${layers.map(([id,n,title,sub])=>`<button role="tab" aria-selected="${layer===id}" aria-controls="m2-layer-panel" id="m2-tab-${id}" tabindex="${layer===id?0:-1}" class="${layer===id?'active':''}" data-m2-layer="${id}"><span>${n}</span><div><strong>${title}</strong><small>${sub}</small></div></button>`).join('')}</div>
      <div id="m2-layer-panel" role="tabpanel" aria-labelledby="m2-tab-${layer}">${layer==='recovery'?recovery(a,model,ui):`
        <div class="m2-controls evidence-controls">${noticeMode?'':select('观察窗口','evidenceWindow',history.mode,[['5','近五年基准（2021–2025）'],['10','近十年对照（2016–2025）'],['single','单年查询']])}${!noticeMode&&history.annual?select('统计年度','evidenceYear',year,[...history.all].reverse().map(y=>[y,String(y)])):''}${noticeMode?'':select('事件类型','evidenceType',type,types.map((s,i)=>[i,s]))}${select('地图范围','evidenceFocus',focus,Object.entries(focuses).map(([k,v])=>[k,v[0]]))}</div>
        
        ${layer==='exposure'?`<div class="exposure-browse-controls">${n.center?select('周边检索范围','exposureSpan',n.span,[[15,'经纬度各 ±15°'],[25,'经纬度各 ±25°'],[40,'经纬度各 ±40°']]):''}<span>${n.center?'周边设施':'可定位目录'}</span><strong>${n.rows.length}</strong>${n.center?'<button class="text-btn" data-exposure-overview>返回全球总览</button>':''}</div><div class="exposure-selection-bar"><span>已勾选服务</span><strong>${insured.length}</strong><span>承保区域</span><strong>${areas.length}</strong><a href="#insured-service-list" data-exposure-scroll>选择列明服务 ↓</a></div>`:noticeMode?'':`<div class="evidence-summary"><div><span>${history.annual?'所选年度 · 全球事件':'全球年均事件'}</span><strong>${num(count(data.total,type)/divisor)}</strong></div><div><span>${history.annual?'纳入精细热图':'年均纳入热图'}</span><strong>${num(count(data.included,type)/divisor)}</strong></div><div><span>${history.annual?'位置精度不足 · 未入图':'年均未入图 · 位置精度不足'}</span><strong>${num(count(data.excluded,type)/divisor)}</strong></div></div>`}
        <div class="m2-map-layout"><div class="evidence-map-column"><div class="evidence-map-actions"><span><span>${noticeMode?'公开公告 · 国家示意位置':history.period+' · 1° × 1° · '+(history.annual?'网格事件数':'年均事件数')}</span> <small class="map-drag-hint">· 拖动 / 双指缩放</small></span><div>${ui.mapHistory?.length?'<button data-map-back>返回上一级</button>':''}<button data-evidence-zoom="-1" aria-label="缩小地图">−</button><button data-evidence-zoom="1" aria-label="放大地图">＋</button><button data-evidence-center="selected" ${!ui.evidenceCell&&!areas.length&&!n.center?'disabled':''}>定位所选</button><button data-evidence-center="reset">重置</button></div></div>
          <svg class="evidence-world" viewBox="${viewBox}" role="group" aria-label="历史冲突事件与公开云区域地图"><defs><clipPath id="evidence-world-clip"><path d="${root.CBWorldMap.sphere}"/></clipPath></defs><g clip-path="url(#evidence-world-clip)">${baseMap()}${heat}${selectionOutline}${layer==='exposure'?neighborhoodPins(n,ui,width):''}${pins}</g></svg>
          ${layer==='exposure'?facilityLegend():''}<div class="evidence-legend">${noticeMode?'':(history.annual?[[1,'1–4'],[5,'5–19'],[20,'20–99'],[100,'100–499'],[500,'500+']]:[[1,'>0–<5'],[5,'5–<20'],[20,'20–<100'],[100,'100–<500'],[500,'≥500']]).map(([v,s])=>`<span><i style="background:${fill(v)}"></i>${s}</span>`).join('')}<span>${noticeMode?'公开公告 ≠ 客户实际中断':'历史事件数 ≠ 中断概率'}</span></div>

        </div><aside class="m2-layer-detail evidence-detail">${detail}</aside></div>`}</div>

      <details class="evidence-provenance" open><summary>数据来源、位置精度与模型连接</summary>${noticeMode?root.CBExternal.directory(ui):root.CBEventDirectory.shell(history.years,type,ui.evidenceCell)}<details class="event-method" data-exposure-catalog ${ui.exposureCatalogOpen?'open':''}><summary>公开设施资料</summary>${root.CBExposureCatalog.controls(ui,records,region)}${root.CBExposureCatalog.summary(records)}${root.CBExposureCatalog.detail(region)}${root.CBExposureCatalog.coverage()}</details><details class="event-method"><summary>来源与方法</summary>${sourcePanel()}<div class="evidence-chain"><span>地缘政治冲突</span><b>→</b><span>数字依赖受损</span><b>→</b><span>列明服务中断</span><b>→</b><span>业务损失与赔款</span></div><p>已取得冲突观测与公开区域资料；中间因果链、恢复分布与承保条件仍需验证。定价参数暂保留情景假设，热图筛选不改变报价。</p></details></details>
      <div class="evidence-pricing-link"><span>风险证据 → 年度赔款分布 → 四层定价</span><button class="text-btn" data-uwtab="pricing">查看定价明细 →</button></div>
    </div>`;
  }
  // Keep active pointer gestures on one SVG; regroup facilities only after zoom ends.
  let releaseGesture=null;
  function bindPan(svg,ui,onCommit){
    releaseGesture?.();if(!svg)return;
    const controller=new AbortController(),signal=controller.signal,points=new Map();
    let base=null,dirty=false,wheelTimer=null,nativeGesture=null;
    const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal});
    const box=()=>{const b=svg.viewBox.baseVal;return {x:b.x,y:b.y,w:b.width,h:b.height};};
    const middle=()=>{const p=[...points.values()];return p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:{...p[0],d:0};};
    const transform=(p,m)=>new DOMPoint(p.x,p.y).matrixTransform(m);
    const suppress=()=>{ui.mapSuppressClickUntil=Date.now()+500;};
    function snapshot(){const matrix=svg.getScreenCTM();if(!matrix||!points.size){base=null;return;}const mid=middle();base={box:box(),inverse:matrix.inverse(),mid};base.anchor=transform(mid,base.inverse);}
    function write(x,y,w){w=Math.max(12,Math.min(960,w));const h=w/2,cx=Math.max(0,Math.min(960,x+w/2)),cy=Math.max(12,Math.min(468,y+h/2));
      ui.evidenceViewportCenter=[cx,cy];ui.evidenceViewportWidth=w;ui.evidenceZoom=0;
      svg.setAttribute('viewBox',`${cx-w/2} ${cy-h/2} ${w} ${h}`);dirty=true;
    }
    function anchoredZoom(b,anchor,position,width){const w=Math.max(12,Math.min(960,width)),u=(position.x-b.x)/b.w,v=(position.y-b.y)/b.h;write(anchor.x-u*w,anchor.y-v*w/2,w);}
    function commit(){clearTimeout(wheelTimer);wheelTimer=null;if(points.size||nativeGesture||!dirty)return;dirty=false;svg.classList.remove('is-dragging');if(ui.m2Layer==='exposure'){const b=box();if(b.w>=750){ui.exposureCenter=null;ui.exposureGroup=null;}else{const location=unproject(b.x+b.w/2,b.y+b.h/2);if(location)ui.exposureCenter=location;}}onCommit?.();}
    listen(svg,'click',e=>{if(e.detail!==0&&Date.now()<(ui.mapSuppressClickUntil||0)){e.preventDefault();e.stopPropagation();}}, {capture:true});
    listen(svg,'pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      clearTimeout(wheelTimer);wheelTimer=null;if(!points.size)ui.mapSuppressClickUntil=0;
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});snapshot();
      if(points.size>1){e.preventDefault();suppress();for(const id of points.keys())try{svg.setPointerCapture(id);}catch{}}
    });
    listen(window,'pointermove',e=>{
      if(!points.has(e.pointerId)||!base)return;
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});const mid=middle();
      if(points.size===1&&Math.hypot(mid.x-base.mid.x,mid.y-base.mid.y)<5&&!svg.classList.contains('is-dragging'))return;
      e.preventDefault();suppress();svg.classList.add('is-dragging');for(const id of points.keys())try{svg.setPointerCapture(id);}catch{}
      const at=transform(mid,base.inverse);
      if(points.size>1&&base.mid.d>0)anchoredZoom(base.box,base.anchor,at,base.box.w*base.mid.d/Math.max(1,mid.d));
      else write(base.box.x-(at.x-base.anchor.x),base.box.y-(at.y-base.anchor.y),base.box.w);
    },{passive:false});
    function finish(e){if(!points.has(e.pointerId))return;points.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(points.size)snapshot();else{base=null;svg.classList.remove('is-dragging');commit();}}
    listen(window,'pointerup',finish);listen(window,'pointercancel',finish);listen(svg,'lostpointercapture',e=>{if(e.target===svg)finish(e);});
    listen(window,'blur',()=>{points.clear();base=null;nativeGesture=null;suppress();commit();});
    listen(svg,'wheel',e=>{
      e.preventDefault();if(points.size||nativeGesture)return;
      const matrix=svg.getScreenCTM();if(!matrix)return;const b=box(),anchor=transform({x:e.clientX,y:e.clientY},matrix.inverse());
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);
      anchoredZoom(b,anchor,anchor,b.w*Math.exp(Math.max(-250,Math.min(250,delta))*(e.ctrlKey ? .008 : .002)));
      suppress();clearTimeout(wheelTimer);wheelTimer=setTimeout(commit,160);
    },{passive:false});
    // Safari trackpad pinch uses GestureEvents instead of ctrl+wheel.
    listen(svg,'gesturestart',e=>{e.preventDefault();if(points.size)return;clearTimeout(wheelTimer);const matrix=svg.getScreenCTM();if(!matrix)return;const r=svg.getBoundingClientRect(),x=Number.isFinite(e.clientX)?e.clientX:r.x+r.width/2,y=Number.isFinite(e.clientY)?e.clientY:r.y+r.height/2;nativeGesture={box:box(),anchor:transform({x,y},matrix.inverse())};suppress();},{passive:false});
    listen(svg,'gesturechange',e=>{e.preventDefault();if(nativeGesture){const g=nativeGesture;anchoredZoom(g.box,g.anchor,g.anchor,g.box.w/Math.max(.05,Number(e.scale)||1));}},{passive:false});
    listen(svg,'gestureend',e=>{e.preventDefault();nativeGesture=null;suppress();commit();},{passive:false});
    releaseGesture=()=>{controller.abort();clearTimeout(wheelTimer);for(const id of points.keys())if(svg.hasPointerCapture(id))svg.releasePointerCapture(id);points.clear();svg.classList.remove('is-dragging');releaseGesture=null;};
  }
  root.CBM2Map={baseMap,render,context,project,unproject,nearby,neighborhood,sourcePanel,bindPan,comparison:()=>sourcePanel()};
})(window);

;
/* Conflict-only M2: shared-clock recomputation; 200,000 years per scenario; USD. */
window.CBUnifiedData={"modelVersion":"CB-CONFLICT-3.0","currency":"USD","status":"scenario_reference","typicalPolicyId":"CBU-001","assumptions":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"},"reinsurance":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all"},"portfolioSummary":{"policies":100,"hourly_total":100000.0,"annual_limit_total":4000000.0,"expected_claims":177946.02074309997,"EL_M1":150148.799363,"EL_M2":27797.221380099996,"gross_TVaR":640773.16707,"gross_VaR":553933.0800000001,"gross_K":462827.1463269,"average_paid_events":0.58266215,"gross_mean_MC_SE":261.2827911016663,"loss_guardrail_reduction_before_event_annual_caps":15994.707225274162,"parameter_before_guardrail_event_annual_caps":194689.4109830833,"simulated_catalog_rate":12.599999999999998,"event_types":42},"pricing":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":177946.02074309997,"expected_recovery":43892.578657599995,"reinsurance_premium":61449.61012063999,"RC":17557.031463039995,"mean_net":134053.4420855,"net_TVaR":347052.66095499997,"net_VaR":314502.28,"K":212999.21886949998,"cK":17039.937509559997,"F":14059.328085937497,"G":302136.4237355166,"average_premium":3021.364237355166,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.58878,"tail_reduction":0.45838452858141154},"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2660.909089349627,"EL_M1":2291.2292121499995,"EL_M2":369.6798772000001,"expected_recovery":885.3424911058273,"RC":354.13699644233094,"K":3276.6384102524744,"cK":262.13107282019797,"F":148.7051413125,"G":4567.843066566208,"paid_event_frequency":0.804525},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1034.279265200071,"EL_M1":850.0043902,"EL_M2":184.274875,"expected_recovery":408.4649654489009,"RC":163.38598617956038,"K":1263.2347027449996,"cK":101.05877621959996,"F":140.6928350625,"G":1919.222483548975,"paid_event_frequency":0.585385},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1235.296949750002,"EL_M1":937.1348197499999,"EL_M2":298.16213,"expected_recovery":720.4558594067714,"RC":288.18234376270857,"K":1233.9364669955364,"cK":98.71491735964291,"F":127.04003193749999,"G":2332.3123237464715,"paid_event_frequency":0.211975},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2069.891780150038,"EL_M1":1701.2050301500005,"EL_M2":368.68675,"expected_recovery":817.1435086824952,"RC":326.8574034729981,"K":2519.0021673556284,"cK":201.52017338845027,"F":140.6928350625,"G":3651.949589431981,"paid_event_frequency":0.585385},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.9545775995537,"EL_M1":1145.70689015,"EL_M2":185.24768744999997,"expected_recovery":441.94086095499415,"RC":176.77634438199766,"K":1646.0047349256204,"cK":131.68037879404963,"F":148.705324125,"G":2384.155499867468,"paid_event_frequency":0.80453},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":660.7537123499994,"EL_M1":484.18598374999993,"EL_M2":176.56772859999995,"expected_recovery":290.3455614222306,"RC":116.13822456889226,"K":797.3475535854808,"cK":63.787804286838465,"F":128.429955375,"G":1292.14626210764,"paid_event_frequency":0.24999},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1721.304578900015,"EL_M1":1489.5895789,"EL_M2":231.715,"expected_recovery":402.3985286851014,"RC":160.95941147404056,"K":2113.9727078350925,"cK":169.1178166268074,"F":148.7230569375,"G":2933.473151917817,"paid_event_frequency":0.805015},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":860.6122949499834,"EL_M1":745.2374199499999,"EL_M2":115.374875,"expected_recovery":193.57665127343375,"RC":77.43066050937351,"K":1063.3450443789854,"cK":85.06760355031884,"F":148.723605375,"G":1562.4455525129008,"paid_event_frequency":0.80503},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1509.0555425000134,"EL_M1":1240.9396806999998,"EL_M2":268.1158618,"expected_recovery":672.5950560119517,"RC":269.0380224047807,"K":1777.424613801626,"cK":142.19396910413008,"F":130.2568006875,"G":2734.059112928566,"paid_event_frequency":0.299955},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1844.1299757000065,"EL_M1":1509.0085382000002,"EL_M2":335.1214375,"expected_recovery":708.297805990763,"RC":283.3191223963052,"K":2275.756108352395,"cK":182.06048866819162,"F":140.697771,"G":3266.943143686005,"paid_event_frequency":0.58552},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.4550659495462,"EL_M1":1145.6151275500004,"EL_M2":184.83993839999997,"expected_recovery":442.67124554454676,"RC":177.06849821781873,"K":1638.3195153765582,"cK":131.06556123012467,"F":148.7051413125,"G":2383.059022279986,"paid_event_frequency":0.804525},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3102.8380084000073,"EL_M1":2550.0133834000003,"EL_M2":552.824625,"expected_recovery":1225.3948957737741,"RC":490.1579583095097,"K":3789.7042086544643,"cK":303.17633669235715,"F":140.6928350625,"G":5382.486851285832,"paid_event_frequency":0.585385},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":818.7391668,"EL_M1":619.9644132,"EL_M2":198.77475360000003,"expected_recovery":418.72692505477715,"RC":167.49077002191086,"K":958.0051723222941,"cK":76.64041378578354,"F":126.964530375,"G":1586.4465079769261,"paid_event_frequency":0.20991},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1031.8977036000674,"EL_M1":847.4527348499997,"EL_M2":184.44496875,"expected_recovery":358.12201627605054,"RC":143.24880651042022,"K":1359.4857377961648,"cK":108.75885902369319,"F":140.70416943749998,"G":1899.4793847622414,"paid_event_frequency":0.585695},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3984.7725294500087,"EL_M1":3428.9750888000017,"EL_M2":555.79744065,"expected_recovery":1158.7715154951402,"RC":463.5086061980561,"K":5066.603980927389,"cK":405.3283184741911,"F":148.607336625,"G":6669.622387663009,"paid_event_frequency":0.80185},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":436.99966089999646,"EL_M1":317.44903545000005,"EL_M2":119.55062545,"expected_recovery":173.483674899152,"RC":69.3934699596608,"K":514.587263064983,"cK":41.16698104519864,"F":128.3058256875,"G":901.1545834564746,"paid_event_frequency":0.246595},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":851.846372599994,"EL_M1":737.9903257000001,"EL_M2":113.8560469,"expected_recovery":178.96320359796493,"RC":71.58528143918598,"K":1001.5401898070663,"cK":80.12321518456531,"F":148.6268975625,"G":1536.242355714994,"paid_event_frequency":0.802385},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2562.029385400037,"EL_M1":2215.1393854000003,"EL_M2":346.89,"expected_recovery":524.1065863855611,"RC":209.64263455422443,"K":3078.0763645031752,"cK":246.24610916025404,"F":148.6250694375,"G":4222.057598069354,"paid_event_frequency":0.802335},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1001.2897773500345,"EL_M1":823.2525238499998,"EL_M2":178.0372535,"expected_recovery":392.0729536306508,"RC":156.82918145226031,"K":1256.853530021667,"cK":100.54828240173336,"F":130.082580375,"G":1851.6664287720375,"paid_event_frequency":0.29519},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":920.6728827000386,"EL_M1":753.9194608500001,"EL_M2":166.75342185,"expected_recovery":312.59168891977004,"RC":125.03667556790802,"K":1215.5000230321498,"cK":97.24000184257198,"F":140.7080085,"G":1711.5434248140248,"paid_event_frequency":0.5858},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3981.709544400012,"EL_M1":3427.10241,"EL_M2":554.6071344,"expected_recovery":1162.5763943140473,"RC":465.03055772561896,"K":5093.773368733502,"cK":407.5018694986802,"F":148.6067881875,"G":6670.465013082415,"paid_event_frequency":0.801835},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2054.9333222500304,"EL_M1":1684.2291243500001,"EL_M2":370.7041979,"expected_recovery":607.3290413217862,"RC":242.9316165287145,"K":2211.662210124622,"cK":176.93297680996977,"F":140.67729599999998,"G":3487.300282118286,"paid_event_frequency":0.58496},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":404.32405019999453,"EL_M1":306.04751195000006,"EL_M2":98.27653825000002,"expected_recovery":162.12140224277573,"RC":64.84856089711029,"K":481.8142157941286,"cK":38.545137263530286,"F":127.0367413125,"G":846.3393195641802,"paid_event_frequency":0.211885},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":3080.6257571000065,"EL_M1":2526.742679,"EL_M2":553.8830781,"expected_recovery":909.6029693603059,"RC":363.8411877441224,"K":3308.6645181035387,"cK":264.6931614482831,"F":140.6771131875,"G":5133.116292639883,"paid_event_frequency":0.584955},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2640.3235664996414,"EL_M1":2271.11199355,"EL_M2":369.21157295,"expected_recovery":582.4900957627697,"RC":232.99603830510787,"K":2818.0189554856365,"cK":225.44151643885093,"F":148.545180375,"G":4329.741735491468,"paid_event_frequency":0.80015},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":221.1363683500033,"EL_M1":159.35573749999998,"EL_M2":61.780630850000016,"expected_recovery":75.90229916985234,"RC":30.360919667940937,"K":215.31401424524492,"cK":17.225121139619596,"F":128.4381819375,"G":529.5474547934185,"paid_event_frequency":0.250215},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":2548.6659360500325,"EL_M1":2202.0253110500003,"EL_M2":346.640625,"expected_recovery":406.9028223107034,"RC":162.76112892428137,"K":2485.1387664344356,"cK":198.81110131475486,"F":148.56108506249998,"G":4078.399001802092,"paid_event_frequency":0.800585},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":1708.64604135002,"EL_M1":1477.0240841999996,"EL_M2":231.62195715,"expected_recovery":219.11224530411187,"RC":87.64489812164476,"K":799.0245393463194,"cK":63.921963147705554,"F":148.6916131875,"G":2678.5393544091603,"paid_event_frequency":0.804155},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":498.5836918000156,"EL_M1":410.44767699999994,"EL_M2":88.1360148,"expected_recovery":85.18490741812843,"RC":34.073962967251376,"K":444.0382251840424,"cK":35.5230580147234,"F":130.14546787499998,"G":931.1015742093205,"paid_event_frequency":0.29691},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":2763.482211800007,"EL_M1":2256.9566354999997,"EL_M2":506.52557629999995,"expected_recovery":499.26751614427394,"RC":199.70700645770958,"K":2260.52535341067,"cK":180.8420282728536,"F":140.757367875,"G":4379.7181525407605,"paid_event_frequency":0.58715},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3109.082651300003,"EL_M1":2735.6321579999994,"EL_M2":373.45049330000006,"expected_recovery":694.1161724003459,"RC":277.6464689601384,"K":3757.0633886701626,"cK":300.565071093613,"F":156.6147069375,"G":5125.21186438834,"paid_event_frequency":1.020855},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1258.4780122005234,"EL_M1":1071.6447099999996,"EL_M2":186.8333022,"expected_recovery":326.77035652955567,"RC":130.70814261182227,"K":1515.3863665051986,"cK":121.23090932041589,"F":148.6108100625,"G":2212.037165593682,"paid_event_frequency":0.801945},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1396.1202371000131,"EL_M1":1093.7565652,"EL_M2":302.36367190000004,"expected_recovery":579.5753685441166,"RC":231.83014741764666,"K":1652.1562744494588,"cK":132.1725019559567,"F":129.43560693749998,"G":2519.4113245481553,"paid_event_frequency":0.277495},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2517.2503546004195,"EL_M1":2144.7400630499997,"EL_M2":372.51029155000003,"expected_recovery":653.6567091557972,"RC":261.4626836623189,"K":2999.8943049706127,"cK":239.99154439764902,"F":148.6108100625,"G":4223.087190297183,"paid_event_frequency":0.801945},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1554.6280154000162,"EL_M1":1367.7891739000004,"EL_M2":186.83884150000003,"expected_recovery":345.96289518386016,"RC":138.38515807354406,"K":1877.824622563532,"cK":150.22596980508257,"F":156.61342725,"G":2666.4700940381904,"paid_event_frequency":1.02082},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":779.4206764499992,"EL_M1":594.5573049000001,"EL_M2":184.86337154999998,"expected_recovery":262.38951518521446,"RC":104.95580607408579,"K":898.2832024174782,"cK":71.86265619339825,"F":130.7145631875,"G":1449.2716025399777,"paid_event_frequency":0.312475},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.6143655499873,"EL_M1":1809.3256155499998,"EL_M2":235.28875,"expected_recovery":342.29811475959013,"RC":136.91924590383607,"K":2357.9248752648923,"cK":188.63399002119138,"F":156.63902099999999,"G":3369.075496633353,"paid_event_frequency":1.02152},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.682521600002,"EL_M1":1810.3962715999996,"EL_M2":234.28625,"expected_recovery":342.2551563595798,"RC":136.90206254383193,"K":2335.023913971004,"cK":186.8019131176803,"F":156.6355475625,"G":3366.6960597653524,"paid_event_frequency":1.021425},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":1104.7753762999903,"EL_M1":923.3741927,"EL_M2":181.4011836,"expected_recovery":361.35444124947594,"RC":144.5417764997904,"K":1277.3747078457445,"cK":102.18997662765956,"F":132.50301787499998,"G":1978.6801964032536,"paid_event_frequency":0.36139},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":1129.8778893003764,"EL_M1":961.33309995,"EL_M2":168.54478935000003,"expected_recovery":292.92835083343004,"RC":117.17134033337203,"K":1260.8439885927914,"cK":100.86751908742332,"F":148.60477724999998,"G":1995.362034628229,"paid_event_frequency":0.80178},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":4642.625122750098,"EL_M1":4082.2912352999997,"EL_M2":560.33388745,"expected_recovery":1057.908861590393,"RC":423.1635446361572,"K":5113.227642725384,"cK":409.0582114180307,"F":156.5101381875,"G":7508.476022655715,"paid_event_frequency":1.017995},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":2506.297847600418,"EL_M1":2132.5206672500003,"EL_M2":373.77718035000004,"expected_recovery":673.1850905656265,"RC":269.27403622625064,"K":2791.792637846206,"cK":223.3434110276965,"F":148.598561625,"G":4196.685141972487,"paid_event_frequency":0.80161},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":460.0050705499734,"EL_M1":359.18717995000003,"EL_M2":100.8178906,"expected_recovery":191.52940710016134,"RC":76.61176284006454,"K":527.1285367827336,"cK":42.17028294261869,"F":129.3891725625,"G":944.2350518602088,"paid_event_frequency":0.276225},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":3758.2775741500964,"EL_M1":3199.2944562000002,"EL_M2":558.9831179500001,"expected_recovery":1009.5694396137442,"RC":403.8277758454977,"K":4163.384371755201,"cK":333.0707497404161,"F":148.5976475625,"G":6191.698329731348,"paid_event_frequency":0.801585},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":3094.207483600016,"EL_M1":2720.5662773499994,"EL_M2":373.64120625,"expected_recovery":369.8259388037841,"RC":147.93037552151364,"K":2761.238037944627,"cK":220.89904303557017,"F":156.49935225,"G":4826.048339209467,"paid_event_frequency":1.0177},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":259.69517729999876,"EL_M1":197.47533139999996,"EL_M2":62.219845899999996,"expected_recovery":61.14598876134539,"RC":24.45839550453816,"K":270.4379253148955,"cK":21.63503402519164,"F":130.6619131875,"G":581.934026689638,"paid_event_frequency":0.311035},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":3058.0457658000505,"EL_M1":2701.03718765,"EL_M2":357.00857814999995,"expected_recovery":347.34656084236076,"RC":138.93862433694432,"K":2830.0868250403178,"cK":226.4069460032254,"F":156.52421475,"G":4773.220734520294,"paid_event_frequency":1.01838},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":2038.5268750500027,"EL_M1":1801.0554614500002,"EL_M2":237.4714136,"expected_recovery":228.6697712626526,"RC":91.46790850506105,"K":1833.5691355674733,"cK":146.68553084539786,"F":156.52256943749998,"G":3244.2705117839487,"paid_event_frequency":1.018335},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1101.1981994499859,"EL_M1":917.5240584000001,"EL_M2":183.67414105,"expected_recovery":153.27334316616634,"RC":61.30933726646654,"K":1025.6055244267995,"cK":82.04844195414397,"F":132.5042975625,"G":1836.0803683107952,"paid_event_frequency":0.361425},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":2261.5489926002397,"EL_M1":1921.7062092499998,"EL_M2":339.84278335,"expected_recovery":259.30460969989554,"RC":103.72184387995821,"K":1702.0372785860895,"cK":136.16298228688717,"F":148.6353069375,"G":3533.425500939447,"paid_event_frequency":0.802615},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3292.5677857503574,"EL_M1":2915.58712305,"EL_M2":376.98066270000004,"expected_recovery":928.4071609589068,"RC":371.36286438356274,"K":4449.495203224099,"cK":355.9596162579279,"F":149.8574085,"G":5559.663566522464,"paid_event_frequency":0.83604},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1353.8458876001064,"EL_M1":1163.4777773500002,"EL_M2":190.36811024999997,"expected_recovery":444.7411302853483,"RC":177.89645211413932,"K":1879.695510909693,"cK":150.37564087277545,"F":141.896655375,"G":2432.019514616028,"paid_event_frequency":0.61831},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1619.3964679000094,"EL_M1":1322.3371311499998,"EL_M2":297.05933674999994,"expected_recovery":729.9024181325279,"RC":291.9609672530112,"K":2115.2228641330184,"cK":169.2178291306415,"F":128.06688975,"G":2944.8562053782157,"paid_event_frequency":0.24006},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":2709.2643915000867,"EL_M1":2327.99320405,"EL_M2":381.27118744999996,"expected_recovery":891.1498590017022,"RC":356.4599436006809,"K":3741.459744222396,"cK":299.31677953779166,"F":141.89574131249998,"G":4675.915807934746,"paid_event_frequency":0.618285},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1645.912286599879,"EL_M1":1457.63095445,"EL_M2":188.28133214999997,"expected_recovery":462.76365492515106,"RC":185.10546197006045,"K":2243.2874811602032,"cK":179.46299849281627,"F":149.857042875,"G":2880.4503865836746,"paid_event_frequency":0.83603},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":755.8277319499989,"EL_M1":572.92072985,"EL_M2":182.9070021,"expected_recovery":315.40004588187975,"RC":126.1600183527519,"K":888.6110436552262,"cK":71.0888834924181,"F":128.94055068749998,"G":1442.689579310225,"paid_event_frequency":0.263955},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1890.7086107999867,"EL_M1":1651.2085170499995,"EL_M2":239.50009375,"expected_recovery":434.3073687058195,"RC":173.7229474823278,"K":2323.6105481325612,"cK":185.8888438506049,"F":149.8981756875,"G":3200.291437093893,"paid_event_frequency":0.837155},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1891.3325052999792,"EL_M1":1653.0666394499997,"EL_M2":238.26586585,"expected_recovery":434.3134550010368,"RC":173.72538200041473,"K":2353.2197895014797,"cK":188.25758316011837,"F":149.90786475,"G":3204.297780280683,"paid_event_frequency":0.83742},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1220.5754225000424,"EL_M1":1042.7354834999999,"EL_M2":177.83993900000002,"expected_recovery":467.2880818095849,"RC":186.91523272383398,"K":1491.2778236283748,"cK":119.30222589026998,"F":131.050755375,"G":2210.4581819855284,"paid_event_frequency":0.32167},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1192.4844998000724,"EL_M1":1020.8851873000001,"EL_M2":171.5993125,"expected_recovery":424.56451040076263,"RC":169.82580416030507,"K":1478.255786525265,"cK":118.2604629220212,"F":141.96886631249998,"G":2163.386177593198,"paid_event_frequency":0.620285},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4961.046708650011,"EL_M1":4395.550227350001,"EL_M2":565.4964812999999,"expected_recovery":1525.9740934766523,"RC":610.3896373906609,"K":5979.40838512348,"cK":478.3526708098784,"F":149.8221256875,"G":8266.148190050735,"paid_event_frequency":0.835075},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2724.8900143500787,"EL_M1":2344.2939727000003,"EL_M2":380.59604165,"expected_recovery":987.3499024893924,"RC":394.939960995757,"K":3397.850766601404,"cK":271.8280613281123,"F":141.9604569375,"G":4711.491324815264,"paid_event_frequency":0.620055},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":541.9661939999947,"EL_M1":442.8866853499999,"EL_M2":99.07950865000001,"expected_recovery":256.00318758258993,"RC":102.40127503303597,"K":688.4355358501953,"cK":55.07484286801562,"F":128.0491569375,"G":1103.3219584513952,"paid_event_frequency":0.239575},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4088.0273970500098,"EL_M1":3516.2889127500002,"EL_M2":571.7384843,"expected_recovery":1482.7236879485708,"RC":593.0894751794284,"K":5081.287837125141,"cK":406.50302697001126,"F":141.96027412499998,"G":6972.7735644325985,"paid_event_frequency":0.62005},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":3291.507885150351,"EL_M1":2914.8260476,"EL_M2":376.68183755,"expected_recovery":413.06238148163357,"RC":165.22495259265344,"K":3430.2898948354045,"cK":274.4231915868324,"F":149.8148131875,"G":5174.627790023115,"paid_event_frequency":0.834875},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":252.19135500000425,"EL_M1":190.22419380000002,"EL_M2":61.9671612,"expected_recovery":69.48877246416404,"RC":27.79550898566562,"K":308.1778908198197,"cK":24.654231265585576,"F":128.911117875,"G":578.0696175016739,"paid_event_frequency":0.26315},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":2819.433195650034,"EL_M1":2461.33069565,"EL_M2":358.1025,"expected_recovery":408.4086781692895,"RC":163.3634712677158,"K":2964.341948415398,"cK":237.14735587323185,"F":149.8524725625,"G":4493.061993804643,"paid_event_frequency":0.835905},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1885.67560719999,"EL_M1":1642.2241072,"EL_M2":243.4515,"expected_recovery":273.1303445046608,"RC":109.25213780186432,"K":2025.6564769703036,"cK":162.0525181576243,"F":149.8597850625,"G":3075.7867309626386,"paid_event_frequency":0.836105},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":1208.3437598000505,"EL_M1":1028.4762216500003,"EL_M2":179.86753815,"expected_recovery":149.67928787778305,"RC":59.87171515111322,"K":1190.590148826631,"cK":95.24721190613049,"F":130.98110381249998,"G":1992.591720893059,"paid_event_frequency":0.319765},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":2353.874481600054,"EL_M1":2005.0619815999996,"EL_M2":348.8125,"expected_recovery":264.4862318198866,"RC":105.79449272795465,"K":2280.756515481968,"cK":182.46052123855745,"F":141.84948975,"G":3711.9719804220877,"paid_event_frequency":0.61702},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2386.6900491000615,"EL_M1":2011.7541854000003,"EL_M2":374.9358637,"expected_recovery":664.0693844340478,"RC":265.62775377361913,"K":3494.000317828274,"cK":279.52002542626195,"F":140.66833818749998,"G":4096.674888649924,"paid_event_frequency":0.584715},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1030.2383522000669,"EL_M1":840.60524115,"EL_M2":189.63311105,"expected_recovery":248.966742656129,"RC":99.5866970624516,"K":1605.7371403980037,"cK":128.4589712318403,"F":140.6811350625,"G":1865.2868740758115,"paid_event_frequency":0.585065},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":1223.3914467500074,"EL_M1":926.52147225,"EL_M2":296.8699745,"expected_recovery":550.3997778486207,"RC":220.1599111394483,"K":1687.8505382201438,"cK":135.0280430576115,"F":127.02321318749999,"G":2274.1368188460897,"paid_event_frequency":0.211515},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2061.3081456500345,"EL_M1":1681.8622536500002,"EL_M2":379.445892,"expected_recovery":498.85134560344,"RC":199.540538241376,"K":3238.381071866228,"cK":259.07048574929826,"F":140.6815006875,"G":3547.4675604376116,"paid_event_frequency":0.585075},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1194.7186452500866,"EL_M1":1006.98072445,"EL_M2":187.7379208,"expected_recovery":331.30578349892824,"RC":132.5223133995713,"K":1755.5169380919624,"cK":140.441355047357,"F":140.668521,"G":2144.46777959602,"paid_event_frequency":0.58472},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":614.7882923499973,"EL_M1":423.1454303999999,"EL_M2":191.64286195,"expected_recovery":197.86259169546565,"RC":79.14503667818627,"K":1027.0281443965646,"cK":82.16225155172516,"F":126.1117100625,"G":1202.9430541898785,"paid_event_frequency":0.186585},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1348.4854954999796,"EL_M1":1111.6902205499998,"EL_M2":236.79527495000002,"expected_recovery":296.27630736757214,"RC":118.51052294702886,"K":1858.851646396053,"cK":148.70813171168425,"F":140.64256162499998,"G":2341.79561571159,"paid_event_frequency":0.58401},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":677.0039081000031,"EL_M1":556.3557830999999,"EL_M2":120.648125,"expected_recovery":109.87675991521121,"RC":43.95070396608449,"K":1063.0817395837648,"cK":85.0465391667012,"F":140.6537131875,"G":1262.2064858937183,"paid_event_frequency":0.584315},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":1303.1599777000013,"EL_M1":1035.1343748000002,"EL_M2":268.02560289999997,"expected_recovery":451.2847725776651,"RC":180.51390903106605,"K":2020.2181045813916,"cK":161.61744836651133,"F":127.535636625,"G":2363.769295630105,"paid_event_frequency":0.22553},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1854.3394099000034,"EL_M1":1505.5410349,"EL_M2":348.798375,"expected_recovery":363.2582797419343,"RC":145.30331189677372,"K":2962.2238566357337,"cK":236.9779085308587,"F":140.6427444375,"G":3169.6844996868476,"paid_event_frequency":0.584015},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2395.651995150081,"EL_M1":2020.4918916000004,"EL_M2":375.16010355000003,"expected_recovery":553.6560889168907,"RC":221.46243556675628,"K":3420.4298498616936,"cK":273.6343879889355,"F":140.6262913125,"G":4041.8334800243633,"paid_event_frequency":0.583565},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":2067.086607600039,"EL_M1":1692.5490846499997,"EL_M2":374.53752295000004,"expected_recovery":419.819929849539,"RC":167.92797193981562,"K":2562.8314752905117,"cK":205.02651802324093,"F":140.6924694375,"G":3440.9780893341267,"paid_event_frequency":0.585375},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":411.412147249993,"EL_M1":310.36181525,"EL_M2":101.050332,"expected_recovery":88.9731450834609,"RC":35.58925803338436,"K":686.7542579862152,"cK":54.94034063889722,"F":127.06672256249999,"G":838.6779579796994,"paid_event_frequency":0.212705},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":3102.5981500500093,"EL_M1":2539.25758755,"EL_M2":563.3405625,"expected_recovery":631.1173176863922,"RC":252.4469270745569,"K":3881.789628471922,"cK":310.54317027775375,"F":140.6932006875,"G":5075.041930786426,"paid_event_frequency":0.585395},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":2402.010906150073,"EL_M1":2026.3187957500002,"EL_M2":375.6921104,"expected_recovery":283.1610244905919,"RC":113.26440979623676,"K":1775.1722673212494,"cK":142.01378138569996,"F":140.7050835,"G":3730.6589077760127,"paid_event_frequency":0.58572},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":402.80653129999826,"EL_M1":284.73495529999997,"EL_M2":118.07157599999996,"expected_recovery":132.47150245075784,"RC":52.98860098030314,"K":661.2320858236892,"cK":52.898566865895134,"F":126.0683835,"G":846.349443528262,"paid_event_frequency":0.1854},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":677.3308019500035,"EL_M1":556.3376769500002,"EL_M2":120.993125,"expected_recovery":80.34444021998797,"RC":32.13777608799519,"K":1095.956362139631,"cK":87.67650897117048,"F":140.75718506249999,"G":1250.5363627622257,"paid_event_frequency":0.587145},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":2010.684465150019,"EL_M1":1669.0840204500005,"EL_M2":341.60044469999997,"expected_recovery":373.9116334279299,"RC":149.56465337117197,"K":3132.9129420214713,"cK":250.6330353617177,"F":140.73597881249998,"G":3402.157510260545,"paid_event_frequency":0.586565},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":871.9376620499929,"EL_M1":690.2409545999999,"EL_M2":181.69670744999996,"expected_recovery":171.67406018439976,"RC":68.6696240737599,"K":1446.4933702942621,"cK":115.71946962354097,"F":127.605836625,"G":1578.5767898297252,"paid_event_frequency":0.22745},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":1845.2976275500087,"EL_M1":1516.0546900499996,"EL_M2":329.2429375,"expected_recovery":389.5103809340219,"RC":155.80415237360876,"K":2895.2405504251537,"cK":231.6192440340123,"F":140.687167875,"G":3164.5442557768397,"paid_event_frequency":0.58523},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":1207.3917104000896,"EL_M1":1017.8793081,"EL_M2":189.5124023,"expected_recovery":166.6799126566027,"RC":66.67196506264109,"K":2003.5798796425665,"cK":160.28639037140533,"F":140.70581475,"G":2100.0745074455144,"paid_event_frequency":0.58574},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":3104.8611036000043,"EL_M1":2557.8861817499997,"EL_M2":546.97492185,"expected_recovery":651.2226003681885,"RC":260.48904014727543,"K":4829.758303614953,"cK":386.3806642891962,"F":140.68241475,"G":5189.884297048635,"paid_event_frequency":0.5851},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":806.2308555000008,"EL_M1":609.46963455,"EL_M2":196.76122094999994,"expected_recovery":157.82840710494793,"RC":63.131362841979175,"K":1080.920444855807,"cK":86.47363558846457,"F":127.0268694375,"G":1443.8169644905927,"paid_event_frequency":0.211615},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":2055.8603046500366,"EL_M1":1678.8128463499995,"EL_M2":377.04745829999996,"expected_recovery":141.96269030206463,"RC":56.785076120825856,"K":2526.849050395319,"cK":202.1479240316255,"F":140.72208506249999,"G":3274.0205198199837,"paid_event_frequency":0.586185},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":2385.6892795500717,"EL_M1":2020.5862576999998,"EL_M2":365.10302185,"expected_recovery":204.90970353946796,"RC":81.96388141578718,"K":2151.7569902034074,"cK":172.1405592162726,"F":140.7167835,"G":3707.347338242842,"paid_event_frequency":0.58604},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":409.9594161499986,"EL_M1":284.13629465,"EL_M2":125.82312150000003,"expected_recovery":67.2471026245633,"RC":26.89884104982532,"K":628.2459617249315,"cK":50.25967693799452,"F":126.0886756875,"G":817.6088131004245,"paid_event_frequency":0.185955},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":1349.5925777499804,"EL_M1":1115.628383,"EL_M2":233.96419475000002,"expected_recovery":102.98369223414147,"RC":41.193476893656594,"K":1813.7276186951678,"cK":145.09820949561342,"F":140.7100194375,"G":2235.4590447690007,"paid_event_frequency":0.585855},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":1344.1882108999791,"EL_M1":1108.2219609,"EL_M2":235.96625,"expected_recovery":99.34080568544664,"RC":39.73632227417866,"K":1805.1739364677196,"cK":144.41391491741757,"F":140.720805375,"G":2225.412337955434,"paid_event_frequency":0.58615},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":874.2381263999871,"EL_M1":690.0846660499999,"EL_M2":184.15346034999996,"expected_recovery":59.99247710979614,"RC":23.996990843918457,"K":1167.4691625615064,"cK":93.39753300492052,"F":127.61022412499999,"G":1492.3238324984347,"paid_event_frequency":0.22757},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1837.6793353000023,"EL_M1":1491.8024381999999,"EL_M2":345.8768971,"expected_recovery":51.453964961311385,"RC":20.581585984524555,"K":1495.507814725931,"cK":119.64062517807449,"F":140.74420537499998,"G":2824.8610024501354,"paid_event_frequency":0.58679}],"typical":{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2660.909089349627,"EL_M1":2291.2292121499995,"EL_M2":369.6798772000001,"expected_recovery":885.3424911058273,"RC":354.13699644233094,"K":3276.6384102524744,"cK":262.13107282019797,"F":148.7051413125,"G":4567.843066566208,"paid_event_frequency":0.804525},"fallbackM2Retained":{"typical":{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2660.909089349627,"EL_M1":2291.2292121499995,"EL_M2":369.6798772000001,"expected_recovery":585.9923420152286,"RC":234.39693680609145,"K":11541.73821148341,"cK":923.3390569186729,"F":148.7051413125,"G":5289.800299182522,"paid_event_frequency":0.804525},"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"m1","EL":177946.02074309997,"expected_recovery":25927.872428550007,"reinsurance_premium":36299.021399970006,"RC":10371.14897142,"mean_net":152018.14831455,"net_TVaR":563622.45736,"net_VaR":478097.76999999996,"K":411604.30904545,"cK":32928.344723636,"F":14059.328085937497,"G":313739.79003212467,"average_premium":3137.3979003212467,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.51088,"tail_reduction":0.12040252881184055}},"frontendApplied":true,"book":[{"id":"CBU-001","hourly":1000.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":0,"physical_group":0,"access_group":0,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-002","hourly":500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":0,"physical_group":1,"access_group":1,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-003","hourly":1500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":0,"physical_group":0,"access_group":2,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-004","hourly":1000.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":0,"physical_group":1,"access_group":3,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-005","hourly":500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":0,"physical_group":0,"access_group":4,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-006","hourly":1500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":0,"physical_group":1,"access_group":5,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-007","hourly":1000.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":0,"physical_group":0,"access_group":6,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-008","hourly":500.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":0,"physical_group":1,"access_group":7,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-009","hourly":1500.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":0,"physical_group":0,"access_group":8,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-010","hourly":1000.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":0,"physical_group":1,"access_group":9,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-011","hourly":500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":0,"physical_group":0,"access_group":0,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-012","hourly":1500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":0,"physical_group":1,"access_group":1,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-013","hourly":1000.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":1,"physical_group":0,"access_group":2,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-014","hourly":500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":1,"physical_group":1,"access_group":3,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-015","hourly":1500.0,"ai_share":0.4,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":1,"physical_group":0,"access_group":4,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-016","hourly":1000.0,"ai_share":0.4,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":1,"physical_group":1,"access_group":5,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-017","hourly":500.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":1,"physical_group":0,"access_group":6,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-018","hourly":1500.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":1,"physical_group":1,"access_group":7,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-019","hourly":1000.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":1,"physical_group":0,"access_group":8,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-020","hourly":500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":1,"physical_group":1,"access_group":9,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-021","hourly":1500.0,"ai_share":0.4,"provider":"AWS","provider_index":1,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":1,"physical_group":0,"access_group":0,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-022","hourly":1000.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":2,"physical_group":0,"access_group":1,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-023","hourly":500.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":2,"physical_group":1,"access_group":2,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-024","hourly":1500.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":2,"physical_group":0,"access_group":3,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-025","hourly":1000.0,"ai_share":0.4,"provider":"Azure","provider_index":2,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":2,"physical_group":1,"access_group":4,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-026","hourly":500.0,"ai_share":0.4,"provider":"Azure","provider_index":2,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":2,"physical_group":0,"access_group":5,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-027","hourly":1500.0,"ai_share":1,"provider":"Azure","provider_index":2,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":2,"physical_group":1,"access_group":6,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-028","hourly":1000.0,"ai_share":1,"provider":"Alibaba Cloud","provider_index":3,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":1,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":3,"physical_group":0,"access_group":7,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-029","hourly":500.0,"ai_share":1,"provider":"Alibaba Cloud","provider_index":3,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":1,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":3,"physical_group":1,"access_group":8,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-030","hourly":1500.0,"ai_share":0,"provider":"Alibaba Cloud","provider_index":3,"region":"Singapore","region_index":0,"google_region_proxy":"asia-southeast1","jurisdiction_index":1,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":3,"physical_group":0,"access_group":9,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-031","hourly":1000.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":4,"physical_group":2,"access_group":0,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-032","hourly":500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":4,"physical_group":3,"access_group":1,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-033","hourly":1500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":4,"physical_group":2,"access_group":2,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-034","hourly":1000.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":4,"physical_group":3,"access_group":3,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-035","hourly":500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":4,"physical_group":2,"access_group":4,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-036","hourly":1500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":4,"physical_group":3,"access_group":5,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-037","hourly":1000.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":4,"physical_group":2,"access_group":6,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-038","hourly":1000.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":4,"physical_group":3,"access_group":7,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-039","hourly":1000.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":5,"physical_group":2,"access_group":8,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-040","hourly":500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":5,"physical_group":3,"access_group":9,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-041","hourly":1500.0,"ai_share":0.4,"provider":"AWS","provider_index":1,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":5,"physical_group":2,"access_group":0,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-042","hourly":1000.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":5,"physical_group":3,"access_group":1,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-043","hourly":500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":5,"physical_group":2,"access_group":2,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-044","hourly":1500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":5,"physical_group":3,"access_group":3,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-045","hourly":1000.0,"ai_share":0.4,"provider":"Azure","provider_index":2,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":6,"physical_group":2,"access_group":4,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-046","hourly":500.0,"ai_share":0.4,"provider":"Azure","provider_index":2,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":6,"physical_group":3,"access_group":5,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-047","hourly":1500.0,"ai_share":1,"provider":"Azure","provider_index":2,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":6,"physical_group":2,"access_group":6,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-048","hourly":1000.0,"ai_share":1,"provider":"Azure","provider_index":2,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":6,"physical_group":3,"access_group":7,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-049","hourly":1000.0,"ai_share":1,"provider":"Alibaba Cloud","provider_index":3,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":1,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":7,"physical_group":2,"access_group":8,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-050","hourly":1000.0,"ai_share":0,"provider":"Alibaba Cloud","provider_index":3,"region":"Virginia","region_index":1,"google_region_proxy":"us-east4","jurisdiction_index":1,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":7,"physical_group":3,"access_group":9,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-051","hourly":1000.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":8,"physical_group":4,"access_group":0,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-052","hourly":500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":8,"physical_group":5,"access_group":1,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-053","hourly":1500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":8,"physical_group":4,"access_group":2,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-054","hourly":1000.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":8,"physical_group":5,"access_group":3,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-055","hourly":500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":8,"physical_group":4,"access_group":4,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-056","hourly":1500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":8,"physical_group":5,"access_group":5,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-057","hourly":1000.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":8,"physical_group":4,"access_group":6,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-058","hourly":1000.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":8,"physical_group":5,"access_group":7,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-059","hourly":1000.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":9,"physical_group":4,"access_group":8,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-060","hourly":500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":9,"physical_group":5,"access_group":9,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-061","hourly":1500.0,"ai_share":0.4,"provider":"AWS","provider_index":1,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":9,"physical_group":4,"access_group":0,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-062","hourly":1000.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":9,"physical_group":5,"access_group":1,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-063","hourly":500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":9,"physical_group":4,"access_group":2,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-064","hourly":1500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":9,"physical_group":5,"access_group":3,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-065","hourly":1000.0,"ai_share":0.4,"provider":"Azure","provider_index":2,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":10,"physical_group":4,"access_group":4,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-066","hourly":500.0,"ai_share":0.4,"provider":"Azure","provider_index":2,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":10,"physical_group":5,"access_group":5,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-067","hourly":1500.0,"ai_share":1,"provider":"Azure","provider_index":2,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":10,"physical_group":4,"access_group":6,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-068","hourly":1000.0,"ai_share":1,"provider":"Azure","provider_index":2,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":10,"physical_group":5,"access_group":7,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-069","hourly":1000.0,"ai_share":1,"provider":"Alibaba Cloud","provider_index":3,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":1,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":11,"physical_group":4,"access_group":8,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-070","hourly":1000.0,"ai_share":0,"provider":"Alibaba Cloud","provider_index":3,"region":"Frankfurt","region_index":2,"google_region_proxy":"europe-west3","jurisdiction_index":1,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":11,"physical_group":5,"access_group":9,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-071","hourly":1000.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":12,"physical_group":6,"access_group":0,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-072","hourly":500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":12,"physical_group":7,"access_group":1,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-073","hourly":1500.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":12,"physical_group":6,"access_group":2,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-074","hourly":1000.0,"ai_share":0,"provider":"Google Cloud","provider_index":0,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":12,"physical_group":7,"access_group":3,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-075","hourly":500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":12,"physical_group":6,"access_group":4,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-076","hourly":1500.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":12,"physical_group":7,"access_group":5,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-077","hourly":1000.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":13,"physical_group":6,"access_group":6,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-078","hourly":500.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":13,"physical_group":7,"access_group":7,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-079","hourly":1500.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":13,"physical_group":6,"access_group":8,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-080","hourly":1000.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":13,"physical_group":7,"access_group":9,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-081","hourly":1000.0,"ai_share":0.4,"provider":"AWS","provider_index":1,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":13,"physical_group":6,"access_group":0,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-082","hourly":1000.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":14,"physical_group":6,"access_group":1,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-083","hourly":500.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":14,"physical_group":7,"access_group":2,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-084","hourly":1500.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":14,"physical_group":6,"access_group":3,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-085","hourly":1000.0,"ai_share":0.4,"provider":"Alibaba Cloud","provider_index":3,"region":"Tokyo","region_index":3,"google_region_proxy":"asia-northeast1","jurisdiction_index":1,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":15,"physical_group":6,"access_group":4,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-086","hourly":1000.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":16,"physical_group":8,"access_group":5,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-087","hourly":500.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":16,"physical_group":9,"access_group":6,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-088","hourly":1500.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":16,"physical_group":8,"access_group":7,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-089","hourly":1000.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":16,"physical_group":9,"access_group":8,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-090","hourly":1000.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":17,"physical_group":8,"access_group":9,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-091","hourly":500.0,"ai_share":0.4,"provider":"AWS","provider_index":1,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":17,"physical_group":9,"access_group":0,"scope_legal":true,"m1_annual":15000.0,"m2_annual":10000.0,"annual_total":20000.0,"event_limit":10000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-092","hourly":1500.0,"ai_share":0,"provider":"AWS","provider_index":1,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":17,"physical_group":8,"access_group":1,"scope_legal":true,"m1_annual":45000.0,"m2_annual":30000.0,"annual_total":60000.0,"event_limit":30000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-093","hourly":1000.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":0,"dependency_group":18,"physical_group":8,"access_group":2,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-094","hourly":1000.0,"ai_share":0,"provider":"Azure","provider_index":2,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":18,"physical_group":9,"access_group":3,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-095","hourly":1000.0,"ai_share":0.4,"provider":"Alibaba Cloud","provider_index":3,"region":"Seoul","region_index":4,"google_region_proxy":"asia-northeast3","jurisdiction_index":1,"calendar":"24x7","timezone":"Asia/Shanghai","backup":0,"dependency_group":19,"physical_group":8,"access_group":4,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-096","hourly":1000.0,"ai_share":0.4,"provider":"Google Cloud","provider_index":0,"region":"HongKong","region_index":5,"google_region_proxy":"asia-east2","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":2,"dependency_group":20,"physical_group":10,"access_group":5,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-097","hourly":1000.0,"ai_share":1,"provider":"Google Cloud","provider_index":0,"region":"HongKong","region_index":5,"google_region_proxy":"asia-east2","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":20,"physical_group":11,"access_group":6,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-098","hourly":1000.0,"ai_share":1,"provider":"AWS","provider_index":1,"region":"HongKong","region_index":5,"google_region_proxy":"asia-east2","jurisdiction_index":0,"calendar":"24x7","timezone":"Asia/Shanghai","backup":2,"dependency_group":21,"physical_group":10,"access_group":7,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-099","hourly":1000.0,"ai_share":1,"provider":"Azure","provider_index":2,"region":"HongKong","region_index":5,"google_region_proxy":"asia-east2","jurisdiction_index":0,"calendar":"business","timezone":"Asia/Shanghai","backup":1,"dependency_group":22,"physical_group":10,"access_group":8,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"},{"id":"CBU-100","hourly":1000.0,"ai_share":0,"provider":"Alibaba Cloud","provider_index":3,"region":"HongKong","region_index":5,"google_region_proxy":"asia-east2","jurisdiction_index":1,"calendar":"24x7","timezone":"Asia/Shanghai","backup":1,"dependency_group":23,"physical_group":10,"access_group":9,"scope_legal":true,"m1_annual":30000.0,"m2_annual":20000.0,"annual_total":40000.0,"event_limit":20000.0,"scale_basis":"合成核保算例；额度按H同比例；不是真实保单"}],"events":[{"event_id":"mhArPCRVWLE2fjKej7Kn","date":"2023-02-09","year":2023,"durations":{"storage":1.3},"url":"https://status.cloud.google.com/incidents/mhArPCRVWLE2fjKej7Kn","title":"Global: Google Cloud Storage returns 410 HTTP response when performing resumable uploads","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)Tel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-02-09T20:02:00+00:00","published_end_utc":"2023-02-09T21:20:00+00:00","published_envelope_hours":1.3,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"resumable_upload","feature_note":"分段续传上传；需业务确实使用该功能。","zh_summary":"存储续传上传返回错误"},{"event_id":"LnvJwfYu3TCyUrcrP7yf","date":"2023-02-27","year":2023,"durations":{"storage":0.21666666666666667},"url":"https://status.cloud.google.com/incidents/LnvJwfYu3TCyUrcrP7yf","title":"Multiple services are being impacted globally within Google Cloud","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)GlobalTel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-central2","us-east1","us-east4","us-east5","us-east7","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-02-27T12:58:00+00:00","published_end_utc":"2023-02-27T13:11:00+00:00","published_envelope_hours":0.21666666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"多个服务共同受影响"},{"event_id":"7JW3Gyzb3PH8YHy8ixtM","date":"2023-03-24","year":2023,"durations":{"sql":2.5666666666666664},"url":"https://status.cloud.google.com/incidents/7JW3Gyzb3PH8YHy8ixtM","title":"Some Google Cloud SQL customers are not able to connect to database using IAM authentication","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)Tel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-03-24T09:45:00+00:00","published_end_utc":"2023-03-24T12:19:00+00:00","published_envelope_hours":2.566666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"iam_sql","feature_note":"只涉及IAM认证连接数据库。","zh_summary":"SQL的IAM认证连接异常"},{"event_id":"FwyeeZDrGMZCEXvRLEpr","date":"2023-04-01","year":2023,"durations":{"run":2.75},"url":"https://status.cloud.google.com/incidents/FwyeeZDrGMZCEXvRLEpr","title":"Global : Cloud Run is experiencing elevated latency and deployment failures","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)Turin (europe-west12)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)Tel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-04-01T23:40:00+00:00","published_end_utc":"2023-04-02T02:25:00+00:00","published_envelope_hours":2.75,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"Cloud Run延迟及部署异常"},{"event_id":"FnWNc8U5TuZQkDmb6bov","date":"2023-04-21","year":2023,"durations":{"run":1.8333333333333335},"url":"https://status.cloud.google.com/incidents/FnWNc8U5TuZQkDmb6bov","title":"Cloud Run Jobs frequently failing to schedule in us-central1","location_text":"Taiwan (asia-east1)Tokyo (asia-northeast1)Osaka (asia-northeast2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)London (europe-west2)Netherlands (europe-west4)Milan (europe-west8)Paris (europe-west9)Montréal (northamerica-northeast1)Iowa (us-central1)South Carolina (us-east1)Oregon (us-west1)Los Angeles (us-west2)","location_codes":["us-central1"],"body_region_codes":["asia-east1","asia-northeast1","asia-northeast2","asia-southeast1","asia-southeast2","australia-southeast1","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west2","europe-west4","europe-west8","europe-west9","northamerica-northeast1","us-central1","us-east1","us-west1","us-west2"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-04-22T01:53:00+00:00","published_end_utc":"2023-04-22T03:42:00+00:00","published_envelope_hours":1.8166666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"jobs","feature_note":"Cloud Run Jobs调度及重试，不等同于HTTP在线服务。","zh_summary":"Run Jobs调度失败"},{"event_id":"dS9ps52MUnxQfyDGPfkY","date":"2023-04-25","year":2023,"durations":{"run":27.0,"sql":27.0,"storage":27.0},"url":"https://status.cloud.google.com/incidents/dS9ps52MUnxQfyDGPfkY","title":"Multiple Google Cloud services in the europe-west9-a zone are impacted","location_text":"Paris (europe-west9)Global","location_codes":["europe-west9"],"body_region_codes":["europe-west9"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-04-25T23:46:00+00:00","published_end_utc":"2023-04-27T03:00:00+00:00","published_envelope_hours":27.233333333333334,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"巴黎区域多服务中断"},{"event_id":"RBVxDz7u4Jhy5BDbzhdZ","date":"2023-04-26","year":2023,"durations":{"storage":1.5666666666666667},"url":"https://status.cloud.google.com/incidents/RBVxDz7u4Jhy5BDbzhdZ","title":"This issue is believed to be affecting a very small number of projects and our Engineering Team is working on it. If you have questions or are impacted, please open a case with the Support Team and we will work with you until this issue is resolved. No further updates will be provided here. We thank you for your patience while we are working on resolving the issue.","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Belgium (europe-west1)London (europe-west2)Frankfurt (europe-west3)Zurich (europe-west6)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Oregon (us-west1)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-west1","europe-west2","europe-west3","europe-west6","us-central1","us-east1","us-east4","us-west1","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-west1","europe-west2","europe-west3","europe-west6","us-central1","us-east1","us-east4","us-west1","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-04-26T07:22:00+00:00","published_end_utc":"2023-04-26T08:56:00+00:00","published_envelope_hours":1.5666666666666667,"included_unified":false,"review_reason":"详情诊断为AlloyDB新实例创建失败，不能按Cloud Storage既有业务中断计入。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"AlloyDB实例创建相关记录"},{"event_id":"W8APSvPHcxDNyEKyTqJP","date":"2023-05-06","year":2023,"durations":{"sql":4.5,"storage":4.5},"url":"https://status.cloud.google.com/incidents/W8APSvPHcxDNyEKyTqJP","title":"Multiple Cloud products impacted in europe-west9-c zone","location_text":"Paris (europe-west9)","location_codes":["europe-west9"],"body_region_codes":["europe-west9"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-05-06T13:05:00+00:00","published_end_utc":"2023-05-06T17:35:00+00:00","published_envelope_hours":4.5,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"巴黎另一可用区多服务影响"},{"event_id":"DyCcy7iGtWqLYEyJBWrC","date":"2023-06-04","year":2023,"durations":{"sql":1.7166666666666668},"url":"https://status.cloud.google.com/incidents/DyCcy7iGtWqLYEyJBWrC","title":"us-east1: Multiple Google Cloud Services Impacted","location_text":"South Carolina (us-east1)","location_codes":["us-east1"],"body_region_codes":["us-east1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-06-04T13:02:00+00:00","published_end_utc":"2023-06-04T14:45:00+00:00","published_envelope_hours":1.7166666666666666,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"南卡罗来纳多服务影响"},{"event_id":"bFvsY69tT5NndJXE89CD","date":"2023-06-06","year":2023,"durations":{"storage":1.95},"url":"https://status.cloud.google.com/incidents/bFvsY69tT5NndJXE89CD","title":"Google Cloud Storage may serve HTTP 503 errors for Google Cloud Load Balacing traffic from Europe","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)Turin (europe-west12)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)Doha (me-central1)Tel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-06-06T14:32:00+00:00","published_end_utc":"2023-06-06T16:28:00+00:00","published_envelope_hours":1.9333333333333333,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"europe_lb","feature_note":"经欧洲负载均衡访问Cloud Storage的路径。","zh_summary":"经欧洲负载均衡访问存储异常"},{"event_id":"VuCtCwkRXueAyusvrXfG","date":"2023-06-12","year":2023,"durations":{"sql":4.55},"url":"https://status.cloud.google.com/incidents/VuCtCwkRXueAyusvrXfG","title":"Multiple Google Cloud Platform services impacted globally with operational latency","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)Turin (europe-west12)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)Doha (me-central1)Tel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-06-13T00:15:00+00:00","published_end_utc":"2023-06-13T04:48:00+00:00","published_envelope_hours":4.55,"included_unified":false,"review_reason":"Cloud SQL所列影响为实例创建及备份管理操作失败，未证明既有查询不可用。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"创建及备份管理操作延迟"},{"event_id":"X3683kovx3cNYjorkosn","date":"2023-06-19","year":2023,"durations":{"storage":6.75},"url":"https://status.cloud.google.com/incidents/X3683kovx3cNYjorkosn","title":"Multiple products reporting 403 access denied issue in us-west1 and multiregion-us","location_text":"Belgium (europe-west1)Multi-region: usOregon (us-west1)Los Angeles (us-west2)","location_codes":["europe-west1","us-west1","us-west2"],"body_region_codes":["europe-west1","us-west1","us-west2"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-06-19T14:29:00+00:00","published_end_utc":"2023-06-19T21:14:00+00:00","published_envelope_hours":6.75,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"storage_auth","feature_note":"特定权限及请求路径的403错误。","zh_summary":"特定权限路径403错误"},{"event_id":"YuTyMJL1XNhPDMiib559","date":"2023-06-26","year":2023,"durations":{"sql":0.7666666666666666},"url":"https://status.cloud.google.com/incidents/YuTyMJL1XNhPDMiib559","title":"We are investigating a potential issue with Google Cloud SQL.","location_text":"Columbus (us-east5)","location_codes":["us-east5"],"body_region_codes":["us-east5"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-06-26T17:20:00+00:00","published_end_utc":"2023-06-26T18:06:00+00:00","published_envelope_hours":0.7666666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"俄亥俄SQL连接相关异常"},{"event_id":"QGLbjf9r6jTh2ieZpKyE","date":"2023-06-26","year":2023,"durations":{"sql":0.8166666666666667},"url":"https://status.cloud.google.com/incidents/QGLbjf9r6jTh2ieZpKyE","title":"Multiple Cloud products are experiencing elevated error rates in us-east5 due to authentication failures","location_text":"Columbus (us-east5)","location_codes":["us-east5"],"body_region_codes":["us-east5"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-06-26T17:15:00+00:00","published_end_utc":"2023-06-26T18:04:00+00:00","published_envelope_hours":0.8166666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"俄亥俄认证失败影响多服务"},{"event_id":"nJdB2gopahb8pRyT2YvY","date":"2023-07-17","year":2023,"durations":{"sql":3.5833333333333335},"url":"https://status.cloud.google.com/incidents/nJdB2gopahb8pRyT2YvY","title":"Final Resolution reg issues with Google Cloud SQL and Cloud Composer in multiple regions","location_text":"Tokyo (asia-northeast1)Osaka (asia-northeast2)Mumbai (asia-south1)Singapore (asia-southeast1)Belgium (europe-west1)London (europe-west2)Frankfurt (europe-west3)Tel Aviv (me-west1)São Paulo (southamerica-east1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-northeast1","asia-northeast2","asia-south1","asia-southeast1","europe-west1","europe-west2","europe-west3","me-west1","southamerica-east1","us-central1","us-east1","us-east4","us-east5","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-northeast1","asia-northeast2","asia-south1","asia-southeast1","europe-west1","europe-west2","europe-west3","me-west1","southamerica-east1","us-central1","us-east1","us-east4","us-east5","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-07-17T22:23:00+00:00","published_end_utc":"2023-07-18T01:58:00+00:00","published_envelope_hours":3.5833333333333335,"included_unified":false,"review_reason":"Cloud SQL新实例创建失败，非基准列明的既有生产请求中断。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"新建数据库实例问题"},{"event_id":"zQVKFyc4nVd3bG2YrNDL","date":"2023-08-29","year":2023,"durations":{"run":3.4},"url":"https://status.cloud.google.com/incidents/zQVKFyc4nVd3bG2YrNDL","title":"Multi-Region: Cloud Run is experiencing elevated latency","location_text":"Santiago (southamerica-west1)Salt Lake City (us-west3)","location_codes":["southamerica-west1","us-west3"],"body_region_codes":["southamerica-west1","us-west3"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-08-29T15:46:00+00:00","published_end_utc":"2023-08-29T19:11:00+00:00","published_envelope_hours":3.4166666666666665,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"Run在圣地亚哥及盐湖城延迟"},{"event_id":"qmF2nGxWvPTHkncXqHQP","date":"2023-09-07","year":2023,"durations":{"storage":1.2666666666666666},"url":"https://status.cloud.google.com/incidents/qmF2nGxWvPTHkncXqHQP","title":"us-central1 : Elevated latency in accessing Google Cloud Storage","location_text":"Iowa (us-central1)","location_codes":["us-central1"],"body_region_codes":["us-central1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-09-07T17:39:00+00:00","published_end_utc":"2023-09-07T18:55:00+00:00","published_envelope_hours":1.2666666666666666,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"爱荷华存储访问延迟"},{"event_id":"71zrZxw3PRkiNYhM1JsZ","date":"2023-09-12","year":2023,"durations":{"sql":3.7666666666666666},"url":"https://status.cloud.google.com/incidents/71zrZxw3PRkiNYhM1JsZ","title":"Multiple services for Google Cloud Platform are impacted in us-central1-a","location_text":"Iowa (us-central1)","location_codes":["us-central1"],"body_region_codes":["us-central1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-09-13T06:46:00+00:00","published_end_utc":"2023-09-13T10:32:00+00:00","published_envelope_hours":3.7666666666666666,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"爱荷华可用区多服务影响"},{"event_id":"34NK3hoNFQhCenBdxHqk","date":"2023-09-25","year":2023,"durations":{"ai":0.06666666666666667},"url":"https://status.cloud.google.com/incidents/34NK3hoNFQhCenBdxHqk","title":"We are investigating a potential issue with Vertex AI Online Prediction, Vertex AI Training.","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Seoul (asia-northeast3)Mumbai (asia-south1)Singapore (asia-southeast1)Sydney (australia-southeast1)Belgium (europe-west1)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Oregon (us-west1)Los Angeles (us-west2)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast3","asia-south1","asia-southeast1","australia-southeast1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","northamerica-northeast1","northamerica-northeast2","us-central1","us-east1","us-east4","us-west1","us-west2"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast3","asia-south1","asia-southeast1","australia-southeast1","europe-west1","europe-west2","europe-west3","europe-west4","europe-west6","northamerica-northeast1","northamerica-northeast2","us-central1","us-east1","us-east4","us-west1","us-west2"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-09-25T11:32:00+00:00","published_end_utc":"2023-09-25T11:36:00+00:00","published_envelope_hours":0.06666666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"Vertex在线预测及训练异常"},{"event_id":"U39RSGjaANJXtjHpRkdq","date":"2023-10-05","year":2023,"durations":{"sql":7.783333333333333},"url":"https://status.cloud.google.com/incidents/U39RSGjaANJXtjHpRkdq","title":"Multiple cloud products are experiencing networking issues in us-central1","location_text":"Iowa (us-central1)","location_codes":["us-central1"],"body_region_codes":["us-central1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-10-05T10:08:00+00:00","published_end_utc":"2023-10-05T17:55:00+00:00","published_envelope_hours":7.783333333333333,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"爱荷华网络问题"},{"event_id":"ALAcRGwU7zQqQ9cxHdeS","date":"2023-10-23","year":2023,"durations":{"run":2.8166666666666664},"url":"https://status.cloud.google.com/incidents/ALAcRGwU7zQqQ9cxHdeS","title":"Cloud Run and App Engine fail to serve some requests in us-east4, northamerica-northeast1 and northamerica-northeast2","location_text":"Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)Northern Virginia (us-east4)","location_codes":["northamerica-northeast1","northamerica-northeast2","us-east4"],"body_region_codes":["northamerica-northeast1","northamerica-northeast2","us-east4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-10-23T11:02:00+00:00","published_end_utc":"2023-10-23T13:51:00+00:00","published_envelope_hours":2.816666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"弗吉尼亚及加拿大Run请求失败"},{"event_id":"SAKLsoUFXmYay2SvpNsq","date":"2023-11-08","year":2023,"durations":{"run":2.3},"url":"https://status.cloud.google.com/incidents/SAKLsoUFXmYay2SvpNsq","title":"Customer experiencing a requests to Secret Manager timeout for App Engine and Cloud Run.","location_text":"Sydney (australia-southeast1)Belgium (europe-west1)","location_codes":["australia-southeast1","europe-west1"],"body_region_codes":["australia-southeast1","europe-west1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-11-08T23:11:00+00:00","published_end_utc":"2023-11-09T01:29:00+00:00","published_envelope_hours":2.3,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"secret_manager","feature_note":"运行时访问Secret Manager的依赖。","zh_summary":"Secret Manager依赖请求超时"},{"event_id":"VgryWZ3bxKBSUEBjXaSb","date":"2023-11-08","year":2023,"durations":{"storage":0.13333333333333333},"url":"https://status.cloud.google.com/incidents/VgryWZ3bxKBSUEBjXaSb","title":"Inter-regional VM to VM packet loss towards regions in Europe","location_text":"Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)Berlin (europe-west10)Turin (europe-west12)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)","location_codes":["europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9"],"body_region_codes":["europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-11-08T15:59:00+00:00","published_end_utc":"2023-11-08T16:07:00+00:00","published_envelope_hours":0.13333333333333333,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"通往欧洲的跨区网络丢包"},{"event_id":"QMBdrVss62jquDdxADA3","date":"2023-11-20","year":2023,"durations":{"sql":4.633333333333333},"url":"https://status.cloud.google.com/incidents/QMBdrVss62jquDdxADA3","title":"We are experiencing an issue with Cloud Memorystore, AlloyDB for PostgreSQL, Backup and DR, Cloud Data Fusion, Google Cloud Composer, Google Cloud SQL. All products are mitigated.","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)Berlin (europe-west10)Turin (europe-west12)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)Doha (me-central1)Dammam (me-central2)Tel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-central2","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-central2","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-11-21T06:29:00+00:00","published_end_utc":"2023-11-21T11:07:00+00:00","published_envelope_hours":4.633333333333334,"included_unified":false,"review_reason":"官方说明既有实例不受影响，主要为新建实例操作。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"数据库管理操作影响"},{"event_id":"7rJNpj5UKVxHFhdAHUzy","date":"2023-11-27","year":2023,"durations":{"sql":57.0},"url":"https://status.cloud.google.com/incidents/7rJNpj5UKVxHFhdAHUzy","title":"Some multiple-table DMLs intermittently are not working on MySQL versions 8.0.30+ with query insights enabled.","location_text":"Taiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Sydney (australia-southeast1)Melbourne (australia-southeast2)Warsaw (europe-central2)Finland (europe-north1)Madrid (europe-southwest1)Belgium (europe-west1)Berlin (europe-west10)Turin (europe-west12)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)Doha (me-central1)Dammam (me-central2)Tel Aviv (me-west1)Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)São Paulo (southamerica-east1)Santiago (southamerica-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-central2","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-central2","me-west1","northamerica-northeast1","northamerica-northeast2","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2023-11-27T13:01:00+00:00","published_end_utc":"2023-11-29T21:56:00+00:00","published_envelope_hours":56.916666666666664,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"mysql_query_insights","feature_note":"MySQL8.0.30以上、Query Insights及多表DML共同适用；间歇失败且存在关闭功能绕行措施。","zh_summary":"MySQL特定多表DML间歇失败"},{"event_id":"McSxWsRNvAPn7SbWGGig","date":"2024-02-07","year":2024,"durations":{"sql":1.9833333333333334},"url":"https://status.cloud.google.com/incidents/McSxWsRNvAPn7SbWGGig","title":"Multiple product outage in europe-west8-b","location_text":"Milan (europe-west8)Global","location_codes":["europe-west8"],"body_region_codes":["europe-west8"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-02-07T11:04:00+00:00","published_end_utc":"2024-02-07T13:03:00+00:00","published_envelope_hours":1.9833333333333334,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"米兰可用区多服务中断"},{"event_id":"u6rQ2nNVbhAFqGCcTm58","date":"2024-02-14","year":2024,"durations":{"run":3.1166666666666667,"sql":3.1166666666666667,"ai":3.1166666666666667},"url":"https://status.cloud.google.com/incidents/u6rQ2nNVbhAFqGCcTm58","title":"Multiple Google Cloud Products are experiencing issues in us-west1","location_text":"Oregon (us-west1)","location_codes":["us-west1"],"body_region_codes":["us-west1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-02-14T17:45:00+00:00","published_end_utc":"2024-02-14T20:52:00+00:00","published_envelope_hours":3.1166666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"俄勒冈多服务问题"},{"event_id":"5feV12qHeQoD3VdD8byK","date":"2024-05-08","year":2024,"durations":{"sql":3.4833333333333334},"url":"https://status.cloud.google.com/incidents/5feV12qHeQoD3VdD8byK","title":"Multiple services impacted in australia-southeast1.","location_text":"Sydney (australia-southeast1)","location_codes":["australia-southeast1"],"body_region_codes":["australia-southeast1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-05-09T02:00:00+00:00","published_end_utc":"2024-05-09T05:28:00+00:00","published_envelope_hours":3.466666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"悉尼多服务影响"},{"event_id":"HcNDMn4YeG57exykghT7","date":"2024-06-12","year":2024,"durations":{"ai":3.8833333333333333},"url":"https://status.cloud.google.com/incidents/HcNDMn4YeG57exykghT7","title":"Vertex AI Online Prediction, Dialogflow CX, and Agent Assist are experiencing elevated error rates in multiple regions.","location_text":"Singapore (asia-southeast1)Frankfurt (europe-west3)Netherlands (europe-west4)Iowa (us-central1)South Carolina (us-east1)Oregon (us-west1)","location_codes":["asia-southeast1","europe-west3","europe-west4","northamerica-northeast1","us-central1","us-east1","us-east4","us-west1"],"body_region_codes":["asia-southeast1","europe-west3","europe-west4","northamerica-northeast1","us-central1","us-east1","us-east4","us-west1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-06-12T19:06:00+00:00","published_end_utc":"2024-06-12T22:59:00+00:00","published_envelope_hours":3.8833333333333333,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"Vertex等AI接口多区错误率升高"},{"event_id":"6SCpW417YmwFN2Cq8ogN","date":"2024-07-10","year":2024,"durations":{"storage":40.0},"url":"https://status.cloud.google.com/incidents/6SCpW417YmwFN2Cq8ogN","title":"Elevated latency within Cloud Storage for Firebase in europe-west","location_text":"Frankfurt (europe-west3)Netherlands (europe-west4)","location_codes":["europe-west3","europe-west4"],"body_region_codes":["europe-west3","europe-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-07-10T22:20:00+00:00","published_end_utc":"2024-07-12T14:39:00+00:00","published_envelope_hours":40.31666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"firebase","feature_note":"Firebase使用Cloud Storage的特定路径；不是所有对象存储操作。","zh_summary":"欧洲Firebase存储路径延迟"},{"event_id":"n71AYyDXgDVjZubZo8wu","date":"2024-08-03","year":2024,"durations":{"run":1.95},"url":"https://status.cloud.google.com/incidents/n71AYyDXgDVjZubZo8wu","title":"Multiple product outage in europe-west9-a","location_text":"Paris (europe-west9)","location_codes":["europe-west9"],"body_region_codes":["europe-west9"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-08-03T11:31:00+00:00","published_end_utc":"2024-08-03T13:28:00+00:00","published_envelope_hours":1.95,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"巴黎可用区多服务中断"},{"event_id":"Z3aJkFKzZWRHSVYDxMaH","date":"2024-08-08","year":2024,"durations":{"ai":16.716666666666665},"url":"https://status.cloud.google.com/incidents/Z3aJkFKzZWRHSVYDxMaH","title":"Vertex AI Online Prediction experiencing elevated 500 errors for Claude Sonnet 3.5 and Opus models in us-east5","location_text":"","location_codes":["us-east5"],"body_region_codes":["us-east5"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-08-08T07:35:00+00:00","published_end_utc":"2024-08-09T00:18:00+00:00","published_envelope_hours":16.716666666666665,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"claude_vertex","feature_note":"特定Claude模型和us-east5端点；其他生成式模型正常。","zh_summary":"俄亥俄特定Claude模型错误"},{"event_id":"RAGcW4N9jHRkrAjnX2v7","date":"2024-10-15","year":2024,"durations":{"sql":3.7333333333333334},"url":"https://status.cloud.google.com/incidents/RAGcW4N9jHRkrAjnX2v7","title":"Multiple GCP products impacted in us-west2 region / us-west2-a zone","location_text":"Los Angeles (us-west2)","location_codes":["us-west2"],"body_region_codes":["us-west2"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-10-16T06:05:00+00:00","published_end_utc":"2024-10-16T09:49:00+00:00","published_envelope_hours":3.7333333333333334,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"洛杉矶区域及可用区故障"},{"event_id":"Pvq1RGrACDwogEE8hcrm","date":"2024-10-29","year":2024,"durations":{"run":0.36666666666666664,"sql":0.36666666666666664,"storage":0.36666666666666664},"url":"https://status.cloud.google.com/incidents/Pvq1RGrACDwogEE8hcrm","title":"All the impacted GCP products in australia-southeast2 have recovered.","location_text":"Melbourne (australia-southeast2)","location_codes":["australia-southeast2"],"body_region_codes":["australia-southeast2"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-10-29T23:21:00+00:00","published_end_utc":"2024-10-29T23:43:00+00:00","published_envelope_hours":0.36666666666666664,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"墨尔本多服务中断"},{"event_id":"kDBRnSgQCPw93E8vKKat","date":"2024-11-16","year":2024,"durations":{"sql":3.3666666666666667},"url":"https://status.cloud.google.com/incidents/kDBRnSgQCPw93E8vKKat","title":"Multiple GCP Products including Google Cloud Networking, Virtual Private Cloud (VPC), Cloud Load Balancing are experiencing issues in the asia-southeast2 region","location_text":"Jakarta (asia-southeast2)","location_codes":["asia-southeast2"],"body_region_codes":["asia-southeast1","asia-southeast2"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2024-11-16T08:52:00+00:00","published_end_utc":"2024-11-16T12:14:00+00:00","published_envelope_hours":3.3666666666666667,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"雅加达网络及依赖服务异常"},{"event_id":"N3Dw7nbJ7rk7qwrtwh7X","date":"2025-03-29","year":2025,"durations":{"sql":6.366666666666666},"url":"https://status.cloud.google.com/incidents/N3Dw7nbJ7rk7qwrtwh7X","title":"Customers are experiencing connectivity issues with multiple Google Cloud services in zone us-east5-c","location_text":"Columbus (us-east5)","location_codes":["us-east5"],"body_region_codes":["us-east5"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2025-03-29T19:53:00+00:00","published_end_utc":"2025-03-30T02:15:00+00:00","published_envelope_hours":6.366666666666666,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"俄亥俄可用区连接问题"},{"event_id":"SXRPpPwx2RZ5VHjTwFLx","date":"2025-05-19","year":2025,"durations":{"sql":8.7},"url":"https://status.cloud.google.com/incidents/SXRPpPwx2RZ5VHjTwFLx","title":"Google Compute Engine (GCE) issue impacting multiple dependent GCP services across zones","location_text":"Belgium (europe-west1)Iowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Oregon (us-west1)","location_codes":["europe-west1","us-central1","us-east1","us-east4","us-west1"],"body_region_codes":["asia-east1","asia-northeast1","asia-south1","asia-southeast1","australia-southeast1","europe-central2","europe-north1","europe-west1","europe-west12","europe-west2","europe-west3","europe-west4","me-central2","southamerica-east1","us-central1","us-east1","us-east4","us-east5","us-west1","us-west2","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2025-05-20T03:23:00+00:00","published_end_utc":"2025-05-20T12:05:00+00:00","published_envelope_hours":8.7,"included_unified":false,"review_reason":"Cloud SQL创建、调整及高可用更新操作失败；未直接计作既有查询中断。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"实例创建和扩缩配置操作异常"},{"event_id":"ow5i3PPK96RduMcb1SsW","date":"2025-06-12","year":2025,"durations":{"run":2.9,"sql":2.9,"storage":2.9,"ai":7.45},"url":"https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW","title":"Multiple GCP products are experiencing Service issues.","location_text":"Johannesburg (africa-south1)Multi-region: asiaTaiwan (asia-east1)Hong Kong (asia-east2)Tokyo (asia-northeast1)Osaka (asia-northeast2)Seoul (asia-northeast3)Mumbai (asia-south1)Delhi (asia-south2)Singapore (asia-southeast1)Jakarta (asia-southeast2)Multi-region: asia1Sydney (australia-southeast1)Melbourne (australia-southeast2)Multi-region: euMulti-region: eur3Multi-region: eur4Multi-region: eur5Warsaw (europe-central2)Finland (europe-north1)Stockholm (europe-north2)Madrid (europe-southwest1)Belgium (europe-west1)Berlin (europe-west10)Turin (europe-west12)London (europe-west2)Frankfurt (europe-west3)Netherlands (europe-west4)Zurich (europe-west6)Milan (europe-west8)Paris (europe-west9)GlobalDoha (me-central1)Dammam (me-central2)Tel Aviv (me-west1)Multi-region: nam-eur-asia1Multi-region: nam10Multi-region: nam11Multi-region: nam12Multi-region: nam13Multi-region: nam3Multi-region: nam5Multi-region: nam6Multi-region: nam7Multi-region: nam8Multi-region: nam9Montréal (northamerica-northeast1)Toronto (northamerica-northeast2)Mexico (northamerica-south1)São Paulo (southamerica-east1)Santiago (southamerica-west1)Multi-region: usIowa (us-central1)South Carolina (us-east1)Northern Virginia (us-east4)Columbus (us-east5)Dallas (us-south1)Oregon (us-west1)Los Angeles (us-west2)Salt Lake City (us-west3)Las Vegas (us-west4)","location_codes":["africa-south1","asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-north2","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-central2","me-west1","northamerica-northeast1","northamerica-northeast2","northamerica-south1","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"body_region_codes":["africa-south1","asia-east1","asia-east2","asia-northeast1","asia-northeast2","asia-northeast3","asia-south1","asia-south2","asia-southeast1","asia-southeast2","australia-southeast1","australia-southeast2","europe-central2","europe-north1","europe-north2","europe-southwest1","europe-west1","europe-west10","europe-west12","europe-west2","europe-west3","europe-west4","europe-west6","europe-west8","europe-west9","me-central1","me-central2","me-west1","northamerica-northeast1","northamerica-northeast2","northamerica-south1","southamerica-east1","southamerica-west1","us-central1","us-east1","us-east4","us-east5","us-south1","us-west1","us-west2","us-west3","us-west4"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2025-06-12T17:51:00+00:00","published_end_utc":"2025-06-13T01:18:00+00:00","published_envelope_hours":7.45,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"共同控制服务引发跨区故障"},{"event_id":"8cY8jdUpEGGbsSMSQk7J","date":"2025-07-18","year":2025,"durations":{"run":1.9666666666666668,"sql":1.9666666666666668,"storage":1.5,"ai":1.9666666666666668},"url":"https://status.cloud.google.com/incidents/8cY8jdUpEGGbsSMSQk7J","title":"We are investigating elevated error rates with multiple products in us-east1","location_text":"South Carolina (us-east1)","location_codes":["us-east1"],"body_region_codes":["us-east1"],"scope_review":"人工按原始详情核对；参数属于情景","published_start_utc":"2025-07-18T14:42:00+00:00","published_end_utc":"2025-07-18T16:47:00+00:00","published_envelope_hours":2.0833333333333335,"included_unified":true,"review_reason":"保留为候选事件，须匹配产品、区域、功能及客户证据。","feature":"broad","feature_note":"仍需验证客户及业务实际受影响。","zh_summary":"南卡罗来纳多服务错误率升高"}],"scenarios":{"baseline":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2660.909089349627,"EL_M1":2291.2292121499995,"EL_M2":369.6798772000001,"expected_recovery":885.3424911058273,"RC":354.13699644233094,"K":3276.6384102524744,"cK":262.13107282019797,"F":148.7051413125,"G":4567.843066566208,"paid_event_frequency":0.804525},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1034.279265200071,"EL_M1":850.0043902,"EL_M2":184.274875,"expected_recovery":408.4649654489009,"RC":163.38598617956038,"K":1263.2347027449996,"cK":101.05877621959996,"F":140.6928350625,"G":1919.222483548975,"paid_event_frequency":0.585385},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1235.296949750002,"EL_M1":937.1348197499999,"EL_M2":298.16213,"expected_recovery":720.4558594067714,"RC":288.18234376270857,"K":1233.9364669955364,"cK":98.71491735964291,"F":127.04003193749999,"G":2332.3123237464715,"paid_event_frequency":0.211975},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2069.891780150038,"EL_M1":1701.2050301500005,"EL_M2":368.68675,"expected_recovery":817.1435086824952,"RC":326.8574034729981,"K":2519.0021673556284,"cK":201.52017338845027,"F":140.6928350625,"G":3651.949589431981,"paid_event_frequency":0.585385},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.9545775995537,"EL_M1":1145.70689015,"EL_M2":185.24768744999997,"expected_recovery":441.94086095499415,"RC":176.77634438199766,"K":1646.0047349256204,"cK":131.68037879404963,"F":148.705324125,"G":2384.155499867468,"paid_event_frequency":0.80453},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":660.7537123499994,"EL_M1":484.18598374999993,"EL_M2":176.56772859999995,"expected_recovery":290.3455614222306,"RC":116.13822456889226,"K":797.3475535854808,"cK":63.787804286838465,"F":128.429955375,"G":1292.14626210764,"paid_event_frequency":0.24999},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1721.304578900015,"EL_M1":1489.5895789,"EL_M2":231.715,"expected_recovery":402.3985286851014,"RC":160.95941147404056,"K":2113.9727078350925,"cK":169.1178166268074,"F":148.7230569375,"G":2933.473151917817,"paid_event_frequency":0.805015},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":860.6122949499834,"EL_M1":745.2374199499999,"EL_M2":115.374875,"expected_recovery":193.57665127343375,"RC":77.43066050937351,"K":1063.3450443789854,"cK":85.06760355031884,"F":148.723605375,"G":1562.4455525129008,"paid_event_frequency":0.80503},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1509.0555425000134,"EL_M1":1240.9396806999998,"EL_M2":268.1158618,"expected_recovery":672.5950560119517,"RC":269.0380224047807,"K":1777.424613801626,"cK":142.19396910413008,"F":130.2568006875,"G":2734.059112928566,"paid_event_frequency":0.299955},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1844.1299757000065,"EL_M1":1509.0085382000002,"EL_M2":335.1214375,"expected_recovery":708.297805990763,"RC":283.3191223963052,"K":2275.756108352395,"cK":182.06048866819162,"F":140.697771,"G":3266.943143686005,"paid_event_frequency":0.58552},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.4550659495462,"EL_M1":1145.6151275500004,"EL_M2":184.83993839999997,"expected_recovery":442.67124554454676,"RC":177.06849821781873,"K":1638.3195153765582,"cK":131.06556123012467,"F":148.7051413125,"G":2383.059022279986,"paid_event_frequency":0.804525},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3102.8380084000073,"EL_M1":2550.0133834000003,"EL_M2":552.824625,"expected_recovery":1225.3948957737741,"RC":490.1579583095097,"K":3789.7042086544643,"cK":303.17633669235715,"F":140.6928350625,"G":5382.486851285832,"paid_event_frequency":0.585385},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":818.7391668,"EL_M1":619.9644132,"EL_M2":198.77475360000003,"expected_recovery":418.72692505477715,"RC":167.49077002191086,"K":958.0051723222941,"cK":76.64041378578354,"F":126.964530375,"G":1586.4465079769261,"paid_event_frequency":0.20991},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1031.8977036000674,"EL_M1":847.4527348499997,"EL_M2":184.44496875,"expected_recovery":358.12201627605054,"RC":143.24880651042022,"K":1359.4857377961648,"cK":108.75885902369319,"F":140.70416943749998,"G":1899.4793847622414,"paid_event_frequency":0.585695},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3984.7725294500087,"EL_M1":3428.9750888000017,"EL_M2":555.79744065,"expected_recovery":1158.7715154951402,"RC":463.5086061980561,"K":5066.603980927389,"cK":405.3283184741911,"F":148.607336625,"G":6669.622387663009,"paid_event_frequency":0.80185},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":436.99966089999646,"EL_M1":317.44903545000005,"EL_M2":119.55062545,"expected_recovery":173.483674899152,"RC":69.3934699596608,"K":514.587263064983,"cK":41.16698104519864,"F":128.3058256875,"G":901.1545834564746,"paid_event_frequency":0.246595},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":851.846372599994,"EL_M1":737.9903257000001,"EL_M2":113.8560469,"expected_recovery":178.96320359796493,"RC":71.58528143918598,"K":1001.5401898070663,"cK":80.12321518456531,"F":148.6268975625,"G":1536.242355714994,"paid_event_frequency":0.802385},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2562.029385400037,"EL_M1":2215.1393854000003,"EL_M2":346.89,"expected_recovery":524.1065863855611,"RC":209.64263455422443,"K":3078.0763645031752,"cK":246.24610916025404,"F":148.6250694375,"G":4222.057598069354,"paid_event_frequency":0.802335},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1001.2897773500345,"EL_M1":823.2525238499998,"EL_M2":178.0372535,"expected_recovery":392.0729536306508,"RC":156.82918145226031,"K":1256.853530021667,"cK":100.54828240173336,"F":130.082580375,"G":1851.6664287720375,"paid_event_frequency":0.29519},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":920.6728827000386,"EL_M1":753.9194608500001,"EL_M2":166.75342185,"expected_recovery":312.59168891977004,"RC":125.03667556790802,"K":1215.5000230321498,"cK":97.24000184257198,"F":140.7080085,"G":1711.5434248140248,"paid_event_frequency":0.5858},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3981.709544400012,"EL_M1":3427.10241,"EL_M2":554.6071344,"expected_recovery":1162.5763943140473,"RC":465.03055772561896,"K":5093.773368733502,"cK":407.5018694986802,"F":148.6067881875,"G":6670.465013082415,"paid_event_frequency":0.801835},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2054.9333222500304,"EL_M1":1684.2291243500001,"EL_M2":370.7041979,"expected_recovery":607.3290413217862,"RC":242.9316165287145,"K":2211.662210124622,"cK":176.93297680996977,"F":140.67729599999998,"G":3487.300282118286,"paid_event_frequency":0.58496},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":404.32405019999453,"EL_M1":306.04751195000006,"EL_M2":98.27653825000002,"expected_recovery":162.12140224277573,"RC":64.84856089711029,"K":481.8142157941286,"cK":38.545137263530286,"F":127.0367413125,"G":846.3393195641802,"paid_event_frequency":0.211885},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":3080.6257571000065,"EL_M1":2526.742679,"EL_M2":553.8830781,"expected_recovery":909.6029693603059,"RC":363.8411877441224,"K":3308.6645181035387,"cK":264.6931614482831,"F":140.6771131875,"G":5133.116292639883,"paid_event_frequency":0.584955},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2640.3235664996414,"EL_M1":2271.11199355,"EL_M2":369.21157295,"expected_recovery":582.4900957627697,"RC":232.99603830510787,"K":2818.0189554856365,"cK":225.44151643885093,"F":148.545180375,"G":4329.741735491468,"paid_event_frequency":0.80015},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":221.1363683500033,"EL_M1":159.35573749999998,"EL_M2":61.780630850000016,"expected_recovery":75.90229916985234,"RC":30.360919667940937,"K":215.31401424524492,"cK":17.225121139619596,"F":128.4381819375,"G":529.5474547934185,"paid_event_frequency":0.250215},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":2548.6659360500325,"EL_M1":2202.0253110500003,"EL_M2":346.640625,"expected_recovery":406.9028223107034,"RC":162.76112892428137,"K":2485.1387664344356,"cK":198.81110131475486,"F":148.56108506249998,"G":4078.399001802092,"paid_event_frequency":0.800585},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":1708.64604135002,"EL_M1":1477.0240841999996,"EL_M2":231.62195715,"expected_recovery":219.11224530411187,"RC":87.64489812164476,"K":799.0245393463194,"cK":63.921963147705554,"F":148.6916131875,"G":2678.5393544091603,"paid_event_frequency":0.804155},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":498.5836918000156,"EL_M1":410.44767699999994,"EL_M2":88.1360148,"expected_recovery":85.18490741812843,"RC":34.073962967251376,"K":444.0382251840424,"cK":35.5230580147234,"F":130.14546787499998,"G":931.1015742093205,"paid_event_frequency":0.29691},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":2763.482211800007,"EL_M1":2256.9566354999997,"EL_M2":506.52557629999995,"expected_recovery":499.26751614427394,"RC":199.70700645770958,"K":2260.52535341067,"cK":180.8420282728536,"F":140.757367875,"G":4379.7181525407605,"paid_event_frequency":0.58715},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3109.082651300003,"EL_M1":2735.6321579999994,"EL_M2":373.45049330000006,"expected_recovery":694.1161724003459,"RC":277.6464689601384,"K":3757.0633886701626,"cK":300.565071093613,"F":156.6147069375,"G":5125.21186438834,"paid_event_frequency":1.020855},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1258.4780122005234,"EL_M1":1071.6447099999996,"EL_M2":186.8333022,"expected_recovery":326.77035652955567,"RC":130.70814261182227,"K":1515.3863665051986,"cK":121.23090932041589,"F":148.6108100625,"G":2212.037165593682,"paid_event_frequency":0.801945},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1396.1202371000131,"EL_M1":1093.7565652,"EL_M2":302.36367190000004,"expected_recovery":579.5753685441166,"RC":231.83014741764666,"K":1652.1562744494588,"cK":132.1725019559567,"F":129.43560693749998,"G":2519.4113245481553,"paid_event_frequency":0.277495},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2517.2503546004195,"EL_M1":2144.7400630499997,"EL_M2":372.51029155000003,"expected_recovery":653.6567091557972,"RC":261.4626836623189,"K":2999.8943049706127,"cK":239.99154439764902,"F":148.6108100625,"G":4223.087190297183,"paid_event_frequency":0.801945},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1554.6280154000162,"EL_M1":1367.7891739000004,"EL_M2":186.83884150000003,"expected_recovery":345.96289518386016,"RC":138.38515807354406,"K":1877.824622563532,"cK":150.22596980508257,"F":156.61342725,"G":2666.4700940381904,"paid_event_frequency":1.02082},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":779.4206764499992,"EL_M1":594.5573049000001,"EL_M2":184.86337154999998,"expected_recovery":262.38951518521446,"RC":104.95580607408579,"K":898.2832024174782,"cK":71.86265619339825,"F":130.7145631875,"G":1449.2716025399777,"paid_event_frequency":0.312475},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.6143655499873,"EL_M1":1809.3256155499998,"EL_M2":235.28875,"expected_recovery":342.29811475959013,"RC":136.91924590383607,"K":2357.9248752648923,"cK":188.63399002119138,"F":156.63902099999999,"G":3369.075496633353,"paid_event_frequency":1.02152},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.682521600002,"EL_M1":1810.3962715999996,"EL_M2":234.28625,"expected_recovery":342.2551563595798,"RC":136.90206254383193,"K":2335.023913971004,"cK":186.8019131176803,"F":156.6355475625,"G":3366.6960597653524,"paid_event_frequency":1.021425},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":1104.7753762999903,"EL_M1":923.3741927,"EL_M2":181.4011836,"expected_recovery":361.35444124947594,"RC":144.5417764997904,"K":1277.3747078457445,"cK":102.18997662765956,"F":132.50301787499998,"G":1978.6801964032536,"paid_event_frequency":0.36139},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":1129.8778893003764,"EL_M1":961.33309995,"EL_M2":168.54478935000003,"expected_recovery":292.92835083343004,"RC":117.17134033337203,"K":1260.8439885927914,"cK":100.86751908742332,"F":148.60477724999998,"G":1995.362034628229,"paid_event_frequency":0.80178},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":4642.625122750098,"EL_M1":4082.2912352999997,"EL_M2":560.33388745,"expected_recovery":1057.908861590393,"RC":423.1635446361572,"K":5113.227642725384,"cK":409.0582114180307,"F":156.5101381875,"G":7508.476022655715,"paid_event_frequency":1.017995},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":2506.297847600418,"EL_M1":2132.5206672500003,"EL_M2":373.77718035000004,"expected_recovery":673.1850905656265,"RC":269.27403622625064,"K":2791.792637846206,"cK":223.3434110276965,"F":148.598561625,"G":4196.685141972487,"paid_event_frequency":0.80161},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":460.0050705499734,"EL_M1":359.18717995000003,"EL_M2":100.8178906,"expected_recovery":191.52940710016134,"RC":76.61176284006454,"K":527.1285367827336,"cK":42.17028294261869,"F":129.3891725625,"G":944.2350518602088,"paid_event_frequency":0.276225},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":3758.2775741500964,"EL_M1":3199.2944562000002,"EL_M2":558.9831179500001,"expected_recovery":1009.5694396137442,"RC":403.8277758454977,"K":4163.384371755201,"cK":333.0707497404161,"F":148.5976475625,"G":6191.698329731348,"paid_event_frequency":0.801585},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":3094.207483600016,"EL_M1":2720.5662773499994,"EL_M2":373.64120625,"expected_recovery":369.8259388037841,"RC":147.93037552151364,"K":2761.238037944627,"cK":220.89904303557017,"F":156.49935225,"G":4826.048339209467,"paid_event_frequency":1.0177},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":259.69517729999876,"EL_M1":197.47533139999996,"EL_M2":62.219845899999996,"expected_recovery":61.14598876134539,"RC":24.45839550453816,"K":270.4379253148955,"cK":21.63503402519164,"F":130.6619131875,"G":581.934026689638,"paid_event_frequency":0.311035},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":3058.0457658000505,"EL_M1":2701.03718765,"EL_M2":357.00857814999995,"expected_recovery":347.34656084236076,"RC":138.93862433694432,"K":2830.0868250403178,"cK":226.4069460032254,"F":156.52421475,"G":4773.220734520294,"paid_event_frequency":1.01838},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":2038.5268750500027,"EL_M1":1801.0554614500002,"EL_M2":237.4714136,"expected_recovery":228.6697712626526,"RC":91.46790850506105,"K":1833.5691355674733,"cK":146.68553084539786,"F":156.52256943749998,"G":3244.2705117839487,"paid_event_frequency":1.018335},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1101.1981994499859,"EL_M1":917.5240584000001,"EL_M2":183.67414105,"expected_recovery":153.27334316616634,"RC":61.30933726646654,"K":1025.6055244267995,"cK":82.04844195414397,"F":132.5042975625,"G":1836.0803683107952,"paid_event_frequency":0.361425},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":2261.5489926002397,"EL_M1":1921.7062092499998,"EL_M2":339.84278335,"expected_recovery":259.30460969989554,"RC":103.72184387995821,"K":1702.0372785860895,"cK":136.16298228688717,"F":148.6353069375,"G":3533.425500939447,"paid_event_frequency":0.802615},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3292.5677857503574,"EL_M1":2915.58712305,"EL_M2":376.98066270000004,"expected_recovery":928.4071609589068,"RC":371.36286438356274,"K":4449.495203224099,"cK":355.9596162579279,"F":149.8574085,"G":5559.663566522464,"paid_event_frequency":0.83604},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1353.8458876001064,"EL_M1":1163.4777773500002,"EL_M2":190.36811024999997,"expected_recovery":444.7411302853483,"RC":177.89645211413932,"K":1879.695510909693,"cK":150.37564087277545,"F":141.896655375,"G":2432.019514616028,"paid_event_frequency":0.61831},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1619.3964679000094,"EL_M1":1322.3371311499998,"EL_M2":297.05933674999994,"expected_recovery":729.9024181325279,"RC":291.9609672530112,"K":2115.2228641330184,"cK":169.2178291306415,"F":128.06688975,"G":2944.8562053782157,"paid_event_frequency":0.24006},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":2709.2643915000867,"EL_M1":2327.99320405,"EL_M2":381.27118744999996,"expected_recovery":891.1498590017022,"RC":356.4599436006809,"K":3741.459744222396,"cK":299.31677953779166,"F":141.89574131249998,"G":4675.915807934746,"paid_event_frequency":0.618285},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1645.912286599879,"EL_M1":1457.63095445,"EL_M2":188.28133214999997,"expected_recovery":462.76365492515106,"RC":185.10546197006045,"K":2243.2874811602032,"cK":179.46299849281627,"F":149.857042875,"G":2880.4503865836746,"paid_event_frequency":0.83603},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":755.8277319499989,"EL_M1":572.92072985,"EL_M2":182.9070021,"expected_recovery":315.40004588187975,"RC":126.1600183527519,"K":888.6110436552262,"cK":71.0888834924181,"F":128.94055068749998,"G":1442.689579310225,"paid_event_frequency":0.263955},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1890.7086107999867,"EL_M1":1651.2085170499995,"EL_M2":239.50009375,"expected_recovery":434.3073687058195,"RC":173.7229474823278,"K":2323.6105481325612,"cK":185.8888438506049,"F":149.8981756875,"G":3200.291437093893,"paid_event_frequency":0.837155},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1891.3325052999792,"EL_M1":1653.0666394499997,"EL_M2":238.26586585,"expected_recovery":434.3134550010368,"RC":173.72538200041473,"K":2353.2197895014797,"cK":188.25758316011837,"F":149.90786475,"G":3204.297780280683,"paid_event_frequency":0.83742},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1220.5754225000424,"EL_M1":1042.7354834999999,"EL_M2":177.83993900000002,"expected_recovery":467.2880818095849,"RC":186.91523272383398,"K":1491.2778236283748,"cK":119.30222589026998,"F":131.050755375,"G":2210.4581819855284,"paid_event_frequency":0.32167},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1192.4844998000724,"EL_M1":1020.8851873000001,"EL_M2":171.5993125,"expected_recovery":424.56451040076263,"RC":169.82580416030507,"K":1478.255786525265,"cK":118.2604629220212,"F":141.96886631249998,"G":2163.386177593198,"paid_event_frequency":0.620285},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4961.046708650011,"EL_M1":4395.550227350001,"EL_M2":565.4964812999999,"expected_recovery":1525.9740934766523,"RC":610.3896373906609,"K":5979.40838512348,"cK":478.3526708098784,"F":149.8221256875,"G":8266.148190050735,"paid_event_frequency":0.835075},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2724.8900143500787,"EL_M1":2344.2939727000003,"EL_M2":380.59604165,"expected_recovery":987.3499024893924,"RC":394.939960995757,"K":3397.850766601404,"cK":271.8280613281123,"F":141.9604569375,"G":4711.491324815264,"paid_event_frequency":0.620055},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":541.9661939999947,"EL_M1":442.8866853499999,"EL_M2":99.07950865000001,"expected_recovery":256.00318758258993,"RC":102.40127503303597,"K":688.4355358501953,"cK":55.07484286801562,"F":128.0491569375,"G":1103.3219584513952,"paid_event_frequency":0.239575},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4088.0273970500098,"EL_M1":3516.2889127500002,"EL_M2":571.7384843,"expected_recovery":1482.7236879485708,"RC":593.0894751794284,"K":5081.287837125141,"cK":406.50302697001126,"F":141.96027412499998,"G":6972.7735644325985,"paid_event_frequency":0.62005},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":3291.507885150351,"EL_M1":2914.8260476,"EL_M2":376.68183755,"expected_recovery":413.06238148163357,"RC":165.22495259265344,"K":3430.2898948354045,"cK":274.4231915868324,"F":149.8148131875,"G":5174.627790023115,"paid_event_frequency":0.834875},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":252.19135500000425,"EL_M1":190.22419380000002,"EL_M2":61.9671612,"expected_recovery":69.48877246416404,"RC":27.79550898566562,"K":308.1778908198197,"cK":24.654231265585576,"F":128.911117875,"G":578.0696175016739,"paid_event_frequency":0.26315},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":2819.433195650034,"EL_M1":2461.33069565,"EL_M2":358.1025,"expected_recovery":408.4086781692895,"RC":163.3634712677158,"K":2964.341948415398,"cK":237.14735587323185,"F":149.8524725625,"G":4493.061993804643,"paid_event_frequency":0.835905},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1885.67560719999,"EL_M1":1642.2241072,"EL_M2":243.4515,"expected_recovery":273.1303445046608,"RC":109.25213780186432,"K":2025.6564769703036,"cK":162.0525181576243,"F":149.8597850625,"G":3075.7867309626386,"paid_event_frequency":0.836105},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":1208.3437598000505,"EL_M1":1028.4762216500003,"EL_M2":179.86753815,"expected_recovery":149.67928787778305,"RC":59.87171515111322,"K":1190.590148826631,"cK":95.24721190613049,"F":130.98110381249998,"G":1992.591720893059,"paid_event_frequency":0.319765},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":2353.874481600054,"EL_M1":2005.0619815999996,"EL_M2":348.8125,"expected_recovery":264.4862318198866,"RC":105.79449272795465,"K":2280.756515481968,"cK":182.46052123855745,"F":141.84948975,"G":3711.9719804220877,"paid_event_frequency":0.61702},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2386.6900491000615,"EL_M1":2011.7541854000003,"EL_M2":374.9358637,"expected_recovery":664.0693844340478,"RC":265.62775377361913,"K":3494.000317828274,"cK":279.52002542626195,"F":140.66833818749998,"G":4096.674888649924,"paid_event_frequency":0.584715},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1030.2383522000669,"EL_M1":840.60524115,"EL_M2":189.63311105,"expected_recovery":248.966742656129,"RC":99.5866970624516,"K":1605.7371403980037,"cK":128.4589712318403,"F":140.6811350625,"G":1865.2868740758115,"paid_event_frequency":0.585065},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":1223.3914467500074,"EL_M1":926.52147225,"EL_M2":296.8699745,"expected_recovery":550.3997778486207,"RC":220.1599111394483,"K":1687.8505382201438,"cK":135.0280430576115,"F":127.02321318749999,"G":2274.1368188460897,"paid_event_frequency":0.211515},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2061.3081456500345,"EL_M1":1681.8622536500002,"EL_M2":379.445892,"expected_recovery":498.85134560344,"RC":199.540538241376,"K":3238.381071866228,"cK":259.07048574929826,"F":140.6815006875,"G":3547.4675604376116,"paid_event_frequency":0.585075},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1194.7186452500866,"EL_M1":1006.98072445,"EL_M2":187.7379208,"expected_recovery":331.30578349892824,"RC":132.5223133995713,"K":1755.5169380919624,"cK":140.441355047357,"F":140.668521,"G":2144.46777959602,"paid_event_frequency":0.58472},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":614.7882923499973,"EL_M1":423.1454303999999,"EL_M2":191.64286195,"expected_recovery":197.86259169546565,"RC":79.14503667818627,"K":1027.0281443965646,"cK":82.16225155172516,"F":126.1117100625,"G":1202.9430541898785,"paid_event_frequency":0.186585},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1348.4854954999796,"EL_M1":1111.6902205499998,"EL_M2":236.79527495000002,"expected_recovery":296.27630736757214,"RC":118.51052294702886,"K":1858.851646396053,"cK":148.70813171168425,"F":140.64256162499998,"G":2341.79561571159,"paid_event_frequency":0.58401},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":677.0039081000031,"EL_M1":556.3557830999999,"EL_M2":120.648125,"expected_recovery":109.87675991521121,"RC":43.95070396608449,"K":1063.0817395837648,"cK":85.0465391667012,"F":140.6537131875,"G":1262.2064858937183,"paid_event_frequency":0.584315},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":1303.1599777000013,"EL_M1":1035.1343748000002,"EL_M2":268.02560289999997,"expected_recovery":451.2847725776651,"RC":180.51390903106605,"K":2020.2181045813916,"cK":161.61744836651133,"F":127.535636625,"G":2363.769295630105,"paid_event_frequency":0.22553},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1854.3394099000034,"EL_M1":1505.5410349,"EL_M2":348.798375,"expected_recovery":363.2582797419343,"RC":145.30331189677372,"K":2962.2238566357337,"cK":236.9779085308587,"F":140.6427444375,"G":3169.6844996868476,"paid_event_frequency":0.584015},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2395.651995150081,"EL_M1":2020.4918916000004,"EL_M2":375.16010355000003,"expected_recovery":553.6560889168907,"RC":221.46243556675628,"K":3420.4298498616936,"cK":273.6343879889355,"F":140.6262913125,"G":4041.8334800243633,"paid_event_frequency":0.583565},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":2067.086607600039,"EL_M1":1692.5490846499997,"EL_M2":374.53752295000004,"expected_recovery":419.819929849539,"RC":167.92797193981562,"K":2562.8314752905117,"cK":205.02651802324093,"F":140.6924694375,"G":3440.9780893341267,"paid_event_frequency":0.585375},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":411.412147249993,"EL_M1":310.36181525,"EL_M2":101.050332,"expected_recovery":88.9731450834609,"RC":35.58925803338436,"K":686.7542579862152,"cK":54.94034063889722,"F":127.06672256249999,"G":838.6779579796994,"paid_event_frequency":0.212705},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":3102.5981500500093,"EL_M1":2539.25758755,"EL_M2":563.3405625,"expected_recovery":631.1173176863922,"RC":252.4469270745569,"K":3881.789628471922,"cK":310.54317027775375,"F":140.6932006875,"G":5075.041930786426,"paid_event_frequency":0.585395},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":2402.010906150073,"EL_M1":2026.3187957500002,"EL_M2":375.6921104,"expected_recovery":283.1610244905919,"RC":113.26440979623676,"K":1775.1722673212494,"cK":142.01378138569996,"F":140.7050835,"G":3730.6589077760127,"paid_event_frequency":0.58572},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":402.80653129999826,"EL_M1":284.73495529999997,"EL_M2":118.07157599999996,"expected_recovery":132.47150245075784,"RC":52.98860098030314,"K":661.2320858236892,"cK":52.898566865895134,"F":126.0683835,"G":846.349443528262,"paid_event_frequency":0.1854},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":677.3308019500035,"EL_M1":556.3376769500002,"EL_M2":120.993125,"expected_recovery":80.34444021998797,"RC":32.13777608799519,"K":1095.956362139631,"cK":87.67650897117048,"F":140.75718506249999,"G":1250.5363627622257,"paid_event_frequency":0.587145},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":2010.684465150019,"EL_M1":1669.0840204500005,"EL_M2":341.60044469999997,"expected_recovery":373.9116334279299,"RC":149.56465337117197,"K":3132.9129420214713,"cK":250.6330353617177,"F":140.73597881249998,"G":3402.157510260545,"paid_event_frequency":0.586565},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":871.9376620499929,"EL_M1":690.2409545999999,"EL_M2":181.69670744999996,"expected_recovery":171.67406018439976,"RC":68.6696240737599,"K":1446.4933702942621,"cK":115.71946962354097,"F":127.605836625,"G":1578.5767898297252,"paid_event_frequency":0.22745},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":1845.2976275500087,"EL_M1":1516.0546900499996,"EL_M2":329.2429375,"expected_recovery":389.5103809340219,"RC":155.80415237360876,"K":2895.2405504251537,"cK":231.6192440340123,"F":140.687167875,"G":3164.5442557768397,"paid_event_frequency":0.58523},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":1207.3917104000896,"EL_M1":1017.8793081,"EL_M2":189.5124023,"expected_recovery":166.6799126566027,"RC":66.67196506264109,"K":2003.5798796425665,"cK":160.28639037140533,"F":140.70581475,"G":2100.0745074455144,"paid_event_frequency":0.58574},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":3104.8611036000043,"EL_M1":2557.8861817499997,"EL_M2":546.97492185,"expected_recovery":651.2226003681885,"RC":260.48904014727543,"K":4829.758303614953,"cK":386.3806642891962,"F":140.68241475,"G":5189.884297048635,"paid_event_frequency":0.5851},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":806.2308555000008,"EL_M1":609.46963455,"EL_M2":196.76122094999994,"expected_recovery":157.82840710494793,"RC":63.131362841979175,"K":1080.920444855807,"cK":86.47363558846457,"F":127.0268694375,"G":1443.8169644905927,"paid_event_frequency":0.211615},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":2055.8603046500366,"EL_M1":1678.8128463499995,"EL_M2":377.04745829999996,"expected_recovery":141.96269030206463,"RC":56.785076120825856,"K":2526.849050395319,"cK":202.1479240316255,"F":140.72208506249999,"G":3274.0205198199837,"paid_event_frequency":0.586185},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":2385.6892795500717,"EL_M1":2020.5862576999998,"EL_M2":365.10302185,"expected_recovery":204.90970353946796,"RC":81.96388141578718,"K":2151.7569902034074,"cK":172.1405592162726,"F":140.7167835,"G":3707.347338242842,"paid_event_frequency":0.58604},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":409.9594161499986,"EL_M1":284.13629465,"EL_M2":125.82312150000003,"expected_recovery":67.2471026245633,"RC":26.89884104982532,"K":628.2459617249315,"cK":50.25967693799452,"F":126.0886756875,"G":817.6088131004245,"paid_event_frequency":0.185955},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":1349.5925777499804,"EL_M1":1115.628383,"EL_M2":233.96419475000002,"expected_recovery":102.98369223414147,"RC":41.193476893656594,"K":1813.7276186951678,"cK":145.09820949561342,"F":140.7100194375,"G":2235.4590447690007,"paid_event_frequency":0.585855},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":1344.1882108999791,"EL_M1":1108.2219609,"EL_M2":235.96625,"expected_recovery":99.34080568544664,"RC":39.73632227417866,"K":1805.1739364677196,"cK":144.41391491741757,"F":140.720805375,"G":2225.412337955434,"paid_event_frequency":0.58615},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":874.2381263999871,"EL_M1":690.0846660499999,"EL_M2":184.15346034999996,"expected_recovery":59.99247710979614,"RC":23.996990843918457,"K":1167.4691625615064,"cK":93.39753300492052,"F":127.61022412499999,"G":1492.3238324984347,"paid_event_frequency":0.22757},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1837.6793353000023,"EL_M1":1491.8024381999999,"EL_M2":345.8768971,"expected_recovery":51.453964961311385,"RC":20.581585984524555,"K":1495.507814725931,"cK":119.64062517807449,"F":140.74420537499998,"G":2824.8610024501354,"paid_event_frequency":0.58679}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":177946.02074309997,"expected_recovery":43892.578657599995,"reinsurance_premium":61449.61012063999,"RC":17557.031463039995,"mean_net":134053.4420855,"net_TVaR":347052.66095499997,"net_VaR":314502.28,"K":212999.21886949998,"cK":17039.937509559997,"F":14059.328085937497,"G":302136.4237355166,"average_premium":3021.364237355166,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.58878,"tail_reduction":0.45838452858141154},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"m2Low":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2319.568104149752,"EL_M1":2282.3004541500004,"EL_M2":37.26765,"expected_recovery":611.7113902512392,"RC":244.68455610049568,"K":3307.3004002115504,"cK":264.584032016924,"F":147.977730375,"G":3969.0858968562293,"paid_event_frequency":0.78463},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":867.5930579000379,"EL_M1":848.1030579,"EL_M2":19.49,"expected_recovery":284.1375133516294,"RC":113.65500534065177,"K":1223.085527714189,"cK":97.84684221713513,"F":140.0910163125,"G":1625.5812290270997,"paid_event_frequency":0.568925},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":960.5180435000026,"EL_M1":931.4406886000002,"EL_M2":29.077354899999996,"expected_recovery":492.16272686732435,"RC":196.86509074692975,"K":1286.7988526831696,"cK":102.94390821465356,"F":126.4473538125,"G":1849.0325283654477,"paid_event_frequency":0.195765},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1734.5466816499836,"EL_M1":1695.4116816500004,"EL_M2":39.135,"expected_recovery":568.5316370626729,"RC":227.41265482506915,"K":2443.711127654754,"cK":195.49689021238032,"F":140.0910163125,"G":3063.3963239999107,"paid_event_frequency":0.568925},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1161.2352256996421,"EL_M1":1142.3114007000001,"EL_M2":18.923825,"expected_recovery":305.33237714673305,"RC":122.13295085869322,"K":1631.1086975864644,"cK":130.48869580691715,"F":147.97736475,"G":2082.4456494870033,"paid_event_frequency":0.78462},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":502.5407077500026,"EL_M1":482.7870106000001,"EL_M2":19.753697149999997,"expected_recovery":167.1910414241346,"RC":66.87641656965384,"K":729.7669278696237,"cK":58.3813542295699,"F":128.0063788125,"G":1007.739809815635,"paid_event_frequency":0.238405},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1509.1124661500678,"EL_M1":1484.9299661499997,"EL_M2":24.1825,"expected_recovery":229.68735266058798,"RC":91.8749410642352,"K":2061.147807787324,"cK":164.89182462298592,"F":147.98613975,"G":2551.8204954497182,"paid_event_frequency":0.78486},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":754.3883431500168,"EL_M1":742.0320931499999,"EL_M2":12.35625,"expected_recovery":113.94645614210128,"RC":45.578582456840515,"K":1038.1476105802587,"cK":83.0518088464207,"F":147.98869912499998,"G":1374.6765781043707,"paid_event_frequency":0.78493},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1270.7435652500003,"EL_M1":1244.6467179,"EL_M2":26.096847350000004,"expected_recovery":471.89758551318255,"RC":188.75903420527303,"K":1855.9345963301153,"cK":148.4747677064092,"F":129.649680375,"G":2316.8360633822435,"paid_event_frequency":0.28335},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1545.2920150499617,"EL_M1":1509.93701505,"EL_M2":35.355,"expected_recovery":482.9571829526642,"RC":193.1828731810657,"K":2222.0270834693547,"cK":177.76216667754838,"F":140.0924788125,"G":2741.7727116281008,"paid_event_frequency":0.568965},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1159.7845514996436,"EL_M1":1141.1507265,"EL_M2":18.633825,"expected_recovery":305.85569541423286,"RC":122.34227816569314,"K":1653.6504824785866,"cK":132.29203859828692,"F":147.977730375,"G":2083.195464851498,"paid_event_frequency":0.78463},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2602.779391850009,"EL_M1":2544.30939185,"EL_M2":58.47,"expected_recovery":852.4125387316503,"RC":340.96501549266014,"K":3669.2567297721525,"cK":293.5405383817722,"F":140.0910163125,"G":4503.167949382588,"paid_event_frequency":0.568925},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":640.5493125500066,"EL_M1":621.1644091,"EL_M2":19.384903450000003,"expected_recovery":271.62408081350645,"RC":108.64963232540259,"K":981.3647083779495,"cK":78.50917667023596,"F":126.41664131249999,"G":1272.1663504775267,"paid_event_frequency":0.194925},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":869.4305521000394,"EL_M1":849.8656301999999,"EL_M2":19.564921899999998,"expected_recovery":236.68176750282464,"RC":94.67270700112987,"K":1349.5020937628321,"cK":107.96016750102658,"F":140.12099756249998,"G":1616.245898886261,"paid_event_frequency":0.569745},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3488.8670381000106,"EL_M1":3432.078688100001,"EL_M2":56.78835,"expected_recovery":756.9790692358815,"RC":302.7916276943526,"K":5226.532724236931,"cK":418.12261793895453,"F":147.94518975,"G":5810.301964644424,"paid_event_frequency":0.78374},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":332.11631369999697,"EL_M1":318.62221145,"EL_M2":13.49410225,"expected_recovery":91.29719749572837,"RC":36.51887899829135,"K":489.42690850179787,"cK":39.15415268014383,"F":127.924661625,"G":714.285342671243,"paid_event_frequency":0.23617},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":750.0413543500181,"EL_M1":738.74010435,"EL_M2":11.30125,"expected_recovery":96.74871404072042,"RC":38.69948561628817,"K":1019.9633672455589,"cK":81.59706937964471,"F":147.9563413125,"G":1357.7256675446013,"paid_event_frequency":0.784045},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2254.978667850035,"EL_M1":2216.5280428500005,"EL_M2":38.450625,"expected_recovery":292.83237164644856,"RC":117.13294865857944,"K":3065.435020506793,"cK":245.23480164054345,"F":147.9589006875,"G":3687.0737584488775,"paid_event_frequency":0.784115},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":847.292658250022,"EL_M1":829.03185765,"EL_M2":18.2608006,"expected_recovery":261.9411084931793,"RC":104.77644339727172,"K":1260.9409673492455,"cK":100.87527738793965,"F":129.6105585,"G":1576.7399167136446,"paid_event_frequency":0.28228},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":775.5499260000113,"EL_M1":757.6992229000001,"EL_M2":17.8507031,"expected_recovery":203.2591400267445,"RC":81.30365601069781,"K":1195.5445799339616,"cK":95.64356639471693,"F":140.12282568749998,"G":1456.8266321239014,"paid_event_frequency":0.569795},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3486.5631259500087,"EL_M1":3430.64477595,"EL_M2":55.91835,"expected_recovery":760.5694107083114,"RC":304.2277642833246,"K":5302.817567117287,"cK":424.22540536938294,"F":147.94518975,"G":5817.2819804702885,"paid_event_frequency":0.78374},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":1722.226480499985,"EL_M1":1684.7534805,"EL_M2":37.473,"expected_recovery":341.3785970674817,"RC":136.55143882699267,"K":2023.798674576401,"cK":161.9038939661121,"F":140.01533193749998,"G":2880.9295269741197,"paid_event_frequency":0.566855},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":317.6297988999958,"EL_M1":306.97689575000004,"EL_M2":10.652903150000002,"expected_recovery":97.33385010059504,"RC":38.93354004023802,"K":414.5392002172795,"cK":33.16313601738236,"F":126.39872568749999,"G":688.1669341934884,"paid_event_frequency":0.194435},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":2586.4702503500084,"EL_M1":2529.2895003499993,"EL_M2":57.18075,"expected_recovery":512.8957612619924,"RC":205.158304504797,"K":3064.983426528279,"cK":245.1986741222623,"F":140.01533193749998,"G":4235.790081219423,"paid_event_frequency":0.566855},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2308.3922962497913,"EL_M1":2269.5235462499995,"EL_M2":38.86875,"expected_recovery":341.5344259999797,"RC":136.6137703999919,"K":2596.5573037663835,"cK":207.72458430131067,"F":147.89985224999998,"G":3734.1740042681254,"paid_event_frequency":0.7825},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":163.2561442000029,"EL_M1":157.26489800000002,"EL_M2":5.9912462,"expected_recovery":29.471958976997996,"RC":11.788783590799198,"K":184.94565397334617,"cK":14.795652317867694,"F":127.933071,"G":423.6982014782264,"paid_event_frequency":0.2364},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":2252.0156702000345,"EL_M1":2215.2787952000003,"EL_M2":36.736875,"expected_recovery":177.2395393767788,"RC":70.89581575071152,"K":2275.2957446808205,"cK":182.02365957446565,"F":147.91008975,"G":3537.126980366948,"paid_event_frequency":0.78278},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":1495.1652399500663,"EL_M1":1471.96398995,"EL_M2":23.20125,"expected_recovery":48.09609135417804,"RC":19.23843654167122,"K":956.2023987783587,"cK":76.49619190226869,"F":147.8967444375,"G":2318.3954837753417,"paid_event_frequency":0.782415},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":416.77061420001036,"EL_M1":407.08978705,"EL_M2":9.680827149999999,"expected_recovery":25.591022583085135,"RC":10.236409033234054,"K":465.4874908677914,"cK":37.23899926942331,"F":129.558274125,"G":791.7390621702235,"paid_event_frequency":0.28085},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":2300.1767723000085,"EL_M1":2248.2411472999997,"EL_M2":51.935625,"expected_recovery":129.34847097070997,"RC":51.73938838828399,"K":2495.974044024112,"cK":199.67792352192896,"F":139.9922975625,"G":3588.781842363629,"paid_event_frequency":0.566225},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2745.8399257500105,"EL_M1":2709.1871257499997,"EL_M2":36.6528,"expected_recovery":456.87234273369404,"RC":182.74893709347762,"K":3726.0256930158816,"cK":298.08205544127054,"F":155.77578037499998,"G":4509.928931546346,"paid_event_frequency":0.99791},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1078.9789187504023,"EL_M1":1060.9965854,"EL_M2":17.98233335,"expected_recovery":209.2280209031519,"RC":83.69120836126076,"K":1438.4601775261028,"cK":115.07681420208823,"F":147.8887006875,"G":1900.847522668335,"paid_event_frequency":0.782195},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1099.5674569000082,"EL_M1":1070.9211531500002,"EL_M2":28.64630375,"expected_recovery":371.5435306629272,"RC":148.61741226517088,"K":1542.5250791437688,"cK":123.40200633150151,"F":128.7884506875,"G":2000.500434912241,"paid_event_frequency":0.259795},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2159.763693850232,"EL_M1":2123.30561055,"EL_M2":36.4580833,"expected_recovery":418.9472046605431,"RC":167.57888186421724,"K":2885.859838862334,"cK":230.86878710898674,"F":147.888517875,"G":3608.1331742645816,"paid_event_frequency":0.78219},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1373.762481100045,"EL_M1":1355.2264311,"EL_M2":18.53605,"expected_recovery":227.8882399699039,"RC":91.15529598796157,"K":1846.9367982235738,"cK":147.7549438578859,"F":155.7755975625,"G":2357.931091344524,"paid_event_frequency":0.997905},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":609.9979064000041,"EL_M1":591.7438836,"EL_M2":18.2540228,"expected_recovery":142.56197923825715,"RC":57.024791695302866,"K":785.1188400234012,"cK":62.809507201872094,"F":130.220421,"G":1146.7368350629054,"paid_event_frequency":0.29896},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1821.442257250002,"EL_M1":1799.7822572500006,"EL_M2":21.66,"expected_recovery":194.19244175406902,"RC":77.67697670162761,"K":2185.64742568086,"cK":174.85179405446883,"F":155.78748037499997,"G":2973.0113445081315,"paid_event_frequency":0.99823},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1821.445615800001,"EL_M1":1797.9606158,"EL_M2":23.485,"expected_recovery":195.210770142073,"RC":78.0843080568292,"K":2188.9597518979126,"cK":175.116780151833,"F":155.78583506249998,"G":2973.9100520948846,"paid_event_frequency":0.998185},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":932.0430451999849,"EL_M1":915.47434265,"EL_M2":16.568702549999998,"expected_recovery":237.44588306340177,"RC":94.9783532253607,"K":1204.805457214747,"cK":96.38443657717977,"F":131.9792600625,"G":1673.8467934200337,"paid_event_frequency":0.347065},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":974.701762750255,"EL_M1":958.6128877499998,"EL_M2":16.088875,"expected_recovery":189.37918234271035,"RC":75.75167293708414,"K":1171.299683438363,"cK":93.70397467506903,"F":147.9329413125,"G":1722.787135566544,"paid_event_frequency":0.783405},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":4144.5993845500925,"EL_M1":4089.671859550001,"EL_M2":54.927525,"expected_recovery":720.843280167674,"RC":288.3373120670696,"K":5015.495038056577,"cK":401.2396030445262,"F":155.839399125,"G":6653.354265048918,"paid_event_frequency":0.99965},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":2171.910182700215,"EL_M1":2135.9657139499996,"EL_M2":35.94446875,"expected_recovery":450.420933426082,"RC":180.16837337043282,"K":2598.041044591413,"cK":207.84328356731305,"F":147.9298335,"G":3610.4688975172808,"paid_event_frequency":0.78332},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":369.4176347499742,"EL_M1":359.8688667499999,"EL_M2":9.548767999999999,"expected_recovery":126.84788287049247,"RC":50.73915314819699,"K":478.384546399839,"cK":38.27076371198712,"F":128.8429288125,"G":783.027307230211,"paid_event_frequency":0.261285},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":3261.527151000086,"EL_M1":3206.8410885000003,"EL_M2":54.6860625,"expected_recovery":676.353333560864,"RC":270.5413334243456,"K":3901.6527708481453,"cK":312.13222166785164,"F":147.9298335,"G":5322.840719456378,"paid_event_frequency":0.78332},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":2753.1734135000193,"EL_M1":2716.091051000001,"EL_M2":37.0823625,"expected_recovery":141.45489800287442,"RC":56.58195920114977,"K":2580.585973524593,"cK":206.44687788196745,"F":155.9353756875,"G":4229.516835027515,"paid_event_frequency":1.002275},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":204.4302989999994,"EL_M1":198.77763984999996,"EL_M2":5.652659150000001,"expected_recovery":22.3236483690155,"RC":8.929459347606201,"K":204.51605291115743,"cK":16.361284232892594,"F":130.312924125,"G":480.04528894066425,"paid_event_frequency":0.30149},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":2740.098686850054,"EL_M1":2706.26618685,"EL_M2":33.8325,"expected_recovery":123.7343973894217,"RC":49.49375895576868,"K":2317.155193329562,"cK":185.37241546636494,"F":155.94725849999998,"G":4174.549493029584,"paid_event_frequency":1.0026},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":1824.6791765499963,"EL_M1":1802.84792655,"EL_M2":21.83125,"expected_recovery":81.81044769795085,"RC":32.72417907918034,"K":1578.4378337033777,"cK":126.27502669627022,"F":155.946161625,"G":2852.8327252672625,"paid_event_frequency":1.00257},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":933.384312449993,"EL_M1":916.2004377499999,"EL_M2":17.1838747,"expected_recovery":36.1017513968651,"RC":14.44070055874604,"K":1031.7273207970027,"cK":82.53818566376022,"F":131.9441600625,"G":1549.743144979999,"paid_event_frequency":0.346105},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1954.5366822500723,"EL_M1":1921.44383335,"EL_M2":33.0928489,"expected_recovery":56.386319495007,"RC":22.554527798002802,"K":1635.8028373051168,"cK":130.86422698440936,"F":147.956524125,"G":3007.8826148766457,"paid_event_frequency":0.78405},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":2938.6680047999607,"EL_M1":2899.7621590500003,"EL_M2":38.90584575,"expected_recovery":693.7304496751121,"RC":277.4921798700449,"K":4755.441379252884,"cK":380.4353103402307,"F":149.12835224999998,"G":4994.298463013648,"paid_event_frequency":0.8161},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1176.8442280000897,"EL_M1":1157.76400925,"EL_M2":19.08021875,"expected_recovery":327.2582093191909,"RC":130.90328372767635,"K":1960.009612008543,"cK":156.80076896068343,"F":141.22591631249998,"G":2141.0322626679326,"paid_event_frequency":0.599965},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1348.9672511500037,"EL_M1":1317.0688914,"EL_M2":31.898359749999997,"expected_recovery":536.5329232198004,"RC":214.6131692879202,"K":2379.2062294117904,"cK":190.33649835294324,"F":127.4389288125,"G":2508.474463471156,"paid_event_frequency":0.222885},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":2352.7297433000695,"EL_M1":2314.8329933000005,"EL_M2":37.89675,"expected_recovery":654.5440447955252,"RC":261.8176179182101,"K":3927.365756931513,"cK":314.189260554521,"F":141.2262819375,"G":4093.283871613734,"paid_event_frequency":0.599975},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1469.9793618496988,"EL_M1":1450.5500244499997,"EL_M2":19.4293374,"expected_recovery":345.91561717557033,"RC":138.36624687022814,"K":2365.6430429474094,"cK":189.25144343579277,"F":149.1274381875,"G":2595.6326537909595,"paid_event_frequency":0.816075},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":582.4620406500023,"EL_M1":564.79609525,"EL_M2":17.665945400000002,"expected_recovery":192.4641708141487,"RC":76.98566832565949,"K":855.742203166003,"cK":68.45937625328024,"F":128.43050381249998,"G":1141.783452055256,"paid_event_frequency":0.250005},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1660.0920240500277,"EL_M1":1636.58677405,"EL_M2":23.50525,"expected_recovery":279.47684898703005,"RC":111.79073959481202,"K":2306.928407078186,"cK":184.55427256625487,"F":149.157236625,"G":2807.459030448126,"paid_event_frequency":0.81689},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1659.578243950034,"EL_M1":1636.3611521999999,"EL_M2":23.217091749999998,"expected_recovery":279.140652656735,"RC":111.65626106269401,"K":2293.4814736923445,"cK":183.47851789538757,"F":149.15668818749998,"G":2805.159614794154,"paid_event_frequency":0.816875},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1062.4896697000327,"EL_M1":1043.29584215,"EL_M2":19.193827549999998,"expected_recovery":354.65129537080145,"RC":141.86051814832058,"K":1562.5150825533628,"cK":125.00120660426903,"F":130.5407085,"G":1946.5228039368296,"paid_event_frequency":0.30772},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1037.9261179500575,"EL_M1":1020.3352429499998,"EL_M2":17.590875,"expected_recovery":322.170364235787,"RC":128.86814569431482,"K":1541.8047496224979,"cK":123.34437996979983,"F":141.2877069375,"G":1908.5684674022293,"paid_event_frequency":0.601655},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4441.396431300007,"EL_M1":4382.7630813,"EL_M2":58.63335,"expected_recovery":1179.2794955975196,"RC":471.71179823900786,"K":6401.924996682731,"cK":512.1539997346185,"F":149.14590224999998,"G":7432.544175364846,"paid_event_frequency":0.81658},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2373.95368680007,"EL_M1":2335.6986868,"EL_M2":38.255,"expected_recovery":755.7761872456981,"RC":302.31047489827927,"K":3492.167802107051,"cK":279.3734241685641,"F":141.282405375,"G":4129.226654989218,"paid_event_frequency":0.60151},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":452.1587733999954,"EL_M1":441.52208795000007,"EL_M2":10.636685450000002,"expected_recovery":192.48857232785025,"RC":76.99542893114011,"K":665.2799449572487,"cK":53.2223955965799,"F":127.48956787499999,"G":946.4882210702873,"paid_event_frequency":0.22427},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":3562.435672050006,"EL_M1":3505.4543283000003,"EL_M2":56.98134375,"expected_recovery":1133.7157702278646,"RC":453.4863080911459,"K":5235.999110078401,"cK":418.87992880627206,"F":141.282771,"G":6101.446239929898,"paid_event_frequency":0.60152},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":2958.722352849986,"EL_M1":2919.6822945,"EL_M2":39.04005835,"expected_recovery":184.58406558096613,"RC":73.83362623238645,"K":3247.717257343092,"cK":259.81738058744736,"F":149.2338350625,"G":4588.809592976426,"paid_event_frequency":0.818985},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":195.44673335000257,"EL_M1":189.76577915000001,"EL_M2":5.6809541999999995,"expected_recovery":30.525868153177896,"RC":12.21034726127116,"K":261.60533524850837,"cK":20.92842681988067,"F":128.471636625,"G":476.0761920748725,"paid_event_frequency":0.25113},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":2507.5898735500323,"EL_M1":2469.5404985500004,"EL_M2":38.049375,"expected_recovery":188.29041712031494,"RC":75.31616684812597,"K":2774.276888048223,"cK":221.94215104385785,"F":149.26143975,"G":3938.8128415893552,"paid_event_frequency":0.81974},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1668.7745133000308,"EL_M1":1645.4720133,"EL_M2":23.3025,"expected_recovery":123.21236730375472,"RC":49.28494692150189,"K":1844.9932877727326,"cK":147.59946302181862,"F":149.26052568749998,"G":2686.5592652411347,"paid_event_frequency":0.819715},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":1053.9460473000272,"EL_M1":1034.8833533000002,"EL_M2":19.062694,"expected_recovery":36.61802575675017,"RC":14.647210302700069,"K":1242.0855845342899,"cK":99.3668467627432,"F":130.4681319375,"G":1731.2376484039607,"paid_event_frequency":0.305735},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":2063.043347250023,"EL_M1":2028.1635347499996,"EL_M2":34.8798125,"expected_recovery":56.605189254029256,"RC":22.642075701611702,"K":2049.566197713465,"cK":163.96529581707722,"F":141.2500475625,"G":3187.8676884416163,"paid_event_frequency":0.600625},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2044.6571046500387,"EL_M1":2006.0350671499998,"EL_M2":38.6220375,"expected_recovery":431.36290666716263,"RC":172.54516266686505,"K":3541.8397114623554,"cK":283.3471769169884,"F":139.980049125,"G":3520.7059911451893,"paid_event_frequency":0.56589},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":858.3106113500331,"EL_M1":838.3700488499999,"EL_M2":19.9405625,"expected_recovery":190.170512133256,"RC":76.0682048533024,"K":1425.1302494383092,"cK":114.01041995506473,"F":139.983705375,"G":1584.497255377867,"paid_event_frequency":0.56599},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":954.305753149998,"EL_M1":922.5937733499999,"EL_M2":31.711979799999998,"expected_recovery":358.07336101496753,"RC":143.229344405987,"K":1529.9467136981013,"cK":122.3957370958481,"F":126.40512412499999,"G":1795.1146117024439,"paid_event_frequency":0.19461},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":1717.8467008499902,"EL_M1":1677.4169508500004,"EL_M2":40.42975,"expected_recovery":380.66538328243814,"RC":152.26615331297526,"K":2846.8244459338,"cK":227.745955674704,"F":139.98352256249999,"G":2983.7897765335597,"paid_event_frequency":0.565985},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1024.3072010000656,"EL_M1":1004.73185725,"EL_M2":19.57534375,"expected_recovery":215.23651112144864,"RC":86.09460444857946,"K":1765.2834048238888,"cK":141.2226723859111,"F":139.98023193749998,"G":1855.4729463627416,"paid_event_frequency":0.565895},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":439.88214600000254,"EL_M1":420.7162626500001,"EL_M2":19.165883350000005,"expected_recovery":118.6331211807514,"RC":47.453248472300565,"K":675.331569791791,"cK":54.026525583343286,"F":125.6217725625,"G":889.3115901575285,"paid_event_frequency":0.173185},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1135.1500878499874,"EL_M1":1112.3588378499999,"EL_M2":22.79125,"expected_recovery":145.69852768822454,"RC":58.27941107528982,"K":1765.9362468020654,"cK":141.27489974416523,"F":140.09229599999998,"G":1966.3955928925898,"paid_event_frequency":0.56896},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":568.801343150001,"EL_M1":556.06259315,"EL_M2":12.73875,"expected_recovery":68.94815175805292,"RC":27.579260703221166,"K":890.9146292111504,"cK":71.27317033689204,"F":140.0961350625,"G":1076.9998790034856,"paid_event_frequency":0.569065},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":1056.3014363499915,"EL_M1":1027.5824987,"EL_M2":28.71893765,"expected_recovery":279.86316840753113,"RC":111.94526736301246,"K":1819.3073720947928,"cK":145.54458976758343,"F":126.97915537499999,"G":1921.027265140783,"paid_event_frequency":0.21031},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1542.2792783999505,"EL_M1":1505.1494033999998,"EL_M2":37.129875,"expected_recovery":253.0380398766456,"RC":101.21521595065825,"K":2440.1441907963945,"cK":195.21153526371157,"F":140.09156475,"G":2638.39679248576,"paid_event_frequency":0.56894},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2063.941929900035,"EL_M1":2025.2619298999991,"EL_M2":38.68,"expected_recovery":324.4323608959303,"RC":129.77294435837211,"K":3358.901292040981,"cK":268.71210336327846,"F":140.085349125,"G":3470.0164356622477,"paid_event_frequency":0.56877},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":1727.2871729499811,"EL_M1":1688.2471729500003,"EL_M2":39.04,"expected_recovery":187.19031481650904,"RC":74.87612592660362,"K":2579.28752473277,"cK":206.34300197862163,"F":140.0774881875,"G":2864.778385390275,"paid_event_frequency":0.568555},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":319.12114859999394,"EL_M1":308.4175738,"EL_M2":10.703574799999997,"expected_recovery":53.3293401091471,"RC":21.33173604365884,"K":561.2953603232573,"cK":44.90362882586059,"F":126.44442881249999,"G":682.4012563760178,"paid_event_frequency":0.195685},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":2590.812441250009,"EL_M1":2532.9124412499996,"EL_M2":57.9,"expected_recovery":280.491427535349,"RC":112.1965710141396,"K":3876.003916298527,"cK":310.0803133038822,"F":140.0774881875,"G":4204.222418340708,"paid_event_frequency":0.568555},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":2066.801038050039,"EL_M1":2027.6115866500002,"EL_M2":39.1894514,"expected_recovery":50.680814473989585,"RC":20.272325789595836,"K":1278.6482854825188,"cK":102.2918628386015,"F":140.08406943749998,"G":3105.932394820982,"paid_event_frequency":0.568735},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":295.16749350000106,"EL_M1":282.21063445000004,"EL_M2":12.956859050000002,"expected_recovery":67.40933347708301,"RC":26.963733390833205,"K":490.8444088646955,"cK":39.26755270917564,"F":125.6296335,"G":649.3712174666799,"paid_event_frequency":0.1734},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":567.2490434499992,"EL_M1":553.9946684499998,"EL_M2":13.254375,"expected_recovery":61.70190903291547,"RC":24.68076361316619,"K":925.937986949536,"cK":74.07503895596288,"F":140.0323335,"G":1074.7162393588378,"paid_event_frequency":0.56732},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":1695.2011516000177,"EL_M1":1659.6661516,"EL_M2":35.535,"expected_recovery":200.63513042172872,"RC":80.25405216869149,"K":2768.07134569319,"cK":221.44570765545518,"F":140.03178506249998,"G":2849.2435953155527,"paid_event_frequency":0.567305},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":710.8666481500014,"EL_M1":692.0052052499999,"EL_M2":18.8614429,"expected_recovery":141.60534167625576,"RC":56.64213667050231,"K":1130.7916997822929,"cK":90.46333598258343,"F":127.02047099999999,"G":1313.3234557374496,"paid_event_frequency":0.21144},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":1537.269548849957,"EL_M1":1501.5427988500003,"EL_M2":35.72675,"expected_recovery":233.1681187167178,"RC":93.26724748668713,"K":2577.8750568617224,"cK":206.2300045489378,"F":140.08699443749998,"G":2635.805060430776,"paid_event_frequency":0.568815},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":1032.6664776000662,"EL_M1":1012.9970276000003,"EL_M2":19.66945,"expected_recovery":138.57323342152597,"RC":55.42929336861039,"K":1807.4674108105787,"cK":144.5973928648463,"F":140.08571475,"G":1830.371838111364,"paid_event_frequency":0.56878},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":2590.7152102000055,"EL_M1":2531.3857102,"EL_M2":59.3295,"expected_recovery":399.3001914312531,"RC":159.72007657250126,"K":4386.277456936716,"cK":350.90219655493723,"F":140.0851663125,"G":4321.896866186592,"paid_event_frequency":0.568765},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":628.6708613000052,"EL_M1":606.56069305,"EL_M2":22.11016825,"expected_recovery":63.9500458338174,"RC":25.58001833352696,"K":869.1143325917069,"cK":69.52914660733656,"F":126.40110225,"G":1133.5748379878248,"paid_event_frequency":0.1945},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":1710.1132637999747,"EL_M1":1671.2270763000004,"EL_M2":38.8861875,"expected_recovery":88.73005240211023,"RC":35.492020960844094,"K":2052.1317164597895,"cK":164.17053731678317,"F":140.0127725625,"G":2733.051459520136,"paid_event_frequency":0.566785},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":2065.156888400042,"EL_M1":2026.037488399999,"EL_M2":39.1194,"expected_recovery":43.3769688854793,"RC":17.350787554191722,"K":1400.9387133565785,"cK":112.07509706852629,"F":140.0588413125,"G":3112.855485780347,"paid_event_frequency":0.568045},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":298.2225993000001,"EL_M1":284.6627020500001,"EL_M2":13.55989725,"expected_recovery":47.21998247695231,"RC":18.887992990780926,"K":496.17545488360736,"cK":39.69403639068859,"F":125.60605068749999,"G":643.2142391586261,"paid_event_frequency":0.172755},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":1136.1971244499832,"EL_M1":1109.9018744500002,"EL_M2":26.29525,"expected_recovery":93.23651600103176,"RC":37.294606400412704,"K":1705.3322526492457,"cK":136.42658021193967,"F":139.984436625,"G":1933.203663583114,"paid_event_frequency":0.56601},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":1134.1629661499817,"EL_M1":1109.11796615,"EL_M2":25.045,"expected_recovery":75.36531375944901,"RC":30.146125503779604,"K":1810.7517606601896,"cK":144.86014085281516,"F":140.10308193749998,"G":1932.3630859254354,"paid_event_frequency":0.569255},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":697.7703703500044,"EL_M1":678.1642738499999,"EL_M2":19.606096500000003,"expected_recovery":34.774869004396464,"RC":13.909947601758587,"K":722.7344576199449,"cK":57.818756609595596,"F":126.963067875,"G":1195.2828565818115,"paid_event_frequency":0.20987},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1531.1409540499576,"EL_M1":1494.4959540499997,"EL_M2":36.645,"expected_recovery":23.51835866133115,"RC":9.40734346453246,"K":1202.6565928733398,"cK":96.2125274298672,"F":140.068896,"G":2369.1062945924764,"paid_event_frequency":0.56832}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":152678.47446785003,"expected_recovery":27557.552403999995,"reinsurance_premium":38580.57336559999,"RC":11023.020961599992,"mean_net":125120.92206385,"net_TVaR":328795.25704,"net_VaR":297490.93,"K":203674.33497615,"cK":16293.946798092002,"F":13996.4237671875,"G":258655.82132630597,"average_premium":2586.5582132630598,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.518965,"tail_reduction":0.3691587595033423},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.1,"m2_frequency_scale":0.2,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"m2High":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":4430.798249601087,"EL_M1":2273.67731035,"EL_M2":2157.12093925,"expected_recovery":2353.9005765048037,"RC":941.5602306019215,"K":3218.8461145644455,"cK":257.5076891651556,"F":152.13196162499997,"G":7709.330841324219,"paid_event_frequency":0.89825},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1919.1376348999804,"EL_M1":843.55653845,"EL_M2":1075.58109645,"expected_recovery":1097.831012787346,"RC":439.1324051149384,"K":1418.4266410182076,"cK":113.47413128145661,"F":144.173767875,"G":3487.890585561834,"paid_event_frequency":0.68059},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2690.0297871499915,"EL_M1":915.96948575,"EL_M2":1774.0603013999998,"expected_recovery":1934.7437309769175,"RC":773.8974923907671,"K":1603.3572472035412,"cK":128.2685797762833,"F":130.15972725,"G":4963.140782089389,"paid_event_frequency":0.2973},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":3837.5946106498213,"EL_M1":1686.0539545000001,"EL_M2":2151.54065615,"expected_recovery":2194.729746418244,"RC":877.8918985672976,"K":2802.680734808894,"cK":224.21445878471152,"F":144.1743163125,"G":6778.500379085774,"paid_event_frequency":0.680605},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":2216.5210199502026,"EL_M1":1136.8494333,"EL_M2":1079.6715866499997,"expected_recovery":1176.3470523074818,"RC":470.5388209229927,"K":1625.6209774416573,"cK":130.04967819533258,"F":152.1330585,"G":3958.9901034247036,"paid_event_frequency":0.89828},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1560.8789134000003,"EL_M1":468.63590074999996,"EL_M2":1092.24301265,"expected_recovery":1008.6341513407547,"RC":403.45366053630187,"K":1043.3179071313484,"cK":83.46543257050787,"F":130.71255225,"G":2904.68074500908,"paid_event_frequency":0.31242},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2869.0752661499687,"EL_M1":1475.4430790000004,"EL_M2":1393.63218715,"expected_recovery":1349.6893346274203,"RC":539.8757338509681,"K":2181.910113458285,"cK":174.5528090766628,"F":152.257371,"G":4981.014906770133,"paid_event_frequency":0.90168},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1433.3316034999418,"EL_M1":737.3068519000001,"EL_M2":696.0247516,"expected_recovery":642.9621655951846,"RC":257.1848662380739,"K":1099.0899507651768,"cK":87.92719606121415,"F":152.23561631249999,"G":2574.23904281564,"paid_event_frequency":0.901085},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2835.8298507499985,"EL_M1":1225.3422451000001,"EL_M2":1610.48760565,"expected_recovery":1780.5796640784713,"RC":712.2318656313886,"K":1941.4342327387242,"cK":155.31473861909794,"F":133.1386569375,"G":5115.353482583981,"paid_event_frequency":0.378775},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":3473.0215256999154,"EL_M1":1500.9845048999998,"EL_M2":1972.0370208,"expected_recovery":1978.9467046047432,"RC":791.5786818418974,"K":2574.09640975601,"cK":205.9277127804808,"F":144.2032006875,"G":6152.974828013058,"paid_event_frequency":0.681395},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":2215.3996235002005,"EL_M1":1136.8391542,"EL_M2":1078.5604693,"expected_recovery":1176.9502876485828,"RC":470.7801150594332,"K":1609.423222055461,"cK":128.7538577644369,"F":152.13196162499997,"G":3956.0874105987605,"paid_event_frequency":0.89825},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":5757.4131109499895,"EL_M1":2530.6698219999994,"EL_M2":3226.7432889500005,"expected_recovery":3293.4930374476785,"RC":1317.3972149790716,"K":4255.27989269552,"cK":340.42239141564164,"F":144.173767875,"G":10079.208646959603,"paid_event_frequency":0.68059},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1806.5105788499995,"EL_M1":623.7417208,"EL_M2":1182.7688580499998,"expected_recovery":1239.5533428817002,"RC":495.82133715268014,"K":1165.3912517849901,"cK":93.23130014279921,"F":130.21237725,"G":3367.7007911939713,"paid_event_frequency":0.29874},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1924.8434398999873,"EL_M1":849.27595695,"EL_M2":1075.5674829499999,"expected_recovery":1053.4737429398165,"RC":421.38949717592664,"K":1396.880717680527,"cK":111.75045741444215,"F":144.2668194375,"G":3469.6669519038082,"paid_event_frequency":0.683135},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":6669.944270249954,"EL_M1":3431.9006510500003,"EL_M2":3238.0436191999997,"expected_recovery":3382.8976785035597,"RC":1353.159071401424,"K":4849.087516470498,"cK":387.9270013176398,"F":152.17327724999998,"G":11417.60482695869,"paid_event_frequency":0.89938},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1035.8355045500002,"EL_M1":318.33204019999994,"EL_M2":717.5034643499997,"expected_recovery":649.1402714961099,"RC":259.65610859844395,"K":781.0149036613951,"cK":62.48119229291161,"F":130.6809256875,"G":1984.871641505141,"paid_event_frequency":0.311555},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1441.0692053499492,"EL_M1":741.4650887499998,"EL_M2":699.6041166,"expected_recovery":660.4957979211254,"RC":264.19831916845015,"K":1049.8901056866227,"cK":83.99120845492982,"F":152.2988694375,"G":2588.7434698811053,"paid_event_frequency":0.902815},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":4285.280336000038,"EL_M1":2222.340678649999,"EL_M2":2062.93965735,"expected_recovery":1875.8646271313373,"RC":750.345850852535,"K":3305.118598009137,"cK":264.40948784073095,"F":152.2853413125,"G":7269.761354674406,"paid_event_frequency":0.902445},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1897.050862550013,"EL_M1":825.1839712999999,"EL_M2":1071.8668912499998,"expected_recovery":1136.705329664439,"RC":454.6821318657756,"K":1375.0176018087188,"cK":110.0014081446975,"F":133.1386569375,"G":3459.830745997315,"paid_event_frequency":0.378775},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1736.555449500025,"EL_M1":755.2071186999999,"EL_M2":981.3483308,"expected_recovery":948.8940618713722,"RC":379.5576247485489,"K":1278.9459818429527,"cK":102.31567854743622,"F":144.302467875,"G":3150.308294228013,"paid_event_frequency":0.68411},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":6664.451466849942,"EL_M1":3429.7947392,"EL_M2":3234.65672765,"expected_recovery":3385.3271242330297,"RC":1354.130849693212,"K":4863.3282753358835,"cK":389.0662620268707,"F":152.1719975625,"G":11413.094101510032,"paid_event_frequency":0.899345},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":3846.619234749853,"EL_M1":1686.9199680499994,"EL_M2":2159.6992667,"expected_recovery":2089.2200398676077,"RC":835.6880159470431,"K":2113.592190616165,"cK":169.08737524929322,"F":144.29844599999998,"G":6660.924095928253,"paid_event_frequency":0.684},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":890.8764779500061,"EL_M1":307.2897496,"EL_M2":583.58672835,"expected_recovery":543.8481128057456,"RC":217.53924512229824,"K":565.7705676109815,"cK":45.26164540887852,"F":130.20104287499998,"G":1711.837881808244,"paid_event_frequency":0.29843},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":5765.094962049975,"EL_M1":2529.3024892999997,"EL_M2":3235.79247275,"expected_recovery":3131.885446859914,"RC":1252.7541787439657,"K":3197.5464555305916,"cK":255.80371644244732,"F":144.2971663125,"G":9890.600031398519,"paid_event_frequency":0.683965},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":4423.06598500115,"EL_M1":2275.7827906499992,"EL_M2":2147.2831943500005,"expected_recovery":1969.7714309848616,"RC":787.9085723939447,"K":2811.5197744259995,"cK":224.92158195407995,"F":152.1358006875,"G":7450.709253382232,"paid_event_frequency":0.898355},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":522.5138439000058,"EL_M1":158.52182979999998,"EL_M2":363.99201410000006,"expected_recovery":326.41501321202827,"RC":130.56600528481133,"K":302.26866473759105,"cK":24.181493179007283,"F":130.72132725,"G":1077.3102261517658,"paid_event_frequency":0.31266},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":4290.769642550039,"EL_M1":2227.7804315,"EL_M2":2062.98921105,"expected_recovery":1750.52372213457,"RC":700.2094888538281,"K":2723.8813151897007,"cK":217.91050521517604,"F":152.2549944375,"G":7148.192841408723,"paid_event_frequency":0.901615},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":2861.420096299949,"EL_M1":1475.36481585,"EL_M2":1386.05528045,"expected_recovery":1168.2891930603835,"RC":467.31567722415343,"K":1435.135962383137,"cK":114.81087699065097,"F":152.27967412499999,"G":4794.435099519671,"paid_event_frequency":0.90229},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":939.846459949982,"EL_M1":410.67980075,"EL_M2":529.1666591999999,"expected_recovery":431.1979357558664,"RC":172.47917430234656,"K":656.6228109910838,"cK":52.52982487928671,"F":133.157486625,"G":1730.6839276754872,"paid_event_frequency":0.37929},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":5217.399801350007,"EL_M1":2257.53180315,"EL_M2":2959.8679982,"expected_recovery":2532.8108348386945,"RC":1013.1243339354778,"K":3092.069403739593,"cK":247.36555229916743,"F":144.3174585,"G":8829.60952811287,"paid_event_frequency":0.68452},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":4864.347464899818,"EL_M1":2721.8199406500007,"EL_M2":2142.52752425,"expected_recovery":1940.692971877987,"RC":776.2771887511949,"K":3882.9149464788547,"cK":310.6331957183084,"F":160.1521288125,"G":8148.546637575763,"paid_event_frequency":1.117605},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":2138.8829754497683,"EL_M1":1065.9922477500002,"EL_M2":1072.8907276999998,"expected_recovery":945.5719688113979,"RC":378.2287875245592,"K":1712.0061247058254,"cK":136.96048997646605,"F":152.15499599999998,"G":3741.636331934391,"paid_event_frequency":0.89888},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":2832.1106329499953,"EL_M1":1077.9506189999997,"EL_M2":1754.1600139500001,"expected_recovery":1628.7269115322579,"RC":651.4907646129031,"K":2218.3373356872185,"cK":177.46698685497748,"F":132.62696474999998,"G":5058.260465557168,"paid_event_frequency":0.36478},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":4278.488037298586,"EL_M1":2131.9077342999994,"EL_M2":2146.5803029999997,"expected_recovery":1893.6988834369072,"RC":757.4795533747629,"K":3386.035645588276,"cK":270.88285164706207,"F":152.151705375,"G":7278.6695302605485,"paid_event_frequency":0.89879},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":2434.1128332999338,"EL_M1":1361.87966575,"EL_M2":1072.2331675499997,"expected_recovery":968.6696405016069,"RC":387.46785620064276,"K":1967.5409735179683,"cK":157.40327788143748,"F":160.1506663125,"G":4185.512844926019,"paid_event_frequency":1.117565},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1679.8967358500033,"EL_M1":593.7383020499998,"EL_M2":1086.1584338,"expected_recovery":918.3356731860183,"RC":367.33426927440735,"K":1309.8033967933584,"cK":104.78427174346868,"F":133.089480375,"G":3046.8063429905064,"paid_event_frequency":0.37743},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3185.1383528999804,"EL_M1":1811.1188194,"EL_M2":1374.0195335000003,"expected_recovery":1154.4585306759866,"RC":461.78341227039465,"K":2582.8330283357054,"cK":206.62664226685644,"F":160.28448506249998,"G":5351.777189999642,"paid_event_frequency":1.121225},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3197.702617749976,"EL_M1":1810.0733447,"EL_M2":1387.6292730500002,"expected_recovery":1164.4089477243745,"RC":465.7635790897498,"K":2542.7224749724965,"cK":203.4177979977997,"F":160.3071538125,"G":5369.588198200035,"paid_event_frequency":1.121845},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":1977.9871393000296,"EL_M1":920.4772063500002,"EL_M2":1057.50993295,"expected_recovery":999.7989761507316,"RC":399.9195904602927,"K":1522.496887892402,"cK":121.79975103139215,"F":135.43752412499998,"G":3513.5253398889527,"paid_event_frequency":0.44165},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":1935.0699981499072,"EL_M1":958.0042155,"EL_M2":977.06578265,"expected_recovery":858.6792975575636,"RC":343.47171902302546,"K":1467.149167052857,"cK":117.37193336422855,"F":152.070536625,"G":3397.312249549548,"paid_event_frequency":0.89657},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":7290.457630599388,"EL_M1":4076.9244132499994,"EL_M2":3213.53321735,"expected_recovery":2940.084688914805,"RC":1176.033875565922,"K":5708.3224024892415,"cK":456.66579219913933,"F":159.8662100625,"G":12110.698011235932,"paid_event_frequency":1.109785},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":4278.2476248485755,"EL_M1":2132.40750415,"EL_M2":2145.8401206999997,"expected_recovery":1920.0135833735508,"RC":768.0054333494204,"K":3259.740612823002,"cK":260.77924902584016,"F":152.042017875,"G":7278.765766798447,"paid_event_frequency":0.89579},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":946.0524408500573,"EL_M1":361.27933675,"EL_M2":584.7731041,"expected_recovery":546.0372686042992,"RC":218.41490744171972,"K":710.3722968325978,"cK":56.82978374660783,"F":132.575046,"G":1805.1629040511796,"paid_event_frequency":0.36336},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":6415.843630749718,"EL_M1":3196.32906595,"EL_M2":3219.5145648000002,"expected_recovery":2883.077924526348,"RC":1153.2311698105393,"K":4881.39253160113,"cK":390.5114025280904,"F":152.03927568749998,"G":10815.500638367796,"paid_event_frequency":0.895715},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":4870.125006149843,"EL_M1":2726.4430352,"EL_M2":2143.6819709499996,"expected_recovery":1625.9971796050463,"RC":650.3988718420186,"K":3053.993474462363,"cK":244.31947795698903,"F":160.0435381875,"G":7899.849192181802,"paid_event_frequency":1.114635},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":559.0517818500014,"EL_M1":198.23972550000002,"EL_M2":360.81205635,"expected_recovery":276.59424011456866,"RC":110.63769604582747,"K":364.56651695162526,"cK":29.165321356130022,"F":133.035367875,"G":1109.1868895026118,"paid_event_frequency":0.37595},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":4789.975013750059,"EL_M1":2713.058882,"EL_M2":2076.9161317499997,"expected_recovery":1587.2587281058854,"RC":634.9034912423542,"K":2958.7194765961326,"cK":236.69755812769063,"F":160.1854006875,"G":7762.3486184101375,"paid_event_frequency":1.118515},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":3189.852900249985,"EL_M1":1809.0438401,"EL_M2":1380.80906015,"expected_recovery":1042.7902233207956,"RC":417.11608932831825,"K":2001.968609839043,"cK":160.15748878712344,"F":160.195821,"G":5236.429732487235,"paid_event_frequency":1.1188},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1976.8044333000043,"EL_M1":919.16578245,"EL_M2":1057.63865085,"expected_recovery":793.8308463278183,"RC":317.5323385311274,"K":1218.364782128638,"cK":97.46918257029104,"F":135.523080375,"G":3369.772046368564,"paid_event_frequency":0.44399},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":3874.0657242491347,"EL_M1":1911.2540938999998,"EL_M2":1962.8116303499996,"expected_recovery":1403.643485222296,"RC":561.4573940889185,"K":2098.811497321097,"cK":167.90491978568775,"F":152.0692569375,"G":6340.663060081653,"paid_event_frequency":0.896535},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":5053.9668915013035,"EL_M1":2912.5717159999995,"EL_M2":2141.3951755000003,"expected_recovery":2174.583103371729,"RC":869.8332413486917,"K":4748.75032834535,"cK":379.900026267628,"F":153.3789256875,"G":8609.438779740163,"paid_event_frequency":0.932355},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":2232.3043321999426,"EL_M1":1162.3730648,"EL_M2":1069.9312673999998,"expected_recovery":1061.5380406291385,"RC":424.61521625165545,"K":2067.95985381827,"cK":165.4367883054616,"F":145.4598538125,"G":3957.0882540927464,"paid_event_frequency":0.715765},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":3066.820711099995,"EL_M1":1318.2558399499999,"EL_M2":1748.56487115,"expected_recovery":1787.0497159985543,"RC":714.8198863994218,"K":2555.7178854010185,"cK":204.45743083208149,"F":131.158249125,"G":5489.675036608664,"paid_event_frequency":0.32461},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":4469.349836749736,"EL_M1":2324.7508467,"EL_M2":2144.5989900500003,"expected_recovery":2129.0084249353486,"RC":851.6033699741395,"K":4114.688691614277,"cK":329.17509532914215,"F":145.4627788125,"G":7727.454774487356,"paid_event_frequency":0.715845},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":2523.2927951503093,"EL_M1":1456.1283802500004,"EL_M2":1067.1644148999999,"expected_recovery":1082.6388762408903,"RC":433.05555049635615,"K":2358.518120731753,"cK":188.68144965854023,"F":153.384592875,"G":4397.885850906941,"paid_event_frequency":0.93251},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1657.5830952000042,"EL_M1":567.02451635,"EL_M2":1090.55857885,"expected_recovery":975.4388058480827,"RC":390.1755223392331,"K":1299.9136531306056,"cK":103.99309225044844,"F":131.20322099999998,"G":3043.9399077195812,"paid_event_frequency":0.32584},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3030.99419455,"EL_M1":1652.9991669000003,"EL_M2":1377.99502765,"expected_recovery":1243.0992417879959,"RC":497.23969671519836,"K":2508.676048978399,"cK":200.69408391827193,"F":153.5551569375,"G":5176.644176161294,"paid_event_frequency":0.937175},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3029.8481599500124,"EL_M1":1653.0030101999998,"EL_M2":1376.84514975,"expected_recovery":1248.5761611570967,"RC":499.4304644628387,"K":2554.1333307772984,"cK":204.33066646218387,"F":153.55972724999998,"G":5182.892024166713,"paid_event_frequency":0.9373},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2090.778791399973,"EL_M1":1034.8013846499998,"EL_M2":1055.97740675,"expected_recovery":1104.6218318332826,"RC":441.84873273331306,"K":1735.579235527532,"cK":138.84633884220258,"F":133.9448600625,"G":3740.558297383985,"paid_event_frequency":0.400825},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1993.3835777499828,"EL_M1":1015.5787672000001,"EL_M2":977.80481055,"expected_recovery":989.0809876139625,"RC":395.63239504558504,"K":1657.924302798991,"cK":132.6339442239193,"F":145.35400537499999,"G":3556.005229859316,"paid_event_frequency":0.71287},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":7585.376490049928,"EL_M1":4373.102194349999,"EL_M2":3212.274295699999,"expected_recovery":3397.6418105254306,"RC":1359.0567242101724,"K":6485.548763531586,"cK":518.8439010825268,"F":153.1387100625,"G":12821.88776720684,"paid_event_frequency":0.925785},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":4474.577955299763,"EL_M1":2335.4714811500003,"EL_M2":2139.10647415,"expected_recovery":2222.9254409457712,"RC":889.1701763783085,"K":3744.537114410053,"cK":299.56296915280427,"F":145.309399125,"G":7744.8273332745,"paid_event_frequency":0.71165},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1025.9627562500157,"EL_M1":443.12463979999995,"EL_M2":582.8381164499999,"expected_recovery":608.7763008992451,"RC":243.51052035969806,"K":833.7422792484988,"cK":66.6993823398799,"F":131.1825631875,"G":1956.473629516125,"paid_event_frequency":0.325275},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":6715.129872249974,"EL_M1":3499.4342709,"EL_M2":3215.69560135,"expected_recovery":3342.6299783713657,"RC":1337.0519913485464,"K":5591.261210574266,"cK":447.30089684594134,"F":145.31488349999998,"G":11526.396858592614,"paid_event_frequency":0.7118},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":5048.878216051376,"EL_M1":2914.2303427500005,"EL_M2":2134.6478732999994,"expected_recovery":1660.0772296408513,"RC":664.0308918563405,"K":3452.733302946235,"cK":276.21866423569884,"F":153.2474835,"G":8189.833674191221,"paid_event_frequency":0.92876},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":550.7810087000043,"EL_M1":191.3174523,"EL_M2":359.4635564000001,"expected_recovery":284.3859422534472,"RC":113.75437690137888,"K":436.1992433354237,"cK":34.8959394668339,"F":131.1949944375,"G":1107.5017593409561,"paid_event_frequency":0.325615},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":4535.8754322000395,"EL_M1":2486.08556565,"EL_M2":2049.78986655,"expected_recovery":1632.5199366917532,"RC":653.0079746767013,"K":3328.8159315174616,"cK":266.30527452139694,"F":153.42152099999998,"G":7478.146936530851,"paid_event_frequency":0.93352},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":3027.6301070999993,"EL_M1":1657.086761,"EL_M2":1370.5433460999998,"expected_recovery":1079.4219226375533,"RC":431.7687690550213,"K":2276.788611000855,"cK":182.1430888800684,"F":153.417499125,"G":5059.945952213452,"paid_event_frequency":0.93341},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":2087.0516777999715,"EL_M1":1035.2997483499998,"EL_M2":1051.75192945,"expected_recovery":786.539118663215,"RC":314.61564746528603,"K":1514.2083921838885,"cK":121.13667137471109,"F":133.97941162499998,"G":3542.377877686625,"paid_event_frequency":0.40177},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":3968.5578194498567,"EL_M1":2020.64052825,"EL_M2":1947.9172911999997,"expected_recovery":1394.427283006176,"RC":557.7709132024704,"K":2821.1444182569217,"cK":225.69155346055373,"F":145.3724694375,"G":6529.857007400507,"paid_event_frequency":0.713375},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":4148.197425649801,"EL_M1":2030.1367654500004,"EL_M2":2118.0606601999993,"expected_recovery":1900.6176616465564,"RC":760.2470646586225,"K":3810.842362213113,"cK":304.8673889770491,"F":144.16481006249998,"G":7143.302252463963,"paid_event_frequency":0.680345},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1915.8355874499873,"EL_M1":849.3657500999998,"EL_M2":1066.4698373499998,"expected_recovery":650.5454286803215,"RC":260.21817147212863,"K":2125.494425788981,"cK":170.0395540631185,"F":144.181446,"G":3320.3663453136455,"paid_event_frequency":0.6808},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":2660.5534046500097,"EL_M1":932.4787702500003,"EL_M2":1728.0746344,"expected_recovery":1578.9546495289608,"RC":631.5818598115843,"K":2355.118210893299,"cK":188.40945687146393,"F":130.1149381875,"G":4814.212879360744,"paid_event_frequency":0.296075},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":3829.8332962998347,"EL_M1":1698.64489315,"EL_M2":2131.1884031499994,"expected_recovery":1302.091362163546,"RC":520.8365448654184,"K":4228.482111960002,"cK":338.27856895680014,"F":144.1770585,"G":6444.167291496072,"paid_event_frequency":0.68068},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":2075.3509883499664,"EL_M1":1015.6947114500002,"EL_M2":1059.6562769,"expected_recovery":949.3256156866419,"RC":379.7302462746568,"K":1891.614554539687,"cK":151.32916436317498,"F":144.1615194375,"G":3667.429224567064,"paid_event_frequency":0.680255},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":1505.09439035,"EL_M1":425.0944418000001,"EL_M2":1079.99994855,"expected_recovery":673.624191039745,"RC":269.449676415898,"K":1686.905671686271,"cK":134.9524537349017,"F":128.3566475625,"G":2717.1375574177328,"paid_event_frequency":0.247985},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2475.1296236000176,"EL_M1":1111.7243481499997,"EL_M2":1363.40527545,"expected_recovery":1094.528722949761,"RC":437.8114891799044,"K":2353.925769976381,"cK":188.3140615981105,"F":144.2269663125,"G":4327.30952092071,"paid_event_frequency":0.682045},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":1237.1969484000347,"EL_M1":554.8464520499999,"EL_M2":682.35049635,"expected_recovery":377.5764058428251,"RC":151.03056233713005,"K":1442.3457400423197,"cK":115.38765920338558,"F":144.2507319375,"G":2197.1545358374,"paid_event_frequency":0.682695},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":2596.1718715000134,"EL_M1":1031.1452504,"EL_M2":1565.0266211,"expected_recovery":1386.1563187536517,"RC":554.4625275014607,"K":2427.2158274637163,"cK":194.1772661970973,"F":130.4293756875,"G":4633.654721181428,"paid_event_frequency":0.304675},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":3450.3296671999287,"EL_M1":1506.6901822499997,"EL_M2":1943.6394849500005,"expected_recovery":1106.5707155759205,"RC":442.62828623036825,"K":3854.4163648357476,"cK":308.3533091868598,"F":144.16316475,"G":5793.965903156209,"paid_event_frequency":0.6803},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":4139.306672549776,"EL_M1":2021.4928664999998,"EL_M2":2117.81380605,"expected_recovery":1782.866865642237,"RC":713.1467462568949,"K":3790.230268219796,"cK":303.2184214575837,"F":144.11325693749998,"G":7066.3801296023385,"paid_event_frequency":0.678935},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":3817.8135262998467,"EL_M1":1693.3244266499994,"EL_M2":2124.48909965,"expected_recovery":1654.131473400922,"RC":661.6525893603689,"K":3121.439798958956,"cK":249.71518391671648,"F":144.2083194375,"G":6497.8528253525765,"paid_event_frequency":0.681535},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":891.3510994000036,"EL_M1":309.8489239,"EL_M2":581.5021755,"expected_recovery":326.6712010522076,"RC":130.66848042088304,"K":1039.366358748111,"cK":83.14930869984889,"F":130.12974599999998,"G":1647.0648460276473,"paid_event_frequency":0.29648},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":5720.067240749992,"EL_M1":2538.13392925,"EL_M2":3181.9333115000004,"expected_recovery":2479.653836172771,"RC":991.8615344691085,"K":4721.823095606842,"cK":377.74584764854734,"F":144.20886787499998,"G":9645.177987656863,"paid_event_frequency":0.68155},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":4140.3550964497845,"EL_M1":2020.71254755,"EL_M2":2119.6425488999994,"expected_recovery":1513.8379721523565,"RC":605.5351888609426,"K":2435.6062996071128,"cK":194.84850396856902,"F":144.176692875,"G":6779.887309539063,"paid_event_frequency":0.68067},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":1011.8879006500034,"EL_M1":279.8331298,"EL_M2":732.05477085,"expected_recovery":509.44698346233747,"RC":203.778793384935,"K":902.7444917009634,"cK":72.21955933607707,"F":128.3175256875,"G":1888.2717054113539,"paid_event_frequency":0.246915},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":1240.1999993000338,"EL_M1":554.9532400499999,"EL_M2":685.24675925,"expected_recovery":260.1031655520353,"RC":104.04126622081412,"K":1422.5509780262264,"cK":113.80407824209811,"F":144.247624125,"G":2136.3906238505947,"paid_event_frequency":0.68261},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":3731.432844700021,"EL_M1":1663.1651119,"EL_M2":2068.2677328,"expected_recovery":1382.9635298452417,"RC":553.1854119380968,"K":3599.6091081711656,"cK":287.96872865369323,"F":144.275411625,"G":6289.149862555748,"paid_event_frequency":0.68337},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":1738.1635154499945,"EL_M1":680.03284095,"EL_M2":1058.1306745,"expected_recovery":454.6298725236511,"RC":181.85194900946044,"K":2058.938353929464,"cK":164.71506831435713,"F":130.4326663125,"G":2953.5509321150826,"paid_event_frequency":0.304765},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":3475.5345876499164,"EL_M1":1507.4383421499997,"EL_M2":1968.0962455000001,"expected_recovery":1265.8646850006749,"RC":506.34587400027,"K":3550.7614534329014,"cK":284.0609162746321,"F":144.32257725,"G":5880.351940233092,"paid_event_frequency":0.68466},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":2088.6292526499606,"EL_M1":1015.0535427499996,"EL_M2":1073.5757099,"expected_recovery":421.1200850525279,"RC":168.44803402101115,"K":2507.2899437543447,"cK":200.58319550034759,"F":144.2677335,"G":3469.2376208950923,"paid_event_frequency":0.68316},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":5787.339924749976,"EL_M1":2548.6680769999994,"EL_M2":3238.67184775,"expected_recovery":2080.0387244435733,"RC":832.0154897774294,"K":5885.707255702521,"cK":470.8565804562017,"F":144.2931444375,"G":9646.006852561475,"paid_event_frequency":0.683855},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":1798.7404292500073,"EL_M1":613.3380203499999,"EL_M2":1185.4024089,"expected_recovery":710.8409485846387,"RC":284.3363794338555,"K":1597.9113428987853,"cK":127.83290743190283,"F":130.2008600625,"G":3121.4807682376872,"paid_event_frequency":0.298425},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":3835.2170726998274,"EL_M1":1689.1428204500003,"EL_M2":2146.0742522500004,"expected_recovery":657.4812824963324,"RC":262.99251299853296,"K":3623.7566296975388,"cK":289.9005303758031,"F":144.23720381249998,"G":6043.129759848885,"paid_event_frequency":0.682325},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":4182.622116499781,"EL_M1":2023.4503957,"EL_M2":2159.1717208,"expected_recovery":1159.7409555932336,"RC":463.89638223729344,"K":2932.517042187752,"cK":234.60136337502016,"F":144.2426881875,"G":6700.483400399459,"paid_event_frequency":0.682475},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":1007.1035748000036,"EL_M1":283.42346225,"EL_M2":723.6801125500001,"expected_recovery":197.54374804611632,"RC":79.01749921844653,"K":1158.9880760179772,"cK":92.71904608143818,"F":128.36469131249999,"G":1742.939748549851,"paid_event_frequency":0.248205},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":2482.693539800013,"EL_M1":1113.4238137999996,"EL_M2":1369.269726,"expected_recovery":213.11212340139946,"RC":85.24484936055978,"K":2358.3237398876126,"cK":188.665899191009,"F":144.266636625,"G":3867.8278999687755,"paid_event_frequency":0.68313},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":2489.1310888000135,"EL_M1":1109.60864995,"EL_M2":1379.5224388499998,"expected_recovery":257.73214450744035,"RC":103.09285780297614,"K":3418.849291457176,"cK":273.5079433165741,"F":144.3348256875,"G":4013.4222874760853,"paid_event_frequency":0.684995},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":1750.5671583499961,"EL_M1":680.2860786999998,"EL_M2":1070.2810796500003,"expected_recovery":202.64696120933013,"RC":81.05878448373205,"K":2200.377297844408,"cK":176.03018382755266,"F":130.5160288125,"G":2850.8962072983745,"paid_event_frequency":0.307045},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":3453.4167006499188,"EL_M1":1496.9309417999998,"EL_M2":1956.48575885,"expected_recovery":234.82057461727845,"RC":93.92822984691139,"K":3377.2710973070853,"cK":270.1816877845668,"F":144.2580444375,"G":5282.379550291863,"paid_event_frequency":0.682895}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":311015.8020538499,"expected_recovery":134747.70949775,"reinsurance_premium":188646.79329685,"RC":53899.083799099986,"mean_net":176268.09255610002,"net_TVaR":425420.01395999995,"net_VaR":387003.74,"K":249151.92140389993,"cK":19932.153712311996,"F":14390.502253125,"G":532316.7224245159,"average_premium":5323.167224245159,"annual_exhaustion_probability":7e-05,"recovery_year_probability":0.810215,"tail_reduction":0.5826433638786047},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.4,"m2_frequency_scale":3.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"m2Retained":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2660.909089349627,"EL_M1":2291.2292121499995,"EL_M2":369.6798772000001,"expected_recovery":585.9923420152286,"RC":234.39693680609145,"K":11541.73821148341,"cK":923.3390569186729,"F":148.7051413125,"G":5289.800299182522,"paid_event_frequency":0.804525},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1034.279265200071,"EL_M1":850.0043902,"EL_M2":184.274875,"expected_recovery":272.0133609862023,"RC":108.80534439448093,"K":3975.393700375598,"cK":318.0314960300479,"F":140.6928350625,"G":2135.7452542494666,"paid_event_frequency":0.585385},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1235.296949750002,"EL_M1":937.1348197499999,"EL_M2":298.16213,"expected_recovery":473.6089570014276,"RC":189.44358280057105,"K":11003.843285654739,"cK":880.3074628523791,"F":127.04003193749999,"G":3242.7840364539366,"paid_event_frequency":0.211975},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2069.891780150038,"EL_M1":1701.2050301500005,"EL_M2":368.68675,"expected_recovery":544.3865135716926,"RC":217.75460542867705,"K":7963.5681607186425,"cK":637.0854528574914,"F":140.6928350625,"G":4087.2328979982753,"paid_event_frequency":0.585385},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.9545775995537,"EL_M1":1145.70689015,"EL_M2":185.24768744999997,"expected_recovery":292.03195294284296,"RC":116.8127811771372,"K":5746.920096353534,"cK":459.75360770828274,"F":148.705324125,"G":2741.6350541466313,"paid_event_frequency":0.80453},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":660.7537123499994,"EL_M1":484.18598374999993,"EL_M2":176.56772859999995,"expected_recovery":153.7247706142697,"RC":61.48990824570788,"K":4477.161668592102,"cK":358.17293348736814,"F":128.429955375,"G":1611.7953459441005,"paid_event_frequency":0.24999},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1721.304578900015,"EL_M1":1489.5895789,"EL_M2":231.715,"expected_recovery":213.60464600525233,"RC":85.44185840210093,"K":7908.639954801116,"cK":632.6911963840893,"F":148.7230569375,"G":3450.880920831607,"paid_event_frequency":0.805015},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":860.6122949499834,"EL_M1":745.2374199499999,"EL_M2":115.374875,"expected_recovery":106.6812058237224,"RC":42.67248232948896,"K":2823.773923789032,"cK":225.90191390312256,"F":148.723605375,"G":1703.8803954101265,"paid_event_frequency":0.80503},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1509.0555425000134,"EL_M1":1240.9396806999998,"EL_M2":268.1158618,"expected_recovery":450.2332547536562,"RC":180.0933019014625,"K":10208.700635528543,"cK":816.6960508422835,"F":130.2568006875,"G":3514.802261241679,"paid_event_frequency":0.299955},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1844.1299757000065,"EL_M1":1509.0085382000002,"EL_M2":335.1214375,"expected_recovery":458.67406385405525,"RC":183.46962554162212,"K":7388.273718337998,"cK":591.0618974670398,"F":140.697771,"G":3679.145692944891,"paid_event_frequency":0.58552},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.4550659495462,"EL_M1":1145.6151275500004,"EL_M2":184.83993839999997,"expected_recovery":292.9961711646006,"RC":117.19846846584024,"K":5770.869249692058,"cK":461.6695399753646,"F":148.7051413125,"G":2744.037620937668,"paid_event_frequency":0.804525},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3102.8380084000073,"EL_M1":2550.0133834000003,"EL_M2":552.824625,"expected_recovery":816.0400823857549,"RC":326.41603295430195,"K":11926.181133436181,"cK":954.0944906748945,"F":140.6928350625,"G":6032.055156122272,"paid_event_frequency":0.585385},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":818.7391668,"EL_M1":619.9644132,"EL_M2":198.77475360000003,"expected_recovery":254.16232320845438,"RC":101.66492928338175,"K":7391.537047185006,"cK":591.3229637748004,"F":126.964530375,"G":2184.9221203109096,"paid_event_frequency":0.20991},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1031.8977036000674,"EL_M1":847.4527348499997,"EL_M2":184.44496875,"expected_recovery":221.69015513733393,"RC":88.67606205493358,"K":4018.605930946989,"cK":321.4884744757591,"F":140.70416943749998,"G":2110.35521275768,"paid_event_frequency":0.585695},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3984.7725294500087,"EL_M1":3428.9750888000017,"EL_M2":555.79744065,"expected_recovery":708.9873241990349,"RC":283.594929679614,"K":17267.46732953395,"cK":1381.397386362716,"F":148.607336625,"G":7731.162909489786,"paid_event_frequency":0.80185},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":436.99966089999646,"EL_M1":317.44903545000005,"EL_M2":119.55062545,"expected_recovery":80.67700434432118,"RC":32.27080173772847,"K":3058.316766831847,"cK":244.66534134654776,"F":128.3058256875,"G":1122.9888395623636,"paid_event_frequency":0.246595},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":851.846372599994,"EL_M1":737.9903257000001,"EL_M2":113.8560469,"expected_recovery":86.73540885483601,"RC":34.69416354193441,"K":3750.0884721133834,"cK":300.0070777690707,"F":148.6268975625,"G":1780.2326819646653,"paid_event_frequency":0.802385},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2562.029385400037,"EL_M1":2215.1393854000003,"EL_M2":346.89,"expected_recovery":261.72607497274566,"RC":104.69042998909828,"K":8314.489672685882,"cK":665.1591738148707,"F":148.6250694375,"G":4640.672078188674,"paid_event_frequency":0.802335},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1001.2897773500345,"EL_M1":823.2525238499998,"EL_M2":178.0372535,"expected_recovery":244.6061105665858,"RC":97.84244422663433,"K":6762.791167698825,"cK":541.023293415906,"F":130.082580375,"G":2360.3174604900996,"paid_event_frequency":0.29519},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":920.6728827000386,"EL_M1":753.9194608500001,"EL_M2":166.75342185,"expected_recovery":188.67884215184654,"RC":75.47153686073862,"K":3638.105519919445,"cK":291.04844159355565,"F":140.7080085,"G":1903.8678262057772,"paid_event_frequency":0.5858},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3981.709544400012,"EL_M1":3427.10241,"EL_M2":554.6071344,"expected_recovery":713.4714540478712,"RC":285.3885816191485,"K":17321.038098784582,"cK":1385.6830479027665,"F":148.6067881875,"G":7735.183949479236,"paid_event_frequency":0.801835},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2054.9333222500304,"EL_M1":1684.2291243500001,"EL_M2":370.7041979,"expected_recovery":307.4802971921292,"RC":122.99211887685169,"K":11136.930962935863,"cK":890.9544770348691,"F":140.67729599999998,"G":4279.409618882335,"paid_event_frequency":0.58496},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":404.32405019999453,"EL_M1":306.04751195000006,"EL_M2":98.27653825000002,"expected_recovery":87.696089903359,"RC":35.0784359613436,"K":2337.0082916732517,"cK":186.96066333386014,"F":127.0367413125,"G":1004.5331877435978,"paid_event_frequency":0.211885},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":3080.6257571000065,"EL_M1":2526.742679,"EL_M2":553.8830781,"expected_recovery":461.31913415084773,"RC":184.5276536603391,"K":16814.628478753326,"cK":1345.170278300266,"F":140.6771131875,"G":6334.667736330815,"paid_event_frequency":0.584955},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2640.3235664996414,"EL_M1":2271.11199355,"EL_M2":369.21157295,"expected_recovery":309.45910310190175,"RC":123.7836412407607,"K":8046.608903476985,"cK":643.7287122781588,"F":148.545180375,"G":4741.841467191414,"paid_event_frequency":0.80015},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":221.1363683500033,"EL_M1":159.35573749999998,"EL_M2":61.780630850000016,"expected_recovery":24.734424880982743,"RC":9.893769952393098,"K":2338.9120365008293,"cK":187.11296292006634,"F":128.4381819375,"G":728.7750442132836,"paid_event_frequency":0.250215},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":2548.6659360500325,"EL_M1":2202.0253110500003,"EL_M2":346.640625,"expected_recovery":144.97402228227884,"RC":57.989608912911535,"K":8267.791653935712,"cK":661.423332314857,"F":148.56108506249998,"G":4555.519949787068,"paid_event_frequency":0.800585},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":1708.64604135002,"EL_M1":1477.0240841999996,"EL_M2":231.62195715,"expected_recovery":30.07262805213577,"RC":12.029051220854308,"K":7406.821990508356,"cK":592.5457592406685,"F":148.6916131875,"G":3282.5499533320576,"paid_event_frequency":0.804155},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":498.5836918000156,"EL_M1":410.44767699999994,"EL_M2":88.1360148,"expected_recovery":18.36184636775414,"RC":7.344738547101656,"K":2089.224186857726,"cK":167.1379349486181,"F":130.14546787499998,"G":1070.9491108943137,"paid_event_frequency":0.29691},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":2763.482211800007,"EL_M1":2256.9566354999997,"EL_M2":506.52557629999995,"expected_recovery":87.58686882595885,"RC":35.03474753038354,"K":15695.041077615582,"cK":1255.6032862092466,"F":140.757367875,"G":5593.170151219517,"paid_event_frequency":0.58715},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3109.082651300003,"EL_M1":2735.6321579999994,"EL_M2":373.45049330000006,"expected_recovery":444.2388757341505,"RC":177.6955502936602,"K":4174.1338774132155,"cK":333.9307101930572,"F":156.6147069375,"G":5036.431491632294,"paid_event_frequency":1.020855},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1258.4780122005234,"EL_M1":1071.6447099999996,"EL_M2":186.8333022,"expected_recovery":203.1026077102713,"RC":81.24104308410853,"K":2061.701256540772,"cK":164.93610052326179,"F":148.6108100625,"G":2204.354621160525,"paid_event_frequency":0.801945},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1396.1202371000131,"EL_M1":1093.7565652,"EL_M2":302.36367190000004,"expected_recovery":364.94217148929056,"RC":145.97686859571624,"K":3649.42818437954,"cK":291.95425475036325,"F":129.43560693749998,"G":2617.982623178123,"paid_event_frequency":0.277495},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2517.2503546004195,"EL_M1":2144.7400630499997,"EL_M2":372.51029155000003,"expected_recovery":406.5171014384332,"RC":162.6068405753733,"K":4143.176683612635,"cK":331.45413468901086,"F":148.6108100625,"G":4213.229519903071,"paid_event_frequency":0.801945},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1554.6280154000162,"EL_M1":1367.7891739000004,"EL_M2":186.83884150000003,"expected_recovery":221.22595777100491,"RC":88.49038310840197,"K":2087.366114658655,"cK":166.98928917269242,"F":156.61342725,"G":2622.294819908148,"paid_event_frequency":1.02082},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":779.4206764499992,"EL_M1":594.5573049000001,"EL_M2":184.86337154999998,"expected_recovery":131.2808352315826,"RC":52.51233409263305,"K":2499.989375673246,"cK":199.99915005385967,"F":130.7145631875,"G":1550.1956317119893,"paid_event_frequency":0.312475},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.6143655499873,"EL_M1":1809.3256155499998,"EL_M2":235.28875,"expected_recovery":181.715760491531,"RC":72.6863041966124,"K":3172.1064059619584,"cK":253.7685124769567,"F":156.63902099999999,"G":3370.2776042980754,"paid_event_frequency":1.02152},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.682521600002,"EL_M1":1810.3962715999996,"EL_M2":234.28625,"expected_recovery":181.33883180351086,"RC":72.53553272140435,"K":3015.3055631807583,"cK":241.22444505446066,"F":156.6355475625,"G":3353.437395917823,"paid_event_frequency":1.021425},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":1104.7753762999903,"EL_M1":923.3741927,"EL_M2":181.4011836,"expected_recovery":232.23125646650908,"RC":92.89250258660364,"K":2257.0527495537713,"cK":180.5642199643017,"F":132.50301787499998,"G":2014.3134889678606,"paid_event_frequency":0.36139},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":1129.8778893003764,"EL_M1":961.33309995,"EL_M2":168.54478935000003,"expected_recovery":181.1842529868544,"RC":72.47370119474176,"K":1817.9087625929237,"cK":145.4327010074339,"F":148.60477724999998,"G":1995.185425003403,"paid_event_frequency":0.80178},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":4642.625122750098,"EL_M1":4082.2912352999997,"EL_M2":560.33388745,"expected_recovery":683.0323790526586,"RC":273.21295162106344,"K":6007.205354742435,"cK":480.57642837939477,"F":156.5101381875,"G":7403.8995212507425,"paid_event_frequency":1.017995},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":2506.297847600418,"EL_M1":2132.5206672500003,"EL_M2":373.77718035000004,"expected_recovery":425.78259434178653,"RC":170.31303773671462,"K":4032.779444752635,"cK":322.6223555802108,"F":148.598561625,"G":4197.109070056458,"paid_event_frequency":0.80161},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":460.0050705499734,"EL_M1":359.18717995000003,"EL_M2":100.8178906,"expected_recovery":119.97539742041346,"RC":47.99015896816539,"K":1221.6513531421156,"cK":97.73210825136925,"F":129.3891725625,"G":980.155347109344,"paid_event_frequency":0.276225},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":3758.2775741500964,"EL_M1":3199.2944562000002,"EL_M2":558.9831179500001,"expected_recovery":638.7189026401961,"RC":255.48756105607845,"K":6049.8513393713365,"cK":483.98810714970693,"F":148.5976475625,"G":6195.134519891176,"paid_event_frequency":0.801585},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":3094.207483600016,"EL_M1":2720.5662773499994,"EL_M2":373.64120625,"expected_recovery":120.41283821129582,"RC":48.16513528451833,"K":3933.549520051199,"cK":314.68396160409594,"F":156.49935225,"G":4818.074576984841,"paid_event_frequency":1.0177},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":259.69517729999876,"EL_M1":197.47533139999996,"EL_M2":62.219845899999996,"expected_recovery":17.36036372472347,"RC":6.944145489889388,"K":877.540157853763,"cK":70.20321262830105,"F":130.6619131875,"G":623.3392648075856,"paid_event_frequency":0.311035},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":3058.0457658000505,"EL_M1":2701.03718765,"EL_M2":357.00857814999995,"expected_recovery":100.48391692540872,"RC":40.19356677016349,"K":4514.550669720171,"cK":361.1640535776137,"F":156.52421475,"G":4821.236801197104,"paid_event_frequency":1.01838},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":2038.5268750500027,"EL_M1":1801.0554614500002,"EL_M2":237.4714136,"expected_recovery":66.76854961003096,"RC":26.707419844012385,"K":3012.7486615781445,"cK":241.01989292625157,"F":156.52256943749998,"G":3283.702343010355,"paid_event_frequency":1.018335},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1101.1981994499859,"EL_M1":917.5240584000001,"EL_M2":183.67414105,"expected_recovery":22.46313046300361,"RC":8.985252185201444,"K":2501.724870334483,"cK":200.13798962675864,"F":132.5042975625,"G":1923.7676517659277,"paid_event_frequency":0.361425},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":2261.5489926002397,"EL_M1":1921.7062092499998,"EL_M2":339.84278335,"expected_recovery":32.81466664376194,"RC":13.125866657504776,"K":3687.5178835457455,"cK":295.00143068365963,"F":148.6353069375,"G":3624.4154625052056,"paid_event_frequency":0.802615},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3292.5677857503574,"EL_M1":2915.58712305,"EL_M2":376.98066270000004,"expected_recovery":676.1727638012285,"RC":270.4691055204914,"K":4317.28608501703,"cK":345.3828868013624,"F":149.8574085,"G":5411.036248762948,"paid_event_frequency":0.83604},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1353.8458876001064,"EL_M1":1163.4777773500002,"EL_M2":190.36811024999997,"expected_recovery":318.962987846199,"RC":127.5851951384796,"K":2052.840167090084,"cK":164.22721336720673,"F":141.896655375,"G":2383.40660197439,"paid_event_frequency":0.61831},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1619.3964679000094,"EL_M1":1322.3371311499998,"EL_M2":297.05933674999994,"expected_recovery":519.5881399489454,"RC":207.83525597957816,"K":3800.694029481694,"cK":304.05552235853554,"F":128.06688975,"G":3012.472181317498,"paid_event_frequency":0.24006},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":2709.2643915000867,"EL_M1":2327.99320405,"EL_M2":381.27118744999996,"expected_recovery":638.6400202094842,"RC":255.45600808379368,"K":4117.990225364361,"cK":329.4392180291489,"F":141.89574131249998,"G":4581.407145234039,"paid_event_frequency":0.618285},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1645.912286599879,"EL_M1":1457.63095445,"EL_M2":188.28133214999997,"expected_recovery":336.95715899497213,"RC":134.78286359798886,"K":2176.887260204125,"cK":174.15098081633002,"F":149.857042875,"G":2806.2708985189306,"paid_event_frequency":0.83603},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":755.8277319499989,"EL_M1":572.92072985,"EL_M2":182.9070021,"expected_recovery":185.86030346979533,"RC":74.34412138791814,"K":2609.6179692828505,"cK":208.76943754262805,"F":128.94055068749998,"G":1557.1757887573933,"paid_event_frequency":0.263955},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1890.7086107999867,"EL_M1":1651.2085170499995,"EL_M2":239.50009375,"expected_recovery":270.30347938468753,"RC":108.12139175387502,"K":3115.2152753707924,"cK":249.2172220296634,"F":149.8981756875,"G":3197.2605336947004,"paid_event_frequency":0.837155},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1891.3325052999792,"EL_M1":1653.0666394499997,"EL_M2":238.26586585,"expected_recovery":270.27817937295936,"RC":108.11127174918374,"K":3157.647977165848,"cK":252.61183817326784,"F":149.90786475,"G":3202.6179732965743,"paid_event_frequency":0.83742},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1220.5754225000424,"EL_M1":1042.7354834999999,"EL_M2":177.83993900000002,"expected_recovery":341.14526658313946,"RC":136.4581066332558,"K":2385.1715525782784,"cK":190.81372420626226,"F":131.050755375,"G":2238.5306782860807,"paid_event_frequency":0.32167},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1192.4844998000724,"EL_M1":1020.8851873000001,"EL_M2":171.5993125,"expected_recovery":310.8154904886171,"RC":124.32619619544685,"K":1817.852364009564,"cK":145.42818912076513,"F":141.96886631249998,"G":2138.9436685717124,"paid_event_frequency":0.620285},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4961.046708650011,"EL_M1":4395.550227350001,"EL_M2":565.4964812999999,"expected_recovery":1147.5200377754973,"RC":459.0080151101989,"K":6288.278841003787,"cK":503.062307280303,"F":149.8221256875,"G":8097.2522089706845,"paid_event_frequency":0.835075},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2724.8900143500787,"EL_M1":2344.2939727000003,"EL_M2":380.59604165,"expected_recovery":735.8334219586777,"RC":294.3333687834711,"K":4005.303300613672,"cK":320.4242640490938,"F":141.9604569375,"G":4642.144138826859,"paid_event_frequency":0.620055},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":541.9661939999947,"EL_M1":442.8866853499999,"EL_M2":99.07950865000001,"expected_recovery":185.8671801767224,"RC":74.34687207068896,"K":1275.1323324960113,"cK":102.0105865996809,"F":128.0491569375,"G":1128.4970794771527,"paid_event_frequency":0.239575},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4088.0273970500098,"EL_M1":3516.2889127500002,"EL_M2":571.7384843,"expected_recovery":1104.0011802227214,"RC":441.60047208908856,"K":6027.540153963612,"cK":482.20321231708897,"F":141.96027412499998,"G":6871.721807441583,"paid_event_frequency":0.62005},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":3291.507885150351,"EL_M1":2914.8260476,"EL_M2":376.68183755,"expected_recovery":161.4007823117563,"RC":64.56031292470253,"K":3941.914268813705,"cK":315.3531415050964,"F":149.8148131875,"G":5094.981537023533,"paid_event_frequency":0.834875},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":252.19135500000425,"EL_M1":190.22419380000002,"EL_M2":61.9671612,"expected_recovery":26.278597772970983,"RC":10.511439109188395,"K":841.620179570131,"cK":67.32961436561048,"F":128.911117875,"G":611.9247017997376,"paid_event_frequency":0.26315},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":2819.433195650034,"EL_M1":2461.33069565,"EL_M2":358.1025,"expected_recovery":161.50191237312947,"RC":64.6007649492518,"K":4476.522433367687,"cK":358.12179466941495,"F":149.8524725625,"G":4522.677637108268,"paid_event_frequency":0.835905},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1885.67560719999,"EL_M1":1642.2241072,"EL_M2":243.4515,"expected_recovery":107.31822882588426,"RC":42.927291530353706,"K":2938.932100158321,"cK":235.1145680126657,"F":149.8597850625,"G":3084.7696690740127,"paid_event_frequency":0.836105},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":1208.3437598000505,"EL_M1":1028.4762216500003,"EL_M2":179.86753815,"expected_recovery":22.07984264468905,"RC":8.83193705787562,"K":2336.847769584953,"cK":186.94782156679622,"F":130.98110381249998,"G":2046.8061629829629,"paid_event_frequency":0.319765},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":2353.874481600054,"EL_M1":2005.0619815999996,"EL_M2":348.8125,"expected_recovery":32.486822755086905,"RC":12.994729102034762,"K":3509.004785750893,"cK":280.7203828600714,"F":141.84948975,"G":3719.25211108288,"paid_event_frequency":0.61702},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2386.6900491000615,"EL_M1":2011.7541854000003,"EL_M2":374.9358637,"expected_recovery":406.73511354752713,"RC":162.69404541901088,"K":3040.719302221358,"cK":243.25754417770864,"F":140.66833818749998,"G":3911.079969179041,"paid_event_frequency":0.584715},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1030.2383522000669,"EL_M1":840.60524115,"EL_M2":189.63311105,"expected_recovery":185.5643550884148,"RC":74.22574203536593,"K":950.8694413773511,"cK":76.0695553101881,"F":140.6811350625,"G":1761.6197128108279,"paid_event_frequency":0.585065},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":1223.3914467500074,"EL_M1":926.52147225,"EL_M2":296.8699745,"expected_recovery":338.52929056660037,"RC":135.41171622664015,"K":2404.3730689075715,"cK":192.34984551260573,"F":127.02321318749999,"G":2237.5682955690045,"paid_event_frequency":0.211515},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2061.3081456500345,"EL_M1":1681.8622536500002,"EL_M2":379.445892,"expected_recovery":371.4087837581342,"RC":148.5635135032537,"K":1918.1383065607479,"cK":153.45106452485985,"F":140.6815006875,"G":3338.672299154197,"paid_event_frequency":0.585075},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1194.7186452500866,"EL_M1":1006.98072445,"EL_M2":187.7379208,"expected_recovery":202.57076800683035,"RC":81.02830720273215,"K":1521.8514995599373,"cK":121.748119964795,"F":140.668521,"G":2050.884791223485,"paid_event_frequency":0.58472},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":614.7882923499973,"EL_M1":423.1454303999999,"EL_M2":191.64286195,"expected_recovery":112.33861494579156,"RC":44.93544597831663,"K":999.4459623304892,"cK":79.95567698643914,"F":126.1117100625,"G":1154.3881671696706,"paid_event_frequency":0.186585},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1348.4854954999796,"EL_M1":1111.6902205499998,"EL_M2":236.79527495000002,"expected_recovery":130.5419518870042,"RC":52.216780754801675,"K":1990.5962598010412,"cK":159.2477007840833,"F":140.64256162499998,"G":2267.456718218486,"paid_event_frequency":0.58401},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":677.0039081000031,"EL_M1":556.3557830999999,"EL_M2":120.648125,"expected_recovery":65.44539413532686,"RC":26.178157654130747,"K":660.3012974536828,"cK":52.82410379629462,"F":140.6537131875,"G":1195.5465103172378,"paid_event_frequency":0.584315},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":1303.1599777000013,"EL_M1":1035.1343748000002,"EL_M2":268.02560289999997,"expected_recovery":258.5055976811111,"RC":103.40223907244444,"K":2528.0117642807004,"cK":202.24094114245602,"F":127.535636625,"G":2315.118392719869,"paid_event_frequency":0.22553},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1854.3394099000034,"EL_M1":1505.5410349,"EL_M2":348.798375,"expected_recovery":241.98343104364108,"RC":96.79337241745644,"K":1802.365340623712,"cK":144.18922724989696,"F":140.6427444375,"G":2981.2863386731424,"paid_event_frequency":0.584015},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2395.651995150081,"EL_M1":2020.4918916000004,"EL_M2":375.16010355000003,"expected_recovery":296.1783416350304,"RC":118.47133665401216,"K":3032.881963217459,"cK":242.63055705739674,"F":140.6262913125,"G":3863.17357356532,"paid_event_frequency":0.583565},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":2067.086607600039,"EL_M1":1692.5490846499997,"EL_M2":374.53752295000004,"expected_recovery":163.21089627397646,"RC":65.28435850959059,"K":2638.3437426181517,"cK":211.06749940945215,"F":140.6924694375,"G":3312.174579942109,"paid_event_frequency":0.585375},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":411.412147249993,"EL_M1":310.36181525,"EL_M2":101.050332,"expected_recovery":49.78564331166899,"RC":19.9142573246676,"K":487.287200855594,"cK":38.98297606844752,"F":127.06672256249999,"G":796.5014709408107,"paid_event_frequency":0.212705},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":3102.5981500500093,"EL_M1":2539.25758755,"EL_M2":563.3405625,"expected_recovery":244.8723986557393,"RC":97.94895946229572,"K":4021.628951157973,"cK":321.73031609263785,"F":140.6932006875,"G":4883.9608350565895,"paid_event_frequency":0.585395},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":2402.010906150073,"EL_M1":2026.3187957500002,"EL_M2":375.6921104,"expected_recovery":25.565238928907547,"RC":10.22609557156302,"K":2582.354074065189,"cK":206.58832592521512,"F":140.7050835,"G":3679.3738815291345,"paid_event_frequency":0.58572},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":402.80653129999826,"EL_M1":284.73495529999997,"EL_M2":118.07157599999996,"expected_recovery":61.29373043459111,"RC":24.517492173836445,"K":560.2057721305733,"cK":44.81646177044587,"F":126.0683835,"G":797.6118249923742,"paid_event_frequency":0.1854},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":677.3308019500035,"EL_M1":556.3376769500002,"EL_M2":120.993125,"expected_recovery":60.394316966908946,"RC":24.15772678676358,"K":483.35884294624736,"cK":38.66870743569979,"F":140.75718506249999,"G":1174.5525616466223,"paid_event_frequency":0.587145},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":2010.684465150019,"EL_M1":1669.0840204500005,"EL_M2":341.60044469999997,"expected_recovery":181.65030282533917,"RC":72.66012113013566,"K":1952.558553305739,"cK":156.20468426445913,"F":140.73597881249998,"G":3173.7136658094846,"paid_event_frequency":0.586565},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":871.9376620499929,"EL_M1":690.2409545999999,"EL_M2":181.69670744999996,"expected_recovery":139.1973111097319,"RC":55.67892444389277,"K":707.0194754586881,"cK":56.561558036695054,"F":127.605836625,"G":1482.3786415407742,"paid_event_frequency":0.22745},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":1845.2976275500087,"EL_M1":1516.0546900499996,"EL_M2":329.2429375,"expected_recovery":223.96484417242004,"RC":89.58593766896803,"K":1625.0760984177389,"cK":130.00608787341912,"F":140.687167875,"G":2940.769094623194,"paid_event_frequency":0.58523},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":1207.3917104000896,"EL_M1":1017.8793081,"EL_M2":189.5124023,"expected_recovery":139.6133839136371,"RC":55.84535356545484,"K":775.6638159912723,"cK":62.05310527930178,"F":140.70581475,"G":1954.661311993128,"paid_event_frequency":0.58574},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":3104.8611036000043,"EL_M1":2557.8861817499997,"EL_M2":546.97492185,"expected_recovery":379.95438449336234,"RC":151.98175379734494,"K":2606.4079426172707,"cK":208.51263540938166,"F":140.68241475,"G":4808.050543408975,"paid_event_frequency":0.5851},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":806.2308555000008,"EL_M1":609.46963455,"EL_M2":196.76122094999994,"expected_recovery":53.075068426406915,"RC":21.230027370562766,"K":898.93082687406,"cK":71.9144661499248,"F":127.0268694375,"G":1368.5362912773178,"paid_event_frequency":0.211615},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":2055.8603046500366,"EL_M1":1678.8128463499995,"EL_M2":377.04745829999996,"expected_recovery":87.97138995736373,"RC":35.188555982945495,"K":1351.3923342301293,"cK":108.11138673841035,"F":140.72208506249999,"G":3119.8431099118566,"paid_event_frequency":0.586185},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":2385.6892795500717,"EL_M1":2020.5862576999998,"EL_M2":365.10302185,"expected_recovery":24.293842438535194,"RC":9.717536975414077,"K":1409.367755828387,"cK":112.74942046627098,"F":140.7167835,"G":3531.8306939890085,"paid_event_frequency":0.58604},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":409.9594161499986,"EL_M1":284.13629465,"EL_M2":125.82312150000003,"expected_recovery":43.99448368320941,"RC":17.597793473283765,"K":297.05686939060325,"cK":23.764549551248262,"F":126.0886756875,"G":769.880579816041,"paid_event_frequency":0.185955},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":1349.5925777499804,"EL_M1":1115.628383,"EL_M2":233.96419475000002,"expected_recovery":92.53674065114865,"RC":37.01469626045946,"K":601.8237410006273,"cK":48.14589928005018,"F":140.7100194375,"G":2100.6175903039866,"paid_event_frequency":0.585855},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":1344.1882108999791,"EL_M1":1108.2219609,"EL_M2":235.96625,"expected_recovery":72.24412809254773,"RC":28.89765123701909,"K":532.2677637264619,"cK":42.581421098116955,"F":140.720805375,"G":2075.1841181468203,"paid_event_frequency":0.58615},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":874.2381263999871,"EL_M1":690.0846660499999,"EL_M2":184.15346034999996,"expected_recovery":33.84653375814901,"RC":13.538613503259604,"K":380.159175874762,"cK":30.41273406998096,"F":127.61022412499999,"G":1394.3995974643037,"paid_event_frequency":0.22757},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1837.6793353000023,"EL_M1":1491.8024381999999,"EL_M2":345.8768971,"expected_recovery":19.597527730195225,"RC":7.83901109207809,"K":543.7932763581857,"cK":43.50346210865486,"F":140.74420537499998,"G":2706.3546851676474,"paid_event_frequency":0.58679}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"m1","EL":177946.02074309997,"expected_recovery":25927.872428550007,"reinsurance_premium":36299.021399970006,"RC":10371.14897142,"mean_net":152018.14831455,"net_TVaR":563622.45736,"net_VaR":478097.76999999996,"K":411604.30904545,"cK":32928.344723636,"F":14059.328085937497,"G":313739.79003212467,"average_premium":3137.3979003212467,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.51088,"tail_reduction":0.12040252881184055},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"m1Low":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1516.5665359001443,"EL_M1":1148.26647755,"EL_M2":368.30005835000003,"expected_recovery":591.2972490283066,"RC":236.51889961132267,"K":2480.1024997935615,"cK":198.40819998348493,"F":134.3858038125,"G":2781.17258574327,"paid_event_frequency":0.412885},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":616.2051430999871,"EL_M1":425.81742434999995,"EL_M2":190.38771875,"expected_recovery":277.07634647230924,"RC":110.8305385889237,"K":990.6967606136081,"cK":79.25574084908865,"F":130.45387256249998,"G":1248.9937268006659,"paid_event_frequency":0.305345},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":762.8518154000002,"EL_M1":467.1731482,"EL_M2":295.67866719999995,"expected_recovery":481.31441428339315,"RC":192.52576571335726,"K":959.505436101922,"cK":76.76043488815377,"F":123.48633974999998,"G":1540.8324743353485,"paid_event_frequency":0.11478},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1231.6838291999493,"EL_M1":852.11647505,"EL_M2":379.56735414999997,"expected_recovery":553.1969293660246,"RC":221.27877174640986,"K":1975.2575343234812,"cK":158.0206027458785,"F":130.45423818749998,"G":2321.916589172983,"paid_event_frequency":0.305355},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":758.803439050005,"EL_M1":574.4029849,"EL_M2":184.40045415,"expected_recovery":295.3388641686181,"RC":118.13554566744725,"K":1230.8263556644267,"cK":98.46610845315413,"F":134.3876319375,"G":1479.723633477475,"paid_event_frequency":0.412935},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":427.97703334999943,"EL_M1":240.7152207,"EL_M2":187.26181264999997,"expected_recovery":221.64473317534205,"RC":88.65789327013682,"K":668.4252338973995,"cK":53.47401871179196,"F":124.108999125,"G":925.623925942571,"paid_event_frequency":0.13181},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":987.1600418000293,"EL_M1":748.4662918000002,"EL_M2":238.69375,"expected_recovery":301.4114908521201,"RC":120.56459634084804,"K":1643.9435170982342,"cK":131.51548136785874,"F":134.394396,"G":1831.512687344981,"paid_event_frequency":0.41312},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":495.4846054000175,"EL_M1":374.41835540000005,"EL_M2":121.06625,"expected_recovery":144.86140798154656,"RC":57.94456319261863,"K":857.7158118763302,"cK":68.61726495010642,"F":134.4157850625,"G":1008.6162914736566,"paid_event_frequency":0.413705},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":889.5320925500006,"EL_M1":621.4469247,"EL_M2":268.08516785000006,"expected_recovery":448.7698667467248,"RC":179.50794669868992,"K":1312.0694227586214,"cK":104.9655538206897,"F":125.0680335,"G":1732.0981687591736,"paid_event_frequency":0.15804},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1100.4536692499673,"EL_M1":758.20716925,"EL_M2":342.2465,"expected_recovery":485.28776343623963,"RC":194.11510537449587,"K":1789.77743785613,"cK":143.1821950284904,"F":130.45460381249998,"G":2090.940764620605,"paid_event_frequency":0.305365},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":758.2835210500031,"EL_M1":574.1334918999999,"EL_M2":184.15002915,"expected_recovery":295.6486248027321,"RC":118.25944992109285,"K":1240.051458890396,"cK":99.20411671123168,"F":134.3858038125,"G":1480.17718865977,"paid_event_frequency":0.412885},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1848.615530650004,"EL_M1":1277.4523744,"EL_M2":571.16315625,"expected_recovery":831.2290384290627,"RC":332.49161537162513,"K":2972.090345521081,"cK":237.76722764168647,"F":130.45387256249998,"G":3399.104328301087,"paid_event_frequency":0.305345},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":505.70009930000015,"EL_M1":308.58098784999993,"EL_M2":197.11911145,"expected_recovery":290.1850644451624,"RC":116.07402577806498,"K":726.0019222952311,"cK":58.08015378361849,"F":123.4664131875,"G":1071.0942560655783,"paid_event_frequency":0.114235},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":611.7074989999869,"EL_M1":421.96872895,"EL_M2":189.73877005,"expected_recovery":250.9732267543053,"RC":100.38929070172213,"K":1058.2382287417831,"cK":84.65905829934265,"F":130.3942756875,"G":1236.2001649180688,"paid_event_frequency":0.303715},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2259.9502454000044,"EL_M1":1706.7272515999996,"EL_M2":553.2229938,"expected_recovery":801.0906785349596,"RC":320.43627141398383,"K":3744.8188057400557,"cK":299.58550445920446,"F":134.2636850625,"G":4018.9809417809233,"paid_event_frequency":0.409545},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":283.9521751999983,"EL_M1":158.6581517,"EL_M2":125.2940235,"expected_recovery":137.82961627399362,"RC":55.13184650959745,"K":407.4010271350422,"cK":32.59208217080338,"F":124.05287568749999,"G":660.9719727571988,"paid_event_frequency":0.130275},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":488.69457815001635,"EL_M1":369.91520314999997,"EL_M2":118.779375,"expected_recovery":140.43428835742395,"RC":56.17371534296959,"K":737.5391222340018,"cK":59.003129778720144,"F":134.26770693749998,"G":984.1855069456079,"paid_event_frequency":0.409655},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":1472.740235700015,"EL_M1":1107.5311979000003,"EL_M2":365.20903780000003,"expected_recovery":409.88182626070034,"RC":163.95273050428014,"K":2255.12696728683,"cK":180.4101573829464,"F":134.287267875,"G":2601.853855282989,"paid_event_frequency":0.41019},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":588.6913517499888,"EL_M1":410.05876644999995,"EL_M2":178.6325853,"expected_recovery":269.73049857926895,"RC":107.89219943170758,"K":893.3757301153798,"cK":71.47005840923039,"F":124.9863163125,"G":1190.7199012045692,"paid_event_frequency":0.155805},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":546.8283743999907,"EL_M1":375.00738055,"EL_M2":171.82099384999998,"expected_recovery":221.51467865961342,"RC":88.60587146384538,"K":945.1516595757747,"cK":75.61213276606198,"F":130.39372724999998,"G":1121.9201411731974,"paid_event_frequency":0.3037},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2259.6250133000044,"EL_M1":1707.1322679500004,"EL_M2":552.49274535,"expected_recovery":803.1627569789316,"RC":321.26510279157264,"K":3777.2194279881637,"cK":302.1775542390531,"F":134.2618569375,"G":4023.106036357507,"paid_event_frequency":0.409495},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":1220.0762937499544,"EL_M1":852.49815835,"EL_M2":367.5781354,"expected_recovery":457.69812933607454,"RC":183.07925173442982,"K":1548.8262142984258,"cK":123.90609714387406,"F":130.39189912499998,"G":2209.938055671011,"paid_event_frequency":0.30365},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":257.4481108999973,"EL_M1":155.68244725,"EL_M2":101.76566365000001,"expected_recovery":123.50027712397113,"RC":49.40011084958846,"K":365.62102273705773,"cK":29.249681818964618,"F":123.485974125,"G":612.7785035914004,"paid_event_frequency":0.11477},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":1830.5823032000035,"EL_M1":1278.1313813,"EL_M2":552.4509219,"expected_recovery":687.3809624372757,"RC":274.9523849749103,"K":2350.492854918305,"cK":188.03942839346442,"F":130.3924475625,"G":3231.9554188411707,"paid_event_frequency":0.303665},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":1525.0227862001395,"EL_M1":1145.9100987000004,"EL_M2":379.1126875,"expected_recovery":442.39080593372455,"RC":176.95632237348983,"K":2027.3806659993681,"cK":162.19045327994945,"F":134.3642319375,"G":2664.711725054772,"paid_event_frequency":0.412295},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":139.42972055000158,"EL_M1":79.59228935,"EL_M2":59.83743119999999,"expected_recovery":62.42671775027982,"RC":24.97068710011193,"K":158.77420768545176,"cK":12.701936614836141,"F":124.063296,"G":401.55418701993284,"paid_event_frequency":0.13056},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":1475.1187815500164,"EL_M1":1111.87503155,"EL_M2":363.24375,"expected_recovery":351.5595532359191,"RC":140.62382129436764,"K":1741.1297510911304,"cK":139.29038008729043,"F":134.3697163125,"G":2519.203598992233,"paid_event_frequency":0.412445},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":969.4301719000301,"EL_M1":738.1539219,"EL_M2":231.27625,"expected_recovery":203.99463118960932,"RC":81.59785247584374,"K":764.5194114984208,"cK":61.161552919873664,"F":134.369167875,"G":1662.0783268943298,"paid_event_frequency":0.41243},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":296.7291470500028,"EL_M1":205.21018090000004,"EL_M2":91.51896615,"expected_recovery":79.06408267422151,"RC":31.625633069688604,"K":384.93061949821606,"cK":30.794449559857284,"F":125.06254912499999,"G":645.6157050727315,"paid_event_frequency":0.15789},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":1634.5921645500025,"EL_M1":1130.0520708000001,"EL_M2":504.54009375,"expected_recovery":455.0547973042519,"RC":182.02191892170077,"K":1822.7944534173814,"cK":145.82355627339052,"F":130.37544599999998,"G":2790.417447660125,"paid_event_frequency":0.3032},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1754.642677100001,"EL_M1":1379.47029375,"EL_M2":375.17238335,"expected_recovery":476.11332395029103,"RC":190.44532958011644,"K":3128.9625591329777,"cK":250.31700473063822,"F":138.3908600625,"G":3111.727828631007,"paid_event_frequency":0.522425},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":728.5562254999699,"EL_M1":542.3576057,"EL_M2":186.19861980000002,"expected_recovery":226.1706663892473,"RC":90.46826655569892,"K":1274.02539773264,"cK":101.9220318186112,"F":134.46368193749998,"G":1407.2136077490402,"paid_event_frequency":0.415015},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":857.1995177500047,"EL_M1":555.7473853500001,"EL_M2":301.45213240000004,"expected_recovery":399.0624132450117,"RC":159.6249652980047,"K":1415.5217366900265,"cK":113.24173893520212,"F":124.73037881249999,"G":1673.062134394282,"paid_event_frequency":0.148805},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1457.7718778997516,"EL_M1":1083.94067995,"EL_M2":373.83119795000005,"expected_recovery":453.71800787877555,"RC":181.48720315151024,"K":2548.618399075225,"cK":203.88947192601802,"F":134.464230375,"G":2636.8170444697066,"paid_event_frequency":0.41503},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":877.2698841500205,"EL_M1":689.5463883,"EL_M2":187.72349585,"expected_recovery":237.4633455236093,"RC":94.98533820944373,"K":1562.8736528589402,"cK":125.02989222871521,"F":138.39067725,"G":1647.567722450906,"paid_event_frequency":0.52242},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":485.03451025000044,"EL_M1":302.97451020000005,"EL_M2":182.06000005,"expected_recovery":197.93742303352235,"RC":79.17496921340894,"K":804.3901543421384,"cK":64.35121234737107,"F":125.23402725,"G":1005.0596254143738,"paid_event_frequency":0.16258},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1146.0023113499901,"EL_M1":909.9560613499999,"EL_M2":236.04625,"expected_recovery":253.7483996539362,"RC":101.49935986157448,"K":1846.6689990863692,"cK":147.73351992690954,"F":138.398355375,"G":2044.8447286846322,"paid_event_frequency":0.52263},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1144.960295349988,"EL_M1":910.0084608,"EL_M2":234.95183454999997,"expected_recovery":254.3335893512782,"RC":101.73343574051128,"K":1847.8014222038933,"cK":147.82411377631146,"F":138.39250537499998,"G":2043.8804669890808,"paid_event_frequency":0.52247},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":632.9895701000039,"EL_M1":451.4979969,"EL_M2":181.4915732,"expected_recovery":239.41025110620228,"RC":95.76410044248092,"K":948.739492121494,"cK":75.89915936971953,"F":126.1373038125,"G":1241.053511632939,"paid_event_frequency":0.187285},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":644.0685389999177,"EL_M1":474.1819973,"EL_M2":169.8865417,"expected_recovery":199.49305309497078,"RC":79.79722123798831,"K":987.8774765405647,"cK":79.03019812324517,"F":134.2936663125,"G":1249.586166231535,"paid_event_frequency":0.410365},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":2593.823180200044,"EL_M1":2030.8975676999999,"EL_M2":562.9256125,"expected_recovery":710.1836010466095,"RC":284.0734404186438,"K":4157.468484265082,"cK":332.5974787412066,"F":138.2149944375,"G":4464.945458396526,"paid_event_frequency":0.517615},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":1430.807722599735,"EL_M1":1058.4977018,"EL_M2":372.31002079999996,"expected_recovery":454.0340250348779,"RC":181.6136100139512,"K":2253.7355335003404,"cK":180.29884268002724,"F":134.292021,"G":2569.349595058284,"paid_event_frequency":0.41032},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":277.4672811999883,"EL_M1":176.98323635000003,"EL_M2":100.48404485000002,"expected_recovery":129.70151943334835,"RC":51.88060777333934,"K":418.60364861088294,"cK":33.488291888870634,"F":124.626724125,"G":649.950539982931,"paid_event_frequency":0.14597},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":2147.8345965500407,"EL_M1":1587.1960965500002,"EL_M2":560.6385,"expected_recovery":682.885725069377,"RC":273.15429002775085,"K":3389.73269460582,"cK":271.1786155684656,"F":134.29275224999998,"G":3768.6136725283427,"paid_event_frequency":0.41034},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":1734.2354437999963,"EL_M1":1358.8240438,"EL_M2":375.4114,"expected_recovery":312.2001652651861,"RC":124.88006610607445,"K":2234.6695908054853,"cK":178.77356726443884,"F":138.34533975,"G":2901.6458892273463,"paid_event_frequency":0.52118},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":158.5162130000004,"EL_M1":97.07114585000001,"EL_M2":61.44506715,"expected_recovery":51.96307677151442,"RC":20.78523070860577,"K":217.0577273225286,"cK":17.36461818580229,"F":125.18283974999999,"G":429.13186885921124,"paid_event_frequency":0.16118},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":1708.7732629500247,"EL_M1":1354.3251379499998,"EL_M2":354.448125,"expected_recovery":295.976118977361,"RC":118.3904475909444,"K":2027.6017485539285,"cK":162.20813988431428,"F":138.3506413125,"G":2836.9633223170445,"paid_event_frequency":0.521325},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":1141.3085660999911,"EL_M1":902.7960661,"EL_M2":238.5125,"expected_recovery":196.44593897107814,"RC":78.57837558843126,"K":1358.3607762478737,"cK":108.6688620998299,"F":138.3451569375,"G":1955.8679476343366,"paid_event_frequency":0.521175},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":643.8171214000005,"EL_M1":464.09179805,"EL_M2":179.72532335,"expected_recovery":140.02736393552595,"RC":56.01094557421038,"K":734.6575759378974,"cK":58.77260607503179,"F":126.2524756875,"G":1179.804198315657,"paid_event_frequency":0.190435},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1305.7610255997213,"EL_M1":967.11843185,"EL_M2":338.64259375,"expected_recovery":243.88255232965048,"RC":97.5530209318602,"K":1350.786289269288,"cK":108.06290314154305,"F":134.33754131249998,"G":2194.2859879808325,"paid_event_frequency":0.411565},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1859.5004067999816,"EL_M1":1489.7987317500001,"EL_M2":369.70167505,"expected_recovery":598.2494432082935,"RC":239.29977728331744,"K":3848.442754033283,"cK":307.87542032266265,"F":135.00498975,"G":3388.9074588746153,"paid_event_frequency":0.42982},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":779.9441804000085,"EL_M1":597.0926804,"EL_M2":182.8515,"expected_recovery":287.2403153461747,"RC":114.8961261384699,"K":1611.0984018810577,"cK":128.8878721504846,"F":131.0684881875,"G":1539.7288891686173,"paid_event_frequency":0.322155},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":967.8349130499976,"EL_M1":676.8606602999998,"EL_M2":290.97425275,"expected_recovery":476.4113982521,"RC":190.56455930084002,"K":1899.1546391090992,"cK":151.93237112872794,"F":124.02326006249999,"G":1912.4734713894206,"paid_event_frequency":0.129465},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1562.6127697499753,"EL_M1":1195.8855822499997,"EL_M2":366.7271875,"expected_recovery":576.1588697580445,"RC":230.4635479032178,"K":3205.6488060106153,"cK":256.45190448084924,"F":131.06885381249998,"G":2907.4627679287237,"paid_event_frequency":0.322165},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":929.4895873998885,"EL_M1":744.9626657499999,"EL_M2":184.52692165,"expected_recovery":298.12662196131964,"RC":119.25064878452787,"K":1917.8992537546621,"cK":153.431940300373,"F":135.005355375,"G":1782.9033758130524,"paid_event_frequency":0.42983},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":468.6860537999998,"EL_M1":289.13052505,"EL_M2":179.55552875,"expected_recovery":222.95310235938277,"RC":89.18124094375311,"K":735.3954264244269,"cK":58.83163411395415,"F":124.33184756249999,"G":988.0410352269428,"paid_event_frequency":0.137905},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1065.3863107000343,"EL_M1":834.5838107000001,"EL_M2":230.8025,"expected_recovery":297.36806109689826,"RC":118.9472244387593,"K":1876.6658594236328,"cK":150.13326875389063,"F":135.0157756875,"G":1959.3101061069126,"paid_event_frequency":0.430115},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1065.5859190000374,"EL_M1":834.8197939999999,"EL_M2":230.766125,"expected_recovery":299.4420273519605,"RC":119.77681094078422,"K":1810.4733041002578,"cK":144.83786432802063,"F":135.004624125,"G":1953.6069578584563,"paid_event_frequency":0.42981},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":699.5064396999923,"EL_M1":524.36604115,"EL_M2":175.14039855000001,"expected_recovery":299.1369785844282,"RC":119.6547914337713,"K":1184.7575735611288,"cK":94.7806058848903,"F":125.44791787499999,"G":1385.8530065248717,"paid_event_frequency":0.16843},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":677.9690328999912,"EL_M1":511.04307455000014,"EL_M2":166.92595835,"expected_recovery":267.9850639315382,"RC":107.19402557261529,"K":1204.479900058468,"cK":96.35839200467744,"F":130.95605849999998,"G":1349.9700119697118,"paid_event_frequency":0.31908},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":2753.724605650004,"EL_M1":2199.1649368500002,"EL_M2":554.5596687999999,"expected_recovery":948.343794348094,"RC":379.3375177392376,"K":5041.686970128938,"cK":403.33495761031503,"F":134.864224125,"G":4895.015073499409,"paid_event_frequency":0.42597},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1537.5775020999724,"EL_M1":1171.9709188000002,"EL_M2":365.60658329999995,"expected_recovery":612.8508936604076,"RC":245.14035746416303,"K":2790.767650223879,"cK":223.26141201791035,"F":130.9529506875,"G":2849.2429630260613,"paid_event_frequency":0.318995},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":319.3090205999989,"EL_M1":222.29760284999998,"EL_M2":97.01141775,"expected_recovery":163.64957276884167,"RC":65.45982910753666,"K":561.1505328455353,"cK":44.89204262764282,"F":123.97188974999999,"G":738.1770427802379,"paid_event_frequency":0.12806},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":2306.7651504000046,"EL_M1":1756.8051973,"EL_M2":549.9599531,"expected_recovery":920.9830711449379,"RC":368.39322845797517,"K":4213.700833400661,"cK":337.0960666720529,"F":130.9533163125,"G":4190.94368245671,"paid_event_frequency":0.319005},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1822.516254150004,"EL_M1":1453.2963833499998,"EL_M2":369.21987079999997,"expected_recovery":327.0348696447413,"RC":130.81394785789652,"K":2564.7865023057007,"cK":205.18292018445607,"F":134.92107881249999,"G":3057.9122680064756,"paid_event_frequency":0.427525},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":152.45048275000119,"EL_M1":93.8915526,"EL_M2":58.558930149999995,"expected_recovery":54.50269174520783,"RC":21.801076698083133,"K":215.5595948288431,"cK":17.24476758630745,"F":124.27151943749999,"G":421.0237952958557,"paid_event_frequency":0.136255},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":1580.849199900016,"EL_M1":1228.7991998999998,"EL_M2":352.05,"expected_recovery":323.5121920106144,"RC":129.40487680424576,"K":2139.9016846081577,"cK":171.1921347686526,"F":134.9313163125,"G":2688.5033703805525,"paid_event_frequency":0.427805},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1049.6645813000368,"EL_M1":820.5495813,"EL_M2":229.115,"expected_recovery":210.45148519949294,"RC":84.18059407979717,"K":1353.9420901510323,"cK":108.31536721208259,"F":134.92071318749998,"G":1836.108341039222,"paid_event_frequency":0.427515},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":693.5394436499923,"EL_M1":517.4572451,"EL_M2":176.08219855000004,"expected_recovery":136.95712169992703,"RC":54.78284867997081,"K":885.1562946307945,"cK":70.81250357046356,"F":125.496911625,"G":1259.5089433672356,"paid_event_frequency":0.16977},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":1346.8568247499563,"EL_M1":1011.5534497499999,"EL_M2":335.303375,"expected_recovery":240.54169240780516,"RC":96.21667696312207,"K":1524.351853315266,"cK":121.94814826522128,"F":131.0103538125,"G":2261.3760050543997,"paid_event_frequency":0.320565},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":1380.6906859999556,"EL_M1":1014.6311505999998,"EL_M2":366.0595354,"expected_recovery":457.34199899762814,"RC":182.93679959905126,"K":2737.6755086301487,"cK":219.0140406904119,"F":130.39116787499998,"G":2550.710258885892,"paid_event_frequency":0.30363},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":610.5913165999859,"EL_M1":424.18687385000004,"EL_M2":186.40444275,"expected_recovery":156.59978803373872,"RC":62.63991521349549,"K":1285.442397658967,"cK":102.83539181271736,"F":130.40250225,"G":1208.625501168265,"paid_event_frequency":0.30394},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":753.9843984500003,"EL_M1":461.59856990000003,"EL_M2":292.38582855000004,"expected_recovery":377.71348642356753,"RC":151.08539456942702,"K":1242.9571191145142,"cK":99.43656952916113,"F":123.466596,"G":1503.9639447314514,"paid_event_frequency":0.11424},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":1221.808051099954,"EL_M1":848.3074806999999,"EL_M2":373.5005704,"expected_recovery":313.87125467815986,"RC":125.54850187126395,"K":2585.0213542299434,"cK":206.80170833839549,"F":130.401771,"G":2246.0800430794843,"paid_event_frequency":0.30392},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":691.4917203499913,"EL_M1":507.8413620000001,"EL_M2":183.65035835,"expected_recovery":228.64673381956766,"RC":91.45869352782707,"K":1368.3857875507888,"cK":109.4708630040631,"F":130.3909850625,"G":1363.7496825925086,"paid_event_frequency":0.303625},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":395.99653924999757,"EL_M1":210.00448549999996,"EL_M2":185.99205374999997,"expected_recovery":138.3658235616565,"RC":55.3463294246626,"K":847.4783531556384,"cK":67.79826825245107,"F":122.9296756875,"G":856.0944168194816,"paid_event_frequency":0.099555},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":785.3928031999998,"EL_M1":551.4778031999999,"EL_M2":233.915,"expected_recovery":226.55468003281237,"RC":90.62187201312496,"K":1536.5199598632116,"cK":122.92159678905693,"F":130.3229788125,"G":1505.6790010862424,"paid_event_frequency":0.301765},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":393.1676659999962,"EL_M1":275.21704099999994,"EL_M2":117.950625,"expected_recovery":75.56943211057421,"RC":30.227772844229687,"K":819.4710879010496,"cK":65.55768703208398,"F":130.3343131875,"G":825.7165854184132,"paid_event_frequency":0.302075},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":774.3397998999992,"EL_M1":510.2077159500001,"EL_M2":264.13208395,"expected_recovery":315.8618383761747,"RC":126.34473535046989,"K":1442.289456016432,"cK":115.38315648131457,"F":123.68341162499999,"G":1519.668137809045,"paid_event_frequency":0.12017},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1084.6512087999686,"EL_M1":747.5045837999998,"EL_M2":337.146625,"expected_recovery":235.66801596453126,"RC":94.26720638581251,"K":2234.161172164574,"cK":178.73289377316593,"F":130.3301085,"G":1983.9752232785959,"paid_event_frequency":0.30196},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1372.6416434999535,"EL_M1":1006.6275872499998,"EL_M2":366.01405625,"expected_recovery":395.60344564295167,"RC":158.24137825718068,"K":2598.026823633789,"cK":207.8421458907031,"F":130.317311625,"G":2492.05663903045,"paid_event_frequency":0.30161},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":1218.5046126499533,"EL_M1":852.7799876499997,"EL_M2":365.724625,"expected_recovery":335.35101781758476,"RC":134.1404071270339,"K":2140.4293526883707,"cK":171.23434821506967,"F":130.3573475625,"G":2205.648954072743,"paid_event_frequency":0.302705},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":255.16117824999816,"EL_M1":155.7580233,"EL_M2":99.40315495000003,"expected_recovery":65.0032505602658,"RC":26.00130022410632,"K":592.050285105384,"cK":47.36402280843072,"F":123.46421943749999,"G":602.6542942933803,"paid_event_frequency":0.114175},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":1828.3060588000033,"EL_M1":1278.1278088000001,"EL_M2":550.17825,"expected_recovery":504.36155431894304,"RC":201.74462172757723,"K":3204.002576240624,"cK":256.3202060992499,"F":130.3569819375,"G":3222.3038247524405,"paid_event_frequency":0.302695},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":1381.3628353499507,"EL_M1":1014.04988535,"EL_M2":367.31295,"expected_recovery":263.7832522789415,"RC":105.51330091157661,"K":1362.0345593616973,"cK":108.9627647489358,"F":130.362649125,"G":2301.6020668472843,"paid_event_frequency":0.30285},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":265.4142414999989,"EL_M1":142.55313345000002,"EL_M2":122.86110805,"expected_recovery":105.27122591586689,"RC":42.10849036634676,"K":478.4916666953882,"cK":38.27933333563106,"F":122.91761006249999,"G":624.9595670193023,"paid_event_frequency":0.099225},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":397.48574629999615,"EL_M1":280.0219962999999,"EL_M2":117.46375,"expected_recovery":50.99494437877672,"RC":20.39797775151069,"K":903.2760520972129,"cK":72.26208416777703,"F":130.4352256875,"G":827.4413785423785,"paid_event_frequency":0.304835},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":1197.051128100008,"EL_M1":841.5755031,"EL_M2":355.475625,"expected_recovery":291.0973360021204,"RC":116.43893440084817,"K":2501.448711666552,"cK":200.11589693332417,"F":130.440161625,"G":2192.061494745574,"paid_event_frequency":0.30497},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":526.0672958000018,"EL_M1":347.59561114999997,"EL_M2":178.47168465,"expected_recovery":102.89235640288553,"RC":41.15694256115421,"K":1219.686585597575,"cK":97.574926847806,"F":123.7399006875,"G":1051.3854211952828,"paid_event_frequency":0.121715},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":1092.1274728999679,"EL_M1":751.1913478999999,"EL_M2":340.936125,"expected_recovery":281.10463660208416,"RC":112.44185464083367,"K":2311.528869413344,"cK":184.92230955306755,"F":130.3887913125,"G":2026.507237875159,"paid_event_frequency":0.303565},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":693.8038048999912,"EL_M1":506.39739865,"EL_M2":187.40640625,"expected_recovery":97.29308150150587,"RC":38.91723260060235,"K":1656.911612267742,"cK":132.55292898141937,"F":130.382392875,"G":1327.5418124760172,"paid_event_frequency":0.30339},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":1828.7181366000032,"EL_M1":1265.7335428500003,"EL_M2":562.98459375,"expected_recovery":465.25761114058923,"RC":186.1030444562357,"K":3995.3344003294483,"cK":319.62675202635586,"F":130.387146,"G":3286.4467721101264,"paid_event_frequency":0.30352},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":507.81995695000364,"EL_M1":308.45398205,"EL_M2":199.3659749,"expected_recovery":136.1849899720595,"RC":54.4739959888238,"K":963.4407204683886,"cK":77.07525763747108,"F":123.4327756875,"G":1017.069315018398,"paid_event_frequency":0.113315},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":1221.1223975999524,"EL_M1":849.9698351,"EL_M2":371.1525625,"expected_recovery":104.80358963501817,"RC":41.92143585400727,"K":2307.686230812501,"cK":184.6148984650001,"F":130.3741663125,"G":2104.043864308613,"paid_event_frequency":0.303165},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":1392.945245399952,"EL_M1":1019.1410954,"EL_M2":373.80415,"expected_recovery":197.96591479805102,"RC":79.1863659192204,"K":1609.6470993510875,"cK":128.771767948087,"F":130.4450975625,"G":2308.4646357730126,"paid_event_frequency":0.305105},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":263.32081250000084,"EL_M1":142.2091294,"EL_M2":121.11168309999996,"expected_recovery":45.46853913622377,"RC":18.18741565448951,"K":632.1781363275085,"cK":50.57425090620068,"F":122.94576318749999,"G":606.7043229975881,"paid_event_frequency":0.099995},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":795.878919549999,"EL_M1":558.7976695499999,"EL_M2":237.08125,"expected_recovery":56.56532382233422,"RC":22.62612952893369,"K":1511.782672021058,"cK":120.94261376168464,"F":130.466121,"G":1426.5517117874897,"paid_event_frequency":0.30568},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":783.2704100999993,"EL_M1":549.7141601,"EL_M2":233.55625,"expected_recovery":60.794405290973714,"RC":24.31776211638949,"K":1626.3604262240506,"cK":130.10883409792405,"F":130.35716474999998,"G":1424.0722280857506,"paid_event_frequency":0.3027},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":525.8607878500005,"EL_M1":344.93525330000006,"EL_M2":180.92553454999998,"expected_recovery":43.56529100261923,"RC":17.426116401047693,"K":1011.4437789048108,"cK":80.91550231238486,"F":123.69145537499999,"G":997.1918159179108,"paid_event_frequency":0.12039},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1088.2468151999667,"EL_M1":750.0000652,"EL_M2":338.24675,"expected_recovery":41.164266567020604,"RC":16.46570662680824,"K":1461.16776745816,"cK":116.8934213966528,"F":130.3887913125,"G":1802.6596460479038,"paid_event_frequency":0.303565}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":102997.76849860001,"expected_recovery":31002.3182319,"reinsurance_premium":43403.24552466,"RC":12400.92729276,"mean_net":71995.4502667,"net_TVaR":241104.75798000002,"net_VaR":213149.24,"K":169109.30771330002,"cK":13528.744617064001,"F":13030.360434375,"G":189277.0677903987,"average_premium":1892.770677903987,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.4108,"tail_reduction":0.5487744137325119},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":0.5,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"m1High":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":4902.772518402067,"EL_M1":4533.37521335,"EL_M2":369.3973050500001,"expected_recovery":1441.9417903885155,"RC":576.7767161554062,"K":4456.312218241781,"cK":356.5049774593425,"F":176.9935475625,"G":8017.3970127724215,"paid_event_frequency":1.578225},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1863.2817169499929,"EL_M1":1682.2033419500003,"EL_M2":181.078375,"expected_recovery":665.0755819972962,"RC":266.0302327989185,"K":1670.4623334353373,"cK":133.636986674827,"F":161.222130375,"G":3232.228089064984,"paid_event_frequency":1.14687},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2131.4902329500096,"EL_M1":1841.3774798999998,"EL_M2":290.11275305,"expected_recovery":1159.8337805185129,"RC":463.93351220740516,"K":1606.3513574418744,"cK":128.50810859534994,"F":133.990380375,"G":3810.5629788370193,"paid_event_frequency":0.40207},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":3726.6883291497143,"EL_M1":3364.7286417499995,"EL_M2":361.95968739999995,"expected_recovery":1330.0472528507948,"RC":532.018901140318,"K":3358.6948836606794,"cK":268.69559069285435,"F":161.2223131875,"G":6251.500178893849,"paid_event_frequency":1.146875},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":2450.763983350355,"EL_M1":2266.99675,"EL_M2":183.76723335,"expected_recovery":718.2242486931248,"RC":287.28969947724994,"K":2222.8839432926243,"cK":177.83071546340994,"F":176.99299912499998,"G":4123.83652988802,"paid_event_frequency":1.57821},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1125.8250200000089,"EL_M1":945.2306576500001,"EL_M2":180.59436234999998,"expected_recovery":433.3344077027858,"RC":173.33376308111434,"K":936.424449368314,"cK":74.91395594946512,"F":136.93293037499998,"G":2014.6742258741178,"paid_event_frequency":0.48255},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":3181.168973450089,"EL_M1":2945.9636713500004,"EL_M2":235.2053021,"expected_recovery":601.090511040039,"RC":240.4362044160156,"K":2798.164054579425,"cK":223.853124366354,"F":177.0970194375,"G":5096.7404288932785,"paid_event_frequency":1.581055},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1585.3508710499864,"EL_M1":1471.4835533499997,"EL_M2":113.8673177,"expected_recovery":289.8373694188472,"RC":115.93494776753887,"K":1381.976891772219,"cK":110.55815134177752,"F":177.084771,"G":2651.904988212404,"paid_event_frequency":1.58072},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2723.489158150025,"EL_M1":2457.52252,"EL_M2":265.96663815,"expected_recovery":1098.3444809449202,"RC":439.33779237796807,"K":2314.895982531023,"cK":185.19167860248186,"F":140.355546,"G":4651.165566840634,"paid_event_frequency":0.57616},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":3325.1756648998785,"EL_M1":2992.94360245,"EL_M2":332.23206245,"expected_recovery":1144.1861139380148,"RC":457.67444557520594,"K":3010.8780690476888,"cK":240.8702455238151,"F":161.2380350625,"G":5579.944521415199,"paid_event_frequency":1.147305},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":2451.3872551503755,"EL_M1":2266.6886028,"EL_M2":184.69865234999995,"expected_recovery":720.9708940104315,"RC":288.3883576041726,"K":2228.156370810204,"cK":178.25250966481633,"F":176.9935475625,"G":4126.695559975819,"paid_event_frequency":1.578225},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":5589.845579200027,"EL_M1":5046.61045415,"EL_M2":543.23512505,"expected_recovery":1995.2267442389607,"RC":798.0906976955844,"K":5011.387292048454,"cK":400.9109833638763,"F":161.222130375,"G":9266.759187512649,"paid_event_frequency":1.14687},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1420.6841526499718,"EL_M1":1227.17861655,"EL_M2":193.50553609999994,"expected_recovery":658.7490658485631,"RC":263.4996263394252,"K":1216.8738078630843,"cK":97.34990462904675,"F":133.9717335,"G":2554.0072228245917,"paid_event_frequency":0.40156},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1857.2225191999967,"EL_M1":1676.1661389499998,"EL_M2":181.05638025000002,"expected_recovery":566.1799517458953,"RC":226.47198069835815,"K":1607.3596487234752,"cK":128.58877189787802,"F":161.2678335,"G":3164.734807061644,"paid_event_frequency":1.14812},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":7334.2344475499485,"EL_M1":6781.80957875,"EL_M2":552.4248688,"expected_recovery":1827.719359558214,"RC":731.0877438232856,"K":6369.166344276766,"cK":509.5333075421413,"F":177.104149125,"G":11669.2795307205,"paid_event_frequency":1.58125},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":753.5202573499987,"EL_M1":631.51602295,"EL_M2":122.00423440000002,"expected_recovery":252.89767919995882,"RC":101.15907167998353,"K":601.7763360140601,"cK":48.14210688112481,"F":136.90569131249998,"G":1386.302836298143,"paid_event_frequency":0.481805},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1588.3562323999681,"EL_M1":1472.8351490999996,"EL_M2":115.5210833,"expected_recovery":264.09278744969765,"RC":105.63711497987907,"K":1295.8137577806904,"cK":103.66510062245523,"F":177.191899125,"G":2633.1337961697363,"paid_event_frequency":1.58365},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":4761.536649250074,"EL_M1":4417.9242277,"EL_M2":343.61242155,"expected_recovery":775.2354329700347,"RC":310.0941731880139,"K":3951.0508698013427,"cK":316.08406958410745,"F":177.17745693749998,"G":7419.856465279594,"paid_event_frequency":1.583255},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1812.9771223500013,"EL_M1":1635.8450550500002,"EL_M2":177.13206729999996,"expected_recovery":626.4206793241899,"RC":250.56827172967598,"K":1634.0435638351423,"cK":130.72348510681138,"F":140.314961625,"G":3112.7784544153183,"paid_event_frequency":0.57505},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1658.6712493500554,"EL_M1":1493.1828118,"EL_M2":165.48843755000001,"expected_recovery":491.9983889114744,"RC":196.79935556458977,"K":1491.5050596771864,"cK":119.32040477417492,"F":161.285017875,"G":2848.101370085094,"paid_event_frequency":1.14859},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":7338.621991449934,"EL_M1":6783.46585855,"EL_M2":555.1561329,"expected_recovery":1839.5786305755564,"RC":735.8314522302226,"K":6392.675301460028,"cK":511.41402411680224,"F":177.10451475,"G":11683.962643395947,"paid_event_frequency":1.58126},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":3757.9316655497096,"EL_M1":3390.36993645,"EL_M2":367.5617291,"expected_recovery":920.1064374877792,"RC":368.0425749951117,"K":2735.6764641102877,"cK":218.85411712882302,"F":161.4431506875,"G":6008.362011148193,"paid_event_frequency":1.152915},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":719.1032574499973,"EL_M1":622.5144179,"EL_M2":96.58883955000002,"expected_recovery":253.48507403050309,"RC":101.39402961220124,"K":550.8547989556705,"cK":44.06838391645364,"F":134.0084788125,"G":1331.4321997215363,"paid_event_frequency":0.402565},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":5636.953966400001,"EL_M1":5085.033013250001,"EL_M2":551.92095315,"expected_recovery":1380.624869676908,"RC":552.2499478707632,"K":4114.354701933886,"cK":329.1483761547109,"F":161.442236625,"G":8906.392702733967,"paid_event_frequency":1.15289},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":4923.420608452162,"EL_M1":4561.2569748999995,"EL_M2":362.16363355000004,"expected_recovery":894.5490738727312,"RC":357.8196295490925,"K":3549.9239163957873,"cK":283.993913311663,"F":177.313286625,"G":7656.729917250556,"paid_event_frequency":1.58697},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":378.1071485500039,"EL_M1":318.7468359,"EL_M2":59.36031265,"expected_recovery":100.7432901866652,"RC":40.297316074666085,"K":247.84606392421796,"cK":19.827685113937438,"F":136.9704069375,"G":766.9367422348099,"paid_event_frequency":0.483575},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":4787.299509150069,"EL_M1":4442.34321225,"EL_M2":344.9562969,"expected_recovery":565.5145788125628,"RC":226.20583152502513,"K":3138.9843988346192,"cK":251.11875190676955,"F":177.41456474999998,"G":7256.051543109152,"paid_event_frequency":1.58974},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":3179.5261213500744,"EL_M1":2945.55700085,"EL_M2":233.96912049999997,"expected_recovery":246.1052772727071,"RC":98.44211090908284,"K":1323.5713019013383,"cK":105.88570415210707,"F":177.23321475,"G":4748.116201548352,"paid_event_frequency":1.58478},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":907.9564194499733,"EL_M1":819.44196525,"EL_M2":88.51445420000002,"expected_recovery":102.29150656973616,"RC":40.91660262789446,"K":644.9256000271437,"cK":51.5940480021715,"F":140.400517875,"G":1521.1567839400523,"paid_event_frequency":0.57739},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":4983.445226500019,"EL_M1":4480.08483505,"EL_M2":503.36039145,"expected_recovery":573.6386621450538,"RC":229.45546485802151,"K":3444.2152532687724,"cK":275.5372202615018,"F":161.4025663125,"G":7533.120637242723,"paid_event_frequency":1.151805},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":5776.412986899886,"EL_M1":5401.088189000001,"EL_M2":375.32479789999996,"expected_recovery":1111.458158677915,"RC":444.583263471166,"K":4834.085501792131,"cK":386.7268401433705,"F":192.7823319375,"G":9067.34056326923,"paid_event_frequency":2.010055},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":2308.036382349578,"EL_M1":2119.0955174500004,"EL_M2":188.94086489999998,"expected_recovery":517.9255572920422,"RC":207.1702229168169,"K":1921.1914609035005,"cK":153.69531687228005,"F":177.0275506875,"G":3794.5726304349005,"paid_event_frequency":1.579155},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":2460.944349950026,"EL_M1":2161.30420685,"EL_M2":299.6401431,"expected_recovery":917.9722361538213,"RC":367.18889446152855,"K":1923.0360799400803,"cK":153.84288639520642,"F":138.892680375,"G":4161.158414909015,"paid_event_frequency":0.53615},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":4618.223884447483,"EL_M1":4237.838061899999,"EL_M2":380.38582255,"expected_recovery":1038.0352527417217,"RC":415.2141010966887,"K":3875.7541125172447,"cK":310.06032900137956,"F":177.02663662499998,"G":7360.699934894069,"paid_event_frequency":1.57913},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":2888.4807169499727,"EL_M1":2700.8294560500003,"EL_M2":187.65126090000004,"expected_recovery":553.7436935664082,"RC":221.49747742656328,"K":2405.671657174852,"cK":192.45373257398816,"F":192.7892788125,"G":4660.294941017365,"paid_event_frequency":2.010245},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1365.7053978500285,"EL_M1":1179.66362035,"EL_M2":186.0417775,"expected_recovery":388.80981300942153,"RC":155.5239252037686,"K":1084.5786572073473,"cK":86.76629257658779,"F":141.55260225,"G":2332.7309571738465,"paid_event_frequency":0.6089},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3831.7763646999497,"EL_M1":3595.0402039,"EL_M2":236.73616080000002,"expected_recovery":516.5560575900649,"RC":206.622423036026,"K":3038.5086618606847,"cK":243.0806929488548,"F":192.93022725,"G":5965.879610579774,"paid_event_frequency":2.0141},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3831.8771299999385,"EL_M1":3593.6890257999994,"EL_M2":238.18810420000003,"expected_recovery":519.3297331572799,"RC":207.73189326291197,"K":3097.5086332556302,"cK":247.8006906604504,"F":192.932786625,"G":5973.790000731067,"paid_event_frequency":2.01417},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":2013.5455883500185,"EL_M1":1832.6601441000003,"EL_M2":180.88544425,"expected_recovery":577.2177168846667,"RC":230.8870867538667,"K":1512.80218933313,"cK":121.02417514665039,"F":145.118542875,"G":3347.4338575007146,"paid_event_frequency":0.70643},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":2082.503134949763,"EL_M1":1912.5641255000005,"EL_M2":169.93900945000001,"expected_recovery":464.7282722940579,"RC":185.89130891762318,"K":1579.9650466997384,"cK":126.39720373597908,"F":177.1624663125,"G":3429.27215188782,"paid_event_frequency":1.582845},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":8672.501518298368,"EL_M1":8108.950766299999,"EL_M2":563.550752,"expected_recovery":1705.9485450070506,"RC":682.3794180028203,"K":6600.387766470928,"cK":528.0310213176742,"F":192.913042875,"G":13434.433333991816,"paid_event_frequency":2.01363},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":4620.508769747369,"EL_M1":4242.6666106,"EL_M2":377.84215915,"expected_recovery":1079.059543824474,"RC":431.6238175297897,"K":3544.460856156534,"cK":283.55686849252277,"F":177.1343131875,"G":7350.431691942908,"paid_event_frequency":1.582075},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":816.2344941500327,"EL_M1":716.3546183500001,"EL_M2":99.87987580000002,"expected_recovery":306.02767107955304,"RC":122.41106843182122,"K":614.2795379530526,"cK":49.142363036244205,"F":138.8603225625,"G":1502.1976642407974,"paid_event_frequency":0.535265},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":6930.8680526991275,"EL_M1":6360.599052550001,"EL_M2":570.26900015,"expected_recovery":1621.2725010129761,"RC":648.5090004051905,"K":5310.646004486606,"cK":424.8516803589285,"F":177.13120537499998,"G":10908.479918450996,"paid_event_frequency":1.58199},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":5821.896934549815,"EL_M1":5446.63897155,"EL_M2":375.25796299999996,"expected_recovery":489.5638617465711,"RC":195.82554469862845,"K":3565.4422705258376,"cK":285.235381642067,"F":193.2185225625,"G":8661.568511270681,"paid_event_frequency":2.021985},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":458.65172224999844,"EL_M1":396.56435260000006,"EL_M2":62.08736965,"expected_recovery":79.70741864223373,"RC":31.882967456893496,"K":334.93414135934177,"cK":26.79473130874734,"F":141.624996,"G":878.6058893541857,"paid_event_frequency":0.61088},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":5789.119644249918,"EL_M1":5438.5045817499995,"EL_M2":350.6150625,"expected_recovery":443.8319441246558,"RC":177.53277764986234,"K":3555.241140882061,"cK":284.4192912705649,"F":193.36331006249998,"G":8592.580030977128,"paid_event_frequency":2.025945},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":3862.354858799956,"EL_M1":3624.79681945,"EL_M2":237.55803935000003,"expected_recovery":296.23157182846035,"RC":118.49262873138414,"K":2356.5733723380845,"cK":188.52586978704676,"F":193.3651381875,"G":5816.984660674516,"paid_event_frequency":2.025995},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":2023.8138882000244,"EL_M1":1842.8445448000002,"EL_M2":180.96934339999999,"expected_recovery":172.65752348538786,"RC":69.06300939415515,"K":1452.1404057529405,"cK":116.17123246023525,"F":145.31598037499998,"G":3139.1521472392196,"paid_event_frequency":0.71183},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":4174.899072398137,"EL_M1":3834.3040829999995,"EL_M2":340.5949894,"expected_recovery":290.54970960654964,"RC":116.21988384261986,"K":2299.397030198103,"cK":183.95176241584824,"F":177.37014131249998,"G":6203.254479958807,"paid_event_frequency":1.588525},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":6144.5627682510885,"EL_M1":5771.96459625,"EL_M2":372.59817200000003,"expected_recovery":1567.4391974154996,"RC":626.9756789661999,"K":6051.686441943168,"cK":484.1349153554534,"F":179.29643662499998,"G":9913.293065596989,"paid_event_frequency":1.64121},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":2498.293994599855,"EL_M1":2308.54544505,"EL_M2":189.74854954999998,"expected_recovery":747.7364163348761,"RC":299.09456653395046,"K":2540.7232488566265,"cK":203.25785990853012,"F":163.6489663125,"G":4219.060516473114,"paid_event_frequency":1.213245},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":2969.5522001000186,"EL_M1":2670.58457875,"EL_M2":298.96762135,"expected_recovery":1241.6205471910505,"RC":496.64821887642023,"K":3011.5463002467022,"cK":240.9237040197362,"F":136.164021,"G":5124.3841919949,"paid_event_frequency":0.46152},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":4999.091491549416,"EL_M1":4618.351225049999,"EL_M2":380.74026649999996,"expected_recovery":1497.8018836278557,"RC":599.1207534511423,"K":5076.173384609976,"cK":406.09387076879807,"F":163.6471381875,"G":8223.937671942474,"paid_event_frequency":1.213195},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":3071.6805727497963,"EL_M1":2885.07643835,"EL_M2":186.60413439999996,"expected_recovery":781.779116497095,"RC":312.711646598838,"K":3026.0517105778667,"cK":242.08413684622934,"F":179.29698506249997,"G":5074.364455009818,"paid_event_frequency":1.641225},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1331.2993913000043,"EL_M1":1144.1494515499999,"EL_M2":187.14993975000002,"expected_recovery":501.27196672983337,"RC":200.50878669193335,"K":1134.5284175063239,"cK":90.76227340050592,"F":137.97843506249998,"G":2347.398515273258,"paid_event_frequency":0.511145},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3518.206602500218,"EL_M1":3282.8950551,"EL_M2":235.3115474,"expected_recovery":691.8542905983113,"RC":276.74171623932455,"K":3224.7573863004695,"cK":257.98059090403757,"F":179.561149125,"G":5643.320078358106,"paid_event_frequency":1.64845},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3526.115963400222,"EL_M1":3282.3842133999997,"EL_M2":243.73175,"expected_recovery":699.8630660525196,"RC":279.9452264210078,"K":3219.881188515274,"cK":257.59049508122195,"F":179.56791318749998,"G":5657.626130786602,"paid_event_frequency":1.648635},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2252.7106498499443,"EL_M1":2071.2196598,"EL_M2":181.49099005000002,"expected_recovery":790.2269931417509,"RC":316.0907972567004,"K":2042.351754018333,"cK":163.38814032146664,"F":142.2558819375,"G":3832.5939591541483,"paid_event_frequency":0.628135},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":2180.7479733499326,"EL_M1":2007.5012754000002,"EL_M2":173.24669795000003,"expected_recovery":712.9891819016179,"RC":285.1956727606472,"K":1994.8060902064612,"cK":159.5844872165169,"F":163.7277585,"G":3719.007855769463,"paid_event_frequency":1.2154},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":9187.679573049865,"EL_M1":8628.2553512,"EL_M2":559.42422185,"expected_recovery":2575.6829948275217,"RC":1030.2731979310088,"K":8024.447171178671,"cK":641.9557736942937,"F":179.4613335,"G":14719.15983756689,"paid_event_frequency":1.64572},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":4973.974808799401,"EL_M1":4594.6502404,"EL_M2":379.3245684,"expected_recovery":1662.313378764632,"RC":664.9253515058529,"K":4506.7677296897355,"cK":360.54141837517886,"F":163.66962412499998,"G":8217.481603740578,"paid_event_frequency":1.21381},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":978.2881836000179,"EL_M1":878.6278915999997,"EL_M2":99.660292,"expected_recovery":431.02060173447046,"RC":172.4082406937882,"K":912.7266427699116,"cK":73.01813142159293,"F":136.1046069375,"G":1813.092216870532,"paid_event_frequency":0.459895},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":7462.1372443998835,"EL_M1":6891.1734614,"EL_M2":570.9637829999999,"expected_recovery":2496.264027790704,"RC":998.5056111162817,"K":6727.267857771936,"cK":538.1814286217549,"F":163.66852725,"G":12216.657081850559,"paid_event_frequency":1.21378},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":6155.23860310094,"EL_M1":5782.262377449999,"EL_M2":372.97622565000006,"expected_recovery":563.9271039003888,"RC":225.57084156015554,"K":4404.137670518126,"cK":352.33101364145006,"F":179.602099125,"G":9216.99007657006,"paid_event_frequency":1.64957},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":445.8988097000088,"EL_M1":384.412125,"EL_M2":61.486684700000005,"expected_recovery":97.3779228294809,"RC":38.95116913179236,"K":399.32338666004017,"cK":31.945870932803214,"F":138.105124125,"G":873.2012985194725,"paid_event_frequency":0.51461},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":5316.040274350079,"EL_M1":4963.44550875,"EL_M2":352.5947656,"expected_recovery":570.548760649298,"RC":228.2195042597192,"K":3963.572909487124,"cK":317.0858327589699,"F":179.8732100625,"G":8054.958428575024,"paid_event_frequency":1.656985},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":3546.379606800221,"EL_M1":3305.8703064500005,"EL_M2":240.50930035,"expected_recovery":381.64554386440705,"RC":152.65821754576282,"K":2600.0374813387316,"cK":208.00299850709854,"F":179.88198506249998,"G":5449.230410554111,"paid_event_frequency":1.657225},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":2250.796726899958,"EL_M1":2070.813754500001,"EL_M2":179.98297240000005,"expected_recovery":170.9416601619314,"RC":68.37666406477256,"K":1512.5761071318907,"cK":121.00608857055126,"F":142.2580756875,"G":3443.2500736303755,"paid_event_frequency":0.628195},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":4354.313081049632,"EL_M1":4008.6754155500003,"EL_M2":345.63766549999997,"expected_recovery":291.89794298445577,"RC":116.7591771937823,"K":2653.561154688461,"cK":212.28489237507688,"F":163.7707194375,"G":6462.837160074655,"paid_event_frequency":1.216575},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":4375.935696949523,"EL_M1":3999.71663445,"EL_M2":376.2190625,"expected_recovery":1055.77615211786,"RC":422.310460847144,"K":4597.320071910815,"cK":367.78560575286525,"F":161.217742875,"G":7102.999341899376,"paid_event_frequency":1.14675},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1856.4382455999953,"EL_M1":1670.7492872999999,"EL_M2":185.6889583,"expected_recovery":426.03438695911586,"RC":170.41375478364637,"K":1984.2285347507243,"cK":158.73828278005794,"F":161.22688349999999,"G":3129.0895555515995,"paid_event_frequency":1.147},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":2124.7563595500023,"EL_M1":1826.2292840000005,"EL_M2":298.52707554999995,"expected_recovery":868.404775498371,"RC":347.3619101993484,"K":2090.3087569834024,"cK":167.2247005586722,"F":134.0179850625,"G":3697.8146071606975,"paid_event_frequency":0.402825},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":3715.506407449742,"EL_M1":3341.8027095499992,"EL_M2":373.7036979,"expected_recovery":853.3251663837068,"RC":341.33006655348277,"K":3961.5604557065017,"cK":316.92483645652015,"F":161.228346,"G":6046.652875279659,"paid_event_frequency":1.14704},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":2188.7865592499124,"EL_M1":2000.1335914999997,"EL_M2":188.65296775,"expected_recovery":526.4667268662017,"RC":210.5866907464807,"K":2292.6288529255935,"cK":183.41030823404748,"F":161.2208506875,"G":3658.6725452239207,"paid_event_frequency":1.146835},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":1040.7222237500032,"EL_M1":854.7582922500001,"EL_M2":185.96393150000003,"expected_recovery":311.0862881564648,"RC":124.43451526258592,"K":1137.3689283401177,"cK":90.98951426720942,"F":132.35402568749998,"G":1851.3337052897314,"paid_event_frequency":0.357315},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2450.0844815000323,"EL_M1":2211.2398565,"EL_M2":238.844625,"expected_recovery":418.22084990085114,"RC":167.28833996034047,"K":2438.36935656407,"cK":195.0695485251256,"F":161.38483349999998,"G":3965.1029379806646,"paid_event_frequency":1.15132},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":1223.765524400067,"EL_M1":1106.1790244,"EL_M2":117.5865,"expected_recovery":169.13905165718506,"RC":67.65562066287403,"K":1314.7216358050114,"cK":105.17773086440091,"F":161.3784350625,"G":2077.3030813197893,"paid_event_frequency":1.151145},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":2321.9618240499917,"EL_M1":2050.2180883499996,"EL_M2":271.7437357,"expected_recovery":700.3441430143112,"RC":280.13765720572445,"K":2545.142767435212,"cK":203.61142139481697,"F":135.20151318749998,"G":3921.216554450711,"paid_event_frequency":0.435195},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":3331.477029699873,"EL_M1":2995.6424359499997,"EL_M2":335.83459375,"expected_recovery":588.8671909044579,"RC":235.54687636178315,"K":3594.0380792751894,"cK":287.52304634201516,"F":161.33967881249998,"G":5354.515508288229,"paid_event_frequency":1.150085},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":4385.704823799523,"EL_M1":4010.0384100999995,"EL_M2":375.66641369999996,"expected_recovery":832.7232849477045,"RC":333.08931397908185,"K":4477.198917833564,"cK":358.17591342668516,"F":161.32267725,"G":6984.390304607053,"paid_event_frequency":1.14962},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":3733.166494899716,"EL_M1":3357.33938035,"EL_M2":375.82711455,"expected_recovery":574.7128034546631,"RC":229.88512138186525,"K":3452.401606622776,"cK":276.19212852982207,"F":161.5290725625,"G":5867.697089831871,"paid_event_frequency":1.155265},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":709.8896413999987,"EL_M1":608.9260234000002,"EL_M2":100.96361800000001,"expected_recovery":136.71612508089788,"RC":54.686450032359154,"K":816.6742107263378,"cK":65.33393685810702,"F":134.0114038125,"G":1285.2285761372866,"paid_event_frequency":0.402645},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":5599.2728823000025,"EL_M1":5034.722976,"EL_M2":564.5499063,"expected_recovery":862.922122164603,"RC":345.16884886584126,"K":5188.566862799153,"cK":415.0853490239322,"F":161.52870693749998,"G":8694.741049503034,"paid_event_frequency":1.155255},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":4391.746490649509,"EL_M1":4014.960487150001,"EL_M2":376.7860035,"expected_recovery":303.5204875315444,"RC":121.40819501261777,"K":2141.9564698603695,"cK":171.35651758882955,"F":161.440042875,"G":6461.268328167941,"paid_event_frequency":1.15283},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":691.0059756999962,"EL_M1":567.6110667,"EL_M2":123.39490900000003,"expected_recovery":196.83785021696133,"RC":78.73514008678454,"K":729.2925901142241,"cK":58.34340720913793,"F":132.4158163125,"G":1280.6671190778916,"paid_event_frequency":0.359005},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":1224.6634446000637,"EL_M1":1107.7836451499998,"EL_M2":116.87979945000001,"expected_recovery":141.7797844814388,"RC":56.71191379257553,"K":1433.6160900540858,"cK":114.68928720432687,"F":161.354486625,"G":2076.5588429626214,"paid_event_frequency":1.15049},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":3681.2482543500423,"EL_M1":3323.091613650001,"EL_M2":358.1566406999999,"expected_recovery":565.9463116574507,"RC":226.37852466298028,"K":4068.654395435126,"cK":325.49235163481006,"F":161.37258506249998,"G":5859.322287613777,"paid_event_frequency":1.150985},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":1556.1299307499883,"EL_M1":1380.4786102000005,"EL_M2":175.65132055,"expected_recovery":312.2724467992284,"RC":124.90897871969138,"K":1742.1491317036905,"cK":139.37193053629525,"F":135.2499585,"G":2607.5477313413,"paid_event_frequency":0.43652},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":3309.7488143498854,"EL_M1":2964.2888324,"EL_M2":345.45998195,"expected_recovery":596.1776809832518,"RC":238.47107239330072,"K":3365.865839709513,"cK":269.26926717676105,"F":161.1331006875,"G":5304.829672809929,"paid_event_frequency":1.144435},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":2172.767323849915,"EL_M1":1990.7527347000002,"EL_M2":182.01458915000003,"expected_recovery":293.49035677028905,"RC":117.39614270811563,"K":2384.6770470144447,"cK":190.7741637611556,"F":161.09251631249998,"G":3522.706862175582,"paid_event_frequency":1.143325},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":5553.799744250025,"EL_M1":4987.990253849999,"EL_M2":565.8094904,"expected_recovery":1001.1498171135017,"RC":400.45992684540073,"K":5688.240435297648,"cK":455.0592348238119,"F":161.1199381875,"G":8760.585125475649,"paid_event_frequency":1.144075},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":1437.350787049983,"EL_M1":1236.1037067500001,"EL_M2":201.24708029999996,"expected_recovery":219.09065564953107,"RC":87.63626225981244,"K":1498.3195923694861,"cK":119.86556738955889,"F":134.07758193749999,"G":2371.9069315158054,"paid_event_frequency":0.404455},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":3753.0393169997083,"EL_M1":3385.8803059499996,"EL_M2":367.15901104999995,"expected_recovery":239.61130633942048,"RC":95.84452253576819,"K":3450.098416771962,"cK":276.007873341757,"F":161.476605375,"G":5715.1577576696445,"paid_event_frequency":1.15383},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":4398.282009699534,"EL_M1":4021.836278900001,"EL_M2":376.4457308,"expected_recovery":233.0817318464633,"RC":93.23269273858533,"K":2298.984217756145,"cK":183.9187374204916,"F":161.423955375,"G":6449.143193644814,"paid_event_frequency":1.15239},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":690.8881112499979,"EL_M1":566.5512292500001,"EL_M2":124.33688199999999,"expected_recovery":112.00772146166128,"RC":44.803088584664515,"K":747.0411680979447,"cK":59.76329344783558,"F":132.37541475,"G":1237.1065440433306,"paid_event_frequency":0.3579},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":2456.2249458000297,"EL_M1":2219.2143665,"EL_M2":237.0105793,"expected_recovery":194.3282494352261,"RC":77.73129977409044,"K":2553.7711278918423,"cK":204.30169023134738,"F":161.47185224999998,"G":3866.3063840739574,"paid_event_frequency":1.1537},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":2454.605090550034,"EL_M1":2216.7452416,"EL_M2":237.85984894999999,"expected_recovery":174.42543021342635,"RC":69.77017208537055,"K":2457.5757982640357,"cK":196.60606386112286,"F":161.29562099999998,"G":3843.0359299953707,"paid_event_frequency":1.14888},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":1556.6469720999828,"EL_M1":1375.5535847500003,"EL_M2":181.09338734999994,"expected_recovery":96.39867226035267,"RC":38.55946890414107,"K":1336.1127335430217,"cK":106.88901868344173,"F":135.21705225,"G":2449.7500159167544,"paid_event_frequency":0.43562},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":3312.4739572999056,"EL_M1":2975.547811500001,"EL_M2":336.9261458,"expected_recovery":69.82636492090342,"RC":27.93054596836137,"K":1966.587210350278,"cK":157.32697682802223,"F":161.35613193749998,"G":4878.783482711719,"paid_event_frequency":1.150535}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":326066.26062215003,"expected_recovery":68577.5572349,"reinsurance_premium":96008.58012885999,"RC":27431.02289395999,"mean_net":257488.70338725,"net_TVaR":532482.908285,"net_VaR":492244.62000000005,"K":274994.20489775005,"cK":21999.536391820006,"F":16114.183912499999,"G":522148.0050939067,"average_premium":5221.480050939067,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.795945,"tail_reduction":0.3709669470577841},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":2.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"concentrated":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2651.6279733496676,"EL_M1":2277.7220455500005,"EL_M2":373.90592780000003,"expected_recovery":1598.4272366811851,"RC":639.3708946724742,"K":3233.1718409731043,"cK":258.65374727784837,"F":148.61190693749998,"G":4931.01936298332,"paid_event_frequency":0.801975},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1036.0765396500678,"EL_M1":845.8758425,"EL_M2":190.20069715,"expected_recovery":699.3174155424449,"RC":279.726966216978,"K":1218.8806579835561,"cK":97.5104526386845,"F":140.759196,"G":2072.0975393409735,"paid_event_frequency":0.5872},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1220.4243584000087,"EL_M1":924.2885822,"EL_M2":296.13577620000007,"expected_recovery":975.6741759403183,"RC":390.26967037612735,"K":1305.4283555440966,"cK":104.43426844352773,"F":126.964896,"G":2456.1242576262184,"paid_event_frequency":0.20992},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2070.3565594000347,"EL_M1":1691.7117173499998,"EL_M2":378.64484204999997,"expected_recovery":1397.8101483124888,"RC":559.1240593249955,"K":2416.3358093659417,"cK":193.30686474927535,"F":140.7586475625,"G":3951.3948413824073,"paid_event_frequency":0.587185},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1327.2377547495776,"EL_M1":1139.55034425,"EL_M2":187.6874105,"expected_recovery":799.4508042064728,"RC":319.78032168258915,"K":1622.1425870763674,"cK":129.7714069661094,"F":148.6113585,"G":2567.201122531035,"paid_event_frequency":0.80196},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":659.4236425500001,"EL_M1":475.73670325,"EL_M2":183.6869393,"expected_recovery":456.6442596647397,"RC":182.65770386589588,"K":971.2283279049433,"cK":77.69826623239547,"F":128.377305375,"G":1397.5425573643886,"paid_event_frequency":0.24855},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1713.4787465500197,"EL_M1":1475.19387705,"EL_M2":238.28486949999999,"expected_recovery":848.4111124519333,"RC":339.3644449807733,"K":2541.037411272104,"cK":203.2829929017683,"F":148.62963975,"G":3206.3410989100817,"paid_event_frequency":0.80246},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":856.9115673499883,"EL_M1":737.83031735,"EL_M2":119.08125,"expected_recovery":424.93972446815144,"RC":169.9758897872606,"K":1275.0692893682328,"cK":102.00554314945863,"F":148.6393288125,"G":1703.3764387989434,"paid_event_frequency":0.802725},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1491.163177050001,"EL_M1":1224.9960276,"EL_M2":266.16714945000007,"expected_recovery":1021.0545031620478,"RC":408.4218012648191,"K":1939.4969387497986,"cK":155.1597550999839,"F":130.1408975625,"G":2913.180841303072,"paid_event_frequency":0.296785},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1843.6599980500034,"EL_M1":1498.9621976999997,"EL_M2":344.69780034999997,"expected_recovery":1226.1876135193988,"RC":490.4750454077596,"K":2234.876920580772,"cK":178.79015364646176,"F":140.7630350625,"G":3538.2509762223,"paid_event_frequency":0.587305},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1325.8144886495777,"EL_M1":1138.8615247999999,"EL_M2":186.95296385,"expected_recovery":799.213626598435,"RC":319.68545063937404,"K":1616.5868019046613,"cK":129.3269441523729,"F":148.61190693749998,"G":2564.585053838433,"paid_event_frequency":0.801975},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3108.2298416500057,"EL_M1":2537.6277505000003,"EL_M2":570.60209115,"expected_recovery":2097.9522953975224,"RC":839.180918159009,"K":3656.6424784674036,"cK":292.53139827739227,"F":140.759196,"G":5840.935138781876,"paid_event_frequency":0.5872},{"id":"CBU-013","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":813.6162542999951,"EL_M1":616.1924040000001,"EL_M2":197.4238503,"expected_recovery":650.4494572126113,"RC":260.1797828850445,"K":870.2856031588606,"cK":69.62284825270885,"F":126.964896,"G":1693.8450419169978,"paid_event_frequency":0.20992},{"id":"CBU-014","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1035.1781734000708,"EL_M1":845.8557523999998,"EL_M2":189.32242100000002,"expected_recovery":698.9050499461612,"RC":279.5620199784645,"K":1208.1677099122278,"cK":96.65341679297822,"F":140.7586475625,"G":2069.5363436453517,"paid_event_frequency":0.587185},{"id":"CBU-015","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3981.712252650009,"EL_M1":3418.6500207999998,"EL_M2":563.06223185,"expected_recovery":2398.3523943169484,"RC":959.3409577267794,"K":4866.425726003639,"cK":389.31405808029115,"F":148.6113585,"G":7305.304835942773,"paid_event_frequency":0.80196},{"id":"CBU-016","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":439.615751299998,"EL_M1":317.1577919,"EL_M2":122.4579594,"expected_recovery":304.42950314339555,"RC":121.77180125735822,"K":647.4855306698744,"cK":51.79884245358995,"F":128.377305375,"G":988.7516005145949,"paid_event_frequency":0.24855},{"id":"CBU-017","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":856.739429299992,"EL_M1":737.59699455,"EL_M2":119.14243474999999,"expected_recovery":424.20555888741933,"RC":169.68222355496775,"K":1270.518853941846,"cK":101.64150831534768,"F":148.62963975,"G":1702.2570678937434,"paid_event_frequency":0.80246},{"id":"CBU-018","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2570.7345845000336,"EL_M1":2213.4908345,"EL_M2":357.24375,"expected_recovery":1274.8191660084944,"RC":509.9276664033978,"K":3825.2076202959674,"cK":306.0166096236774,"F":148.6393288125,"G":4713.757585786146,"paid_event_frequency":0.802725},{"id":"CBU-019","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":994.1087544500152,"EL_M1":816.6639886500001,"EL_M2":177.44476580000003,"expected_recovery":680.7029938960369,"RC":272.28119755841476,"K":1292.9978739378637,"cK":103.4398299150291,"F":130.1408975625,"G":1999.960905981279,"paid_event_frequency":0.296785},{"id":"CBU-020","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":921.8299180500359,"EL_M1":749.48101785,"EL_M2":172.3489002,"expected_recovery":613.0937879478321,"RC":245.23751517913286,"K":1117.4382896667585,"cK":89.39506317334067,"F":140.7630350625,"G":1862.9673752866793,"paid_event_frequency":0.587305},{"id":"CBU-021","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3977.4424580500104,"EL_M1":3416.5835663499993,"EL_M2":560.8588917,"expected_recovery":2397.640855771755,"RC":959.056342308702,"K":4849.758713209426,"cK":387.9806970567541,"F":148.61190693749998,"G":7297.455205803955,"paid_event_frequency":0.801975},{"id":"CBU-022","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2072.1532972500345,"EL_M1":1691.7519032,"EL_M2":380.40139405,"expected_recovery":1398.6348818081074,"RC":559.453952723243,"K":2437.7617914575626,"cK":195.020943316605,"F":140.759196,"G":3956.5165190531766,"paid_event_frequency":0.5872},{"id":"CBU-023","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":406.80810689999646,"EL_M1":308.09618135,"EL_M2":98.71192555000002,"expected_recovery":325.22472068846116,"RC":130.08988827538448,"K":435.14275346445606,"cK":34.811420277156486,"F":126.964896,"G":931.5657486033832,"paid_event_frequency":0.20992},{"id":"CBU-024","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3105.534737450005,"EL_M1":2537.5674744,"EL_M2":567.96726305,"expected_recovery":2096.715194556758,"RC":838.6860778227033,"K":3624.5034851792593,"cK":289.96027881434077,"F":140.7586475625,"G":5833.252988866066,"paid_event_frequency":0.587185},{"id":"CBU-025","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2654.4745004496594,"EL_M1":2279.09967915,"EL_M2":375.3748213,"expected_recovery":1598.901594438855,"RC":639.5606377755421,"K":3244.2830682912063,"cK":259.5426454632965,"F":148.6113585,"G":4936.252189584664,"paid_event_frequency":0.80196},{"id":"CBU-026","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":219.8078947000028,"EL_M1":158.5789151,"EL_M2":61.2289796,"expected_recovery":152.21475941651232,"RC":60.88590376660493,"K":323.7427979084699,"cK":25.899423832677595,"F":128.377305375,"G":579.9607035657137,"paid_event_frequency":0.24855},{"id":"CBU-027","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2570.218179150038,"EL_M1":2212.7908749,"EL_M2":357.42730424999996,"expected_recovery":1272.6166712141269,"RC":509.0466684856508,"K":3811.556245787736,"cK":304.9244996630189,"F":148.62963975,"G":4710.425316064943,"paid_event_frequency":0.80246},{"id":"CBU-028","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1713.8230145500181,"EL_M1":1475.6605145499998,"EL_M2":238.1625,"expected_recovery":849.8794421778061,"RC":339.9517768711225,"K":2550.1383025258656,"cK":204.01106420206926,"F":148.6393288125,"G":3208.566912580946,"paid_event_frequency":0.802725},{"id":"CBU-029","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":497.0544142500125,"EL_M1":408.33203100000003,"EL_M2":88.72238325000001,"expected_recovery":340.3515045443979,"RC":136.14060181775918,"K":646.4990525856846,"cK":51.71992420685477,"F":130.1408975625,"G":1086.7411171161687,"paid_event_frequency":0.296785},{"id":"CBU-030","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2765.4899104500087,"EL_M1":2248.4432099,"EL_M2":517.04670055,"expected_recovery":1839.281396257932,"RC":735.7125585031729,"K":3352.315187673133,"cK":268.18521501385067,"F":140.7630350625,"G":5213.534292039377,"paid_event_frequency":0.587305},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2651.6279733496676,"EL_M1":2277.7220455500005,"EL_M2":373.90592780000003,"expected_recovery":1598.4272366811851,"RC":639.3708946724742,"K":3233.1718409731043,"cK":258.65374727784837,"F":148.61190693749998,"G":4931.01936298332,"paid_event_frequency":0.801975},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1036.0765396500678,"EL_M1":845.8758425,"EL_M2":190.20069715,"expected_recovery":699.3174155424449,"RC":279.726966216978,"K":1218.8806579835561,"cK":97.5104526386845,"F":140.759196,"G":2072.0975393409735,"paid_event_frequency":0.5872},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1220.4243584000087,"EL_M1":924.2885822,"EL_M2":296.13577620000007,"expected_recovery":975.6741759403183,"RC":390.26967037612735,"K":1305.4283555440966,"cK":104.43426844352773,"F":126.964896,"G":2456.1242576262184,"paid_event_frequency":0.20992},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2070.3565594000347,"EL_M1":1691.7117173499998,"EL_M2":378.64484204999997,"expected_recovery":1397.8101483124888,"RC":559.1240593249955,"K":2416.3358093659417,"cK":193.30686474927535,"F":140.7586475625,"G":3951.3948413824073,"paid_event_frequency":0.587185},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1327.2377547495776,"EL_M1":1139.55034425,"EL_M2":187.6874105,"expected_recovery":799.4508042064728,"RC":319.78032168258915,"K":1622.1425870763674,"cK":129.7714069661094,"F":148.6113585,"G":2567.201122531035,"paid_event_frequency":0.80196},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":659.4236425500001,"EL_M1":475.73670325,"EL_M2":183.6869393,"expected_recovery":456.6442596647397,"RC":182.65770386589588,"K":971.2283279049433,"cK":77.69826623239547,"F":128.377305375,"G":1397.5425573643886,"paid_event_frequency":0.24855},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1713.4787465500197,"EL_M1":1475.19387705,"EL_M2":238.28486949999999,"expected_recovery":848.4111124519333,"RC":339.3644449807733,"K":2541.037411272104,"cK":203.2829929017683,"F":148.62963975,"G":3206.3410989100817,"paid_event_frequency":0.80246},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1713.8230145500181,"EL_M1":1475.6605145499998,"EL_M2":238.1625,"expected_recovery":849.8794421778061,"RC":339.9517768711225,"K":2550.1383025258656,"cK":204.01106420206926,"F":148.6393288125,"G":3208.566912580946,"paid_event_frequency":0.802725},{"id":"CBU-039","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":994.1087544500152,"EL_M1":816.6639886500001,"EL_M2":177.44476580000003,"expected_recovery":680.7029938960369,"RC":272.28119755841476,"K":1292.9978739378637,"cK":103.4398299150291,"F":130.1408975625,"G":1999.960905981279,"paid_event_frequency":0.296785},{"id":"CBU-040","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":921.8299180500359,"EL_M1":749.48101785,"EL_M2":172.3489002,"expected_recovery":613.0937879478321,"RC":245.23751517913286,"K":1117.4382896667585,"cK":89.39506317334067,"F":140.7630350625,"G":1862.9673752866793,"paid_event_frequency":0.587305},{"id":"CBU-041","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3977.4424580500104,"EL_M1":3416.5835663499993,"EL_M2":560.8588917,"expected_recovery":2397.640855771755,"RC":959.056342308702,"K":4849.758713209426,"cK":387.9806970567541,"F":148.61190693749998,"G":7297.455205803955,"paid_event_frequency":0.801975},{"id":"CBU-042","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2072.1532972500345,"EL_M1":1691.7519032,"EL_M2":380.40139405,"expected_recovery":1398.6348818081074,"RC":559.453952723243,"K":2437.7617914575626,"cK":195.020943316605,"F":140.759196,"G":3956.5165190531766,"paid_event_frequency":0.5872},{"id":"CBU-043","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":406.80810689999646,"EL_M1":308.09618135,"EL_M2":98.71192555000002,"expected_recovery":325.22472068846116,"RC":130.08988827538448,"K":435.14275346445606,"cK":34.811420277156486,"F":126.964896,"G":931.5657486033832,"paid_event_frequency":0.20992},{"id":"CBU-044","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3105.534737450005,"EL_M1":2537.5674744,"EL_M2":567.96726305,"expected_recovery":2096.715194556758,"RC":838.6860778227033,"K":3624.5034851792593,"cK":289.96027881434077,"F":140.7586475625,"G":5833.252988866066,"paid_event_frequency":0.587185},{"id":"CBU-045","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2654.4745004496594,"EL_M1":2279.09967915,"EL_M2":375.3748213,"expected_recovery":1598.901594438855,"RC":639.5606377755421,"K":3244.2830682912063,"cK":259.5426454632965,"F":148.6113585,"G":4936.252189584664,"paid_event_frequency":0.80196},{"id":"CBU-046","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":219.8078947000028,"EL_M1":158.5789151,"EL_M2":61.2289796,"expected_recovery":152.21475941651232,"RC":60.88590376660493,"K":323.7427979084699,"cK":25.899423832677595,"F":128.377305375,"G":579.9607035657137,"paid_event_frequency":0.24855},{"id":"CBU-047","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":2570.218179150038,"EL_M1":2212.7908749,"EL_M2":357.42730424999996,"expected_recovery":1272.6166712141269,"RC":509.0466684856508,"K":3811.556245787736,"cK":304.9244996630189,"F":148.62963975,"G":4710.425316064943,"paid_event_frequency":0.80246},{"id":"CBU-048","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1713.8230145500181,"EL_M1":1475.6605145499998,"EL_M2":238.1625,"expected_recovery":849.8794421778061,"RC":339.9517768711225,"K":2550.1383025258656,"cK":204.01106420206926,"F":148.6393288125,"G":3208.566912580946,"paid_event_frequency":0.802725},{"id":"CBU-049","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":994.1087544500152,"EL_M1":816.6639886500001,"EL_M2":177.44476580000003,"expected_recovery":680.7029938960369,"RC":272.28119755841476,"K":1292.9978739378637,"cK":103.4398299150291,"F":130.1408975625,"G":1999.960905981279,"paid_event_frequency":0.296785},{"id":"CBU-050","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1843.6599980500034,"EL_M1":1498.9621976999997,"EL_M2":344.69780034999997,"expected_recovery":1226.1876135193988,"RC":490.4750454077596,"K":2234.876920580772,"cK":178.79015364646176,"F":140.7630350625,"G":3538.2509762223,"paid_event_frequency":0.587305},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3071.5969691999835,"EL_M1":2706.5661232999996,"EL_M2":365.03084590000003,"expected_recovery":1247.786879499385,"RC":499.114751799754,"K":3876.2976129750305,"cK":310.10380903800245,"F":156.41690381249998,"G":5382.976578466987,"paid_event_frequency":1.015445},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1244.7599851505267,"EL_M1":1058.9912507,"EL_M2":185.76873445,"expected_recovery":548.3952527161329,"RC":219.35810108645316,"K":1519.9296411384216,"cK":121.59437129107373,"F":148.4974663125,"G":2312.2798984540714,"paid_event_frequency":0.798845},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1360.1135997500107,"EL_M1":1067.53548235,"EL_M2":292.5781174,"expected_recovery":786.2259265282071,"RC":314.49037061128286,"K":1706.2568368756638,"cK":136.5005469500531,"F":129.363030375,"G":2587.2900635817955,"paid_event_frequency":0.27551},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2489.7148032004,"EL_M1":2118.60128245,"EL_M2":371.11352074999996,"expected_recovery":1097.4647836909369,"RC":438.9859134763748,"K":3036.5754222912565,"cK":242.9260337833005,"F":148.4974663125,"G":4426.832289030101,"paid_event_frequency":0.798845},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1535.6047826000265,"EL_M1":1353.3833482000002,"EL_M2":182.22143440000005,"expected_recovery":623.2955914486545,"RC":249.3182365794618,"K":1941.5582158650172,"cK":155.3246572692014,"F":156.41690381249998,"G":2795.552773681586,"paid_event_frequency":1.015445},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":769.7904906500034,"EL_M1":583.4737983000001,"EL_M2":186.31669234999995,"expected_recovery":359.59370907840736,"RC":143.83748363136294,"K":1049.844115523854,"cK":83.98752924190832,"F":130.6286413125,"G":1504.3255264476995,"paid_event_frequency":0.310125},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2022.3506407500108,"EL_M1":1792.7856407499996,"EL_M2":229.565,"expected_recovery":644.5782298476904,"RC":257.83129193907615,"K":2707.8015263632533,"cK":216.62412210906027,"F":156.4384756875,"G":3537.659373980863,"paid_event_frequency":1.016035},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2031.7067788500067,"EL_M1":1794.3722345,"EL_M2":237.33454435,"expected_recovery":650.1866427859109,"RC":260.07465711436436,"K":2710.068550242043,"cK":216.80548401936343,"F":156.448896,"G":3553.3810879783127,"paid_event_frequency":1.01632},{"id":"CBU-059","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1088.375314899967,"EL_M1":913.2870101000001,"EL_M2":175.08830480000003,"expected_recovery":546.1919653632275,"RC":218.47678614529102,"K":1509.248348460037,"cK":120.73986787680296,"F":132.53025693749998,"G":2080.162967812748,"paid_event_frequency":0.362135},{"id":"CBU-060","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1121.736919850374,"EL_M1":952.4803521500002,"EL_M2":169.25656769999995,"expected_recovery":484.6373695966968,"RC":193.85494783867873,"K":1375.7764715413311,"cK":110.0621177233065,"F":148.5036819375,"G":2098.8768897998125,"paid_event_frequency":0.799015},{"id":"CBU-061","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":4607.395256900095,"EL_M1":4059.8489881,"EL_M2":547.5462688,"expected_recovery":1871.6803404747952,"RC":748.6721361899181,"K":5814.446203853827,"cK":465.1556963083062,"F":156.41690381249998,"G":7970.186657614425,"paid_event_frequency":1.015445},{"id":"CBU-062","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2489.5213386003957,"EL_M1":2117.9838699499996,"EL_M2":371.53746865,"expected_recovery":1096.7905135093192,"RC":438.7162054037277,"K":3039.861162627497,"cK":243.18889301019976,"F":148.4974663125,"G":4426.565204435764,"paid_event_frequency":0.798845},{"id":"CBU-063","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":453.3711305499734,"EL_M1":355.84509175,"EL_M2":97.5260388,"expected_recovery":262.0753086683302,"RC":104.83012346733209,"K":568.7521325007785,"cK":45.50017060006228,"F":129.363030375,"G":977.419273323157,"paid_event_frequency":0.27551},{"id":"CBU-064","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":3734.571397350094,"EL_M1":3177.9011160999994,"EL_M2":556.67028125,"expected_recovery":1646.197170436068,"RC":658.4788681744272,"K":4554.861940804142,"cK":364.3889552643314,"F":148.4974663125,"G":6541.248916135137,"paid_event_frequency":0.798845},{"id":"CBU-065","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3071.2097130999846,"EL_M1":2706.76684435,"EL_M2":364.44286875,"expected_recovery":1246.591133691191,"RC":498.63645347647645,"K":3883.1161858900086,"cK":310.6492948712007,"F":156.41690381249998,"G":5382.549820346882,"paid_event_frequency":1.015445},{"id":"CBU-066","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":256.5968258999991,"EL_M1":194.49126165000007,"EL_M2":62.105564249999986,"expected_recovery":119.86457210670972,"RC":47.94582884268389,"K":349.94805380372844,"cK":27.995844304298277,"F":130.6284585,"G":617.5559433959751,"paid_event_frequency":0.31012},{"id":"CBU-067","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":3033.525878700055,"EL_M1":2689.1783786999995,"EL_M2":344.3475,"expected_recovery":966.8673461338276,"RC":386.7469384535311,"K":4061.7022264451944,"cK":324.9361781156156,"F":156.4384756875,"G":5202.196627942269,"paid_event_frequency":1.016035},{"id":"CBU-068","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2031.7067788500067,"EL_M1":1794.3722345,"EL_M2":237.33454435,"expected_recovery":650.1866427859109,"RC":260.07465711436436,"K":2710.068550242043,"cK":216.80548401936343,"F":156.448896,"G":3553.3810879783127,"paid_event_frequency":1.01632},{"id":"CBU-069","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1088.375314899967,"EL_M1":913.2870101000001,"EL_M2":175.08830480000003,"expected_recovery":546.1919653632275,"RC":218.47678614529102,"K":1509.248348460037,"cK":120.73986787680296,"F":132.53025693749998,"G":2080.162967812748,"paid_event_frequency":0.362135},{"id":"CBU-070","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2243.474941500237,"EL_M1":1904.96180605,"EL_M2":338.51313545,"expected_recovery":969.2747437881135,"RC":387.7098975152454,"K":2751.554663143162,"cK":220.12437305145298,"F":148.5036819375,"G":3999.750525339247,"paid_event_frequency":0.799015},{"id":"CBU-071","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":3281.500511600345,"EL_M1":2916.1099295999998,"EL_M2":365.39058200000005,"expected_recovery":808.8240170051031,"RC":323.52960680204126,"K":3604.474492555637,"cK":288.357959404451,"F":149.7453444375,"G":5390.844562992449,"paid_event_frequency":0.832975},{"id":"CBU-072","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1353.760112500099,"EL_M1":1163.26155535,"EL_M2":190.49855715000004,"expected_recovery":395.0018052981444,"RC":158.00072211925777,"K":1693.1691905988564,"cK":135.45353524790852,"F":141.8913538125,"G":2385.474298239687,"paid_event_frequency":0.618165},{"id":"CBU-073","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":1608.0425424500004,"EL_M1":1315.8037629000003,"EL_M2":292.23877955,"expected_recovery":662.9522311319106,"RC":265.1808924527642,"K":2098.5016872597084,"cK":167.8801349807767,"F":127.99522725,"G":2892.131729511388,"paid_event_frequency":0.2381},{"id":"CBU-074","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2709.6523331000835,"EL_M1":2327.4480007499997,"EL_M2":382.20433235,"expected_recovery":790.8895508762062,"RC":316.3558203504825,"K":3399.412621342134,"cK":271.9530097073707,"F":141.8909881875,"G":4586.469535127249,"paid_event_frequency":0.618155},{"id":"CBU-075","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1640.6664520498687,"EL_M1":1457.5490456,"EL_M2":183.11740645000003,"expected_recovery":404.12855580768496,"RC":161.651422323074,"K":1807.069212524828,"cK":144.56553700198623,"F":149.74516162499998,"G":2795.504763999905,"paid_event_frequency":0.83297},{"id":"CBU-076","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":755.483552100002,"EL_M1":564.0924768000001,"EL_M2":191.3910753,"expected_recovery":225.58681067579425,"RC":90.23472427031771,"K":978.3743509976122,"cK":78.26994807980897,"F":128.87711475,"G":1403.8204522668382,"paid_event_frequency":0.26222},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1878.142806149997,"EL_M1":1645.0902749000002,"EL_M2":233.05253125,"expected_recovery":296.9423294898302,"RC":118.77693179593207,"K":1772.0996269337181,"cK":141.76797015469745,"F":149.78245537499998,"G":3051.293551300836,"paid_event_frequency":0.83399},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":943.5237445999772,"EL_M1":822.6171351999998,"EL_M2":120.9066094,"expected_recovery":146.53618926039633,"RC":58.61447570415854,"K":991.7762414023548,"cK":79.34209931218838,"F":149.81463037499998,"G":1641.726599988432,"paid_event_frequency":0.83487},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":1818.7704259500258,"EL_M1":1554.6508594,"EL_M2":264.11956655,"expected_recovery":584.706814760264,"RC":233.88272590410563,"K":2066.8913969699615,"cK":165.35131175759693,"F":131.0381413125,"G":3132.0568065656375,"paid_event_frequency":0.321325},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2381.416700650059,"EL_M1":2031.5809836499996,"EL_M2":349.83571699999993,"expected_recovery":703.0653364126229,"RC":281.22613456504916,"K":2882.858730766185,"cK":230.62869846129482,"F":141.90067725,"G":4046.896281235204,"paid_event_frequency":0.61842},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2392.723683100061,"EL_M1":2020.5490914500003,"EL_M2":372.17459164999997,"expected_recovery":424.3885659145128,"RC":169.75542636580514,"K":2883.0638792468226,"cK":230.6451103397458,"F":140.636711625,"G":3911.6812419074827,"paid_event_frequency":0.58385},{"id":"CBU-082","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2063.1585741000367,"EL_M1":1686.96261995,"EL_M2":376.19595415,"expected_recovery":498.78316603609414,"RC":199.51326641443768,"K":2440.6425740175737,"cK":195.2514059214059,"F":140.6456694375,"G":3464.7585544978406,"paid_event_frequency":0.584095},{"id":"CBU-083","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":410.2355207999924,"EL_M1":308.76401675,"EL_M2":101.47150404999998,"expected_recovery":126.14049700167794,"RC":50.45619880067118,"K":632.2822320933444,"cK":50.58257856746756,"F":126.96891787499999,"G":850.9909547241749,"paid_event_frequency":0.21003},{"id":"CBU-084","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":3096.7774301000095,"EL_M1":2532.0424051,"EL_M2":564.735025,"expected_recovery":749.5475510831398,"RC":299.8190204332559,"K":3643.9614438080216,"cK":291.51691550464176,"F":140.6456694375,"G":5105.012047300544,"paid_event_frequency":0.584095},{"id":"CBU-085","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2394.1862001000695,"EL_M1":2020.7256484499999,"EL_M2":373.46055165,"expected_recovery":424.36932275531035,"RC":169.74772910212414,"K":2868.6738111848967,"cK":229.49390489479174,"F":140.6383569375,"G":3912.088254712647,"paid_event_frequency":0.583895},{"id":"CBU-086","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":406.42507550000147,"EL_M1":281.63765855,"EL_M2":124.78741695000001,"expected_recovery":104.84753429727772,"RC":41.93901371891109,"K":493.2922382097605,"cK":39.463379056780845,"F":126.10988193749999,"G":818.5831336175912,"paid_event_frequency":0.186535},{"id":"CBU-087","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":674.3846170500028,"EL_M1":555.61649205,"EL_M2":118.768125,"expected_recovery":61.779066202386616,"RC":24.71162648095465,"K":596.7677127038456,"cK":47.74141701630765,"F":140.8250085,"G":1183.5502253963534,"paid_event_frequency":0.589},{"id":"CBU-088","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":2024.153344900019,"EL_M1":1668.24823055,"EL_M2":355.90511435,"expected_recovery":274.81815756349533,"RC":109.92726302539813,"K":1789.1727007476416,"cK":143.13381605981132,"F":140.831224125,"G":3224.060864146971,"paid_event_frequency":0.58917},{"id":"CBU-089","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":875.0583647999932,"EL_M1":691.7577384500001,"EL_M2":183.30062635,"expected_recovery":107.18102789776594,"RC":42.87241115910638,"K":1217.441757648236,"cK":97.39534061185888,"F":127.6319788125,"G":1523.9441271779444,"paid_event_frequency":0.228165},{"id":"CBU-090","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":1856.0661894500072,"EL_M1":1512.9633456999995,"EL_M2":343.10284375,"expected_recovery":238.799475089525,"RC":95.51979003581,"K":1944.9957782820507,"cK":155.59966226256407,"F":140.8237288125,"G":2997.3458274145087,"paid_event_frequency":0.588965},{"id":"CBU-091","hourly":500.0,"provider":"Azure","region":"Seoul","EL":1193.7597060000846,"EL_M1":1008.1036496500001,"EL_M2":185.65605635000003,"expected_recovery":164.88306190521212,"RC":65.95322476208484,"K":1128.4889614115036,"cK":90.27911691292029,"F":140.7707131875,"G":1987.6836811501196,"paid_event_frequency":0.587515},{"id":"CBU-092","hourly":1500.0,"provider":"Azure","region":"Seoul","EL":3087.0454199500127,"EL_M1":2528.7802521500003,"EL_M2":558.2651678,"expected_recovery":494.8729938242959,"RC":197.9491975297184,"K":3668.1477190011365,"cK":293.4518175200909,"F":140.7707131875,"G":4958.956197583096,"paid_event_frequency":0.587515},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":806.644671049994,"EL_M1":610.9216866500001,"EL_M2":195.72298439999997,"expected_recovery":191.8984116784343,"RC":76.75936467137372,"K":1044.1062150226285,"cK":83.52849720181028,"F":126.99707099999999,"G":1458.5728052309041,"paid_event_frequency":0.2108},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":2057.632096900041,"EL_M1":1685.2657064000002,"EL_M2":372.36639049999997,"expected_recovery":330.002256120584,"RC":132.0009024482336,"K":2435.97598877745,"cK":194.87807910219598,"F":140.77016475,"G":3367.041657600627,"paid_event_frequency":0.5875},{"id":"CBU-095","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":2392.262480750075,"EL_M1":2017.7721493499998,"EL_M2":374.4903314,"expected_recovery":329.9120467134676,"RC":131.96481868538703,"K":2275.0583905943836,"cK":182.0046712475507,"F":140.7707131875,"G":3796.003578494017,"paid_event_frequency":0.587515},{"id":"CBU-096","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":408.2039337000012,"EL_M1":287.81438755000005,"EL_M2":120.38954614999999,"expected_recovery":53.09376328961275,"RC":21.2375053158451,"K":499.03693927185003,"cK":39.922955141748005,"F":126.03657412499999,"G":793.8679577101257,"paid_event_frequency":0.18453},{"id":"CBU-097","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1371.5320461999797,"EL_M1":1127.0870461999998,"EL_M2":244.445,"expected_recovery":69.76840004898077,"RC":27.907360019592307,"K":1021.9543446478149,"cK":81.75634757182519,"F":140.795392875,"G":2162.654862221863,"paid_event_frequency":0.58819},{"id":"CBU-098","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1364.3608118499783,"EL_M1":1127.90906185,"EL_M2":236.45175,"expected_recovery":79.1250046714531,"RC":31.650001868581242,"K":1095.7611490726408,"cK":87.66089192581127,"F":140.788446,"G":2165.946868859161,"paid_event_frequency":0.588},{"id":"CBU-099","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":867.7136925999944,"EL_M1":685.3845108500001,"EL_M2":182.32918175,"expected_recovery":43.82807469099555,"RC":17.53122987639822,"K":943.0717655665911,"cK":75.4457412453273,"F":127.545142875,"G":1450.9810754622931,"paid_event_frequency":0.22579},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1849.9395772500116,"EL_M1":1510.29801475,"EL_M2":339.6415625,"expected_recovery":78.86545309896292,"RC":31.546181239585167,"K":1598.0514556411404,"cK":127.84411645129123,"F":140.78113349999998,"G":2866.814677921184,"paid_event_frequency":0.5878}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":174475.88595979998,"expected_recovery":78809.2455106,"reinsurance_premium":110332.94371483999,"RC":31523.69820423999,"mean_net":95666.64044919999,"net_TVaR":309336.81870000006,"net_VaR":264795.99000000005,"K":213670.17825080006,"cK":17093.614260064005,"F":14083.2286265625,"G":316235.2360675553,"average_premium":3162.3523606755534,"annual_exhaustion_probability":0.0022,"recovery_year_probability":0.59143,"tail_reduction":0.7205622198654372},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"high","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"noBackup":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2660.909089349627,"EL_M1":2291.2292121499995,"EL_M2":369.6798772000001,"expected_recovery":1111.4075178178864,"RC":444.5630071271546,"K":2726.139903536802,"cK":218.09119228294418,"F":148.7051413125,"G":4629.6912400963,"paid_event_frequency":0.804525},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1034.279265200071,"EL_M1":850.0043902,"EL_M2":184.274875,"expected_recovery":492.52692338063844,"RC":197.01076935225538,"K":1022.3859998456155,"cK":81.79087998764925,"F":140.6928350625,"G":1938.3649994699679,"paid_event_frequency":0.585385},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1235.296949750002,"EL_M1":937.1348197499999,"EL_M2":298.16213,"expected_recovery":806.8242913439767,"RC":322.7297165375907,"K":906.1485407705693,"cK":72.49188326164554,"F":127.04003193749999,"G":2343.411441982318,"paid_event_frequency":0.211975},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2069.891780150038,"EL_M1":1701.2050301500005,"EL_M2":368.68675,"expected_recovery":985.3995788190932,"RC":394.1598315276373,"K":2036.483365250252,"cK":162.91866922002018,"F":140.6928350625,"G":3690.217487946927,"paid_event_frequency":0.585385},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.9545775995537,"EL_M1":1145.70689015,"EL_M2":185.24768744999997,"expected_recovery":554.849606820425,"RC":221.93984272817002,"K":1373.4184242702227,"cK":109.87347394161782,"F":148.705324125,"G":2415.2976245257887,"paid_event_frequency":0.80453},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1437.3309664000014,"EL_M1":1144.6305447999998,"EL_M2":292.7004216,"expected_recovery":841.8417791153809,"RC":336.73671164615234,"K":1166.1542774471463,"cK":93.29234219577171,"F":130.8630069375,"G":2664.2973695725673,"paid_event_frequency":0.316535},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":3544.8724990005703,"EL_M1":3175.0078617500008,"EL_M2":369.86463725,"expected_recovery":1278.6954139649747,"RC":511.4781655859899,"K":3819.6985677702974,"cK":305.5758854216238,"F":148.6945381875,"G":6014.161450927579,"paid_event_frequency":0.804235},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1772.5986003500905,"EL_M1":1588.8537357999999,"EL_M2":183.74486455,"expected_recovery":630.4584119322362,"RC":252.1833647728945,"K":1941.2827098680443,"cK":155.30261678944356,"F":148.69325849999998,"G":3105.0371205499046,"paid_event_frequency":0.8042},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1758.7759046500057,"EL_M1":1462.611668,"EL_M2":296.16423664999996,"expected_recovery":936.7592451076127,"RC":374.7036980430451,"K":1548.6455441256303,"cK":123.89164353005043,"F":130.862824125,"G":3184.3120937974677,"paid_event_frequency":0.31653},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":2068.884247700037,"EL_M1":1698.9825601999999,"EL_M2":369.9016875,"expected_recovery":985.3578725439372,"RC":394.1431490175749,"K":2015.5300552776955,"cK":161.24240442221566,"F":140.6935663125,"G":3686.6178232697707,"paid_event_frequency":0.585405},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":1330.4550659495462,"EL_M1":1145.6151275500004,"EL_M2":184.83993839999997,"expected_recovery":555.703759015488,"RC":222.2815036061952,"K":1363.0704199062595,"cK":109.04563359250076,"F":148.7051413125,"G":2413.9831259476564,"paid_event_frequency":0.804525},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":3102.8380084000073,"EL_M1":2550.0133834000003,"EL_M2":552.824625,"expected_recovery":1477.5807696149627,"RC":591.0323078459851,"K":3067.158138766625,"cK":245.37265110133,"F":140.6928350625,"G":5439.914403213096,"paid_event_frequency":0.585385},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":818.7391668,"EL_M1":619.9644132,"EL_M2":198.77475360000003,"expected_recovery":481.3966423791052,"RC":192.5586569516421,"K":703.3579877139595,"cK":56.268639017116755,"F":126.964530375,"G":1592.7079908583453,"paid_event_frequency":0.20991},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1031.8977036000674,"EL_M1":847.4527348499997,"EL_M2":184.44496875,"expected_recovery":435.911169542843,"RC":174.3644678171372,"K":1070.621765998352,"cK":85.64974127986817,"F":140.70416943749998,"G":1910.1547761794302,"paid_event_frequency":0.585695},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3984.7725294500087,"EL_M1":3428.9750888000017,"EL_M2":555.79744065,"expected_recovery":1439.657342198061,"RC":575.8629368792244,"K":4100.444474771822,"cK":328.03555798174574,"F":148.607336625,"G":6716.37114791464,"paid_event_frequency":0.80185},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":955.3037978000295,"EL_M1":760.1352220500002,"EL_M2":195.16857575,"expected_recovery":496.8868065428057,"RC":198.7547226171223,"K":845.7591278997991,"cK":67.66073023198393,"F":130.677817875,"G":1803.1960913655146,"paid_event_frequency":0.31147},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1767.3780977000547,"EL_M1":1582.4557018999997,"EL_M2":184.92239579999998,"expected_recovery":533.4859917826125,"RC":213.394396713045,"K":1845.9743416765664,"cK":147.67794733412532,"F":148.595636625,"G":3036.0614378296327,"paid_event_frequency":0.80153},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":5301.847742450157,"EL_M1":4750.335393800001,"EL_M2":551.5123486499999,"expected_recovery":1584.2281017455412,"RC":633.6912406982165,"K":5559.026931927485,"cK":444.7221545541988,"F":148.592711625,"G":8705.138465770096,"paid_event_frequency":0.80145},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":1164.2582572000595,"EL_M1":966.8150731500001,"EL_M2":197.44318404999993,"expected_recovery":545.0936453088138,"RC":218.03745812352554,"K":1108.619851496457,"cK":88.68958811971656,"F":130.6794631875,"G":2135.553022174402,"paid_event_frequency":0.311515},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":1032.6034695000646,"EL_M1":847.5470164,"EL_M2":185.05645310000003,"expected_recovery":436.45221594174257,"RC":174.58088637669704,"K":1075.7718767508777,"cK":86.06175014007022,"F":140.7049006875,"G":1911.9346756057757,"paid_event_frequency":0.585715},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":3981.709544400012,"EL_M1":3427.10241,"EL_M2":554.6071344,"expected_recovery":1445.4176380895015,"RC":578.1670552358006,"K":4118.571476810426,"cK":329.4857181448341,"F":148.6067881875,"G":6717.292141290862,"paid_event_frequency":0.801835},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2054.9333222500304,"EL_M1":1684.2291243500001,"EL_M2":370.7041979,"expected_recovery":745.8192879952389,"RC":298.3277151980956,"K":1933.400937125622,"cK":154.67207497004978,"F":140.67729599999998,"G":3531.4805445575676,"paid_event_frequency":0.58496},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":404.32405019999453,"EL_M1":306.04751195000006,"EL_M2":98.27653825000002,"expected_recovery":198.8067126365875,"RC":79.522685054635,"K":346.8299438630263,"cK":27.746395509042106,"F":127.0367413125,"G":851.5064961015622,"paid_event_frequency":0.211885},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":3080.6257571000065,"EL_M1":2526.742679,"EL_M2":553.8830781,"expected_recovery":1117.5543587042068,"RC":447.02174348168273,"K":2898.163645749234,"cK":231.85309165993874,"F":140.6771131875,"G":5200.23694057217,"paid_event_frequency":0.584955},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":2640.3235664996414,"EL_M1":2271.11199355,"EL_M2":369.21157295,"expected_recovery":761.1833537383961,"RC":304.47334149535845,"K":2646.4820717371003,"cK":211.71856573896804,"F":148.545180375,"G":4406.747538811957,"paid_event_frequency":0.80015},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":476.0470445500147,"EL_M1":377.4678867,"EL_M2":98.57915785,"expected_recovery":208.2148002088199,"RC":83.28592008352797,"K":439.497721748242,"cK":35.159817739859356,"F":130.7752569375,"G":967.024052414536,"paid_event_frequency":0.314135},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":5281.63331110015,"EL_M1":4727.1567643,"EL_M2":554.4765468,"expected_recovery":1220.0937470048689,"RC":488.03749880194755,"K":5646.076439846704,"cK":451.6861151877363,"F":148.5376850625,"G":8493.192813536445,"paid_event_frequency":0.799945},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":3526.8515793505417,"EL_M1":3158.7321001000005,"EL_M2":368.11947925,"expected_recovery":449.6149770784891,"RC":179.84599083139565,"K":2365.754834844098,"cK":189.26038678752784,"F":148.6634600625,"G":5392.82855604262,"paid_event_frequency":0.803385},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":580.1195279500212,"EL_M1":482.02613255,"EL_M2":98.09339539999999,"expected_recovery":123.44978766034649,"RC":49.3799150641386,"K":493.76847523480217,"cK":39.50147801878418,"F":130.7449100625,"G":1066.3277747939253,"paid_event_frequency":0.313305},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":3088.1266041500085,"EL_M1":2533.33261975,"EL_M2":554.7939844,"expected_recovery":677.071491258032,"RC":270.8285965032128,"K":2618.3869583474657,"cK":209.47095666779725,"F":140.75261475,"G":4945.571696094691,"paid_event_frequency":0.58702},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3109.082651300003,"EL_M1":2735.6321579999994,"EL_M2":373.45049330000006,"expected_recovery":989.2445942080212,"RC":395.6978376832085,"K":3012.341279891798,"cK":240.98730239134383,"F":156.6147069375,"G":5203.176664416073,"paid_event_frequency":1.020855},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1258.4780122005234,"EL_M1":1071.6447099999996,"EL_M2":186.8333022,"expected_recovery":443.2554675411884,"RC":177.3021870164754,"K":1189.4614949756478,"cK":95.15691959805183,"F":148.6108100625,"G":2239.397238503401,"paid_event_frequency":0.801945},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1396.1202371000131,"EL_M1":1093.7565652,"EL_M2":302.36367190000004,"expected_recovery":723.0566378526102,"RC":289.2226551410441,"K":1130.224641002491,"cK":90.41797128019927,"F":129.43560693749998,"G":2540.261960611675,"paid_event_frequency":0.277495},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2517.2503546004195,"EL_M1":2144.7400630499997,"EL_M2":372.51029155000003,"expected_recovery":886.4358743449945,"RC":354.57434973799786,"K":2347.582003461911,"cK":187.8065602769529,"F":148.6108100625,"G":4277.656099570494,"paid_event_frequency":0.801945},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":1554.6280154000162,"EL_M1":1367.7891739000004,"EL_M2":186.83884150000003,"expected_recovery":493.5719951981689,"RC":197.42879807926758,"K":1512.446849355475,"cK":120.99574794843801,"F":156.61342725,"G":2706.221318236963,"paid_event_frequency":1.02082},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":1604.5682331000241,"EL_M1":1300.2901733999997,"EL_M2":304.2780597000001,"expected_recovery":768.8367847875692,"RC":307.5347139150277,"K":1377.2155288508843,"cK":110.17724230807075,"F":133.2571194375,"G":2874.0497450141634,"paid_event_frequency":0.382015},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3990.3450128499376,"EL_M1":3616.0312464999997,"EL_M2":374.31376635,"expected_recovery":1148.4495296444306,"RC":459.37981185777227,"K":4008.754507422751,"cK":320.7003605938201,"F":156.60063037499998,"G":6569.367754235373,"paid_event_frequency":1.02047},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":3995.2438770998756,"EL_M1":3621.00180415,"EL_M2":374.24207295,"expected_recovery":1149.5162084955218,"RC":459.80648339820874,"K":4118.823882116929,"cK":329.50591056935434,"F":156.5971569375,"G":6588.204570673251,"paid_event_frequency":1.020375},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":1269.775743849982,"EL_M1":1068.6660026499999,"EL_M2":201.1097412,"expected_recovery":472.4686631681916,"RC":188.98746526727666,"K":1229.9190860048425,"cK":98.3935268803874,"F":133.1222038125,"G":2253.7052530801943,"paid_event_frequency":0.378325},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":1253.5888606505346,"EL_M1":1066.6388316999996,"EL_M2":186.95002894999996,"expected_recovery":380.6829866986451,"RC":152.27319467945804,"K":1187.5262240048523,"cK":95.0020979203882,"F":148.59892725,"G":2199.2841073338413,"paid_event_frequency":0.80162},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":4642.625122750098,"EL_M1":4082.2912352999997,"EL_M2":560.33388745,"expected_recovery":1235.75921293486,"RC":494.303685173944,"K":4318.302357597198,"cK":345.4641886077759,"F":156.5101381875,"G":7518.537512959091,"paid_event_frequency":1.017995},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":2506.297847600418,"EL_M1":2132.5206672500003,"EL_M2":373.77718035000004,"expected_recovery":761.1644483339419,"RC":304.4657793335768,"K":2371.5524795701426,"cK":189.72419836561141,"F":148.598561625,"G":4198.781849232809,"paid_event_frequency":0.80161},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":460.0050705499734,"EL_M1":359.18717995000003,"EL_M2":100.8178906,"expected_recovery":207.45857778824018,"RC":82.98343111529607,"K":438.2389405374191,"cK":35.05911524299353,"F":129.3891725625,"G":943.2490526276841,"paid_event_frequency":0.276225},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":3758.2775741500964,"EL_M1":3199.2944562000002,"EL_M2":558.9831179500001,"expected_recovery":1141.2199239834154,"RC":456.4879695933662,"K":3539.9042448466034,"cK":283.19233958772827,"F":148.5976475625,"G":6195.407374524922,"paid_event_frequency":0.801585},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":3094.207483600016,"EL_M1":2720.5662773499994,"EL_M2":373.64120625,"expected_recovery":635.8343459304288,"RC":254.33373837217152,"K":3098.763269440336,"cK":247.90106155522687,"F":156.49935225,"G":5003.9221810365525,"paid_event_frequency":1.0177},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":534.1784226999895,"EL_M1":432.7594631,"EL_M2":101.41895959999997,"expected_recovery":172.80402072455058,"RC":69.12160828982023,"K":550.3304001108269,"cK":44.02643200886615,"F":133.17924131249998,"G":1040.674272414901,"paid_event_frequency":0.379885},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":5955.555501349658,"EL_M1":5394.19992355,"EL_M2":561.3555778,"expected_recovery":1033.3482341872623,"RC":413.3392936749049,"K":6290.374385262139,"cK":503.22995082097117,"F":156.48783506249998,"G":9371.483441210712,"paid_event_frequency":1.017385},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":3970.2156046998234,"EL_M1":3595.9969207999998,"EL_M2":374.21868390000003,"expected_recovery":684.1635964953603,"RC":273.66543859814414,"K":4183.312605287922,"cK":334.6650084230338,"F":156.4830819375,"G":6313.372178211335,"paid_event_frequency":1.017255},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1272.8740835999674,"EL_M1":1071.7664006999998,"EL_M2":201.1076829,"expected_recovery":187.22262914837324,"RC":74.8890516593493,"K":1029.7113163571587,"cK":82.3769053085727,"F":133.1331725625,"G":2084.3642841738524,"paid_event_frequency":0.378625},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":2516.4371388504005,"EL_M1":2142.65741805,"EL_M2":373.7797208,"expected_recovery":325.3580994399572,"RC":130.1432397759829,"K":1692.7954790928306,"cK":135.42363832742646,"F":148.62945693749998,"G":3907.511298521746,"paid_event_frequency":0.802455},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":3292.5677857503574,"EL_M1":2915.58712305,"EL_M2":376.98066270000004,"expected_recovery":1355.9740950815265,"RC":542.3896380326106,"K":3403.8001913994694,"cK":272.3040153119576,"F":149.8574085,"G":5676.158463459901,"paid_event_frequency":0.83604},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1353.8458876001064,"EL_M1":1163.4777773500002,"EL_M2":190.36811024999997,"expected_recovery":627.7757426780496,"RC":251.11029707121986,"K":1356.6615336290065,"cK":108.53292269032052,"F":141.896655375,"G":2473.847683648862,"paid_event_frequency":0.61831},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1619.3964679000094,"EL_M1":1322.3371311499998,"EL_M2":297.05933674999994,"expected_recovery":950.8526163806347,"RC":380.3410465522539,"K":1415.5924265651056,"cK":113.24739412520844,"F":128.06688975,"G":2988.069064436629,"paid_event_frequency":0.24006},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":2709.2643915000867,"EL_M1":2327.99320405,"EL_M2":381.27118744999996,"expected_recovery":1257.0422719769601,"RC":502.81690879078405,"K":2698.2360922657763,"cK":215.8588873812621,"F":141.89574131249998,"G":4759.781238646177,"paid_event_frequency":0.618285},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1645.912286599879,"EL_M1":1457.63095445,"EL_M2":188.28133214999997,"expected_recovery":676.5887779584143,"RC":270.63551118336574,"K":1714.7043931861635,"cK":137.17635145489308,"F":149.857042875,"G":2938.10825615085,"paid_event_frequency":0.83603},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":1841.4673917000146,"EL_M1":1538.5948188,"EL_M2":302.8725729000001,"expected_recovery":1006.1766728635743,"RC":402.4706691454297,"K":1643.0799414024964,"cK":131.4463953121997,"F":131.894617875,"G":3343.0387653768594,"paid_event_frequency":0.34475},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":4170.758338400991,"EL_M1":3794.809067400001,"EL_M2":375.94927100000007,"expected_recovery":1513.0576498899245,"RC":605.2230599559698,"K":4337.032501458303,"cK":346.96260011666425,"F":149.838761625,"G":7030.377013464834,"paid_event_frequency":0.83553},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":4178.791299701027,"EL_M1":3798.2729975000007,"EL_M2":380.51830220000005,"expected_recovery":1517.0920508762579,"RC":606.8368203505032,"K":4377.645788318141,"cK":350.2116630654513,"F":149.846074125,"G":7047.581142989308,"paid_event_frequency":0.83573},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1434.9415864500422,"EL_M1":1236.43692615,"EL_M2":198.50466029999998,"expected_recovery":607.9642090325592,"RC":243.18568361302368,"K":1489.1485581690306,"cK":119.13188465352245,"F":131.7953506875,"G":2572.0726738721182,"paid_event_frequency":0.342035},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":1361.3270856001002,"EL_M1":1170.9865178500002,"EL_M2":190.34056775,"expected_recovery":543.6311310243619,"RC":217.45245240974478,"K":1404.935252447378,"cK":112.39482019579023,"F":141.9593600625,"G":2444.1782910241805,"paid_event_frequency":0.620025},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4961.046708650011,"EL_M1":4395.550227350001,"EL_M2":565.4964812999999,"expected_recovery":1722.9948526599674,"RC":689.197941063987,"K":5072.123299416345,"cK":405.7698639533076,"F":149.8221256875,"G":8274.448852473075,"paid_event_frequency":0.835075},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":2724.8900143500787,"EL_M1":2344.2939727000003,"EL_M2":380.59604165,"expected_recovery":1088.3046642588095,"RC":435.3218657035238,"K":2799.9789503317998,"cK":223.998316026544,"F":141.9604569375,"G":4701.560870690196,"paid_event_frequency":0.620055},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":541.9661939999947,"EL_M1":442.8866853499999,"EL_M2":99.07950865000001,"expected_recovery":274.83621182920746,"RC":109.93448473168299,"K":558.0600674297002,"cK":44.644805394376014,"F":128.0491569375,"G":1099.4595214180717,"paid_event_frequency":0.239575},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":4088.0273970500098,"EL_M1":3516.2889127500002,"EL_M2":571.7384843,"expected_recovery":1633.9320837403257,"RC":653.5728334961303,"K":4180.670957978116,"cK":334.4536766382493,"F":141.96027412499998,"G":6957.352241745852,"paid_event_frequency":0.62005},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":3291.507885150351,"EL_M1":2914.8260476,"EL_M2":376.68183755,"expected_recovery":833.1649005475074,"RC":333.265960219003,"K":4053.938118717552,"cK":324.3150494974042,"F":149.8148131875,"G":5465.204944072343,"paid_event_frequency":0.834875},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":611.2545305500124,"EL_M1":510.27285485000004,"EL_M2":100.9816757,"expected_recovery":212.6660032521944,"RC":85.06640130087777,"K":759.6032101745518,"cK":60.76825681396414,"F":131.8213100625,"G":1185.2139983031393,"paid_event_frequency":0.342745},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":6243.732798999564,"EL_M1":5679.4104394999995,"EL_M2":564.3223595000001,"expected_recovery":1327.3737672216612,"RC":530.9495068886645,"K":7689.027774457091,"cK":615.1222219565673,"F":149.795617875,"G":10052.80019429306,"paid_event_frequency":0.83435},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":4169.199119800938,"EL_M1":3788.8588488999994,"EL_M2":380.34027090000006,"expected_recovery":882.9445554941612,"RC":353.1778221976645,"K":5093.337195587223,"cK":407.4669756469778,"F":149.80256475,"G":6772.861976527441,"paid_event_frequency":0.83454},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":1419.741797600052,"EL_M1":1221.3335147999999,"EL_M2":198.40828280000002,"expected_recovery":183.9081678274788,"RC":73.56326713099152,"K":1235.0970250901541,"cK":98.80776200721233,"F":131.70266475,"G":2298.4206553176746,"paid_event_frequency":0.3395},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":2684.7457388000958,"EL_M1":2303.8609888,"EL_M2":380.88475,"expected_recovery":328.5968076355757,"RC":131.43872305423028,"K":2221.3857178710614,"cK":177.71085742968492,"F":141.840349125,"G":4180.980891212014,"paid_event_frequency":0.61677},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2386.6900491000615,"EL_M1":2011.7541854000003,"EL_M2":374.9358637,"expected_recovery":876.3766654734338,"RC":350.55066618937354,"K":2899.6951855347424,"cK":231.9756148427794,"F":140.66833818749998,"G":4146.512891092953,"paid_event_frequency":0.584715},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1030.2383522000669,"EL_M1":840.60524115,"EL_M2":189.63311105,"expected_recovery":337.9882556920685,"RC":135.1953022768274,"K":1305.3218869080724,"cK":104.4257509526458,"F":140.6811350625,"G":1880.7207206560533,"paid_event_frequency":0.585065},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":1223.3914467500074,"EL_M1":926.52147225,"EL_M2":296.8699745,"expected_recovery":647.2379376423958,"RC":258.8951750569583,"K":1238.6051560541778,"cK":99.08841248433423,"F":127.02321318749999,"G":2277.8643299717332,"paid_event_frequency":0.211515},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":2061.3081456500345,"EL_M1":1681.8622536500002,"EL_M2":379.445892,"expected_recovery":676.9780931506705,"RC":270.7912372602682,"K":2620.3395958175815,"cK":209.62716766540652,"F":140.6815006875,"G":3576.5440683509455,"paid_event_frequency":0.585075},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":1194.7186452500866,"EL_M1":1006.98072445,"EL_M2":187.7379208,"expected_recovery":437.4833162217417,"RC":174.99332648869668,"K":1470.595491492942,"cK":117.64763931943537,"F":140.668521,"G":2170.704176077625,"paid_event_frequency":0.58472},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":1345.5372591500018,"EL_M1":1040.7012909000002,"EL_M2":304.83596825,"expected_recovery":623.0562036932271,"RC":249.22248147729084,"K":1620.8137216259101,"cK":129.6650977300728,"F":128.10893662499998,"G":2470.0450333098206,"paid_event_frequency":0.24121},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2889.3474820500396,"EL_M1":2514.2228588499997,"EL_M2":375.12462320000003,"expected_recovery":871.0745743734337,"RC":348.42982974937354,"K":3532.377268891864,"cK":282.5901815113491,"F":140.6222694375,"G":4881.31968366435,"paid_event_frequency":0.583455},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":1448.4560746501222,"EL_M1":1258.28365865,"EL_M2":190.17241600000003,"expected_recovery":384.43895448538933,"RC":153.77558179415576,"K":1878.039262874952,"cK":150.24314102999617,"F":140.63433506249999,"G":2524.1455100490325,"paid_event_frequency":0.583785},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":1521.847345199996,"EL_M1":1224.28879975,"EL_M2":297.55854545000005,"expected_recovery":671.5299536023105,"RC":268.6119814409242,"K":1709.895699516304,"cK":136.79165596130431,"F":128.0341663125,"G":2740.380198552966,"paid_event_frequency":0.239165},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2070.609277700039,"EL_M1":1689.0536527000002,"EL_M2":381.555625,"expected_recovery":607.2967928632761,"RC":242.91871714531044,"K":2451.659825931073,"cK":196.13278607448586,"F":140.638905375,"G":3533.73291505978,"paid_event_frequency":0.58391},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":2395.651995150081,"EL_M1":2020.4918916000004,"EL_M2":375.16010355000003,"expected_recovery":779.3545921623027,"RC":311.7418368649211,"K":2752.755753490613,"cK":220.22046027924907,"F":140.6262913125,"G":4090.9874448090013,"paid_event_frequency":0.583565},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":2067.086607600039,"EL_M1":1692.5490846499997,"EL_M2":374.53752295000004,"expected_recovery":483.96628606538115,"RC":193.58651442615246,"K":2293.081252566275,"cK":183.44650020530202,"F":140.6924694375,"G":3446.416122225324,"paid_event_frequency":0.585375},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":411.412147249993,"EL_M1":310.36181525,"EL_M2":101.050332,"expected_recovery":111.65698838826216,"RC":44.662795355304866,"K":488.8504548136506,"cK":39.10803638509205,"F":127.06672256249999,"G":829.6662687371864,"paid_event_frequency":0.212705},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":3102.5981500500093,"EL_M1":2539.25758755,"EL_M2":563.3405625,"expected_recovery":727.6039309886714,"RC":291.04157239546856,"K":3491.598334258639,"cK":279.32786674069115,"F":140.6932006875,"G":5084.8810531648915,"paid_event_frequency":0.585395},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":2402.010906150073,"EL_M1":2026.3187957500002,"EL_M2":375.6921104,"expected_recovery":307.17994606145066,"RC":122.87197842458028,"K":1626.8732687068832,"cK":130.14986149655067,"F":140.7050835,"G":3727.6504394282724,"paid_event_frequency":0.58572},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":896.4640147999907,"EL_M1":699.42992605,"EL_M2":197.03408874999997,"expected_recovery":379.39325393126717,"RC":151.75730157250686,"K":1126.0871198852572,"cK":90.08696959082057,"F":128.10674287499998,"G":1688.5533717844244,"paid_event_frequency":0.24115},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":1450.348542000123,"EL_M1":1261.84809015,"EL_M2":188.50045185,"expected_recovery":360.4223975557077,"RC":144.16895902228308,"K":2143.1132469733893,"cK":171.44905975787114,"F":140.738355375,"G":2542.27322154037,"paid_event_frequency":0.58663},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":4336.794716350068,"EL_M1":3788.0744507000004,"EL_M2":548.72026565,"expected_recovery":1304.7136619581947,"RC":521.8854647832779,"K":6121.0027273249325,"cK":489.6802181859946,"F":140.7162350625,"G":7318.768845842454,"paid_event_frequency":0.586025},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":1017.3122043999883,"EL_M1":815.3989086,"EL_M2":201.91329580000004,"expected_recovery":346.4793187856993,"RC":138.59172751427974,"K":1506.8943637831626,"cK":120.55154910265301,"F":128.117711625,"G":1872.764256855895,"paid_event_frequency":0.24145},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":2071.011159300039,"EL_M1":1704.5047530499999,"EL_M2":366.50640625,"expected_recovery":546.0065878275386,"RC":218.40263513101547,"K":2705.411842130241,"cK":216.43294737041927,"F":140.68241475,"G":3528.7055420686315,"paid_event_frequency":0.5851},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":1207.3917104000896,"EL_M1":1017.8793081,"EL_M2":189.5124023,"expected_recovery":228.00240259284533,"RC":91.20096103713814,"K":1729.1111688860256,"cK":138.32889351088204,"F":140.70581475,"G":2103.503172930813,"paid_event_frequency":0.58574},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":3104.8611036000043,"EL_M1":2557.8861817499997,"EL_M2":546.97492185,"expected_recovery":818.3505004939575,"RC":327.34020019758304,"K":4050.8166164805725,"cK":324.06532931844583,"F":140.68241475,"G":5195.9320638213785,"paid_event_frequency":0.5851},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":806.2308555000008,"EL_M1":609.46963455,"EL_M2":196.76122094999994,"expected_recovery":207.15600855847129,"RC":82.86240342338851,"K":878.2745859320097,"cK":70.26196687456078,"F":127.0268694375,"G":1448.5094603139335,"paid_event_frequency":0.211615},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":2055.8603046500366,"EL_M1":1678.8128463499995,"EL_M2":377.04745829999996,"expected_recovery":221.36461684125857,"RC":88.54584673650344,"K":2478.516763007243,"cK":198.28134104057943,"F":140.72208506249999,"G":3311.212769986159,"paid_event_frequency":0.586185},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":2385.6892795500717,"EL_M1":2020.5862576999998,"EL_M2":365.10302185,"expected_recovery":252.47569691873514,"RC":100.99027876749406,"K":1860.4005131927693,"cK":148.83204105542154,"F":140.7167835,"G":3701.6378438306497,"paid_event_frequency":0.58604},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":896.8503466999929,"EL_M1":692.9278859000001,"EL_M2":203.9224608,"expected_recovery":247.28484627707894,"RC":98.91393851083158,"K":1143.4953733530238,"cK":91.4796298682419,"F":128.110399125,"G":1620.4724189387553,"paid_event_frequency":0.24125},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":2888.5045855000444,"EL_M1":2515.7535855000006,"EL_M2":372.751,"expected_recovery":571.391942538507,"RC":228.55677701540282,"K":3609.306978562596,"cK":288.7445582850077,"F":140.6902756875,"G":4728.661595317274,"paid_event_frequency":0.585315},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":2895.2944985000236,"EL_M1":2517.6586883500004,"EL_M2":377.63581015,"expected_recovery":455.65542156445053,"RC":182.26216862578022,"K":3588.4579148643306,"cK":287.07663318914643,"F":140.70197568749998,"G":4673.7803680032675,"paid_event_frequency":0.585635},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":1021.0736854499831,"EL_M1":817.2181022999999,"EL_M2":203.85558315,"expected_recovery":151.05263179193832,"RC":60.421052716775336,"K":1318.2741628634785,"cK":105.46193302907828,"F":128.102355375,"G":1753.412035427782,"paid_event_frequency":0.24103},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":2058.245914050042,"EL_M1":1679.9940482000002,"EL_M2":378.25186585,"expected_recovery":111.19230273028097,"RC":44.47692109211239,"K":1596.344751115767,"cK":127.70758008926136,"F":140.7400006875,"G":3161.5605545585536,"paid_event_frequency":0.586675}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":226165.55838534996,"expected_recovery":70686.63638365,"reinsurance_premium":98961.29093710998,"RC":28274.654553459986,"mean_net":155478.92200169998,"net_TVaR":391649.19707000005,"net_VaR":355625.02,"K":236170.27506830008,"cK":18893.622005464007,"F":14088.736767187498,"G":383230.0956152819,"average_premium":3832.300956152819,"annual_exhaustion_probability":5e-06,"recovery_year_probability":0.73928,"tail_reduction":0.49695815863966075},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":true,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率"}},"testedBackup":{"policies":[{"id":"CBU-001","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1397.9222949001012,"EL_M1":1166.4352949,"EL_M2":231.487,"expected_recovery":306.5680993681815,"RC":122.6272397472726,"K":2273.9209218560536,"cK":181.91367374848429,"F":148.7248850625,"G":2468.250791277811,"paid_event_frequency":0.805065},{"id":"CBU-002","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":591.791172649998,"EL_M1":475.96304765000014,"EL_M2":115.828125,"expected_recovery":145.59060175493374,"RC":58.2362407019735,"K":1005.9142449982346,"cK":80.47313959985877,"F":140.7078256875,"G":1161.611171519107,"paid_event_frequency":0.585795},{"id":"CBU-003","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":588.3640464999996,"EL_M1":408.29894610000014,"EL_M2":180.06510040000003,"expected_recovery":252.06659600682195,"RC":100.82663840272879,"K":964.8243809648209,"cK":77.18595047718567,"F":125.856321,"G":1189.6439418398854,"paid_event_frequency":0.1796},{"id":"CBU-004","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1184.7614658499824,"EL_M1":952.7789658499997,"EL_M2":231.9825,"expected_recovery":291.257071463261,"RC":116.50282858530441,"K":2003.2255577598053,"cK":160.25804462078443,"F":140.7074600625,"G":2136.3063988247613,"paid_event_frequency":0.585785},{"id":"CBU-005","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":699.2861279000248,"EL_M1":583.4902529,"EL_M2":115.795875,"expected_recovery":153.06491844675202,"RC":61.22596737870081,"K":1138.5903171409896,"cK":91.08722537127916,"F":148.7248850625,"G":1333.765607616673,"paid_event_frequency":0.805065},{"id":"CBU-006","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":660.7537123499994,"EL_M1":484.18598374999993,"EL_M2":176.56772859999995,"expected_recovery":247.4625254442185,"RC":98.9850101776874,"K":1125.1750602000059,"cK":90.01400481600047,"F":128.429955375,"G":1304.2435769582496,"paid_event_frequency":0.24999},{"id":"CBU-007","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1721.304578900015,"EL_M1":1489.5895789,"EL_M2":231.715,"expected_recovery":317.79639138810603,"RC":127.11855655524242,"K":2740.680716559354,"cK":219.25445732474833,"F":148.7230569375,"G":2955.200866290008,"paid_event_frequency":0.805015},{"id":"CBU-008","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":860.6122949499834,"EL_M1":745.2374199499999,"EL_M2":115.374875,"expected_recovery":154.38672980795684,"RC":61.75469192318274,"K":1380.8052340207182,"cK":110.46441872165747,"F":148.723605375,"G":1575.406681293098,"paid_event_frequency":0.80503},{"id":"CBU-009","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":778.8428844499999,"EL_M1":598.8011005999999,"EL_M2":180.04178385000003,"expected_recovery":263.9285047006714,"RC":105.57140188026857,"K":1309.0770394530746,"cK":104.72616315624597,"F":128.42812725,"G":1490.0914356486858,"paid_event_frequency":0.24994},{"id":"CBU-010","hourly":1000.0,"provider":"Google Cloud","region":"Singapore","EL":1184.0635981999835,"EL_M1":951.1060356999999,"EL_M2":232.9575625,"expected_recovery":291.79713231199446,"RC":116.71885292479779,"K":1988.6141215861508,"cK":159.08912972689205,"F":140.7074600625,"G":2134.105387885564,"paid_event_frequency":0.585785},{"id":"CBU-011","hourly":500.0,"provider":"Google Cloud","region":"Singapore","EL":698.9612429000236,"EL_M1":583.2177429000001,"EL_M2":115.7435,"expected_recovery":153.28404974552188,"RC":61.313619898208756,"K":1136.960554508238,"cK":90.95684436065903,"F":148.7248850625,"G":1333.2754562951886,"paid_event_frequency":0.805065},{"id":"CBU-012","hourly":1500.0,"provider":"Google Cloud","region":"Singapore","EL":1775.3735777000084,"EL_M1":1427.8892026999997,"EL_M2":347.484375,"expected_recovery":436.77180483176926,"RC":174.7087219327077,"K":3017.742780733137,"cK":241.41942245865096,"F":140.7078256875,"G":3109.6127303718226,"paid_event_frequency":0.585795},{"id":"CBU-013","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":386.3690896000029,"EL_M1":267.56773790000005,"EL_M2":118.8013517,"expected_recovery":148.87224747053426,"RC":59.54889898821371,"K":632.480113180025,"cK":50.598409054402,"F":125.7958100625,"G":829.7496102734914,"paid_event_frequency":0.177945},{"id":"CBU-014","hourly":500.0,"provider":"AWS","region":"Singapore","EL":588.4043065499981,"EL_M1":472.18555654999994,"EL_M2":116.21875,"expected_recovery":124.93789263832696,"RC":49.97515705533078,"K":979.0219574771833,"cK":78.32175659817466,"F":140.718246,"G":1143.2259549380046,"paid_event_frequency":0.58608},{"id":"CBU-015","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2079.6552120000065,"EL_M1":1736.8530026000003,"EL_M2":342.8022094,"expected_recovery":407.79222263438805,"RC":163.11688905375524,"K":3125.725897863041,"cK":250.05807182904329,"F":148.627811625,"G":3521.94397934374,"paid_event_frequency":0.80241},{"id":"CBU-016","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":436.99966089999646,"EL_M1":317.44903545000005,"EL_M2":119.55062545,"expected_recovery":141.1161680211991,"RC":56.44646720847964,"K":743.0302980403876,"cK":59.44242384323101,"F":128.3058256875,"G":908.2591701856095,"paid_event_frequency":0.246595},{"id":"CBU-017","hourly":500.0,"provider":"AWS","region":"Singapore","EL":851.846372599994,"EL_M1":737.9903257000001,"EL_M2":113.8560469,"expected_recovery":138.49355201369292,"RC":55.39742080547717,"K":1229.9766558422268,"cK":98.39813246737815,"F":148.6268975625,"G":1539.025097913799,"paid_event_frequency":0.802385},{"id":"CBU-018","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2562.029385400037,"EL_M1":2215.1393854000003,"EL_M2":346.89,"expected_recovery":389.30279978277804,"RC":155.72111991311124,"K":3897.1778911611673,"cK":311.7742312928934,"F":148.6250694375,"G":4237.533074724722,"paid_event_frequency":0.802335},{"id":"CBU-019","hourly":1000.0,"provider":"AWS","region":"Singapore","EL":510.5921293499985,"EL_M1":392.4273693500001,"EL_M2":118.16476000000002,"expected_recovery":154.08207176598972,"RC":61.63282870639589,"K":781.3270917794089,"cK":62.50616734235271,"F":128.29650225,"G":1017.3701701983294,"paid_event_frequency":0.24634},{"id":"CBU-020","hourly":500.0,"provider":"AWS","region":"Singapore","EL":588.7578030999979,"EL_M1":472.2477250000002,"EL_M2":116.5100781,"expected_recovery":125.2394376851521,"RC":50.09577507406084,"K":965.2988321086474,"cK":77.22390656869179,"F":140.718611625,"G":1142.3947951570005,"paid_event_frequency":0.58609},{"id":"CBU-021","hourly":1500.0,"provider":"AWS","region":"Singapore","EL":2077.3913271000083,"EL_M1":1735.6377989500004,"EL_M2":341.75352814999997,"expected_recovery":407.716312193284,"RC":163.08652487731362,"K":3130.0198558373727,"cK":250.4015884669898,"F":148.627811625,"G":3519.343002759082,"paid_event_frequency":0.80241},{"id":"CBU-022","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":1176.6847808499829,"EL_M1":939.1417808499998,"EL_M2":237.543,"expected_recovery":242.8954260073467,"RC":97.1581704029387,"K":1409.8530984570891,"cK":112.78824787656713,"F":140.6891788125,"G":2036.427170589318,"paid_event_frequency":0.585285},{"id":"CBU-023","hourly":500.0,"provider":"Azure","region":"Singapore","EL":192.95460254999955,"EL_M1":132.52728655,"EL_M2":60.42731599999999,"expected_recovery":61.64937354604842,"RC":24.65974941841937,"K":292.5544407759069,"cK":23.404355262072553,"F":125.88849599999999,"G":489.20960430732197,"paid_event_frequency":0.18048},{"id":"CBU-024","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":1765.0024139000072,"EL_M1":1409.7510389,"EL_M2":355.251375,"expected_recovery":364.1754507883893,"RC":145.67018031535574,"K":2134.6137854844774,"cK":170.7691028387582,"F":140.6888131875,"G":2962.840680322161,"paid_event_frequency":0.585275},{"id":"CBU-025","hourly":1000.0,"provider":"Azure","region":"Singapore","EL":1381.3875227501026,"EL_M1":1150.47502275,"EL_M2":230.9125,"expected_recovery":224.4068400886913,"RC":89.76273603547652,"K":1679.638238865391,"cK":134.37105910923128,"F":148.5621819375,"G":2338.7779997764137,"paid_event_frequency":0.800615},{"id":"CBU-026","hourly":500.0,"provider":"Azure","region":"Singapore","EL":221.1363683500033,"EL_M1":159.35573749999998,"EL_M2":61.780630850000016,"expected_recovery":66.92232031571774,"RC":26.768928126287097,"K":299.49823609333913,"cK":23.95985888746713,"F":128.4381819375,"G":533.7377830683434,"paid_event_frequency":0.250215},{"id":"CBU-027","hourly":1500.0,"provider":"Azure","region":"Singapore","EL":2548.6659360500325,"EL_M1":2202.0253110500003,"EL_M2":346.640625,"expected_recovery":338.2313273904183,"RC":135.29253095616733,"K":3007.795170135915,"cK":240.62361361087324,"F":148.56108506249998,"G":4097.524220906097,"paid_event_frequency":0.800585},{"id":"CBU-028","hourly":1000.0,"provider":"Alibaba Cloud","region":"Singapore","EL":1708.64604135002,"EL_M1":1477.0240841999996,"EL_M2":231.62195715,"expected_recovery":180.6805196926507,"RC":72.27220787706028,"K":1102.4993544190356,"cK":88.19994835352286,"F":148.6916131875,"G":2690.413081024137,"paid_event_frequency":0.804155},{"id":"CBU-029","hourly":500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":255.9137608500029,"EL_M1":196.36248985000003,"EL_M2":59.55127099999999,"expected_recovery":42.94571998766412,"RC":17.17828799506565,"K":267.0178892546984,"cK":21.36143114037587,"F":128.39083349999999,"G":563.7924179805925,"paid_event_frequency":0.24892},{"id":"CBU-030","hourly":1500.0,"provider":"Alibaba Cloud","region":"Singapore","EL":1771.2090002000064,"EL_M1":1422.1110020499998,"EL_M2":349.09799814999997,"expected_recovery":272.4290983172559,"RC":108.97163932690238,"K":1435.4037763340789,"cK":114.83230210672632,"F":140.766874125,"G":2847.706421011513,"paid_event_frequency":0.58741},{"id":"CBU-031","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1724.4345053500065,"EL_M1":1489.48435535,"EL_M2":234.95015,"expected_recovery":249.62220123129987,"RC":99.84888049251995,"K":2591.533724704889,"cK":207.32269797639114,"F":156.639386625,"G":2917.6606272585564,"paid_event_frequency":1.02153},{"id":"CBU-032","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":754.9173041000073,"EL_M1":637.7104290999999,"EL_M2":117.206875,"expected_recovery":121.96631664448614,"RC":48.78652665779446,"K":1116.8842352112042,"cK":89.35073881689634,"F":148.62872568749998,"G":1388.9110603495974,"paid_event_frequency":0.802435},{"id":"CBU-033","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":704.3441045000001,"EL_M1":519.1918417999999,"EL_M2":185.1522627,"expected_recovery":213.62166196135985,"RC":85.44866478454395,"K":1207.929626587434,"cK":96.63437012699472,"F":128.1248413125,"G":1352.7359742987182,"paid_event_frequency":0.241645},{"id":"CBU-034","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":1509.1206422999155,"EL_M1":1276.1156422999998,"EL_M2":233.005,"expected_recovery":243.46733753193757,"RC":97.38693501277504,"K":2208.0352955575963,"cK":176.64282364460772,"F":148.62872568749998,"G":2575.705502193064,"paid_event_frequency":0.802435},{"id":"CBU-035","hourly":500.0,"provider":"Google Cloud","region":"Virginia","EL":862.0322241500072,"EL_M1":744.77902415,"EL_M2":117.2532,"expected_recovery":124.38359217928928,"RC":49.753436871715714,"K":1274.6965564210768,"cK":101.97572451368615,"F":156.63828974999998,"G":1560.5329003805455,"paid_event_frequency":1.0215},{"id":"CBU-036","hourly":1500.0,"provider":"Google Cloud","region":"Virginia","EL":779.4206764499992,"EL_M1":594.5573049000001,"EL_M2":184.86337154999998,"expected_recovery":213.88576013207398,"RC":85.5543040528296,"K":1262.8950561870406,"cK":101.03160449496325,"F":130.7145631875,"G":1462.2948642470562,"paid_event_frequency":0.312475},{"id":"CBU-037","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.6143655499873,"EL_M1":1809.3256155499998,"EL_M2":235.28875,"expected_recovery":258.57032539756574,"RC":103.4281301590263,"K":3038.743068890291,"cK":243.09944551122328,"F":156.63902099999999,"G":3397.0412829603156,"paid_event_frequency":1.02152},{"id":"CBU-038","hourly":1000.0,"provider":"Google Cloud","region":"Virginia","EL":2044.682521600002,"EL_M1":1810.3962715999996,"EL_M2":234.28625,"expected_recovery":258.36489858411574,"RC":103.3459594336463,"K":2932.845657968439,"cK":234.6276526374751,"F":156.6355475625,"G":3385.7222416448312,"paid_event_frequency":1.021425},{"id":"CBU-039","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":597.8560732500006,"EL_M1":473.5136534,"EL_M2":124.34241985000001,"expected_recovery":125.72321621416773,"RC":50.2892864856671,"K":873.2667551968943,"cK":69.86134041575154,"F":130.624071,"G":1131.507694868559,"paid_event_frequency":0.31},{"id":"CBU-040","hourly":500.0,"provider":"AWS","region":"Virginia","EL":755.1484951500015,"EL_M1":638.1356641499999,"EL_M2":117.01283099999999,"expected_recovery":109.50982771136705,"RC":43.803931084546825,"K":986.1809064902143,"cK":78.89447251921715,"F":148.61483193749999,"G":1368.6156409216874,"paid_event_frequency":0.802055},{"id":"CBU-041","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":2593.876629050023,"EL_M1":2236.06533645,"EL_M2":357.8112926,"expected_recovery":325.9274784578738,"RC":130.37099138314952,"K":3145.4614641553485,"cK":251.6369171324279,"F":156.5350006875,"G":4176.559384337467,"paid_event_frequency":1.018675},{"id":"CBU-042","hourly":1000.0,"provider":"AWS","region":"Virginia","EL":1509.4151289999131,"EL_M1":1275.8440631500002,"EL_M2":233.57106585,"expected_recovery":218.77009444562145,"RC":87.50803777824859,"K":2000.4582755068463,"cK":160.03666204054772,"F":148.61501475,"G":2540.7664580916125,"paid_event_frequency":0.80206},{"id":"CBU-043","hourly":500.0,"provider":"AWS","region":"Virginia","EL":235.97450429999486,"EL_M1":173.53241604999997,"EL_M2":62.442088250000005,"expected_recovery":61.66664507585509,"RC":24.666658030342035,"K":355.64391171178,"cK":28.4515129369424,"F":128.1012585,"G":556.2585783563724,"paid_event_frequency":0.241},{"id":"CBU-044","hourly":1500.0,"provider":"AWS","region":"Virginia","EL":2263.752833300023,"EL_M1":1914.2306997000005,"EL_M2":349.5221336,"expected_recovery":327.85441905657603,"RC":131.14176762263043,"K":2944.6708121591682,"cK":235.57366497273347,"F":148.614649125,"G":3705.4438866938494,"paid_event_frequency":0.80205},{"id":"CBU-045","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":1720.8037513999889,"EL_M1":1483.2641014000005,"EL_M2":237.53965,"expected_recovery":184.19309677339697,"RC":73.67723870935879,"K":1826.0713006360438,"cK":146.08570405088352,"F":156.52421475,"G":2796.1212118803082,"paid_event_frequency":1.01838},{"id":"CBU-046","hourly":500.0,"provider":"Azure","region":"Virginia","EL":259.69517729999876,"EL_M1":197.47533139999996,"EL_M2":62.219845899999996,"expected_recovery":49.34837397238826,"RC":19.739349588955307,"K":365.7461384448022,"cK":29.25969107558418,"F":130.6619131875,"G":585.8081748693843,"paid_event_frequency":0.311035},{"id":"CBU-047","hourly":1500.0,"provider":"Azure","region":"Virginia","EL":3058.0457658000505,"EL_M1":2701.03718765,"EL_M2":357.00857814999995,"expected_recovery":278.7153493151627,"RC":111.48613972606509,"K":3301.988128274631,"cK":264.1590502619705,"F":156.52421475,"G":4786.953560717448,"paid_event_frequency":1.01838},{"id":"CBU-048","hourly":1000.0,"provider":"Azure","region":"Virginia","EL":2038.5268750500027,"EL_M1":1801.0554614500002,"EL_M2":237.4714136,"expected_recovery":178.07123793420533,"RC":71.22849517368213,"K":2204.3462325918495,"cK":176.34769860734795,"F":156.52256943749998,"G":3256.8341843580433,"paid_event_frequency":1.018335},{"id":"CBU-049","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":594.291237700001,"EL_M1":468.7117576000001,"EL_M2":125.5794801,"expected_recovery":70.92438159157166,"RC":28.369752636628665,"K":472.63404008717725,"cK":37.81072320697418,"F":130.629555375,"G":1054.8016918914718,"paid_event_frequency":0.31015},{"id":"CBU-050","hourly":1000.0,"provider":"Alibaba Cloud","region":"Virginia","EL":1504.8791121499112,"EL_M1":1273.6739443,"EL_M2":231.20516785,"expected_recovery":121.15774674399063,"RC":48.46309869759625,"K":992.118526770284,"cK":79.36948214162273,"F":148.64718975,"G":2375.145176985507,"paid_event_frequency":0.80294},{"id":"CBU-051","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1570.1088463000533,"EL_M1":1330.0897046,"EL_M2":240.0191417,"expected_recovery":330.5359369994601,"RC":132.21437479978405,"K":2475.981544756778,"cK":198.07852358054225,"F":149.8992725625,"G":2733.7346896571726,"paid_event_frequency":0.837185},{"id":"CBU-052","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":677.0100555499996,"EL_M1":558.2706805500002,"EL_M2":118.739375,"expected_recovery":161.79720763307319,"RC":64.71888305322928,"K":1125.7310032722983,"cK":90.05848026178386,"F":141.927367875,"G":1298.286382320017,"paid_event_frequency":0.61915},{"id":"CBU-053","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":681.4736728000029,"EL_M1":496.62482739999984,"EL_M2":184.84884540000002,"expected_recovery":261.9067663228353,"RC":104.76270652913414,"K":1145.3478438325922,"cK":91.62782750660737,"F":126.3500975625,"G":1338.9524058643258,"paid_event_frequency":0.193105},{"id":"CBU-054","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1355.403764649979,"EL_M1":1117.28076465,"EL_M2":238.123,"expected_recovery":324.63293021192203,"RC":129.85317208476883,"K":2233.996763480237,"cK":178.71974107841896,"F":141.9268194375,"G":2407.8713296675555,"paid_event_frequency":0.619135},{"id":"CBU-055","hourly":500.0,"provider":"Google Cloud","region":"Frankfurt","EL":784.6820721499953,"EL_M1":665.0305221499999,"EL_M2":119.65155,"expected_recovery":164.7801313412773,"RC":65.91205253651093,"K":1241.2130555703643,"cK":99.29704444562914,"F":149.89908975,"G":1466.387011842847,"paid_event_frequency":0.83718},{"id":"CBU-056","hourly":1500.0,"provider":"Google Cloud","region":"Frankfurt","EL":755.8277319499989,"EL_M1":572.92072985,"EL_M2":182.9070021,"expected_recovery":262.9391815657444,"RC":105.17567262629775,"K":1227.9229050868407,"cK":98.23383240694726,"F":128.94055068749998,"G":1450.9037168943253,"paid_event_frequency":0.263955},{"id":"CBU-057","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1890.7086107999867,"EL_M1":1651.2085170499995,"EL_M2":239.50009375,"expected_recovery":339.1691317147795,"RC":135.6676526859118,"K":2888.9298047230495,"cK":231.11438437784398,"F":149.8981756875,"G":3209.8517647349904,"paid_event_frequency":0.837155},{"id":"CBU-058","hourly":1000.0,"provider":"Google Cloud","region":"Frankfurt","EL":1891.3325052999792,"EL_M1":1653.0666394499997,"EL_M2":238.26586585,"expected_recovery":338.8535705058596,"RC":135.54142820234384,"K":2961.730178790007,"cK":236.93841430320055,"F":149.90786475,"G":3218.2936167406983,"paid_event_frequency":0.83742},{"id":"CBU-059","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":571.8049722999932,"EL_M1":452.5733388000001,"EL_M2":119.23163349999997,"expected_recovery":147.08291750521016,"RC":58.83316700208407,"K":891.5401994511411,"cK":71.32321595609129,"F":128.8242819375,"G":1107.714182927558,"paid_event_frequency":0.260775},{"id":"CBU-060","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":673.0920257499982,"EL_M1":553.03077575,"EL_M2":120.06125,"expected_recovery":140.26026897900556,"RC":56.10410759160223,"K":1008.1526513579851,"cK":80.6522121086388,"F":141.9926319375,"G":1269.1213031836523,"paid_event_frequency":0.620935},{"id":"CBU-061","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":2330.8146396500088,"EL_M1":1980.2443303999994,"EL_M2":350.57030925,"expected_recovery":410.5371427736354,"RC":164.2148571094542,"K":3230.933502376043,"cK":258.47468019008346,"F":149.86161318749998,"G":3871.154386849395,"paid_event_frequency":0.836155},{"id":"CBU-062","hourly":1000.0,"provider":"AWS","region":"Frankfurt","EL":1346.6838142499796,"EL_M1":1106.8050225999998,"EL_M2":239.87879164999998,"expected_recovery":280.425920130368,"RC":112.17036805214721,"K":2037.371093239059,"cK":162.98968745912472,"F":141.99354599999998,"G":2351.7832210150023,"paid_event_frequency":0.62096},{"id":"CBU-063","hourly":500.0,"provider":"AWS","region":"Frankfurt","EL":222.0400430499996,"EL_M1":162.29724040000002,"EL_M2":59.74280264999999,"expected_recovery":71.9994822406494,"RC":28.79979289625976,"K":372.0119788301865,"cK":29.76095830641492,"F":126.29872725,"G":542.5326953368991,"paid_event_frequency":0.1917},{"id":"CBU-064","hourly":1500.0,"provider":"AWS","region":"Frankfurt","EL":2020.6984691500065,"EL_M1":1660.5230629,"EL_M2":360.17540625,"expected_recovery":422.01751332133654,"RC":168.80700532853461,"K":3016.593345175073,"cK":241.32746761400585,"F":141.992449125,"G":3430.433854956729,"paid_event_frequency":0.62093},{"id":"CBU-065","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1563.369268500044,"EL_M1":1324.8055184999998,"EL_M2":238.56375,"expected_recovery":224.05614437175427,"RC":89.62245774870172,"K":2228.7080701491323,"cK":178.2966456119306,"F":149.8539350625,"G":2641.5230758975686,"paid_event_frequency":0.835945},{"id":"CBU-066","hourly":500.0,"provider":"Azure","region":"Frankfurt","EL":252.19135500000425,"EL_M1":190.22419380000002,"EL_M2":61.9671612,"expected_recovery":57.53345415007834,"RC":23.01338166003134,"K":423.78255677086713,"cK":33.90260454166937,"F":128.911117875,"G":584.0246121022732,"paid_event_frequency":0.26315},{"id":"CBU-067","hourly":1500.0,"provider":"Azure","region":"Frankfurt","EL":2819.433195650034,"EL_M1":2461.33069565,"EL_M2":358.1025,"expected_recovery":338.2595156255247,"RC":135.3038062502099,"K":3937.134537746307,"cK":314.9707630197046,"F":149.8524725625,"G":4559.413649976598,"paid_event_frequency":0.835905},{"id":"CBU-068","hourly":1000.0,"provider":"Azure","region":"Frankfurt","EL":1885.67560719999,"EL_M1":1642.2241072,"EL_M2":243.4515,"expected_recovery":222.79587425230739,"RC":89.11834970092296,"K":2639.692199348856,"cK":211.17537594790846,"F":149.8597850625,"G":3114.4388238817623,"paid_event_frequency":0.836105},{"id":"CBU-069","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":569.2305070499967,"EL_M1":450.44203035000004,"EL_M2":118.78847669999996,"expected_recovery":67.06714065872723,"RC":26.826856263490892,"K":562.8430495261215,"cK":45.02744396208972,"F":128.79082725,"G":1026.500846034103,"paid_event_frequency":0.25986},{"id":"CBU-070","hourly":1000.0,"provider":"Alibaba Cloud","region":"Frankfurt","EL":1340.1559396999785,"EL_M1":1099.6389084500001,"EL_M2":240.51703125,"expected_recovery":125.84878165137593,"RC":50.339512660550376,"K":1081.1351846933362,"cK":86.4908147754669,"F":141.868136625,"G":2158.472538347994,"paid_event_frequency":0.61753},{"id":"CBU-071","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":1242.3541198499818,"EL_M1":1006.7226198499997,"EL_M2":235.6315,"expected_recovery":211.85009918542505,"RC":84.74003967417002,"K":2299.0928224732197,"cK":183.92742579785758,"F":140.6846085,"G":2202.2749250960123,"paid_event_frequency":0.58516},{"id":"CBU-072","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":591.6956171499984,"EL_M1":470.76041234999997,"EL_M2":120.93520480000001,"expected_recovery":77.17824779857244,"RC":30.87129911942898,"K":1130.7576418862245,"cK":90.46061135089796,"F":140.6946631875,"G":1138.2962544104337,"paid_event_frequency":0.585435},{"id":"CBU-073","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":581.0919298000007,"EL_M1":400.97813629999996,"EL_M2":180.11379349999999,"expected_recovery":182.99678423374127,"RC":73.19871369349652,"K":1186.1557379550454,"cK":94.89245903640364,"F":125.87862412499999,"G":1166.7489688732012,"paid_event_frequency":0.18021},{"id":"CBU-074","hourly":1000.0,"provider":"Google Cloud","region":"Tokyo","EL":1184.4327276499828,"EL_M1":942.0312835500002,"EL_M2":242.4014441,"expected_recovery":154.65829852433853,"RC":61.86331940973542,"K":2269.1881685662192,"cK":181.53505348529754,"F":140.6950288125,"G":2091.3681724766875,"paid_event_frequency":0.585445},{"id":"CBU-075","hourly":500.0,"provider":"Google Cloud","region":"Tokyo","EL":622.060666299998,"EL_M1":503.91116629999993,"EL_M2":118.1495,"expected_recovery":105.95424704316963,"RC":42.38169881726785,"K":1143.8132553796154,"cK":91.50506043036923,"F":140.6846085,"G":1195.50937873018,"paid_event_frequency":0.58516},{"id":"CBU-076","hourly":1500.0,"provider":"Google Cloud","region":"Tokyo","EL":614.7882923499973,"EL_M1":423.1454303999999,"EL_M2":191.64286195,"expected_recovery":148.40686554039405,"RC":59.362746216157625,"K":1374.3090308923204,"cK":109.94472247138563,"F":126.1117100625,"G":1213.6099614667207,"paid_event_frequency":0.186585},{"id":"CBU-077","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1348.4854954999796,"EL_M1":1111.6902205499998,"EL_M2":236.79527495000002,"expected_recovery":206.8545762322226,"RC":82.74183049288905,"K":2523.207859427279,"cK":201.8566287541823,"F":140.64256162499998,"G":2364.968688496068,"paid_event_frequency":0.58401},{"id":"CBU-078","hourly":500.0,"provider":"AWS","region":"Tokyo","EL":677.0039081000031,"EL_M1":556.3557830999999,"EL_M2":120.648125,"expected_recovery":70.84555757796011,"RC":28.338223031184043,"K":1283.9977870294497,"cK":102.71982296235598,"F":140.6537131875,"G":1264.9542230413908,"paid_event_frequency":0.584315},{"id":"CBU-079","hourly":1500.0,"provider":"AWS","region":"Tokyo","EL":643.7833908999996,"EL_M1":461.19984394999994,"EL_M2":182.58354694999997,"expected_recovery":176.10440335112384,"RC":70.44176134044953,"K":1378.7732161502092,"cK":110.30185729201673,"F":126.05010225,"G":1267.4361490432877,"paid_event_frequency":0.1849},{"id":"CBU-080","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1185.814458799982,"EL_M1":944.3657087999998,"EL_M2":241.44875,"expected_recovery":136.43133097931855,"RC":54.57253239172742,"K":2158.089337457298,"cK":172.64714699658384,"F":140.6544444375,"G":2071.584776834391,"paid_event_frequency":0.584335},{"id":"CBU-081","hourly":1000.0,"provider":"AWS","region":"Tokyo","EL":1247.9420383499807,"EL_M1":1011.7417633999997,"EL_M2":236.20027495000002,"expected_recovery":203.5855881881564,"RC":81.43423527526257,"K":2278.461315399264,"cK":182.27690523194113,"F":140.6423788125,"G":2203.0607435595794,"paid_event_frequency":0.584005},{"id":"CBU-082","hourly":1000.0,"provider":"Azure","region":"Tokyo","EL":1179.9571932499834,"EL_M1":944.5985140499998,"EL_M2":235.3586792,"expected_recovery":151.9633636124131,"RC":60.785345444965245,"K":1767.6882546610404,"cK":141.41506037288323,"F":140.7081913125,"G":2030.4877205071095,"paid_event_frequency":0.585805},{"id":"CBU-083","hourly":500.0,"provider":"Azure","region":"Tokyo","EL":196.85356159999844,"EL_M1":134.6824342,"EL_M2":62.1711274,"expected_recovery":24.742237190114906,"RC":9.896894876045963,"K":386.988845454699,"cK":30.959107636375922,"F":125.9190256875,"G":484.83811973322713,"paid_event_frequency":0.181315},{"id":"CBU-084","hourly":1500.0,"provider":"Azure","region":"Tokyo","EL":1770.9692789000067,"EL_M1":1417.7795768,"EL_M2":353.18970210000003,"expected_recovery":228.3237373198615,"RC":91.32949492794461,"K":2677.46108558903,"cK":214.1968868471224,"F":140.7081913125,"G":2956.2718026500984,"paid_event_frequency":0.585805},{"id":"CBU-085","hourly":1000.0,"provider":"Alibaba Cloud","region":"Tokyo","EL":1253.9197383499795,"EL_M1":1009.6004257999999,"EL_M2":244.31931254999998,"expected_recovery":123.44818033493243,"RC":49.379272133972975,"K":853.2226168306793,"cK":68.25780934645434,"F":140.718246,"G":2016.3667544405423,"paid_event_frequency":0.58608},{"id":"CBU-086","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":402.80653129999826,"EL_M1":284.73495529999997,"EL_M2":118.07157599999996,"expected_recovery":90.54136488216108,"RC":36.21654595286443,"K":926.7025922674425,"cK":74.1362073813954,"F":126.0683835,"G":852.303557512344,"paid_event_frequency":0.1854},{"id":"CBU-087","hourly":500.0,"provider":"Google Cloud","region":"Seoul","EL":677.3308019500035,"EL_M1":556.3376769500002,"EL_M2":120.993125,"expected_recovery":44.932493067937685,"RC":17.972997227175075,"K":1386.1767142912577,"cK":110.89413714330061,"F":140.75718506249999,"G":1262.6068285106387,"paid_event_frequency":0.587145},{"id":"CBU-088","hourly":1500.0,"provider":"Google Cloud","region":"Seoul","EL":2010.684465150019,"EL_M1":1669.0840204500005,"EL_M2":341.60044469999997,"expected_recovery":229.90060052012586,"RC":91.96024020805035,"K":4102.749302241359,"cK":328.21994417930875,"F":140.73597881249998,"G":3428.800837799837,"paid_event_frequency":0.586565},{"id":"CBU-089","hourly":1000.0,"provider":"Google Cloud","region":"Seoul","EL":433.5872555500009,"EL_M1":307.91927705,"EL_M2":125.66797850000002,"expected_recovery":56.619077083591776,"RC":22.64763083343671,"K":1156.7861803636836,"cK":92.54289442909469,"F":126.077524125,"G":899.8070732500431,"paid_event_frequency":0.18565},{"id":"CBU-090","hourly":1000.0,"provider":"AWS","region":"Seoul","EL":1180.9339241999817,"EL_M1":951.7426742,"EL_M2":229.19125,"expected_recovery":134.62686868313585,"RC":53.850747473254344,"K":2094.8984911181333,"cK":167.59187928945067,"F":140.69484599999998,"G":2057.4285292835825,"paid_event_frequency":0.58544},{"id":"CBU-091","hourly":500.0,"provider":"AWS","region":"Seoul","EL":629.4122587499966,"EL_M1":509.55207605,"EL_M2":119.8601827,"expected_recovery":33.57185892146822,"RC":13.428743568587288,"K":1081.717071957989,"cK":86.53736575663912,"F":140.71751475,"G":1160.127843766964,"paid_event_frequency":0.58606},{"id":"CBU-092","hourly":1500.0,"provider":"AWS","region":"Seoul","EL":1769.2167649000057,"EL_M1":1428.5011399,"EL_M2":340.715625,"expected_recovery":201.47969726539395,"RC":80.59187890615759,"K":3132.315610969039,"cK":250.58524887752313,"F":140.69484599999998,"G":2988.118318244915,"paid_event_frequency":0.58544},{"id":"CBU-093","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":384.87905014999916,"EL_M1":263.65232189999995,"EL_M2":121.22672825000001,"expected_recovery":49.43037756276368,"RC":19.772151025105472,"K":642.0769272537943,"cK":51.366154180303546,"F":125.8941631875,"G":775.8820247238776,"paid_event_frequency":0.180635},{"id":"CBU-094","hourly":1000.0,"provider":"Azure","region":"Seoul","EL":1179.266798849979,"EL_M1":939.43679885,"EL_M2":239.83,"expected_recovery":31.386580214341848,"RC":12.55463208573674,"K":1467.6782517094455,"cK":117.41426013675564,"F":140.7363444375,"G":1933.296047346629,"paid_event_frequency":0.586575},{"id":"CBU-095","hourly":1000.0,"provider":"Alibaba Cloud","region":"Seoul","EL":1241.6694867999804,"EL_M1":1007.8194868000003,"EL_M2":233.85,"expected_recovery":83.25502604185021,"RC":33.30201041674009,"K":999.5095096371497,"cK":79.96076077097197,"F":140.7314085,"G":1994.2182219835902,"paid_event_frequency":0.58644},{"id":"CBU-096","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":409.9594161499986,"EL_M1":284.13629465,"EL_M2":125.82312150000003,"expected_recovery":30.047254964052797,"RC":12.01890198562112,"K":889.4892079561236,"cK":71.15913663648989,"F":126.0886756875,"G":825.6348406128128,"paid_event_frequency":0.185955},{"id":"CBU-097","hourly":1000.0,"provider":"Google Cloud","region":"HongKong","EL":1349.5925777499804,"EL_M1":1115.628383,"EL_M2":233.96419475000002,"expected_recovery":37.174681839936966,"RC":14.869872735974788,"K":2197.633166437585,"cK":175.8106533150068,"F":140.7100194375,"G":2241.310830984616,"paid_event_frequency":0.585855},{"id":"CBU-098","hourly":1000.0,"provider":"AWS","region":"HongKong","EL":1344.1882108999791,"EL_M1":1108.2219609,"EL_M2":235.96625,"expected_recovery":30.83898095484051,"RC":12.335592381936204,"K":2051.1184175460944,"cK":164.08947340368755,"F":140.720805375,"G":2215.1121094141376,"paid_event_frequency":0.58615},{"id":"CBU-099","hourly":1000.0,"provider":"Azure","region":"HongKong","EL":433.14259670000075,"EL_M1":309.42044360000006,"EL_M2":123.7221531,"expected_recovery":16.81284500683938,"RC":6.725138002735753,"K":667.8659368075259,"cK":53.42927494460208,"F":126.0861163125,"G":825.8441679464514,"paid_event_frequency":0.185885},{"id":"CBU-100","hourly":1000.0,"provider":"Alibaba Cloud","region":"HongKong","EL":1180.6931772999828,"EL_M1":944.1694272999999,"EL_M2":236.52375,"expected_recovery":17.896603660544997,"RC":7.158641464217999,"K":893.7600778222284,"cK":71.50080622577828,"F":140.752980375,"G":1866.807473819972,"paid_event_frequency":0.58703}],"portfolio":{"id":"XL-50-1000-1","attachment":50000,"limit":1000000,"annual_limit":1000000,"scope":"all","EL":114971.76746815,"expected_recovery":18565.964006300004,"reinsurance_premium":25992.349608820005,"RC":7426.38560252,"mean_net":96405.80346184995,"net_TVaR":263838.85259,"net_VaR":236886.02,"K":167433.04912815007,"cK":13394.643930252007,"F":14029.211371874997,"G":199762.677830396,"average_premium":1997.6267783039598,"annual_exhaustion_probability":0.0,"recovery_year_probability":0.300415,"tail_reduction":0.4413771599270975},"parameters":{"version":"CB-CONFLICT-3.0","currency":"USD","seed":20261118,"years":200000,"waiting_hours":0.5,"payable_cap_hours":20,"capital_percentile":0.99,"capital_rate":0.08,"variable_expense":0.25,"reinsurance_loading":0.4,"ordinary_conditional_hit":0.65,"feature_conditional_hit":0.1,"m1_frequency_scale":1.0,"m1_duration_scale":1.0,"m2_physical_rate_per_region":0.1,"m2_access_rate_per_jurisdiction":0.0,"m2_conditional_hit":0.2,"m2_frequency_scale":1.0,"physical_hours":[24.0,72.0,168.0],"physical_weights":[0.5,0.35,0.15],"backup_ordinary_success":[0.0,0.2,0.8],"backup_physical_success":[0.0,0.1,0.4],"backup_rto_hours":2.0,"irrecoverable_ratios":[0.25,0.5,0.75],"irrecoverable_weights":[0.25,0.5,0.25],"traffic_multipliers":[0.75,1.0,1.25],"traffic_weights":[0.25,0.5,0.25],"net_loss_caps":true,"concentration":"moderate","first_year":false,"force_no_backup":false,"evidence_status":"参数表中频度映射、命中、损失、恢复及再保价格均有情景假设；不属于经实赔校准的市场费率","all_tested_backup":true}}},"counterfactuals":{"no_reinsurance_premium":305375.360713586,"legacy_aggregate":{"attachment":800000,"limit":1200000,"expected_recovery":42.891715999999995,"K":458580.8664429001,"G":304945.2997744927},"quota_share":{"share":0.2,"commission":0.25,"K":370261.71706152003,"G":310061.80340889853,"note":"情景分保手续费25%，按分出保费和赔款现金流联立求解，并非已获报价"}},"scopeVersion":"EE-CONFLICT-3.0"};

;
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

;
/* Report-backed demonstration policies. Existing stored policies are not rewritten. */
(function(root){
'use strict';
const D=root.CBData,U=root.CBUnifiedData,oldClaim=D.claim;
const regionMap={Singapore:'singapore',Virginia:'us-east',Frankfurt:'frankfurt',Tokyo:'japan',Seoul:'seoul','Hong Kong':'hongkong',HongKong:'hongkong'};
const places=[['frankfurt','法兰克福','德国','europe-west3',8.68,50.11],['seoul','首尔','韩国','asia-northeast3',126.98,37.57],['hongkong','香港','中国','asia-east2',114.17,22.32]];
for(const [id,name,country,code,lon,lat]of places){if(!D.regions.some(r=>r.id===id))D.regions.push({id,name,country,code,m1:0,m2:0});root.CBWorldMap.points[id]=root.CBM2Map.project(lon,lat);}
D.regions.find(r=>r.id==='singapore').name='新加坡';D.regions.find(r=>r.id==='singapore').code='asia-southeast1';
D.regions.find(r=>r.id==='us-east').code='us-east4';D.regions.find(r=>r.id==='japan').code='asia-northeast1';
function makeApp(id='CBU-001'){
 const p=U.book.find(x=>x.id===id)||U.book[0], backup=['none','untested','tested'][p.backup];
 const services=[['core',1-p.ai_share],['ai',p.ai_share]].filter(([,share])=>share>0).map(([kind,share],i)=>({
  ...root.CBExternal.defaults,id:'SVC-'+String(i+1).padStart(2,'0'),provider:p.provider,region:regionMap[p.region],eventRegionProxy:p.google_region_proxy,
  kind:kind==='ai'?'AI API':'云计算',service:kind==='ai'?({ 'Google Cloud':'Vertex AI API',AWS:'Bedrock API',Azure:'Azure AI API','Alibaba Cloud':'Model Studio API'}[p.provider]):({'Google Cloud':'Cloud Run / Cloud SQL / Cloud Storage',AWS:'EC2 / RDS / S3',Azure:'Virtual Machines / Azure SQL / Blob Storage','Alibaba Cloud':'ECS / RDS / OSS'}[p.provider]),
  ...(kind==='ai'?{model:'demo-model-v1',olaVersion:'OLA-DEMO-1',olaSuccess:99,olaResponse:30,olaWindow:5,olaRecovery:5}:{}),
  endpoint:kind==='ai'?'production-ai / paid-tasks':'production-core / transactions',business:kind==='ai'?'独立AI付费业务':'核心数字业务',group:kind==='ai'?'BIZ-AI':'BIZ-CORE',
  volume:p.hourly*share/5,margin:10,irrecoverable:50,backup,backupDate:backup==='tested'?'2026-12-15':'',rto:120,
  backupLegal:backup==='tested'?'yes':'unconfirmed',backupCapacity:backup==='tested'?'yes':'unconfirmed',sharedDependency:backup==='tested'?'no':'unknown',migrationHours:72,
  limit:p.event_limit,dependency:kind==='ai'?'独立付费任务；收入与核心业务不重叠。':'计算、数据库与存储共同支撑核心业务。',
  upstream:p.provider,accessJurisdiction:p.jurisdiction_index===0?'美国':'中国',usageCountry:'中国',contractEntity:'示例投保企业',knownRestriction:'no',restrictionNotes:''
 }));
 const a={id:'CB-A-'+p.id,pricingProfile:p.id,company:p.id==='CBU-001'?'远帆跨境科技有限公司':p.id==='CBU-002'?'海桥数字科技有限公司':'示例企业 '+p.id,
 industry:p.ai_share===1?'AI应用服务':'跨境SaaS',contact:'陈晓 · 财务负责人',email:'demo@example.com',registration:'DEMO-'+p.id,
 currency:'USD',termsVersion:'CB-UNIFIED-2.0',coverageVersion:root.CBExternal.version,periodStart:'2027-01-01',periodEnd:'2028-01-01',firstInception:'2026-01-01',continuousRenewal:true,
 calendar:p.calendar,waiting:30,maxHours:20,occLimit:p.event_limit,annual1:p.m1_annual,annual2:p.m2_annual,annualTotal:p.annual_total,m2:true,services,
 stage:'submitted',consent:true,quote:null,policy:null,paid:{m1:0,m2:0,total:0},history:[{at:'2026-11-18',text:'统一研究组合 · '+p.id}]};
 a.claim=claim(a);return a;
}
function claim(a){
 const c=oldClaim(a),s=(a.sampleKind==='m1'?a.services.find(x=>x.kind!=='AI API'):a.services.find(x=>x.kind==='AI API'))||a.services[0];
 Object.assign(c,{serviceId:s.id,module:'m1',reportedCause:'ordinary',segments:[{start:'2027-02-01T10:00',end:'2027-02-01T13:30'}],impactStart:'2027-02-01T10:00',impactEnd:'2027-02-01T13:30',switched:false,switchTime:'2027-02-01T13:30',declaredLoss:560,otherCompensation:0,lostTasks:56,taskMargin:10,additionalBusinesses:[],
 reviewNote:'中断时段、业务影响与损失金额已汇总。',financialBasis:'56项无法追回的付费任务 × USD 10贡献毛利 = USD 560。',description:'列明服务连续中断3.5小时，核对独立业务的实际影响。',measures:'尝试重试和恢复；已核对可以补做的任务。',recovery:'13:30业务恢复；连续观测窗口确认。',noticeAt:'2026-12-20T09:00',effectiveAt:'2027-01-10T10:00',eventReference:'DEMO-2027-01',knownAtInception:false});
 if(a.sampleKind==='m2'){
  const core=a.services.find(s=>s.kind!=='AI API')||a.services[0],ai=a.services.find(s=>s.kind==='AI API');
  Object.assign(c,{serviceId:core.id,module:'m2',reportedCause:'physical',segments:[{start:'2027-01-10T10:00',end:'2027-01-10T11:30'}],impactStart:'2027-01-10T10:00',impactEnd:'2027-01-10T11:30',switched:false,declaredLoss:800,lostTasks:80,taskMargin:10,
   damagedDependency:'上游通信设施与跨境连接链路',causalChain:'冲突损坏通信设施 → 列明云服务连接中断 → 核心业务与独立AI付费业务无法交付',financialBasis:'核心业务不可追回贡献毛利 USD 800；独立AI业务 USD 1,600，分别核验。',description:'地缘政治冲突损坏上游通信设施，列明云服务失去连接并传导至企业业务。核心业务1.5小时恢复，独立AI业务4小时恢复。',measures:'启用备用通信路径并开展业务切换与恢复验证。',recovery:'核心业务11:30恢复，AI业务14:00恢复。',liabilityNote:'冲突损坏上游通信设施，导致列明服务与企业业务中断；同一事件共用限额。',
   additionalBusinesses:ai?[{serviceId:ai.id,start:'2027-01-10T10:00',end:'2027-01-10T14:00',declaredLoss:1600,otherCompensation:0}]:[]});
 }
 return c;
}
D.olaDefaults={model:'demo-model-v1',olaVersion:'OLA-DEMO-1',olaSuccess:99,olaResponse:30,olaWindow:5,olaRecovery:5};
D.makeApp=makeApp;D.base=()=>makeApp(U.book.find(p=>p.ai_share===1).id);D.claim=claim;
D.apps=[makeApp(U.book.find(p=>p.ai_share===1).id),makeApp(),makeApp('CBU-002')];
D.service=structuredClone(D.apps[0].services[0]);D.model={...root.CBPricing.defaults,version:U.modelVersion,activatedAt:'2026-11-18',status:'研究基准',regionOverrides:{}};
root.CBUnified={regionMap,makeApp};
})(window);

;

;
/* Public evidence browser. This module never writes underwriting terms or pricing data. */
(function(root){'use strict';
const D=()=>root.CBM1PublicData,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=n=>Number(n).toLocaleString('en-US');
const labels={direct:'直接影响',upstream:'上游关联',pending:'相关性待核实',unrelated:'未匹配依赖'},reasons={direct:'产品与公开影响区域匹配；仍须核实模型、接口及客户调用证据。',upstream:'事件涉及本视图列明的上游服务；须验证依赖链和业务影响。',region:'产品可能相关，但公告未披露适用区域，或该区域不匹配。',product:'产品、功能或地域信息不足，尚不能确认与列明服务的关联。',unrelated:'未匹配所选服务或列明上游。'};
let indexes;
function index(){return indexes||(indexes={products:new Map(D().products.map(p=>[p.id,p])),regions:new Map(D().regions.map(r=>[r.id,r]))});}
function serviceRegion(s){const codes={ 'Google Cloud':{singapore:'asia-southeast1','us-east':'us-east4',frankfurt:'europe-west3',japan:'asia-northeast1',seoul:'asia-northeast3',hongkong:'asia-east2'},AWS:{singapore:'ap-southeast-1','us-east':'us-east-1',frankfurt:'eu-central-1',japan:'ap-northeast-1',seoul:'ap-northeast-2',hongkong:'ap-east-1'},Azure:{singapore:'southeastasia','us-east':'eastus',frankfurt:'germanywestcentral',japan:'japaneast',seoul:'koreacentral',hongkong:'eastasia'}};const code=s.regionCode||codes[s.provider]?.[s.region];if(!code)return null;return D().regions.find(r=>r.provider===s.provider&&r.code.toLowerCase().replace(/[^a-z0-9]/g,'')===code.toLowerCase().replace(/[^a-z0-9]/g,''))?.id||null;}
function serviceProducts(s){const name=String(s.service||'').toLowerCase(),endpoint=String(s.endpoint||'').toLowerCase();return D().products.filter(p=>{if(p.provider!==s.provider)return false;const n=p.name.toLowerCase();if(s.kind==='AI API'){
 if(s.provider==='Google Cloud')return ['sdXM79fz1FS6ekNpu37K','Z0FZJAMvEB4j3NbCJs6B'].some(id=>p.id.endsWith('|'+id))||/vertex ai.*(prediction|gemini)|agent platform online inference/.test(n);
 if(s.provider==='AWS')return /bedrock/.test(n)&&/bedrock/.test(name);
 if(s.provider==='Azure')return /azure (openai|ai services|ai foundry)/.test(n);
 if(s.provider==='Anthropic')return n==='claude api';
 if(s.provider==='OpenAI')return /chat.completions/.test(endpoint)?n==='chat completions':/responses/.test(endpoint)?n==='responses':/chat completions|responses|embeddings|realtime|audio|images|batch/.test(n);
 }
 const tokens=name.split(/\s*\/\s*|\s*\+\s*/).filter(x=>x.length>=3);return tokens.some(t=>n===t||n.replace(/^(amazon |aws |azure )/,'')===t);}).map(p=>p.id);}
function relation(e,s,upstream=''){if(!s)return {type:'pending',reason:reasons.product};const hit=e.products.some(p=>serviceProducts(s).includes(p)),region=serviceRegion(s),area=e.global||(region&&e.regions.includes(region));if(e.provider===s.provider&&hit&&area&&e.mapping!=='title_only')return {type:'direct',reason:reasons.direct};if(upstream&&e.products.includes(upstream))return {type:'upstream',reason:reasons.upstream};if(e.provider===s.provider)return {type:'pending',reason:hit?reasons.region:reasons.product};return {type:'unrelated',reason:reasons.unrelated};}
const upstreamKey=(a,s)=>a.id+':'+s?.id;
function selection(a,ui){const terms=a.policy?.terms||a;return terms.services.find(s=>s.id===ui.m1Service)||terms.services[0];}
function filter(a,ui,{ignoreRegion=false}={}){const s=selection(a,ui),up=ui.m1Upstreams?.[upstreamKey(a,s)]||'',directProducts=new Set(s?serviceProducts(s):[]),region=s?serviceRegion(s):null;
 return D().events.filter(e=>(!ui.m1Provider||ui.m1Provider==='all'||e.provider===ui.m1Provider)&&(!ui.m1Product||ui.m1Product==='all'||e.products.includes(ui.m1Product))&&(!ui.m1Year||ui.m1Year==='all'||e.date.startsWith(ui.m1Year))&&(ignoreRegion||!ui.m1Region||ui.m1Region==='all'||(ui.m1Region==='global'?e.global:ui.m1Region==='unknown'?!e.global&&!e.regions.length:e.regions.includes(ui.m1Region))))
 .map(e=>{const hit=e.products.some(p=>directProducts.has(p)),area=e.global||region&&e.regions.includes(region);const r=e.provider===s?.provider&&hit&&area&&e.mapping!=='title_only'?{type:'direct',reason:reasons.direct}:up&&e.products.includes(up)?{type:'upstream',reason:reasons.upstream}:e.provider===s?.provider?{type:'pending',reason:hit?reasons.region:reasons.product}:{type:'unrelated',reason:reasons.unrelated};return {e,...r};})
 .filter(r=>!ui.m1Relation||ui.m1Relation==='all'||r.type===ui.m1Relation);
}
const select=(label,key,value,options)=>`<label class="field"><span>${label}</span><select data-m1-filter="${key}" aria-label="${label}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const pnames=e=>e.products.map(id=>index().products.get(id)?.name||id);
function scope(e){return e.global?'全球 / 跨区域':e.regions.length?e.regions.map(id=>index().regions.get(id)?.name||id).join(' / '):'地域未披露';}
// Group nearby catalogue locations in projected screen space, independently of event frequency.
function groupRegions(regions,width=960,selectedId){
 const groups=[],distance=42*width/960;
 for(const r of [...regions].sort((a,b)=>a.id.localeCompare(b.id))){
  const point=root.CBM2Map.project(...r.point),group=r.id===selectedId?null:groups.find(g=>!g.selected&&Math.hypot(point[0]-g.anchor[0],point[1]-g.anchor[1])<distance);
  if(group)group.regions.push(r);else groups.push({anchor:point,regions:[r],selected:r.id===selectedId});
 }
 return groups.map(g=>({...g,point:g.regions.reduce((p,r)=>{const xy=root.CBM2Map.project(...r.point);return [p[0]+xy[0]/g.regions.length,p[1]+xy[1]/g.regions.length];},[0,0])}));
}
function render(a,ui){const data=D(),terms=a.policy?.terms||a,s=selection(a,ui),rows=filter(a,ui),mapRows=filter(a,ui,{ignoreRegion:true}),page=Math.min(Math.max(ui.m1Page||0,0),Math.max(0,Math.ceil(rows.length/4)-1)),pages=Math.max(1,Math.ceil(rows.length/4));
 const products=data.products.filter(p=>(!ui.m1Provider||ui.m1Provider==='all'||p.provider===ui.m1Provider)&&data.events.some(e=>e.products.includes(p.id))).sort((a,b)=>a.name.localeCompare(b.name));
 const seenRegions=new Set(mapRows.flatMap(r=>r.e.regions));if(index().regions.has(ui.m1Region))seenRegions.add(ui.m1Region);const regions=data.regions.filter(r=>seenRegions.has(r.id)).sort((a,b)=>a.name.localeCompare(b.name)),selected=index().regions.get(ui.m1Region),viewport=ui.m1Map||{},center=viewport.evidenceViewportCenter||[480,250],width=viewport.evidenceViewportWidth||960,k=width/960;
 const counts={direct:0,upstream:0,pending:0,unrelated:0};rows.forEach(r=>counts[r.type]++);
 const tally=new Map();mapRows.forEach(({e,type})=>e.regions.forEach(id=>{const r=tally.get(id)||{ids:new Set(),related:0};if(!r.ids.has(e.id)){r.ids.add(e.id);if(type==='direct'||type==='upstream')r.related++;}tally.set(id,r);}));
 const groups=groupRegions(regions,width,ui.m1Region);
 const pins=groups.map(g=>{const rs=g.regions,cluster=rs.length>1,[x,y]=g.point,on=g.selected,related=rs.some(r=>tally.get(r.id)?.related),eventIds=new Set(rs.flatMap(r=>[...(tally.get(r.id)?.ids||[])])),radius=(cluster?Math.min(17,10+Math.log2(rs.length)*1.2):5)*k;
 const title=rs.map(r=>r.provider+' · '+r.name).join(' / '),attrs=cluster?`data-m1-cluster="${esc(rs.map(r=>r.id).join('~'))}" data-cluster-center="${x},${y}"`:`data-m1-location="${esc(rs[0].id)}"`;
 return `<g class="m1-region-marker ${cluster?'m1-cluster':''}" role="button" tabindex="0" aria-label="${esc(title)}" aria-pressed="${on}" data-location-count="${rs.length}" data-event-count="${eventIds.size}" ${attrs}><title>${esc(title)}</title><circle cx="${x}" cy="${y}" r="${Math.max(radius+3*k,12*k)}" fill="transparent"/><circle class="m1-marker-halo" cx="${x}" cy="${y}" r="${radius}" fill="${related?'#dcebf5':'#edf1f4'}" stroke="${on||related?'#4a86b1':'#a4b5c1'}" stroke-width="${(on?2:1)*k}"/>${cluster?`<text x="${x}" y="${y+3.5*k}" text-anchor="middle" font-size="${11*k}" font-weight="600" fill="${related?'#376b91':'#617789'}" pointer-events="none">${rs.length}</text>`:`<circle cx="${x}" cy="${y}" r="${2*k}" fill="${related?'#397aad':'#8c9dab'}"/>`}${on?`<text x="${x+14*k}" y="${y-12*k}" font-size="${13*k}" fill="#344f64" paint-order="stroke" stroke="#f8fafc" stroke-width="${3*k}" data-no-translate>${esc(rs[0].code)}</text>`:''}</g>`;}).join('');
 const members=regions.filter(r=>(ui.m1Cluster||[]).includes(r.id));
 const groupPanel=members.length?`<div class="m1-cluster-detail"><div class="nearby-list-heading"><strong>邻近合并目录</strong><b>${members.length}</b><button data-m1-cluster-close aria-label="关闭">×</button></div><div class="nearby-facility-list">${members.map(r=>`<button data-m1-location="${esc(r.id)}"><strong data-no-translate>${esc(r.provider+' · '+r.code)}</strong><span data-no-translate>${esc(r.name)}</span></button>`).join('')}</div></div>`:'';

 return `<div class="m2-explorer evidence-explorer risk-explorer m1-explorer"><div class="map-toolbar"><div class="segmented"><button class="active" data-map="m1">M1 普通中断</button><button data-map="m2">M2 外部事件中断</button></div><span class="m2-model-label">${data.version}</span></div>
 <div class="m1-catalog-filters m2-controls">${select('厂商','provider',ui.m1Provider||'all',[['all','全部厂商'],...data.sources.map(s=>[s.provider,s.provider])])}${select('产品','product',ui.m1Product||'all',[['all','全部产品'],...products.map(p=>[p.id,p.provider+' · '+p.name])])}${select('年份','year',ui.m1Year||'all',[['all','全部年份'],...['2026','2025','2024','2023'].map(y=>[y,y==='2026'?'2026（截至采集日）':y])])}${select('区域','region',ui.m1Region||'all',[['all','全部区域'],['global','全球 / 跨区域'],['unknown','地域未披露'],...regions.map(r=>[r.id,r.provider+' · '+r.name])])}</div>
 <div class="m1-link-controls">${select('关联承保服务','service',s?.id,terms.services.map(s=>[s.id,s.provider+' · '+s.service+' / '+s.business]))}${select('关联类型','relation',ui.m1Relation||'all',[['all','全部关联类型'],...Object.entries(labels)])}<button class="text-btn" data-m1-reset>清空筛选</button></div>
 <details class="m1-upstream"><summary>列明上游依赖</summary>${select('上游服务（关联分析）','upstream',ui.m1Upstreams?.[upstreamKey(a,s)]||'',[['','未列明'],...data.products.filter(p=>data.events.some(e=>e.products.includes(p.id))).sort((a,b)=>a.provider.localeCompare(b.provider)||a.name.localeCompare(b.name)).map(p=>[p.id,p.provider+' · '+p.name])])}<p>仅用于本视图的关联分析；不修改保单，也不据此确认实际影响。</p></details>
 <div class="evidence-summary"><div><span>公开目录事件</span><strong>${num(data.events.length)}</strong></div><div><span>符合筛选条件</span><strong>${num(rows.length)}</strong></div><div><span>地域未披露</span><strong>${num(rows.filter(r=>!r.e.global&&!r.e.regions.length).length)}</strong></div></div>
 <div class="m2-map-layout"><div class="evidence-map-column"><div class="evidence-map-actions"><span>公开故障分布 <small class="map-drag-hint">· 拖动 / 双指缩放</small></span><div><button data-m1-zoom="-1" aria-label="缩小地图">−</button><button data-m1-zoom="1" aria-label="放大地图">＋</button><button data-m1-center="catalog" ${selected?'':'disabled'}>定位所选</button><button data-m1-center="reset">重置</button></div></div><svg class="evidence-world m1-world" viewBox="${center[0]-width/2} ${center[1]-width/4} ${width} ${width/2}" role="group" aria-label="云区域与历史事件"><defs><clipPath id="m1-world-clip"><path d="${root.CBWorldMap.sphere}"/></clipPath></defs><g clip-path="url(#m1-world-clip)">${root.CBM2Map.baseMap()}${pins}</g></svg><div class="evidence-legend"><span><i class="m1-legend-selected"></i>存在匹配关联</span><span><i class="m1-legend-point"></i>公开事件区域</span><span>数字表示合并位置数；放大展开，点击查看</span></div></div>
 <aside class="m2-detail evidence-detail">${groupPanel}<span class="evidence-badge">${selected?'所选区域':'全球总览'}</span><h3>${selected?esc(selected.name):'服务关联概览'}</h3><p class="evidence-code" data-no-translate>${selected?esc(selected.provider+' · '+selected.code):esc(s?.service||'')}</p><div class="evidence-type-list">${Object.entries(labels).map(([key,label])=>`<div><span><i class="m1-relation-dot ${key}"></i>${label}</span><b>${num(counts[key])}</b></div>`).join('')}</div><button class="text-btn mt" data-action="go-pricing">查看定价样本 →</button></aside></div>
 <div class="m1-event-directory"><div class="event-directory-toolbar"><strong>具体事件目录</strong><span>${num(rows.length)} <span>条记录</span></span></div><div class="table-wrap"><table class="m1-public-table"><thead><tr><th>日期 / 厂商</th><th>公开事件与核验依据</th><th>关联类型</th><th>公开时长</th></tr></thead><tbody>${rows.slice(page*4,page*4+4).map(({e,type,reason})=>`<tr><td>${e.date}<small data-no-translate>${esc(e.provider)}</small></td><td><details><summary data-no-translate>${esc(e.title)}</summary><dl class="m1-event-facts"><div><dt>产品</dt><dd data-no-translate>${esc(pnames(e).join(' / ')||'—')}</dd></div><div><dt>区域</dt><dd>${esc(scope(e))}</dd></div><div><dt>关联依据</dt><dd>${reason}</dd></div><div><dt>映射方式</dt><dd>${e.mapping==='provider_fields'?'来源结构化字段':e.mapping==='title_only'?'标题识别，待核实':'影响说明文本识别，待核实'}</dd></div><div><dt>定价样本状态</dt><dd>${e.pricingReview==='included'?'已纳入冻结参考样本':e.pricingReview==='excluded'?'已核对，未纳入参考样本':'未进入定价样本'}</dd></div></dl><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">查看官方原文 ↗</a></details></td><td><span class="m1-relation ${type}">${labels[type]}</span></td><td>${e.durationHours===null?'—':num(e.durationHours)+' h'}<small>${e.durationBasis==='product_notice'?'产品公告时长':e.durationBasis==='public_timeline'?'公开时间线跨度':'未结构化披露'}</small></td></tr>`).join('')||'<tr><td colspan="4">没有符合条件的事件，请调整筛选。</td></tr>'}</tbody></table></div><div class="event-pagination"><span>${page+1} / ${pages}</span><div class="event-page-controls"><button data-m1-page="${page-1}" ${page===0?'disabled':''}>上一页</button><button data-m1-page="${page+1}" ${page+1>=pages?'disabled':''}>下一页</button><form data-m1-jump><label>跳至<input type="number" name="page" min="1" max="${pages}" value="${page+1}" aria-label="事件页码"></label><button type="submit">跳转</button></form></div></div></div>
 <details class="evidence-provenance"><summary>数据覆盖、来源与定价样本</summary><p>2023–2025为完整年度查询；2026截至采集日。各来源披露范围不同，数量不能直接用于厂商风险排名。</p><div class="table-wrap"><table><thead><tr><th>厂商</th><th>来源范围</th><th>记录数</th><th>已收录事件日期</th></tr></thead><tbody>${data.sources.map(src=>`<tr><td><a href="${esc(src.url)}" target="_blank" rel="noopener">${src.provider} ↗</a></td><td>${{product_histories:'全产品历史页',quarterly_history:'逐季度公开历史',rolling_public_history:'官方滚动历史，不覆盖全部历史年份',public_PIR_history:'公开事后调查目录',public_cursor_history:'公开故障历史，排除计划维护'}[src.scope]}</td><td>${num(src.count)}</td><td>${src.firstEvent||'—'} — ${src.lastEvent||'—'}</td></tr>`).join('')}</tbody></table></div><p>公开目录覆盖本次接入来源的可取得记录；不包含未公开的客户专属故障。记录日期范围不等于该期间披露完整性。</p><p>定价仍独立使用已核对的34个参考事件及版本化情景；新增公告不自动进入费率。OLA阈值尚未获得客户级历史数据校准。</p><a href="m1-public-catalog.json" download>下载公开目录与覆盖清单 ↗</a></details></div>`;
}
function pricing(a,q){const t=a.policy?.terms||a,summary=root.CBRiskManifest?.m1.summary,d=D()||{pricingSample:summary.pricingSample,events:{length:summary.count}};return `<details class="m1-pricing-basis"><summary>M1 · 定价样本与客户条件</summary><div class="unified-terms"><div><span>冻结参考事件 / 观察期</span><strong>34 · 2023–2025</strong></div><div><span>样本版本</span><strong>${d.pricingSample.version}</strong></div><div><span>当前条件匹配</span><strong>${q.available?'符合参考情景':'待重新测算'}</strong></div><div><span>公开目录事件</span><strong>${num(d.events.length)}</strong></div></div><div class="table-wrap"><table><thead><tr><th>业务与依赖</th><th>OLA</th><th>营业与备用</th></tr></thead><tbody>${t.services.map(s=>`<tr><td data-user-text>${esc(s.business)}<small>${esc(s.provider+' · '+s.service+' · '+s.region)}</small></td><td>${s.olaVersion?esc(s.olaSuccess)+'% · '+esc(s.olaResponse)+' s · '+esc(s.olaWindow)+' / '+esc(s.olaRecovery)+' min':'原保单约定'}</td><td>${t.calendar==='24x7'?'24 × 7':'工作日 09:00–17:00'}<small>${s.backup==='tested'?'备用已演练':s.backup==='none'?'暂无可用替代':'备用未验证'}</small></td></tr>`).join('')}</tbody></table></div><p>事件样本 → 产品与地区适用性 → 客户依赖与OLA → 中断及恢复 → 净损失与保单限额 → 组合再保与资本。</p><p>当前使用冻结情景计算；客户命中、恢复和净损失含研究假设，OLA尚未经验校准。修改条件须重新测算，扩充公开目录不会自动改变保费。</p></details>`;}
root.CBM1Catalog={groupRegions,upstreamKey,render,filter,relation,serviceProducts,serviceRegion,selection,pricing,index};
})(window);

;
(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function currencyHTML(html,code){
 if(code!=='USD')return html;
 const template=document.createElement('template');template.innerHTML=html;
 const w=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT);
 while(w.nextNode()){const node=w.currentNode;if(node.parentElement?.closest('[data-user-text],textarea,script,style,[data-no-translate]'))continue;
  node.nodeValue=node.nodeValue.replace(/¥\s*/g,'USD ').replace(/人民币/g,'USD').replace(/元(?=[，、）/\s]|$)/g,'USD');}
 return template.innerHTML;
}
function m1(a,ui){if(root.CBM1Catalog)return root.CBM1Catalog.render(a,ui);
 const U=root.CBUnifiedData,places=[['singapore','新加坡','asia-southeast1'],['us-east','美国东部','us-east4'],['frankfurt','法兰克福','europe-west3'],['japan','东京','asia-northeast1'],['seoul','首尔','asia-northeast3'],['hongkong','香港','asia-east2']],terms=a.policy?.terms||a,selected=places.find(v=>v[0]===(ui.region||terms.services[0]?.region))||places[0],geo=root.CBWorldMap;
 const all=U.events.filter(e=>e.included_unified),rows=all.filter(e=>(e.location_codes.length?e.location_codes:e.body_region_codes).includes(selected[2])),page=Math.min(Math.max(ui.m1Page||0,0),Math.max(0,Math.ceil(rows.length/5)-1));
 const viewport=ui.m1Map||{},center=viewport.evidenceViewportCenter||[480,250],width=viewport.evidenceViewportWidth||960,k=width/960,offsets={singapore:[15,22],hongkong:[-18,18],seoul:[-25,-23],japan:[25,3]};
 const viewBox=`${center[0]-width/2} ${center[1]-width/4} ${width} ${width/2}`;
 const markers=places.map(([id,name])=>{const [x,y]=geo.points[id],on=id===selected[0],[dx,dy]=offsets[id]||[0,24];return `<g class="m1-region-marker" data-region="${id}" tabindex="0" role="button" aria-label="${name}" aria-pressed="${on}"><title>${name}</title><circle cx="${x}" cy="${y}" r="${16*k}" fill="transparent"/><circle class="m1-marker-halo" cx="${x}" cy="${y}" r="${(on?14:8)*k}" fill="#dcebf5" stroke="${on?'#4a86b1':'#83a9c4'}" stroke-width="${k}"/><circle cx="${x}" cy="${y}" r="${(on?4:2.5)*k}" fill="#4a86b1"/><path d="M${x},${y} L${x+dx*k},${y+(dy-5)*k}" stroke="#83a9c4" stroke-width="${.6*k}" fill="none" pointer-events="none"/><text x="${x+dx*k}" y="${y+dy*k}" text-anchor="${dx>0?'start':dx<0?'end':'middle'}" font-size="${13*k}" fill="#344f64" stroke="#f7f9fb" stroke-width="${3*k}" paint-order="stroke" pointer-events="none">${name}</text></g>`;}).join('');
 return `<div class="m2-explorer evidence-explorer risk-explorer m1-explorer"><div class="map-toolbar"><div class="segmented" aria-label="风险模块"><button class="active" data-map="m1">M1 普通中断</button><button data-map="m2">M2 外部事件中断</button></div><span class="m2-model-label">2023–2025 · 官方事件目录</span></div>
 <div class="m2-controls evidence-controls m1-controls"><label class="field"><span>云服务区域</span><select data-m1-region aria-label="云服务区域">${places.map(([id,name])=>`<option value="${id}" ${id===selected[0]?'selected':''}>${name}</option>`).join('')}</select></label><div class="m1-source"><span>证据来源</span><strong>Google Cloud Service Health</strong></div></div>
 <div class="evidence-summary"><div><span>区域相关候选事件</span><strong>${rows.length}</strong></div><div><span>全目录纳入事件</span><strong>${all.length}</strong></div><div><span>全目录剔除事件</span><strong>${U.events.length-all.length}</strong></div></div>
 <div class="m2-map-layout"><div class="evidence-map-column"><div class="evidence-map-actions"><span><span>云区域与历史事件</span> <small class="map-drag-hint">· 拖动 / 双指缩放</small></span><div><button data-m1-zoom="-1" aria-label="缩小地图">−</button><button data-m1-zoom="1" aria-label="放大地图">＋</button><button data-m1-center="${selected[0]}">定位所选</button><button data-m1-center="reset">重置</button></div></div>
 <svg class="evidence-world m1-world" viewBox="${viewBox}" role="group" aria-label="云区域与历史事件"><defs><clipPath id="m1-world-clip"><path d="${geo.sphere}"/></clipPath></defs><g clip-path="url(#m1-world-clip)">${root.CBM2Map.baseMap()}${markers}</g></svg>
 <div class="evidence-legend"><span><i class="m1-legend-point"></i>云区域</span><span><i class="m1-legend-selected"></i>所选区域</span><span>历史事件数 ≠ 中断概率</span></div></div>
 <aside class="m2-detail evidence-detail"><span class="evidence-badge">所选区域</span><h3>${selected[1]}</h3><p class="evidence-code" data-no-translate>${selected[2]}</p><div class="evidence-number">${rows.length}<small>区域相关候选事件</small></div><dl><div><dt>观察窗口</dt><dd>2023–2025</dd></div><div><dt>证据来源</dt><dd>Google Cloud Service Health</dd></div></dl><p class="evidence-note">Google Cloud官方事件模板；其他厂商暂用代理。事件数量不等于客户出险率，须匹配产品、区域与功能。</p></aside></div>
 <div class="m1-event-directory"><div class="event-directory-toolbar"><strong>具体事件目录</strong><span class="evidence-code">${selected[1]} · ${selected[2]}</span></div><div class="table-wrap"><table class="unified-event-table"><thead><tr><th>日期</th><th>官方事件</th><th>公开时长</th><th></th></tr></thead><tbody>${rows.slice(page*5,page*5+5).map(e=>`<tr><td>${e.date}</td><td><span data-no-translate>${esc(e.title)}</span></td><td>${e.published_envelope_hours.toFixed(2)} h</td><td><a target="_blank" rel="noopener" href="${esc(e.url)}">原文 ↗</a></td></tr>`).join('')||'<tr><td colspan="4">此区域暂无纳入事件</td></tr>'}</tbody></table></div><div class="unified-pager"><button class="btn small" data-m1-page="${page-1}" ${page===0?'disabled':''}>上一页</button><span>${page+1} / ${Math.max(1,Math.ceil(rows.length/5))}</span><button class="btn small" data-m1-page="${page+1}" ${(page+1)*5>=rows.length?'disabled':''}>下一页</button></div></div></div>`;
}
function recovery(a,model,ui){const t=a.policy?.terms||a,s=t.services.find(s=>s.id===ui.m2Service)||t.services[0],b=root.CBExternal.verified(s)?2:s.backup!=='none'?1:0,p=root.CBUnifiedData.assumptions;
return `<div class="evidence-recovery"><div class="m2-controls"><label class="field"><span>列明服务</span><select data-evidence="m2Service">${t.services.map(x=>`<option value="${x.id}" ${s.id===x.id?'selected':''}>${esc(x.provider+' · '+x.service)}</option>`).join('')}</select></label><span class="evidence-badge">${root.CBPricing.version}</span></div><h3>中断与恢复情景</h3>${root.CBExternal.timeline({})}<div class="unified-recovery-grid"><section><h3>受损依赖</h3><p>数据中心 · 供电 · 通信链路</p><small>冲突损害沿企业列明的数字依赖传导</small></section><section><h3>依赖修复与服务恢复</h3><p>24 / 72 / 168 h</p><small>50% / 35% / 15%</small></section></div><div class="unified-terms"><div><span>M2备用接管成功概率</span><strong> ${(p.backup_physical_success[b]*100).toFixed(0)}%</strong></div><div><span>成功接管恢复时间</span><strong> ${p.backup_rto_hours} h</strong></div></div><p>按依赖受损、备用接管与实际恢复时间计算中断；原服务或备用达标后停止计时。</p><button class="text-btn" data-action="go-model">查看模型参数与版本 →</button></div>`;}
function businesses(t,c,disabled){if(t.termsVersion!=='CB-UNIFIED-2.0')return '';const others=c.additionalBusinesses||[];
 return `<section class="unified-business"><h3>同一事件的其他业务</h3>${others.map((b,i)=>`<div class="form-grid unified-business"><label class="field"><span>受影响业务</span><select data-business="${i}.serviceId" ${disabled}>${t.services.filter(s=>s.id!==c.serviceId).map(s=>`<option value="${s.id}" ${s.id===b.serviceId?'selected':''}>${esc(s.business)}</option>`).join('')}</select></label>${[['start','业务中断','datetime-local'],['end','业务恢复','datetime-local'],['declaredLoss','不可追回贡献毛利','number'],['otherCompensation','同损失补偿','number']].map(([k,label,type])=>`<label class="field"><span>${label}${type==='number'?' (USD)':''}</span><input type="${type}" data-business="${i}.${k}" value="${esc(b[k])}" ${type==='number'?'min="0" step="0.01"':''} ${disabled}></label>`).join('')}<button class="text-btn" data-remove-business="${i}" ${disabled}>移除</button></div>`).join('')}${!disabled&&others.length<t.services.length-1?'<button class="btn small" data-action="add-business">添加受影响业务</button>':''}</section>`;
}
root.CBUnifiedUI={currencyHTML,m1,recovery,businesses};
})(window);

;
(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),money=x=>Number.isFinite(x)?`USD ${n(x)}`:'—';
const line=(k,v)=>`<div class="pricing-line"><span>${k}</span><strong>${v}</strong></div>`;
const names={baseline:'冲突中断基准',m2Low:'M2低情景',m2High:'M2高情景',m2Retained:'M2未获再保',m1Low:'M1频率减半',m1High:'M1频率加倍',concentrated:'组合高度集中',noBackup:'全组合无备用',testedBackup:'全组合已测试备用'};
const report=`<a href="reports/CloudBridge-conflict-pricing.html" target="_blank" rel="noopener">定价方法与口径 ↗</a>`;
function render(a,q,model){
 const t=a.policy?.terms||a;
 if(q.pricingVersion!==root.CBPricing.version)return `<div class="pricing-legacy"><h2>历史保单快照</h2><p>${esc(q.modelVersion)} · CNY ${n(q.total)}</p><p>原币种、责任与报价保持不变。</p><button class="btn primary" data-action="load-unified">载入统一报告样例</button></div>`;
 if(!q.available)return `<div class="unified-pending"><h2>待重新测算</h2><p>投保条件已超出本版测算范围，请重新测算后报价。</p><div class="tag-row"><button class="btn primary" data-action="load-unified">载入统一报告样例</button><button class="btn" data-action="export-underwriting">导出核保摘要</button></div></div>`;
 const c=q.costs,p=q.portfolio,contract=q.contract;
 const components=[['EL','预计赔款',c.el,'#6298bf'],['RC','再保险净成本',c.rc,'#8eabb9'],['cK','资本成本',c.capitalCost,'#989d9f'],['F + eG','运营费用',c.fixed+c.variable,'#c0b9aa']];
 const section=(id,title,value,inner)=>`<section class="pricing-component"><div class="pricing-component-head"><span class="pricing-code">${id}</span><h3>${title}</h3><strong>${money(value)}</strong></div>${inner}</section>`;
 return `<div class="pricing-workspace unified-pricing"><div class="pricing-headline"><div><span class="evidence-badge">${names[q.scenario]} · ${esc(q.profile)}</span><h2>年度保费</h2><div class="pricing-total">${money(q.total)}</div><p>${esc(q.modelVersion)} · ${a.policy?'保单快照':'保费报价'}</p></div><div class="pricing-equation"><span>G = (EL + RC + cK + F) / (1 − e)</span><small>100张组合保单 · 200,000个测算年度</small>${report}</div></div>
 <div class="unified-terms">${line('每小时约定金额',money(q.hourly))}${line('等待期 / 最长赔付',`${t.waiting} min / ${t.maxHours} h`)}${line('共同事故限额',money(t.occLimit))}${line('M1 / M2年度限额',`${money(t.annual1)} / ${money(t.annual2)}`)}${line('年度总限额',money(t.annualTotal))}${line('赔款封顶','参数金额、贡献毛利净损失及限额')}</div>
 <div class="pricing-composition" aria-label="年度保费构成">${components.map(([,label,v,color])=>`<div style="flex:${Math.max(0,v)};background:${color}" title="${label} · ${money(v)}"></div>`).join('')}</div>
 <div class="pricing-component-legend">${components.map(([,label,v,color])=>`<div><span><i style="background:${color}"></i>${label}</span><b>${money(v)}</b></div>`).join('')}</div>
 ${section('EL','预计赔款',c.el,`<div class="pricing-two-col"><div>${line('M1 普通中断',money(q.pure1))}${line('M2 外部事件中断',money(q.pure2))}</div><div>${line('营业日历',t.calendar==='24x7'?'24 × 7':'工作日 09:00–17:00')}${line('净损失封顶','已纳入测算')}</div></div><details><summary>赔款计算与业务依赖</summary><p>核心业务与独立AI业务分别核定；同一业务的多项依赖不重复相加。先逐业务取参数金额与净损失的较低值，再共用事故和年度限额。</p><div class="table-wrap"><table><thead><tr><th>业务组</th><th>服务依赖</th><th class="num">每小时金额</th></tr></thead><tbody>${t.services.map(s=>`<tr><td data-user-text>${esc(s.business)}</td><td data-user-text>${esc(s.provider+' · '+s.service)}</td><td class="num">${money(root.CBEngine.hourly(s))}</td></tr>`).join('')}</tbody></table></div></details>`)}
 ${section('RC','再保险净成本',c.rc,`<div class="pricing-two-col"><div>${line('预期摊回',money(c.recovery))}${line('分摊再保险费',money(c.rePremium))}</div><div>${line('逐事件自留额',money(contract.attachment))}${line('层限额 / 年度容量',`${money(contract.limit)} / ${money(contract.annual_limit)}`)}</div></div><details><summary>再保险分摊依据</summary><p>同一事件的多客户赔款合并后应用超赔层；按各客户事件赔款分配回收。再保险费按预计回收份额分摊，无自动复效。</p>${line('再保责任范围',contract.scope==='all'?'M1 + 完整M2（目标条件）':'仅M1；M2全部自留')}${line('再保险费附加',n(c.reinsuranceLoad)+'%')}${line('组合再保险费',money(p.rePremium))}<p>再保价格为预算情景，尚未取得市场合同。</p></details>`)}
 ${section('cK','资本成本',c.capitalCost,`<div class="pricing-two-col"><div>${line('尾部年度客户平均净赔款',money(c.tailMean))}${line('客户年均净赔款',money(c.netEL))}</div><div>${line('分配资本 K',money(c.capital))}${line('资本成本率 c',n(c.capitalRate)+'%')}</div></div><details><summary>组合与尾部年度</summary><div class="pricing-formula">K = E[客户净赔款 | 组合最差 1% 年份] − E[客户净赔款]</div>${line('组合净TVaR 99%',money(p.tailNet))}${line('组合年均净赔款',money(p.meanNet))}${line('尾部年度数量','2,000')}<p>100张保单共享冲突事件、设施及上游依赖；各客户资本贡献加总等于组合净资本。</p><button class="text-btn" data-action="go-model">查看模型参数与版本 →</button></details>`)}
 ${section('F + eG','运营费用',c.fixed+c.variable,`<div class="pricing-two-col"><div>${line('固定及按案费用 F',money(c.fixed))}${line('变动费用 eG',money(c.variable))}</div><div>${line('变动费用率 e',n(c.expense)+'%')}<p>监测、核保和按案处理逐项预算；变动费用不重复计入这些项目。</p></div></div>`)}
 <div class="pricing-footer"><button class="text-btn" data-uwtab="risk">← 返回风险总览</button><button class="btn primary" data-action="${a.policy?'policy-tab':'issue-policy'}">${a.policy?'查看保单':'生成保单'}</button></div></div>`;
}
function model(state,ui,a){
 const U=root.CBUnifiedData,m=state.draftModel,q=root.CBPricing.quote({...a,policy:null},m),s=U.scenarios[m.scenario||'baseline'],tab=ui.modelTab;
 const tabs=[['parameters','模型参数'],['regions','承保组合'],['sensitivity','敏感性试算'],['versions','版本记录']];
 let content='';
 if(tab==='parameters')content=`<section class="card"><div class="card-body padded"><div class="form-grid"><label class="field"><span>测算情景</span><select data-m="scenario">${Object.entries(names).filter(([k])=>!['concentrated','noBackup','testedBackup'].includes(k)).map(([k,v])=>`<option value="${k}" ${m.scenario===k?'selected':''}>${v}</option>`).join('')}</select></label>${[['capitalRate','资本成本率',0,100],['reinsuranceLoad','再保险费附加',0,200],['expense','变动费用率',0,90]].map(([k,label,min,max])=>`<label class="field"><span>${label} (%)</span><input type="number" data-m="${k}" value="${m[k]}" min="${min}" max="${max}" step="1"></label>`).join('')}</div><div class="unified-terms">${line('逐事件自留额',money(50000))}${line('层限额 / 年度容量',money(1000000))}${line('模拟年度','200,000')}${line('版本',U.modelVersion)}</div><p>情景切换读取完整组合的预计算结果；成本率调整按同一赔款分布重新分解保费。</p><details><summary>危险性、暴露与恢复假设</summary>${line('M1广泛 / 特定功能条件命中','65% / 10%')}${line('M2冲突损害情景频率',(s.parameters.m2_physical_rate_per_region*s.parameters.m2_frequency_scale).toFixed(2)+' / year')}${line('M2条件命中',String(s.parameters.m2_conditional_hit*100)+'%')}${line('物理中断时长','24 / 72 / 168 h')}${line('传导路径','冲突损害 → 数字依赖 → 企业服务中断')}<p>上述概率和恢复参数为研究情景。公共事件目录提供机制和范围证据，不直接给出客户出险率。</p></details></div></section>`;
 if(tab==='regions'){
  const page=Math.max(0,Math.min(9,ui.bookPage||0)),rows=U.book.slice(page*10,page*10+10);
  content=`<section class="card"><div class="card-body padded"><div class="unified-terms">${line('示例保单','100')}${line('组合小时金额',money(100000))}${line('最大厂商 / 地区占比','40% / 30%')}${line('组合平均年保费',money(s.portfolio.average_premium))}</div><p>已有保单价格锁定；新增业务须重新检查组合容量，不能直接当作第101张保单沿用价格。</p><div class="table-wrap"><table><thead><tr><th>保单</th><th>服务商 / 区域</th><th>业务 / 备用</th><th class="num">每小时金额</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td>${p.id}</td><td>${esc(p.provider)}<small>${esc(p.region)}</small></td><td>${n(p.ai_share*100)}% AI<small>${['无备用','备用未验证','备用已演练'][p.backup]}</small></td><td class="num">${money(p.hourly)}</td><td><button class="text-btn" data-unified-policy="${p.id}">载入</button></td></tr>`).join('')}</tbody></table></div><div class="unified-pager"><button class="btn small" data-book-page="${page-1}" ${page===0?'disabled':''}>上一页</button><span>${page+1} / 10</span><button class="btn small" data-book-page="${page+1}" ${page===9?'disabled':''}>下一页</button></div></div></section>`;
 }
 if(tab==='sensitivity'){
  const id=root.CBPricing.match(a)?.id||'CBU-001',base=U.scenarios.baseline.policies.find(p=>p.id===id).G;
  content=`<section class="card"><div class="card-body padded"><h2>定价敏感性 · ${id}</h2><p>采用基准成本率；情景范围不是统计置信区间。全组合备用与集中度变化包含组合影响。</p><div class="table-wrap"><table><thead><tr><th>情景</th><th class="num">年保费</th><th class="num">相对基准</th><th class="num">组合平均年保费</th></tr></thead><tbody>${Object.entries(U.scenarios).map(([key,v])=>{const r=v.policies.find(x=>x.id===id);return `<tr><td>${names[key]}</td><td class="num">${money(r.G)}</td><td class="num">${((r.G/base-1)*100).toFixed(1)}%</td><td class="num">${money(v.portfolio.average_premium)}</td></tr>`;}).join('')}</tbody></table></div></div></section>`;
 }
 if(tab==='versions')content=`<section class="card"><div class="card-body padded"><h2>版本记录</h2>${line('模型基准',U.modelVersion)}${line('当前生效模型',esc(state.model.version))}<p>投保条件变化后原报价失效；已确认保单保留原币种、条款和报价快照。</p><div class="timeline">${state.modelHistory.slice(0,10).map(v=>`<div class="timeline-entry"><time>${esc(v.at)}</time><p>${esc(v.text)}</p></div>`).join('')}</div>${report}</div></section>`;
 return `<div class="page-heading"><h1>定价模型与版本</h1><div class="heading-actions"><button class="btn" data-action="export-model">导出模型参数</button><button class="btn dark" data-action="activate-model">保存并生效</button></div></div><div class="model-status"><span class="badge blue">${esc(state.model.version)}</span><span>USD · 研究情景</span>${report}</div><div class="tabs">${tabs.map(([k,label])=>`<button data-modeltab="${k}" class="${tab===k?'active':''}">${label}</button>`).join('')}</div><div class="model-layout"><div class="stack">${content}</div><aside class="stack"><section class="card"><div class="card-body padded"><h2>当前投保单试算</h2><p data-user-text>${esc(a.company)}</p><div class="pricing-total" id="unified-draft-total">${money(q.total)}</div><p>${q.available?names[m.scenario]:'待重新测算'}</p>${q.available?line('预计赔款',money(q.costs.el))+line('资本成本',money(q.costs.capitalCost)):''}<button class="text-btn" data-action="reset-model-draft">恢复当前生效参数</button></div></section></aside></div>`;
}
root.CBPricingView={render,model,names,money};
})(window);

;
/* UI copy: English, Korean, Japanese. Source keys are Simplified Chinese. */
window.CBLocaleMessages = {
  "跳到工作区": [
    "Skip to workspace",
    "작업 공간으로 이동",
    "ワークスペースへ移動"
  ],
  "新建投保单": [
    "New application",
    "새 청약",
    "新規申込"
  ],
  "保险业务工作区": [
    "Insurance workspace",
    "보험 업무",
    "保険業務"
  ],
  "承保": [
    "Application",
    "보험 청약",
    "保険申込"
  ],
  "客户 · 投保问卷": [
    "Client · Application",
    "고객 · 청약서",
    "顧客 · 申込書"
  ],
  "核保": [
    "Underwriting",
    "인수 심사",
    "引受審査"
  ],
  "保险人 · 风险与报价": [
    "Insurer · Risk & quote",
    "보험사 · 위험 및 견적",
    "保険会社 · リスク・見積"
  ],
  "理赔": [
    "File a claim",
    "사고 접수",
    "事故申告"
  ],
  "客户 · 事故申报": [
    "Client · Incident report",
    "고객 · 사고 신고",
    "顧客 · 事故報告"
  ],
  "核赔": [
    "Claims review",
    "보상 심사",
    "支払査定"
  ],
  "保险人 · 调查与结案": [
    "Insurer · Review & settlement",
    "보험사 · 조사 및 종결",
    "保険会社 · 調査・支払"
  ],
  "定价模型": [
    "Pricing model",
    "요율 모델",
    "料率モデル"
  ],
  "演示参数 · 版本管理": [
    "Parameters · Versions",
    "매개변수 · 버전",
    "パラメータ · バージョン"
  ],
  "演示投保单": [
    "Sample applications",
    "샘플 청약",
    "サンプル申込"
  ],
  "远": [
    "Y",
    "Y",
    "Y"
  ],
  "远帆跨境科技有限公司": [
    "Yuanfan Cross-border Technology",
    "위안판 크로스보더 테크놀로지",
    "遠帆クロスボーダーテクノロジー"
  ],
  "待核保": [
    "Awaiting underwriting",
    "인수 심사 대기",
    "引受審査待ち"
  ],
  "语": [
    "L",
    "L",
    "L"
  ],
  "语桥智能服务有限公司": [
    "LinguaBridge AI Services",
    "링구아브리지 AI 서비스",
    "リンガブリッジAIサービス"
  ],
  "AI API · 投保草稿": [
    "AI API · Draft",
    "AI API · 작성 중",
    "AI API · 下書き"
  ],
  "星": [
    "S",
    "S",
    "S"
  ],
  "星链出海软件有限公司": [
    "Starlink Global Software",
    "스타링크 글로벌 소프트웨어",
    "スターリンク・グローバルソフトウェア"
  ],
  "演示工具": [
    "Demo tools",
    "데모 도구",
    "デモツール"
  ],
  "全流程演示导览": [
    "Workflow guide",
    "업무 흐름 안내",
    "業務フローガイド"
  ],
  "载入已承保样例": [
    "Load an insured case",
    "가입 완료 사례 불러오기",
    "契約済み事例を読み込む"
  ],
  "导出业务档案": [
    "Export workspace",
    "업무 기록 내보내기",
    "業務記録を出力"
  ],
  "双端演示工作台": [
    "Demo workspace",
    "데모 작업 공간",
    "デモワークスペース"
  ],
  "客户视角 + 保险人视角": [
    "Client + insurer views",
    "고객 + 보험사 화면",
    "顧客・保険会社の画面"
  ],
  "保险业务": [
    "Insurance",
    "보험 업무",
    "保険業務"
  ],
  "核保工作台": [
    "Underwriting workspace",
    "인수 심사",
    "引受審査"
  ],
  "双端演示": [
    "Client & insurer",
    "고객 · 보험사",
    "顧客・保険会社"
  ],
  "演示导览 ↗": [
    "Workflow guide ↗",
    "업무 안내 ↗",
    "操作ガイド ↗"
  ],
  "导出核保摘要": [
    "Export underwriting",
    "심사 요약 내보내기",
    "審査概要を出力"
  ],
  "核保审查": [
    "Underwriting review",
    "인수 검토",
    "引受審査"
  ],
  "投保": [
    "Apply",
    "청약",
    "申込"
  ],
  "报价": [
    "Quote",
    "견적",
    "見積"
  ],
  "出单": [
    "Issue",
    "발급",
    "発行"
  ],
  "报案": [
    "Report",
    "신고",
    "申告"
  ],
  "风险总览": [
    "Risk overview",
    "위험 개요",
    "リスク概要"
  ],
  "定价明细": [
    "Pricing breakdown",
    "보험료 산출",
    "保険料内訳"
  ],
  "报价与保单": [
    "Quote & policy",
    "견적 및 증권",
    "見積・保険証券"
  ],
  "约定小时金额": [
    "Agreed hourly amount",
    "시간당 약정 금액",
    "時間当たり約定額"
  ],
  "业务量 × 贡献毛利 × 不可挽回比例": [
    "Volume × contribution margin × irrecoverable share",
    "거래량 × 공헌이익 × 회복 불가 비율",
    "取引量 × 限界利益 × 回復不能割合"
  ],
  "每次事故限额": [
    "Per-occurrence limit",
    "사고당 한도",
    "1事故限度額"
  ],
  "同因事故、多项服务共用限额": [
    "Shared across services affected by the same cause",
    "동일 원인 사고의 서비스 간 공통 한도",
    "同一原因の事故に共通適用"
  ],
  "年度总限额": [
    "Annual aggregate limit",
    "연간 총한도",
    "年間総限度額"
  ],
  "M1与M2共同受总限额约束": [
    "Shared annual limit for M1 and M2",
    "M1·M2 공통 연간 한도",
    "M1・M2共通の年間限度額"
  ],
  "当前承保依赖": [
    "Covered dependencies",
    "보장 서비스 의존성",
    "補償対象の依存関係"
  ],
  "项服务": [
    " services",
    "개 서비스",
    "サービス"
  ],
  "全球风险视图": [
    "Global risk view",
    "글로벌 위험 지도",
    "グローバルリスクマップ"
  ],
  "口径与来源 ↗": [
    "Method & sources ↗",
    "기준 및 출처 ↗",
    "算定基準・出典 ↗"
  ],
  "M1 日常中断": [
    "M1 Operational outage",
    "M1 일반 중단",
    "M1 通常の中断"
  ],
  "M2 冲突外溢": [
    "M2 Conflict spillover",
    "M2 분쟁 파급",
    "M2 紛争の波及"
  ],
  "年度事件概率 · 演示假设": [
    "Annual event probability · Assumptions",
    "연간 사건 확률 · 가정",
    "年間事象確率 · 仮定値"
  ],
  "云服务区域": [
    "Cloud regions",
    "클라우드 리전",
    "クラウドリージョン"
  ],
  "07 个观察区域": [
    "07 regions",
    "07개 리전",
    "07リージョン"
  ],
  "太 平 洋": [
    "PACIFIC OCEAN",
    "태평양",
    "太平洋"
  ],
  "大 西 洋": [
    "ATLANTIC OCEAN",
    "대서양",
    "大西洋"
  ],
  "印 度 洋": [
    "INDIAN OCEAN",
    "인도양",
    "インド洋"
  ],
  "美国东部": [
    "East US",
    "미국 동부",
    "米国東部"
  ],
  "西欧": [
    "West Europe",
    "서유럽",
    "西欧"
  ],
  "东南亚": [
    "Southeast Asia",
    "동남아시아",
    "東南アジア"
  ],
  "日本东部": [
    "Japan East",
    "일본 동부",
    "日本東部"
  ],
  "中东区域": [
    "Middle East",
    "중동",
    "中東"
  ],
  "澳大利亚东部": [
    "Australia East",
    "호주 동부",
    "豪州東部"
  ],
  "巴西南部": [
    "Brazil South",
    "브라질 남부",
    "ブラジル南部"
  ],
  "Natural Earth 海岸线 · 区域代表位置": [
    "Natural Earth coastlines · Representative locations",
    "Natural Earth 해안선 · 대표 위치",
    "Natural Earth海岸線 · 代表地点"
  ],
  "较低": [
    "Low",
    "낮음",
    "低"
  ],
  "中等": [
    "Medium",
    "보통",
    "中"
  ],
  "较高": [
    "High",
    "높음",
    "高"
  ],
  "点击标记查看风险": [
    "Select a marker to view risk",
    "마커를 선택하여 위험 확인",
    "マーカーでリスクを表示"
  ],
  "M1 年度事件概率": [
    "M1 annual event probability",
    "M1 연간 사건 확률",
    "M1 年間事象確率"
  ],
  "M2 年度事件概率": [
    "M2 annual event probability",
    "M2 연간 사건 확률",
    "M2 年間事象確率"
  ],
  "列明服务与业务依赖": [
    "Services & business dependencies",
    "서비스 및 업무 의존성",
    "サービス・業務の依存関係"
  ],
  "云服务 / 业务": [
    "Cloud service / Business",
    "클라우드 서비스 / 업무",
    "クラウドサービス / 業務"
  ],
  "承保区域": [
    "Covered region",
    "보장 리전",
    "補償対象リージョン"
  ],
  "业务连续性": [
    "Business continuity",
    "업무 연속성",
    "事業継続性"
  ],
  "每小时金额": [
    "Hourly amount",
    "시간당 금액",
    "時間当たり金額"
  ],
  "暂无可用替代": [
    "No available alternative",
    "사용 가능한 대체 수단 없음",
    "代替手段なし"
  ],
  "详情 ↗": [
    "Details ↗",
    "상세 ↗",
    "詳細 ↗"
  ],
  "同一业务多项依赖须合并核定，避免重复承保损失。": [
    "Consolidate dependencies for the same business to avoid duplicate coverage.",
    "동일 업무의 의존성을 통합하여 중복 보장을 방지합니다.",
    "同一業務の依存関係を統合し、重複補償を防ぎます。"
  ],
  "编辑依赖清单 →": [
    "Edit dependencies →",
    "의존성 편집 →",
    "依存関係を編集 →"
  ],
  "报价试算": [
    "Premium estimate",
    "보험료 산출",
    "保険料試算"
  ],
  "/ 年": [
    "/ year",
    "/ 년",
    "/ 年"
  ],
  "M1 日常数字中断": [
    "M1 Operational outage",
    "M1 일반 디지털 중단",
    "M1 通常のデジタル中断"
  ],
  "M2 第三国冲突外溢": [
    "M2 Third-country spillover",
    "M2 제3국 분쟁 파급",
    "M2 第三国への紛争波及"
  ],
  "每小时约定金额": [
    "Agreed hourly amount",
    "시간당 약정 금액",
    "時間当たり約定額"
  ],
  "等待期 / 最长赔偿": [
    "Waiting / Maximum duration",
    "대기 기간 / 최대 보상 시간",
    "待機期間 / 最大補償時間"
  ],
  "共同事故限额": [
    "Shared occurrence limit",
    "공통 사고당 한도",
    "共通事故限度額"
  ],
  "审核并生成报价": [
    "Review & issue quote",
    "심사 후 견적 생성",
    "審査して見積を作成"
  ],
  "待核实事项": [
    "Items to verify",
    "확인 필요 항목",
    "要確認事項"
  ],
  "规则演示": [
    "Rule-based demo",
    "규칙 기반 데모",
    "ルールベースのデモ"
  ],
  "当前存在未经验证的替代方案，建议补充切换演练记录，核实关键业务是否真正恢复。": [
    "An alternative has not been validated. Request failover test records and verify recovery of critical operations.",
    "대체 수단이 검증되지 않았습니다. 전환 훈련 기록과 핵심 업무 복구 여부를 확인하세요.",
    "代替手段が未検証です。切替訓練記録と重要業務の復旧を確認してください。"
  ],
  "查看依赖分析 →": [
    "View dependency analysis →",
    "의존성 분석 보기 →",
    "依存関係の分析 →"
  ],
  "保障结构": [
    "Coverage structure",
    "보장 구성",
    "補償構成"
  ],
  "M1 普通数字服务中断": [
    "M1 Operational digital outage",
    "M1 일반 디지털 서비스 중단",
    "M1 通常のデジタルサービス中断"
  ],
  "已选择": [
    "Selected",
    "선택됨",
    "選択済み"
  ],
  "M2 第三国物理冲突外溢": [
    "M2 Physical conflict spillover",
    "M2 제3국 물리적 분쟁 파급",
    "M2 第三国への物理的紛争波及"
  ],
  "M1 / M2年度限额": [
    "M1 / M2 annual limits",
    "M1 / M2 연간 한도",
    "M1 / M2 年間限度額"
  ],
  "赔款封顶": [
    "Payout cap",
    "지급 상한",
    "支払上限"
  ],
  "承保净损失声明及各项限额": [
    "Declared covered net loss and policy limits",
    "신고된 보장 순손실 및 약정 한도",
    "申告された補償対象純損失と各限度額"
  ],
  "历史事件与风险证据": [
    "Historical events & evidence",
    "과거 사건 및 위험 근거",
    "過去の事象・リスク資料"
  ],
  "Azure Front Door 连接异常": [
    "Azure Front Door connectivity issue",
    "Azure Front Door 연결 장애",
    "Azure Front Door 接続障害"
  ],
  "M1参考": [
    "M1 reference",
    "M1 참고",
    "M1 参考"
  ],
  "微软披露部分客户出现连接错误、超时和延迟；涉及DDoS防护、网络路由及控制面问题。": [
    "Microsoft reported connection errors, timeouts and latency affecting some customers, involving DDoS protection, routing and control-plane issues.",
    "Microsoft는 DDoS 방어, 라우팅 및 제어 영역 문제로 일부 고객에게 연결 오류, 시간 초과, 지연이 발생했다고 밝혔습니다.",
    "MicrosoftはDDoS防御、ルーティング、制御プレーンの問題に伴う一部顧客の接続エラー、タイムアウト、遅延を報告しました。"
  ],
  "Microsoft Azure · 官方事后报告 ↗": [
    "Microsoft Azure · Official post-incident report ↗",
    "Microsoft Azure · 공식 사후 보고서 ↗",
    "Microsoft Azure · 公式事後報告 ↗"
  ],
  "AWS US-EAST-1 服务事件": [
    "AWS US-EAST-1 service event",
    "AWS US-EAST-1 서비스 사고",
    "AWS US-EAST-1 サービス障害"
  ],
  "AWS披露北弗吉尼亚区域服务中断。用于说明区域及上游依赖，不等同于本客户事故。": [
    "AWS reported an outage in Northern Virginia. This illustrates regional and upstream dependencies; it is not this client's incident.",
    "AWS는 버지니아 북부 리전 중단을 보고했습니다. 리전 및 상위 의존성 참고 사례이며 이 고객의 사고는 아닙니다.",
    "AWSが報告したバージニア北部の障害です。リージョンと上流依存の参考事例であり、本顧客の事故ではありません。"
  ],
  "Amazon Web Services · 官方事件总结 ↗": [
    "Amazon Web Services · Official incident summary ↗",
    "Amazon Web Services · 공식 사고 요약 ↗",
    "Amazon Web Services · 公式障害概要 ↗"
  ],
  "Cloudflare 多项服务中断": [
    "Cloudflare multi-service outage",
    "Cloudflare 다중 서비스 중단",
    "Cloudflare 複数サービス障害"
  ],
  "官方披露Workers KV等多项服务受到影响，展示公共上游依赖带来的跨服务传播。": [
    "The official report describes effects on Workers KV and other services, illustrating propagation through shared upstream dependencies.",
    "공식 보고서는 Workers KV 등 여러 서비스의 영향을 설명하며, 공통 상위 의존성을 통한 장애 전파를 보여줍니다.",
    "公式報告はWorkers KVなどへの影響と、共通の上流依存関係を通じた障害の波及を示しています。"
  ],
  "Cloudflare · 官方事故复盘 ↗": [
    "Cloudflare · Official postmortem ↗",
    "Cloudflare · 공식 사고 분석 ↗",
    "Cloudflare · 公式事後分析 ↗"
  ],
  "核保检查摘要": [
    "Underwriting checklist",
    "인수 심사 체크리스트",
    "引受審査チェック"
  ],
  "服务及区域列明": [
    "Services and regions listed",
    "서비스 및 리전 명시",
    "サービス・リージョン明記"
  ],
  "已识别": [
    "Identified",
    "식별 완료",
    "確認済み"
  ],
  "业务量与毛利依据": [
    "Volume and margin evidence",
    "거래량 및 공헌이익 근거",
    "取引量・限界利益の根拠"
  ],
  "待人工核验": [
    "Manual review pending",
    "담당자 검토 대기",
    "担当者確認待ち"
  ],
  "独立业务组去重": [
    "Business-group deduplication",
    "업무 그룹 중복 확인",
    "業務グループ重複確認"
  ],
  "已检查": [
    "Checked",
    "점검 완료",
    "確認済み"
  ],
  "跨区替代演练": [
    "Cross-region failover testing",
    "리전 간 전환 훈련",
    "リージョン間切替訓練"
  ],
  "需关注": [
    "Attention needed",
    "확인 필요",
    "要確認"
  ],
  "进入核保审查": [
    "Open underwriting review",
    "인수 검토로 이동",
    "引受審査へ"
  ],
  "跨境数字服务中断保险": [
    "Cross-border digital service interruption insurance",
    "국경 간 디지털 서비스 중단 보험",
    "クロスボーダー・デジタルサービス中断保険"
  ],
  "保险演示导航": [
    "Insurance workspace navigation",
    "보험 업무 탐색",
    "保険業務ナビゲーション"
  ],
  "展开导航": [
    "Open navigation",
    "탐색 메뉴 열기",
    "ナビゲーションを開く"
  ],
  "关于演示与数据来源": [
    "About this demo & data sources",
    "데모 및 데이터 출처",
    "デモ・データ出典について"
  ],
  "风险模块": [
    "Risk modules",
    "위험 모듈",
    "リスクモジュール"
  ],
  "基于真实海岸线的全球云区域风险地图，可选择七个区域；概率为演示假设": [
    "Global cloud risk map with real coastlines. Select one of seven regions; probabilities are illustrative.",
    "실제 해안선 기반 클라우드 위험 지도. 7개 리전 선택 가능, 확률은 데모 가정입니다.",
    "実際の海岸線に基づくリスクマップ。7リージョンを選択可能。確率はデモの仮定値です。"
  ],
  "选择已承保演示样例": [
    "Load an insured sample",
    "가입 완료 샘플 선택",
    "契約済みサンプルを選択"
  ],
  "M1 · 云计算中断": [
    "M1 · Cloud outage",
    "M1 · 클라우드 중단",
    "M1 · クラウド中断"
  ],
  "Azure East US · 每小时2万元 · 样例可赔80分钟。": [
    "Azure East US · CNY 20,000/hour · 80 eligible minutes.",
    "Azure East US · 시간당 CNY 20,000 · 보상 대상 80분.",
    "Azure East US · 毎時CNY 20,000 · 補償対象80分。"
  ],
  "载入": [
    "Load",
    "불러오기",
    "読み込む"
  ],
  "M2 · 第三国物理外溢": [
    "M2 · Third-country physical spillover",
    "M2 · 제3국 물리적 파급",
    "M2 · 第三国への物理的波及"
  ],
  "新加坡设施假设情景 · 需核实非直接交战国与因果链。": [
    "Singapore facility scenario · Verify non-belligerent status and causation.",
    "싱가포르 시설 가정 · 비직접교전국 지위와 인과관계 확인.",
    "シンガポール施設の仮定 · 非直接交戦国の地位と因果関係を確認。"
  ],
  "AI API · 按次收费业务": [
    "AI API · Pay-per-task business",
    "AI API · 작업당 과금 업무",
    "AI API · タスク単位課金業務"
  ],
  "区分调用失败、重试补做和真正不可挽回的付费任务。": [
    "Distinguish failed calls, retries and recoverable work from irrecoverable paid tasks.",
    "호출 실패, 재시도·재처리와 회복 불가 유료 작업을 구분합니다.",
    "呼出失敗、再試行・再処理と回復不能な有料タスクを区別します。"
  ],
  "知道了": [
    "Got it",
    "확인",
    "確認"
  ],
  "关闭弹窗": [
    "Close dialog",
    "대화상자 닫기",
    "ダイアログを閉じる"
  ],
  "保障已确认": [
    "Coverage confirmed",
    "보장 확정",
    "補償確定"
  ],
  "理赔 · 事故申报": [
    "Claim · Incident report",
    "사고 접수 · 사고 신고",
    "事故申告 · 報告書"
  ],
  "理赔 · 客户事故申报": [
    "Client incident report",
    "고객 사고 신고",
    "顧客の事故報告"
  ],
  "下载事故报告": [
    "Download incident report",
    "사고 보고서 다운로드",
    "事故報告書を保存"
  ],
  "保险人核赔": [
    "Claims review",
    "보험사 보상 심사",
    "保険会社の支払査定"
  ],
  "事故报告": [
    "Incident report",
    "사고 보고서",
    "事故報告"
  ],
  "损失与减损": [
    "Loss & mitigation",
    "손실 및 경감",
    "損失・軽減措置"
  ],
  "材料与声明": [
    "Evidence & declarations",
    "자료 및 확인서",
    "資料・申告"
  ],
  "事故基本信息": [
    "Incident details",
    "사고 기본 정보",
    "事故の基本情報"
  ],
  "受影响的列明服务": [
    "Affected listed service",
    "영향받은 명시 서비스",
    "影響を受けた対象サービス"
  ],
  "客户报告的事故线索": [
    "Reported cause",
    "고객 신고 원인",
    "顧客申告の原因"
  ],
  "普通服务故障 / 网络异常": [
    "Service failure / Network issue",
    "서비스 장애 / 네트워크 이상",
    "サービス障害 / ネットワーク異常"
  ],
  "物理事件影响设施": [
    "Physical damage to facilities",
    "물리적 사건의 시설 영향",
    "物理的事象による施設への影響"
  ],
  "原因尚不清楚": [
    "Cause unknown",
    "원인 미상",
    "原因不明"
  ],
  "服务中断区间（北京时间）": [
    "Outage intervals (Beijing time)",
    "중단 구간 (베이징 시간)",
    "中断区間（北京時間）"
  ],
  "中断起点": [
    "Outage start",
    "중단 시작",
    "中断開始"
  ],
  "服务恢复时间": [
    "Service restored",
    "서비스 복구",
    "サービス復旧"
  ],
  "添加再次中断区间": [
    "Add another outage interval",
    "추가 중단 구간 등록",
    "再中断区間を追加"
  ],
  "承保业务开始受影响": [
    "Business impact started",
    "보장 업무 영향 시작",
    "対象業務の影響開始"
  ],
  "承保业务最终恢复": [
    "Business fully restored",
    "보장 업무 최종 복구",
    "対象業務の最終復旧"
  ],
  "事故经过与当前情况 *": [
    "Incident description & current status *",
    "사고 경위 및 현재 상황 *",
    "事故の経緯・現在の状況 *"
  ],
  "模拟服务商网络配置故障，导致生产数据面连接失败。关键订单无法完成，未成功切换。": [
    "Simulated provider network misconfiguration caused production data-plane connections to fail. Critical orders could not complete; failover was unsuccessful.",
    "서비스 제공자의 네트워크 설정 오류를 가정합니다. 운영 데이터 영역 연결이 실패해 핵심 주문을 완료하지 못했고 전환도 실패했습니다.",
    "提供者のネットワーク設定障害を想定。本番データプレーンへの接続が失敗し、重要注文を完了できず、切替も失敗しました。"
  ],
  "保存事故草稿": [
    "Save incident draft",
    "사고 초안 저장",
    "事故報告を下書き保存"
  ],
  "提交事故申报": [
    "Submit incident report",
    "사고 신고 제출",
    "事故報告を提出"
  ],
  "已载入演示保障，可填写事故、损失和声明": [
    "Insured sample loaded. Complete the incident, loss and declaration fields.",
    "가입 샘플을 불러왔습니다. 사고, 손실, 확인서를 작성하세요.",
    "契約済みサンプルを読み込みました。事故・損失・申告を入力してください。"
  ],
  "承保 · 投保问卷": [
    "Application · Questionnaire",
    "보험 청약 · 질문서",
    "保険申込 · 質問票"
  ],
  "承保 · 客户投保问卷": [
    "Insurance application",
    "보험 청약서",
    "保険申込書"
  ],
  "保存草稿": [
    "Save draft",
    "초안 저장",
    "下書き保存"
  ],
  "该保单已按报价快照确认，承保参数已锁定。": [
    "Coverage is confirmed against the quote snapshot. Underwriting parameters are locked.",
    "견적 스냅샷으로 보장이 확정되어 인수 매개변수가 잠겼습니다.",
    "見積スナップショットに基づき補償が確定し、引受条件が固定されています。"
  ],
  "复制为新的投保单": [
    "Copy as new application",
    "새 청약서로 복사",
    "新規申込として複製"
  ],
  "企业信息": [
    "Company",
    "기업 정보",
    "企業情報"
  ],
  "服务清单": [
    "Services",
    "서비스 목록",
    "サービス一覧"
  ],
  "财务影响": [
    "Financial impact",
    "재무 영향",
    "財務影響"
  ],
  "保障条件": [
    "Coverage terms",
    "보장 조건",
    "補償条件"
  ],
  "确认提交": [
    "Review & submit",
    "확인 및 제출",
    "確認・提出"
  ],
  "被保险人企业名称 *": [
    "Insured company name *",
    "피보험 기업명 *",
    "被保険企業名 *"
  ],
  "所属行业": [
    "Industry",
    "업종",
    "業種"
  ],
  "跨境电商": [
    "Cross-border e-commerce",
    "국경 간 전자상거래",
    "越境EC"
  ],
  "AI应用服务": [
    "AI application services",
    "AI 응용 서비스",
    "AIアプリサービス"
  ],
  "跨境SaaS": [
    "Cross-border SaaS",
    "국경 간 SaaS",
    "クロスボーダーSaaS"
  ],
  "数字营销": [
    "Digital marketing",
    "디지털 마케팅",
    "デジタルマーケティング"
  ],
  "其他": [
    "Other",
    "기타",
    "その他"
  ],
  "统一社会信用代码 / 注册编号": [
    "Company registration number",
    "기업 등록번호",
    "法人登録番号"
  ],
  "授权联系人 *": [
    "Authorized contact *",
    "권한 있는 담당자 *",
    "権限を持つ担当者 *"
  ],
  "联系邮箱 *": [
    "Contact email *",
    "연락 이메일 *",
    "連絡先メール *"
  ],
  "营业时间口径": [
    "Business hours",
    "영업시간 기준",
    "営業時間"
  ],
  "工作日 09:00–17:00": [
    "Weekdays 09:00–17:00",
    "평일 09:00–17:00",
    "平日 09:00–17:00"
  ],
  "全年 7×24 小时": [
    "24 hours, 7 days a week",
    "연중무휴 24시간",
    "年中無休24時間"
  ],
  "下一步": [
    "Next",
    "다음",
    "次へ"
  ],
  "陈晓 · 财务负责人": [
    "Chen Xiao · Finance lead",
    "천샤오 · 재무 책임자",
    "陳暁 · 財務責任者"
  ],
  "服务依赖": [
    "Service dependency",
    "서비스 의존성",
    "サービス依存関係"
  ],
  "云服务厂商 *": [
    "Cloud provider *",
    "클라우드 제공자 *",
    "クラウド提供者 *"
  ],
  "服务类型 *": [
    "Service type *",
    "서비스 유형 *",
    "サービス種別 *"
  ],
  "云计算": [
    "Cloud compute",
    "클라우드 컴퓨팅",
    "クラウドコンピューティング"
  ],
  "云存储": [
    "Cloud storage",
    "클라우드 스토리지",
    "クラウドストレージ"
  ],
  "数据库": [
    "Database",
    "데이터베이스",
    "データベース"
  ],
  "CDN / 网络": [
    "CDN / Network",
    "CDN / 네트워크",
    "CDN / ネットワーク"
  ],
  "具体产品 / 服务 *": [
    "Product / Service *",
    "제품 / 서비스 *",
    "製品 / サービス *"
  ],
  "部署区域 *": [
    "Deployment region *",
    "배포 리전 *",
    "配置リージョン *"
  ],
  "模型 / 部署端点 / 功能边界": [
    "Model / Endpoint / Scope",
    "모델 / 엔드포인트 / 기능 범위",
    "モデル / エンドポイント / 機能範囲"
  ],
  "生产数据面、网络或读写功能须明确": [
    "Specify the production data plane, network or read/write functions.",
    "운영 데이터 영역, 네트워크 또는 읽기·쓰기 기능을 명시하세요.",
    "本番データプレーン、ネットワーク、読書き機能を明記してください。"
  ],
  "独立业务组编号 *": [
    "Business group ID *",
    "독립 업무 그룹 ID *",
    "独立業務グループID *"
  ],
  "同一业务的多项依赖须先合并核定": [
    "Consolidate dependencies serving the same business first.",
    "동일 업무의 의존성을 먼저 통합 심사하세요.",
    "同一業務の複数依存関係は統合して査定します。"
  ],
  "用于哪项业务 *": [
    "Supported business *",
    "서비스 사용 업무 *",
    "利用する業務 *"
  ],
  "该服务每次事故限额（元）": [
    "Service occurrence limit (CNY)",
    "서비스 사고당 한도 (CNY)",
    "サービス別事故限度額（CNY）"
  ],
  "业务依赖与关键交易说明": [
    "Dependencies & critical transactions",
    "업무 의존성 및 핵심 거래",
    "業務依存・重要取引の説明"
  ],
  "订单校验、库存确认与支付后履约必须调用该生产服务；备用系统尚未通过端到端演练。": [
    "Order validation, inventory checks and post-payment fulfillment depend on this production service. The backup has not passed an end-to-end drill.",
    "주문 검증, 재고 확인, 결제 후 이행이 이 운영 서비스에 의존합니다. 백업의 종단 간 전환 훈련은 완료되지 않았습니다.",
    "注文検証、在庫確認、決済後の履行が本サービスに依存。バックアップは一連の切替訓練を完了していません。"
  ],
  "上一步": [
    "Back",
    "이전",
    "戻る"
  ],
  "生产数据面 / vm-prod-eastus": [
    "Production data plane / vm-prod-eastus",
    "운영 데이터 영역 / vm-prod-eastus",
    "本番データプレーン / vm-prod-eastus"
  ],
  "跨境电商订单处理": [
    "Cross-border order processing",
    "국경 간 전자상거래 주문 처리",
    "越境EC注文処理"
  ],
  "替代 / 备份可用性": [
    "Alternative / Backup availability",
    "대체 / 백업 가용성",
    "代替・バックアップの可用性"
  ],
  "没有可用替代": [
    "No available alternative",
    "가용 대체 수단 없음",
    "利用可能な代替なし"
  ],
  "有替代，但尚未完成演练": [
    "Alternative available, not tested",
    "대체 수단 있음 · 훈련 미완료",
    "代替あり・訓練未実施"
  ],
  "已完成业务切换演练": [
    "Business failover tested",
    "업무 전환 훈련 완료",
    "業務切替訓練済み"
  ],
  "目标恢复时间RTO（分钟）": [
    "Recovery time objective (minutes)",
    "목표 복구 시간 RTO (분)",
    "目標復旧時間RTO（分）"
  ],
  "最近一次切换演练日期": [
    "Latest failover test date",
    "최근 전환 훈련일",
    "最終切替訓練日"
  ],
  "可在核保时补充": [
    "May be supplied during underwriting",
    "인수 심사 시 보완 가능",
    "引受審査時に補足可能"
  ],
  "主备是否共用关键上游": [
    "Shared critical upstream dependencies",
    "주·백업 공통 핵심 상위 의존성",
    "主系・待機系の共通上流依存"
  ],
  "待核查": [
    "To be verified",
    "확인 예정",
    "要確認"
  ],
  "存在共用上游": [
    "Shared upstream dependencies",
    "공통 상위 의존성 있음",
    "共通上流依存あり"
  ],
  "已验证无共用故障点": [
    "No shared failure point verified",
    "공통 장애점 없음 확인",
    "共通障害点なしを確認済み"
  ],
  "替代方案、演练结果及数据恢复说明": [
    "Alternative plan, tests & data recovery",
    "대체 방안, 훈련 결과 및 데이터 복구",
    "代替策・訓練結果・データ復旧"
  ],
  "区分备份数据存在、服务能启动与关键业务真正恢复。": [
    "Distinguish having backups, starting services and actually restoring critical operations.",
    "백업 존재, 서비스 실행, 핵심 업무의 실제 복구를 구분하세요.",
    "バックアップの存在、サービス起動、重要業務の実際の復旧を区別してください。"
  ],
  "小时金额依据": [
    "Hourly amount basis",
    "시간당 금액 근거",
    "時間当たり金額の根拠"
  ],
  "正常业务量（唯一付费任务/小时） *": [
    "Normal volume (unique paid tasks/hour) *",
    "정상 거래량 (고유 유료 작업/시간) *",
    "通常取引量（固有の有料タスク/時） *"
  ],
  "按订单或付费任务去重，不使用API请求次数。": [
    "Deduplicate by order or paid task, not by API request.",
    "API 요청 수가 아닌 주문·유료 작업 기준으로 중복을 제거하세요.",
    "APIリクエスト数ではなく、注文・有料タスク単位で重複排除します。"
  ],
  "每笔贡献毛利（元） *": [
    "Contribution margin per task (CNY) *",
    "작업당 공헌이익 (CNY) *",
    "タスク当たり限界利益（CNY） *"
  ],
  "收入扣除随业务发生的可变成本。": [
    "Revenue less variable costs incurred with the transaction.",
    "매출에서 거래 발생에 따른 변동비를 차감합니다.",
    "売上から取引に伴う変動費を控除します。"
  ],
  "不可挽回比例（%） *": [
    "Irrecoverable share (%) *",
    "회복 불가 비율 (%) *",
    "回復不能割合（%） *"
  ],
  "恢复后能够补做并取得收入的部分应剔除。": [
    "Exclude work that can be completed and monetized after recovery.",
    "복구 후 재처리하여 수익을 얻을 수 있는 부분은 제외하세요.",
    "復旧後に再処理して収益を得られる部分を除外します。"
  ],
  "财务依据观察期": [
    "Financial observation period",
    "재무 관찰 기간",
    "財務データ観察期間"
  ],
  "数据来源与估算依据": [
    "Data sources & estimation basis",
    "데이터 출처 및 추정 근거",
    "データ出典・推計根拠"
  ],
  "业务系统按唯一订单汇总，财务核对单笔贡献毛利；根据历史补单率估计不可挽回比例。": [
    "Aggregate unique orders from business systems; finance validates margin per task. Estimate the irrecoverable share from historical recovery rates.",
    "업무 시스템의 고유 주문을 집계하고 재무 부서가 공헌이익을 확인합니다. 과거 재처리율로 회복 불가 비율을 추정합니다.",
    "業務システムで固有注文を集計し、財務部門が限界利益を確認。過去の再処理率から回復不能割合を推計します。"
  ],
  "近90天同营业时段": [
    "Same business hours over the past 90 days",
    "최근 90일 동일 영업시간",
    "直近90日の同一営業時間帯"
  ],
  "保险起始日期 *": [
    "Coverage start date *",
    "보험 시작일 *",
    "保険開始日 *"
  ],
  "保险终止日期 *": [
    "Coverage end date *",
    "보험 종료일 *",
    "保険終了日 *"
  ],
  "终止日00:00不再属于保障期间": [
    "Coverage ends at 00:00 on the end date.",
    "종료일 00:00부터 보장되지 않습니다.",
    "終了日の00:00以降は補償対象外です。"
  ],
  "等待期（分钟）": [
    "Waiting period (minutes)",
    "대기 기간 (분)",
    "待機期間（分）"
  ],
  "同一合并事故累计实际中断时间扣除一次。": [
    "Deduct once from accumulated actual downtime for each merged occurrence.",
    "통합 사고별 누적 실제 중단 시간에서 한 번 차감합니다.",
    "統合事故ごとに累積実中断時間から一度控除します。"
  ],
  "最长可赔时间（小时）": [
    "Maximum covered duration (hours)",
    "최대 보상 시간 (시간)",
    "最大補償時間（時間）"
  ],
  "仅累计符合营业时间和业务影响的可赔分钟。": [
    "Count only eligible minutes within business hours and the business impact period.",
    "영업시간과 업무 영향에 해당하는 보상 대상 분만 누적합니다.",
    "営業時間と業務影響に該当する補償対象時間のみを累積します。"
  ],
  "共同每次事故限额（元）": [
    "Shared occurrence limit (CNY)",
    "공통 사고당 한도 (CNY)",
    "共通事故限度額（CNY）"
  ],
  "M1年度累计限额（元）": [
    "M1 annual aggregate limit (CNY)",
    "M1 연간 누적 한도 (CNY)",
    "M1 年間累計限度額（CNY）"
  ],
  "是否投保M2扩展": [
    "Include M2 extension",
    "M2 확장 가입 여부",
    "M2特約の付帯"
  ],
  "投保 · 第三国物理冲突外溢": [
    "Include · Third-country physical spillover",
    "가입 · 제3국 물리적 분쟁 파급",
    "付帯 · 第三国への物理的紛争波及"
  ],
  "不投保 · 仅M1": [
    "Exclude · M1 only",
    "미가입 · M1만",
    "付帯なし · M1のみ"
  ],
  "M2年度累计限额（元）": [
    "M2 annual aggregate limit (CNY)",
    "M2 연간 누적 한도 (CNY)",
    "M2 年間累計限度額（CNY）"
  ],
  "保单年度总限额（元）": [
    "Total annual policy limit (CNY)",
    "보험증권 연간 총한도 (CNY)",
    "保険契約の年間総限度額（CNY）"
  ],
  "M1 普通中断": [
    "M1 Operational outage",
    "M1 일반 중단",
    "M1 通常の中断"
  ],
  "约定的硬件、软件、操作、供电及网络故障等。仍适用具体责任边界和除外约定。": [
    "Specified hardware, software, operational, power and network failures, subject to coverage terms and exclusions.",
    "약정된 하드웨어, 소프트웨어, 운영, 전력 및 네트워크 장애. 구체적인 보장 범위와 면책 조항을 적용합니다.",
    "約定されたハードウェア、ソフトウェア、操作、電力、ネットワークの障害。補償範囲と免責条項を適用します。"
  ],
  "M2 物理冲突外溢": [
    "M2 Physical conflict spillover",
    "M2 물리적 분쟁 파급",
    "M2 物理的紛争波及"
  ],
  "限约定物理事件影响非直接交战国设施而引发的服务中断。纯网络事件不自动归入M2。": [
    "Specified physical events affecting facilities in a country not directly at war. Cyber-only events do not automatically qualify for M2.",
    "비직접교전국 시설에 약정된 물리적 사건이 영향을 주어 발생한 서비스 중단에 한정합니다. 순수 사이버 사건은 M2에 자동 포함되지 않습니다.",
    "非直接交戦国の施設に約定の物理的事象が影響したサービス中断に限定。純粋なサイバー事象は自動的にM2対象とはなりません。"
  ],
  "投保企业": [
    "Applicant company",
    "청약 기업",
    "申込企業"
  ],
  "服务与独立业务组": [
    "Services & business groups",
    "서비스 및 독립 업무 그룹",
    "サービス・独立業務グループ"
  ],
  "约定小时金额合计": [
    "Total agreed hourly amount",
    "시간당 약정 금액 합계",
    "時間当たり約定額の合計"
  ],
  "保障期间": [
    "Coverage period",
    "보장 기간",
    "補償期間"
  ],
  "等待期 / 最长可赔时间": [
    "Waiting / Maximum duration",
    "대기 기간 / 최대 보상 시간",
    "待機期間 / 最大補償時間"
  ],
  "试算年保费": [
    "Estimated annual premium",
    "연간 보험료 추정",
    "年間保険料試算"
  ],
  "问卷检查通过": [
    "Application checks passed",
    "청약서 점검 통과",
    "申込内容チェック済み"
  ],
  "我确认投保信息完整、准确，并已阅读保障条件。": [
    "I confirm the information is complete and accurate and have read the coverage terms.",
    "청약 정보가 완전하고 정확하며 보장 조건을 읽었음을 확인합니다.",
    "申込情報が完全かつ正確で、補償条件を確認したことを表明します。"
  ],
  "查看演示保单": [
    "View sample policy",
    "데모 증권 보기",
    "デモ保険証券を表示"
  ],
  "查看已确认演示保单": [
    "View confirmed policy",
    "확정된 데모 증권 보기",
    "確定済みデモ証券を表示"
  ],
  "小时金额核定": [
    "Hourly amount assessment",
    "시간당 금액 산정",
    "時間当たり金額の査定"
  ],
  "业务组": [
    "Business group",
    "업무 그룹",
    "業務グループ"
  ],
  "业务量/小时": [
    "Volume / hour",
    "거래량 / 시간",
    "取引量 / 時間"
  ],
  "单笔贡献毛利": [
    "Margin per task",
    "작업당 공헌이익",
    "タスク当たり限界利益"
  ],
  "不可挽回比例": [
    "Irrecoverable share",
    "회복 불가 비율",
    "回復不能割合"
  ],
  "小时金额": [
    "Hourly amount",
    "시간당 금액",
    "時間当たり金額"
  ],
  "失败重试按唯一任务去重；能够补做的收入不计为永久损失。": [
    "Deduplicate retries by unique task; recoverable revenue is not a permanent loss.",
    "재시도는 고유 작업 기준으로 중복 제거하며 재처리 가능한 수익은 영구 손실에 포함하지 않습니다.",
    "再試行は固有タスク単位で重複排除し、回復可能な収益は永久損失に含めません。"
  ],
  "双模块保费计算": [
    "Two-module premium calculation",
    "두 모듈 보험료 계산",
    "2モジュール保険料計算"
  ],
  "服务 / 区域": [
    "Service / Region",
    "서비스 / 리전",
    "サービス / リージョン"
  ],
  "M1纯保费": [
    "M1 pure premium",
    "M1 순보험료",
    "M1 純保険料"
  ],
  "M2纯保费": [
    "M2 pure premium",
    "M2 순보험료",
    "M2 純保険料"
  ],
  "年毛保费": [
    "Annual gross premium",
    "연간 영업보험료",
    "年間営業保険料"
  ],
  "合计": [
    "Total",
    "합계",
    "合計"
  ],
  "计算口径": [
    "Calculation basis",
    "계산 기준",
    "計算基準"
  ],
  "λ = −ln(1 − 年度至少一次事件概率)": [
    "λ = −ln(1 − annual probability of at least one event)",
    "λ = −ln(1 − 연간 1회 이상 사건 발생 확률)",
    "λ = −ln(1 − 年間に1回以上発生する確率)"
  ],
  "M1纯保费 = λ₁ × 单次示例损失 × 业务影响系数 × 厂商系数 × 备用系数": [
    "M1 pure premium = λ₁ × sample loss × business impact factor × provider factor × backup factor",
    "M1 순보험료 = λ₁ × 예시 손실 × 업무 영향 계수 × 제공자 계수 × 백업 계수",
    "M1 純保険料 = λ₁ × サンプル損失 × 業務影響係数 × 提供者係数 × バックアップ係数"
  ],
  "M2纯保费 = λ₂ × 单次示例损失 × 业务影响系数 × (1 + 相关性附加) × 备用系数": [
    "M2 pure premium = λ₂ × sample loss × business impact factor × (1 + correlation loading) × backup factor",
    "M2 순보험료 = λ₂ × 예시 손실 × 업무 영향 계수 × (1 + 상관성 할증) × 백업 계수",
    "M2 純保険料 = λ₂ × サンプル損失 × 業務影響係数 × (1 + 相関割増) × バックアップ係数"
  ],
  "年毛保费 = (M1纯保费 + M2纯保费) × (1 + 风险附加) ÷ (1 − 费用率)": [
    "Annual gross premium = (M1 pure premium + M2 pure premium) × (1 + risk loading) ÷ (1 − expense ratio)",
    "연간 영업보험료 = (M1 순보험료 + M2 순보험료) × (1 + 위험 할증) ÷ (1 − 사업비율)",
    "年間営業保険料 = (M1 純保険料 + M2 純保険料) × (1 + リスク割増) ÷ (1 − 事業費率)"
  ],
  "查看模型参数与版本": [
    "View model & versions",
    "모델 매개변수 및 버전 보기",
    "モデル・バージョンを表示"
  ],
  "本次参数快照": [
    "Parameter snapshot",
    "매개변수 스냅샷",
    "パラメータのスナップショット"
  ],
  "模型版本": [
    "Model version",
    "모델 버전",
    "モデルバージョン"
  ],
  "M1 / M2示例总中断时长": [
    "M1 / M2 sample outage duration",
    "M1 / M2 예시 총중단 시간",
    "M1 / M2 サンプル総中断時間"
  ],
  "业务受影响系数": [
    "Business impact factor",
    "업무 영향 계수",
    "業務影響係数"
  ],
  "风险附加 / 费用率": [
    "Risk loading / Expense ratio",
    "위험 할증 / 사업비율",
    "リスク割増 / 事業費率"
  ],
  "历史事件用途": [
    "Use of historical events",
    "과거 사건의 용도",
    "過去事象の用途"
  ],
  "辅助审查，不直接推出概率": [
    "Review evidence, not direct probability estimates",
    "심사 참고이며 직접적인 확률 추정은 아님",
    "審査の参考資料。確率を直接推定しない"
  ],
  "核保人工复核": [
    "Manual underwriting review",
    "담당자 인수 검토",
    "担当者による引受審査"
  ],
  "企业与授权信息一致": [
    "Company identity & authority verified",
    "기업 및 권한 정보 일치",
    "企業・権限情報の一致"
  ],
  "核对投保主体、联系人及声明权限。": [
    "Check the applicant, contact and declaration authority.",
    "청약 주체, 담당자 및 진술 권한을 확인합니다.",
    "申込主体、担当者、申告権限を確認します。"
  ],
  "服务依赖与备用方案已复核": [
    "Dependencies & backup plan reviewed",
    "서비스 의존성 및 백업 검토 완료",
    "サービス依存・代替策の確認"
  ],
  "服务、区域、端点、独立业务组和切换能力明确。": [
    "Confirm service, region, endpoint, business group and failover capability.",
    "서비스, 리전, 엔드포인트, 업무 그룹 및 전환 능력을 확인합니다.",
    "サービス、リージョン、エンドポイント、業務グループ、切替能力を確認します。"
  ],
  "小时金额与财务基础合理": [
    "Hourly amount & financial basis reasonable",
    "시간당 금액 및 재무 근거 적정",
    "時間当たり金額・財務根拠の妥当性"
  ],
  "业务量、贡献毛利和不可挽回比例有支持依据。": [
    "Support volume, contribution margin and irrecoverable share with evidence.",
    "거래량, 공헌이익, 회복 불가 비율의 근거를 확인합니다.",
    "取引量、限界利益、回復不能割合の根拠を確認します。"
  ],
  "保障边界与限额配置已复核": [
    "Coverage boundaries & limits reviewed",
    "보장 범위 및 한도 검토 완료",
    "補償範囲・限度額の確認"
  ],
  "已解释等待期、净损失封顶、M2适用条件和除外事项。": [
    "Explain the waiting period, net-loss cap, M2 conditions and exclusions.",
    "대기 기간, 순손실 상한, M2 적용 조건 및 면책을 설명합니다.",
    "待機期間、純損失上限、M2適用条件、免責事項を説明します。"
  ],
  "核保意见与附加条件": [
    "Underwriting notes & conditions",
    "인수 의견 및 추가 조건",
    "引受意見・追加条件"
  ],
  "建议出单前锁定服务及业务依赖清单；客户确认财务口径和未验证备用方案。": [
    "Lock the service and dependency schedule before issuance; obtain client confirmation of the financial basis and untested backup plan.",
    "발급 전 서비스·업무 의존성 목록을 확정하고 재무 기준과 미검증 백업에 대한 고객 확인을 받습니다.",
    "発行前にサービスと業務依存一覧を固定し、財務基準と未検証の代替策について顧客確認を得ます。"
  ],
  "查看已确认保单": [
    "View confirmed policy",
    "확정 증권 보기",
    "確定保険証券を表示"
  ],
  "自动检查记录": [
    "Automated checks",
    "자동 점검 기록",
    "自動チェック記録"
  ],
  "基础字段": [
    "Required fields",
    "기본 입력 항목",
    "基本項目"
  ],
  "通过": [
    "Passed",
    "통과",
    "合格"
  ],
  "业务组重复": [
    "Duplicate business groups",
    "업무 그룹 중복",
    "業務グループ重複"
  ],
  "未发现": [
    "None found",
    "발견되지 않음",
    "該当なし"
  ],
  "AI API损失口径": [
    "AI API loss basis",
    "AI API 손실 기준",
    "AI API損失基準"
  ],
  "本单非AI API业务": [
    "No AI API business in this application",
    "본 청약은 AI API 업무가 아님",
    "本申込にAI API業務なし"
  ],
  "相关性与累计暴露": [
    "Correlation & aggregate exposure",
    "상관성 및 누적 노출",
    "相関・累積エクスポージャー"
  ],
  "年度限额尚未做完整分布校准": [
    "Annual limits not yet calibrated to a full distribution",
    "연간 한도의 전체 분포 보정은 미완료",
    "年間限度額の全分布校正は未実施"
  ],
  "业务轨迹": [
    "Activity history",
    "업무 이력",
    "業務履歴"
  ],
  "载入预置已承保演示样例": [
    "Loaded an insured sample",
    "가입 완료 데모 사례 불러옴",
    "契約済みデモを読み込み"
  ],
  "客户提交投保问卷 · 等待核保": [
    "Client submitted application · Awaiting underwriting",
    "고객 청약서 제출 · 인수 심사 대기",
    "顧客が申込提出 · 引受審査待ち"
  ],
  "演示保障已确认 · 保单快照已锁定": [
    "Demo coverage confirmed · Policy snapshot locked",
    "데모 보장 확정 · 증권 스냅샷 잠금",
    "デモ補償確定 · 証券スナップショット固定"
  ],
  "演示保险凭证": [
    "Sample insurance certificate",
    "데모 보험 증명서",
    "デモ保険証明書"
  ],
  "被保险人": [
    "Insured",
    "피보험자",
    "被保険者"
  ],
  "保险期间": [
    "Policy period",
    "보험 기간",
    "保険期間"
  ],
  "保障模块": [
    "Coverage modules",
    "보장 모듈",
    "補償モジュール"
  ],
  "M1普通数字中断 + M2第三国物理冲突外溢": [
    "M1 Operational outage + M2 Third-country physical spillover",
    "M1 일반 중단 + M2 제3국 물리적 분쟁 파급",
    "M1 通常の中断 + M2 第三国への物理的紛争波及"
  ],
  "等待期 / 最长可赔": [
    "Waiting / Maximum duration",
    "대기 기간 / 최대 보상 시간",
    "待機期間 / 最大補償時間"
  ],
  "共同事故限额 / 年总限额": [
    "Occurrence / Annual total limit",
    "공통 사고당 / 연간 총한도",
    "共通事故 / 年間総限度額"
  ],
  "列明服务附表": [
    "Schedule of listed services",
    "명시 서비스 명세",
    "対象サービス明細"
  ],
  "服务 / 端点": [
    "Service / Endpoint",
    "서비스 / 엔드포인트",
    "サービス / エンドポイント"
  ],
  "区域 / 业务组": [
    "Region / Business group",
    "리전 / 업무 그룹",
    "リージョン / 業務グループ"
  ],
  "责任与计算口径摘要": [
    "Coverage & calculation summary",
    "보장 및 계산 기준 요약",
    "補償・計算基準の概要"
  ],
  "按约定阈值确认服务中断，并核实列明业务实际受影响。扣等待期后，仅累计营业时段与业务影响的交集；成功切换后停止累计。恢复后30分钟内再次中断按规则合并，中间正常时段不计入赔偿。": [
    "Confirm outage thresholds and actual impact on the listed business. After the waiting period, count only the overlap of business hours and impact; stop on successful failover. Repeated outages within 30 minutes of recovery are merged under the rules; healthy intervals are excluded.",
    "약정 임계치와 명시 업무의 실제 영향을 확인합니다. 대기 기간 후 영업시간과 업무 영향이 겹치는 구간만 계산하며 전환 성공 시 누적을 멈춥니다. 복구 후 30분 이내 재중단은 규칙에 따라 합산하되 정상 구간은 제외합니다.",
    "約定閾値と対象業務への実影響を確認。待機期間後、営業時間と影響時間の重複分のみを計上し、切替成功時に停止。復旧後30分以内の再中断は規則に従い統合し、正常区間は除外します。"
  ],
  "最终赔款受承保净损失声明、服务和共同事故限额、模块年度及总年度剩余额度约束；同一损失不重复补偿。M2须证明约定物理事件、非直接交战国设施与中断的因果链；纯网络事件不自动适用M2。": [
    "Final payment is capped by declared covered net loss, service and occurrence limits, and remaining module and total annual limits. No duplicate recovery. M2 requires evidence linking the specified physical event, facilities in a country not directly at war, and the outage. Cyber-only events do not automatically qualify.",
    "최종 지급액에는 신고된 보장 순손실, 서비스·공통 사고 한도, 모듈·전체 연간 잔여 한도를 적용하며 중복 보상하지 않습니다. M2는 약정 물리적 사건, 비직접교전국 시설, 중단 간 인과관계를 입증해야 합니다. 순수 사이버 사건은 자동 적용되지 않습니다.",
    "最終支払は申告純損失、サービス・共通事故限度、モジュール・年間総残額で制限し、重複補償しません。M2は約定物理事象、非直接交戦国施設、中断の因果関係の立証が必要。純粋なサイバー事象は自動適用されません。"
  ],
  "当前不含声誉损失、一般业务波动及未投保额外费用扩展。": [
    "Reputational loss, ordinary business fluctuations and uninsured extra expenses are excluded.",
    "평판 손실, 일반적 영업 변동, 미가입 추가 비용은 포함하지 않습니다.",
    "評判損失、通常の業績変動、未付保の追加費用は対象外です。"
  ],
  "演示核保人：已授权角色": [
    "Demo underwriter: authorized role",
    "데모 인수 담당자: 권한 부여 역할",
    "デモ引受担当：権限付与済み"
  ],
  "客户确认：已模拟确认": [
    "Client confirmation: simulated",
    "고객 확인: 시뮬레이션 완료",
    "顧客確認：シミュレーション済み"
  ],
  "版本状态：已锁定快照": [
    "Version status: snapshot locked",
    "버전 상태: 스냅샷 잠금",
    "バージョン状態：固定済み"
  ],
  "下载报价 / 保单HTML": [
    "Download quote / policy HTML",
    "견적 / 증권 HTML 다운로드",
    "見積・証券HTMLを保存"
  ],
  "进入客户报案": [
    "Open client claim report",
    "고객 사고 신고로 이동",
    "顧客事故申告へ"
  ],
  "确认与留痕": [
    "Confirmations & audit trail",
    "확인 및 이력",
    "確認・監査履歴"
  ],
  "损失、切换与恢复": [
    "Loss, failover & recovery",
    "손실, 전환 및 복구",
    "損失・切替・復旧"
  ],
  "是否尝试替代、切换或补做": [
    "Alternative, failover or retry attempted",
    "대체, 전환 또는 재처리 시도 여부",
    "代替・切替・再処理の実施"
  ],
  "已尝试": [
    "Attempted",
    "시도함",
    "実施済み"
  ],
  "尚未尝试": [
    "Not yet attempted",
    "미시도",
    "未実施"
  ],
  "备用服务是否成功恢复业务": [
    "Did the backup restore operations?",
    "백업 서비스의 업무 복구 성공 여부",
    "代替サービスで業務復旧したか"
  ],
  "未成功接管": [
    "Failover unsuccessful",
    "인계 실패",
    "切替失敗"
  ],
  "已成功接管": [
    "Failover successful",
    "인계 성공",
    "切替成功"
  ],
  "防损减损措施与结果": [
    "Mitigation actions & results",
    "손해 방지·경감 조치 및 결과",
    "損害防止・軽減措置と結果"
  ],
  "10:08 启动备用方案；10:18 验证失败，未成功接管。持续重试并暂停新增任务，恢复后核对积压队列。": [
    "10:08 Backup initiated; 10:18 validation failed, no successful takeover. Retried and paused new tasks; reconciled the backlog after recovery.",
    "10:08 백업 시작, 10:18 검증 실패로 인계 불가. 재시도하며 신규 작업을 중지했고 복구 후 대기열을 대조했습니다.",
    "10:08代替策開始、10:18検証失敗で引継ぎ不可。再試行し新規タスクを停止、復旧後に滞留キューを照合しました。"
  ],
  "服务及业务恢复记录": [
    "Service & business recovery log",
    "서비스 및 업무 복구 기록",
    "サービス・業務復旧記録"
  ],
  "11:50 服务及关键交易恢复；11:55 完成连续五分钟恢复确认。": [
    "11:50 Service and critical transactions restored; 11:55 five consecutive minutes of recovery confirmed.",
    "11:50 서비스·핵심 거래 복구, 11:55 연속 5분 복구 확인 완료.",
    "11:50サービスと重要取引が復旧、11:55に連続5分の復旧確認完了。"
  ],
  "最终无法挽回的任务数（参考）": [
    "Irrecoverable tasks (reference)",
    "최종 회복 불가 작업 수 (참고)",
    "回復不能タスク数（参考）"
  ],
  "每笔贡献毛利（元，参考）": [
    "Margin per task (CNY, reference)",
    "작업당 공헌이익 (CNY, 참고)",
    "タスク当たり限界利益（CNY、参考）"
  ],
  "声明承保净损失（元） *": [
    "Declared covered net loss (CNY) *",
    "신고 보장 순손실 (CNY) *",
    "申告する補償対象純損失（CNY） *"
  ],
  "扣除节省的可变成本；不要直接使用营业收入。": [
    "Deduct saved variable costs; do not use gross revenue directly.",
    "절감된 변동비를 차감하며 매출액을 그대로 사용하지 마세요.",
    "節減された変動費を控除し、売上をそのまま使わないでください。"
  ],
  "针对同一损失的其他补偿（元）": [
    "Other recovery for the same loss (CNY)",
    "동일 손실의 기타 보상 (CNY)",
    "同一損失に対する他の補償（CNY）"
  ],
  "与该损失无关的云抵用券不自动全额冲减。": [
    "Unrelated cloud credits are not automatically deducted in full.",
    "해당 손실과 무관한 클라우드 크레딧은 자동으로 전액 차감하지 않습니다.",
    "当該損失と無関係なクラウドクレジットは自動的に全額控除しません。"
  ],
  "财务声明计算依据 *": [
    "Financial declaration basis *",
    "재무 손실 신고 산정 근거 *",
    "財務損失申告の算定根拠 *"
  ],
  "索赔材料与授权声明": [
    "Evidence & authorized declaration",
    "청구 자료 및 권한 확인서",
    "請求資料・権限に基づく申告"
  ],
  "独立监测记录": [
    "Independent monitoring records",
    "독립 모니터링 기록",
    "独立監視記録"
  ],
  "保险人 / 监测机构 · 示例探测原始记录": [
    "Insurer / Monitor · Sample raw probe logs",
    "보험사 / 모니터링 기관 · 샘플 원시 기록",
    "保険会社 / 監視機関 · サンプル生ログ"
  ],
  "演示已归档": [
    "Demo archived",
    "데모 보관 완료",
    "デモ保存済み"
  ],
  "服务商故障说明": [
    "Provider incident statement",
    "서비스 제공자 장애 설명",
    "提供者の障害説明"
  ],
  "服务商公告或工单 · 可后补根因": [
    "Provider notice or ticket · Root cause may follow",
    "제공자 공지·지원 티켓 · 근본 원인 추후 보완",
    "提供者の告知・チケット · 根本原因は後日補足可"
  ],
  "业务交易与恢复记录": [
    "Transaction & recovery logs",
    "업무 거래 및 복구 기록",
    "業務取引・復旧記録"
  ],
  "客户技术部门 · 唯一任务及成功率": [
    "Client IT · Unique tasks and success rates",
    "고객 기술팀 · 고유 작업 및 성공률",
    "顧客技術部門 · 固有タスク・成功率"
  ],
  "模拟提供": [
    "Simulated submission",
    "제출 시뮬레이션",
    "提出シミュレーション"
  ],
  "切换与减损记录": [
    "Failover & mitigation records",
    "전환 및 손해 경감 기록",
    "切替・損害軽減記録"
  ],
  "客户运营 / 技术 · 是否真正恢复业务": [
    "Client operations / IT · Actual business recovery",
    "고객 운영 / 기술 · 실제 업무 복구 여부",
    "顧客運用 / 技術 · 業務の実復旧"
  ],
  "授权财务损失声明": [
    "Authorized financial loss declaration",
    "권한 있는 재무 손실 확인서",
    "権限に基づく財務損失申告"
  ],
  "客户财务 · 净损失与其他补偿": [
    "Client finance · Net loss and other recovery",
    "고객 재무팀 · 순손실 및 기타 보상",
    "顧客財務部門 · 純損失・他の補償"
  ],
  "待声明": [
    "Declaration pending",
    "확인서 대기",
    "申告待ち"
  ],
  "授权与企业收款账户": [
    "Authority & corporate bank account",
    "권한 및 법인 수취 계좌",
    "権限・法人受取口座"
  ],
  "客户提供 · 示例对公账户校验": [
    "Client supplied · Sample corporate account check",
    "고객 제공 · 샘플 법인 계좌 확인",
    "顧客提供 · サンプル法人口座確認"
  ],
  "保单及核保快照": [
    "Policy & underwriting snapshot",
    "증권 및 인수 스냅샷",
    "証券・引受スナップショット"
  ],
  "内部已有": [
    "Held internally",
    "내부 보유",
    "社内保有済み"
  ],
  "补充附件 · 本地演示": [
    "Supporting files · Local demo",
    "추가 첨부 · 로컬 데모",
    "補足添付 · ローカルデモ"
  ],
  "附件名称登记": [
    "Register file names",
    "첨부 파일명 등록",
    "添付ファイル名を登録"
  ],
  "授权财务声明人": [
    "Authorized finance signatory",
    "권한 있는 재무 신고자",
    "権限を持つ財務申告者"
  ],
  "对公收款账户（演示脱敏）": [
    "Corporate bank account (masked demo)",
    "법인 수취 계좌 (마스킹 데모)",
    "法人受取口座（デモ用マスキング）"
  ],
  "我确认已按授权声明本次承保净损失，说明可补做任务与其他补偿；后续取得同一损失补偿时将继续披露。": [
    "I am authorized to declare this covered net loss, including recoverable tasks and other compensation. I will disclose any later recovery for the same loss.",
    "권한에 따라 보장 순손실과 재처리 가능 작업, 기타 보상을 신고했음을 확인합니다. 이후 동일 손실의 추가 보상도 공개하겠습니다.",
    "権限に基づき対象純損失、再処理可能タスク、他の補償を申告し、後日同一損失の補償を得た場合も開示します。"
  ],
  "演示对公账户 · 尾号0000": [
    "Sample corporate account · Ending 0000",
    "데모 법인 계좌 · 끝자리 0000",
    "デモ法人口座 · 下4桁0000"
  ],
  "核赔工作台": [
    "Claims review workspace",
    "보상 심사",
    "支払査定"
  ],
  "导出核赔档案": [
    "Export claims file",
    "보상 심사 기록 내보내기",
    "査定記録を出力"
  ],
  "赔款计算书": [
    "Payout calculation",
    "보험금 계산서",
    "保険金計算書"
  ],
  "当前为报案前预览。客户提交事故申报后，才能完成赔款审核与模拟付款。": [
    "Pre-report preview. The client must submit the incident report before claims approval and simulated payment.",
    "신고 전 미리보기입니다. 고객 사고 신고 제출 후 보험금 심사와 모의 지급을 진행할 수 있습니다.",
    "申告前のプレビューです。顧客が事故報告を提出後、査定と模擬支払を行えます。"
  ],
  "进入客户申报": [
    "Open client report",
    "고객 신고로 이동",
    "顧客申告へ"
  ],
  "事故监测": [
    "Monitoring",
    "사고 모니터링",
    "事故監視"
  ],
  "材料与调查": [
    "Evidence & investigation",
    "자료 및 조사",
    "資料・調査"
  ],
  "责任认定": [
    "Coverage decision",
    "보장 책임 판단",
    "補償責任の判断"
  ],
  "赔款计算": [
    "Calculation",
    "보험금 계산",
    "保険金計算"
  ],
  "结案材料": [
    "Closure documents",
    "종결 자료",
    "終結資料"
  ],
  "服务中断时间": [
    "Service downtime",
    "서비스 중단 시간",
    "サービス中断時間"
  ],
  "分钟": [
    "min",
    "분",
    "分"
  ],
  "合并区间，剔除正常恢复间隔": [
    "Merge intervals; exclude healthy gaps",
    "구간 병합, 정상 복구 간격 제외",
    "区間を統合し正常稼働期間を除外"
  ],
  "可赔时间初算": [
    "Estimated eligible time",
    "보상 대상 시간 추정",
    "補償対象時間の試算"
  ],
  "声明净损失": [
    "Declared net loss",
    "신고 순손실",
    "申告純損失"
  ],
  "客户声明扣除同一损失其他补偿": [
    "Client declaration less other recovery for the same loss",
    "고객 신고에서 동일 손실의 기타 보상 차감",
    "顧客申告から同一損失の他の補償を控除"
  ],
  "本次赔款试算": [
    "Estimated payout",
    "이번 보험금 추정",
    "今回の保険金試算"
  ],
  "事故监测回放": [
    "Monitoring replay",
    "사고 모니터링 재생",
    "事故監視の再生"
  ],
  "中断判定线 50%": [
    "Outage threshold 50%",
    "중단 판정 임계치 50%",
    "中断判定閾値50%"
  ],
  "节点A": [
    "Node A",
    "노드 A",
    "ノードA"
  ],
  "节点B": [
    "Node B",
    "노드 B",
    "ノードB"
  ],
  "节点C": [
    "Node C",
    "노드 C",
    "ノードC"
  ],
  "待回放": [
    "Not replayed",
    "재생 대기",
    "再生待ち"
  ],
  "模拟监测": [
    "Simulated monitoring",
    "모의 모니터링",
    "模擬監視"
  ],
  "生成模拟监测回放": [
    "Generate monitoring replay",
    "모의 모니터링 재생 생성",
    "模擬監視データを再生"
  ],
  "证据预检": [
    "Evidence pre-check",
    "증빙 사전 점검",
    "証拠の事前チェック"
  ],
  "监测与业务时段对照": [
    "Monitoring vs. business timeline",
    "모니터링 및 업무 시간 비교",
    "監視・業務時間の照合"
  ],
  "填报中断区间": [
    "Reported outage intervals",
    "신고 중단 구간",
    "申告中断区間"
  ],
  "业务受影响区间": [
    "Business impact interval",
    "업무 영향 구간",
    "業務影響区間"
  ],
  "成功切换": [
    "Successful failover",
    "전환 성공",
    "切替成功"
  ],
  "未成功恢复业务": [
    "Business not restored",
    "업무 복구 실패",
    "業務未復旧"
  ],
  "合并事故组数": [
    "Merged occurrence groups",
    "병합 사고 그룹 수",
    "統合事故グループ数"
  ],
  "可赔区间": [
    "Eligible intervals",
    "보상 대상 구간",
    "補償対象区間"
  ],
  "三节点失败率模拟曲线": [
    "Simulated failure rates at three nodes",
    "3개 노드 실패율 모의 곡선",
    "3ノードの失敗率模擬曲線"
  ],
  "材料接收与核验": [
    "Evidence receipt & verification",
    "자료 접수 및 검증",
    "資料受付・検証"
  ],
  "已核验": [
    "Verified",
    "검증 완료",
    "検証済み"
  ],
  "调查与补件记录": [
    "Investigation & additional evidence",
    "조사 및 보완 기록",
    "調査・追加資料の記録"
  ],
  "调查意见 / 材料一致性核对": [
    "Investigation notes / Consistency checks",
    "조사 의견 / 자료 일관성 확인",
    "調査意見 / 資料整合性の確認"
  ],
  "示例调查记录：监测、业务交易和切换记录的事故时段相互吻合。待核赔人逐项复核。": [
    "Sample investigation: monitoring, transaction and failover records show consistent incident intervals. Each item awaits claims reviewer verification.",
    "예시 조사: 모니터링, 거래, 전환 기록의 사고 구간이 일치합니다. 보상 담당자가 항목별로 검증해야 합니다.",
    "調査例：監視・取引・切替記録の事故時間は一致。査定担当者による項目別確認が必要です。"
  ],
  "集中补件要求": [
    "Consolidated evidence request",
    "일괄 보완 요청",
    "一括追加資料依頼"
  ],
  "客户侧可在申报材料页继续补充；本演示不自动发送邮件。": [
    "Clients can add evidence on the report page; this demo does not send emails.",
    "고객은 신고 자료 화면에서 추가할 수 있으며 데모는 이메일을 자동 발송하지 않습니다.",
    "顧客は申告資料画面で補足できます。このデモはメールを自動送信しません。"
  ],
  "生成补件通知": [
    "Create evidence request",
    "보완 요청서 생성",
    "追加資料依頼書を作成"
  ],
  "进入责任认定": [
    "Review coverage",
    "보장 책임 판단으로 이동",
    "補償責任の判断へ"
  ],
  "客户申报摘要": [
    "Client report summary",
    "고객 신고 요약",
    "顧客申告概要"
  ],
  "事故说明": [
    "Incident description",
    "사고 설명",
    "事故説明"
  ],
  "防损减损": [
    "Mitigation",
    "손해 방지·경감",
    "損害防止・軽減"
  ],
  "恢复记录": [
    "Recovery log",
    "복구 기록",
    "復旧記録"
  ],
  "同一损失其他补偿": [
    "Other recovery for the same loss",
    "동일 손실의 기타 보상",
    "同一損失の他の補償"
  ],
  "财务依据": [
    "Financial basis",
    "재무 근거",
    "財務根拠"
  ],
  "材料来源边界": [
    "Evidence limitations",
    "자료 출처의 한계",
    "資料の証明範囲"
  ],
  "客户日志不能单独证明云服务商事故。": [
    "Client logs alone do not establish a provider outage.",
    "고객 로그만으로 제공자 사고를 입증할 수 없습니다.",
    "顧客ログのみでは提供者の障害を立証できません。"
  ],
  "服务商公告未发布不自动拒赔。": [
    "Absence of a provider notice does not automatically justify denial.",
    "제공자 공지 부재만으로 자동 면책하지 않습니다.",
    "提供者の告知がないだけで自動的に支払拒否とはしません。"
  ],
  "缺失监测时启动约定替代证据机制。": [
    "Use agreed alternative evidence when monitoring is missing.",
    "모니터링이 없으면 약정 대체 증거 절차를 적용합니다.",
    "監視記録がない場合は約定の代替証拠手順を使用します。"
  ],
  "时间一致是线索，因果关系需核实。": [
    "Matching timestamps are a clue; verify causation.",
    "시간 일치는 단서이며 인과관계는 별도 검증합니다.",
    "時刻の一致は手掛かりであり、因果関係の確認が必要です。"
  ],
  "财务汇总可抽查，异常再定向调查。": [
    "Sample-check financial summaries; investigate anomalies further.",
    "재무 요약을 표본 점검하고 이상 항목을 추가 조사합니다.",
    "財務集計は抽出確認し、異常を重点調査します。"
  ],
  "保险责任认定": [
    "Coverage determination",
    "보험 책임 판단",
    "保険責任の判断"
  ],
  "本案责任分类": [
    "Claim classification",
    "본 건 책임 분류",
    "本件の責任分類"
  ],
  "M1 · 普通数字服务中断": [
    "M1 · Operational outage",
    "M1 · 일반 디지털 중단",
    "M1 · 通常のデジタル中断"
  ],
  "M2 · 第三国物理冲突外溢": [
    "M2 · Physical conflict spillover",
    "M2 · 제3국 물리적 분쟁 파급",
    "M2 · 第三国への物理的紛争波及"
  ],
  "责任归类尚待调查": [
    "Classification under investigation",
    "책임 분류 조사 중",
    "責任分類を調査中"
  ],
  "拟不予赔付 · 需说明依据": [
    "Proposed denial · Reasons required",
    "지급 거절 의견 · 근거 필요",
    "不払案 · 根拠が必要"
  ],
  "受影响设施所在国": [
    "Country of affected facility",
    "피해 시설 소재국",
    "被災施設の所在国"
  ],
  "M1认定重点": [
    "M1 review focus",
    "M1 판단 기준",
    "M1判断の要点"
  ],
  "云服务故障与承保业务受损相对应；检查适用原因及除外事实。纯网络事件不自动归入M2。": [
    "Link the service failure to covered business impact; check causes and exclusions. Cyber-only events do not automatically qualify for M2.",
    "서비스 장애와 보장 업무 손실의 대응 관계, 원인 및 면책 사실을 확인합니다. 순수 사이버 사건은 M2에 자동 포함되지 않습니다.",
    "サービス障害と対象業務損害の対応、原因と免責事実を確認。純粋なサイバー事象はM2に自動適用されません。"
  ],
  "M2认定重点": [
    "M2 review focus",
    "M2 판단 기준",
    "M2判断の要点"
  ],
  "约定物理事件影响非直接交战国设施；供电、网络、服务中断与业务损失具有完整因果链。": [
    "A specified physical event must affect a facility in a country not directly at war, with a complete causal chain through power, network, service and business loss.",
    "약정 물리적 사건이 비직접교전국 시설에 영향을 주고 전력·네트워크·서비스 중단·업무 손실 간 완전한 인과관계가 있어야 합니다.",
    "約定物理事象が非直接交戦国施設に影響し、電力・通信・サービス中断・業務損害に完全な因果関係が必要です。"
  ],
  "责任依据、调查结论与待核实事项": [
    "Coverage basis, findings & open questions",
    "책임 근거, 조사 결론 및 확인 사항",
    "責任根拠・調査結論・要確認事項"
  ],
  "演示调查意见：模拟网络配置故障按M1审查，列明服务与业务影响相对应；须核查原始材料及具体除外事实后确认责任。": [
    "Sample opinion: assess the network misconfiguration under M1. The listed service matches the business impact; verify original evidence and specific exclusions before confirming coverage.",
    "예시 의견: 네트워크 설정 오류를 M1으로 검토합니다. 명시 서비스와 업무 영향이 대응하며 원본 자료 및 면책 사실 확인 후 책임을 확정합니다.",
    "意見例：ネットワーク設定障害をM1で審査。対象サービスと業務影響は対応し、原資料と具体的免責事実を確認して責任を判断します。"
  ],
  "我作为演示核赔人，已复核本案责任事实、适用条款和争议部分；不以系统初算代替责任决定。": [
    "As the demo claims reviewer, I have reviewed the facts, applicable terms and disputed items. The estimate does not replace my coverage decision.",
    "데모 보상 담당자로서 책임 사실, 약관, 쟁점 사항을 검토했습니다. 시스템 추정액으로 책임 판단을 대신하지 않습니다.",
    "デモ査定担当として責任事実、適用条項、争点を確認しました。システム試算を責任判断の代わりにしません。"
  ],
  "生成赔款计算书": [
    "Generate payout calculation",
    "보험금 계산서 생성",
    "保険金計算書を作成"
  ],
  "责任证据链": [
    "Causal evidence chain",
    "책임 증거 사슬",
    "責任の証拠連鎖"
  ],
  "事故原因": [
    "Incident cause",
    "사고 원인",
    "事故原因"
  ],
  "约定服务故障或网络异常": [
    "Specified service or network failure",
    "약정 서비스 장애 또는 네트워크 이상",
    "約定のサービス障害・ネットワーク異常"
  ],
  "技术中断": [
    "Technical outage",
    "기술적 중단",
    "技術的中断"
  ],
  "列明服务、区域、端点及监测阈值": [
    "Listed service, region, endpoint and thresholds",
    "명시 서비스, 리전, 엔드포인트, 모니터링 임계치",
    "対象サービス・リージョン・エンドポイント・監視閾値"
  ],
  "业务影响": [
    "Business impact",
    "업무 영향",
    "業務影響"
  ],
  "关键交易失败、切换及业务恢复": [
    "Failed transactions, failover and business recovery",
    "핵심 거래 실패, 전환 및 업무 복구",
    "重要取引の失敗・切替・業務復旧"
  ],
  "财务损失": [
    "Financial loss",
    "재무 손실",
    "財務損失"
  ],
  "不可挽回业务与授权净损失声明": [
    "Irrecoverable work and authorized net-loss declaration",
    "회복 불가 업무 및 권한 있는 순손실 신고",
    "回復不能業務と権限に基づく純損失申告"
  ],
  "除外与争议审查": [
    "Exclusions & disputes",
    "면책 및 쟁점 검토",
    "免責・争点の審査"
  ],
  "客户自身配置、额度或账户问题应区分。": [
    "Distinguish client configuration, quota and account issues.",
    "고객 자체 설정, 한도, 계정 문제를 구분합니다.",
    "顧客自身の設定・利用枠・アカウント問題を区別します。"
  ],
  "战争、制裁及行政停服按条款审查。": [
    "Review war, sanctions and administrative suspension under the terms.",
    "전쟁, 제재, 행정적 서비스 중지는 약관에 따라 심사합니다.",
    "戦争・制裁・行政的停止を約款に従い審査します。"
  ],
  "M2特别扩展与一般除外须衔接。": [
    "Reconcile the M2 extension with general exclusions.",
    "M2 특별 확장과 일반 면책의 관계를 확인합니다.",
    "M2特約と一般免責の整合性を確認します。"
  ],
  "有明确承保部分时，争议部分另行调查。": [
    "Investigate disputed portions separately when coverage is clear for other parts.",
    "명확한 보장 부분이 있으면 쟁점 부분을 별도 조사합니다.",
    "明確な補償部分がある場合、争点部分を別途調査します。"
  ],
  "同一损失、同一业务时段不重复赔付。": [
    "No duplicate payment for the same loss and business interval.",
    "동일 손실 및 동일 업무 시간에 중복 지급하지 않습니다.",
    "同一損失・同一業務時間帯の重複支払は行いません。"
  ],
  "美国": [
    "United States",
    "미국",
    "米国"
  ],
  "调查阶段初算": [
    "Preliminary estimate",
    "조사 단계 추정",
    "調査段階の試算"
  ],
  "列明服务 / 区域": [
    "Listed service / Region",
    "명시 서비스 / 리전",
    "対象サービス / リージョン"
  ],
  "计算项目": [
    "Calculation item",
    "계산 항목",
    "計算項目"
  ],
  "口径": [
    "Basis",
    "기준",
    "基準"
  ],
  "结果": [
    "Result",
    "결과",
    "結果"
  ],
  "实际服务中断": [
    "Actual service downtime",
    "실제 서비스 중단",
    "実サービス中断"
  ],
  "区间去重，剔除中间正常运行": [
    "Deduplicate intervals; exclude normal operation",
    "구간 중복 제거, 정상 구간 제외",
    "区間重複を排除し正常稼働を除外"
  ],
  "等待期": [
    "Waiting period",
    "대기 기간",
    "待機期間"
  ],
  "每个合并事故累计扣一次": [
    "Deduct once per merged occurrence",
    "통합 사고별 한 번 차감",
    "統合事故ごとに一度控除"
  ],
  "可赔时间": [
    "Eligible duration",
    "보상 대상 시간",
    "補償対象時間"
  ],
  "扣等待期 × 营业时间 × 业务影响；成功切换截断": [
    "Waiting period deducted; intersect business hours and impact, ending at successful failover",
    "대기 기간 차감 후 영업시간·업무 영향 교집합, 전환 성공 시 종료",
    "待機期間控除後、営業時間と業務影響の重複分。切替成功で終了"
  ],
  "保单快照，核赔不重新议价": [
    "Policy snapshot; no repricing during claims review",
    "증권 스냅샷 적용, 보상 심사 시 재가격 산정 없음",
    "証券スナップショットを適用し査定時に再交渉しない"
  ],
  "参数计算金额": [
    "Parametric amount",
    "파라메트릭 계산액",
    "パラメトリック計算額"
  ],
  "净损失封顶": [
    "Net-loss cap",
    "순손실 상한",
    "純損失上限"
  ],
  "服务 / 共同事故限额": [
    "Service / Shared occurrence limit",
    "서비스 / 공통 사고 한도",
    "サービス / 共通事故限度額"
  ],
  "同因事故共同约束": [
    "Shared limit for a common cause",
    "동일 원인 사고 공통 적용",
    "同一原因事故に共通適用"
  ],
  "模块年度剩余": [
    "Remaining module annual limit",
    "모듈 연간 잔여 한도",
    "モジュール年間残額"
  ],
  "M1 / M2，支付前": [
    "M1 / M2, before payment",
    "M1 / M2, 지급 전",
    "M1 / M2、支払前"
  ],
  "总年度剩余": [
    "Remaining annual total",
    "연간 총 잔여 한도",
    "年間総残額"
  ],
  "支付前额度": [
    "Available before payment",
    "지급 전 잔여액",
    "支払前の残額"
  ],
  "本次试算赔款": [
    "Estimated payout",
    "이번 추정 보험금",
    "今回の試算保険金"
  ],
  "逐项取限，金额最终四舍五入到分": [
    "Apply each cap; round the final amount to cents",
    "각 한도를 적용하고 최종 금액을 소수 둘째 자리로 반올림",
    "各上限を適用し最終金額を小数第2位に丸める"
  ],
  "核赔意见": [
    "Claims review opinion",
    "보상 심사 의견",
    "査定意見"
  ],
  "同一损失不重复赔付；收到同损失补偿后须复核调整。": [
    "No duplicate recovery. Reassess if other compensation for the same loss is received.",
    "동일 손실 중복 보상은 불가하며 추가 보상 수령 시 재검토합니다.",
    "同一損失の重複補償は不可。他の補償を受領した場合は再確認・調整します。"
  ],
  "核赔复核：待复核": [
    "Claims review: pending",
    "보상 검토: 대기",
    "査定確認：確認待ち"
  ],
  "时间：—": [
    "Time: —",
    "시간: —",
    "時刻：—"
  ],
  "客户确认：待确认": [
    "Client confirmation: pending",
    "고객 확인: 대기",
    "顧客確認：確認待ち"
  ],
  "付款：未支付": [
    "Payment: unpaid",
    "지급: 미지급",
    "支払：未払"
  ],
  "下载计算书HTML": [
    "Download calculation HTML",
    "계산서 HTML 다운로드",
    "計算書HTMLを保存"
  ],
  "下载计算明细CSV": [
    "Download breakdown CSV",
    "계산 명세 CSV 다운로드",
    "計算明細CSVを保存"
  ],
  "复核并核定赔款": [
    "Review & approve payout",
    "검토 후 보험금 확정",
    "確認して保険金を確定"
  ],
  "双模块对照": [
    "Module comparison",
    "두 모듈 비교",
    "モジュール比較"
  ],
  "普通中断": [
    "Operational outage",
    "일반 중단",
    "通常の中断"
  ],
  "若认定符合M1": [
    "If covered under M1",
    "M1 인정 시",
    "M1対象と認定した場合"
  ],
  "本次选定模块": [
    "Selected module",
    "이번 선택 모듈",
    "今回の選択モジュール"
  ],
  "物理外溢": [
    "Physical spillover",
    "물리적 파급",
    "物理的波及"
  ],
  "若认定符合M2": [
    "If covered under M2",
    "M2 인정 시",
    "M2対象と認定した場合"
  ],
  "仅比较，不计入本次赔款": [
    "Comparison only; excluded from this payout",
    "비교용이며 이번 지급액에 포함하지 않음",
    "比較のみ。今回の支払には算入しない"
  ],
  "付款前检查": [
    "Pre-payment checks",
    "지급 전 점검",
    "支払前チェック"
  ],
  "客户尚未提交事故申报": [
    "Client has not submitted the report",
    "고객 사고 신고 미제출",
    "顧客の事故報告が未提出"
  ],
  "尚未确认授权财务损失声明": [
    "Authorized financial loss declaration not confirmed",
    "권한 있는 재무 손실 확인 미완료",
    "権限に基づく損失申告が未確認"
  ],
  "核赔人尚未确认责任事实": [
    "Claims reviewer has not confirmed coverage facts",
    "보상 담당자의 책임 사실 확인 미완료",
    "査定担当者の責任事実確認が未完了"
  ],
  "补充核赔调查": [
    "Continue investigation",
    "보상 조사 보완",
    "査定調査を補足"
  ],
  "可赔时段明细": [
    "Eligible interval details",
    "보상 대상 구간 명세",
    "補償対象時間の明細"
  ],
  "赔案结案与支付": [
    "Settlement & payment",
    "보험금 종결 및 지급",
    "保険金の終結・支払"
  ],
  "待提交": [
    "Awaiting submission",
    "제출 대기",
    "提出待ち"
  ],
  "客户事故申报": [
    "Client incident report",
    "고객 사고 신고",
    "顧客事故報告"
  ],
  "待完成": [
    "Pending",
    "완료 대기",
    "未完了"
  ],
  "待核定": [
    "Awaiting assessment",
    "확정 대기",
    "確定待ち"
  ],
  "待客户确认": [
    "Awaiting client confirmation",
    "고객 확인 대기",
    "顧客確認待ち"
  ],
  "客户确认赔款及收款账户": [
    "Client confirms payout & account",
    "고객 보험금 및 수취 계좌 확인",
    "顧客が保険金・受取口座を確認"
  ],
  "待支付": [
    "Awaiting payment",
    "지급 대기",
    "支払待ち"
  ],
  "模拟支付与额度入账": [
    "Simulated payment & limit posting",
    "모의 지급 및 한도 반영",
    "模擬支払・限度額への計上"
  ],
  "本案核定 / 试算金额": [
    "Approved / estimated amount",
    "본 건 확정 / 추정 금액",
    "本件の確定・試算金額"
  ],
  "先完成赔款审核": [
    "Complete payout review first",
    "보험금 심사를 먼저 완료",
    "先に支払審査を完了"
  ],
  "结案档案清单": [
    "Closure file checklist",
    "종결 기록 목록",
    "終結書類一覧"
  ],
  "客户事故报告与损失声明": [
    "Client incident report & loss declaration",
    "고객 사고 보고서 및 손실 확인서",
    "顧客事故報告書・損失申告"
  ],
  "下载": [
    "Download",
    "다운로드",
    "保存"
  ],
  "结案报告与支付演示凭证": [
    "Closure report & sample payment receipt",
    "종결 보고서 및 모의 지급 증빙",
    "終結報告書・模擬支払証明"
  ],
  "材料索引、操作轨迹及快照": [
    "Evidence index, audit trail & snapshots",
    "자료 색인, 처리 이력 및 스냅샷",
    "資料索引・操作履歴・スナップショット"
  ],
  "导出JSON": [
    "Export JSON",
    "JSON 내보내기",
    "JSONを出力"
  ],
  "年度额度台账": [
    "Annual limit ledger",
    "연간 한도 원장",
    "年間限度額台帳"
  ],
  "M1年度剩余": [
    "M1 annual remaining",
    "M1 연간 잔여액",
    "M1 年間残額"
  ],
  "M2年度剩余": [
    "M2 annual remaining",
    "M2 연간 잔여액",
    "M2 年間残額"
  ],
  "保单年度总剩余": [
    "Total annual remaining",
    "연간 총 잔여액",
    "年間総残額"
  ],
  "本次支付归属": [
    "Payment allocation",
    "이번 지급 귀속",
    "今回の支払帰属"
  ],
  "后续独立事故限额": [
    "Limit for later independent events",
    "이후 독립 사고 한도",
    "後続の独立事故の限度額"
  ],
  "案件操作轨迹": [
    "Claim activity history",
    "사건 처리 이력",
    "案件操作履歴"
  ],
  "演示处理时效": [
    "Illustrative service timelines",
    "데모 처리 기한",
    "デモ処理期間"
  ],
  "确认收到报案": [
    "Acknowledge incident report",
    "사고 접수 확인",
    "事故受付を確認"
  ],
  "集中提出补件": [
    "Consolidated evidence request",
    "일괄 보완 요청",
    "追加資料を一括依頼"
  ],
  "普通案件资料齐备后核定": [
    "Assess ordinary claims after complete evidence",
    "일반 사건 자료 완비 후 확정",
    "通常案件の資料完備後に査定"
  ],
  "达成赔偿协议后付款": [
    "Pay after settlement agreement",
    "보상 합의 후 지급",
    "支払合意後に送金"
  ],
  "定价模型与版本": [
    "Pricing model & versions",
    "요율 모델 및 버전",
    "料率モデル・バージョン"
  ],
  "导出模型参数": [
    "Export model parameters",
    "모델 매개변수 내보내기",
    "モデル設定を出力"
  ],
  "模拟审批并生效": [
    "Approve & activate (demo)",
    "모의 승인 및 적용",
    "模擬承認・適用"
  ],
  "演示模型": [
    "Demo model",
    "데모 모델",
    "デモモデル"
  ],
  "模型参数": [
    "Parameters",
    "매개변수",
    "パラメータ"
  ],
  "地区概率": [
    "Regional probabilities",
    "지역별 확률",
    "地域別確率"
  ],
  "敏感性试算": [
    "Sensitivity",
    "민감도 분석",
    "感応度分析"
  ],
  "版本与审批": [
    "Versions & approvals",
    "버전 및 승인",
    "バージョン・承認"
  ],
  "演示模型参数": [
    "Demo model parameters",
    "데모 모델 매개변수",
    "デモモデル設定"
  ],
  "M1示例事故总中断时长": [
    "M1 sample total downtime",
    "M1 예시 총중단 시간",
    "M1 サンプル総中断時間"
  ],
  "小时": [
    "hours",
    "시간",
    "時間"
  ],
  "M2示例事故总中断时长": [
    "M2 sample total downtime",
    "M2 예시 총중단 시간",
    "M2 サンプル総中断時間"
  ],
  "事件影响承保业务的系数": [
    "Covered business impact factor",
    "보장 업무 영향 계수",
    "対象業務への影響係数"
  ],
  "风险附加": [
    "Risk loading",
    "위험 할증",
    "リスク割増"
  ],
  "费用率": [
    "Expense ratio",
    "사업비율",
    "事業費率"
  ],
  "M2相关性附加": [
    "M2 correlation loading",
    "M2 상관성 할증",
    "M2 相関割増"
  ],
  "示例损失 = min[小时金额 × min(可赔上限, 示例时长 − 等待期), 服务限额, 事故限额]": [
    "Sample loss = min[hourly amount × min(duration cap, sample duration − waiting period), service limit, occurrence limit]",
    "예시 손실 = min[시간당 금액 × min(보상 시간 상한, 예시 시간 − 대기 기간), 서비스 한도, 사고 한도]",
    "サンプル損失 = min[時間当たり金額 × min(補償時間上限, サンプル時間 − 待機期間), サービス限度, 事故限度]"
  ],
  "毛保费 = 双模块期望损失 × (1 + 风险附加) ÷ (1 − 费用率)": [
    "Gross premium = expected loss across both modules × (1 + risk loading) ÷ (1 − expense ratio)",
    "영업보험료 = 두 모듈 기대 손실 × (1 + 위험 할증) ÷ (1 − 사업비율)",
    "営業保険料 = 両モジュール期待損失 × (1 + リスク割増) ÷ (1 − 事業費率)"
  ],
  "查看演示系数": [
    "View demo factors",
    "데모 계수 보기",
    "デモ係数を表示"
  ],
  "厂商演示系数：Azure 1.00、AWS 0.95、Google Cloud 1.02、Cloudflare 1.08、其他1.15。备用已演练0.72、未演练0.90、无替代1.00。均为教学假设。": [
    "Illustrative provider factors: Azure 1.00, AWS 0.95, Google Cloud 1.02, Cloudflare 1.08, other 1.15. Backup: tested 0.72, untested 0.90, unavailable 1.00. Educational assumptions only.",
    "제공자 예시 계수: Azure 1.00, AWS 0.95, Google Cloud 1.02, Cloudflare 1.08, 기타 1.15. 백업: 훈련 완료 0.72, 미훈련 0.90, 대체 없음 1.00. 모두 교육용 가정입니다.",
    "提供者のデモ係数：Azure 1.00、AWS 0.95、Google Cloud 1.02、Cloudflare 1.08、その他1.15。バックアップ：訓練済0.72、未訓練0.90、代替なし1.00。すべて教育用の仮定です。"
  ],
  "还原未生效参数": [
    "Reset draft parameters",
    "미적용 매개변수 복원",
    "未適用設定を元に戻す"
  ],
  "当前投保单敏感性": [
    "Application sensitivity",
    "현재 청약 민감도",
    "現在の申込の感応度"
  ],
  "草稿参数年毛保费": [
    "Draft annual gross premium",
    "초안 연간 영업보험료",
    "下書きの年間営業保険料"
  ],
  "与当前版本差额": [
    "Change vs. active version",
    "현재 버전 대비 차이",
    "現行版との差額"
  ],
  "草稿M1 / M2保费": [
    "Draft M1 / M2 premium",
    "초안 M1 / M2 보험료",
    "下書きM1 / M2保険料"
  ],
  "当前生效模型": [
    "Active model",
    "현재 적용 모델",
    "適用中のモデル"
  ],
  "客户已确认保单": [
    "Client-confirmed policy",
    "고객 확정 증권",
    "顧客確定済み契約"
  ],
  "地区年度事件概率": [
    "Regional annual event probabilities",
    "지역별 연간 사건 확률",
    "地域別年間事象確率"
  ],
  "区域": [
    "Region",
    "지역",
    "地域"
  ],
  "M1概率（%）": [
    "M1 probability (%)",
    "M1 확률 (%)",
    "M1 確率（%）"
  ],
  "M2概率（%）": [
    "M2 probability (%)",
    "M2 확률 (%)",
    "M2 確率（%）"
  ],
  "生效后同步风险地图与未出单业务的报价；已确认保单不受影响。": [
    "Activation updates risk maps and unissued quotes. Confirmed policies remain unchanged.",
    "적용 시 위험 지도와 미발급 청약의 견적을 갱신합니다. 확정 증권은 유지됩니다.",
    "適用後、リスクマップと未発行契約の見積を更新。確定済み契約は維持します。"
  ],
  "敏感性情景对比": [
    "Sensitivity scenarios",
    "민감도 시나리오 비교",
    "感応度シナリオ比較"
  ],
  "情景": [
    "Scenario",
    "시나리오",
    "シナリオ"
  ],
  "相对草稿": [
    "Change vs. draft",
    "초안 대비",
    "下書き比"
  ],
  "当前草稿": [
    "Current draft",
    "현재 초안",
    "現在の下書き"
  ],
  "M1时长增加50%": [
    "M1 duration +50%",
    "M1 시간 +50%",
    "M1 時間 +50%"
  ],
  "M2时长增加50%": [
    "M2 duration +50%",
    "M2 시간 +50%",
    "M2 時間 +50%"
  ],
  "所有备用完成演练": [
    "All backups tested",
    "모든 백업 훈련 완료",
    "全バックアップ訓練済み"
  ],
  "不可挽回比例下降20%": [
    "Irrecoverable share −20%",
    "회복 불가 비율 −20%",
    "回復不能割合 −20%"
  ],
  "模型版本与模拟审批": [
    "Model versions & approvals",
    "모델 버전 및 모의 승인",
    "モデルバージョン・模擬承認"
  ],
  "模拟审批当前草稿": [
    "Approve current draft (demo)",
    "현재 초안 모의 승인",
    "現在の下書きを模擬承認"
  ],
  "服务": [
    "Service",
    "서비스",
    "サービス"
  ],
  "报价口径": [
    "Quote basis",
    "견적 기준",
    "見積基準"
  ],
  "标准保障": [
    "Standard terms",
    "표준 보장",
    "標準補償"
  ],
  "当前投保条件": [
    "Current application terms",
    "현재 청약 조건",
    "現在の申込条件"
  ],
  "服务恢复配置": [
    "Recovery configuration",
    "서비스 복구 구성",
    "サービス復旧構成"
  ],
  "区域内冗余": [
    "Regional redundancy",
    "리전 내 이중화",
    "リージョン内冗長化"
  ],
  "独立路径冗余": [
    "Independent-path redundancy",
    "독립 경로 이중화",
    "独立経路の冗長化"
  ],
  "共同上游依赖": [
    "Shared upstream dependency",
    "공통 상위 의존성",
    "共通上流依存"
  ],
  "比较七个区域 ↗": [
    "Compare 7 regions ↗",
    "7개 지역 비교 ↗",
    "7地域を比較 ↗"
  ],
  "危险性": [
    "Hazard",
    "위험 요인",
    "ハザード"
  ],
  "事件与外溢范围": [
    "Events & spillover footprint",
    "사건 및 파급 범위",
    "事象・波及範囲"
  ],
  "风险暴露": [
    "Exposure",
    "위험 노출",
    "エクスポージャー"
  ],
  "服务与上游依赖": [
    "Services & upstream dependencies",
    "서비스 및 상위 의존성",
    "サービス・上流依存"
  ],
  "中断与恢复": [
    "Outage & recovery",
    "중단 및 복구",
    "中断・復旧"
  ],
  "不可用时长与冗余": [
    "Downtime & redundancy",
    "중단 시간 및 이중화",
    "中断時間・冗長性"
  ],
  "07 个区域 · 影响范围示意": [
    "07 regions · Indicative footprint",
    "07개 지역 · 영향 범위 예시",
    "07地域 · 影響範囲の概略"
  ],
  "Natural Earth · 区域代表位置": [
    "Natural Earth · Representative locations",
    "Natural Earth · 대표 위치",
    "Natural Earth · 代表地点"
  ],
  "% / 年": [
    "% / year",
    "% / 년",
    "% / 年"
  ],
  "至少一次约定源事件": [
    "At least one specified source event",
    "약정 원인 사건 1회 이상",
    "約定の起因事象が1回以上発生"
  ],
  "供电设施受损": [
    "Power infrastructure damage",
    "전력 시설 손상",
    "電力施設の損傷"
  ],
  "通信设施受损": [
    "Communications infrastructure damage",
    "통신 시설 손상",
    "通信施設の損傷"
  ],
  "云设施受损": [
    "Cloud facility damage",
    "클라우드 시설 손상",
    "クラウド施設の損傷"
  ],
  "事件构成 · 区域内供电与跨区通信依赖": [
    "Event mix · Regional power and cross-region communications",
    "사건 구성 · 지역 전력 및 리전 간 통신 의존성",
    "事象構成 · 地域電力・地域間通信への依存"
  ],
  "年度参数触发概率": [
    "Annual trigger probability",
    "연간 지급 조건 충족 확률",
    "年間トリガー確率"
  ],
  "触发后平均可赔时长": [
    "Mean eligible time after trigger",
    "조건 충족 후 평균 보상 시간",
    "トリガー後の平均補償時間"
  ],
  "P90 中断对应赔款": [
    "Payout at P90 downtime",
    "P90 중단 시간의 보험금",
    "P90中断時間の保険金"
  ],
  "标准保障 · M2参考年保费": [
    "Standard terms · M2 annual estimate",
    "표준 보장 · M2 연간 참고 보험료",
    "標準補償 · M2年間参考保険料"
  ],
  "统一保障条件比较": [
    "Comparison on common terms",
    "동일 보장 조건 비교",
    "共通補償条件による比較"
  ],
  "保障参数与计算依据": [
    "Coverage & calculation basis",
    "보장 매개변수 및 계산 근거",
    "補償設定・計算根拠"
  ],
  "约定金额": [
    "Agreed amount",
    "약정 금액",
    "約定額"
  ],
  "等待期 / 最长赔付": [
    "Waiting / Maximum payout duration",
    "대기 기간 / 최대 지급 시간",
    "待機期間 / 最大支払時間"
  ],
  "事故 / 年度限额": [
    "Occurrence / Annual limit",
    "사고당 / 연간 한도",
    "事故 / 年間限度額"
  ],
  "预计年度赔款": [
    "Expected annual payout",
    "예상 연간 보험금",
    "年間期待支払額"
  ],
  "触发口径": [
    "Trigger definition",
    "지급 조건 기준",
    "トリガー基準"
  ],
  "列明服务不可用 · 全天": [
    "Listed service unavailable · 24/7",
    "명시 서비스 이용 불가 · 24시간",
    "対象サービスが利用不可 · 24時間"
  ],
  "按三类事件与三档时长计算参数赔款，扣除等待期并应用事故及年度限额。年保费＝预计年度赔款 ×（1＋风险附加）÷（1－费用率）。客户业务备用不改变原服务中断指标。": [
    "Calculate parametric payouts across three event types and three durations. Deduct the waiting period and apply occurrence and annual limits. Annual premium = expected annual payout × (1 + risk loading) ÷ (1 − expense ratio). Client backups do not alter the original service outage metric.",
    "사건 3종과 시간 3구간으로 파라메트릭 지급액을 산출하고 대기 기간과 사고·연간 한도를 적용합니다. 연간 보험료 = 예상 연간 지급액 × (1 + 위험 할증) ÷ (1 − 사업비율). 고객 백업은 원 서비스 중단 지표를 바꾸지 않습니다.",
    "3事象・3時間帯でパラメトリック支払を計算し、待機期間と事故・年間限度を適用。年間保険料＝年間期待支払額×(1＋リスク割増)÷(1−事業費率)。顧客の代替策は原サービス中断指標を変えません。"
  ],
  "区域概率、依赖关系和恢复配置为本版情景假设；参考价单独试算，投保单报价与保单仍使用原模型。当前条件读取已确认保单快照；营业日历不用于此处的全天服务指标。": [
    "Regional probabilities, dependencies and recovery configurations are scenario assumptions. Reference pricing is separate; application quotes and policies use the original model. Current terms use the confirmed policy snapshot. The business calendar is not applied to this 24/7 service metric.",
    "지역 확률, 의존성, 복구 구성은 시나리오 가정입니다. 참고 견적은 별도 계산하며 청약·증권은 기존 모델을 사용합니다. 현재 조건은 확정 증권 스냅샷을 읽습니다. 이 24시간 서비스 지표에는 영업 달력을 적용하지 않습니다.",
    "地域確率・依存・復旧構成はシナリオ上の仮定。参考価格は別計算で、申込見積と証券は元のモデルを使用します。現在条件は確定証券のスナップショットを使用。本24時間指標に営業カレンダーは適用しません。"
  ],
  "投保单报价 · 原模型": [
    "Application quote · Original model",
    "청약 견적 · 기존 모델",
    "申込見積 · 元のモデル"
  ],
  "M2分析服务": [
    "M2 service to analyze",
    "M2 분석 서비스",
    "M2分析サービス"
  ],
  "M2报价口径": [
    "M2 quote basis",
    "M2 견적 기준",
    "M2見積基準"
  ],
  "M2服务恢复配置": [
    "M2 recovery configuration",
    "M2 서비스 복구 구성",
    "M2サービス復旧構成"
  ],
  "M2风险图层": [
    "M2 risk layers",
    "M2 위험 계층",
    "M2リスク層"
  ],
  "所选区域图层详情": [
    "Selected region details",
    "선택 지역 계층 상세",
    "選択地域の詳細"
  ],
  "选择比较区域": [
    "Choose a comparison region",
    "비교 지역 선택",
    "比較地域を選択"
  ],
  "07 个区域 · 依赖连接示意": [
    "07 regions · Dependency connections",
    "07개 지역 · 의존성 연결",
    "07地域 · 依存関係の接続"
  ],
  "跨境通信": [
    "Cross-border communications",
    "국경 간 통신",
    "国境間通信"
  ],
  "区域供电": [
    "Regional power",
    "지역 전력",
    "地域電力"
  ],
  "云设施": [
    "Cloud facility",
    "클라우드 시설",
    "クラウド施設"
  ],
  "源事件发生后的服务受影响概率": [
    "Service impact probability given a source event",
    "원인 사건 발생 시 서비스 영향 확률",
    "起因事象発生時のサービス影響確率"
  ],
  "供电路径 · 条件概率": [
    "Power path · Conditional probability",
    "전력 경로 · 조건부 확률",
    "電力経路 · 条件付き確率"
  ],
  "通信路径 · 条件概率": [
    "Network path · Conditional probability",
    "통신 경로 · 조건부 확률",
    "通信経路 · 条件付き確率"
  ],
  "云设施路径 · 条件概率": [
    "Cloud facility path · Conditional probability",
    "클라우드 시설 경로 · 조건부 확률",
    "クラウド施設経路 · 条件付き確率"
  ],
  "连接按区域情景假设": [
    "Connections follow regional scenario assumptions",
    "지역 시나리오 가정에 따른 연결",
    "地域シナリオの仮定に基づく接続"
  ],
  "07 个区域 · 服务恢复情景": [
    "07 regions · Recovery scenarios",
    "07개 지역 · 복구 시나리오",
    "07地域 · 復旧シナリオ"
  ],
  "服务受影响后的平均中断": [
    "Mean downtime given service impact",
    "서비스 영향 시 평균 중단 시간",
    "サービス影響時の平均中断時間"
  ],
  "短时情景 · 55%": [
    "Short · 55%",
    "단기 · 55%",
    "短期 · 55%"
  ],
  "持续情景 · 30%": [
    "Sustained · 30%",
    "지속 · 30%",
    "継続 · 30%"
  ],
  "长时情景 · 15%": [
    "Prolonged · 15%",
    "장기 · 15%",
    "長期 · 15%"
  ],
  "M2 区域参考报价": [
    "M2 regional reference quotes",
    "M2 지역 참고 견적",
    "M2地域別参考見積"
  ],
  "触发概率": [
    "Trigger probability",
    "지급 조건 충족 확률",
    "トリガー確率"
  ],
  "平均中断": [
    "Mean downtime",
    "평균 중단 시간",
    "平均中断時間"
  ],
  "预计年赔款": [
    "Expected annual payout",
    "예상 연간 보험금",
    "年間期待支払額"
  ],
  "参考年保费": [
    "Reference annual premium",
    "참고 연간 보험료",
    "参考年間保険料"
  ],
  "关闭": [
    "Close",
    "닫기",
    "閉じる"
  ],
  "M2 地图口径": [
    "M2 map methodology",
    "M2 지도 기준",
    "M2マップの算定基準"
  ],
  "三层分别展示源事件年概率、事件发生后的服务受影响概率、受影响后的中断与恢复。源事件概率不是赔付触发概率。": [
    "The three layers show annual source-event probability, conditional service impact, and outage and recovery after impact. Source-event probability is not payout-trigger probability.",
    "3개 계층은 원인 사건의 연간 확률, 사건 발생 시 서비스 영향 확률, 영향 후 중단·복구를 나타냅니다. 원인 사건 확률은 지급 조건 충족 확률과 다릅니다.",
    "3層は起因事象の年間確率、発生時の条件付きサービス影響、中断・復旧を表示します。起因事象確率は支払トリガー確率ではありません。"
  ],
  "M2-SCENARIO-1.0 使用三类互斥源事件与三档时长假设；源事件按泊松过程计数，服务受影响按条件概率筛选。参数赔款按不可用时长扣除等待期，应用事故限额，并对全年多次事件累计应用年度限额。P90是服务受影响后的中断时长分位数。": [
    "M2-SCENARIO-1.0 uses three mutually exclusive event types and three durations. Events follow a Poisson process; service impact uses conditional probabilities. Payouts deduct the waiting period, apply the occurrence limit and cap the sum of annual events. P90 is the conditional downtime quantile.",
    "M2-SCENARIO-1.0은 상호 배타적인 3개 사건과 3개 시간 가정을 사용합니다. 사건 수는 포아송 과정, 서비스 영향은 조건부 확률로 계산합니다. 대기 기간을 차감하고 사고 한도 및 연간 누적 한도를 적용합니다. P90은 서비스 영향 후 중단 시간의 분위수입니다.",
    "M2-SCENARIO-1.0は排他的な3事象・3時間を仮定。事象数はポアソン過程、サービス影響は条件付き確率です。待機期間を控除し事故限度と年間累積限度を適用。P90はサービス影響後の中断時間の分位点です。"
  ],
  "所有区域概率、连接与恢复配置均为演示假设，不代表实时地缘态势或已验证的厂商架构。服务商名称来自投保单；同类服务使用相同情景系数，不对厂商作可靠性排名。图中连线只表示依赖关系。": [
    "All regional probabilities, connections and recovery configurations are demo assumptions, not real-time geopolitical conditions or verified provider architecture. Provider names come from the application; the same scenario factors apply within each service type. Lines show dependencies only.",
    "지역 확률, 연결, 복구 구성은 데모 가정이며 실시간 지정학 정보나 검증된 제공자 구조가 아닙니다. 제공자명은 청약서에서 가져오며 동일 서비스 유형에 같은 계수를 적용합니다. 연결선은 의존성만 표시합니다.",
    "地域確率・接続・復旧構成はデモ仮定で、実時間の地政学状況や検証済み構成ではありません。提供者名は申込から取得し、同種サービスには同じ係数を適用。線は依存関係のみを示します。"
  ],
  "综合风险按统一条件下的年均可赔小时分档：低于0.05小时为较低，0.05至不足0.2小时为中等，其余为较高。各图层颜色分别对应其图例。客户小时金额不改变风险等级。": [
    "Overall risk uses annual mean eligible hours on standard terms: low below 0.05, medium from 0.05 to below 0.2, otherwise high. Layer colors follow their legends. The client's hourly amount does not change the risk tier.",
    "종합 위험은 표준 조건의 연평균 보상 시간으로 분류합니다. 0.05시간 미만은 낮음, 0.05 이상 0.2 미만은 보통, 나머지는 높음입니다. 색상은 각 범례 기준이며 고객의 시간당 금액은 등급에 영향을 주지 않습니다.",
    "総合リスクは標準条件の年平均補償時間で分類。0.05時間未満は低、0.05以上0.2未満は中、それ以外は高です。色は各凡例に従い、顧客の時間当たり金額は等級に影響しません。"
  ],
  "参考报价独立于原模型，不写入已确认保单；M1、核赔及原报价流程保留原有计算规则。": [
    "Reference quotes are independent and do not modify confirmed policies. M1, claims review and the original quoting flow retain their existing rules.",
    "참고 견적은 독립적으로 계산되며 확정 증권을 변경하지 않습니다. M1, 보상 심사 및 기존 견적 절차는 기존 규칙을 유지합니다.",
    "参考見積は独立しており確定証券を変更しません。M1・査定・元の見積フローは既存規則を維持します。"
  ],
  "底图：Natural Earth 1:50m 物理海岸线。区域点位为代表位置。": [
    "Basemap: Natural Earth 1:50m physical coastlines. Points are representative locations.",
    "기본 지도: Natural Earth 1:50m 물리적 해안선. 지점은 대표 위치입니다.",
    "背景図：Natural Earth 1:50mの海岸線。地点は代表位置です。"
  ],
  "周宁 · 技术负责人": [
    "Zhou Ning · Technology lead",
    "저우닝 · 기술 책임자",
    "周寧 · 技術責任者"
  ],
  "客户提交第三国物理外溢情景投保单": [
    "Client submitted a third-country spillover application",
    "고객이 제3국 물리적 파급 청약서 제출",
    "顧客が第三国物理波及の申込を提出"
  ],
  "保单已选择M2扩展，但仍须完成下列事实调查。": [
    "M2 is included, but the following facts still require investigation.",
    "M2에 가입되어 있지만 다음 사실 조사를 완료해야 합니다.",
    "M2は付帯済みですが、以下の事実調査が必要です。"
  ],
  "已取得约定物理事件及设施 / 电力 / 网络受损证据": [
    "Evidence obtained for the specified physical event and facility / power / network damage",
    "약정 물리적 사건과 시설 / 전력 / 통신 피해 증거 확보",
    "約定物理事象と施設・電力・通信の被害証拠を取得"
  ],
  "已核实设施所在国在对应期间为非直接交战国": [
    "Facility country verified as not directly at war during the relevant period",
    "해당 기간 시설 소재국이 비직접교전국임을 확인",
    "対象期間に施設所在国が非直接交戦国であることを確認"
  ],
  "已核实物理事件 → 设施受损 → 服务中断 → 业务受损的因果链": [
    "Causation verified: physical event → facility damage → service outage → business loss",
    "인과관계 확인: 물리적 사건 → 시설 피해 → 서비스 중단 → 업무 손실",
    "因果関係確認：物理事象 → 施設被害 → サービス中断 → 業務損害"
  ],
  "演示调查意见：按M2物理冲突外溢情景审查，须核实约定物理事件、非直接交战国设施及完整因果链后方可核定。": [
    "Sample opinion: assess under M2 physical conflict spillover. Verify the specified physical event, facilities in a country not directly at war and the complete causal chain before approval.",
    "예시 의견: M2 물리적 분쟁 파급 시나리오로 심사합니다. 약정 물리적 사건, 비직접교전국 시설 및 전체 인과관계를 확인한 후 확정합니다.",
    "意見例：M2物理的紛争波及として審査。約定物理事象、非直接交戦国施設、完全な因果関係を確認して査定します。"
  ],
  "约定物理事件与设施受损": [
    "Specified physical event & facility damage",
    "약정 물리적 사건 및 시설 피해",
    "約定物理事象・施設被害"
  ],
  "新加坡": [
    "Singapore",
    "싱가포르",
    "シンガポール"
  ],
  "同一份业务档案在客户与保险人两端流转。可从问卷开始，也可载入已承保样例，直接演示赔案。": [
    "One business file flows between client and insurer. Start with an application or load an insured sample to demonstrate a claim.",
    "하나의 업무 기록을 고객과 보험사가 공유합니다. 청약서부터 시작하거나 가입 샘플을 불러와 보상 절차를 시연하세요.",
    "同じ業務記録を顧客・保険会社で共有します。申込から開始するか、契約済み事例を読み込んで請求を実演できます。"
  ],
  "客户填写投保问卷": [
    "Client completes application",
    "고객 청약서 작성",
    "顧客が申込書を入力"
  ],
  "列明厂商、服务、业务依赖、备用方案和财务影响。": [
    "List providers, services, dependencies, backups and financial impact.",
    "제공자, 서비스, 의존성, 백업 및 재무 영향을 명시합니다.",
    "提供者、サービス、依存関係、代替策、財務影響を記載。"
  ],
  "进入 →": [
    "Open →",
    "이동 →",
    "開く →"
  ],
  "保险人核保与报价": [
    "Insurer reviews & quotes",
    "보험사 심사 및 견적",
    "保険会社が審査・見積"
  ],
  "查看区域风险、历史事件、定价依据，完成复核。": [
    "Review regional risk, historical events and pricing evidence, then complete checks.",
    "지역 위험, 과거 사건, 가격 근거를 검토하고 심사를 완료합니다.",
    "地域リスク、過去事象、料率根拠を確認して審査。"
  ],
  "客户确认保障并报案": [
    "Client confirms coverage & reports incident",
    "고객 보장 확정 및 사고 신고",
    "顧客が補償確認・事故申告"
  ],
  "记录中断、切换、业务恢复和损失声明。": [
    "Record outages, failover, business recovery and the loss declaration.",
    "중단, 전환, 업무 복구 및 손실 신고를 기록합니다.",
    "中断、切替、業務復旧、損失申告を記録。"
  ],
  "保险人调查与核赔": [
    "Insurer investigates & settles",
    "보험사 조사 및 보상 심사",
    "保険会社が調査・査定"
  ],
  "核验材料、认定M1/M2、生成计算书并模拟结案。": [
    "Verify evidence, classify M1/M2, calculate payment and simulate closure.",
    "자료 검증, M1/M2 분류, 계산서 작성 및 모의 종결을 진행합니다.",
    "資料検証、M1/M2判断、計算書作成、模擬終結を実施。"
  ],
  "模型参数与审批": [
    "Model parameters & approval",
    "모델 매개변수 및 승인",
    "モデル設定・承認"
  ],
  "调整演示假设，比较敏感性并锁定版本。": [
    "Adjust assumptions, compare sensitivity and lock versions.",
    "가정을 조정하고 민감도를 비교한 후 버전을 확정합니다.",
    "仮定を調整し、感応度を比較してバージョンを固定。"
  ],
  "从问卷开始": [
    "Start application",
    "청약서부터 시작",
    "申込から開始"
  ],
  "界面语言": [
    "Interface language",
    "화면 언어",
    "表示言語"
  ],
  "语言设置": [
    "Language",
    "언어",
    "言語"
  ],
  "投保草稿": [
    "Application draft",
    "청약 초안",
    "申込下書き"
  ],
  "未命名企业": [
    "Unnamed company",
    "이름 없는 기업",
    "名称未設定の企業"
  ],
  "新建企业": [
    "New company",
    "새 기업",
    "新規企業"
  ],
  "演示费率": [
    "Demo rates",
    "데모 요율",
    "デモ料率"
  ],
  "演示假设": [
    "Demo assumptions",
    "데모 가정",
    "デモ仮定"
  ],
  "演示情景": [
    "Demo scenario",
    "데모 시나리오",
    "デモシナリオ"
  ],
  "仅演示": [
    "Demo only",
    "데모 전용",
    "デモのみ"
  ],
  "演示生效": [
    "Active demo",
    "데모 적용 중",
    "デモ適用中"
  ],
  "初始化": [
    "Initialized",
    "초기화",
    "初期化"
  ],
  "当前投保所在区域": [
    "Insured region",
    "현재 가입 리전",
    "申込対象リージョン"
  ],
  "当前地图选中区域": [
    "Selected map region",
    "지도 선택 리전",
    "マップ選択リージョン"
  ],
  "当前条件": [
    "Current terms",
    "현재 조건",
    "現在条件"
  ],
  "未选择": [
    "Not selected",
    "미선택",
    "未選択"
  ],
  "已提供": [
    "Provided",
    "제공됨",
    "提出済み"
  ],
  "待处理": [
    "Action needed",
    "처리 필요",
    "要対応"
  ],
  "备用已演练": [
    "Backup tested",
    "백업 훈련 완료",
    "バックアップ訓練済み"
  ],
  "备用未验证": [
    "Backup unverified",
    "백업 미검증",
    "バックアップ未検証"
  ],
  "已演练": [
    "Tested",
    "훈련 완료",
    "訓練済み"
  ],
  "已完成": [
    "Completed",
    "완료",
    "完了"
  ],
  "待复核": [
    "Review pending",
    "검토 대기",
    "確認待ち"
  ],
  "待确认": [
    "Confirmation pending",
    "확인 대기",
    "確認待ち"
  ],
  "未支付": [
    "Unpaid",
    "미지급",
    "未払"
  ],
  "已结案": [
    "Closed",
    "종결",
    "終結済み"
  ],
  "已审核": [
    "Reviewed",
    "검토 완료",
    "審査済み"
  ],
  "尚未认定责任": [
    "Coverage not confirmed",
    "책임 미확정",
    "責任未確定"
  ],
  "已模拟确认": [
    "Simulated confirmation",
    "모의 확인 완료",
    "模擬確認済み"
  ],
  "已模拟审核": [
    "Simulated approval",
    "모의 검토 완료",
    "模擬承認済み"
  ],
  "已模拟支付": [
    "Simulated payment",
    "모의 지급 완료",
    "模擬支払済み"
  ],
  "已模拟赔款": [
    "Simulated payout",
    "모의 지급 보험금",
    "模擬支払保険金"
  ],
  "演示": [
    "Demo",
    "데모",
    "デモ"
  ],
  "人民币": [
    "CNY",
    "CNY",
    "CNY"
  ],
  "北京时间": [
    "Beijing time (UTC+8)",
    "베이징 시간 (UTC+8)",
    "北京時間（UTC+8）"
  ],
  "（北京时间，终点不含）": [
    "(Beijing time, end exclusive)",
    "(베이징 시간, 종료 시점 제외)",
    "（北京時間、終了時点を含まない）"
  ],
  "至": [
    "to",
    "~",
    "から"
  ],
  "列明服务": [
    "Listed service",
    "명시 서비스",
    "対象サービス"
  ],
  "工作日09–17": [
    "Weekdays 09–17",
    "평일 09–17",
    "平日09–17"
  ],
  "全天营业": [
    "24/7 operations",
    "24시간 영업",
    "24時間営業"
  ],
  "双模块保障": [
    "M1 + M2 coverage",
    "M1 + M2 보장",
    "M1 + M2補償"
  ],
  "M1单模块": [
    "M1 only",
    "M1만",
    "M1のみ"
  ],
  "元/小时": [
    "CNY/hour",
    "CNY/시간",
    "CNY/時"
  ],
  "元贡献毛利；已扣除节省的可变成本。": [
    "CNY contribution margin; saved variable costs deducted.",
    "CNY 공헌이익, 절감 변동비 차감.",
    "CNYの限界利益。節減変動費は控除済み。"
  ],
  "参考任务毛利": [
    "Reference task margin",
    "참고 작업 공헌이익",
    "参考タスク限界利益"
  ],
  "保险人内部调取": [
    "Retrieved by insurer",
    "보험사 내부 조회",
    "保険会社内で取得"
  ],
  "演示年度概率": [
    "Illustrative annual probability",
    "데모 연간 확률",
    "デモ年間確率"
  ],
  "地图，可选择七个区域": [
    " map; choose from seven regions",
    " 지도, 7개 지역 선택 가능",
    "マップ、7地域から選択"
  ],
  "荷兰": [
    "Netherlands",
    "네덜란드",
    "オランダ"
  ],
  "日本": [
    "Japan",
    "일본",
    "日本"
  ],
  "阿联酋": [
    "United Arab Emirates",
    "아랍에미리트",
    "アラブ首長国連邦"
  ],
  "澳大利亚": [
    "Australia",
    "호주",
    "オーストラリア"
  ],
  "巴西": [
    "Brazil",
    "브라질",
    "ブラジル"
  ],
  "综合风险": [
    "Overall risk",
    "종합 위험",
    "総合リスク"
  ],
  "当前": [
    "Current",
    "현재",
    "現在"
  ],
  "区域替换试算": [
    "Alternative region estimate",
    "지역 대체 산출",
    "地域変更の試算"
  ],
  "投保区域": [
    "Insured region",
    "가입 리전",
    "申込対象地域"
  ],
  "本单未选择M2 · 附加保障试算": [
    "M2 not selected · Extension estimate",
    "M2 미가입 · 확장 보장 산출",
    "M2未選択 · 特約の試算"
  ],
  "区域内供电与跨区通信依赖": [
    "Regional power and cross-region communications",
    "지역 전력 및 리전 간 통신 의존성",
    "地域電力・地域間通信への依存"
  ],
  "跨境互联与共享供电依赖": [
    "Cross-border connectivity and shared power",
    "국경 간 연결 및 공통 전력 의존성",
    "国境間接続・共通電力への依存"
  ],
  "跨境通信通道集中": [
    "Concentrated cross-border communications",
    "국경 간 통신 경로 집중",
    "国境間通信経路の集中"
  ],
  "跨洋连接与区域供电依赖": [
    "Transoceanic links and regional power",
    "대양 횡단 연결 및 지역 전력 의존성",
    "海洋横断接続・地域電力への依存"
  ],
  "电力、通信与设施共同受影响": [
    "Shared impact on power, communications and facilities",
    "전력·통신·시설 동시 영향",
    "電力・通信・施設への共通影響"
  ],
  "长距离通信与绕行容量": [
    "Long-distance communications and rerouting capacity",
    "장거리 통신 및 우회 용량",
    "長距離通信・迂回容量"
  ],
  "区域供电与跨境连接依赖": [
    "Regional power and cross-border connections",
    "지역 전력 및 국경 간 연결 의존성",
    "地域電力・国境間接続への依存"
  ],
  "事件构成": [
    "Event mix",
    "사건 구성",
    "事象構成"
  ],
  "短时情景": [
    "Short-duration scenario",
    "단기 시나리오",
    "短期シナリオ"
  ],
  "持续情景": [
    "Sustained scenario",
    "지속 시나리오",
    "継続シナリオ"
  ],
  "长时情景": [
    "Prolonged scenario",
    "장기 시나리오",
    "長期シナリオ"
  ],
  "服务受影响": [
    "Service affected",
    "서비스 영향",
    "サービスへの影響"
  ],
  "区域概率、依赖关系和恢复配置为本版情景假设；参考价单独试算，投保单报价与保单仍使用原模型。当前条件读取所选服务及投保限额；营业日历不用于此处的全天服务指标。": [
    "Regional probabilities, dependencies and recovery configurations are scenario assumptions. Reference pricing is separate; quotes and policies use the original model. Current terms use the selected service and application limits. This 24/7 metric does not use the business calendar.",
    "지역 확률·의존성·복구 구성은 시나리오 가정입니다. 참고 견적은 별도이며 청약·증권은 기존 모델을 사용합니다. 현재 조건은 선택 서비스 및 청약 한도를 사용합니다. 24시간 지표에는 영업 달력을 적용하지 않습니다.",
    "地域確率・依存・復旧構成は仮定です。参考価格は別計算で、見積・証券は元モデルを使用。現在条件は選択サービスと申込限度を参照。本24時間指標に営業カレンダーは適用しません。"
  ],
  "请填写具体服务": [
    "Enter service name",
    "구체적 서비스 입력",
    "具体的なサービスを入力"
  ],
  "新的独立业务": [
    "New independent business",
    "새 독립 업무",
    "新しい独立業務"
  ],
  "添加另一独立业务的服务": [
    "Add service for another business",
    "다른 독립 업무 서비스 추가",
    "別の独立業務のサービスを追加"
  ],
  "已演练状态必须提供日期": [
    "Test date required for tested backups",
    "훈련 완료 시 날짜 필수",
    "訓練済みの場合は日付必須"
  ],
  "提交投保问卷": [
    "Submit application",
    "청약서 제출",
    "申込書を提出"
  ],
  "确认复核并生成报价": [
    "Confirm review & generate quote",
    "검토 확인 후 견적 생성",
    "審査確認・見積作成"
  ],
  "核查付费任务与补做，不按请求数": [
    "Check paid tasks and recoveries, not request counts",
    "요청 수가 아닌 유료 작업·재처리 확인",
    "要求数ではなく有料タスクと再処理を確認"
  ],
  "转人工合并": [
    "Manual consolidation required",
    "수동 통합 필요",
    "手動統合が必要"
  ],
  "需补充": [
    "More information needed",
    "보완 필요",
    "要補足"
  ],
  "尚未确认保障": [
    "Coverage not yet confirmed",
    "보장 미확정",
    "補償未確定"
  ],
  "客户确认报价与保障": [
    "Client confirms quote & coverage",
    "고객 견적 및 보장 확인",
    "顧客が見積・補償を確認"
  ],
  "演示报价单": [
    "Sample quote",
    "데모 견적서",
    "デモ見積書"
  ],
  "林远 · 运营负责人": [
    "Lin Yuan · Operations lead",
    "린위안 · 운영 책임자",
    "林遠 · 運用責任者"
  ],
  "按次收费的多语种内容生成": [
    "Pay-per-task multilingual content generation",
    "작업당 과금 다국어 콘텐츠 생성",
    "タスク課金の多言語コンテンツ生成"
  ],
  "跨境SaaS付费任务处理": [
    "Paid cross-border SaaS task processing",
    "국경 간 SaaS 유료 작업 처리",
    "越境SaaS有料タスク処理"
  ],
  "客户保存AI API投保草稿": [
    "Client saved an AI API application draft",
    "고객 AI API 청약 초안 저장",
    "顧客がAI API申込下書きを保存"
  ],
  "按唯一付费任务归集调用；失败重试不重复计算，恢复后可补做部分不计永久损失。": [
    "Group calls by unique paid task. Do not double-count retries; exclude work recoverable after restoration from permanent loss.",
    "고유 유료 작업으로 호출을 집계합니다. 실패 재시도는 중복 계산하지 않고 복구 후 재처리 가능분은 영구 손실에서 제외합니다.",
    "固有有料タスク単位で呼出を集計。再試行は重複計上せず、復旧後に再処理可能な部分を永久損失から除外します。"
  ],
  "独立业务组；用于演示非直接交战国设施的物理冲突外溢情景。": [
    "Independent business group for a physical conflict spillover scenario affecting facilities in a country not directly at war.",
    "비직접교전국 시설의 물리적 분쟁 파급을 시연하는 독립 업무 그룹입니다.",
    "非直接交戦国施設の物理的紛争波及を実演する独立業務グループです。"
  ],
  "情景假设：第三国设施上游供电因约定物理事件受损，导致列明服务中断。须调查设施国地位及因果链。": [
    "Scenario: a specified physical event damages upstream power to a third-country facility, interrupting the listed service. Investigate the facility country's status and causal chain.",
    "가정: 약정 물리적 사건이 제3국 시설의 상위 전력망을 손상하여 명시 서비스가 중단됩니다. 시설국 지위와 인과관계를 조사해야 합니다.",
    "想定：第三国施設の上流電力が約定物理事象で被害を受け対象サービスが中断。施設国の地位と因果関係の調査が必要です。"
  ],
  "列明模型和部署端点；质量下降、幻觉不视为可用性中断": [
    "Specify model and deployment endpoint. Quality degradation and hallucinations are not availability outages.",
    "모델과 배포 엔드포인트를 명시하세요. 품질 저하와 환각은 가용성 중단이 아닙니다.",
    "モデルと配置エンドポイントを明記。品質低下や幻覚は可用性中断に該当しません。"
  ],
  "备用方案已有演练记录；仍需核查备用服务与主服务是否共享上游故障点。": [
    "Backup testing is documented. Verify whether primary and backup services share upstream failure points.",
    "백업 훈련 기록이 있습니다. 주·백업 서비스의 공통 상위 장애점을 확인하세요.",
    "代替訓練記録あり。主系と待機系が上流障害点を共有しないか確認してください。"
  ],
  "浏览器存储不可用，当前更改仅保留在本次会话": [
    "Browser storage unavailable; changes remain in this session only.",
    "브라우저 저장소를 사용할 수 없어 변경은 이번 세션에만 유지됩니다.",
    "ブラウザ保存が利用できず、変更は今回のセッションのみ保持されます。"
  ],
  "新": [
    "N",
    "N",
    "N"
  ],
  "已锁定快照": [
    "Snapshot locked",
    "스냅샷 잠금",
    "スナップショット固定済み"
  ],
  "未生效报价": [
    "Inactive quote",
    "미적용 견적",
    "未適用見積"
  ],
  "完成核保复核后生成": [
    "Generated after underwriting review",
    "인수 검토 후 생성",
    "引受確認後に作成"
  ],
  "理赔与核赔": [
    "Claims & review",
    "사고 접수 및 보상 심사",
    "事故申告・支払査定"
  ],
  "需要先确认演示保单": [
    "Confirm a sample policy first",
    "데모 증권을 먼저 확정하세요",
    "先にデモ契約を確定してください"
  ],
  "投保信息、报价和核赔使用同一份业务档案": [
    "Application, quote and claims share one business file.",
    "청약, 견적, 보상 심사는 하나의 기록을 사용합니다.",
    "申込・見積・査定は同じ業務記録を使用します。"
  ],
  "继续核保": [
    "Continue underwriting",
    "인수 심사 계속",
    "引受審査を続ける"
  ],
  "案件已模拟支付结案": [
    "Simulated payment complete; claim closed",
    "모의 지급 완료 · 사건 종결",
    "模擬支払完了・案件終結"
  ],
  "赔款已审核，等待模拟付款": [
    "Payout approved; simulated payment pending",
    "보험금 심사 완료 · 모의 지급 대기",
    "保険金審査済み・模擬支払待ち"
  ],
  "事故申报已收到 · 进入核赔调查": [
    "Report received · Begin claims investigation",
    "사고 신고 접수 · 보상 조사 시작",
    "事故申告受付済み · 調査へ"
  ],
  "切换后关键业务恢复时刻": [
    "Critical operations restored after failover",
    "전환 후 핵심 업무 복구 시각",
    "切替後の重要業務復旧時刻"
  ],
  "成功恢复后的时间不再累计赔偿。": [
    "No further eligible time accrues after successful recovery.",
    "복구 성공 후에는 보상 시간이 누적되지 않습니다.",
    "復旧成功後は補償時間を累積しません。"
  ],
  "陈晓 · 示例授权财务人员": [
    "Chen Xiao · Sample authorized finance officer",
    "천샤오 · 예시 재무 담당자",
    "陳暁 · サンプル財務担当者"
  ],
  "更新事故申报": [
    "Update incident report",
    "사고 신고 갱신",
    "事故申告を更新"
  ],
  "查看核赔结果": [
    "View claims decision",
    "보상 심사 결과 보기",
    "査定結果を表示"
  ],
  "待取得": [
    "To be obtained",
    "확보 예정",
    "取得待ち"
  ],
  "声明已确认": [
    "Declaration confirmed",
    "확인서 확정",
    "申告確認済み"
  ],
  "暂无保单": [
    "No policy yet",
    "증권 없음",
    "保険証券なし"
  ],
  "回放已生成": [
    "Replay generated",
    "재생 기록 생성됨",
    "再生データ作成済み"
  ],
  "重新生成回放": [
    "Regenerate replay",
    "재생 기록 다시 생성",
    "再生データを再生成"
  ],
  "暂无符合条件的区间": [
    "No eligible intervals",
    "해당 구간 없음",
    "対象区間なし"
  ],
  "分类未定，须继续调查": [
    "Classification pending; continue investigation",
    "분류 미확정 · 추가 조사 필요",
    "分類未確定・調査を継続"
  ],
  "本保单未投保M2，不能以该模块支付赔款。": [
    "M2 is not included; no payment can be made under this module.",
    "M2에 가입되지 않아 해당 모듈로 지급할 수 없습니다.",
    "M2未付帯のため、本モジュールでは支払できません。"
  ],
  "请填写责任依据与调查结论": [
    "Enter the coverage basis and investigation findings.",
    "책임 근거와 조사 결론을 입력하세요.",
    "責任根拠・調査結論を入力してください。"
  ],
  "保单未选择M2": [
    "M2 is not included in the policy",
    "증권에 M2 미포함",
    "保険契約にM2の付帯なし"
  ],
  "M2物理事件、非直接交战国或因果链调查尚未完成": [
    "M2 investigation of the physical event, non-belligerent status or causation is incomplete.",
    "M2 물리적 사건, 비직접교전국 지위 또는 인과관계 조사가 미완료입니다.",
    "M2の物理事象・非直接交戦国の地位・因果関係の調査が未完了です。"
  ],
  "模块分配尚待调查，本演示不自动支付待分配款": [
    "Module allocation is unresolved; this demo does not automatically pay unallocated amounts.",
    "모듈 배분 조사 중이며 미배분 금액은 자동 지급하지 않습니다.",
    "モジュール配分は調査中で、未配分額は自動支払しません。"
  ],
  "当前为不予赔付意见，须形成有事实和条款依据的人工决定": [
    "Proposed denial requires a manual decision supported by facts and policy terms.",
    "지급 거절 의견은 사실과 약관에 근거한 담당자 결정이 필요합니다.",
    "不払案には事実・約款に基づく担当者の判断が必要です。"
  ],
  "本次申报含多个独立事故组，请人工分案后核定": [
    "Multiple independent occurrences; split the claim before assessment.",
    "독립 사고가 여러 건이므로 분리 후 심사하세요.",
    "独立事故が複数含まれます。分割して査定してください。"
  ],
  "事故时段不在保险期间": [
    "Incident is outside the policy period",
    "사고가 보험 기간 밖에 있음",
    "事故が保険期間外"
  ],
  "当前无正的可支付金额，需说明计算与责任结论": [
    "No positive payable amount; document the calculation and coverage conclusion.",
    "지급 가능 양수 금액이 없습니다. 계산과 책임 결론을 기록하세요.",
    "正の支払可能額がありません。計算・責任判断を記録してください。"
  ],
  "模块待分配": [
    "Module allocation pending",
    "모듈 배분 대기",
    "モジュール配分待ち"
  ],
  "责任待人工决定": [
    "Manual coverage decision pending",
    "담당자 책임 판단 대기",
    "担当者の責任判断待ち"
  ],
  "核定": [
    "Approved",
    "확정",
    "確定"
  ],
  "试算": [
    "Estimated",
    "추정",
    "試算"
  ],
  "责任认定尚待核赔人确认。": [
    "Coverage determination awaits claims reviewer confirmation.",
    "보상 담당자의 책임 판단 확인 대기 중입니다.",
    "査定担当者による責任判断の確認待ちです。"
  ],
  "存在多个独立事故，需人工分案。": [
    "Multiple independent events require separate claims.",
    "여러 독립 사고는 수동 분리가 필요합니다.",
    "独立事故が複数あり、案件分割が必要です。"
  ],
  "查看结案材料": [
    "View closure documents",
    "종결 자료 보기",
    "終結資料を表示"
  ],
  "当前未投保M2": [
    "M2 not insured",
    "M2 미가입",
    "M2未付保"
  ],
  "无可赔区间": [
    "No eligible interval",
    "보상 대상 구간 없음",
    "補償対象区間なし"
  ],
  "核定 / 试算": [
    "Approved / estimated",
    "확정 / 추정",
    "確定 / 試算"
  ],
  "客户确认赔款与账户": [
    "Client confirms payout & account",
    "고객 보험금 및 계좌 확인",
    "顧客が保険金・口座を確認"
  ],
  "模拟支付并结案": [
    "Simulate payment & close",
    "모의 지급 및 종결",
    "模擬支払・終結"
  ],
  "投保资料变更 · 原演示报价作废，需重新核保": [
    "Application changed · Previous demo quote void; re-underwriting required",
    "청약 정보 변경 · 기존 견적 무효, 재심사 필요",
    "申込情報変更 · 旧見積無効、再審査が必要"
  ],
  "该演示保单已确认": [
    "This sample policy is already confirmed",
    "데모 증권이 이미 확정되었습니다",
    "デモ契約は確定済みです"
  ],
  "请先完成核保并生成报价": [
    "Complete underwriting and generate a quote first.",
    "인수 심사 후 견적을 먼저 생성하세요.",
    "先に引受審査を完了し見積を作成してください。"
  ],
  "客户模拟确认报价与保障 · 保单及模型快照锁定": [
    "Client confirmed quote & coverage (demo) · Policy and model snapshots locked",
    "고객 견적·보장 모의 확인 · 증권 및 모델 스냅샷 잠금",
    "顧客が見積・補償を模擬確認 · 証券・モデルを固定"
  ],
  "（新投保）": [
    "(new application)",
    "(새 청약)",
    "（新規申込）"
  ],
  "复制为新投保单，原保单不变": [
    "Copied to a new application; original policy retained",
    "새 청약서로 복사, 기존 증권 유지",
    "新規申込に複製、元の契約は維持"
  ],
  "新建投保草稿": [
    "New application draft",
    "새 청약 초안",
    "新規申込下書き"
  ],
  "新投保单已创建": [
    "New application created",
    "새 청약서 생성 완료",
    "新規申込を作成しました"
  ],
  "文件已生成": [
    "File generated",
    "파일 생성 완료",
    "ファイルを作成しました"
  ],
  "已提交": [
    "Submitted",
    "제출됨",
    "提出済み"
  ],
  "草稿": [
    "Draft",
    "초안",
    "下書き"
  ],
  "服务中断": [
    "Service outage",
    "서비스 중단",
    "サービス中断"
  ],
  "业务受影响": [
    "Business affected",
    "업무 영향",
    "業務への影響"
  ],
  "事故经过": [
    "Incident description",
    "사고 경위",
    "事故の経緯"
  ],
  "切换 / 防损减损": [
    "Failover / Mitigation",
    "전환 / 손해 경감",
    "切替 / 損害軽減"
  ],
  "是否成功切换": [
    "Successful failover?",
    "전환 성공 여부",
    "切替成功の有無"
  ],
  "是，": [
    "Yes, ",
    "예, ",
    "はい、"
  ],
  "否": [
    "No",
    "아니요",
    "いいえ"
  ],
  "同损失其他补偿": [
    "Other recovery for the same loss",
    "동일 손실의 기타 보상",
    "同一損失の他の補償"
  ],
  "财务计算依据": [
    "Financial calculation basis",
    "재무 계산 근거",
    "財務計算根拠"
  ],
  "授权声明": [
    "Authorized declaration",
    "권한 확인서",
    "権限に基づく申告"
  ],
  "尚未确认": [
    "Not confirmed",
    "미확인",
    "未確認"
  ],
  "财务声明人": [
    "Finance signatory",
    "재무 신고자",
    "財務申告者"
  ],
  "待补充": [
    "To be provided",
    "보완 대기",
    "補足待ち"
  ],
  "无": [
    "None",
    "없음",
    "なし"
  ],
  "案件 / 保单": [
    "Claim / Policy",
    "사건 / 증권",
    "案件 / 証券"
  ],
  "责任模块": [
    "Coverage module",
    "책임 모듈",
    "補償モジュール"
  ],
  "核定赔款": [
    "Approved payout",
    "확정 보험금",
    "確定保険金"
  ],
  "支付状态": [
    "Payment status",
    "지급 상태",
    "支払状態"
  ],
  "尚未支付": [
    "Not paid",
    "미지급",
    "未支払"
  ],
  "收款账户": [
    "Receiving account",
    "수취 계좌",
    "受取口座"
  ],
  "支付时间": [
    "Payment time",
    "지급 시각",
    "支払時刻"
  ],
  "M1 / M2已用额度": [
    "M1 / M2 used limits",
    "M1 / M2 사용 한도",
    "M1 / M2使用済み額"
  ],
  "年度总剩余额度": [
    "Remaining annual total",
    "연간 총 잔여 한도",
    "年間総残額"
  ],
  "地区概率须处于0%至99.9%之间": [
    "Regional probabilities must be between 0% and 99.9%.",
    "지역 확률은 0%~99.9%여야 합니다.",
    "地域確率は0%〜99.9%にしてください。"
  ],
  "关于这份演示工作台": [
    "About this workspace",
    "데모 작업 공간 정보",
    "このデモについて"
  ],
  "查看风险口径": [
    "View risk methodology",
    "위험 기준 보기",
    "リスク算定基準を表示"
  ],
  "风险地图与概率口径": [
    "Risk map & probabilities",
    "위험 지도 및 확률 기준",
    "リスクマップ・確率基準"
  ],
  "服务依赖辅助分析 · 规则演示": [
    "Dependency analysis · Rule-based demo",
    "서비스 의존성 분석 · 규칙 데모",
    "依存関係分析 · ルールデモ"
  ],
  "备用独立性、演练日志和实际恢复结果。": [
    "Backup independence, test logs and actual recovery.",
    "백업 독립성, 훈련 로그 및 실제 복구 결과.",
    "代替の独立性、訓練ログ、実際の復旧結果。"
  ],
  "可用替代方案、切换时长及实际业务恢复。": [
    "Available alternatives, failover duration and actual business recovery.",
    "대체 수단, 전환 시간 및 실제 업무 복구.",
    "利用可能な代替策、切替時間、実際の業務復旧。"
  ],
  "已确认保单保持原快照": [
    "Confirmed policy retains its original snapshot",
    "확정 증권은 기존 스냅샷 유지",
    "確定契約は元のスナップショットを維持"
  ],
  "草稿已保存": [
    "Draft saved",
    "초안 저장됨",
    "下書き保存済み"
  ],
  "演示最多列明8项服务": [
    "Up to 8 services in this demo",
    "데모 최대 8개 서비스",
    "デモは最大8サービス"
  ],
  "已添加服务，请确认其属于另一独立业务组": [
    "Service added; assign it to a separate business group.",
    "서비스가 추가되었습니다. 별도 독립 업무 그룹인지 확인하세요.",
    "サービスを追加。別の独立業務グループに属するか確認してください。"
  ],
  "请在确认页勾选投保声明": [
    "Accept the application declaration on the review page.",
    "확인 화면에서 청약 확인서를 체크하세요.",
    "確認画面で申込表明に同意してください。"
  ],
  "投保问卷需要补充": [
    "Application needs more information",
    "청약서 보완 필요",
    "申込内容の補足が必要"
  ],
  "问卷已提交，请演示保险人复核": [
    "Application submitted; continue with insurer review.",
    "청약서 제출 완료. 보험사 검토를 진행하세요.",
    "申込提出済み。保険会社の確認に進んでください。"
  ],
  "请先提交客户投保问卷": [
    "Submit the client application first.",
    "고객 청약서를 먼저 제출하세요.",
    "先に顧客の申込書を提出してください。"
  ],
  "请逐项确认核保复核：": [
    "Complete each underwriting check: ",
    "각 인수 점검을 확인하세요: ",
    "各引受項目を確認してください："
  ],
  "报价前需要完成核保复核": [
    "Complete underwriting checks before quoting",
    "견적 전 인수 검토 필요",
    "見積前に引受確認が必要"
  ],
  "确认生成演示报价": [
    "Confirm demo quote",
    "데모 견적 생성 확인",
    "デモ見積作成の確認"
  ],
  "返回复核": [
    "Back to review",
    "검토로 돌아가기",
    "審査へ戻る"
  ],
  "确认生成报价": [
    "Generate quote",
    "견적 생성 확인",
    "見積を作成"
  ],
  "演示核保人确认报价": [
    "Demo underwriter confirmed quote",
    "데모 인수 담당자 견적 확인",
    "デモ引受担当者が見積を確認"
  ],
  "报价已生成，待客户确认保障": [
    "Quote generated; awaiting client confirmation.",
    "견적 생성 완료. 고객 보장 확인 대기.",
    "見積作成済み。顧客の補償確認待ち。"
  ],
  "请先完成核保": [
    "Complete underwriting first",
    "인수 심사를 먼저 완료하세요",
    "先に引受審査を完了"
  ],
  "返回检查": [
    "Back to checks",
    "점검으로 돌아가기",
    "確認へ戻る"
  ],
  "模拟确认保障": [
    "Confirm coverage (demo)",
    "보장 모의 확정",
    "補償を模擬確定"
  ],
  "事故草稿已保存": [
    "Incident draft saved",
    "사고 초안 저장됨",
    "事故下書き保存済み"
  ],
  "演示最多8个区间": [
    "Up to 8 intervals in this demo",
    "데모 최대 8개 구간",
    "デモは最大8区間"
  ],
  "请填写事故经过": [
    "Enter the incident description",
    "사고 경위를 입력하세요",
    "事故の経緯を入力してください"
  ],
  "事故报告需要补充": [
    "Incident report needs more information",
    "사고 보고서 보완 필요",
    "事故報告の補足が必要"
  ],
  "提交客户事故申报": [
    "Submit client incident report",
    "고객 사고 신고 제출",
    "顧客事故申告を提出"
  ],
  "已确认财务损失声明。": [
    "Financial loss declaration confirmed.",
    "재무 손실 확인서 확정.",
    "財務損失申告を確認済み。"
  ],
  "尚未确认财务声明，可先报案，核定赔款前须补充。": [
    "You may report now; confirm the financial declaration before payout approval.",
    "우선 신고할 수 있으며 보험금 확정 전에 재무 확인서를 보완해야 합니다.",
    "先に事故申告可能です。保険金確定前に財務申告を補足してください。"
  ],
  "继续填写": [
    "Continue editing",
    "계속 작성",
    "入力を続ける"
  ],
  "客户提交事故报告": [
    "Client submitted incident report",
    "고객 사고 보고서 제출",
    "顧客が事故報告を提出"
  ],
  "保险人已收到模拟报案": [
    "Insurer received the simulated report",
    "보험사 모의 신고 접수",
    "保険会社が模擬申告を受付"
  ],
  "生成E01模拟监测记录": [
    "Generated E01 simulated monitoring record",
    "E01 모의 모니터링 기록 생성",
    "E01模擬監視記録を作成"
  ],
  "监测回放已生成": [
    "Monitoring replay generated",
    "모니터링 재생 생성 완료",
    "監視再生データを作成済み"
  ],
  "证据辅助预检 · 本地规则演示": [
    "Evidence pre-check · Local rules",
    "자료 사전 점검 · 로컬 규칙",
    "証拠事前チェック · ローカルルール"
  ],
  "服务中断 / 可赔分钟": [
    "Downtime / Eligible minutes",
    "중단 / 보상 대상 분",
    "中断 / 補償対象分"
  ],
  "事故组数": [
    "Occurrence groups",
    "사고 그룹 수",
    "事故グループ数"
  ],
  "是，截断业务受影响时间": [
    "Yes; ends the business impact period",
    "예, 업무 영향 시간 종료",
    "はい、業務影響時間を終了"
  ],
  "无成功恢复记录": [
    "No successful recovery record",
    "복구 성공 기록 없음",
    "復旧成功記録なし"
  ],
  "待核验材料": [
    "Evidence awaiting verification",
    "검증 대기 자료",
    "検証待ち資料"
  ],
  "M2调查": [
    "M2 investigation",
    "M2 조사",
    "M2調査"
  ],
  "核查设施国及完整物理因果链": [
    "Verify facility country and full physical causal chain",
    "시설 국가 및 전체 물리적 인과관계 확인",
    "施設国・完全な物理的因果関係を確認"
  ],
  "当前为M1或待分类": [
    "M1 or classification pending",
    "현재 M1 또는 분류 대기",
    "M1または分類待ち"
  ],
  "进入材料核验": [
    "Open evidence verification",
    "자료 검증으로 이동",
    "資料検証へ"
  ],
  "请补充或核实：": [
    "Please provide or verify: ",
    "보완 또는 확인: ",
    "補足・確認してください："
  ],
  "现有材料原始记录及关键时段一致性": [
    "Original records and consistency of critical time intervals",
    "자료 원본 및 핵심 시간 일치 여부",
    "原記録と重要時間帯の整合性"
  ],
  "集中补件通知": [
    "Consolidated evidence request",
    "일괄 보완 요청서",
    "一括追加資料依頼"
  ],
  "案件": [
    "Claim",
    "사건",
    "案件"
  ],
  "本案已核定": [
    "Claim already assessed",
    "이미 확정된 사건",
    "本件は査定済み"
  ],
  "核定赔款前需要完成": [
    "Required before payout approval",
    "보험금 확정 전 필요 사항",
    "保険金確定前の必要事項"
  ],
  "演示核赔人确认赔款": [
    "Claims reviewer approval (demo)",
    "데모 보상 담당자 보험금 확인",
    "デモ査定担当者の保険金確認"
  ],
  "确认核定赔款": [
    "Approve payout",
    "보험금 확정 확인",
    "保険金を確定"
  ],
  "仍有待处理事项": [
    "Outstanding items remain",
    "미처리 항목 있음",
    "未処理事項があります"
  ],
  "核赔人模拟核定": [
    "Claims reviewer approved (demo)",
    "보상 담당자 모의 확정",
    "査定担当者が模擬確定"
  ],
  "赔款已核定，待客户确认": [
    "Payout approved; awaiting client confirmation",
    "보험금 확정 · 고객 확인 대기",
    "保険金確定・顧客確認待ち"
  ],
  "请先核定赔款": [
    "Approve the payout first",
    "보험금을 먼저 확정하세요",
    "先に保険金を確定"
  ],
  "返回": [
    "Back",
    "돌아가기",
    "戻る"
  ],
  "模拟客户确认": [
    "Confirm as client (demo)",
    "고객 모의 확인",
    "顧客として模擬確認"
  ],
  "客户模拟确认赔款与对公收款账户": [
    "Client confirmed payout and corporate account (demo)",
    "고객 보험금·법인 계좌 모의 확인",
    "顧客が保険金・法人口座を模擬確認"
  ],
  "客户已模拟确认": [
    "Client confirmation complete (demo)",
    "고객 모의 확인 완료",
    "顧客の模擬確認済み"
  ],
  "请先核定赔款并取得客户模拟确认": [
    "Approve the payout and obtain client confirmation first.",
    "보험금 확정 및 고객 모의 확인을 먼저 완료하세요.",
    "先に保険金確定と顧客の模擬確認を完了してください。"
  ],
  "本案已支付，不能重复入账": [
    "Already paid; duplicate posting is blocked",
    "이미 지급되어 중복 반영 불가",
    "支払済みのため重複計上不可"
  ],
  "模拟支付与结案": [
    "Simulated payment & closure",
    "모의 지급 및 종결",
    "模擬支払・終結"
  ],
  "确认模拟支付": [
    "Confirm simulated payment",
    "모의 지급 확인",
    "模擬支払を確認"
  ],
  "模拟支付结案": [
    "Simulated payment; claim closed",
    "모의 지급 종결",
    "模擬支払・案件終結"
  ],
  "已模拟支付并更新年度额度": [
    "Simulated payment complete; annual limits updated",
    "모의 지급 완료 · 연간 한도 갱신",
    "模擬支払完了・年間限度を更新"
  ],
  "未生效参数已还原为当前演示版本": [
    "Draft parameters reset to the active demo version",
    "미적용 매개변수를 현재 버전으로 복원",
    "未適用設定を現行デモ版に戻しました"
  ],
  "模型参数需要修正": [
    "Model parameters need correction",
    "모델 매개변수 수정 필요",
    "モデル設定の修正が必要"
  ],
  "模拟模型审批与版本生效": [
    "Model approval & activation (demo)",
    "모델 모의 승인 및 적용",
    "モデルの模擬承認・適用"
  ],
  "返回试算": [
    "Back to estimate",
    "산출로 돌아가기",
    "試算へ戻る"
  ],
  "演示精算负责人模拟审批生效": [
    "Activated by demo actuarial approver",
    "데모 계리 책임자 모의 승인 적용",
    "デモ数理責任者の模擬承認で適用"
  ],
  "演示模型版本更新，原报价作废，需重新核保": [
    "Model updated; previous quote void, re-underwriting required",
    "모델 갱신 · 기존 견적 무효, 재심사 필요",
    "モデル更新・旧見積無効、再審査が必要"
  ],
  "新演示版本已生效，已确认保单不受影响": [
    "New demo version active; confirmed policies unchanged",
    "새 버전 적용 · 확정 증권 유지",
    "新デモ版を適用・確定契約は維持"
  ],
  "报价与保险凭证": [
    "Quote & insurance certificate",
    "견적 및 보험 증명서",
    "見積・保険証明書"
  ],
  "事故报告与损失声明": [
    "Incident report & loss declaration",
    "사고 보고서 및 손실 확인서",
    "事故報告書・損失申告"
  ],
  "结案报告": [
    "Closure report",
    "종결 보고서",
    "終結報告書"
  ],
  "项目": [
    "Item",
    "항목",
    "項目"
  ],
  "数值": [
    "Value",
    "값",
    "数値"
  ],
  "单位": [
    "Unit",
    "단위",
    "単位"
  ],
  "元": [
    "CNY",
    "CNY",
    "CNY"
  ],
  "M1比较金额": [
    "M1 comparison amount",
    "M1 비교 금액",
    "M1比較額"
  ],
  "M2比较金额": [
    "M2 comparison amount",
    "M2 비교 금액",
    "M2比較額"
  ],
  "客户申报信息变更 · 待重新提交": [
    "Client report changed · Resubmission required",
    "고객 신고 정보 변경 · 재제출 필요",
    "顧客申告を変更 · 再提出が必要"
  ],
  "请输入允许范围内的有效数值": [
    "Enter a valid number within the allowed range.",
    "허용 범위의 유효한 숫자를 입력하세요.",
    "許容範囲内の有効な数値を入力してください。"
  ],
  "另一个标签页已更新档案，请刷新后继续，避免覆盖": [
    "Another tab updated this file. Refresh before continuing to avoid overwriting it.",
    "다른 탭에서 기록을 갱신했습니다. 덮어쓰기를 피하려면 새로고침하세요.",
    "別タブで更新されました。上書きを避けるため再読込してください。"
  ],
  "请填写企业名称": [
    "Enter the company name",
    "기업명을 입력하세요",
    "企業名を入力してください"
  ],
  "请填写联系人与联系邮箱": [
    "Enter contact name and email",
    "담당자와 이메일을 입력하세요",
    "担当者・メールを入力してください"
  ],
  "请输入有效联系邮箱": [
    "Enter a valid email address",
    "유효한 이메일을 입력하세요",
    "有効なメールを入力してください"
  ],
  "至少列明一项承保服务": [
    "List at least one covered service",
    "보장 서비스를 하나 이상 명시하세요",
    "対象サービスを1つ以上指定してください"
  ],
  "事故及年度限额必须大于零": [
    "Occurrence and annual limits must be positive",
    "사고·연간 한도는 0보다 커야 합니다",
    "事故・年間限度は正の値にしてください"
  ],
  "选择M2时需设置其年度限额": [
    "Set an annual limit when M2 is selected",
    "M2 선택 시 연간 한도를 설정하세요",
    "M2選択時は年間限度を設定してください"
  ],
  "等待期不得为负，最长赔偿时长须大于零": [
    "Waiting period cannot be negative; maximum duration must be positive",
    "대기 기간은 음수 불가, 최대 보상 시간은 양수 필수",
    "待機期間は非負、最大補償時間は正の値が必要"
  ],
  "保险终止日期须晚于起始日期": [
    "Coverage end date must be after the start date",
    "보험 종료일은 시작일보다 늦어야 합니다",
    "終了日は開始日より後にしてください"
  ],
  "存在重复业务组：当前演示模型仅支持独立业务组；请合并同一业务的多项依赖后再报价，避免重复计价": [
    "Duplicate business groups. Consolidate dependencies for the same business before quoting; the demo supports independent groups only.",
    "업무 그룹이 중복됩니다. 중복 산출을 방지하도록 동일 업무 의존성을 합친 후 견적을 산출하세요. 데모는 독립 그룹만 지원합니다.",
    "業務グループが重複。同一業務の依存を統合して見積してください。デモは独立グループのみ対応しています。"
  ],
  "请填写有效的中断和恢复时间，恢复须晚于中断": [
    "Enter valid times; recovery must follow outage start",
    "유효한 시간을 입력하세요. 복구는 중단 이후여야 합니다",
    "有効な時間を入力。復旧は中断開始より後にしてください"
  ],
  "业务受影响时段无效": [
    "Invalid business impact interval",
    "업무 영향 구간이 유효하지 않음",
    "業務影響時間帯が無効"
  ],
  "声明损失不能为负": [
    "Declared loss cannot be negative",
    "신고 손실은 음수 불가",
    "申告損失は負にできません"
  ],
  "成功切换时必须填写业务恢复时间": [
    "Enter business recovery time for successful failover",
    "전환 성공 시 업무 복구 시간 필수",
    "切替成功時は業務復旧時間が必須"
  ],
  "单段事故超过90天，请转人工分段调查": [
    "Interval exceeds 90 days; refer for manual investigation",
    "단일 구간이 90일 초과, 담당자 분할 조사 필요",
    "1区間が90日超。担当者による区間調査が必要"
  ],
  "（示例）": [
    "(sample)",
    "(예시)",
    "（例）"
  ],
  "提交前请处理：": [
    "Resolve before submitting:",
    "제출 전에 처리하세요:",
    "提出前に対応してください："
  ],
  "版本状态：": [
    "Version status: ",
    "버전 상태: ",
    "バージョン状態："
  ],
  "企业：": [
    "Company: ",
    "기업: ",
    "企業："
  ],
  "责任归属：": [
    "Coverage module: ",
    "책임 모듈: ",
    "責任モジュール："
  ],
  "收款主体：": [
    "Recipient: ",
    "수취인: ",
    "受取人："
  ],
  "必要检查已完成，可由授权核赔人进行模拟审批。": [
    "Required checks complete. An authorized claims reviewer may approve the simulated payment.",
    "필수 점검 완료. 권한 있는 보상 담당자가 모의 승인을 진행할 수 있습니다.",
    "必要確認が完了。権限を持つ査定担当者が模擬承認を行えます。"
  ],
  "将由演示精算负责人确认新的演示参数版本。新参数应用于未出单业务；已有报价作废并重新核保，已确认保单保持原快照。": [
    "The demo actuarial approver will activate a new parameter version for unissued business. Existing quotes will be void and require re-underwriting; confirmed policies retain their snapshots.",
    "데모 계리 책임자가 새 매개변수 버전을 승인합니다. 미발급 업무에 적용하며 기존 견적은 무효화 후 재심사합니다. 확정 증권은 원래 스냅샷을 유지합니다.",
    "デモ数理責任者が新設定版を承認。未発行業務に適用し、既存見積は無効として再審査。確定契約は元のスナップショットを維持します。"
  ],
  "gpt-4.1 / deployment-prod（示例）": [
    "gpt-4.1 / deployment-prod (sample)",
    "gpt-4.1 / deployment-prod (예시)",
    "gpt-4.1 / deployment-prod（例）"
  ],
  "年度概率": [
    "Annual probability",
    "연간 확률",
    "年間確率"
  ],
  "风险颜色": [
    "Risk colors",
    "위험 색상",
    "リスク色"
  ],
  "M1与M2": [
    "M1 and M2",
    "M1 및 M2",
    "M1とM2"
  ],
  "表示某区域在一年内至少发生一次符合示例定义事件的假设概率。模型以 λ = −ln(1−p) 转换为简化泊松频率，再结合示例严重度计算。": [
    " is the assumed probability of at least one qualifying event in a region per year. The model converts it to a simplified Poisson frequency using λ = −ln(1−p), then applies sample severity.",
    "는 지역에서 연간 1회 이상 정의된 사건이 발생할 가정 확률입니다. λ = −ln(1−p)로 단순 포아송 빈도로 변환한 후 예시 심도를 적용합니다.",
    "は地域で年に1回以上の対象事象が起きる仮定確率です。λ = −ln(1−p)で簡易ポアソン頻度に変換し、サンプル損害度を適用します。"
  ],
  "：M1低于19%为较低、19%至不足24%为中等、24%及以上为较高；M2低于1%为较低、1%至不足3%为中等、3%及以上为较高。阈值仅为演示，不是国家评级。": [
    ": M1 is low below 19%, medium from 19% to below 24%, and high at 24% or more. M2 thresholds are below 1%, 1% to below 3%, and 3% or more. These are demo thresholds, not country ratings.",
    ": M1은 19% 미만 낮음, 19~24% 미만 보통, 24% 이상 높음입니다. M2는 1% 미만, 1~3% 미만, 3% 이상입니다. 데모 기준이며 국가 등급은 아닙니다.",
    "：M1は19%未満が低、19%以上24%未満が中、24%以上が高。M2は1%未満、1%以上3%未満、3%以上です。デモ閾値であり国別格付けではありません。"
  ],
  "分别表示普通服务中断与约定物理冲突外溢。M2不是一般地缘风险兜底，须逐案核验非直接交战国设施及因果链。": [
    " refer to operational outages and specified physical conflict spillover. M2 is not blanket geopolitical coverage; verify the non-belligerent facility country and causal chain for each claim.",
    "는 일반 서비스 중단과 약정된 물리적 분쟁 파급을 의미합니다. M2는 포괄적 지정학 보장이 아니며 비직접교전국 시설과 인과관계를 건별로 확인합니다.",
    "は通常の中断と約定の物理的紛争波及です。M2は地政学リスクの包括補償ではなく、非直接交戦国施設と因果関係を案件ごとに確認します。"
  ],
  "真实历史事件只用于说明可能的故障机制，没有用三起事件外推出地区概率。底图采用 Natural Earth 1:50m 真实海岸线和 Natural Earth 投影；标记使用云区域代表城市附近的经纬度，不代表具体机房地址。底图为物理地理图，不绘制行政国界。": [
    "Historical events illustrate failure mechanisms; three incidents are not used to infer regional probabilities. The basemap uses Natural Earth 1:50m coastlines and projection. Markers indicate representative cities near cloud regions, not data-center addresses. Administrative borders are not shown.",
    "과거 사건은 장애 원리 설명용이며 세 사건으로 지역 확률을 추정하지 않았습니다. Natural Earth 1:50m 해안선과 투영을 사용하며 마커는 대표 도시 주변 위치로 실제 데이터센터 주소가 아닙니다. 행정 국경은 표시하지 않습니다.",
    "過去事象は障害機序の参考で、3件から地域確率を推定していません。Natural Earth 1:50mの海岸線・投影を使用。マーカーは代表都市付近で、データセンターの住所ではありません。行政国境は表示しません。"
  ],
  "地理数据来源与使用说明 ↗": [
    "Geographic data & terms ↗",
    "지리 데이터 출처 및 이용 안내 ↗",
    "地理データ・利用条件 ↗"
  ],
  "依赖说明：": [
    "Dependency: ",
    "의존성 설명: ",
    "依存関係："
  ],
  "待核实：": [
    "To verify: ",
    "확인 사항: ",
    "要確認："
  ],
  "客户申报": [
    "Client report",
    "고객 신고",
    "顧客申告"
  ],
  "材料索引": [
    "Evidence index",
    "자료 색인",
    "資料索引"
  ],
  "补充附件名称": [
    "Additional file names",
    "추가 첨부 파일명",
    "追加添付ファイル名"
  ],
  "责任与计算意见": [
    "Coverage & calculation opinion",
    "책임 및 계산 의견",
    "責任・計算に関する意見"
  ],
  "案件操作记录": [
    "Claim activity log",
    "사건 처리 기록",
    "案件操作記録"
  ],
  "同一损失后续取得补偿须继续披露。收取无争议赔款不代表放弃争议部分。": [
    "Disclose later recovery for the same loss. Receiving the undisputed amount does not waive the disputed portion.",
    "동일 손실의 추후 보상을 계속 공개해야 합니다. 이견 없는 보험금 수령은 쟁점 부분의 포기를 의미하지 않습니다.",
    "同一損失の後日の補償は引き続き開示。争いのない保険金の受領は、争いのある部分の放棄を意味しません。"
  ]
};
window.CBLocalePatterns = [
  [
    "{0} 个独立业务组 · {1}",
    "{0} independent business groups · {1}",
    "{0}개 독립 업무 그룹 · {1}",
    "{0}独立業務グループ · {1}"
  ],
  [
    "{0} · {1}项列明服务 · 人民币",
    "{0} · {1} listed services · CNY",
    "{0} · {1}개 명시 서비스 · CNY",
    "{0} · {1}対象サービス · CNY"
  ],
  [
    "{0}项服务 / {1}个业务组",
    "{0} services / {1} business groups",
    "{0}개 서비스 / {1}개 업무 그룹",
    "{0}サービス / {1}業務グループ"
  ],
  [
    "{0} 笔/小时 × {1}",
    "{0} tasks/hour × {1}",
    "{0}건/시간 × {1}",
    "{0}件/時 × {1}"
  ],
  [
    "建议约定小时金额：{0}",
    "Suggested hourly amount: {0}",
    "권장 시간당 약정 금액: {0}",
    "推奨時間当たり約定額：{0}"
  ],
  [
    "{0}分钟等待期 · {1}",
    "{0} min waiting period · {1}",
    "대기 기간 {0}분 · {1}",
    "待機期間{0}分 · {1}"
  ],
  [
    "{0}分钟/事故",
    "{0} min/occurrence",
    "사고당 {0}분",
    "{0}分/事故"
  ],
  [
    "{0}分钟中断 / {1}分钟可赔",
    "{0} min downtime / {1} min eligible",
    "중단 {0}분 / 보상 대상 {1}분",
    "中断{0}分 / 補償対象{1}分"
  ],
  [
    "{0}笔最终取消且无法补做的付费任务 × 每笔{1}元贡献毛利；已扣除节省的可变成本。",
    "{0} irrecoverable paid tasks × CNY {1} margin per task; saved variable costs deducted.",
    "회복 불가 유료 작업 {0}건 × 건당 공헌이익 CNY {1}, 절감 변동비 차감.",
    "回復不能な有料タスク{0}件 × 1件の限界利益CNY {1}。節減変動費は控除済み。"
  ],
  [
    "声明损失 {0} − 同损失补偿 {1}",
    "Declared loss {0} − other recovery {1}",
    "신고 손실 {0} − 동일 손실 보상 {1}",
    "申告損失{0} − 同一損失の補償{1}"
  ],
  [
    "尚未核验必要材料：{0}",
    "Required evidence not verified: {0}",
    "필수 자료 검증 미완료: {0}",
    "必要資料の検証未完了：{0}"
  ],
  [
    "事故组{0}",
    "Occurrence group {0}",
    "사고 그룹 {0}",
    "事故グループ{0}"
  ],
  [
    "保险人核定赔款 {0}",
    "Insurer-approved payout {0}",
    "보험사 확정 보험금 {0}",
    "保険会社の確定保険金{0}"
  ],
  [
    "仍按每次事故 {0}",
    "Per-occurrence limit remains {0}",
    "사고당 한도 유지: {0}",
    "1事故当たり限度額は{0}"
  ],
  [
    "{0}个工作日",
    "{0} business days",
    "{0}영업일",
    "{0}営業日"
  ],
  [
    "{0}个自然日",
    "{0} calendar days",
    "{0}일 (달력 기준)",
    "{0}暦日"
  ],
  [
    "当前版本：{0}",
    "Active version: {0}",
    "현재 버전: {0}",
    "現行版：{0}"
  ],
  [
    "保留 {0} 快照",
    "Retain {0} snapshot",
    "{0} 스냅샷 유지",
    "{0}スナップショットを維持"
  ],
  [
    "报价时间：{0}",
    "Quoted: {0}",
    "견적 시간: {0}",
    "見積日時：{0}"
  ],
  [
    "{0}M1概率",
    "{0} M1 probability",
    "{0} M1 확률",
    "{0} M1確率"
  ],
  [
    "{0}M2概率",
    "{0} M2 probability",
    "{0} M2 확률",
    "{0} M2確率"
  ],
  [
    "{0} · M2参考年保费",
    "{0} · M2 annual estimate",
    "{0} · M2 연간 참고 보험료",
    "{0} · M2年間参考保険料"
  ],
  [
    "P90 中断 {0} · {1}",
    "P90 downtime {0} · {1}",
    "P90 중단 {0} · {1}",
    "P90中断{0} · {1}"
  ],
  [
    "{0} 至 {1}",
    "{0} to {1}",
    "{0} ~ {1}",
    "{0} から {1}"
  ],
  [
    "服务{0}的名称、业务和独立业务组不能为空",
    "Service {0}: name, business and group are required",
    "서비스 {0}: 이름, 업무, 그룹 필수",
    "サービス{0}：名称・業務・グループが必須"
  ],
  [
    "服务{0}需列明模型/部署端点",
    "Service {0}: specify model / endpoint",
    "서비스 {0}: 모델 / 엔드포인트 필수",
    "サービス{0}：モデル・エンドポイントを明記"
  ],
  [
    "服务{0}的业务量、毛利与不可挽回比例须支持正的小时金额",
    "Service {0}: volume, margin and irrecoverable share must yield a positive hourly amount",
    "서비스 {0}: 거래량·공헌이익·회복 불가 비율은 양수 시간당 금액을 산출해야 함",
    "サービス{0}：取引量・限界利益・回復不能割合から正の時間当たり金額が必要"
  ],
  [
    "服务{0}限额须大于零",
    "Service {0}: limit must be positive",
    "서비스 {0}: 한도는 양수 필수",
    "サービス{0}：限度額は正の値が必要"
  ],
  [
    "服务{0}需补充备用方案演练日期",
    "Service {0}: add the backup test date",
    "서비스 {0}: 백업 훈련일 필요",
    "サービス{0}：代替訓練日を入力"
  ],
  [
    "删除服务{0}",
    "Remove service {0}",
    "서비스 {0} 삭제",
    "サービス{0}を削除"
  ],
  [
    "删除区间{0}",
    "Remove interval {0}",
    "구간 {0} 삭제",
    "区間{0}を削除"
  ],
  [
    "{0}超出允许范围",
    "{0} is outside the allowed range",
    "{0}: 허용 범위 초과",
    "{0}は許容範囲外"
  ],
  [
    "本次{0}赔款",
    "{0} payout",
    "이번 {0} 보험금",
    "今回の{0}保険金"
  ],
  [
    "本案{0}金额",
    "{0} amount for this claim",
    "본 건 {0} 금액",
    "本件の{0}金額"
  ],
  [
    "{0}分钟 / {1}小时",
    "{0} min / {1} hours",
    "{0}분 / {1}시간",
    "{0}分 / {1}時間"
  ],
  [
    "{0}分钟",
    "{0} min",
    "{0}분",
    "{0}分"
  ],
  [
    "{0}小时",
    "{0} hours",
    "{0}시간",
    "{0}時間"
  ],
  [
    "{0}元",
    "CNY {0}",
    "CNY {0}",
    "CNY {0}"
  ],
  [
    "等待期：{0}分钟；最长可赔：{1}小时。",
    "Waiting period: {0} min; maximum duration: {1} hours.",
    "대기 기간: {0}분, 최대 보상 시간: {1}시간.",
    "待機期間：{0}分、最大補償時間：{1}時間。"
  ],
  [
    "服务中断 {0} 分钟，声明净损失 ¥{1}。保险人将核实责任、业务影响和材料。",
    "Service outage: {0} min. Declared net loss: CNY {1}. The insurer will verify coverage, business impact and evidence.",
    "서비스 중단 {0}분, 신고 순손실 CNY {1}. 보험사가 책임, 업무 영향 및 자료를 확인합니다.",
    "サービス中断{0}分、申告純損失CNY {1}。保険会社が責任・業務影響・資料を確認します。"
  ],
  [
    "核赔人模拟核定 {0} 赔款 ¥{1}",
    "Reviewer approved {0} payout of CNY {1} (demo)",
    "담당자 {0} 보험금 CNY {1} 모의 확정",
    "担当者が{0}保険金CNY {1}を模擬確定"
  ],
  [
    "客户提交事故报告 · {0} · 声明损失¥{1}",
    "Client report submitted · {0} · Declared loss CNY {1}",
    "고객 사고 신고 제출 · {0} · 신고 손실 CNY {1}",
    "顧客事故報告提出 · {0} · 申告損失CNY {1}"
  ],
  [
    "本次核定 ¥{0}，演示收款账户：",
    "Approved payout: CNY {0}. Sample receiving account: ",
    "확정 보험금 CNY {0}, 데모 수취 계좌: ",
    "確定保険金CNY {0}、デモ受取口座："
  ],
  [
    "将模拟支付 ¥{0}，并扣减{1}及保单年度总剩余额度。",
    "Simulate payment of CNY {0} and deduct it from {1} and the remaining annual policy total.",
    "CNY {0} 모의 지급 후 {1} 및 연간 총 잔여 한도에서 차감합니다.",
    "CNY {0}を模擬支払し、{1}と契約年間総残額から控除します。"
  ]
];

;
/* Additional UI strings: English, Korean, Japanese. */
Object.assign(window.CBLocaleMessages,{
  "危险性": [
    "Hazard",
    "위험 요인",
    "ハザード"
  ],
  "历史冲突事件": [
    "Historical conflict events",
    "과거 분쟁 사건",
    "過去の紛争事象"
  ],
  "公开云区域": [
    "Public cloud regions",
    "공개 클라우드 리전",
    "公開クラウドリージョン"
  ],
  "情景参数": [
    "Scenario inputs",
    "시나리오 입력값",
    "シナリオ入力値"
  ],
  "全部事件": [
    "All events",
    "전체 사건",
    "全事象"
  ],
  "国家型冲突": [
    "State-based conflict",
    "국가 기반 분쟁",
    "国家主体の紛争"
  ],
  "非国家冲突": [
    "Non-state conflict",
    "비국가 분쟁",
    "非国家間の紛争"
  ],
  "单方面暴力": [
    "One-sided violence",
    "일방적 폭력",
    "一方的暴力"
  ],
  "全球": [
    "Global",
    "전 세계",
    "全世界"
  ],
  "欧洲": [
    "Europe",
    "유럽",
    "欧州"
  ],
  "中东": [
    "Middle East",
    "중동",
    "中東"
  ],
  "非洲": [
    "Africa",
    "아프리카",
    "アフリカ"
  ],
  "亚洲": [
    "Asia",
    "아시아",
    "アジア"
  ],
  "美洲": [
    "Americas",
    "미주",
    "南北アメリカ"
  ],
  "统计年度": [
    "Year",
    "통계 연도",
    "集計年"
  ],
  "事件类型": [
    "Event type",
    "사건 유형",
    "事象種別"
  ],
  "地图范围": [
    "Map view",
    "지도 범위",
    "地図の範囲"
  ],
  "云服务商": [
    "Cloud provider",
    "클라우드 공급자",
    "クラウド事業者"
  ],
  "全部厂商": [
    "All providers",
    "전체 공급자",
    "全事業者"
  ],
  "收录 30 个区域；非完整设施清单。": [
    "30 selected regions; not a full facility inventory.",
    "선정된 30개 리전이며 전체 시설 목록은 아닙니다.",
    "30リージョンを収録。全施設の一覧ではありません。"
  ],
  "所选年度 · 全球事件": [
    "Selected year · global events",
    "선택 연도 · 전 세계 사건",
    "選択年・全世界の事象"
  ],
  "纳入精细热图": [
    "Included in grid map",
    "격자 지도에 포함",
    "詳細地図への収録数"
  ],
  "位置精度不足 · 未入图": [
    "Coarse locations · excluded",
    "위치 정밀도 부족 · 제외",
    "位置精度不足・地図対象外"
  ],
  "网格事件数": [
    "Events per grid cell",
    "격자별 사건 수",
    "グリッド内の事象数"
  ],
  "缩小地图": [
    "Zoom out",
    "축소",
    "縮小"
  ],
  "放大地图": [
    "Zoom in",
    "확대",
    "拡大"
  ],
  "定位所选": [
    "Locate selection",
    "선택 위치로 이동",
    "選択位置へ"
  ],
  "重置": [
    "Reset",
    "초기화",
    "リセット"
  ],
  "历史冲突事件与公开云区域地图": [
    "Historical conflict and public cloud regions",
    "과거 분쟁 및 공개 클라우드 리전 지도",
    "過去の紛争・公開クラウドリージョン地図"
  ],
  "历史事件数 ≠ 中断概率": [
    "Event count ≠ outage probability",
    "사건 수 ≠ 중단 확률",
    "事象数 ≠ 中断確率"
  ],
  "高事件数网格": [
    "High-count cells",
    "사건 수 상위 격자",
    "事象数の多いグリッド"
  ],
  "公开区域": [
    "Public region",
    "공개 리전",
    "公開リージョン"
  ],
  "官方公布位置": [
    "Published location",
    "공식 공개 위치",
    "公式の所在地"
  ],
  "位置精度": [
    "Location precision",
    "위치 정밀도",
    "位置精度"
  ],
  "国家级": [
    "Country",
    "국가 단위",
    "国単位"
  ],
  "州 / 省级": [
    "State / province",
    "주 / 도 단위",
    "州・省単位"
  ],
  "都市圈": [
    "Metro area",
    "광역 도시권",
    "都市圏"
  ],
  "城市级": [
    "City",
    "도시 단위",
    "都市単位"
  ],
  "近似区域": [
    "Approximate region",
    "대략적 지역",
    "概略地域"
  ],
  "服务可用性": [
    "Service availability",
    "서비스 가용성",
    "サービスの提供状況"
  ],
  "已查 Compute Engine 目录": [
    "Compute Engine catalog checked",
    "Compute Engine 목록 확인",
    "Compute Engine カタログ確認済み"
  ],
  "具体产品 / SKU 待核实": [
    "Product / SKU to verify",
    "제품 / SKU 확인 필요",
    "製品・SKUは要確認"
  ],
  "客户实际部署": [
    "Client deployment",
    "고객 실제 배포",
    "顧客の実際のデプロイ"
  ],
  "待配置证据核实": [
    "Configuration evidence needed",
    "구성 증빙 필요",
    "構成の証拠が必要"
  ],
  "圆圈为近似区域标签，不表示设施位置或覆盖范围。": [
    "Circles mark approximate region labels, not facility sites or coverage.",
    "원은 리전의 대략적 위치이며 시설 위치나 서비스 범위가 아닙니다.",
    "円はリージョンの概略位置であり、施設位置や対象範囲ではありません。"
  ],
  "该区域需要访问资格。": [
    "Access eligibility is required for this region.",
    "이 리전은 이용 자격이 필요합니다.",
    "このリージョンには利用資格が必要です。"
  ],
  "官方区域来源": [
    "Official region source",
    "공식 리전 출처",
    "公式リージョン情報"
  ],
  "服务区域目录": [
    "Regional service catalog",
    "리전별 서비스 목록",
    "リージョン別サービス一覧"
  ],
  "AI API 的部署范围": [
    "AI API deployment scope",
    "AI API 배포 범위",
    "AI APIのデプロイ範囲"
  ],
  "Global、Data Zone 与 Regional 的处理范围不同。资源区域不等于实际推理机房。": [
    "Global, Data Zone and Regional deployments have different processing scopes. The resource region does not identify the inference facility.",
    "Global, Data Zone, Regional은 처리 범위가 다릅니다. 리소스 리전이 실제 추론 시설을 뜻하지는 않습니다.",
    "Global、Data Zone、Regionalでは処理範囲が異なります。リソースのリージョンから推論施設は特定できません。"
  ],
  "Azure OpenAI 部署类型": [
    "Azure OpenAI deployment types",
    "Azure OpenAI 배포 유형",
    "Azure OpenAIのデプロイ種別"
  ],
  "观测数据": [
    "Observed data",
    "관측 데이터",
    "観測データ"
  ],
  "原始记录样本": [
    "Source record samples",
    "원본 기록 표본",
    "原データのサンプル"
  ],
  "位置精度 1：具体地点；2：已知点周围最多 25 km。地点坐标可能使用城镇中心。": [
    "Precision 1: named location; 2: within 25 km of a known point. Coordinates may be town centroids.",
    "정밀도 1: 특정 장소, 2: 알려진 지점의 25km 이내. 좌표는 도시 중심점일 수 있습니다.",
    "精度1：特定地点、2：既知の地点から25km以内。座標が町の中心を示す場合があります。"
  ],
  "蓝色圆圈：公开云区域近似位置；冲突邻近度尚未验证为服务中断风险。": [
    "Blue circles: approximate public cloud regions. Conflict proximity has not been calibrated to outage risk.",
    "파란 원: 공개 클라우드 리전의 대략적 위치. 분쟁 근접성은 중단 위험으로 보정되지 않았습니다.",
    "青い円：公開クラウドリージョンの概略位置。紛争への近接度と中断リスクの関係は未検証です。"
  ],
  "数据来源、位置精度与模型连接": [
    "Sources, precision and model linkage",
    "출처, 위치 정밀도 및 모델 연결",
    "出典・位置精度・モデルとの関係"
  ],
  "数据来源与方法": [
    "Sources and methodology",
    "데이터 출처 및 방법",
    "データ出典と手法"
  ],
  "下载原始数据": [
    "Download source data",
    "원본 데이터 다운로드",
    "原データをダウンロード"
  ],
  "字段代码本": [
    "Field codebook",
    "필드 코드북",
    "フィールドコードブック"
  ],
  "致死的有组织暴力；按事件数聚合，不按死亡人数加权。空白网格不代表零风险。": [
    "Lethal organized violence, aggregated by event count without fatality weighting. Empty cells do not mean zero risk.",
    "사망을 동반한 조직적 폭력을 사건 수로 집계하며 사망자 수로 가중하지 않습니다. 빈 격자가 무위험을 뜻하지는 않습니다.",
    "死者を伴う組織的暴力を事象数で集計し、死者数では加重しません。空白のグリッドはリスクゼロを意味しません。"
  ],
  "官方区域名称与位置。地图坐标为近似标签位置，不代表机房或客户实际调用路径。": [
    "Official region names and locations. Map coordinates are approximate labels, not facilities or client traffic paths.",
    "공식 리전 명칭과 위치입니다. 지도 좌표는 대략적 표식이며 시설이나 고객 트래픽 경로가 아닙니다.",
    "公式リージョン名と所在地。地図座標は概略位置であり、施設や顧客の通信経路ではありません。"
  ],
  "Azure 区域目录": [
    "Azure regions",
    "Azure 리전 목록",
    "Azureリージョン一覧"
  ],
  "AWS 区域目录": [
    "AWS regions",
    "AWS 리전 목록",
    "AWSリージョン一覧"
  ],
  "Google Cloud 区域目录": [
    "Google Cloud regions",
    "Google Cloud 리전 목록",
    "Google Cloudリージョン一覧"
  ],
  "后续数据候选 · 未接入": [
    "Candidate sources · not connected",
    "추가 데이터 후보 · 미연결",
    "追加データ候補・未接続"
  ],
  "网络测量可补充链路证据；更多政治暴力事件需另行取得数据许可。尚无客户级网络路由或设施故障数据。": [
    "Network measurements can support link evidence. Additional political violence data needs appropriate licensing. Client routes and facility failures are not yet available.",
    "네트워크 측정은 링크 증빙을 보완할 수 있습니다. 정치적 폭력 데이터 추가에는 이용 허가가 필요합니다. 고객별 경로와 시설 장애 데이터는 아직 없습니다.",
    "ネットワーク測定は回線の証拠を補足できます。政治的暴力の追加データには利用許諾が必要です。顧客経路・施設障害データは未取得です。"
  ],
  "网络测量": [
    "Network measurements",
    "네트워크 측정",
    "ネットワーク測定"
  ],
  "事件数据访问": [
    "Event data access",
    "사건 데이터 접근",
    "事象データへのアクセス"
  ],
  "数据整理：2026-11-17。网格为 1° × 1°，面积随纬度变化；只纳入 where_prec 1–2。": [
    "Compiled 2026-11-17. Grids are 1° × 1° with latitude-dependent area; where_prec 1–2 only.",
    "정리: 2026-11-17. 1° × 1° 격자의 면적은 위도에 따라 다르며 where_prec 1–2만 포함합니다.",
    "整理日：2026-11-17。1° × 1°の面積は緯度で異なり、where_prec 1–2のみ収録しています。"
  ],
  "冲突观测": [
    "Conflict observations",
    "분쟁 관측",
    "紛争の観測"
  ],
  "设施 / 链路受损": [
    "Facility / network damage",
    "시설 / 네트워크 손상",
    "施設・回線の損傷"
  ],
  "列明服务中断": [
    "Scheduled service outage",
    "명시 서비스 중단",
    "明記サービスの中断"
  ],
  "参数赔款分布": [
    "Parametric payout distribution",
    "파라메트릭 지급금 분포",
    "パラメトリック給付の分布"
  ],
  "已取得冲突观测与公开区域资料；中间因果链、恢复分布与承保条件仍需验证。定价参数暂保留情景假设，热图筛选不改变报价。": [
    "Conflict observations and public region records are available. Causal links, recovery distributions and coverage conditions still need validation. Pricing retains scenario inputs; map filters do not change quotes.",
    "분쟁 관측과 공개 리전 자료를 확보했습니다. 인과관계, 복구 분포와 보장 조건은 검증이 필요합니다. 요율은 시나리오 입력값을 유지하며 지도 필터는 견적을 변경하지 않습니다.",
    "紛争観測と公開リージョン資料は取得済みです。因果関係・復旧分布・補償条件は要検証です。料率はシナリオ入力値を用い、地図フィルターは見積額を変更しません。"
  ],
  "风险证据 → 年度赔款分布 → 四层定价": [
    "Risk evidence → annual payouts → four pricing components",
    "위험 증빙 → 연간 지급금 분포 → 4단계 요율",
    "リスク証拠 → 年間給付分布 → 4つの料率構成"
  ],
  "查看定价明细": [
    "View pricing breakdown",
    "요율 내역 보기",
    "料率明細を見る"
  ],
  "模型区域": [
    "Model region",
    "모델 지역",
    "モデル地域"
  ],
  "情景假设": [
    "Scenario assumption",
    "시나리오 가정",
    "シナリオ仮定"
  ],
  "中断与恢复情景": [
    "Outage and recovery scenarios",
    "중단 및 복구 시나리오",
    "中断・復旧シナリオ"
  ],
  "当前采用三类源事件、三档中断时长；与定价使用同一组参数。": [
    "Three source-event types and three duration bands, using the same inputs as pricing.",
    "세 가지 원인 사건과 세 가지 중단 시간 구간을 사용하며 요율과 동일한 입력값을 적용합니다.",
    "3種類の原因事象と3段階の中断時間を使用し、料率計算と同じ入力値を用います。"
  ],
  "外溢路径": [
    "Spillover pathway",
    "파급 경로",
    "波及経路"
  ],
  "事件构成": [
    "Event mix",
    "사건 구성",
    "事象構成"
  ],
  "条件受影响概率": [
    "Conditional impact probability",
    "조건부 영향 확률",
    "条件付き影響確率"
  ],
  "中时": [
    "Medium",
    "중간",
    "中時間"
  ],
  "年内至少一次源事件": [
    "At least one source event / year",
    "연간 원인 사건 1건 이상",
    "年間1件以上の原因事象"
  ],
  "短 / 中 / 长时权重": [
    "Short / medium / long weights",
    "단기 / 중기 / 장기 가중치",
    "短・中・長時間の重み"
  ],
  "时长基准": [
    "Duration reference",
    "시간 기준",
    "時間の基準"
  ],
  "待补充的验证证据": [
    "Evidence still needed",
    "추가 검증 증빙",
    "追加の検証証拠"
  ],
  "设施或网络故障记录 → 列明服务受影响记录 → 不可用时段与恢复记录。历史冲突数量尚未校准为源事件概率、受影响概率或恢复时长。": [
    "Facility or network failures → scheduled service impacts → unavailability and recovery logs. Conflict counts have not been calibrated to event probabilities, impact probabilities or recovery durations.",
    "시설·네트워크 장애 → 명시 서비스 영향 → 이용 불가 및 복구 기록. 분쟁 수는 사건 확률, 영향 확률 또는 복구 시간으로 보정되지 않았습니다.",
    "施設・ネットワーク障害 → 明記サービスへの影響 → 利用不能・復旧記録。紛争件数から事象確率・影響確率・復旧時間への校正は未実施です。"
  ],
  "客户业务备用不改变原服务不可用指标；跨区部署、服务级冗余需要取得配置和演练记录后再调整参数。": [
    "Client business backup does not change the original service metric. Cross-region and service redundancy adjustments require configuration and drill evidence.",
    "고객 업무 백업은 원 서비스 지표를 바꾸지 않습니다. 리전 간 배포와 서비스 이중화 조정에는 구성 및 훈련 기록이 필요합니다.",
    "顧客業務のバックアップは元のサービス指標を変えません。リージョン間配置や冗長化の調整には構成・訓練の記録が必要です。"
  ],
  "预计赔款": [
    "Expected claims",
    "기대 지급금",
    "期待給付金"
  ],
  "再保险净成本": [
    "Net reinsurance cost",
    "순재보험 비용",
    "再保険純コスト"
  ],
  "资本成本": [
    "Capital cost",
    "자본 비용",
    "資本コスト"
  ],
  "运营费用": [
    "Operating expenses",
    "운영 비용",
    "運営費用"
  ],
  "已确认报价保留原版本": [
    "Confirmed quote retains its original version",
    "확정 견적은 기존 버전 유지",
    "確定見積は元のバージョンを維持"
  ],
  "以下为当前四层模型的对照试算，不改写已确认保单。": [
    "The current four-component model below is a comparison only; the confirmed policy is unchanged.",
    "아래 4단계 모델은 비교 계산이며 확정 증권을 변경하지 않습니다.",
    "以下は現行の4構成モデルとの比較試算であり、確定済み保険証券は変更しません。"
  ],
  "当前模型对照试算": [
    "Current-model comparison",
    "현재 모델 비교 계산",
    "現行モデルとの比較試算"
  ],
  "参数保障定价情景": [
    "Parametric pricing scenario",
    "파라메트릭 요율 시나리오",
    "パラメトリック料率シナリオ"
  ],
  "保单快照": [
    "Policy snapshot",
    "증권 스냅샷",
    "保険証券スナップショット"
  ],
  "情景试算": [
    "Scenario estimate",
    "시나리오 계산",
    "シナリオ試算"
  ],
  "风险模型 → 年度赔款分布 → 成本分解": [
    "Risk model → annual payout distribution → cost breakdown",
    "위험 모델 → 연간 지급금 분포 → 비용 분석",
    "リスクモデル → 年間給付分布 → コスト内訳"
  ],
  "年度保费构成": [
    "Annual premium composition",
    "연간 보험료 구성",
    "年間保険料の構成"
  ],
  "全年参数赔款的均值 · 再保险前": [
    "Mean annual parametric payouts · before reinsurance",
    "연간 평균 파라메트릭 지급금 · 재보험 전",
    "年間パラメトリック給付の平均・再保険前"
  ],
  "模拟年度": [
    "Simulated years",
    "모의 연도 수",
    "シミュレーション年数"
  ],
  "源事件频率": [
    "Source-event frequency",
    "원인 사건 빈도",
    "原因事象の頻度"
  ],
  "服务受影响与中断时长": [
    "Service impact and outage duration",
    "서비스 영향 및 중단 시간",
    "サービス影響と中断時間"
  ],
  "等待期、事故及年度限额": [
    "Waiting period, event and annual limits",
    "대기기간, 사고 및 연간 한도",
    "待機期間・事故限度額・年間限度額"
  ],
  "赔款计算与承保条件": [
    "Payout calculation and coverage terms",
    "지급금 계산 및 보장 조건",
    "給付金計算と補償条件"
  ],
  "约定小时金额 × min(最长赔付时长, max(中断时长 − 等待期, 0)), 服务与事故限额, 剩余年度限额": [
    "Scheduled hourly amount × min(maximum covered hours, max(outage duration − waiting period, 0)), service and event limits, remaining annual limit",
    "약정 시간당 금액 × min(최대 보장시간, max(중단시간 − 대기기간, 0)), 서비스·사고 한도, 잔여 연간 한도",
    "約定時間額 × min(最長給付時間, max(中断時間 − 待機期間, 0)), サービス・事故限度額, 年間残限度額"
  ],
  "等待期 / 最长赔付": [
    "Waiting / maximum covered time",
    "대기기간 / 최대 지급시간",
    "待機期間・最長給付時間"
  ],
  "本页按原服务全天不可用的参数保障情景试算。现有核赔流程仍含营业时段、成功切换和承保净损失约束；本页尚未对这些约束完成赔款校准。": [
    "This scenario uses round-the-clock unavailability of the original service. The existing claims workflow also applies business hours, successful failover and covered net-loss constraints; payouts have not yet been calibrated to those constraints.",
    "이 시나리오는 원 서비스의 24시간 이용 불가 지표를 사용합니다. 기존 지급 심사는 영업시간, 성공적 전환, 보장 순손실 제약도 적용하며 해당 제약에 대한 지급금 보정은 아직 완료되지 않았습니다.",
    "本試算は元サービスの終日利用不能を基準とします。現行の支払査定には営業時間・切替成功・補償純損失の制約もあり、これらへの給付金校正は未完了です。"
  ],
  "分摊再保险费 − 预期摊回": [
    "Allocated reinsurance premium − expected recoveries",
    "배분 재보험료 − 기대 회수액",
    "配賦再保険料 − 期待回収額"
  ],
  "预期摊回": [
    "Expected recoveries",
    "기대 회수액",
    "期待回収額"
  ],
  "分摊再保险费": [
    "Allocated reinsurance premium",
    "배분 재보험료",
    "配賦再保険料"
  ],
  "比例分保份额": [
    "Quota-share cession",
    "비례 출재 비율",
    "比例出再割合"
  ],
  "再保险费附加": [
    "Reinsurance loading",
    "재보험료 가산",
    "再保険料付加率"
  ],
  "再保险分摊依据": [
    "Reinsurance allocation",
    "재보험 배분 기준",
    "再保険の配賦基準"
  ],
  "比例分保情景。组合再保险费按客户预期摊回占比分配；EL 为再保险前赔款，RC 仅计净增成本。": [
    "Quota-share scenario. Treaty premium is allocated by each client's expected recovery share; EL is before reinsurance and RC includes only the net added cost.",
    "비례 재보험 시나리오입니다. 조약 보험료는 고객별 기대 회수액 비중으로 배분하며 EL은 재보험 전 지급금, RC는 순증 비용입니다.",
    "比例再保険のシナリオ。再保険料は顧客の期待回収額の割合で配賦し、ELは再保険前給付、RCは純増コストのみです。"
  ],
  "组合再保险费": [
    "Portfolio reinsurance premium",
    "포트폴리오 재보험료",
    "ポートフォリオ再保険料"
  ],
  "组合最差 1% 年份中的客户净赔款贡献": [
    "Client net-claim contribution in the portfolio's worst 1% of years",
    "포트폴리오 최악 1% 연도의 고객 순지급금 기여",
    "ポートフォリオ最悪1%年における顧客純給付金の寄与"
  ],
  "尾部年度客户平均净赔款": [
    "Client mean net claims in tail years",
    "꼬리 연도의 고객 평균 순지급금",
    "テール年の顧客平均純給付金"
  ],
  "客户年均净赔款": [
    "Client mean annual net claims",
    "고객 연평균 순지급금",
    "顧客の年平均純給付金"
  ],
  "分配资本 K": [
    "Allocated capital K",
    "배분 자본 K",
    "配賦資本 K"
  ],
  "资本成本率 c": [
    "Cost of capital c",
    "자본비용률 c",
    "資本コスト率 c"
  ],
  "组合与尾部年度": [
    "Portfolio and tail years",
    "포트폴리오 및 꼬리 연도",
    "ポートフォリオとテール年"
  ],
  "当前客户与两家参考企业组成模拟组合。相同区域共享事件流；按再保险后组合年度赔款排序，取最差 1% 年份。": [
    "A sample portfolio contains this client and two reference firms. Regional events are shared; tail years are the worst 1% of portfolio annual claims after reinsurance.",
    "현재 고객과 두 참고 기업으로 구성한 모의 포트폴리오입니다. 지역 사건을 공유하며 재보험 후 연간 지급금의 최악 1% 연도를 선택합니다.",
    "当該顧客と参考企業2社の仮想ポートフォリオです。地域事象を共有し、再保険後の年間給付額が最悪の1%年を選びます。"
  ],
  "客户净赔款 | 组合最差 1% 年份": [
    "client net claims | portfolio worst 1% years",
    "고객 순지급금 | 포트폴리오 최악 1% 연도",
    "顧客純給付金 | ポートフォリオ最悪1%年"
  ],
  "客户净赔款": [
    "client net claims",
    "고객 순지급금",
    "顧客純給付金"
  ],
  "分配资本": [
    "Allocated capital",
    "배분 자본",
    "配賦資本"
  ],
  "尾部年度数量": [
    "Number of tail years",
    "꼬리 연도 수",
    "テール年数"
  ],
  "参考组合": [
    "Reference portfolio",
    "참고 포트폴리오",
    "参考ポートフォリオ"
  ],
  "年均净赔款": [
    "Mean annual net claims",
    "연평균 순지급금",
    "年平均純給付金"
  ],
  "当前客户": [
    "Current client",
    "현재 고객",
    "当該顧客"
  ],
  "参考企业": [
    "Reference firm",
    "참고 기업",
    "参考企業"
  ],
  "固定费用与随保费变化的费用": [
    "Fixed expenses and premium-linked expenses",
    "고정비 및 보험료 연동 비용",
    "固定費用と保険料連動費用"
  ],
  "固定费用 F": [
    "Fixed expenses F",
    "고정비 F",
    "固定費用 F"
  ],
  "变动费用 eG": [
    "Variable expenses eG",
    "변동비 eG",
    "変動費用 eG"
  ],
  "变动费用率 e": [
    "Variable expense rate e",
    "변동비율 e",
    "変動費用率 e"
  ],
  "固定费用覆盖监测、核保和核赔；变动费用按年保费比例计算。": [
    "Fixed expenses cover monitoring, underwriting and claims handling; variable expenses are a share of annual premium.",
    "고정비는 모니터링, 인수 및 지급 심사 비용이며 변동비는 연간 보험료에 비례합니다.",
    "固定費用は監視・引受・支払査定を含み、変動費用は年間保険料に比例します。"
  ],
  "业务小时金额与定价输入": [
    "Business hourly amounts and pricing inputs",
    "업무 시간당 금액 및 요율 입력값",
    "業務時間額と料率入力値"
  ],
  "业务量 / 小时": [
    "Business volume / hour",
    "시간당 업무량",
    "時間当たり業務量"
  ],
  "冲突热图与公开云区域用于证据审查；事件频率、传播概率、恢复时长和成本参数仍为情景输入。未叠加旧版风险附加。": [
    "The conflict map and public cloud regions support evidence review. Event frequency, propagation, recovery and cost inputs remain scenario assumptions. The legacy risk loading is not added.",
    "분쟁 지도와 공개 리전은 증빙 검토에 사용합니다. 빈도, 파급, 복구 및 비용 입력값은 시나리오 가정입니다. 기존 위험 가산은 중복 적용하지 않습니다.",
    "紛争地図と公開リージョンは証拠確認に用います。頻度・波及・復旧・コストはシナリオ仮定で、旧版のリスク付加率は重複計上しません。"
  ],
  "返回风险总览": [
    "Back to risk overview",
    "위험 개요로 돌아가기",
    "リスク概要に戻る"
  ],
  "M2时长基准": [
    "M2 duration reference",
    "M2 시간 기준",
    "M2時間基準"
  ],
  "M1条件受影响概率": [
    "M1 conditional impact probability",
    "M1 조건부 영향 확률",
    "M1条件付き影響確率"
  ],
  "资本成本率": [
    "Cost of capital",
    "자본비용률",
    "資本コスト率"
  ],
  "固定费用": [
    "Fixed expenses",
    "고정비",
    "固定費用"
  ],
  "变动费用率": [
    "Variable expense rate",
    "변동비율",
    "変動費用率"
  ],
  "年度参数赔款": [
    "Annual parametric payouts",
    "연간 파라메트릭 지급금",
    "年間パラメトリック給付"
  ],
  "事件与组合假设": [
    "Event and portfolio assumptions",
    "사건 및 포트폴리오 가정",
    "事象・ポートフォリオの仮定"
  ],
  "每区域共享事件流；M1、M2分别生成事件，并按时间顺序消耗共同年度限额。M2采用供电、通信、云设施三类路径，权重为40%、45%、15%；时长权重为55%、30%、15%。": [
    "Regional events are shared. M1 and M2 events consume the common annual limit chronologically. M2 power, network and cloud-facility pathway weights are 40%, 45% and 15%; duration weights are 55%, 30% and 15%.",
    "지역별 사건을 공유하며 M1·M2 사건은 시간순으로 공동 연간 한도를 소진합니다. M2 전력·통신·클라우드 시설 경로 가중치는 40%, 45%, 15%, 시간 가중치는 55%, 30%, 15%입니다.",
    "地域事象を共有し、M1・M2事象は時系列で共通年間限度額を消費します。M2の電力・通信・クラウド施設経路の重みは40%・45%・15%、時間の重みは55%・30%・15%です。"
  ],
  "模拟20,000个年度；比例分保后取组合最差1%年份分配资本。未叠加旧版风险附加，未将冲突观测次数直接转换为概率。": [
    "Simulate 20,000 years and allocate capital using the worst 1% of portfolio years after quota-share reinsurance. Neither legacy risk loading nor a direct count-to-probability conversion is applied.",
    "20,000년을 모의하고 비례 재보험 후 최악 1% 연도로 자본을 배분합니다. 기존 위험 가산이나 관측 건수의 직접적인 확률 변환은 적용하지 않습니다.",
    "20,000年を模擬し、比例再保険後の最悪1%年で資本を配賦します。旧版リスク付加率や観測件数から確率への直接変換は適用しません。"
  ],
  "生效后更新情景参数与未出单报价；历史事件热图及已确认保单不变。": [
    "Activation updates scenario inputs and unbound quotes; historical maps and confirmed policies stay unchanged.",
    "활성화 시 시나리오 입력과 미확정 견적만 갱신하며 과거 지도와 확정 증권은 유지합니다.",
    "有効化するとシナリオ入力値と未確定見積を更新し、過去事象の地図と確定証券は維持します。"
  ],
  "业务备用完成演练（原服务指标不变）": [
    "Business backup tested (original service metric unchanged)",
    "업무 백업 훈련 완료 (원 서비스 지표 유지)",
    "業務バックアップ訓練済み（元サービス指標は不変）"
  ],
  "共享事件组合情景；尚待经验校准": [
    "Shared-event portfolio scenario; empirical calibration pending",
    "공유 사건 포트폴리오 시나리오 · 경험적 보정 필요",
    "共有事象の組合せシナリオ・経験データ校正待ち"
  ],
  "四层定价情景启用": [
    "Four-component pricing scenario enabled",
    "4단계 요율 시나리오 활성화",
    "4構成の料率シナリオを有効化"
  ]
});

Object.assign(window.CBLocaleMessages,{'数据集地区归类':['Dataset area grouping','데이터셋 지역 분류','データセット上の地域分類']});
Object.assign(window.CBLocaleMessages,{
  '短时':['Short','단기','短時間'], '长时':['Long','장기','長時間'],
  '年度保费':['Annual premium','연간 보험료','年間保険料'],
  '贡献毛利':['Contribution margin','공헌이익','限界利益']
});

Object.assign(window.CBLocaleMessages,{'当前范围高事件数网格':['High-count cells in view','현재 범위의 사건 수 상위 격자','表示範囲内の事象数上位グリッド']});

Object.assign(window.CBLocaleMessages,{
  '拖动地图':['Drag to pan','드래그하여 이동','ドラッグで移動'],
  '所选区域高事件数网格':['High-count cells in selected area','선택 지역의 사건 수 상위 격자','選択地域内の事象数上位グリッド']
});

Object.assign(window.CBLocaleMessages,{
  "云区域与节点": [
    "Cloud regions & nodes",
    "클라우드 리전 및 노드",
    "クラウドリージョンとノード"
  ],
  "阿里云": [
    "Alibaba Cloud",
    "Alibaba Cloud",
    "Alibaba Cloud"
  ],
  "腾讯云": [
    "Tencent Cloud",
    "Tencent Cloud",
    "Tencent Cloud"
  ],
  "华为云": [
    "Huawei Cloud",
    "Huawei Cloud",
    "Huawei Cloud"
  ],
  "火山引擎": [
    "Volcengine",
    "Volcengine",
    "Volcengine"
  ],
  "云区域": [
    "Cloud region",
    "클라우드 리전",
    "クラウドリージョン"
  ],
  "经典数据中心": [
    "Classic data center",
    "클래식 데이터센터",
    "クラシックデータセンター"
  ],
  "边缘节点": [
    "Edge node",
    "엣지 노드",
    "エッジノード"
  ],
  "目录收录": [
    "Listed in catalog",
    "목록 수록",
    "一覧に掲載"
  ],
  "受限访问": [
    "Restricted access",
    "접근 제한",
    "アクセス制限あり"
  ],
  "已退役": [
    "Retired",
    "종료됨",
    "提供終了"
  ],
  "已公告": [
    "Announced",
    "발표됨",
    "発表済み"
  ],
  "位置待核实": [
    "Location unverified",
    "위치 확인 필요",
    "位置未確認"
  ],
  "国家 / 地区": [
    "Country / territory",
    "국가 / 지역",
    "国・地域"
  ],
  "全部国家 / 地区": [
    "All countries / territories",
    "전체 국가 / 지역",
    "すべての国・地域"
  ],
  "基础设施类型": [
    "Infrastructure type",
    "인프라 유형",
    "インフラ種別"
  ],
  "全部类型": [
    "All types",
    "전체 유형",
    "すべての種別"
  ],
  "目录状态": [
    "Catalog status",
    "목록 상태",
    "掲載状態"
  ],
  "现行目录": [
    "Current listings",
    "현재 목록",
    "現行の掲載項目"
  ],
  "包含公告与退役记录": [
    "Include announced & retired",
    "발표·종료 기록 포함",
    "発表済み・終了済みも含む"
  ],
  "搜索目录": [
    "Search catalog",
    "목록 검색",
    "一覧を検索"
  ],
  "搜索区域、城市或代码": [
    "Search region, city or code",
    "리전, 도시 또는 코드 검색",
    "リージョン・都市・コードを検索"
  ],
  "查看中国区域": [
    "View China locations",
    "중국 지역 보기",
    "中国の拠点を見る"
  ],
  "清空筛选": [
    "Clear filters",
    "필터 초기화",
    "絞り込みを解除"
  ],
  "下载完整目录": [
    "Download full catalog",
    "전체 목록 다운로드",
    "全一覧をダウンロード"
  ],
  "区域 / 节点": [
    "Region / node",
    "리전 / 노드",
    "リージョン・ノード"
  ],
  "没有匹配结果": [
    "No matching entries",
    "일치하는 항목 없음",
    "該当する項目がありません"
  ],
  "完整目录记录": [
    "Full catalog entries",
    "전체 목록 항목",
    "全一覧の件数"
  ],
  "符合筛选条件": [
    "Matching entries",
    "검색 조건 일치",
    "条件に一致する件数"
  ],
  "可定位记录": [
    "Mapped entries",
    "지도 표시 가능 항목",
    "地図に表示できる件数"
  ],
  "调整厂商、地区、类型或搜索条件。": [
    "Adjust the provider, location, type or search filters.",
    "공급자, 지역, 유형 또는 검색 조건을 변경하세요.",
    "事業者・地域・種別・検索条件を変更してください。"
  ],
  "行政区级": [
    "Administrative area",
    "행정구역 단위",
    "行政区域単位"
  ],
  "运营分区": [
    "Cloud partition",
    "운영 파티션",
    "クラウド区分"
  ],
  "运营方": [
    "Operator",
    "운영사",
    "運営事業者"
  ],
  "目录可用区 / 可用域": [
    "Listed zones / domains",
    "목록의 가용 영역 / 도메인",
    "掲載された可用ゾーン・ドメイン"
  ],
  "以具体产品目录为准": [
    "Check the product catalog",
    "제품별 목록 참조",
    "製品別の一覧を確認"
  ],
  "地图标记为城市或区域代表位置，不是具体机房地址。": [
    "Markers represent cities or regions, not exact facility addresses.",
    "표식은 도시나 리전의 대표 위치이며 정확한 시설 주소가 아닙니다.",
    "マーカーは都市や地域の代表位置であり、具体的な施設住所ではありません。"
  ],
  "位置未公开或尚未核实，保留目录记录，不在地图定位。": [
    "Location is unpublished or unverified; the catalog entry is retained without a map marker.",
    "위치가 미공개이거나 미확인되어 목록만 유지하며 지도에는 표시하지 않습니다.",
    "位置が非公開または未確認のため、一覧に残し、地図には表示しません。"
  ],
  "官方目录来源": [
    "Official catalog source",
    "공식 목록 출처",
    "公式一覧の出典"
  ],
  "可用区 / 可用域标识": [
    "Zone / domain identifiers",
    "가용 영역 / 도메인 식별자",
    "可用ゾーン・ドメインの識別子"
  ],
  "目录核对备注": [
    "Catalog verification notes",
    "목록 검증 참고",
    "一覧の確認事項"
  ],
  "状态依据": [
    "Status evidence",
    "상태 근거",
    "状態の根拠"
  ],
  "边缘网络节点不等于可部署虚拟机的云区域。": [
    "An edge network node is not a VM deployment region.",
    "엣지 네트워크 노드는 가상 머신을 배포하는 클라우드 리전이 아닙니다.",
    "エッジネットワークのノードはVMを配置するクラウドリージョンではありません。"
  ],
  "公开云基础设施目录": [
    "Public cloud infrastructure catalog",
    "공개 클라우드 인프라 목록",
    "公開クラウドインフラ一覧"
  ],
  "家厂商": [
    "providers",
    "개 공급자",
    "事業者"
  ],
  "按官方目录收录云区域、经典数据中心与边缘节点；分别标明运营分区、状态和位置精度。": [
    "Official listings of regions, classic data centers and edge nodes, with partition, status and location precision.",
    "공식 리전, 클래식 데이터센터 및 엣지 노드 목록에 운영 파티션, 상태와 위치 정밀도를 표시합니다.",
    "公式一覧のリージョン・クラシックDC・エッジノードに、クラウド区分・状態・位置精度を記載します。"
  ],
  "目录覆盖与官方来源": [
    "Catalog coverage & official sources",
    "목록 범위 및 공식 출처",
    "一覧の対象範囲と公式出典"
  ],
  "记录数量按目录条目计算，不等于物理机房数量。边缘节点、云区域和经典数据中心分开筛选。": [
    "Counts represent catalog entries, not physical buildings. Filter edge nodes, cloud regions and classic data centers separately.",
    "수량은 물리적 건물이 아닌 목록 항목 수입니다. 엣지 노드, 클라우드 리전과 클래식 데이터센터를 각각 필터링할 수 있습니다.",
    "件数は物理的な建物数ではなく掲載項目数です。エッジノード・リージョン・クラシックDCは個別に絞り込めます。"
  ],
  "目录记录": [
    "Catalog entries",
    "목록 항목",
    "掲載件数"
  ],
  "中国内地": [
    "Mainland China",
    "중국 본토",
    "中国本土"
  ],
  "官方来源": [
    "Official sources",
    "공식 출처",
    "公式出典"
  ],
  "官方目录": [
    "Official catalog",
    "공식 목록",
    "公式一覧"
  ],
  "核对日期：2026-11-17。具体产品、配额与实时运行状态需另行核验。": [
    "Checked 2026-11-17. Product availability, quotas and live health require separate verification.",
    "확인일: 2026-11-17. 제품 가용성, 할당량 및 실시간 상태는 별도 확인이 필요합니다.",
    "確認日：2026-11-17。製品提供状況・割当量・稼働状況は別途確認が必要です。"
  ],
  "蓝色圆圈：公开基础设施近似位置；同城记录可能重叠，可用目录选择具体条目。": [
    "Blue circles: approximate public infrastructure locations. City markers may overlap; select individual entries from the catalog.",
    "파란 원: 공개 인프라의 대략적 위치. 같은 도시의 표식은 겹칠 수 있으며 목록에서 개별 항목을 선택할 수 있습니다.",
    "青い円は公開インフラの概略位置。同じ都市のマーカーは重なる場合があるため、一覧で各項目を選択できます。"
  ]
});

Object.assign(window.CBLocaleMessages,{"正在加载事件目录…": ["Loading event catalog…", "사건 목록 로딩 중…", "事象一覧を読み込み中…"], "具体事件目录": ["Event catalog", "사건 목록", "事象一覧"], "条记录": ["records", "건", "件"], "事件所属地区": ["Event area", "사건 지역", "事象の地域"], "事件编号": ["Event ID", "사건 ID", "事象ID"], "日期区间": ["Date interval", "날짜 구간", "日付範囲"], "地点与行政区": ["Location and administrative area", "장소 및 행정구역", "地点と行政区域"], "已纳入精细热图": ["Included in fine grid", "상세 격자에 포함", "詳細グリッドに収録"], "未纳入精细热图": ["Excluded from fine grid", "상세 격자에서 제외", "詳細グリッド対象外"], "页": ["pages", "페이지", "ページ"], "每页": ["Per page", "페이지당", "1ページ"], "首页": ["First", "처음", "先頭"], "上一页": ["Previous", "이전", "前へ"], "下一页": ["Next", "다음", "次へ"], "末页": ["Last", "마지막", "最後"], "来源与方法": ["Sources and methodology", "출처 및 방법", "出典と手法"], "目录包含粗精度记录；地图仅纳入位置精度 1–2 的记录。地区名称沿用数据集分类。": ["Catalog includes coarse locations; the map uses precision 1–2 only. Area labels follow the dataset.", "목록에는 낮은 정밀도 기록도 포함하며 지도는 정밀도 1–2만 사용합니다. 지역명은 원본 분류를 따릅니다.", "一覧には粗い位置情報も含みます。地図は精度1–2のみを使用し、地域名はデータセットに従います。"], "事件目录加载失败，请重试。": ["Event catalog failed to load. Please retry.", "사건 목록 로딩 실패. 다시 시도하세요.", "事象一覧の読み込みに失敗しました。再試行してください。"], "重试": ["Retry", "다시 시도", "再試行"]});

Object.assign(window.CBLocaleMessages,{'城市目录标识，非厂商区域代码。':['City catalog identifier, not a provider region code.','도시 목록 식별자이며 공급자 리전 코드가 아닙니다.','都市一覧の識別子であり、事業者のリージョンコードではありません。'],'城市参考坐标':['Reference city coordinates','도시 참고 좌표','都市の参考座標'],'坐标来源':['Coordinate source','좌표 출처','座標の出典']});
Object.assign(window.CBLocaleMessages,{
 "点击热图网格查看该区域的事件":["Select a heatmap cell to view its events","히트맵 격자를 선택하여 해당 사건을 확인하세요","ヒートマップのセルを選択して事象を表示"],
 "所选网格":["Selected cell","선택한 격자","選択中のセル"],
 "具体地点":["Named location","특정 위치","特定の地点"],
 "已知点周边":["Around a known point","확인된 지점 주변","既知の地点の周辺"],
 "该网格在当前年度及类型下没有事件":["No events in this cell for the selected year and type","선택한 연도 및 유형에 해당하는 사건이 없습니다","選択した年・種別の事象はこのセルにありません"],
 "跳至":["Go to","이동","移動先"],
 "页码":["Page number","페이지 번호","ページ番号"],
 "跳转":["Go","이동","移動"],
 "列明承保区域":["Scheduled coverage regions","명시된 보장 지역","明記された補償地域"],
 "项列明服务":["scheduled services","개 명시 서비스","件の明記サービス"],
 "个区域":["regions","개 지역","地域"],
 "标记表示列明承保区域，不是具体设施地址。":["Markers represent scheduled coverage regions, not facility addresses.","표시는 명시된 보장 지역이며 시설 주소가 아닙니다.","マーカーは明記された補償地域を示し、施設の所在地ではありません。"],
 "勾选下方列明服务，查看对应区域的风险暴露。":["Select services below to view exposure in their coverage regions.","아래 서비스를 선택하면 해당 보장 지역의 노출을 확인할 수 있습니다.","下のサービスを選択して、対応する補償地域のエクスポージャーを表示します。"],
 "选择事件网格":["Select an event cell","사건 격자 선택","事象セルを選択"],
 "已勾选服务":["Selected services","선택한 서비스","選択中のサービス"],
 "选择列明服务 ↓":["Select scheduled services ↓","명시 서비스 선택 ↓","明記サービスを選択 ↓"],
 "公开设施资料":["Public infrastructure catalog","공개 인프라 목록","公開インフラ資料"],
 "地图":["Map","지도","地図"]
});
Object.assign(window.CBLocaleMessages,{"来源":["Source","출처","出典"]});
Object.assign(window.CBLocaleMessages,{
 '全球总览':['Global overview','전 세계 개요','世界全体'],
 '主要云区域':['Key cloud regions','주요 클라우드 지역','主要クラウド地域'],
 '中国北部':['Northern China','중국 북부','中国北部'],
 '中国东部':['Eastern China','중국 동부','中国東部'],
 '点击云区域、事件网格或地图位置，展开周边设施。':['Select a cloud region, event cell or map location to explore nearby infrastructure.','클라우드 지역, 사건 격자 또는 지도 위치를 선택하여 주변 시설을 확인하세요.','クラウド地域、事象セル、地図上の位置を選択して周辺施設を表示します。'],
 '总览为区域导航，不按机房容量排名。':['Regional navigation; not a ranking by data center capacity.','지역 탐색용이며 데이터 센터 용량 순위가 아닙니다.','地域を探すための表示です。データセンターの容量ランキングではありません。'],
 '周边设施':['Nearby infrastructure','주변 시설','周辺施設'],
 '条目录记录':['catalog entries','개 목록 항목','件のカタログ記録'],
 '经纬度各 ±':['Longitude / latitude ±','경도 / 위도 ±','経度・緯度それぞれ ±'],
 '同址目录':['Entries at this location','동일 위치의 항목','同じ位置の記録'],
 '查看周边全部':['Show all nearby','주변 전체 보기','周辺をすべて表示'],
 '此范围内暂无可定位设施，可扩大检索范围。':['No mapped facilities in this area. Expand the search range.','이 범위에 위치가 확인된 시설이 없습니다. 검색 범위를 넓혀 보세요.','この範囲には位置が確認された施設がありません。検索範囲を広げてください。'],
 '所选设施':['Selected infrastructure','선택한 시설','選択した施設'],
 '邻近用于地图检索，不代表设施已受事件影响。':['Proximity is a browsing filter, not evidence of incident impact.','근접 여부는 지도 검색 기준이며 사건의 영향을 의미하지 않습니다.','近接範囲は地図検索用であり、事象による影響を示すものではありません。'],
 '周边检索范围':['Nearby search range','주변 검색 범위','周辺検索範囲'],
 '返回全球总览':['Back to global overview','전 세계 개요로 돌아가기','世界全体に戻る']
});

Object.assign(window.CBLocaleMessages,{"邻近合并目录":["Grouped nearby entries","인접 통합 항목","近接する記録のグループ"]});
Object.assign(window.CBLocaleMessages,{
 '返回上一级':['Back one level','이전 단계로','一つ前に戻る'],
 '拖动 / 双指缩放':['Drag / pinch to zoom','드래그 / 두 손가락 확대·축소','ドラッグ / ピンチで拡大・縮小']
});
Object.assign(window.CBLocaleMessages,{
 '全球设施分布':['Global infrastructure','전 세계 시설 분포','世界のインフラ分布'],
 '点击设施圆点展开，滚轮或双指缩放地图。':['Select a facility marker to explore; scroll or pinch to zoom.','시설 표시를 선택하여 살펴보고 스크롤 또는 두 손가락으로 확대·축소하세요.','施設マーカーを選択して詳細を表示。スクロールやピンチで拡大・縮小できます。'],
 '快速定位':['Quick navigation','빠른 이동','クイック移動'],
 '按设施类型分层，非容量或机房等级排名。':['Layers show infrastructure types, not capacity or data center tier rankings.','시설 유형별 표시이며 용량이나 데이터 센터 등급 순위가 아닙니다.','施設の種類による分類であり、容量やデータセンター等級の順位ではありません。'],
 '可定位目录':['Mapped entries','위치 확인 항목','位置確認済みの記録'],
 '圆圈大小表示聚合数量':['Circle size indicates grouped entries','원 크기는 통합 항목 수를 나타냅니다','円の大きさは集約された記録数を示します']
});

Object.assign(window.CBLocaleMessages,{"区域聚合":["Regional clusters","지역 통합","地域クラスター"]});
Object.assign(window.CBLocaleMessages,{
 '观测数据 · 2016–2025':['Observed data · 2016–2025','관측 데이터 · 2016–2025','観測データ · 2016–2025'],
 '观察窗口':['Observation window','관측 기간','観測期間'],
 '近五年基准（2021–2025）':['5-year baseline (2021–2025)','5년 기준 (2021–2025)','5年基準（2021–2025）'],
 '近十年对照（2016–2025）':['10-year comparison (2016–2025)','10년 비교 (2016–2025)','10年比較（2016–2025）'],
 '单年查询':['Single year','연도별 조회','単年表示'],
 '多年基准':['Multi-year baseline','다년 기준','複数年基準'],
 '全球历史基准':['Global historical baseline','전 세계 과거 기준','世界の過去基準'],
 '当年事件数':['Annual event count','해당 연도 사건 수','当該年の事象数'],
 '年均事件数':['Mean annual events','연평균 사건 수','年平均事象数'],
 '网格年均事件数':['Mean annual events in cell','격자 내 연평균 사건 수','セル内の年平均事象数'],
 '年均纳入热图':['Mapped events per year','연평균 지도 포함 사건','年平均の地図掲載事象'],
 '期间累计':['Period total','기간 합계','期間合計'],
 '逐年趋势':['Annual trend','연도별 추이','年次推移'],
 '所选网格 · 纳入热图事件':['Selected cell · mapped events','선택한 격자 · 지도 포함 사건','選択セル · 地図掲載事象'],
 '全球 · 纳入热图事件':['Global · mapped events','전 세계 · 지도 포함 사건','世界 · 地図掲載事象'],
 '点击年份查看当年事件':['Select a year to view its events','연도를 선택하면 해당 사건을 표시합니다','年を選択して当該年の事象を表示'],
 '点击热图网格查看局部趋势与事件目录。':['Select a heatmap cell for its trend and event directory.','히트맵 격자를 선택하여 해당 추이와 사건 목록을 확인하세요.','ヒートマップのセルを選択して推移と事象一覧を表示します。'],
 '统计位置精度 1–2 的事件；年均事件数不等于中断概率。':['Includes location precision 1–2; mean annual events are not outage probabilities.','위치 정밀도 1–2 사건 기준이며 연평균 사건 수는 중단 확률이 아닙니다.','位置精度1–2の事象を集計。年平均事象数は中断確率ではありません。'],
 '全球年均事件':['Global events per year','전 세계 연평균 사건','世界の年平均事象'],
 '年均未入图 · 位置精度不足':['Excluded per year · location uncertainty','연평균 제외 · 위치 불확실','年平均の除外事象 · 位置精度不足'],
 '该网格在当前时段及类型下没有事件':['No events in this cell for the selected period and type','선택한 기간 및 유형에 해당하는 사건이 없습니다','このセルには選択した期間・種別の事象がありません']
});
Object.assign(window.CBLocaleMessages,{"事件类型构成":["Event type breakdown","사건 유형별 구성","事象種別の内訳"]});

;
/* External event coverage UI: English, Korean, Japanese. */
Object.assign(window.CBLocaleMessages,{
  "外部事件中断": [
    "External Event Disruption",
    "외부 사건에 따른 중단",
    "外部事象による中断"
  ],
  "M2外部事件中断": [
    "M2 External Event Disruption",
    "M2 외부 사건에 따른 중단",
    "M2 外部事象による中断"
  ],
  "冲突观测与公开公告": [
    "Conflict records & public notices",
    "분쟁 기록 및 공개 공지",
    "紛争記録・公開通知"
  ],
  "设施与关键依赖": [
    "Infrastructure & dependencies",
    "시설 및 핵심 의존성",
    "施設・主要依存先"
  ],
  "证据来源": [
    "Evidence source",
    "근거 출처",
    "証拠の出典"
  ],
  "冲突事件统计": [
    "Conflict event records",
    "분쟁 사건 통계",
    "紛争事象の統計"
  ],
  "服务准入公告": [
    "Service access notices",
    "서비스 이용 자격 공지",
    "サービス利用資格の通知"
  ],
  "公开公告": [
    "Public notices",
    "공개 공지",
    "公開通知"
  ],
  "国家示意位置": [
    "Indicative country locations",
    "국가 단위 참고 위치",
    "国単位の参考位置"
  ],
  "公开公告 ≠ 客户实际中断": [
    "Public notice ≠ customer outage",
    "공개 공지 ≠ 고객 서비스 중단",
    "公開通知 ≠ 顧客の実際の中断"
  ],
  "事件 / 适用范围": [
    "Event / scope",
    "사건 / 적용 범위",
    "事象・適用範囲"
  ],
  "公告 / 生效": [
    "Notice / effective date",
    "공지 / 시행일",
    "通知日・発効日"
  ],
  "发布方": [
    "Issuer",
    "발행 기관",
    "発行元"
  ],
  "适用范围": [
    "Scope",
    "적용 범위",
    "適用範囲"
  ],
  "官方原文": [
    "Official source",
    "공식 원문",
    "公式原文"
  ],
  "特定IT与软件云服务限制": [
    "Restrictions on specified IT and software cloud services",
    "특정 IT 및 소프트웨어 클라우드 서비스 제한",
    "特定のIT・ソフトウェアクラウドサービスの制限"
  ],
  "开发者服务访问限制与许可恢复": [
    "Developer access restrictions and licensed restoration",
    "개발자 서비스 접근 제한 및 허가 후 복구",
    "開発者サービスの利用制限と許可後の復旧"
  ],
  "停止接受部分地区新注册": [
    "New registrations suspended in selected markets",
    "일부 지역 신규 가입 중단",
    "一部地域での新規登録停止"
  ],
  "俄罗斯境内适用对象；仅限公告列明的软件与服务，存在例外。": [
    "Applicable recipients in Russia; only specified software and services, with exceptions.",
    "러시아 내 적용 대상. 명시된 소프트웨어와 서비스만 포함하며 예외가 있습니다.",
    "ロシア国内の適用対象。指定ソフトウェア・サービスに限定され、例外があります。"
  ],
  "公告包含过渡期；不能等同于全部云服务停供。": [
    "The notice includes a transition period; it is not a blanket cloud-service shutdown.",
    "전환 기간이 포함되며 모든 클라우드 서비스의 중단을 의미하지 않습니다.",
    "移行期間を含み、全クラウドサービスの停止を意味しません。"
  ],
  "伊朗等受限制地区的部分服务访问；2021年取得许可后宣布恢复伊朗完整服务。": [
    "Some services were restricted in Iran and other affected markets; full access in Iran was announced in 2021 following a licence.",
    "이란 등 일부 지역의 서비스가 제한되었으며, 2021년 허가 취득 후 이란의 전체 서비스 복구가 발표되었습니다.",
    "イランなどで一部サービスが制限され、2021年に許可取得後のイラン向け全面復旧が発表されました。"
  ],
  "平台运行与特定用户访问资格需要分别核验。": [
    "Platform availability and a user's access eligibility require separate checks.",
    "플랫폼 가용성과 개별 사용자의 이용 자격을 각각 확인해야 합니다.",
    "プラットフォームの稼働と個別利用者の利用資格は別々に確認します。"
  ],
  "俄罗斯和白俄罗斯的新AWS注册。": [
    "New AWS registrations in Russia and Belarus.",
    "러시아 및 벨라루스의 AWS 신규 가입.",
    "ロシア・ベラルーシでのAWS新規登録。"
  ],
  "新注册受限不证明既有服务中断，不直接触发赔付。": [
    "A new-signup restriction does not prove an existing outage or trigger payment.",
    "신규 가입 제한은 기존 서비스 중단의 증거나 지급 요건이 아닙니다.",
    "新規登録制限は既存サービスの中断を証明せず、給付も直接発生しません。"
  ],
  "国家示意位置，不代表机房、影响半径或承保概率。": [
    "Country reference points, not facility locations, impact radii or insured probabilities.",
    "국가 참고 위치이며 시설 위치, 영향 반경 또는 보험 사고 확률이 아닙니다.",
    "国の参考位置であり、施設所在地・影響範囲・保険事故確率ではありません。"
  ],
  "3条公开公告 · 用于事件机制审查，不构成客户事故记录。": [
    "3 public notices · evidence of mechanisms, not customer incident records.",
    "공개 공지 3건 · 사건 경로 검토용이며 고객 사고 기록이 아닙니다.",
    "公開通知3件 · 発生経路の検討資料であり、顧客の事故記録ではありません。"
  ],
  "关键依赖": [
    "Critical dependency",
    "핵심 의존성",
    "主要な依存先"
  ],
  "使用地区 / 服务准入辖区": [
    "Usage location / access jurisdiction",
    "이용 지역 / 이용 자격 관할",
    "利用地域・利用資格の管轄"
  ],
  "企业使用地区": [
    "Business usage location",
    "기업 이용 지역",
    "企業の利用地域"
  ],
  "合同与使用主体": [
    "Contracting and using entity",
    "계약 및 이용 주체",
    "契約・利用主体"
  ],
  "关键上游 / 数字依赖": [
    "Critical upstream / digital dependency",
    "핵심 상위 공급자 / 디지털 의존성",
    "主要な上流サービス・デジタル依存先"
  ],
  "服务准入辖区": [
    "Service access jurisdiction",
    "서비스 이용 자격 관할",
    "サービス利用資格の管轄"
  ],
  "投保企业": [
    "Applicant entity",
    "가입 기업",
    "申込企業"
  ],
  "待核实": [
    "Unverified",
    "확인 필요",
    "未確認"
  ],
  "替代服务使用资格": [
    "Alternative service eligibility",
    "대체 서비스 이용 자격",
    "代替サービスの利用資格"
  ],
  "备用容量与交付能力": [
    "Alternative capacity and delivery",
    "대체 용량 및 제공 능력",
    "代替容量・提供能力"
  ],
  "尚未验证": [
    "Not verified",
    "미검증",
    "未検証"
  ],
  "已验证可合法使用": [
    "Lawful access verified",
    "적법한 이용 확인",
    "適法な利用を確認済み"
  ],
  "不满足条件": [
    "Requirements not met",
    "요건 미충족",
    "要件未充足"
  ],
  "已验证可用": [
    "Availability verified",
    "가용성 확인",
    "利用可能性を確認済み"
  ],
  "迁移适配所需时间（小时）": [
    "Migration and adaptation time (hours)",
    "이전 및 연동 소요 시간",
    "移行・適応の所要時間（時間）"
  ],
  "投保前是否存在已知限制": [
    "Known restrictions before inception",
    "가입 전 알려진 제한",
    "契約開始前の既知の制限"
  ],
  "未发现已公告限制": [
    "No announced restrictions identified",
    "공표된 제한 없음",
    "公表済みの制限なし"
  ],
  "存在已公告限制": [
    "Announced restrictions exist",
    "공표된 제한 있음",
    "公表済みの制限あり"
  ],
  "已知限制与除外记录": [
    "Known restrictions and exclusion record",
    "알려진 제한 및 면책 기록",
    "既知の制限・免責の記録"
  ],
  "第三国关键依赖受损": [
    "Critical dependency disrupted in a third country",
    "제3국 핵심 의존 대상 손상",
    "第三国の主要依存先の障害"
  ],
  "强制性连接限制": [
    "Mandatory connectivity restriction",
    "강제 연결 제한",
    "強制的な接続制限"
  ],
  "技术服务准入变化": [
    "Technology service access change",
    "기술 서비스 이용 자격 변경",
    "技術サービスの利用資格変更"
  ],
  "公告或证据编号": [
    "Notice or evidence reference",
    "공지 또는 증거 번호",
    "通知・証拠の参照番号"
  ],
  "事件公告时间": [
    "Event notice time",
    "사건 공지 시각",
    "事象の通知時刻"
  ],
  "限制生效时间": [
    "Restriction effective time",
    "제한 시행 시각",
    "制限の発効時刻"
  ],
  "投保前已知该停供安排": [
    "Cessation was known before inception",
    "가입 전에 공급 중단 일정 인지",
    "契約開始前に停止予定を認識"
  ],
  "事件公告": [
    "Event notice",
    "사건 공지",
    "事象の通知"
  ],
  "限制生效": [
    "Restriction effective",
    "제한 시행",
    "制限の発効"
  ],
  "实际中断": [
    "Actual interruption",
    "실제 중단",
    "実際の中断"
  ],
  "合格恢复": [
    "Qualified recovery",
    "요건 충족 복구",
    "要件を満たす復旧"
  ],
  "公告与过渡准备不计赔；仅累计实际中断，恢复后停止。": [
    "Notice and preparation time are excluded; only actual interruption counts, ending at recovery.",
    "공지와 준비 기간은 제외하고 실제 중단만 산정하며 복구 시 종료합니다.",
    "通知・準備期間を除外し、実際の中断のみを計上して復旧時に終了します。"
  ],
  "当前为原版保单，新增责任不自动适用。": [
    "Original policy version: new coverage does not apply automatically.",
    "기존 약관 버전: 신규 보장이 자동 적용되지 않습니다.",
    "元の契約版のため、新しい補償は自動適用されません。"
  ],
  "已核实列明外部事件、适用主体及生效范围": [
    "Specified event, affected entity and effective scope verified",
    "명시된 사건, 적용 주체 및 시행 범위 확인",
    "指定事象・対象主体・発効範囲を確認済み"
  ],
  "已核实受影响服务与关键数字依赖": [
    "Affected service and critical digital dependency verified",
    "영향 서비스 및 핵심 디지털 의존성 확인",
    "影響を受けたサービスと主要依存先を確認済み"
  ],
  "已核实外部事件至实际业务中断的因果链": [
    "Causal link from external event to actual interruption verified",
    "외부 사건에서 실제 업무 중단까지의 인과관계 확인",
    "外部事象から実際の業務中断までの因果関係を確認済み"
  ],
  "已复核准入资格、特别约定及原有除外": [
    "Access eligibility, special terms and existing exclusions reviewed",
    "이용 자격, 특별 약정 및 기존 면책 검토",
    "利用資格・特約・既存の免責を確認済み"
  ],
  "已复核责任事实、适用条款及争议部分": [
    "Facts, applicable terms and disputed items reviewed",
    "책임 사실, 적용 약관 및 쟁점 검토",
    "責任事実・適用条項・争点を確認済み"
  ],
  "已确定两种分类均属承保责任，仅模块分配待定": [
    "Both classifications covered; module allocation pending",
    "두 분류 모두 보장되며 모듈 배분만 미정",
    "両分類とも補償対象で、モジュール配分のみ未確定"
  ],
  "原服务不可用 → 合格替代恢复 → 可赔时长": [
    "Service unavailable → qualified recovery → payable duration",
    "서비스 중단 → 적격 대체 복구 → 지급 대상 시간",
    "サービス停止 → 適格な代替復旧 → 給付対象時間"
  ],
  "合格替代已验证": [
    "Qualified alternative verified",
    "적격 대체 수단 검증",
    "適格な代替手段を検証済み"
  ],
  "替代能力尚未验证": [
    "Alternative capability unverified",
    "대체 능력 미검증",
    "代替能力は未検証"
  ],
  "过渡准备期": [
    "Transition preparation",
    "전환 준비 기간",
    "移行準備期間"
  ],
  "迁移适配": [
    "Migration & adaptation",
    "이전 및 연동",
    "移行・適応"
  ],
  "事件路径": [
    "Event pathway",
    "사건 경로",
    "事象の経路"
  ],
  "原服务不可用（短 / 中 / 长）": [
    "Original outage (short / medium / long)",
    "기존 서비스 중단 (단기 / 중기 / 장기)",
    "元のサービス停止（短・中・長）"
  ],
  "有效中断（短 / 中 / 长）": [
    "Effective outage (short / medium / long)",
    "유효 중단 (단기 / 중기 / 장기)",
    "有効中断（短・中・長）"
  ],
  "服务准入变化": [
    "Service access change",
    "서비스 이용 자격 변경",
    "サービス利用資格の変更"
  ],
  "仅经验证的使用资格、容量、切换演练及独立上游可缩短模型时长；再扣等待期，取营业时段交集并应用限额。公告本身不计赔。": [
    "Only verified eligibility, capacity, failover and independent upstreams shorten modeled duration. Waiting time, business hours and limits then apply. Notices alone do not trigger payment.",
    "검증된 이용 자격, 용량, 전환 훈련 및 독립 상위 공급자만 모델 중단 시간을 줄입니다. 이후 대기 시간, 영업 시간과 한도를 적용합니다. 공지만으로 지급하지 않습니다.",
    "利用資格・容量・切替訓練・上流の独立性が検証済みの場合のみモデル時間を短縮します。その後に待機時間・営業時間・限度額を適用し、通知だけでは給付しません。"
  ],
  "准入事件年度概率（情景）": [
    "Annual access-event probability (scenario)",
    "연간 이용 자격 사건 확률 (시나리오)",
    "利用資格事象の年確率（シナリオ）"
  ],
  "可用过渡准备期（情景）": [
    "Available transition time (scenario)",
    "전환 준비 가능 시간 (시나리오)",
    "利用可能な移行準備時間（シナリオ）"
  ],
  "服务依赖与合格恢复": [
    "Dependencies and qualified recovery",
    "서비스 의존성 및 적격 복구",
    "サービス依存先・適格な復旧"
  ],
  "有效中断时长": [
    "Effective interruption duration",
    "유효 중단 시간",
    "有効な中断時間"
  ],
  "区域依赖事件概率（%）": [
    "Regional dependency probability (%)",
    "지역 의존 사건 확률 (%)",
    "地域依存事象の確率（%）"
  ],
  "外部事件证据": [
    "External event evidence",
    "외부 사건 증거",
    "外部事象の証拠"
  ],
  "关键依赖 / 服务准入": [
    "Dependencies / service access",
    "핵심 의존성 / 서비스 이용 자격",
    "主要依存先・サービス利用資格"
  ],
  "计时已纳入营业时段与经验证的替代恢复；过渡准备期不计赔。实际承保净损失仍在核赔时封顶，未由本情景模型预测。": [
    "Timing includes business hours and verified alternative recovery. Preparation is excluded. Actual covered net loss is a claim-stage ceiling, not forecast by this scenario model.",
    "영업 시간과 검증된 대체 복구를 반영하며 준비 기간은 제외합니다. 실제 보장 순손실은 심사 시 상한으로 적용하며 이 모델은 이를 예측하지 않습니다.",
    "営業時間と検証済みの代替復旧を反映し、準備期間は除外します。実際の補償純損失は査定時の上限であり、このモデルの予測対象ではありません。"
  ]
});

Object.assign(window.CBLocaleMessages,{
  "公告": [
    "Notice",
    "공지",
    "通知"
  ],
  "查看": [
    "View",
    "보기",
    "表示"
  ],
  "准入变化 → 过渡中断 → 替代恢复；同一套参数计算。": [
    "Access change → transition outage → alternative recovery; one payout formula.",
    "이용 자격 변경 → 전환 중단 → 대체 복구. 동일한 지급 공식 적용.",
    "利用資格変更 → 移行中断 → 代替復旧。同じ給付算式を適用。"
  ],
  "请完成外部事件、依赖因果链及适用责任核验": [
    "Verify the external event, dependency chain and applicable coverage.",
    "외부 사건, 의존 인과관계 및 적용 보장을 확인하세요.",
    "外部事象・依存先の因果関係・適用補償を確認してください。"
  ],
  "Y = min[约定小时金额 × min(最长赔付时长, max(有效中断时长 − 等待期, 0)), 服务与事故限额, 剩余年度限额]": [
    "Y = min[hourly amount × min(maximum payable hours, max(effective outage − waiting time, 0)), service/event limits, remaining annual limits]",
    "Y = min[시간당 약정액 × min(최대 지급 시간, max(유효 중단 − 대기 시간, 0)), 서비스/사고 한도, 잔여 연간 한도]",
    "Y = min[時間当たり約定額 × min(最大給付時間, max(有効中断 − 待機時間, 0)), サービス・事故限度額, 年間残限度額]"
  ],
  "当前客户与两家参考企业组成模拟组合。区域依赖事件按地区共享；服务准入事件按辖区共享；按再保险后组合年度赔款排序，取最差 1% 年份。": [
    "The simulated portfolio contains this applicant and two reference firms. Dependency events are shared by region and access events by jurisdiction. Capital uses the worst 1% of net portfolio loss years.",
    "현재 고객과 참고 기업 2곳의 모의 포트폴리오입니다. 의존 사건은 지역별, 이용 자격 사건은 관할별로 공유합니다. 재보험 후 연간 손실 중 최악의 1%를 사용합니다.",
    "当該顧客と参考企業2社の仮想ポートフォリオです。依存事象は地域別、利用資格事象は管轄別に共有し、再保険後の年間損失上位1%を用います。"
  ],
  "冲突热图、公开公告与云区域用于证据审查；事件频率、传播概率、恢复时长和成本参数仍为情景输入。未叠加旧版风险附加。": [
    "Conflict heatmaps, public notices and cloud regions support evidence review. Frequency, propagation, recovery and cost inputs remain scenario assumptions. Legacy risk loads are not added.",
    "분쟁 열지도, 공개 공지, 클라우드 리전은 증거 검토를 지원합니다. 빈도, 전파, 복구, 비용은 시나리오 가정이며 기존 위험 할증은 추가하지 않습니다.",
    "紛争ヒートマップ・公開通知・クラウドリージョンは証拠確認に用います。頻度・伝播・復旧・費用はシナリオ仮定で、旧版のリスク加算は追加しません。"
  ],
  "M2限列明的冲突外溢、强制性连接或技术服务准入限制。核验事件、关键依赖与实际不可用；公告本身不计赔，合格替代恢复后停止计时。投保前已知限制、迁移费用及原有除外不自动纳入；本演示不延长保单到期后的赔付期间。": [
    "M2 covers specified spillover, mandatory connectivity or technology-access restrictions. Verify the event, dependency and actual outage. Notice alone is not payable; qualified recovery ends timing. Known restrictions, migration costs and existing exclusions are not automatically covered; no post-expiry extension is assumed.",
    "M2는 명시된 분쟁 파급, 강제 연결 또는 기술 이용 자격 제한을 다룹니다. 사건, 의존성 및 실제 중단을 확인하며 공지만으로 지급하지 않고 적격 복구 시 종료합니다. 알려진 제한, 이전 비용 및 기존 면책은 자동 포함되지 않으며 만기 후 연장은 가정하지 않습니다.",
    "M2は指定された紛争波及・強制接続制限・技術利用資格制限を対象とします。事象・依存先・実際の中断を確認し、通知だけでは給付せず、適格な復旧で計時を終了します。既知の制限・移行費用・既存免責は自動的に対象とせず、満期後の延長も想定しません。"
  ],
  "区域依赖事件按地区共享；准入事件按服务准入辖区共享，可跨地区影响多个客户。统一计入M2，按时间顺序消耗事故与年度限额。有效中断由原服务不可用与合格替代恢复时间共同决定。": [
    "Regional dependency events are shared by location. Access events are shared by jurisdiction across clients and regions. Both enter M2 and consume event and annual limits chronologically. Effective interruption reflects original unavailability and qualified alternative recovery.",
    "지역 의존 사건은 지역별로, 이용 자격 사건은 관할별로 여러 고객과 지역에 공유됩니다. 모두 M2에 포함하여 시간순으로 사고 및 연간 한도를 적용합니다. 유효 중단은 기존 서비스 중단과 적격 대체 복구로 결정합니다.",
    "地域依存事象は所在地別、利用資格事象は管轄別に顧客・地域間で共有します。ともにM2へ計上し、時系列に事故・年間限度額を適用します。有効中断は元の停止と適格な代替復旧から求めます。"
  ],
  "事件证据编号": [
    "Event evidence reference",
    "사건 증거 번호",
    "事象の証拠番号"
  ],
  "请选择约定外部事件类型": [
    "Select a specified external event type.",
    "약정된 외부 사건 유형을 선택하세요.",
    "約定された外部事象の種類を選択してください。"
  ],
  "请登记事件公告或证据编号": [
    "Enter the notice or evidence reference.",
    "공지 또는 증거 번호를 입력하세요.",
    "通知または証拠番号を入力してください。"
  ],
  "物理外溢情景仍须核实设施国条件": [
    "Verify the facility-country condition for physical spillover.",
    "물리적 파급은 시설 소재국 요건을 확인해야 합니다.",
    "物理的波及は施設所在国の条件を確認してください。"
  ],
  "公告与生效时间无效": [
    "Invalid notice or effective time.",
    "공지 또는 시행 시각이 올바르지 않습니다.",
    "通知または発効時刻が無効です。"
  ],
  "本演示仅承保保险期间内新公告的约定事件": [
    "This scenario requires a newly announced event within the policy period.",
    "이 시나리오는 보험 기간 중 새로 공지된 사건을 요구합니다.",
    "このシナリオは保険期間内に新たに公表された事象を対象とします。"
  ],
  "投保前已知的停供安排不属于本次新增责任": [
    "A cessation known before inception is outside the new coverage.",
    "가입 전에 알려진 공급 중단은 신규 보장 대상이 아닙니다.",
    "契約開始前に既知の停止予定は新補償の対象外です。"
  ],
  "请补充迁移或减损措施": [
    "Provide migration or mitigation measures.",
    "이전 또는 손해 경감 조치를 추가하세요.",
    "移行・損害軽減措置を追加してください。"
  ],
  "准入变化事故不得从限制生效前开始计时": [
    "An access-change claim cannot start before the restriction takes effect.",
    "이용 자격 변경 사고는 제한 시행 전부터 산정할 수 없습니다.",
    "利用資格変更の事故は制限発効前から計時できません。"
  ],
  "投保前已知或保险期间外公告的限制不适用新增责任": [
    "Previously known restrictions or notices outside the policy period are outside the new coverage.",
    "가입 전 알려졌거나 보험 기간 외 공지된 제한은 신규 보장 대상이 아닙니다.",
    "契約前に既知、または保険期間外に公表された制限は新補償の対象外です。"
  ],
  "原版保单未包含技术准入变化责任": [
    "The original policy excludes the new access-change coverage.",
    "기존 약관에는 신규 이용 자격 변경 보장이 없습니다.",
    "元の契約に新しい利用資格変更の補償は含まれません。"
  ],
  "原版保单仍须核验物理事件、设施国与因果链": [
    "The original policy still requires physical-event, country and causality checks.",
    "기존 약관은 물리 사건, 시설 소재국 및 인과관계 확인이 필요합니다.",
    "元の契約は物理的事象・所在国・因果関係の確認が必要です。"
  ],
  "原版M2仅限约定物理冲突外溢；原保单条件与已确认报价不变。": [
    "Original M2 covers specified physical-conflict spillover only; confirmed terms and prices remain unchanged.",
    "기존 M2는 약정된 물리적 분쟁 파급만 보장하며 확정 약관과 견적은 유지됩니다.",
    "元のM2は約定された物理的紛争波及のみを対象とし、確定済み条件・見積額を維持します。"
  ],
  "示例供应商因新的技术服务准入限制，于11月3日通知客户在11月17日停止列明端点服务。原服务停供后，迁移适配尚未完成，关键业务实际中断110分钟。": [
    "A fictional provider announces on 3 November that a new access restriction will end the listed endpoint on 17 November. Migration remains incomplete at cessation, causing 110 minutes of actual business interruption.",
    "가상 공급자가 신규 이용 자격 제한으로 11월 17일 엔드포인트를 중단한다고 11월 3일 공지합니다. 중단 시 이전이 완료되지 않아 실제 업무가 110분간 중단됩니다.",
    "架空の事業者が、新たな利用資格制限により11月17日に端点を停止すると11月3日に通知します。停止時点で移行が未完了のため、業務が110分間中断します。"
  ],
  "11月3日启动替代方案；11月17日10:00原服务停供，11:20完成适配，11:50替代环境通过关键交易验证。": [
    "Alternative work starts on 3 November. On 17 November the original service stops at 10:00; adaptation finishes at 11:20 and critical transactions pass validation at 11:50.",
    "11월 3일 대체 작업을 시작합니다. 11월 17일 10:00 기존 서비스 중단, 11:20 연동 완료, 11:50 핵심 거래 검증을 통과합니다.",
    "11月3日に代替作業を開始。11月17日10:00に元サービス停止、11:20に適応完了、11:50に主要取引の検証を通過します。"
  ],
  "11:50合格替代服务恢复业务，原端点18:00恢复；赔付计时在11:50停止。": [
    "A qualified alternative restores business at 11:50; the original endpoint recovers at 18:00. Payable timing ends at 11:50.",
    "11:50 적격 대체 서비스로 업무가 복구되고 기존 엔드포인트는 18:00 복구됩니다. 지급 시간은 11:50 종료됩니다.",
    "11:50に適格な代替サービスで業務復旧、元の端点は18:00に復旧します。給付計時は11:50で終了します。"
  ],
  "待核验公告适用主体与服务范围、关键依赖、合理迁移措施和合格恢复记录；公告及准备期不计入赔付。": [
    "Verify notice applicability, service scope, critical dependencies, reasonable migration and qualified recovery records. Notice and preparation are excluded from payable time.",
    "공지 적용 주체, 서비스 범위, 핵심 의존성, 합리적 이전 및 적격 복구 기록을 확인합니다. 공지 및 준비 기간은 지급 시간에서 제외합니다.",
    "通知の対象主体・サービス範囲・主要依存先・合理的移行・適格復旧の記録を確認します。通知・準備期間は給付時間から除外します。"
  ]
});

Object.assign(window.CBLocaleMessages,{"中国":["China","중국","中国"],"投保 · 外部事件中断":["Include · External Event Disruption","가입 · 외부 사건에 따른 중단","加入 · 外部事象による中断"]});

Object.assign(window.CBLocaleMessages,{
"M2 区域依赖事件概率":["M2 regional dependency probability","M2 지역 의존 사건 확률","M2 地域依存事象の確率"],
"原版保单仅包含约定物理冲突外溢":["The original policy covers specified physical spillover only.","기존 약관은 약정된 물리적 분쟁 파급만 보장합니다.","元の契約は約定された物理的紛争波及のみを対象とします。"]});

Object.assign(window.CBLocaleMessages,{"CP-3.0 · 外部事件与恢复时长联动": ["CP-3.0 · External events and recovery timing", "CP-3.0 · 외부 사건 및 복구 시간 연계", "CP-3.0 · 外部事象と復旧時間の連動"], "客户提交外部事件中断投保单": ["External Event Disruption application submitted", "외부 사건 중단 가입 신청 제출", "外部事象中断の申込を提出"], "列明服务位于新加坡；使用资格受上游服务准入条件约束。用于演示新限制生效后的实际过渡中断。": ["The listed service is in Singapore; eligibility depends on upstream access conditions. This scenario shows actual transition interruption after a new restriction takes effect.", "명시된 서비스는 싱가포르에 있으며 상위 서비스 이용 조건이 적용됩니다. 신규 제한 시행 후 실제 전환 중단을 보여 줍니다.", "明記サービスはシンガポールにあり、上流サービスの利用資格条件に依存します。新制限発効後の実際の移行中断を示すシナリオです。"], "已取得约定物理事件及设施受损证据": ["Specified physical event and facility damage verified", "약정된 물리 사건 및 시설 손상 확인", "約定された物理的事象と施設損害を確認済み"], "已核实设施所在国为非直接交战国": ["Facility is in a non-belligerent third country", "시설 소재국이 직접 교전국이 아님을 확인", "施設所在国が非直接交戦国であることを確認済み"], "已核实物理事件至业务中断的完整因果链": ["Physical-event-to-business causal chain verified", "물리 사건부터 업무 중단까지 인과관계 확인", "物理的事象から業務中断までの因果関係を確認済み"], "核查外部事件、关键依赖、生效时间及合格恢复": ["Verify event, dependency, effective time and qualified recovery", "외부 사건, 핵심 의존성, 시행 시점 및 적격 복구 확인", "外部事象・主要依存先・発効時刻・適格復旧を確認"]});

;
/* Unified report UI: English, Korean, Japanese. */
Object.assign(window.CBLocaleMessages,{
  "统一报告样例": [
    "Unified report example",
    "통합 보고서 예시",
    "統一レポート例"
  ],
  "载入统一报告样例": [
    "Load report example",
    "보고서 예시 불러오기",
    "レポート例を読み込む"
  ],
  "完整精算报告 ↗": [
    "Full actuarial report ↗",
    "전체 계리 보고서 ↗",
    "精算レポート全文 ↗"
  ],
  "报告基准": [
    "Report baseline",
    "보고서 기준",
    "レポート基準"
  ],
  "研究报价": [
    "Research quote",
    "연구 견적",
    "研究試算"
  ],
  "研究情景": [
    "Research scenario",
    "연구 시나리오",
    "研究シナリオ"
  ],
  "当前投保单试算": [
    "Current application estimate",
    "현재 청약 견적",
    "現在の申込の試算"
  ],
  "待重新测算": [
    "Recalculation required",
    "재산출 필요",
    "再計算が必要"
  ],
  "投保条件已超出本版测算范围，请重新测算后报价。": [
    "The application differs from the modeled inputs. Recalculate before quoting.",
    "청약 조건이 산출 입력값과 다릅니다. 재산출 후 견적을 발행하세요.",
    "申込条件が計算済みの前提と異なります。再計算後に見積もりを発行してください。"
  ],
  "历史保单快照": [
    "Historical policy snapshot",
    "기존 증권 스냅샷",
    "旧契約のスナップショット"
  ],
  "原币种、责任与报价保持不变。": [
    "Original currency, coverage and quote are preserved.",
    "기존 통화, 보장 및 견적을 유지합니다.",
    "元の通貨・補償・見積もりを保持します。"
  ],
  "100张差异化示例保单 · 200,000个模拟年度": [
    "100 heterogeneous example policies · 200,000 simulated years",
    "서로 다른 예시 증권 100건 · 모의 연도 200,000회",
    "条件の異なるサンプル契約100件・20万年シミュレーション"
  ],
  "参数金额、贡献毛利净损失及限额": [
    "Parameter amount, net contribution-margin loss and limits",
    "매개변수 금액, 공헌이익 순손실 및 한도",
    "パラメトリック金額・限界利益の純損失・支払限度"
  ],
  "已纳入风险模拟": [
    "Included in risk simulation",
    "위험 시뮬레이션에 반영",
    "リスクシミュレーションに反映"
  ],
  "工作日 09:00–17:00": [
    "Weekdays 09:00–17:00",
    "평일 09:00–17:00",
    "平日 09:00–17:00"
  ],
  "赔款计算与业务依赖": [
    "Claims calculation and dependencies",
    "보험금 산출 및 의존 관계",
    "保険金計算と業務依存"
  ],
  "核心业务与独立AI业务分别核定；同一业务的多项依赖不重复相加。先逐业务取参数金额与净损失的较低值，再共用事故和年度限额。": [
    "Core and independent AI businesses are assessed separately. Multiple dependencies do not duplicate a business loss. Apply each business’s net-loss cap, then shared event and annual limits.",
    "핵심 업무와 독립 AI 업무를 별도로 평가합니다. 여러 의존 서비스로 같은 손실을 중복 계산하지 않습니다. 업무별 순손실 상한 적용 후 공통 사고·연간 한도를 적용합니다.",
    "基幹業務と独立AI業務を個別に査定します。複数の依存先による同一損失は重複計上せず、業務別純損失上限の後に共通の事故・年間限度を適用します。"
  ],
  "逐事件自留额": [
    "Per-event retention",
    "사고별 보유액",
    "1事故あたりの保有額"
  ],
  "层限额 / 年度容量": [
    "Layer limit / annual capacity",
    "레이어 한도 / 연간 용량",
    "レイヤー限度額／年間引受容量"
  ],
  "同一事件的多客户赔款合并后应用超赔层；按各客户事件赔款分配回收。再保险费按预计回收份额分摊，无自动复效。": [
    "Apply the excess layer to all claims from one event. Allocate recoveries by event claims and reinsurance premium by expected recoveries. No automatic reinstatement.",
    "같은 사고의 고객 보험금을 합산해 초과손해액 재보험을 적용합니다. 사고 보험금으로 회수액을, 예상 회수 비중으로 재보험료를 배분하며 자동 복원은 없습니다.",
    "同一事故の複数契約の保険金を合算して超過損害額再保険を適用します。回収額は事故保険金、再保険料は期待回収額に応じて配賦し、自動復元はありません。"
  ],
  "再保责任范围": [
    "Reinsurance scope",
    "재보험 보장 범위",
    "再保険の補償範囲"
  ],
  "M1 + 完整M2（目标条件）": [
    "M1 + full M2 (target terms)",
    "M1 + 전체 M2 (목표 조건)",
    "M1＋M2全範囲（目標条件）"
  ],
  "仅M1；M2全部自留": [
    "M1 only; M2 fully retained",
    "M1만 보장; M2 전액 보유",
    "M1のみ・M2は全額保有"
  ],
  "再保价格为预算情景，尚未取得市场合同。": [
    "Reinsurance pricing is a budget scenario; no market contract has been secured.",
    "재보험 가격은 예산 시나리오이며 실제 계약은 확보되지 않았습니다.",
    "再保険価格は予算シナリオであり、市場での契約は未取得です。"
  ],
  "组合净TVaR 99%": [
    "Portfolio net TVaR 99%",
    "포트폴리오 순 TVaR 99%",
    "ポートフォリオ純TVaR 99%"
  ],
  "组合年均净赔款": [
    "Portfolio mean annual net claims",
    "포트폴리오 연평균 순보험금",
    "ポートフォリオの年間平均純保険金"
  ],
  "100张保单共享事件、上游与准入辖区；各客户资本贡献加总等于组合净资本。": [
    "100 policies share event, upstream and access-jurisdiction risks. Client capital allocations sum to portfolio net capital.",
    "증권 100건이 사고, 상위 서비스 및 접근 관할 위험을 공유합니다. 고객별 자본 배분 합계는 포트폴리오 순자본과 같습니다.",
    "100契約で事故・上流サービス・利用規制のリスクを共有し、各契約の資本配賦の合計がポートフォリオ純資本と一致します。"
  ],
  "固定及按案费用 F": [
    "Fixed and per-claim expenses F",
    "고정 및 건별 비용 F",
    "固定費・案件処理費 F"
  ],
  "监测、核保和按案处理逐项预算；变动费用不重复计入这些项目。": [
    "Monitoring, underwriting and claim handling are budgeted separately; variable expenses exclude these items.",
    "모니터링, 인수 심사, 보험금 처리를 개별 예산화하며 변동비에 중복 반영하지 않습니다.",
    "監視・引受審査・保険金処理を個別に予算化し、変動費に重複計上しません。"
  ],
  "承保组合": [
    "Insured portfolio",
    "인수 포트폴리오",
    "引受ポートフォリオ"
  ],
  "测算情景": [
    "Pricing scenario",
    "산출 시나리오",
    "算出シナリオ"
  ],
  "版本": [
    "Version",
    "버전",
    "バージョン"
  ],
  "情景切换读取完整组合的预计算结果；成本率调整按同一赔款分布重新分解保费。": [
    "Scenarios use precomputed portfolio results. Cost-rate changes recalculate premiums from the same claims distribution.",
    "시나리오는 사전 산출된 포트폴리오 결과를 사용합니다. 비용률 변경은 동일 보험금 분포로 보험료를 다시 산출합니다.",
    "シナリオは計算済みポートフォリオ結果を使用し、費用率変更は同一保険金分布から保険料を再計算します。"
  ],
  "危险性、暴露与恢复假设": [
    "Hazard, exposure and recovery assumptions",
    "위험, 노출 및 복구 가정",
    "ハザード・エクスポージャー・復旧の前提"
  ],
  "M1广泛 / 特定功能条件命中": [
    "M1 broad / feature-specific conditional hit",
    "M1 광범위 / 특정 기능 조건부 영향",
    "M1広範囲／特定機能の条件付き影響"
  ],
  "M2区域 / 准入辖区事件频率": [
    "M2 region / access-jurisdiction event rate",
    "M2 리전 / 접근 관할 사건 빈도",
    "M2地域／利用規制管轄の事象頻度"
  ],
  "M2条件命中（基准）": [
    "M2 conditional hit (baseline)",
    "M2 조건부 영향 (기준)",
    "M2条件付き影響（基準）"
  ],
  "物理中断时长": [
    "Physical interruption duration",
    "물리적 중단 시간",
    "物理的中断の継続時間"
  ],
  "公告准备期": [
    "Notice lead time",
    "공지 준비 기간",
    "告知からの準備期間"
  ],
  "迁移适配时长": [
    "Migration and adaptation time",
    "이전 및 적용 시간",
    "移行・適合作業時間"
  ],
  "上述概率和恢复参数为研究情景。公共事件目录提供机制和范围证据，不直接给出客户出险率。": [
    "Probabilities and recovery inputs are research scenarios. Public records support mechanisms and scope, not client claim rates.",
    "확률 및 복구 입력값은 연구 시나리오입니다. 공개 자료는 작동 원리와 범위의 근거이며 고객 사고율은 아닙니다.",
    "確率・復旧パラメーターは研究シナリオです。公開記録は仕組みと範囲の根拠であり、顧客の事故率ではありません。"
  ],
  "示例保单": [
    "Example policies",
    "예시 증권",
    "サンプル契約"
  ],
  "组合小时金额": [
    "Portfolio hourly amount",
    "포트폴리오 시간당 금액",
    "ポートフォリオ時間額"
  ],
  "最大厂商 / 地区占比": [
    "Largest provider / region share",
    "최대 공급자 / 리전 비중",
    "最大事業者／地域の割合"
  ],
  "组合平均年保费": [
    "Portfolio mean annual premium",
    "포트폴리오 평균 연보험료",
    "ポートフォリオ平均年保険料"
  ],
  "已有保单价格锁定；新增业务须重新检查组合容量，不能直接当作第101张保单沿用价格。": [
    "Existing policy prices are locked. New business requires a portfolio capacity review; the same price cannot be assumed for a 101st policy.",
    "기존 증권 가격은 고정됩니다. 신규 인수 시 포트폴리오 용량을 재검토해야 하며 101번째 증권에 같은 가격을 가정할 수 없습니다.",
    "既存契約の価格は固定します。新規引受ではポートフォリオ容量を再審査し、101件目に同じ価格をそのまま適用しません。"
  ],
  "服务商 / 区域": [
    "Provider / region",
    "공급자 / 리전",
    "サービス事業者／地域"
  ],
  "业务 / 备用": [
    "Business / backup",
    "업무 / 예비 환경",
    "業務／予備環境"
  ],
  "报告敏感性": [
    "Report sensitivities",
    "보고서 민감도",
    "レポート感応度"
  ],
  "采用报告默认成本率；情景范围不是统计置信区间。全组合备用与集中度变化包含组合影响。": [
    "Report-default cost rates. Scenario ranges are not confidence intervals. Portfolio backup and concentration scenarios include portfolio effects.",
    "보고서 기본 비용률을 적용합니다. 시나리오 범위는 신뢰구간이 아닙니다. 예비 환경 및 집중도 변화에는 포트폴리오 효과가 포함됩니다.",
    "レポート既定の費用率を適用します。シナリオ範囲は信頼区間ではなく、予備環境・集中度の変更にはポートフォリオ効果が含まれます。"
  ],
  "相对基准": [
    "Vs. baseline",
    "기준 대비",
    "基準比"
  ],
  "M2低情景": [
    "M2 low scenario",
    "M2 낮은 시나리오",
    "M2低位シナリオ"
  ],
  "M2高情景": [
    "M2 high scenario",
    "M2 높은 시나리오",
    "M2高位シナリオ"
  ],
  "M2未获再保": [
    "M2 without reinsurance",
    "M2 재보험 미확보",
    "M2再保険未取得"
  ],
  "M1频率减半": [
    "M1 frequency halved",
    "M1 빈도 절반",
    "M1頻度半減"
  ],
  "M1频率加倍": [
    "M1 frequency doubled",
    "M1 빈도 두 배",
    "M1頻度倍増"
  ],
  "组合高度集中": [
    "High portfolio concentration",
    "높은 포트폴리오 집중도",
    "高いポートフォリオ集中度"
  ],
  "全组合无备用": [
    "No portfolio backups",
    "전체 포트폴리오 예비 환경 없음",
    "全契約に予備環境なし"
  ],
  "全组合已测试备用": [
    "Tested backups across portfolio",
    "전체 포트폴리오 예비 환경 검증",
    "全契約の予備環境を検証済み"
  ],
  "首次投保年度": [
    "First insured year",
    "최초 가입 연도",
    "初回保険年度"
  ],
  "投保条件变化后原报价失效；已确认保单保留原币种、条款和报价快照。": [
    "Changed application terms invalidate unbound quotes. Bound policies retain their original currency, terms and quote snapshot.",
    "청약 조건 변경 시 미체결 견적은 무효화됩니다. 확정 증권은 기존 통화, 조건 및 견적을 유지합니다.",
    "申込条件の変更で未成立見積もりは失効し、成立済み契約は元の通貨・条件・見積もりを保持します。"
  ],
  "恢复当前生效参数": [
    "Restore active parameters",
    "현재 유효한 매개변수 복원",
    "現在の有効パラメーターを復元"
  ],
  "首次连续承保日期": [
    "First continuous inception date",
    "최초 연속 보장 시작일",
    "継続補償の初回始期日"
  ],
  "连续续保": [
    "Continuous renewal",
    "연속 갱신",
    "連続更新"
  ],
  "首次承保日期不得晚于本期起保日期": [
    "First inception cannot follow the current policy start",
    "최초 보장 시작일은 현재 보험기간 시작일보다 늦을 수 없습니다",
    "初回始期日は今期始期日以前にしてください"
  ],
  "同一事件的其他业务": [
    "Other businesses in the same event",
    "동일 사고의 다른 업무",
    "同一事故のその他の業務"
  ],
  "受影响业务": [
    "Affected business",
    "영향받은 업무",
    "影響を受けた業務"
  ],
  "业务中断": [
    "Business interruption",
    "업무 중단",
    "業務中断"
  ],
  "业务恢复": [
    "Business recovery",
    "업무 복구",
    "業務復旧"
  ],
  "不可追回贡献毛利": [
    "Irrecoverable contribution margin",
    "회복 불가능한 공헌이익",
    "回収不能な限界利益"
  ],
  "同损失补偿": [
    "Other compensation for this loss",
    "동일 손실에 대한 기타 보상",
    "同一損失への他の補償"
  ],
  "添加受影响业务": [
    "Add affected business",
    "영향받은 업무 추가",
    "影響業務を追加"
  ],
  "可赔分钟": [
    "Payable minutes",
    "지급 대상 분",
    "支払対象分数"
  ],
  "逐业务金额": [
    "Business amount",
    "업무별 금액",
    "業務別金額"
  ],
  "各独立业务分别计算后汇总": [
    "Sum of separately calculated businesses",
    "독립 업무별 산출 후 합산",
    "独立業務ごとに計算して合算"
  ],
  "逐业务贡献毛利扣除同损失补偿": [
    "Business contribution margin less other compensation",
    "업무별 공헌이익에서 기타 보상 차감",
    "業務別限界利益から同一損失の補償を控除"
  ],
  "首次实际中断须在本保单责任年度内": [
    "First actual interruption must fall within this policy year",
    "최초 실제 중단은 해당 보험연도에 발생해야 합니다",
    "最初の実際の中断は当該保険年度内である必要があります"
  ],
  "业务必须已列明且不可重复申报": [
    "Businesses must be listed and not duplicated",
    "명시된 업무만 중복 없이 신고해야 합니다",
    "列明済み業務のみ、重複なく申告してください"
  ],
  "首次承保前已知的具体停供安排或责任期间外公告不适用": [
    "Known pre-inception stoppages or out-of-period notices are excluded",
    "최초 보장 전 알려진 중단이나 보장기간 밖 공지는 제외됩니다",
    "初回始期前に既知の具体的停止や責任期間外の告知は対象外です"
  ],
  "公告须发生于首次连续承保之后": [
    "Notice must follow first continuous inception",
    "공지는 최초 연속 보장 시작 이후여야 합니다",
    "告知は継続補償の初回始期後である必要があります"
  ],
  "核心数字业务": [
    "Core digital business",
    "핵심 디지털 업무",
    "基幹デジタル業務"
  ],
  "独立AI付费业务": [
    "Independent paid AI business",
    "독립 유료 AI 업무",
    "独立した有料AI業務"
  ],
  "独立付费任务；收入与核心业务不重叠。": [
    "Independent paid tasks; no revenue overlap with core business.",
    "독립 유료 작업으로 핵심 업무 수익과 중복되지 않습니다.",
    "独立した有料タスクで、基幹業務の収益と重複しません。"
  ],
  "计算、数据库与存储共同支撑核心业务。": [
    "Compute, database and storage jointly support the core business.",
    "컴퓨팅, 데이터베이스 및 스토리지가 핵심 업무를 함께 지원합니다.",
    "コンピュート・データベース・ストレージが基幹業務を共同で支えます。"
  ],
  "法兰克福": [
    "Frankfurt",
    "프랑크푸르트",
    "フランクフルト"
  ],
  "首尔": [
    "Seoul",
    "서울",
    "ソウル"
  ],
  "香港": [
    "Hong Kong",
    "홍콩",
    "香港"
  ],
  "东京": [
    "Tokyo",
    "도쿄",
    "東京"
  ],
  "官方事件目录": [
    "Official event catalogue",
    "공식 사건 목록",
    "公式事象カタログ"
  ],
  "云区域与历史事件": [
    "Cloud regions and historical events",
    "클라우드 리전 및 과거 사건",
    "クラウド地域と過去の事象"
  ],
  "区域相关候选事件": [
    "Region-related candidate events",
    "리전 관련 후보 사건",
    "地域関連の候補事象"
  ],
  "全目录纳入 / 剔除": [
    "Catalogue included / excluded",
    "전체 목록 포함 / 제외",
    "全カタログ採用／除外"
  ],
  "Google Cloud官方事件模板；其他厂商暂用代理。事件数量不等于客户出险率，须匹配产品、区域与功能。": [
    "Official Google Cloud event templates; used as a proxy for other providers. Counts are not client claim rates: product, region and feature must match.",
    "Google Cloud 공식 사건 템플릿을 다른 공급자의 대용으로 사용합니다. 사건 수는 고객 사고율이 아니며 제품, 리전 및 기능이 일치해야 합니다.",
    "Google Cloud公式事象を他社の代理テンプレートとして使用します。件数は顧客事故率ではなく、製品・地域・機能の一致が必要です。"
  ],
  "官方事件": [
    "Official event",
    "공식 사건",
    "公式事象"
  ],
  "公开时长": [
    "Published duration",
    "공개된 지속 시간",
    "公表継続時間"
  ],
  "原文 ↗": [
    "Source ↗",
    "원문 ↗",
    "原文 ↗"
  ],
  "准备成功概率": [
    "Preparation success probability",
    "준비 성공 확률",
    "準備成功確率"
  ],
  "M1备用接管成功概率": [
    "M1 backup takeover probability",
    "M1 예비 전환 성공 확률",
    "M1予備切替成功確率"
  ],
  "M2备用接管成功概率": [
    "M2 backup takeover probability",
    "M2 예비 전환 성공 확률",
    "M2予備切替成功確率"
  ],
  "成功接管恢复时间": [
    "Recovery time after successful takeover",
    "성공적 전환 시 복구 시간",
    "切替成功時の復旧時間"
  ],
  "迁移适配": [
    "Migration and adaptation",
    "이전 및 적용",
    "移行・適合"
  ],
  "准备成功时扣减可用公告期；备用接管按概率模拟，不视为必定成功。实际理赔按恢复记录停止计时。": [
    "Successful preparation reduces the remaining migration time by the notice lead time. Backup takeover is probabilistic. Claims stop accruing at documented recovery.",
    "준비 성공 시 공지 기간만큼 남은 이전 시간을 줄입니다. 예비 전환은 확률로 모의하며 실제 보험금은 확인된 복구 시점에 누적을 멈춥니다.",
    "準備成功時は告知期間を移行残時間から控除します。予備切替は確率的に扱い、実際の保険金は確認された復旧時点で計時を止めます。"
  ]
});
// Preserve existing form translations when the currency label changes to USD.
for(const [key,values] of Object.entries(window.CBLocaleMessages)){
 if(/元|人民币|¥|CNY/.test(key)){
  const usd=key.replace(/¥\s*/g,'USD ').replace(/人民币/g,'USD').replace(/元(?=[，、）/\s]|$)/g,'USD');
  if(usd!==key&&!window.CBLocaleMessages[usd])window.CBLocaleMessages[usd]=values.map(v=>v.replace(/CNY|RMB|人民币|위안|人民元|¥/g,'USD'));
 }
}

Object.assign(window.CBLocaleMessages,{
  "营业日历": [
    "Business calendar",
    "영업 일정",
    "営業カレンダー"
  ],
  "保单": [
    "Policy",
    "증권",
    "保険契約"
  ],
  "无备用": [
    "No backup",
    "예비 환경 없음",
    "予備環境なし"
  ],
  "年保费": [
    "Annual premium",
    "연간 보험료",
    "年間保険料"
  ],
  "统一精算研究": [
    "Unified actuarial study",
    "통합 계리 연구",
    "統一精算研究"
  ],
  "统一研究组合": [
    "Unified reference portfolio",
    "통합 연구 포트폴리오",
    "統一研究ポートフォリオ"
  ],
  "载入统一研究核赔算例": [
    "Loaded unified claims example",
    "통합 보상 예시 불러옴",
    "統一査定例を読み込み"
  ],
  "是": [
    "Yes",
    "예",
    "はい"
  ],
  "否": [
    "No",
    "아니요",
    "いいえ"
  ],
  "移除": [
    "Remove",
    "삭제",
    "削除"
  ],
  "业务": [
    "Business",
    "업무",
    "業務"
  ],
  "参数金额": [
    "Parameter amount",
    "매개변수 금액",
    "パラメトリック金額"
  ],
  "净损失": [
    "Net loss",
    "순손실",
    "純損失"
  ],
  "各业务可赔分钟合计": [
    "Sum of business payable minutes",
    "업무별 지급 대상 분 합계",
    "業務別支払対象分数の合計"
  ],
  "组合容量与共同依赖已复核": [
    "Portfolio capacity and common dependencies reviewed",
    "포트폴리오 용량 및 공통 의존성 검토 완료",
    "ポートフォリオ容量・共通依存を確認済み"
  ],
  "核对引用组合版本、共享上游、准入辖区及剩余再保容量。": [
    "Check the reference portfolio version, shared upstream, access jurisdictions and remaining reinsurance capacity.",
    "참조 포트폴리오 버전, 공통 상위 서비스, 접근 관할 및 잔여 재보험 용량을 확인합니다.",
    "参照ポートフォリオの版、共通上流サービス、利用規制管轄、再保険残余容量を確認します。"
  ],
  "海桥数字科技有限公司": [
    "HarborBridge Digital Technology",
    "하버브리지 디지털 테크놀로지",
    "ハーバーブリッジ・デジタルテクノロジー"
  ],
  "海": [
    "H",
    "H",
    "H"
  ],
  "示": [
    "S",
    "S",
    "S"
  ],
  "M2外部事件中断：核验关键数字依赖、适用准入变化与实际中断。首次投保前已知的具体停供安排除外；连续续保按首次实际中断年度归属，同一事件不刷新年度限额。仅保障不可追回贡献毛利，扣除同损失补偿；不计迁移等额外费用。": [
    "M2 external event disruption: verify critical digital dependencies, applicable access changes and actual interruption. Known pre-inception stoppages are excluded. Under continuous renewal, the first actual interruption determines the policy year; one event does not refresh annual limits. Cover irrecoverable contribution margin less same-loss compensation, excluding migration and other extra expenses.",
    "M2 외부 사건 중단: 핵심 디지털 의존성, 적용되는 접근 변경 및 실제 중단을 확인합니다. 최초 가입 전 알려진 중단은 제외됩니다. 연속 갱신 시 최초 실제 중단 연도에 귀속하며 동일 사고로 연간 한도를 갱신하지 않습니다. 회복 불가능한 공헌이익에서 동일 손실 보상을 차감하고 이전 등 추가 비용은 제외합니다.",
    "M2外部事象による中断：重要なデジタル依存、適用される利用条件変更、実際の中断を確認します。初回加入前に既知の具体的停止は除外します。連続更新では最初の実際の中断が生じた保険年度に帰属し、同一事故で年間限度は更新しません。同一損失への補償を控除した回収不能な限界利益のみを補償し、移行等の追加費用は含みません。"
  ],
  "连续续保：上年度12月公告，1月10日实际中断。核心业务1.5小时恢复，独立AI业务4小时恢复。": [
    "Continuous renewal: notice in December of the prior year; interruption on January 10. Core business recovers after 1.5 hours and independent AI business after 4 hours.",
    "연속 갱신: 전년도 12월 공지 후 1월 10일 실제 중단. 핵심 업무는 1.5시간, 독립 AI 업무는 4시간 후 복구됩니다.",
    "連続更新：前年度12月に告知、1月10日に実際の中断。基幹業務は1.5時間後、独立AI業務は4時間後に復旧します。"
  ],
  "收到公告后开展迁移、适配及验证。": [
    "Migration, adaptation and validation began after notice.",
    "공지 후 이전, 적용 및 검증을 시작했습니다.",
    "告知後に移行・適合・検証を開始しました。"
  ],
  "核心业务11:30恢复，AI业务14:00恢复。": [
    "Core business recovered at 11:30; AI business at 14:00.",
    "핵심 업무 11:30, AI 업무 14:00 복구.",
    "基幹業務は11:30、AI業務は14:00に復旧。"
  ],
  "核心业务不可追回贡献毛利 USD 800；独立AI业务 USD 1,600，分别核验。": [
    "Irrecoverable contribution margin: core business USD 800; independent AI business USD 1,600, verified separately.",
    "회복 불가능한 공헌이익: 핵심 업무 USD 800, 독립 AI 업무 USD 1,600, 개별 검증.",
    "回収不能な限界利益：基幹業務USD 800、独立AI業務USD 1,600を個別に確認。"
  ],
  "核验首次投保后公告、连续续保、实际中断年度及各业务恢复；同一事件共用限额。": [
    "Verify post-inception notice, continuous renewal, interruption year and each business recovery; one shared event limit applies.",
    "최초 가입 후 공지, 연속 갱신, 실제 중단 연도 및 업무별 복구를 확인하며 동일 사고 한도를 공유합니다.",
    "初回加入後の告知、連続更新、中断年度、業務別復旧を確認し、同一事故の限度を共有します。"
  ],
  "56项无法追回的付费任务 × USD 10贡献毛利 = USD 560。": [
    "56 irrecoverable paid tasks × USD 10 contribution margin = USD 560.",
    "회복 불가능한 유료 작업 56건 × 공헌이익 USD 10 = USD 560.",
    "回収不能な有料タスク56件 × 限界利益USD 10 = USD 560。"
  ],
  "列明服务连续中断3.5小时，核对独立业务的实际影响。": [
    "The listed service was interrupted for 3.5 hours; verify the independent business impact.",
    "명시 서비스 3.5시간 중단; 독립 업무의 실제 영향을 확인합니다.",
    "列明サービスが3.5時間中断。独立業務への実際の影響を確認します。"
  ],
  "尝试重试和恢复；已核对可以补做的任务。": [
    "Retries and recovery attempted; recoverable tasks reconciled.",
    "재시도 및 복구를 시도하고 보완 가능한 작업을 확인했습니다.",
    "再試行・復旧を実施し、後日処理できるタスクを照合済み。"
  ],
  "13:30业务恢复；连续观测窗口确认。": [
    "Business recovered at 13:30, confirmed over a continuous observation window.",
    "13:30 업무 복구, 연속 관측 구간에서 확인.",
    "13:30業務復旧、連続観測窓で確認。"
  ],
  "示例调查记录：监测、业务交易和切换记录的事故时段相互吻合。待核赔人逐项复核。": [
    "Example investigation: monitoring, transactions and failover records align. Pending claims-review verification.",
    "조사 예시: 모니터링, 거래 및 전환 기록의 사고 시간이 일치합니다. 보상 심사자의 항목별 확인이 필요합니다.",
    "調査例：監視・取引・切替記録の事故時間が一致。査定担当者による項目別確認待ち。"
  ],
  "业务系统按唯一订单汇总，财务核对单笔贡献毛利；根据历史补单率估计不可挽回比例。": [
    "Aggregate unique orders, verify per-order contribution margin and estimate irrecoverability from historical recovery rates.",
    "고유 주문을 집계하고 건별 공헌이익을 확인한 후 과거 복구율로 회복 불가능 비중을 추정합니다.",
    "固有注文を集計し、注文当たり限界利益を照合し、過去の後日処理率から回収不能割合を推計します。"
  ],
  "Google Cloud · 核心业务USD 600/h，独立AI业务USD 400/h。": [
    "Google Cloud · Core USD 600/h; independent AI USD 400/h.",
    "Google Cloud · 핵심 업무 USD 600/h, 독립 AI USD 400/h.",
    "Google Cloud・基幹業務USD 600/h、独立AI業務USD 400/h。"
  ],
  "跨年公告与连续续保；两项业务合计赔款USD 2,000。": [
    "Cross-year notice with continuous renewal; total payment USD 2,000.",
    "연도 간 공지 및 연속 갱신; 두 업무 총보험금 USD 2,000.",
    "年をまたぐ告知と連続更新。2業務の保険金合計USD 2,000。"
  ],
  "3.5小时中断；参数USD 1,200，净损失封顶后USD 560。": [
    "3.5-hour interruption; USD 1,200 parameter amount, capped at USD 560 net loss.",
    "3.5시간 중단; 매개변수 금액 USD 1,200, 순손실 상한 적용 후 USD 560.",
    "3.5時間中断。パラメトリック金額USD 1,200、純損失上限適用後USD 560。"
  ],
  "模块保费按期望赔款占比分摊。": [
    "Module premiums are allocated by expected-claim shares.",
    "모듈 보험료는 기대 보험금 비중으로 배분합니다.",
    "モジュール保険料は期待保険金の割合で配賦します。"
  ],
  "该情景仅用于组合研究，不能直接出单": [
    "This scenario is for portfolio research, not direct policy issuance.",
    "이 시나리오는 포트폴리오 연구용이며 직접 증권을 발행할 수 없습니다.",
    "このシナリオはポートフォリオ研究用で、直接契約発行には使用できません。"
  ],
  "示例企业 CBU-001": [
    "Sample company CBU-001",
    "예시 기업 CBU-001",
    "サンプル企業 CBU-001"
  ],
  "示例企业 CBU-002": [
    "Sample company CBU-002",
    "예시 기업 CBU-002",
    "サンプル企業 CBU-002"
  ],
  "示例企业 CBU-003": [
    "Sample company CBU-003",
    "예시 기업 CBU-003",
    "サンプル企業 CBU-003"
  ],
  "示例企业 CBU-004": [
    "Sample company CBU-004",
    "예시 기업 CBU-004",
    "サンプル企業 CBU-004"
  ],
  "示例企业 CBU-005": [
    "Sample company CBU-005",
    "예시 기업 CBU-005",
    "サンプル企業 CBU-005"
  ],
  "示例企业 CBU-006": [
    "Sample company CBU-006",
    "예시 기업 CBU-006",
    "サンプル企業 CBU-006"
  ],
  "示例企业 CBU-007": [
    "Sample company CBU-007",
    "예시 기업 CBU-007",
    "サンプル企業 CBU-007"
  ],
  "示例企业 CBU-008": [
    "Sample company CBU-008",
    "예시 기업 CBU-008",
    "サンプル企業 CBU-008"
  ],
  "示例企业 CBU-009": [
    "Sample company CBU-009",
    "예시 기업 CBU-009",
    "サンプル企業 CBU-009"
  ],
  "示例企业 CBU-010": [
    "Sample company CBU-010",
    "예시 기업 CBU-010",
    "サンプル企業 CBU-010"
  ],
  "示例企业 CBU-011": [
    "Sample company CBU-011",
    "예시 기업 CBU-011",
    "サンプル企業 CBU-011"
  ],
  "示例企业 CBU-012": [
    "Sample company CBU-012",
    "예시 기업 CBU-012",
    "サンプル企業 CBU-012"
  ],
  "示例企业 CBU-013": [
    "Sample company CBU-013",
    "예시 기업 CBU-013",
    "サンプル企業 CBU-013"
  ],
  "示例企业 CBU-014": [
    "Sample company CBU-014",
    "예시 기업 CBU-014",
    "サンプル企業 CBU-014"
  ],
  "示例企业 CBU-015": [
    "Sample company CBU-015",
    "예시 기업 CBU-015",
    "サンプル企業 CBU-015"
  ],
  "示例企业 CBU-016": [
    "Sample company CBU-016",
    "예시 기업 CBU-016",
    "サンプル企業 CBU-016"
  ],
  "示例企业 CBU-017": [
    "Sample company CBU-017",
    "예시 기업 CBU-017",
    "サンプル企業 CBU-017"
  ],
  "示例企业 CBU-018": [
    "Sample company CBU-018",
    "예시 기업 CBU-018",
    "サンプル企業 CBU-018"
  ],
  "示例企业 CBU-019": [
    "Sample company CBU-019",
    "예시 기업 CBU-019",
    "サンプル企業 CBU-019"
  ],
  "示例企业 CBU-020": [
    "Sample company CBU-020",
    "예시 기업 CBU-020",
    "サンプル企業 CBU-020"
  ],
  "示例企业 CBU-021": [
    "Sample company CBU-021",
    "예시 기업 CBU-021",
    "サンプル企業 CBU-021"
  ],
  "示例企业 CBU-022": [
    "Sample company CBU-022",
    "예시 기업 CBU-022",
    "サンプル企業 CBU-022"
  ],
  "示例企业 CBU-023": [
    "Sample company CBU-023",
    "예시 기업 CBU-023",
    "サンプル企業 CBU-023"
  ],
  "示例企业 CBU-024": [
    "Sample company CBU-024",
    "예시 기업 CBU-024",
    "サンプル企業 CBU-024"
  ],
  "示例企业 CBU-025": [
    "Sample company CBU-025",
    "예시 기업 CBU-025",
    "サンプル企業 CBU-025"
  ],
  "示例企业 CBU-026": [
    "Sample company CBU-026",
    "예시 기업 CBU-026",
    "サンプル企業 CBU-026"
  ],
  "示例企业 CBU-027": [
    "Sample company CBU-027",
    "예시 기업 CBU-027",
    "サンプル企業 CBU-027"
  ],
  "示例企业 CBU-028": [
    "Sample company CBU-028",
    "예시 기업 CBU-028",
    "サンプル企業 CBU-028"
  ],
  "示例企业 CBU-029": [
    "Sample company CBU-029",
    "예시 기업 CBU-029",
    "サンプル企業 CBU-029"
  ],
  "示例企业 CBU-030": [
    "Sample company CBU-030",
    "예시 기업 CBU-030",
    "サンプル企業 CBU-030"
  ],
  "示例企业 CBU-031": [
    "Sample company CBU-031",
    "예시 기업 CBU-031",
    "サンプル企業 CBU-031"
  ],
  "示例企业 CBU-032": [
    "Sample company CBU-032",
    "예시 기업 CBU-032",
    "サンプル企業 CBU-032"
  ],
  "示例企业 CBU-033": [
    "Sample company CBU-033",
    "예시 기업 CBU-033",
    "サンプル企業 CBU-033"
  ],
  "示例企业 CBU-034": [
    "Sample company CBU-034",
    "예시 기업 CBU-034",
    "サンプル企業 CBU-034"
  ],
  "示例企业 CBU-035": [
    "Sample company CBU-035",
    "예시 기업 CBU-035",
    "サンプル企業 CBU-035"
  ],
  "示例企业 CBU-036": [
    "Sample company CBU-036",
    "예시 기업 CBU-036",
    "サンプル企業 CBU-036"
  ],
  "示例企业 CBU-037": [
    "Sample company CBU-037",
    "예시 기업 CBU-037",
    "サンプル企業 CBU-037"
  ],
  "示例企业 CBU-038": [
    "Sample company CBU-038",
    "예시 기업 CBU-038",
    "サンプル企業 CBU-038"
  ],
  "示例企业 CBU-039": [
    "Sample company CBU-039",
    "예시 기업 CBU-039",
    "サンプル企業 CBU-039"
  ],
  "示例企业 CBU-040": [
    "Sample company CBU-040",
    "예시 기업 CBU-040",
    "サンプル企業 CBU-040"
  ],
  "示例企业 CBU-041": [
    "Sample company CBU-041",
    "예시 기업 CBU-041",
    "サンプル企業 CBU-041"
  ],
  "示例企业 CBU-042": [
    "Sample company CBU-042",
    "예시 기업 CBU-042",
    "サンプル企業 CBU-042"
  ],
  "示例企业 CBU-043": [
    "Sample company CBU-043",
    "예시 기업 CBU-043",
    "サンプル企業 CBU-043"
  ],
  "示例企业 CBU-044": [
    "Sample company CBU-044",
    "예시 기업 CBU-044",
    "サンプル企業 CBU-044"
  ],
  "示例企业 CBU-045": [
    "Sample company CBU-045",
    "예시 기업 CBU-045",
    "サンプル企業 CBU-045"
  ],
  "示例企业 CBU-046": [
    "Sample company CBU-046",
    "예시 기업 CBU-046",
    "サンプル企業 CBU-046"
  ],
  "示例企业 CBU-047": [
    "Sample company CBU-047",
    "예시 기업 CBU-047",
    "サンプル企業 CBU-047"
  ],
  "示例企业 CBU-048": [
    "Sample company CBU-048",
    "예시 기업 CBU-048",
    "サンプル企業 CBU-048"
  ],
  "示例企业 CBU-049": [
    "Sample company CBU-049",
    "예시 기업 CBU-049",
    "サンプル企業 CBU-049"
  ],
  "示例企业 CBU-050": [
    "Sample company CBU-050",
    "예시 기업 CBU-050",
    "サンプル企業 CBU-050"
  ],
  "示例企业 CBU-051": [
    "Sample company CBU-051",
    "예시 기업 CBU-051",
    "サンプル企業 CBU-051"
  ],
  "示例企业 CBU-052": [
    "Sample company CBU-052",
    "예시 기업 CBU-052",
    "サンプル企業 CBU-052"
  ],
  "示例企业 CBU-053": [
    "Sample company CBU-053",
    "예시 기업 CBU-053",
    "サンプル企業 CBU-053"
  ],
  "示例企业 CBU-054": [
    "Sample company CBU-054",
    "예시 기업 CBU-054",
    "サンプル企業 CBU-054"
  ],
  "示例企业 CBU-055": [
    "Sample company CBU-055",
    "예시 기업 CBU-055",
    "サンプル企業 CBU-055"
  ],
  "示例企业 CBU-056": [
    "Sample company CBU-056",
    "예시 기업 CBU-056",
    "サンプル企業 CBU-056"
  ],
  "示例企业 CBU-057": [
    "Sample company CBU-057",
    "예시 기업 CBU-057",
    "サンプル企業 CBU-057"
  ],
  "示例企业 CBU-058": [
    "Sample company CBU-058",
    "예시 기업 CBU-058",
    "サンプル企業 CBU-058"
  ],
  "示例企业 CBU-059": [
    "Sample company CBU-059",
    "예시 기업 CBU-059",
    "サンプル企業 CBU-059"
  ],
  "示例企业 CBU-060": [
    "Sample company CBU-060",
    "예시 기업 CBU-060",
    "サンプル企業 CBU-060"
  ],
  "示例企业 CBU-061": [
    "Sample company CBU-061",
    "예시 기업 CBU-061",
    "サンプル企業 CBU-061"
  ],
  "示例企业 CBU-062": [
    "Sample company CBU-062",
    "예시 기업 CBU-062",
    "サンプル企業 CBU-062"
  ],
  "示例企业 CBU-063": [
    "Sample company CBU-063",
    "예시 기업 CBU-063",
    "サンプル企業 CBU-063"
  ],
  "示例企业 CBU-064": [
    "Sample company CBU-064",
    "예시 기업 CBU-064",
    "サンプル企業 CBU-064"
  ],
  "示例企业 CBU-065": [
    "Sample company CBU-065",
    "예시 기업 CBU-065",
    "サンプル企業 CBU-065"
  ],
  "示例企业 CBU-066": [
    "Sample company CBU-066",
    "예시 기업 CBU-066",
    "サンプル企業 CBU-066"
  ],
  "示例企业 CBU-067": [
    "Sample company CBU-067",
    "예시 기업 CBU-067",
    "サンプル企業 CBU-067"
  ],
  "示例企业 CBU-068": [
    "Sample company CBU-068",
    "예시 기업 CBU-068",
    "サンプル企業 CBU-068"
  ],
  "示例企业 CBU-069": [
    "Sample company CBU-069",
    "예시 기업 CBU-069",
    "サンプル企業 CBU-069"
  ],
  "示例企业 CBU-070": [
    "Sample company CBU-070",
    "예시 기업 CBU-070",
    "サンプル企業 CBU-070"
  ],
  "示例企业 CBU-071": [
    "Sample company CBU-071",
    "예시 기업 CBU-071",
    "サンプル企業 CBU-071"
  ],
  "示例企业 CBU-072": [
    "Sample company CBU-072",
    "예시 기업 CBU-072",
    "サンプル企業 CBU-072"
  ],
  "示例企业 CBU-073": [
    "Sample company CBU-073",
    "예시 기업 CBU-073",
    "サンプル企業 CBU-073"
  ],
  "示例企业 CBU-074": [
    "Sample company CBU-074",
    "예시 기업 CBU-074",
    "サンプル企業 CBU-074"
  ],
  "示例企业 CBU-075": [
    "Sample company CBU-075",
    "예시 기업 CBU-075",
    "サンプル企業 CBU-075"
  ],
  "示例企业 CBU-076": [
    "Sample company CBU-076",
    "예시 기업 CBU-076",
    "サンプル企業 CBU-076"
  ],
  "示例企业 CBU-077": [
    "Sample company CBU-077",
    "예시 기업 CBU-077",
    "サンプル企業 CBU-077"
  ],
  "示例企业 CBU-078": [
    "Sample company CBU-078",
    "예시 기업 CBU-078",
    "サンプル企業 CBU-078"
  ],
  "示例企业 CBU-079": [
    "Sample company CBU-079",
    "예시 기업 CBU-079",
    "サンプル企業 CBU-079"
  ],
  "示例企业 CBU-080": [
    "Sample company CBU-080",
    "예시 기업 CBU-080",
    "サンプル企業 CBU-080"
  ],
  "示例企业 CBU-081": [
    "Sample company CBU-081",
    "예시 기업 CBU-081",
    "サンプル企業 CBU-081"
  ],
  "示例企业 CBU-082": [
    "Sample company CBU-082",
    "예시 기업 CBU-082",
    "サンプル企業 CBU-082"
  ],
  "示例企业 CBU-083": [
    "Sample company CBU-083",
    "예시 기업 CBU-083",
    "サンプル企業 CBU-083"
  ],
  "示例企业 CBU-084": [
    "Sample company CBU-084",
    "예시 기업 CBU-084",
    "サンプル企業 CBU-084"
  ],
  "示例企业 CBU-085": [
    "Sample company CBU-085",
    "예시 기업 CBU-085",
    "サンプル企業 CBU-085"
  ],
  "示例企业 CBU-086": [
    "Sample company CBU-086",
    "예시 기업 CBU-086",
    "サンプル企業 CBU-086"
  ],
  "示例企业 CBU-087": [
    "Sample company CBU-087",
    "예시 기업 CBU-087",
    "サンプル企業 CBU-087"
  ],
  "示例企业 CBU-088": [
    "Sample company CBU-088",
    "예시 기업 CBU-088",
    "サンプル企業 CBU-088"
  ],
  "示例企业 CBU-089": [
    "Sample company CBU-089",
    "예시 기업 CBU-089",
    "サンプル企業 CBU-089"
  ],
  "示例企业 CBU-090": [
    "Sample company CBU-090",
    "예시 기업 CBU-090",
    "サンプル企業 CBU-090"
  ],
  "示例企业 CBU-091": [
    "Sample company CBU-091",
    "예시 기업 CBU-091",
    "サンプル企業 CBU-091"
  ],
  "示例企业 CBU-092": [
    "Sample company CBU-092",
    "예시 기업 CBU-092",
    "サンプル企業 CBU-092"
  ],
  "示例企业 CBU-093": [
    "Sample company CBU-093",
    "예시 기업 CBU-093",
    "サンプル企業 CBU-093"
  ],
  "示例企业 CBU-094": [
    "Sample company CBU-094",
    "예시 기업 CBU-094",
    "サンプル企業 CBU-094"
  ],
  "示例企业 CBU-095": [
    "Sample company CBU-095",
    "예시 기업 CBU-095",
    "サンプル企業 CBU-095"
  ],
  "示例企业 CBU-096": [
    "Sample company CBU-096",
    "예시 기업 CBU-096",
    "サンプル企業 CBU-096"
  ],
  "示例企业 CBU-097": [
    "Sample company CBU-097",
    "예시 기업 CBU-097",
    "サンプル企業 CBU-097"
  ],
  "示例企业 CBU-098": [
    "Sample company CBU-098",
    "예시 기업 CBU-098",
    "サンプル企業 CBU-098"
  ],
  "示例企业 CBU-099": [
    "Sample company CBU-099",
    "예시 기업 CBU-099",
    "サンプル企業 CBU-099"
  ],
  "示例企业 CBU-100": [
    "Sample company CBU-100",
    "예시 기업 CBU-100",
    "サンプル企業 CBU-100"
  ]
});

Object.assign(window.CBLocaleMessages,{"M2条件命中": ["M2 conditional hit", "M2 조건부 영향", "M2条件付き影響"], "风险资料与定价口径": ["Risk evidence and pricing basis", "위험 근거 및 요율 기준", "リスク資料と定価の基準"], "M1采用2023–2025年官方事件目录：39条候选、34条纳入、5条剔除，按产品、区域和功能映射。": ["M1 uses the 2023–2025 official catalogue: 39 candidates, 34 included and 5 excluded, mapped by product, region and feature.", "M1은 2023–2025년 공식 목록을 사용합니다. 후보 39건 중 34건 포함, 5건 제외하며 제품, 리전, 기능으로 매핑합니다.", "M1は2023～2025年の公式カタログを使用。候補39件のうち34件採用、5件除外し、製品・地域・機能で対応付けます。"], "M2公共冲突与设施目录用于证据审查；事件频率、命中及恢复仍为研究情景。地图筛选不修改报价。": ["M2 public conflict and facility records support evidence review. Event frequency, impact and recovery remain research scenarios. Map filters do not change quotes.", "M2 공개 분쟁 및 시설 자료는 근거 검토에 사용합니다. 사건 빈도, 영향 및 복구는 연구 시나리오이며 지도 필터는 견적을 변경하지 않습니다.", "M2の公開紛争・施設記録は証拠確認に使用します。事象頻度・影響・復旧は研究シナリオであり、地図の絞り込みは見積もりを変更しません。"]});

Object.assign(window.CBLocaleMessages,{"基本信息": ["Basic information", "기본 정보", "基本情報"], "企业名称 *": ["Company name *", "기업명 *", "企業名 *"], "服务商 *": ["Provider *", "공급자 *", "サービス事業者 *"], "AI API产品 *": ["AI API product *", "AI API 제품 *", "AI API製品 *"], "模型版本 / API端点 *": ["Model version / API endpoint *", "모델 버전 / API 엔드포인트 *", "モデルバージョン／APIエンドポイント *"], "生产端点 / 受保功能": ["Production endpoint / covered function", "운영 엔드포인트 / 보장 기능", "本番エンドポイント／補償対象機能"], "添加承保服务": ["Add covered service", "보장 서비스 추가", "補償サービスを追加"], "承保服务": ["Covered services", "보장 서비스", "補償サービス"], "业务运行时间": ["Business operating hours", "업무 운영 시간", "業務稼働時間"], "备用模型 / API": ["Backup model / API", "예비 모델 / API", "予備モデル／API"], "预计业务恢复时间（分钟）": ["Expected business recovery time (minutes)", "예상 업무 복구 시간(분)", "業務復旧見込時間（分）"], "更换模型 / API适配时间（小时）": ["Model / API migration time (hours)", "모델 / API 전환 소요 시간(시간)", "モデル／API移行時間（時間）"], "是否已收到停供或限制通知": ["Existing suspension or restriction notice", "서비스 중단 또는 제한 공지 수신 여부", "サービス停止・制限の告知の有無"], "备用API与切换方案": ["Backup API and switching plan", "예비 API 및 전환 계획", "予備APIと切替計画"], "备用方案与恢复说明": ["Backup and recovery plan", "예비 및 복구 계획", "予備環境と復旧計画"], "按唯一付费任务评估损失；错误、超时与实际业务不可用对应，重试和恢复后补做不重复计损。": ["Assess loss by unique paid tasks. Link errors and timeouts to actual business unavailability; do not double-count retries or recovered work.", "고유 유료 작업별로 손실을 평가합니다. 오류·시간 초과를 실제 업무 중단과 연결하고 재시도·복구 후 완료 작업을 중복 계산하지 않습니다.", "固有の有料タスク単位で損失を評価。エラー・タイムアウトを実際の業務停止と対応付け、再試行や復旧後の処理を重複計上しません。"]});

Object.assign(window.CBLocaleMessages,{
  "列明模型 / 版本 *": [
    "Model / version *",
    "명시 모델 / 버전 *",
    "対象モデル / バージョン *"
  ],
  "列明模型 / 版本": [
    "Model / version",
    "명시 모델 / 버전",
    "対象モデル / バージョン"
  ],
  "受保API接口 / 端点 *": [
    "Covered API / endpoint *",
    "보장 API / 엔드포인트 *",
    "対象 API / エンドポイント *"
  ],
  "受保API接口 / 端点": [
    "Covered API / endpoint",
    "보장 API / 엔드포인트",
    "対象 API / エンドポイント"
  ],
  "OLA · 两步约定": [
    "OLA · Two-step agreement",
    "OLA · 2단계 약정",
    "OLA · 2段階の合意"
  ],
  "OLA · 服务与测量约定": [
    "OLA · Service & measurement terms",
    "OLA · 서비스 및 측정 약정",
    "OLA · サービスと測定の約定"
  ],
  "演示约定": [
    "Sample terms",
    "예시 약정",
    "サンプル約定"
  ],
  "01 · 服务标准": [
    "01 · Service standards",
    "01 · 서비스 기준",
    "01 · サービス基準"
  ],
  "02 · 测量规则": [
    "02 · Measurement rules",
    "02 · 측정 규칙",
    "02 · 測定ルール"
  ],
  "有效调用成功率（%）": [
    "Valid-call success rate (%)",
    "유효 호출 성공률 (%)",
    "有効呼出し成功率（%）"
  ],
  "响应时间上限（秒）": [
    "Response time limit (sec)",
    "응답 시간 상한 (초)",
    "応答時間上限（秒）"
  ],
  "持续不达标判定窗口（分钟）": [
    "Breach assessment window (min)",
    "기준 미달 판정 구간 (분)",
    "基準未達の判定期間（分）"
  ],
  "连续达标恢复窗口（分钟）": [
    "Sustained recovery window (min)",
    "지속 복구 확인 구간 (분)",
    "継続復旧の確認期間（分）"
  ],
  "查看测量与恢复约定": [
    "Measurement & recovery terms",
    "측정 및 복구 약정 보기",
    "測定・復旧の約定を見る"
  ],
  "测量证据": [
    "Measurement evidence",
    "측정 증빙",
    "測定証拠"
  ],
  "有效调用": [
    "Valid calls",
    "유효 호출",
    "有効な呼出し"
  ],
  "判定与计时": [
    "Assessment & timing",
    "판정 및 시간 산정",
    "判定と時間計測"
  ],
  "恢复与停止": [
    "Recovery & cutoff",
    "복구 및 산정 종료",
    "復旧と計測終了"
  ],
  "企业调用日志＋独立测试；证据冲突或样本不足时转人工复核，不自动判定恢复。": [
    "Client call logs and independent tests. Conflicting evidence or insufficient samples require manual review; recovery is not assumed.",
    "기업 호출 로그와 독립 테스트를 사용합니다. 증빙 충돌이나 표본 부족 시 수동 검토하며 복구를 자동 인정하지 않습니다.",
    "企業の呼出しログと独立テストを使用します。証拠の不一致や標本不足は手動確認とし、復旧を自動認定しません。"
  ],
  "仅统计列明模型、接口与使用地区的有效调用；排除错误密钥、企业自身配置等约定不承保原因。": [
    "Count valid calls for the listed model, endpoint and usage region. Exclude agreed causes such as invalid keys and client configuration errors.",
    "명시된 모델, 인터페이스, 이용 지역의 유효 호출만 집계합니다. 잘못된 키와 기업 자체 설정 등 약정된 면책 원인은 제외합니다.",
    "対象モデル、インターフェース、利用地域の有効な呼出しのみ集計します。無効なキーや企業側の設定など、約定の免責原因は除外します。"
  ],
  "按约定窗口汇总，在响应时限内成功完成的有效调用占比低于标准即为不达标；确认后从该不达标窗口起点计时，另扣保单等待期。": [
    "Aggregate calls over the agreed window. A timely-success rate below the standard is a breach. Once confirmed, timing starts at that window’s beginning; the policy waiting period is deducted separately.",
    "약정 구간의 응답 제한 내 성공률이 기준보다 낮으면 미달로 판정합니다. 확인 후 해당 구간 시작부터 산정하며 증권의 대기기간은 별도로 공제합니다.",
    "約定期間内の応答期限内成功率が基準未満なら未達と判定します。確認後、その期間の開始時点から計測し、保険の待機期間は別途控除します。"
  ],
  "原服务或已接入、可接管业务的备用服务连续达标，经恢复窗口确认后，回溯至该达标窗口起点停止计时；无调用不等于已恢复。": [
    "After the original service or a connected, operational backup meets the standard throughout the recovery window, timing stops retrospectively at the start of that window. No calls does not mean recovery.",
    "원 서비스 또는 연결되어 업무를 인계할 수 있는 대체 서비스가 복구 구간 내내 기준을 충족하면 해당 구간 시작으로 소급하여 산정을 종료합니다. 호출이 없다고 복구된 것은 아닙니다.",
    "元サービスまたは接続済みで業務を引き継げる代替サービスが復旧確認期間中に基準を満たした場合、その期間の開始時点に遡って計測を終了します。呼出しがないことは復旧を意味しません。"
  ],
  "OLA按原保单约定执行。": [
    "OLA follows the original policy terms.",
    "OLA는 기존 증권 약정을 따릅니다.",
    "OLAは元の保険約定に従います。"
  ],
  "已核实OLA达标情况、除外原因及原服务或备用服务恢复时刻": [
    "OLA compliance, exclusions and original or backup service recovery times verified",
    "OLA 기준 충족, 면책 원인 및 원 서비스 또는 대체 서비스 복구 시각 확인",
    "OLA基準、免責原因、元サービスまたは代替サービスの復旧時刻を確認済み"
  ],
  "模拟曲线不替代调用日志与独立测试，须核实后认定中断和恢复。": [
    "Simulated curves do not replace logs and independent tests. Outage and recovery require verification.",
    "모의 곡선은 로그와 독립 테스트를 대체하지 않습니다. 중단과 복구는 검증 후 인정합니다.",
    "模擬曲線はログと独立テストの代わりにはなりません。中断と復旧は確認後に認定します。"
  ],
  "有效调用按时成功率模拟曲线": [
    "Simulated timely-success rate of valid calls",
    "유효 호출의 시간 내 성공률 모의 곡선",
    "有効呼出しの期限内成功率の模擬曲線"
  ],
  "OLA需列明模型、接口与使用地区": [
    "OLA requires a model, endpoint and usage region",
    "OLA에 모델, 인터페이스, 이용 지역이 필요합니다",
    "OLAにはモデル、インターフェース、利用地域が必要です"
  ],
  "请填写有效的OLA成功率、响应时间及判定窗口": [
    "Enter valid OLA success, response and window values",
    "유효한 OLA 성공률, 응답 시간 및 판정 구간을 입력하세요",
    "有効なOLA成功率、応答時間、判定期間を入力してください"
  ],
  "区域 / 业务": [
    "Region / business",
    "지역 / 업무",
    "地域 / 業務"
  ]
});

Object.assign(window.CBLocaleMessages,{
  "云服务区域": [
    "Cloud service region",
    "클라우드 서비스 지역",
    "クラウドサービス地域"
  ],
  "云区域与历史事件": [
    "Cloud regions & historical events",
    "클라우드 지역 및 과거 사건",
    "クラウド地域と過去の事象"
  ],
  "所选区域": [
    "Selected region",
    "선택한 지역",
    "選択した地域"
  ],
  "全目录纳入事件": [
    "Included catalogue events",
    "전체 목록 포함 사건",
    "全カタログの採用事象"
  ],
  "全目录剔除事件": [
    "Excluded catalogue events",
    "전체 목록 제외 사건",
    "全カタログの除外事象"
  ],
  "此区域暂无纳入事件": [
    "No included events for this region",
    "이 지역에 포함된 사건이 없습니다",
    "この地域に採用事象はありません"
  ],
  "2023–2025 · 官方事件目录": [
    "2023–2025 · Official event catalogue",
    "2023–2025 · 공식 사건 목록",
    "2023–2025 · 公式事象カタログ"
  ]
});

;
Object.assign(window.CBLocaleMessages,{
  "数字表示合并位置数；放大展开，点击查看": ["Numbers show grouped locations · zoom to expand, click to inspect", "숫자는 통합 위치 수 · 확대하여 펼치고 클릭하여 확인", "数字は集約地点数 · 拡大して展開、クリックして確認"],

  "直接影响": [
    "Direct impact",
    "직접 영향",
    "直接影響"
  ],
  "上游关联": [
    "Upstream link",
    "상위 의존성 연관",
    "上流依存の関連"
  ],
  "相关性待核实": [
    "Relevance unverified",
    "관련성 확인 필요",
    "関連性は未確認"
  ],
  "未匹配依赖": [
    "No matched dependency",
    "일치 의존성 없음",
    "依存関係に一致なし"
  ],
  "产品与公开影响区域匹配；仍须核实模型、接口及客户调用证据。": [
    "Product and reported region match. Model, endpoint and client call evidence still require verification.",
    "제품과 공개 영향 지역이 일치합니다. 모델, 인터페이스, 고객 호출 증빙은 추가 확인이 필요합니다.",
    "製品と公表された影響地域が一致します。モデル、インターフェース、顧客の呼出し証拠は別途確認が必要です。"
  ],
  "事件涉及本视图列明的上游服务；须验证依赖链和业务影响。": [
    "The event involves an upstream service listed in this view. Verify the dependency chain and business impact.",
    "이 화면에 명시한 상위 서비스의 사건입니다. 의존 관계와 업무 영향을 검증해야 합니다.",
    "この画面で指定した上流サービスの事象です。依存関係と業務影響の確認が必要です。"
  ],
  "产品可能相关，但公告未披露适用区域，或该区域不匹配。": [
    "The product may be relevant, but the applicable region is undisclosed or does not match.",
    "제품은 관련될 수 있지만 적용 지역이 공개되지 않았거나 일치하지 않습니다.",
    "製品は関連する可能性がありますが、適用地域が非公表または不一致です。"
  ],
  "产品、功能或地域信息不足，尚不能确认与列明服务的关联。": [
    "Product, feature or regional detail is insufficient to confirm relevance to the listed service.",
    "제품, 기능 또는 지역 정보가 부족하여 명시 서비스와의 관련성을 확인할 수 없습니다.",
    "製品、機能、地域の情報が不足しており、対象サービスとの関連を確認できません。"
  ],
  "未匹配所选服务或列明上游。": [
    "No match to the selected service or listed upstream.",
    "선택 서비스 또는 명시 상위 서비스와 일치하지 않습니다.",
    "選択サービスまたは指定上流サービスに一致しません。"
  ],
  "全球 / 跨区域": [
    "Global / cross-region",
    "글로벌 / 다중 지역",
    "グローバル / 複数地域"
  ],
  "地域未披露": [
    "Region undisclosed",
    "지역 미공개",
    "地域非公表"
  ],
  "厂商": [
    "Provider",
    "공급자",
    "プロバイダー"
  ],
  "产品": [
    "Product",
    "제품",
    "製品"
  ],
  "全部产品": [
    "All products",
    "전체 제품",
    "すべての製品"
  ],
  "年份": [
    "Year",
    "연도",
    "年"
  ],
  "全部年份": [
    "All years",
    "전체 연도",
    "すべての年"
  ],
  "2026（截至采集日）": [
    "2026 (through snapshot date)",
    "2026 (수집일 기준)",
    "2026（取得日まで）"
  ],
  "区域": [
    "Region",
    "지역",
    "地域"
  ],
  "全部区域": [
    "All regions",
    "전체 지역",
    "すべての地域"
  ],
  "关联承保服务": [
    "Link to insured service",
    "보장 서비스 연결",
    "対象サービスとの関連"
  ],
  "关联类型": [
    "Relationship",
    "연관 유형",
    "関連の種類"
  ],
  "全部关联类型": [
    "All relationships",
    "전체 연관 유형",
    "すべての関連"
  ],
  "列明上游依赖": [
    "Listed upstream dependencies",
    "명시 상위 의존성",
    "指定した上流依存"
  ],
  "上游服务（关联分析）": [
    "Upstream service (analysis)",
    "상위 서비스 (연관 분석)",
    "上流サービス（関連分析）"
  ],
  "未列明": [
    "Not listed",
    "미지정",
    "未指定"
  ],
  "仅用于本视图的关联分析；不修改保单，也不据此确认实际影响。": [
    "Used for analysis in this view only. It does not change policy terms or confirm actual impact.",
    "이 화면의 연관 분석에만 사용합니다. 증권을 변경하거나 실제 영향을 확정하지 않습니다.",
    "この画面の関連分析専用です。保険約定の変更や実際の影響の確定は行いません。"
  ],
  "公开目录事件": [
    "Public catalogue events",
    "공개 목록 사건",
    "公開カタログの事象"
  ],
  "公开故障分布": [
    "Public incident distribution",
    "공개 장애 분포",
    "公開障害の分布"
  ],
  "存在匹配关联": [
    "Matched relationship",
    "연관 일치",
    "関連あり"
  ],
  "公开事件区域": [
    "Reported event region",
    "공개 사건 지역",
    "公表された事象地域"
  ],
  "圆点表示目录数量，不是风险概率": [
    "Dots show catalogue counts, not risk probability",
    "원은 목록 건수이며 위험 확률이 아닙니다",
    "点はカタログ件数であり、リスク確率ではありません"
  ],
  "服务关联概览": [
    "Service relationships",
    "서비스 연관 개요",
    "サービス関連の概要"
  ],
  "关联标记是核验线索，不代表客户已经受损或满足OLA触发条件。": [
    "Relationship markers guide verification; they do not establish customer loss or an OLA trigger.",
    "연관 표시는 검증 단서이며 고객 손실이나 OLA 발동을 의미하지 않습니다.",
    "関連表示は確認の手掛かりであり、顧客損失やOLAの発動を認定するものではありません。"
  ],
  "跨区域事件只在目录中计数一次；地域未披露的事件保留在列表，不推断机房位置。": [
    "Cross-region events count once in the catalogue. Events without disclosed regions remain in the list; facility locations are not inferred.",
    "다중 지역 사건은 목록에서 한 번만 집계합니다. 지역 미공개 사건도 목록에 보존하며 시설 위치를 추정하지 않습니다.",
    "複数地域の事象もカタログでは1件です。地域非公表の事象は一覧に残し、施設位置を推定しません。"
  ],
  "查看定价样本 →": [
    "View pricing sample →",
    "가격 산정 표본 보기 →",
    "料率算定標本を見る →"
  ],
  "条记录": [
    "records",
    "건",
    "件"
  ],
  "日期 / 厂商": [
    "Date / provider",
    "날짜 / 공급자",
    "日付 / プロバイダー"
  ],
  "公开事件与核验依据": [
    "Public event & evidence",
    "공개 사건 및 검증 근거",
    "公開事象と確認根拠"
  ],
  "关联依据": [
    "Relationship basis",
    "연관 근거",
    "関連の根拠"
  ],
  "映射方式": [
    "Mapping method",
    "매핑 방식",
    "対応付け方法"
  ],
  "来源结构化字段": [
    "Structured source fields",
    "출처 구조화 필드",
    "出典の構造化フィールド"
  ],
  "标题识别，待核实": [
    "Title-based; unverified",
    "제목 기반, 확인 필요",
    "タイトルから抽出・要確認"
  ],
  "影响说明文本识别，待核实": [
    "Impact-text extraction; unverified",
    "영향 설명 추출, 확인 필요",
    "影響説明から抽出・要確認"
  ],
  "定价样本状态": [
    "Pricing sample status",
    "가격 산정 표본 상태",
    "料率算定標本の状態"
  ],
  "已纳入冻结参考样本": [
    "Included in frozen reference sample",
    "고정 참조 표본에 포함",
    "固定参照標本に採用済み"
  ],
  "已核对，未纳入参考样本": [
    "Reviewed; excluded from reference sample",
    "검토 완료, 참조 표본 제외",
    "確認済み・参照標本から除外"
  ],
  "未进入定价样本": [
    "Not in pricing sample",
    "가격 산정 표본 미포함",
    "料率算定標本に未採用"
  ],
  "查看官方原文 ↗": [
    "Official source ↗",
    "공식 원문 ↗",
    "公式原文 ↗"
  ],
  "产品公告时长": [
    "Product notice duration",
    "제품 공지 지속 시간",
    "製品公表の継続時間"
  ],
  "公开时间线跨度": [
    "Public timeline span",
    "공개 타임라인 구간",
    "公開時系列の期間"
  ],
  "未结构化披露": [
    "Not disclosed in structured form",
    "구조화 정보 미공개",
    "構造化情報なし"
  ],
  "没有符合条件的事件，请调整筛选。": [
    "No matching events. Adjust filters.",
    "일치하는 사건이 없습니다. 필터를 조정하세요.",
    "該当する事象がありません。条件を変更してください。"
  ],
  "事件页码": [
    "Event page number",
    "사건 페이지 번호",
    "事象のページ番号"
  ],
  "数据覆盖、来源与定价样本": [
    "Coverage, sources & pricing sample",
    "데이터 범위, 출처 및 가격 표본",
    "対象範囲・出典・料率算定標本"
  ],
  "2023–2025为完整年度查询；2026截至采集日。各来源披露范围不同，数量不能直接用于厂商风险排名。": [
    "Queries cover full years 2023–2025 and 2026 through the snapshot date. Disclosure scopes differ; counts cannot directly rank provider risk.",
    "2023–2025년은 연간 조회, 2026년은 수집일 기준입니다. 공개 범위가 달라 건수로 공급자 위험 순위를 정할 수 없습니다.",
    "2023–2025年は通年を照会、2026年は取得日までです。公開範囲が異なるため、件数から供給者のリスク順位は決められません。"
  ],
  "来源范围": [
    "Source scope",
    "출처 범위",
    "出典の範囲"
  ],
  "记录数": [
    "Records",
    "기록 수",
    "記録数"
  ],
  "已收录事件日期": [
    "Dates of recorded events",
    "수록 사건 날짜",
    "収録事象の日付"
  ],
  "全产品历史页": [
    "All product history pages",
    "전체 제품 이력 페이지",
    "全製品の履歴ページ"
  ],
  "逐季度公开历史": [
    "Quarterly public history",
    "분기별 공개 이력",
    "四半期ごとの公開履歴"
  ],
  "官方滚动历史，不覆盖全部历史年份": [
    "Official rolling history; not all historical years",
    "공식 순환 이력, 전체 과거 연도 미포함",
    "公式の直近履歴・過去年をすべて含みません"
  ],
  "公开事后调查目录": [
    "Public post-incident reviews",
    "공개 사고 후 조사 목록",
    "公開事後調査カタログ"
  ],
  "公开故障历史，排除计划维护": [
    "Public incidents; scheduled maintenance excluded",
    "공개 장애 이력, 계획 정비 제외",
    "公開障害履歴・計画保守を除外"
  ],
  "公开目录覆盖本次接入来源的可取得记录；不包含未公开的客户专属故障。记录日期范围不等于该期间披露完整性。": [
    "The catalogue includes obtainable records from connected public sources, excluding private customer incidents. The date span does not establish disclosure completeness.",
    "연결한 공개 출처에서 확보한 기록이며 비공개 고객별 장애는 제외됩니다. 날짜 범위가 해당 기간의 공개 완전성을 보장하지 않습니다.",
    "接続した公開出典から取得できた記録を収録し、非公開の顧客固有障害は含みません。日付範囲は期間内の公開の完全性を意味しません。"
  ],
  "定价仍独立使用已核对的34个参考事件及版本化情景；新增公告不自动进入费率。OLA阈值尚未获得客户级历史数据校准。": [
    "Pricing independently uses 34 reviewed reference events and versioned scenarios. New notices do not automatically affect rates. OLA thresholds are not calibrated to customer histories.",
    "가격은 검토한 참조 사건 34건과 버전별 시나리오를 독립 사용합니다. 새 공지는 요율에 자동 반영되지 않으며 OLA 기준은 고객 이력으로 보정되지 않았습니다.",
    "料率は確認済み34件と版管理したシナリオを独立して使用します。新規公告は料率に自動反映されず、OLA閾値は顧客履歴で未較正です。"
  ],
  "下载公开目录与覆盖清单 ↗": [
    "Download catalogue & coverage ↗",
    "공개 목록 및 범위 다운로드 ↗",
    "公開カタログと範囲一覧を取得 ↗"
  ],
  "M1 · 定价样本与客户条件": [
    "M1 · Pricing sample & client terms",
    "M1 · 가격 표본 및 고객 조건",
    "M1 · 料率算定標本と顧客条件"
  ],
  "冻结参考事件 / 观察期": [
    "Frozen events / observation period",
    "고정 사건 / 관측 기간",
    "固定参照事象 / 観測期間"
  ],
  "样本版本": [
    "Sample version",
    "표본 버전",
    "標本の版"
  ],
  "当前条件匹配": [
    "Current condition match",
    "현재 조건 일치",
    "現在の条件との一致"
  ],
  "符合参考情景": [
    "Matches reference scenario",
    "참조 시나리오와 일치",
    "参照シナリオに一致"
  ],
  "业务与依赖": [
    "Business & dependencies",
    "업무 및 의존성",
    "業務と依存関係"
  ],
  "营业与备用": [
    "Schedule & backup",
    "영업 시간 및 대체",
    "稼働時間と代替"
  ],
  "原保单约定": [
    "Original policy terms",
    "원 증권 약정",
    "元の保険約定"
  ],
  "事件样本 → 产品与地区适用性 → 客户依赖与OLA → 中断及恢复 → 净损失与保单限额 → 组合再保与资本。": [
    "Event sample → product and regional applicability → client dependencies and OLA → interruption and recovery → net loss and policy limits → portfolio reinsurance and capital.",
    "사건 표본 → 제품 및 지역 적용 → 고객 의존성과 OLA → 중단 및 복구 → 순손실과 증권 한도 → 포트폴리오 재보험 및 자본.",
    "事象標本 → 製品・地域の適用性 → 顧客依存とOLA → 中断と復旧 → 純損失と保険限度 → ポートフォリオ再保険と資本。"
  ],
  "当前使用冻结情景计算；客户命中、恢复和净损失含研究假设，OLA尚未经验校准。修改条件须重新测算，扩充公开目录不会自动改变保费。": [
    "Calculations use frozen scenarios. Customer impact, recovery and net loss include research assumptions; OLA is not empirically calibrated. Changed conditions require recalculation; catalogue expansion alone does not change premiums.",
    "계산은 고정 시나리오를 사용합니다. 고객 영향, 복구, 순손실에는 연구 가정이 포함되며 OLA는 경험 보정되지 않았습니다. 조건 변경 시 재산정하며 목록 확장만으로 보험료가 바뀌지 않습니다.",
    "固定シナリオで計算します。顧客への影響、復旧、純損失には研究仮定を含み、OLAは経験データで未較正です。条件変更には再計算が必要で、カタログ拡充だけでは保険料は変わりません。"
  ]
});

Object.assign(window.CBLocaleMessages,{
  "归档当前项目": [
    "Archive project",
    "현재 프로젝트 보관",
    "現在のプロジェクトをアーカイブ"
  ],
  "项目归档": [
    "Archived projects",
    "보관된 프로젝트",
    "アーカイブ済みプロジェクト"
  ],
  "开始新的演示项目": [
    "Start a new demo project",
    "새 데모 프로젝트 시작",
    "新しいデモプロジェクトを開始"
  ],
  "当前没有进行中的项目": [
    "No active projects",
    "진행 중인 프로젝트가 없습니다",
    "進行中のプロジェクトはありません"
  ],
  "查看归档": [
    "View archives",
    "보관함 보기",
    "アーカイブを表示"
  ],
  "查看档案": [
    "View record",
    "기록 보기",
    "記録を表示"
  ],
  "恢复项目": [
    "Restore project",
    "프로젝트 복원",
    "プロジェクトを復元"
  ],
  "暂无归档项目": [
    "No archived projects",
    "보관된 프로젝트가 없습니다",
    "アーカイブ済みプロジェクトはありません"
  ],
  "项目已归档": [
    "Project archived",
    "프로젝트가 보관되었습니다",
    "プロジェクトをアーカイブしました"
  ],
  "项目已恢复": [
    "Project restored",
    "프로젝트가 복원되었습니다",
    "プロジェクトを復元しました"
  ],
  "归档项目档案": [
    "Archived project record",
    "보관된 프로젝트 기록",
    "アーカイブ済みプロジェクトの記録"
  ],
  "项目编号": [
    "Project ID",
    "프로젝트 ID",
    "プロジェクトID"
  ],
  "归档时间": [
    "Archived at",
    "보관 시간",
    "アーカイブ日時"
  ],
  "项目状态": [
    "Project status",
    "프로젝트 상태",
    "プロジェクトの状態"
  ],
  "报价金额": [
    "Quoted premium",
    "견적 보험료",
    "見積保険料"
  ],
  "赔案状态": [
    "Claim status",
    "청구 상태",
    "請求状況"
  ],
  "未报案": [
    "Not reported",
    "미신고",
    "未報告"
  ],
  "已报案": [
    "Reported",
    "신고 완료",
    "報告済み"
  ],
  "完整业务档案": [
    "Complete project record",
    "전체 프로젝트 기록",
    "プロジェクト記録全体"
  ],
  "返回归档": [
    "Back to archives",
    "보관함으로 돌아가기",
    "アーカイブに戻る"
  ]
});

;
/* Streamlined workflow copy. */
Object.assign(window.CBLocaleMessages,{
  "模型参数 · 版本管理": [
    "Parameters · Versions",
    "매개변수 · 버전",
    "パラメータ · バージョン"
  ],
  "投保项目": [
    "Sample applications",
    "샘플 청약",
    "サンプル申込"
  ],
  "业务工具": [
    "tools",
    "도구",
    "ツール"
  ],
  "业务流程": [
    "Workflow guide",
    "업무 흐름 안내",
    "業務フローガイド"
  ],
  "业务流程 ↗": [
    "Workflow guide ↗",
    "업무 안내 ↗",
    "操作ガイド ↗"
  ],
  "年度事件概率假设": [
    "Annual event probability · Assumptions",
    "연간 사건 확률 · 가정",
    "年間事象確率 · 仮定値"
  ],
  "规则分析": [
    "Rule-based",
    "규칙 기반",
    "ルールベースの"
  ],
  "关于与数据来源": [
    "About this & data sources",
    "및 데이터 출처",
    "・データ出典について"
  ],
  "服务商网络配置故障，导致生产数据面连接失败。关键订单无法完成，未成功切换。": [
    "provider network misconfiguration caused production data-plane connections to fail. Critical orders could not complete; failover was unsuccessful.",
    "서비스 제공자의 네트워크 설정 오류를 가정합니다. 운영 데이터 영역 연결이 실패해 핵심 주문을 완료하지 못했고 전환도 실패했습니다.",
    "提供者のネットワーク設定障害を想定。本番データプレーンへの接続が失敗し、重要注文を完了できず、切替も失敗しました。"
  ],
  "查看保单": [
    "View policy",
    "보험증권 보기",
    "保険証券を表示"
  ],
  "保障已确认 · 保单快照已锁定": [
    "coverage confirmed · Policy snapshot locked",
    "보장 확정 · 증권 스냅샷 잠금",
    "補償確定 · 証券スナップショット固定"
  ],
  "保险凭证": [
    "Sample insurance certificate",
    "보험 증명서",
    "保険証明書"
  ],
  "核保人：已授权角色": [
    "underwriter: authorized role",
    "인수 담당자: 권한 부여 역할",
    "引受担当：権限付与済み"
  ],
  "客户确认：已确认": [
    "Client confirmation:",
    "고객 확인: 완료",
    "顧客確認：済み"
  ],
  "已归档": [
    "archived",
    "보관 완료",
    "保存済み"
  ],
  "提供": [
    "submission",
    "제출",
    "提出"
  ],
  "补充附件": [
    "Supporting files · Local",
    "추가 첨부 · 로컬",
    "補足添付 · ローカル"
  ],
  "对公收款账户（脱敏）": [
    "Corporate bank account (masked )",
    "법인 수취 계좌 (마스킹 )",
    "法人受取口座（用マスキング）"
  ],
  "当前为报案前预览。客户提交事故申报后，才能完成赔款审核与付款。": [
    "Pre-report preview. The client must submit the incident report before claims approval and payment.",
    "신고 전 미리보기입니다. 고객 사고 신고 제출 후 보험금 심사와 지급을 진행할 수 있습니다.",
    "申告前のプレビューです。顧客が事故報告を提出後、査定と支払を行えます。"
  ],
  "监测": [
    "monitoring",
    "모니터링",
    "監視"
  ],
  "生成监测回放": [
    "Generate monitoring replay",
    "모니터링 재생 생성",
    "監視データを再生"
  ],
  "三节点失败率曲线": [
    "failure rates at three nodes",
    "3개 노드 실패율 곡선",
    "3ノードの失敗率曲線"
  ],
  "演示调查意见：网络配置故障按M1审查，列明服务与业务影响相对应；须核查原始材料及具体除外事实后确认责任。": [
    "Sample opinion: assess the network misconfiguration under M1. The listed service matches the business impact; verify original evidence and specific exclusions before confirming coverage.",
    "예시 의견: 네트워크 설정 오류를 M1으로 검토합니다. 명시 서비스와 업무 영향이 대응하며 원본 자료 및 면책 사실 확인 후 책임을 확정합니다.",
    "意見例：ネットワーク設定障害をM1で審査。対象サービスと業務影響は対応し、原資料と具体的免責事実を確認して責任を判断します。"
  ],
  "我作为核赔人，已复核本案责任事实、适用条款和争议部分；不以系统初算代替责任决定。": [
    "As the claims reviewer, I have reviewed the facts, applicable terms and disputed items. The estimate does not replace my coverage decision.",
    "보상 담당자로서 책임 사실, 약관, 쟁점 사항을 검토했습니다. 시스템 추정액으로 책임 판단을 대신하지 않습니다.",
    "査定担当として責任事実、適用条項、争点を確認しました。システム試算を責任判断の代わりにしません。"
  ],
  "支付与额度入账": [
    "payment & limit posting",
    "지급 및 한도 반영",
    "支払・限度額への計上"
  ],
  "审批并生效": [
    "Approve & activate ()",
    "승인 및 적용",
    "承認・適用"
  ],
  "模型版本与审批": [
    "Model versions & approvals",
    "모델 버전 및 승인",
    "モデルバージョン・承認"
  ],
  "审批当前草稿": [
    "Approve current draft ()",
    "현재 초안 승인",
    "現在の下書きを承認"
  ],
  "核验材料、认定M1/M2、生成计算书并结案。": [
    "Verify evidence, classify M1/M2, calculate payment and simulate closure.",
    "자료 검증, M1/M2 분류, 계산서 작성 및 종결을 진행합니다.",
    "資料検証、M1/M2判断、計算書作成、終結を実施。"
  ],
  "已确认": [
    "confirmation",
    "확인 완료",
    "確認済み"
  ],
  "已审核": [
    "approval",
    "검토 완료",
    "承認済み"
  ],
  "已支付": [
    "payment",
    "지급 완료",
    "支払済み"
  ],
  "已赔款": [
    "payout",
    "지급 보험금",
    "支払保険金"
  ],
  "报价单": [
    "Sample quote",
    "견적서",
    "見積書"
  ],
  "需要先确认保单": [
    "Confirm a sample policy first",
    "증권을 먼저 확정하세요",
    "先に契約を確定してください"
  ],
  "案件已支付结案": [
    "payment complete; claim closed",
    "지급 완료 · 사건 종결",
    "支払完了・案件終結"
  ],
  "赔款已审核，等待付款": [
    "Payout approved; payment pending",
    "보험금 심사 완료 · 지급 대기",
    "保険金審査済み・支払待ち"
  ],
  "支付并结案": [
    "Simulate payment & close",
    "지급 및 종결",
    "支払・終結"
  ],
  "该保单已确认": [
    "This sample policy is already confirmed",
    "증권이 이미 확정되었습니다",
    "契約は確定済みです"
  ],
  "客户确认报价与保障 · 保单及模型快照锁定": [
    "Client confirmed quote & coverage () · Policy and model snapshots locked",
    "고객 견적·보장 확인 · 증권 및 모델 스냅샷 잠금",
    "顧客が見積・補償を確認 · 証券・モデルを固定"
  ],
  "关于 CloudBridge": [
    "About this workspace",
    "작업 공간 정보",
    "このについて"
  ],
  "服务依赖辅助分析 · 规则分析": [
    "Dependency analysis · Rule-based",
    "서비스 의존성 분석 · 규칙",
    "依存関係分析 · ルール"
  ],
  "核保人确认报价": [
    "underwriter confirmed quote",
    "인수 담당자 견적 확인",
    "引受担当者が見積を確認"
  ],
  "确认保障": [
    "Confirm coverage ()",
    "보장 확정",
    "補償を確定"
  ],
  "保险人已收到报案": [
    "Insurer received the report",
    "보험사 신고 접수",
    "保険会社が申告を受付"
  ],
  "生成E01监测记录": [
    "Generated E01 monitoring record",
    "E01 모니터링 기록 생성",
    "E01監視記録を作成"
  ],
  "证据辅助预检 · 本地规则分析": [
    "Evidence pre-check · Local rules",
    "자료 사전 점검 · 로컬 규칙",
    "証拠事前チェック · ローカルルール"
  ],
  "核赔人确认赔款": [
    "Claims reviewer approval ()",
    "보상 담당자 보험금 확인",
    "査定担当者の保険金確認"
  ],
  "核赔人核定": [
    "Claims reviewer approved ()",
    "보상 담당자 확정",
    "査定担当者が確定"
  ],
  "客户确认": [
    "Confirm as client ()",
    "고객 확인",
    "顧客として確認"
  ],
  "客户确认赔款与对公收款账户": [
    "Client confirmed payout and corporate account ()",
    "고객 보험금·법인 계좌 확인",
    "顧客が保険金・法人口座を確認"
  ],
  "客户已确认": [
    "Client confirmation complete ()",
    "고객 확인 완료",
    "顧客の確認済み"
  ],
  "请先核定赔款并取得客户确认": [
    "Approve the payout and obtain client confirmation first.",
    "보험금 확정 및 고객 확인을 먼저 완료하세요.",
    "先に保険金確定と顧客の確認を完了してください。"
  ],
  "支付与结案": [
    "payment & closure",
    "지급 및 종결",
    "支払・終結"
  ],
  "确认支付": [
    "Confirm payment",
    "지급 확인",
    "支払を確認"
  ],
  "支付结案": [
    "payment; claim closed",
    "지급 종결",
    "支払・案件終結"
  ],
  "已支付并更新年度额度": [
    "payment complete; annual limits updated",
    "지급 완료 · 연간 한도 갱신",
    "支払完了・年間限度を更新"
  ],
  "模型审批与版本生效": [
    "Model approval & activation ()",
    "모델 승인 및 적용",
    "モデルの承認・適用"
  ],
  "精算负责人审批生效": [
    "Activated by actuarial approver",
    "계리 책임자 승인 적용",
    "数理責任者の承認で適用"
  ],
  "必要检查已完成，可由授权核赔人进行审批。": [
    "Required checks complete. An authorized claims reviewer may approve the payment.",
    "필수 점검 완료. 권한 있는 보상 담당자가 승인을 진행할 수 있습니다.",
    "必要確認が完了。権限を持つ査定担当者が承認を行えます。"
  ],
  "将由精算负责人确认新的模型参数版本。新参数应用于未出单业务；已有报价作废并重新核保，已确认保单保持原快照。": [
    "The actuarial approver will activate a new parameter version for unissued business. Existing quotes will be void and require re-underwriting; confirmed policies retain their snapshots.",
    "계리 책임자가 새 매개변수 버전을 승인합니다. 미발급 업무에 적용하며 기존 견적은 무효화 후 재심사합니다. 확정 증권은 원래 스냅샷을 유지합니다.",
    "数理責任者が新設定版を承認。未発行業務に適用し、既存見積は無効として再審査。確定契約は元のスナップショットを維持します。"
  ],
  "年度": [
    "years",
    "연도 수",
    "年数"
  ],
  "当前客户与两家参考企业组成组合。相同区域共享事件流；按再保险后组合年度赔款排序，取最差 1% 年份。": [
    "A sample portfolio contains this client and two reference firms. Regional events are shared; tail years are the worst 1% of portfolio annual claims after reinsurance.",
    "현재 고객과 두 참고 기업으로 구성한 포트폴리오입니다. 지역 사건을 공유하며 재보험 후 연간 지급금의 최악 1% 연도를 선택합니다.",
    "当該顧客と参考企業2社の仮想ポートフォリオです。地域事象を共有し、再保険後の年間給付額が最悪の1%年を選びます。"
  ],
  "20,000个年度；比例分保后取组合最差1%年份分配资本。未叠加旧版风险附加，未将冲突观测次数直接转换为概率。": [
    "Simulate 20,000 years and allocate capital using the worst 1% of portfolio years after quota-share reinsurance. Neither legacy risk loading nor a direct count-to-probability conversion is applied.",
    "20,000년을 하고 비례 재보험 후 최악 1% 연도로 자본을 배분합니다. 기존 위험 가산이나 관측 건수의 직접적인 확률 변환은 적용하지 않습니다.",
    "20,000年をし、比例再保険後の最悪1%年で資本を配賦します。旧版リスク付加率や観測件数から確率への直接変換は適用しません。"
  ],
  "当前客户与两家参考企业组成组合。区域依赖事件按地区共享；服务准入事件按辖区共享；按再保险后组合年度赔款排序，取最差 1% 年份。": [
    "The portfolio contains this applicant and two reference firms. Dependency events are shared by region and access events by jurisdiction. Capital uses the worst 1% of net portfolio loss years.",
    "현재 고객과 참고 기업 2곳의 포트폴리오입니다. 의존 사건은 지역별, 이용 자격 사건은 관할별로 공유합니다. 재보험 후 연간 손실 중 최악의 1%를 사용합니다.",
    "当該顧客と参考企業2社の仮想ポートフォリオです。依存事象は地域別、利用資格事象は管轄別に共有し、再保険後の年間損失上位1%を用います。"
  ],
  "100张差异化示例保单 · 200,000个年度": [
    "100 heterogeneous example policies · 200,000 years",
    "서로 다른 예시 증권 100건 · 연도 200,000회",
    "条件の異なるサンプル契約100件・20万年"
  ],
  "已纳入风险": [
    "Included in risk",
    "위험 에 반영",
    "リスクに反映"
  ],
  "准备成功时扣减可用公告期；备用接管按概率，不视为必定成功。实际理赔按恢复记录停止计时。": [
    "Successful preparation reduces the remaining migration time by the notice lead time. Backup takeover is probabilistic. Claims stop accruing at documented recovery.",
    "준비 성공 시 공지 기간만큼 남은 이전 시간을 줄입니다. 예비 전환은 확률로 하며 실제 보험금은 확인된 복구 시점에 누적을 멈춥니다.",
    "準備成功時は告知期間を移行残時間から控除します。予備切替は確率的に扱い、実際の保険金は確認された復旧時点で計時を止めます。"
  ],
  "曲线不替代调用日志与独立测试，须核实后认定中断和恢复。": [
    "curves do not replace logs and independent tests. Outage and recovery require verification.",
    "곡선은 로그와 독립 테스트를 대체하지 않습니다. 중단과 복구는 검증 후 인정합니다.",
    "曲線はログと独立テストの代わりにはなりません。中断と復旧は確認後に認定します。"
  ],
  "有效调用按时成功率曲线": [
    "timely-success rate of valid calls",
    "유효 호출의 시간 내 성공률 곡선",
    "有効呼出しの期限内成功率の曲線"
  ],
  "生成保单": [
    "Issue policy",
    "보험증권 발급",
    "保険証券を発行"
  ],
  "保单已生成": [
    "Policy issued",
    "보험증권이 발급되었습니다",
    "保険証券を発行しました"
  ],
  "查看定价明细": [
    "View pricing details",
    "보험료 상세 보기",
    "保険料の内訳を表示"
  ],
  "请补全投保信息": [
    "Complete application details",
    "가입 정보를 입력해 주세요",
    "申込情報を入力してください"
  ],
  "请调整投保条件": [
    "Review application terms",
    "가입 조건을 검토해 주세요",
    "申込条件を確認してください"
  ],
  "当前条件需要重新测算": [
    "These terms require recalculation",
    "현재 조건은 재산정이 필요합니다",
    "現在の条件は再計算が必要です"
  ],
  "保单已生成 · 报价与保障条件已锁定": [
    "Policy issued · premium and coverage terms saved",
    "보험증권 발급 · 보험료 및 보장 조건 확정",
    "保険証券発行 · 保険料と保障条件を確定"
  ],
  "投保信息已提交": [
    "Application submitted",
    "가입 신청이 제출되었습니다",
    "申込情報を送信しました"
  ],
  "出单方式：系统生成": [
    "Issuance: system generated",
    "발급 방식: 시스템 생성",
    "発行方法：システム生成"
  ],
  "出单状态：": [
    "Issuance status:",
    "발급 상태:",
    "発行状況："
  ],
  "已生成": [
    "Issued",
    "발급 완료",
    "発行済み"
  ],
  "待生成": [
    "Pending issuance",
    "발급 대기",
    "発行待ち"
  ],
  "100张组合保单 · 200,000个测算年度": [
    "100-policy portfolio · 200,000 modelled years",
    "100건 포트폴리오 · 200,000개 모델 연도",
    "100件の契約ポートフォリオ · 200,000モデル年度"
  ],
  "保费报价": [
    "Premium quotation",
    "보험료 견적",
    "保険料見積"
  ],
  "已纳入测算": [
    "Included in calculation",
    "산정에 반영",
    "計算に反映済み"
  ],
  "保存并生效": [
    "Save and activate",
    "저장 및 적용",
    "保存して適用"
  ],
  "按准备期、接管成功率及恢复时间计算中断时长；恢复后停止计时。": [
    "Interruption duration uses preparation time, takeover success and recovery time; accrual stops on recovery.",
    "준비 기간, 전환 성공률 및 복구 시간으로 중단 시간을 산정하며 복구 시 계산을 종료합니다.",
    "準備期間、切替成功率、復旧時間から中断期間を算定し、復旧時に計時を停止します。"
  ],
  "查看风险与定价明细，生成保单。": [
    "Review risk and pricing, then issue the policy.",
    "위험 및 보험료를 확인한 후 보험증권을 발급합니다.",
    "リスクと保険料を確認して保険証券を発行します。"
  ],
  "完成投保信息后，查看定价明细并生成保单。": [
    "Complete the application, review pricing and issue the policy.",
    "가입 정보를 입력하고 보험료를 확인한 후 증권을 발급합니다.",
    "申込情報を入力し、保険料を確認して証券を発行します。"
  ],
  "查看定价明细后生成": [
    "Issue after reviewing pricing",
    "보험료 확인 후 발급",
    "保険料の確認後に発行"
  ],
  "请先提交事故申报。": [
    "Submit an incident report first.",
    "먼저 사고 신고를 제출해 주세요.",
    "先に事故報告を提出してください。"
  ],
  "比赛演示工作台 · 定价与案件采用项目研究数据；公开事件附官方来源。": [
    "Competition workspace · pricing and cases use project research data; public events link to official sources.",
    "대회 시연 워크스페이스 · 보험료와 사례는 프로젝트 연구 데이터를 사용하며 공개 사건에는 공식 출처가 제공됩니다.",
    "大会デモワークスペース · 保険料と案件には研究データを使用し、公開事象には公式出典を添付しています。"
  ]
});

;
/* Current conflict scope and streamlined assessment. */
Object.assign(window.CBLocaleMessages,{
  "申报材料": [
    "Submitted documents",
    "제출 자료",
    "申告資料"
  ],
  "中断回放": [
    "Interruption replay",
    "중단 재생",
    "中断リプレイ"
  ],
  "回放": [
    "Replay",
    "재생",
    "再生"
  ],
  "核赔备注": [
    "Claim notes",
    "손해사정 메모",
    "査定メモ"
  ],
  "事故说明与处理记录": [
    "Incident and response records",
    "사고 및 대응 기록",
    "事故・対応記録"
  ],
  "业务恢复": [
    "Business restored",
    "업무 복구",
    "業務復旧"
  ],
  "受损依赖": [
    "Damaged dependencies",
    "손상된 의존 서비스",
    "損傷した依存先"
  ],
  "中断传导": [
    "Interruption propagation",
    "중단 전파",
    "中断の波及"
  ],
  "贡献毛利扣除同损失补偿": [
    "Contribution margin less same-loss recoveries",
    "공헌이익에서 동일 손실 보상금 차감",
    "限界利益から同一損失の補償を控除"
  ],
  "待核定": [
    "Pending confirmation",
    "확정 대기",
    "確定待ち"
  ],
  "已核定": [
    "Confirmed",
    "확정",
    "確定済み"
  ],
  "请补充事故原因": [
    "Add the cause of interruption",
    "중단 원인을 입력하세요",
    "中断原因を入力してください"
  ],
  "请在事故申报中选择事故原因": [
    "Select an incident cause in the report",
    "사고 보고에서 원인을 선택하세요",
    "事故報告で原因を選択してください"
  ],
  "本次申报含多个独立事故，请分别提交": [
    "Submit separate reports for independent incidents",
    "독립적인 사고는 각각 신고하세요",
    "独立した事故は別々に申告してください"
  ],
  "当前无可支付赔款": [
    "No payable amount",
    "지급 가능 금액 없음",
    "支払可能額なし"
  ],
  "地缘政治冲突导致数字依赖受损": [
    "Conflict damages digital dependencies",
    "지정학적 분쟁으로 디지털 의존 서비스 손상",
    "地政学的紛争によるデジタル依存先の損傷"
  ],
  "冲突事件 / 证据编号": [
    "Conflict event / evidence ID",
    "분쟁 사건 / 증거 번호",
    "紛争事象／証拠番号"
  ],
  "受损数字服务 / 基础设施": [
    "Damaged digital service / infrastructure",
    "손상된 디지털 서비스 / 인프라",
    "損傷したデジタルサービス／インフラ"
  ],
  "受损依赖如何传导至本企业服务": [
    "How the damage interrupts your service",
    "의존 서비스 손상이 기업 서비스에 전파되는 경로",
    "依存先の損傷が自社サービスに及ぼす影響"
  ],
  "M2须由地缘政治冲突损坏数字依赖并传导至列明服务": [
    "M2 requires conflict damage to digital dependencies that interrupts the listed service",
    "M2는 분쟁으로 디지털 의존 서비스가 손상되어 명시된 서비스가 중단되는 경우에 적용됩니다",
    "M2は紛争によるデジタル依存先の損傷が明記サービスの中断を引き起こす場合に適用されます"
  ],
  "请填写冲突事件或证据编号": [
    "Enter the conflict event or evidence ID",
    "분쟁 사건 또는 증거 번호를 입력하세요",
    "紛争事象または証拠番号を入力してください"
  ],
  "请补充受损依赖与中断传导": [
    "Add the damaged dependency and propagation path",
    "손상된 의존 서비스와 전파 경로를 입력하세요",
    "損傷した依存先と波及経路を入力してください"
  ],
  "M2外部事件中断：地缘政治冲突损坏企业依赖的数字服务、数据中心、供电或通信设施，传导至列明服务并造成业务中断损失。按约定标准计量实际中断，原服务或备用恢复后停止计时；赔款受贡献毛利净损失与保单限额约束。": [
    "M2 External Event Interruption: geopolitical conflict damages a digital service, data center, power or communications facility on which the business depends, disrupting the listed service and causing business interruption loss. Duration follows the agreed standards and ends when the original or backup service recovers. Payment is capped by net contribution-margin loss and policy limits.",
    "M2 외부 사건 중단: 지정학적 분쟁으로 기업이 의존하는 디지털 서비스, 데이터센터, 전력 또는 통신 시설이 손상되어 명시된 서비스와 업무가 중단되는 손실을 보장합니다. 약정 기준으로 중단 시간을 측정하고 원래 서비스나 예비 서비스가 복구되면 종료합니다. 보험금은 순공헌이익 손실과 보험 한도를 넘지 않습니다.",
    "M2 外部事象中断：地政学的紛争により企業が依存するデジタルサービス、データセンター、電力・通信施設が損傷し、明記サービスに波及して生じる業務中断損失を補償します。約定基準で中断時間を測定し、元サービスまたは予備サービスの復旧時に終了します。保険金は限界利益の純損失と保険限度額を上限とします。"
  ],
  "地缘政治冲突": [
    "Geopolitical conflict",
    "지정학적 분쟁",
    "地政学的紛争"
  ],
  "数字依赖受损": [
    "Digital dependency damage",
    "디지털 의존 서비스 손상",
    "デジタル依存先の損傷"
  ],
  "企业服务中断": [
    "Business service interruption",
    "기업 서비스 중단",
    "企業サービスの中断"
  ],
  "业务损失": [
    "Business loss",
    "업무 손실",
    "業務損失"
  ],
  "业务损失与赔款": [
    "Business loss and claims",
    "업무 손실 및 보험금",
    "業務損失と保険金"
  ],
  "关键数字依赖": [
    "Key digital dependencies",
    "핵심 디지털 의존 서비스",
    "重要なデジタル依存先"
  ],
  "地缘政治冲突观测": [
    "Conflict observations",
    "지정학적 분쟁 관측",
    "地政学的紛争の観測"
  ],
  "数据中心 · 供电 · 通信链路": [
    "Data centers · Power · Connectivity",
    "데이터센터 · 전력 · 통신망",
    "データセンター・電力・通信網"
  ],
  "冲突损害沿企业列明的数字依赖传导": [
    "Conflict damage propagates through listed dependencies",
    "분쟁 피해가 기업의 명시된 디지털 의존 서비스를 통해 전파",
    "紛争被害が明記されたデジタル依存先を通じて波及"
  ],
  "依赖修复与服务恢复": [
    "Dependency repair and service recovery",
    "의존 서비스 수리 및 복구",
    "依存先の修復とサービス復旧"
  ],
  "按依赖受损、备用接管与实际恢复时间计算中断；原服务或备用达标后停止计时。": [
    "Duration reflects dependency damage, failover and recovery; timing ends when the original or backup service meets the agreed standard.",
    "의존 서비스 손상, 예비 서비스 전환 및 복구 시간으로 중단을 계산합니다. 원래 또는 예비 서비스가 약정 기준을 충족하면 계시를 종료합니다.",
    "依存先の損傷、予備への切替、復旧時間から中断を計算し、元サービスまたは予備サービスが約定基準を満たした時点で計時を終了します。"
  ],
  "冲突中断基准": [
    "Conflict interruption baseline",
    "분쟁 중단 기준",
    "紛争中断の基準"
  ],
  "定价方法与口径 ↗": [
    "Pricing methodology ↗",
    "요율 산정 방법 ↗",
    "料率算定方法 ↗"
  ],
  "100张保单共享冲突事件、设施及上游依赖；各客户资本贡献加总等于组合净资本。": [
    "The 100 policies share conflict events, facilities and upstream dependencies. Client capital contributions sum to net portfolio capital.",
    "100개 계약은 분쟁 사건, 시설, 상위 의존 서비스를 공유합니다. 고객별 자본 기여도의 합은 포트폴리오 순자본과 같습니다.",
    "100契約は紛争事象、施設、上流依存先を共有します。顧客別資本寄与の合計はポートフォリオの純資本に一致します。"
  ],
  "M2冲突损害情景频率": [
    "M2 conflict-damage scenario frequency",
    "M2 분쟁 피해 시나리오 빈도",
    "M2紛争被害シナリオ頻度"
  ],
  "传导路径": [
    "Propagation path",
    "전파 경로",
    "波及経路"
  ],
  "冲突损害 → 数字依赖 → 企业服务中断": [
    "Conflict damage → Digital dependencies → Business interruption",
    "분쟁 피해 → 디지털 의존 서비스 → 기업 서비스 중단",
    "紛争被害 → デジタル依存先 → 企業サービス中断"
  ],
  "定价敏感性": [
    "Pricing sensitivity",
    "가격 민감도",
    "料率感応度"
  ],
  "采用基准成本率": [
    "Using baseline cost rates",
    "기준 비용률 적용",
    "基準コスト率を使用"
  ],
  "模型基准": [
    "Model baseline",
    "모델 기준",
    "モデル基準"
  ],
  "计算检查": [
    "Calculation check",
    "계산 확인",
    "計算確認"
  ],
  "计算完成，可核定赔款。": [
    "Calculation complete. Ready to confirm payment.",
    "계산이 완료되어 보험금을 확정할 수 있습니다.",
    "計算完了。保険金を確定できます。"
  ],
  "核定赔款": [
    "Confirm claim amount",
    "보험금 확정",
    "保険金を確定"
  ],
  "已接收": [
    "Received",
    "접수 완료",
    "受領済み"
  ],
  "待补充": [
    "Awaiting documents",
    "보완 대기",
    "補完待ち"
  ],
  "冲突损坏上游通信设施，云服务中断传导至企业；两项业务合计赔款USD 2,000。": [
    "Conflict damage to upstream communications interrupts cloud services and the business; total payment for both businesses is USD 2,000.",
    "분쟁으로 상위 통신 시설이 손상되어 클라우드와 기업 서비스가 중단됩니다. 두 업무의 총 보험금은 USD 2,000입니다.",
    "紛争で上流通信施設が損傷し、クラウドから企業サービスに中断が波及。2業務の保険金合計はUSD 2,000です。"
  ],
  "上游通信设施与跨境连接链路": [
    "Upstream communications and cross-border links",
    "상위 통신 시설 및 국경 간 연결망",
    "上流通信施設と国境を越える接続経路"
  ],
  "冲突损坏通信设施 → 列明云服务连接中断 → 核心业务与独立AI付费业务无法交付": [
    "Conflict damages communications → Listed cloud service loses connectivity → Core and paid AI services cannot deliver",
    "분쟁으로 통신 시설 손상 → 명시된 클라우드 연결 중단 → 핵심 업무와 유료 AI 업무 제공 불가",
    "紛争で通信施設損傷 → 明記クラウドの接続中断 → 基幹業務と有料AI業務が提供不能"
  ],
  "地缘政治冲突损坏上游通信设施，列明云服务失去连接并传导至企业业务。核心业务1.5小时恢复，独立AI业务4小时恢复。": [
    "Conflict damage to upstream communications interrupts the listed cloud service and business operations. Core services recover after 1.5 hours and independent AI services after 4 hours.",
    "지정학적 분쟁으로 상위 통신 시설이 손상되어 클라우드와 기업 업무가 중단됩니다. 핵심 업무는 1.5시간 후, AI 업무는 4시간 후 복구됩니다.",
    "地政学的紛争で上流通信施設が損傷し、クラウドと企業業務が中断。基幹業務は1.5時間後、AI業務は4時間後に復旧します。"
  ],
  "启用备用通信路径并开展业务切换与恢复验证。": [
    "Activate alternate connectivity and validate failover and recovery.",
    "예비 통신 경로를 활성화하고 업무 전환 및 복구를 검증합니다.",
    "予備通信経路を有効化し、業務切替と復旧を検証します。"
  ],
  "冲突损坏上游通信设施，导致列明服务与企业业务中断；同一事件共用限额。": [
    "Conflict damages upstream communications, interrupting listed services and business operations; one shared event limit applies.",
    "분쟁으로 상위 통신 시설이 손상되어 명시된 서비스와 업무가 중단됩니다. 동일 사건에는 공통 한도가 적용됩니다.",
    "紛争で上流通信施設が損傷し、明記サービスと業務が中断。同一事象に共通限度額を適用します。"
  ],
  "按服务中断时间、贡献毛利净损失和保单限额计算。": [
    "Calculated from interruption time, net contribution-margin loss and policy limits.",
    "서비스 중단 시간, 순공헌이익 손실 및 보험 한도로 계산합니다.",
    "サービス中断時間、限界利益の純損失、保険限度額に基づいて計算します。"
  ],
  "保险人 / 监测机构": [
    "Insurer / Monitoring provider",
    "보험사 / 모니터링 기관",
    "保険会社／監視機関"
  ],
  "客户提供 · 对公账户": [
    "Provided by client · Business account",
    "고객 제공 · 법인 계좌",
    "顧客提出・法人名義口座"
  ]
});

Object.assign(window.CBLocaleMessages,{
"各业务时间":["Times by business","업무별 시간","業務別の時刻"],
"各业务可赔时间合计":["Total payable business minutes","업무별 보상 시간 합계","業務別補償時間の合計"],
"历史保单按归档条款与报价快照执行。":["Historical policies retain archived terms and quotations.","기존 계약은 보관된 약관과 견적을 유지합니다.","過去の契約には保存された約款と見積を適用します。"]
});

Object.assign(window.CBLocaleMessages,{"查看材料与中断回放、生成赔款计算书并结案。":["Review documents and interruption replay, calculate payment and close the claim.","자료와 중단 재생을 확인하고 보험금 계산서 작성 후 종결합니다.","資料と中断リプレイを確認し、保険金計算書を作成して完了します。"]});

Object.assign(window.CBLocaleMessages,{
  "投保概览": [
    "Application overview",
    "가입 신청 요약",
    "申込概要"
  ],
  "索赔材料": [
    "Claim documents",
    "청구 자료",
    "請求資料"
  ],
  "业务损失明细": [
    "Business loss details",
    "업무 손실 명세",
    "業務損失明細"
  ],
  "损失计算依据": [
    "Loss calculation basis",
    "손실 계산 근거",
    "損失の算定根拠"
  ],
  "事故报告与损失明细": [
    "Incident report and loss details",
    "사고 보고 및 손실 명세",
    "事故報告と損失明細"
  ],
  "业务记录": [
    "Activity records",
    "업무 기록",
    "業務記録"
  ],
  "报价与保单快照": [
    "Quote and policy snapshot",
    "견적 및 보험증권 기록",
    "見積と保険証券の記録"
  ],
  "客户提交事故申报": [
    "Client reports the incident",
    "고객 사고 신고",
    "顧客による事故申告"
  ],
  "记录中断、切换、业务恢复和损失金额。": [
    "Record the interruption, failover, recovery and loss amount.",
    "중단, 전환, 업무 복구와 손실 금액을 기록합니다.",
    "中断、切替、業務復旧、損失額を記録します。"
  ],
  "模型参数与版本": [
    "Model parameters and versions",
    "모델 매개변수 및 버전",
    "モデルパラメータとバージョン"
  ],
  "核定状态：": [
    "Assessment status:",
    "확정 상태:",
    "査定状況："
  ],
  "版本记录": [
    "Version history",
    "버전 기록",
    "バージョン履歴"
  ],
  "待接收": [
    "Awaiting receipt",
    "접수 대기",
    "受領待ち"
  ],
  "查看赔款计算": [
    "View claim calculation",
    "보험금 계산 보기",
    "保険金計算を確認"
  ],
  "请补充事故信息": [
    "Complete the incident details",
    "사고 정보를 보완하세요",
    "事故情報を入力してください"
  ],
  "赔款已核定": [
    "Claim amount confirmed",
    "보험금 확정 완료",
    "保険金確定済み"
  ],
  "中断时段、业务影响与损失金额已汇总。": [
    "Interruption periods, business impact and loss amounts are summarized.",
    "중단 시간, 업무 영향 및 손실 금액이 정리되었습니다.",
    "中断期間、業務への影響、損失額を集計しました。"
  ],
  "损失金额": [
    "Loss amount",
    "손실 금액",
    "損失額"
  ],
  "模型版本已生效": [
    "Model version activated",
    "모델 버전 적용 완료",
    "モデルバージョン適用済み"
  ]
});
Object.assign(window.CBLocaleMessages,{
  "结案报告与支付凭证":["Closure report and payment record","종결 보고서 및 지급 기록","終結報告と支払記録"]
});
(window.CBLocalePatterns||=[]).push(["核定 {0} 赔款 {1}","Claim amount approved · {0} · {1}","보험금 확정 · {0} · {1}","保険金確定 · {0} · {1}"]);

Object.assign(window.CBLocaleMessages,{
"已报价":["Quoted","견적 완료","見積済み"],
"需要先生成保单":["Generate a policy first","먼저 보험증권을 생성하세요","先に保険証券を作成してください"],
"当前投保单尚未生成保单":["No policy has been generated for this application","이 신청의 보험증권이 아직 생성되지 않았습니다","この申込の保険証券は未作成です"],
"可继续核保并生成保单，也可以载入已经承保的完整样例，直接演示事故申报和保险人核赔。":["Continue underwriting and generate a policy, or load an insured example to present the claims process.","심사를 진행하여 보험증권을 생성하거나 가입된 사례를 불러와 사고 신고와 보험금 산정을 진행하세요.","引受審査を進めて保険証券を作成するか、加入済み事例を読み込んで事故申告と査定を進めます。"]
});

// Complete messages: never assemble policy sentences from translated keywords.
Object.assign(window.CBLocaleMessages,{
"承保净损失及各项限额":["Covered net loss and applicable limits","보장 순손실 및 적용 한도","補償対象純損失と各種限度額"],
"M1普通数字中断 + M2外部事件中断":["M1 Ordinary Interruption + M2 External Event Interruption","M1 일반 중단 + M2 외부 사건 중단","M1 通常中断 + M2 外部事象による中断"],
"最终赔款受承保净损失、服务和共同事故限额、模块年度及总年度剩余额度约束；同一损失不重复补偿。":["The final payout is capped by covered net loss, service and shared occurrence limits, and the remaining module and policy annual limits. The same loss is not compensated twice.","최종 보험금에는 보장 순손실, 서비스별 한도, 동일 사고 공통 한도, 모듈별 및 전체 계약의 연간 잔여 한도가 적용됩니다. 동일 손실은 중복 보상하지 않습니다.","最終保険金には、補償対象純損失、サービス別・同一事故共通の限度額、およびモジュール別・契約全体の年間残余限度額を適用します。同一損失は重複補償しません。"],
"同一损失不重复赔付；":["The same loss is not compensated twice.","동일 손실은 중복 보상하지 않습니다.","同一損失は重複補償しません。"],
"采用基准成本率；情景范围不是统计置信区间。全组合备用与集中度变化包含组合影响。":["Baseline cost rates apply. Scenario ranges are not statistical confidence intervals. Changes to backup arrangements and concentration across the portfolio include portfolio effects.","기준 비용률을 적용합니다. 시나리오 범위는 통계적 신뢰구간이 아닙니다. 전체 포트폴리오의 백업 및 집중도 변화에는 포트폴리오 효과가 반영됩니다.","基準費用率を適用します。シナリオ範囲は統計的信頼区間ではありません。ポートフォリオ全体のバックアップ・集中度の変更には、全体への影響を反映します。"],
"选择已承保样例":["Choose an insured example","가입 완료 사례 선택","加入済み事例を選択"]
});
Object.assign(window.CBLocaleMessages,{
"M2 外部事件中断":["M2 External Event Interruption","M2 외부 사건 중단","M2 外部事象による中断"],
"M2 · 外部事件中断":["M2 · External Event Interruption","M2 · 외부 사건 중단","M2 · 外部事象による中断"],
"外部事件中断":["External Event Interruption","외부 사건 중단","外部事象による中断"],
"已支付":["Paid","지급 완료","支払済み"],
"本案已支付金额":["Amount paid for this claim","본 건 지급 금액","本件支払済額"],
"投保项目":["Applications","청약 프로젝트","申込プロジェクト"],
"关于与数据来源":["About & data sources","소개 및 데이터 출처","概要・データ出典"],
"1项服务":["1 service","서비스 1개","1件のサービス"]
});
(window.CBLocalePatterns||=[]).push(
["承保净损失（{0}） *","Covered net loss ({0}) *","보장 순손실 ({0}) *","補償対象純損失（{0}） *"],
["已支付 {0} · 案件已结案","Paid {0} · Claim closed","{0} 지급 완료 · 사고 종결","{0} 支払済み · 案件終結"],
["双模块保障 · {0}项列明服务 · {1}","M1 + M2 coverage · Scheduled services: {0} · {1}","M1 + M2 보장 · 명시된 서비스 {0}개 · {1}","M1 + M2 補償 · 明記サービス{0}件 · {1}"],
["{0} 个独立业务组 · 全天营业","Independent businesses: {0} · 24/7 operations","독립 사업 {0}개 · 연중무휴 운영","独立事業{0}件 · 24時間365日稼働"],
["参考任务毛利：{0} × {1} = {2}","Reference contribution margin: {0} × {1} = {2}","참고 공헌이익: {0} × {1} = {2}","参考限界利益：{0} × {1} = {2}"],
["出单状态：{0}","Issuance status: {0}","발급 상태: {0}","発行状況：{0}"],
["核定状态：{0}","Assessment status: {0}","확정 상태: {0}","査定状況：{0}"],
["支付时间：{0}","Payment time: {0}","지급 시간: {0}","支払日時：{0}"],
["{0}（北京时间，终点不含）","{0} (Beijing time; end exclusive)","{0} (베이징 시간, 종료 시점 제외)","{0}（北京時間、終了時点を含まない）"],
["损失金额 {0} − 同损失补偿 {1}","Loss amount {0} − same-loss compensation {1}","손실 금액 {0} − 동일 손실 보상금 {1}","損失額 {0} − 同一損失への補償 {1}"]
);

Object.assign(window.CBLocaleMessages,{
"正在加载地图数据…":["Loading map data…","지도 데이터를 불러오는 중…","地図データを読み込み中…"],
"地图数据暂未加载完成":["Map data could not be loaded","지도 데이터를 불러오지 못했습니다","地図データを読み込めませんでした"],
"请重试，或先查看定价明细。":["Retry, or continue to the pricing breakdown.","다시 시도하거나 보험료 내역을 먼저 확인하세요.","再試行するか、先に保険料内訳をご確認ください。"],
"可以继续使用其他页面，加载完成后自动显示地图。":["You can use other pages while the map loads.","지도를 불러오는 동안 다른 페이지를 이용할 수 있습니다.","読み込み中も他のページを利用できます。"],
"重新加载":["Retry loading","다시 불러오기","再読み込み"]
});

;
/* Presentation-only localization. Stored business values and calculation inputs stay canonical. */
(function () {
  'use strict';
  const key='cloudbridge-language', messages=window.CBLocaleMessages;
  const languages=[['zh-CN','简体中文','中文'],['en','English','EN'],['ko','한국어','KO'],['ja','日本語','JA']];
  let lang='zh-CN';
  try {const saved=localStorage.getItem(key);if(languages.some(x=>x[0]===saved))lang=saved;} catch {}
  const index=()=>({en:0,ko:1,ja:2}[lang]);
  const records=new WeakMap(), attributes=new WeakMap(), values=new WeakMap();
  const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const phraseRE=new RegExp(Object.keys(messages).filter(s=>s.length>1).sort((a,b)=>b.length-a.length).map(escapeRE).join('|'),'g');
  const patterns=(window.CBLocalePatterns||[]).map(([source,...translations])=>({
    source,re:new RegExp('^'+source.split(/(\{\d+\})/).map(s=>/^\{\d+\}$/.test(s)?'(.+?)':escapeRE(s)).join('')+'$'),translations
  })).sort((a,b)=>b.source.replace(/\{\d+\}/g,'').length-a.source.replace(/\{\d+\}/g,'').length);
  function t(value,exact=false){
    const text=String(value??'');if(lang==='zh-CN')return text;
    const source=text.trim();let result=messages[source]?.[index()];
    if(result===undefined){
      for(const p of patterns){if(exact&&!p.source.startsWith('{0}笔最终'))continue;const match=source.match(p.re);if(match){result=p.translations[index()].replace(/\{(\d+)\}/g,(_,n)=>t(match[Number(n)+1]));break;}}
    }
    if(result===undefined&&!exact){
      // Never expose a partly translated sentence. Track unmatched source text,
      // rather than testing the output (Japanese translations also contain Han).
      let remainder='',last=0;
      result=source.replace(phraseRE,(k,offset)=>{remainder+=source.slice(last,offset);last=offset+k.length;return messages[k][index()];});
      remainder+=source.slice(last);
      remainder=remainder.replace(/(\d[\d,.]*)\s*(分钟|小时|元)/g,'');
      if(/[\u3400-\u9fff]/u.test(remainder))return text;
      result=result.replace(/(\d[\d,.]*)\s*分钟/g,'$1 '+['min','분','分'][index()])
        .replace(/(\d[\d,.]*)\s*小时/g,'$1 '+['hours','시간','時間'][index()])
        .replace(/(\d[\d,.]*)元/g,(_,n)=>'CNY '+n)
        .replace(/¥\s*/g,'CNY ');
    }
    if(result===undefined)return text;
    return text.slice(0,text.length-text.trimStart().length)+result+text.slice(text.trimEnd().length);
  }
  function translateNode(node){
    const old=records.get(node),source=old&&old.output===node.nodeValue?old.source:node.nodeValue;
    const output=t(source,!!node.parentElement?.closest('[data-user-text]'));
    records.set(node,{source,output});if(output!==node.nodeValue)node.nodeValue=output;
  }
  function apply(root=document.body){
    observer?.disconnect();
    if(root.nodeType===Node.TEXT_NODE){translateNode(root);}else{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode;
        if(!node.parentElement?.closest('script,style,textarea,[data-no-translate]'))translateNode(node);
      }
      const els=[...(root.matches?.('*')?[root]:[]),...root.querySelectorAll('*')];
      for(const el of els){
        if(el.closest('[data-no-translate]'))continue;
        for(const attr of ['aria-label','title','placeholder','alt']){
          if(!el.hasAttribute(attr))continue;
          const map=attributes.get(el)||{},old=map[attr],current=el.getAttribute(attr);
          const source=old&&old.output===current?old.source:current,output=t(source);
          map[attr]={source,output};attributes.set(el,map);if(output!==current)el.setAttribute(attr,output);
        }
        // Translate known sample field values for display only. Never dispatch input/change.
        if(el.matches('input[type=text],textarea')){
          const old=values.get(el),source=old&&old.output===el.value?old.source:el.value;
          const output=t(source,true);values.set(el,{source,output});if(el.value!==output)el.value=output;
        }
      }
    }
    if(root.isConnected)fitMapLabels();
    observer?.observe(document.body,{subtree:true,childList:true,characterData:true});
  }
  function canonicalValue(el){const v=values.get(el);return v&&v.output===el.value?v.source:el.value;}
  function fitMapLabels(){
    document.querySelectorAll('.geo-pin,.m2-pin').forEach(pin=>{
      const text=pin.querySelector('text'),rect=pin.querySelector('rect');if(!text||!rect)return;
      const width=Math.max(pin.classList.contains('m2-pin')?126:66,Math.ceil(text.getComputedTextLength())+22);
      rect.setAttribute('width',width);rect.setAttribute('x',Number(text.getAttribute('x'))-width/2);
    });
  }
  const globe='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>';
  function controlHTML(){return `<div class="language-control" data-no-translate><button type="button" class="language-trigger" id="language-trigger" aria-haspopup="menu" aria-controls="language-menu" aria-expanded="false" aria-label="${t('界面语言')}">${globe}<span><small>${t('语言设置')}</small><strong>${languages.find(x=>x[0]===lang)[1]}</strong></span><svg class="language-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg></button><div class="language-menu" id="language-menu" role="menu" aria-label="${t('界面语言')}" hidden>${languages.map(([code,name,short])=>`<button type="button" role="menuitemradio" aria-checked="${lang===code}" data-language="${code}" lang="${code}" tabindex="-1"><span>${name}</span><small>${lang===code?'✓':short}</small></button>`).join('')}</div></div>`;}
  function closeMenu(focus=false){const trigger=document.getElementById('language-trigger'),menu=document.getElementById('language-menu');if(menu)menu.hidden=true;trigger?.setAttribute('aria-expanded','false');if(focus)trigger?.focus();}
  function openMenu(){window.CBSelectUI?.close();const trigger=document.getElementById('language-trigger'),menu=document.getElementById('language-menu');if(!menu)return;menu.hidden=false;trigger.setAttribute('aria-expanded','true');menu.querySelector('[aria-checked=true]').focus();}
  function setLanguage(next){
    if(!languages.some(x=>x[0]===next))return;
    window.CBSelectUI?.close();
    lang=next;try{localStorage.setItem(key,lang);}catch{}
    document.documentElement.lang=lang;document.title='CloudBridge · '+t('跨境数字服务中断保险');
    document.querySelector('meta[name=description]')?.setAttribute('content',t('跨境数字服务中断保险'));
    apply();
    const host=document.querySelector('.sidebar-bottom');if(host)host.innerHTML=controlHTML();
    document.getElementById('language-trigger')?.focus({preventScroll:true});
    window.dispatchEvent(new CustomEvent('cloudbridge:language',{detail:lang}));
  }
  function html(source){const d=new DOMParser().parseFromString(source,'text/html');apply(d.body);d.documentElement.lang=lang;d.title=t(d.title);return '<!DOCTYPE html>\n'+d.documentElement.outerHTML;}
  let observer=null;
  window.CBI18n={t,apply,controlHTML,canonicalValue,setLanguage,html,get language(){return lang;},get locale(){return {en:'en-US',ko:'ko-KR',ja:'ja-JP','zh-CN':'zh-CN'}[lang];}};
  document.documentElement.lang=lang;
  document.title='CloudBridge · '+t('跨境数字服务中断保险');
  document.addEventListener('click',e=>{
    const option=e.target.closest('[data-language]');if(option){setLanguage(option.dataset.language);return;}
    if(e.target.closest('#language-trigger')){document.getElementById('language-menu').hidden?openMenu():closeMenu();return;}
    if(!e.target.closest('.language-control'))closeMenu();
  });
  document.addEventListener('keydown',e=>{
    const menu=document.getElementById('language-menu');
    if(e.target.closest('#language-trigger')&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();openMenu();return;}
    if(!menu||menu.hidden||!e.target.closest('.language-control'))return;
    if(e.key==='Escape'){e.preventDefault();closeMenu(true);return;}
    if(e.key==='Tab'){closeMenu();return;}
    if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();const opts=[...menu.querySelectorAll('button')],i=opts.indexOf(document.activeElement);
      opts[e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowDown'?1:3))%4].focus();
    }
  });
  observer=new MutationObserver(()=>apply());
  apply();
})();

;
/* Optional map data loads once per session; never blocks application or claims. */
(function(root){
 'use strict';
 const groups={m1:['world','m1'],m2:['world','conflict','exposure']},jobs=new Map(),errors=new Map();
 function has(id){const key=CBRiskManifest[id].global;return id==='world'?!!root[key]?.land:!!root[key];}
 async function json(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);const bytes=new Uint8Array(await r.arrayBuffer());const blob=new Blob([bytes]);return await new Response(bytes[0]===31&&bytes[1]===139?blob.stream().pipeThrough(new DecompressionStream('gzip')):blob.stream()).json();}finally{clearTimeout(timer)}}
 function script(url){return new Promise((resolve,reject)=>{const el=document.createElement('script'),timer=setTimeout(()=>{el.remove();reject(Error('Load timeout'))},30000);el.src=url;el.onload=()=>{clearTimeout(timer);el.remove();resolve()};el.onerror=()=>{clearTimeout(timer);el.remove();reject(Error('Load failed'))};document.head.append(el)})}
 function load(id){if(has(id))return Promise.resolve();if(jobs.has(id))return jobs.get(id);const spec=CBRiskManifest[id],points=id==='world'?{...root.CBWorldMap?.points}:null;
  const job=(async()=>{if(location.protocol==='file:'||typeof DecompressionStream==='undefined'){await script(spec.script)}else{const data=await json(spec.packed);root[spec.global]=data;}if(id==='world')Object.assign(root.CBWorldMap.points,points);if(!has(id))throw Error('Missing data');})().catch(e=>{jobs.delete(id);throw e});jobs.set(id,job);return job;
 }
 const running=new Map();
 function ensure(group){if(ready(group))return Promise.resolve();if(errors.has(group))return Promise.reject(errors.get(group));if(running.has(group))return running.get(group);const job=Promise.all(groups[group].map(load)).catch(e=>{errors.set(group,e);throw e}).finally(()=>{running.delete(group);root.dispatchEvent(new CustomEvent('cloudbridge:risk-data',{detail:group}))});running.set(group,job);return job;}
 function ready(group){return groups[group].every(has)}
 root.CBRiskAssets={json,ready,ensure,failed:group=>errors.has(group),retry(group){errors.delete(group);return ensure(group)}};
})(window);

;
(function () {
  'use strict';
  const E=window.CBEngine,D=window.CBData,KEY='cloudbridge-workspace-demo-v3';
  // randomUUID is secure-context-only; getRandomValues also works on HTTP demos.
  function workspaceUUID(){
    if(typeof globalThis.crypto.randomUUID==='function')return globalThis.crypto.randomUUID();
    const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  const clone=x=>structuredClone(x), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const user=x=>`<span data-user-text>${esc(x)}</span>`;
  const money=n=>n===null||n===undefined?'—':new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
  const integer=n=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(Number(n)||0);
  const pct=n=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n)+'%';
  const now=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,16);
  // User-requested clean demonstration workspace. Historical source datasets are independent.
  function fresh(){return {version:1,apps:[],archived:[],selected:null,model:clone(D.model),draftModel:clone(D.model),modelHistory:[],view:'application'};}
  let state;
  try {
    const raw=JSON.parse(localStorage.getItem(KEY));state=raw?.version===1&&Array.isArray(raw.apps)&&raw.model?raw:fresh();
    // Retire both old business workspaces, including embedded legacy archives.
    for(const key of ['cloudbridge-workspace-unified-v2','cloudbridge-workspace-v1'])localStorage.removeItem(key);
  } catch {state=fresh();}
  state.archived||=[];
  for(const a of state.apps){if(a.claim?.reviewNote==='示例调查记录：监测、业务交易和切换记录的事故时段相互吻合。待核赔人逐项复核。')a.claim.reviewNote='中断时段、业务影响与损失金额已汇总。';}
  for(const a of state.apps){if(!a.policy&&!a.company?.trim())a.company='远帆跨境科技有限公司';}
  for(const a of state.apps){if(!a.policy&&a.termsVersion==='CB-UNIFIED-2.0')for(const service of a.services)if(service.kind==='AI API'&&!service.olaVersion){Object.assign(service,D.olaDefaults);a.quote=null;if(a.stage==='quoted')a.stage='submitted';}}
  if(state.scopeVersion!==CBExternal.version){
    const replaced=new Map();
    state.apps=state.apps.map(a=>{
      if(a.policy&&a.policy.terms.coverageVersion!==CBExternal.version){
        state.archived.push({...clone(a),archivedAt:now()});
        const next=D.makeApp(a.pricingProfile);next.id='CB-A-'+workspaceUUID().slice(0,12).toUpperCase();next.company=a.company;next.stage='draft';next.consent=false;
        replaced.set(a.id,next.id);return next;
      }
      a.coverageVersion=CBExternal.version;a.quote=null;a.quoteModel=null;
      if(a.claim&&['access','connection'].includes(a.claim.reportedCause)){a.sampleKind='m2';a.claim=D.claim(a);}
      return a;
    });
    state.selected=replaced.get(state.selected)||state.selected;
    for(const key of ['model','draftModel']){state[key]={...CBPricing.defaults,...state[key],version:CBPricing.version};if(!CBUnifiedData.scenarios[state[key].scenario])state[key].scenario='baseline';}
    state.scopeVersion=CBExternal.version;
  }
  state.pricingVersion=CBPricing.version;
  for(const key of ['model','draftModel'])state[key]={...CBPricing.defaults,...(state[key]||state.model)};
  let catalogSearchTimer;
  const views=['application','underwriting','claim','assessment','model'];
  const ui={m1Map:{},view:views.includes(state.view)?state.view:'underwriting',formStep:0,uwTab:'risk',claimTab:'report',reviewTab:'evidence',mapModule:'m1',region:null,modelTab:'parameters',m2Layer:'hazard',m2Basis:'standard',m2Configuration:'regional',m2Service:null,exposureServices:[],evidenceSource:'conflict',externalNotice:'ofac-2024'};
  if(views.includes(location.hash.slice(1)))ui.view=location.hash.slice(1);
  if(location.hash==='#application'){ui.view='application';ui.formStep=0;}
  if(location.hash==='#risk'){ui.view='underwriting';ui.uwTab='risk';}
  if(location.hash==='#pricing'){ui.view='underwriting';ui.uwTab='pricing';}
  if(location.hash==='#m2'){ui.view='underwriting';ui.mapModule='m2';}
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const app=()=>state.apps.find(x=>x.id===state.selected)||state.apps[0];
  const quote=(a=app(),m=state.model)=>window.CBPricing.quote(a,m,D.regions);
  const policyTerms=()=>app().policy?.terms||app();
  const claim=()=>app().claim;
  const currency=()=>app()?.policy?.terms.currency||app()?.currency||'USD';
  const present=html=>CBUnifiedUI.currencyHTML(html,currency());
  const assessment=()=>claim().approved&&claim().settlement?.assessment?claim().settlement.assessment:E.assess(app(),claim());
  const audit=text=>app().history.unshift({at:now(),text});
  function save(){try{const json=JSON.stringify(state);if(localStorage.getItem(KEY)!==json)localStorage.setItem(KEY,json);}catch{toast('浏览器存储不可用，当前更改仅保留在本次会话');}}
  function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),3400);}
  const paths={
    shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6',
    form:'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9L15 3H8Z M14 3v7h7 M7 14h8 M7 17h6',
    globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M3 12h18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z',
    claim:'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3 M7 8h5 M7 12h3 M14 10l6-6 3 3-6 6-4 1 1-4Z',
    scan:'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M4 12h16 M8 9v6 M12 9v6 M16 9v6',
    model:'M4 19h16 M6 15v-3 M12 15V8 M18 15V4',
    plus:'M12 5v14 M5 12h14',arrow:'M5 12h14 M14 7l5 5-5 5',down:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
    check:'m5 12 4 4L19 6',chevron:'m9 5 7 7-7 7',clock:'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z M20 2v4 M18 4h4',
    link:'m9 15 6-6 M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
    menu:'M4 6h16 M4 12h16 M4 18h16',close:'M6 6l12 12 M18 6 6 18',folder:'M3 6h7l2 3h9v11H3V6Z',
    info:'M12 11v6 M12 7v.5 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',file:'M14 3H5v18h14V8l-5-5Z M14 3v6h5 M8 13h8 M8 16h6',
    external:'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',wallet:'M3 6h17v14H3V6Z M3 6l15-3v3 M15 11h7v5h-7v-5Z',trash:'M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7'
  };
  const icon=(name,cls='')=>`<svg class='${cls}' aria-hidden='true' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.65' stroke-linecap='round' stroke-linejoin='round'><path d='${paths[name]||paths.file}'/></svg>`;
  const btn=(text,action,classes='',ic='')=>`<button type='button' class='btn ${classes}' data-action='${action}'>${ic?icon(ic):''}${text}</button>`;
  const badge=(text,color='')=>`<span class='badge ${color}'>${text}</span>`;
  const stageName=a=>a.policy?'保障已确认':a.stage==='quoted'?'已报价':a.stage==='submitted'?'待核保':'投保草稿';
  function heading(kicker,title,desc,actions=''){return `<div class='page-heading'><h1>${title}</h1><div class='heading-actions'>${actions}</div></div>`;}
  function strip(){const a=app();return `<div class='case-strip'><span class='provider'>${esc(a.company.slice(0,1))}</span><span class='case-name'>${user(a.company)}</span><span class='mono'>${esc(a.id)} · ${currency()}</span><div class='right'><div class='state-steps'><b>投保</b><i>—</i><${a.quote?'b':'span'}>报价</${a.quote?'b':'span'}><i>—</i><${a.policy?'b':'span'}>出单</${a.policy?'b':'span'}><i>—</i><${a.claim.submitted?'b':'span'}>报案</${a.claim.submitted?'b':'span'}></div>${badge(stageName(a),a.policy?'green':'orange')}</div></div>`;}
  function card(title,subtitle,body,right='',classes=''){return `<section class='card ${classes}'><div class='card-head'><div><h2>${title}</h2></div>${right}</div>${body}</section>`;}
  const body=(html,cls='')=>`<div class='card-body ${cls}'>${html}</div>`;
  const stat=(label,value,note,ic='shield')=>`<article class='stat'><div class='stat-top'>${label}${icon(ic)}</div><div class='stat-value number'>${value}</div><div class='stat-note'>${note}</div></article>`;
  function field(label,path,value,type='text',note='',attrs=''){return `<label class='field'><span>${label}</span><input type='${type}' ${path} value='${esc(value)}' ${attrs}>${note?`<small>${note}</small>`:''}</label>`;}
  function select(label,path,value,options,note=''){return `<label class='field'><span>${label}</span><select ${path}>${options.map(x=>{const v=Array.isArray(x)?x[0]:x,t=Array.isArray(x)?x[1]:x;return `<option value='${esc(v)}' ${v===value?'selected':''}>${esc(t)}</option>`;}).join('')}</select>${note?`<small>${note}</small>`:''}</label>`;}
  function textarea(label,path,value,note=''){return `<label class='field wide'><span>${label}</span><textarea ${path}>${esc(value)}</textarea>${note?`<small>${note}</small>`:''}</label>`;}
  const kv=(label,value)=>`<div class='key-value'><span>${label}</span><strong>${value}</strong></div>`;
  function lockedNote(){return app().policy?`<div class='note green locked-banner'>${icon('shield')} 该保单已按报价快照确认，承保参数已锁定。${btn('复制为新的投保单','clone-app','small')}</div>`:'';}
  function sidebar(){const items=[['application','form','承保','客户 · 投保问卷'],['underwriting','globe','核保','保险人 · 风险与报价'],['claim','claim','理赔','客户 · 事故申报'],['assessment','scan','核赔','保险人 · 调查与结案'],['model','model','定价模型','模型参数 · 版本管理']];
    $('#sidebar').innerHTML=`<div class='sidebar-brand'><img class='brand-icon' src='icon.svg' alt=''><div><strong>CloudBridge</strong><small>Digital Resilience Insurance</small></div></div><div class='sidebar-scroll'><button class='sidebar-new' data-action='new-app'>${icon('plus')}新建投保单<kbd>＋</kbd></button><div class='section-label'>保险业务工作区 <span class='count'>05</span></div><nav>${items.map((x,i)=>`<button class='nav-item ${ui.view===x[0]?'active':''}' data-view='${x[0]}' ${ui.view===x[0]?"aria-current='page'":''}>${icon(x[1],'nav-icon')}<span><strong>${x[2]}</strong><small>${x[3]}</small></span><span class='step-no'>0${i+1}</span></button>`).join('')}</nav><div class='section-label'>投保项目 <span class='count'>${state.apps.length}</span></div>${state.apps.map(a=>`<button class='app-entry ${a.id===app()?.id?'active':''}' data-select='${a.id}'><span class='app-avatar'>${esc(a.company.slice(0,1)||'新')}</span><span><strong>${user(a.company||'未命名企业')}</strong><small>${a.services[0]?.kind==='AI API'?'AI API · ':''}${stageName(a)}</small></span>${a.policy?"<span class='app-dot'></span>":''}</button>`).join('')}<button class='nav-item' data-action='archives'>${icon('folder','nav-icon')}<span><strong>项目归档</strong></span><span class='count'>${state.archived.length}</span></button><div class='section-label'>业务工具</div><button class='nav-item' data-action='guide'>${icon('info','nav-icon')}<span><strong>业务流程</strong></span></button><button class='nav-item' data-action='load-case'>${icon('folder','nav-icon')}<span><strong>载入已承保样例</strong></span></button><button class='nav-item' data-action='export-workspace'>${icon('down','nav-icon')}<span><strong>导出业务档案</strong></span></button></div><div class='sidebar-bottom'>${window.CBI18n.controlHTML()}</div>`;
  }
  function topbar(){const titles={application:'承保 · 投保问卷',underwriting:'核保工作台',claim:'理赔 · 事故申报',assessment:'核赔工作台',model:'定价模型'};$('#topbar').innerHTML=`<div class='breadcrumb'><button class='icon-btn mobile-menu' data-action='menu' aria-label='展开导航'>${icon('menu')}</button>${icon('folder')}<span>保险业务</span><span>/</span><strong>${titles[ui.view]}</strong></div><div class='top-tools'>${app()?btn('归档当前项目','archive-current','small','folder'):''}<button class='text-btn' data-action='guide'>业务流程 ↗</button><button class='icon-btn' data-action='about' aria-label='关于与数据来源'>${icon('info')}</button></div>`;}
  function render(persist=true){window.CBSelectUI.close();state.view=ui.view;document.body.dataset.role=['underwriting','assessment','model'].includes(ui.view)?'insurer':'insured';sidebar();topbar();const map={application:applicationView,underwriting:underwritingView,claim:claimView,assessment:assessmentView,model:modelView};$('#main').innerHTML=`<div class='view-enter ${ui.view==='underwriting'&&ui.uwTab==='risk'?'map-view-stable':''}'>${present(app()?map[ui.view]():emptyWorkspace())}</div>`;window.CBSelectUI.enhance($('#main'));window.CBM2Map.bindPan($('.evidence-world'),ui.mapModule==='m1'?ui.m1Map:ui,render);window.CBEventDirectory.mount();if(persist)save();}
  function emptyWorkspace(){return `<section class="empty workspace-empty"><div class="empty-icon">${icon('folder')}</div><h2>开始新的演示项目</h2><p>当前没有进行中的项目</p><div class="workspace-empty-actions">${btn('新建投保单','new-app','primary','plus')}${state.archived.length?btn('查看归档','archives','','folder'):''}</div></section>`;}
  function showArchives(){modal('项目归档',state.archived.length?`<div class="archive-list">${state.archived.map(a=>`<article class="archive-row"><div><h3>${user(a.company||'未命名企业')}</h3><p data-no-translate>${esc(a.id)} · ${esc(a.archivedAt)}</p><span>${stageName(a)}</span></div><div class="archive-actions"><button class="btn small" data-archive-view="${esc(a.id)}">查看档案</button><button class="btn small" data-archive-export="${esc(a.id)}">导出</button><button class="btn small primary" data-archive-restore="${esc(a.id)}">恢复项目</button></div></article>`).join('')}</div>`:'<div class="empty"><h3>暂无归档项目</h3></div>',btn('关闭','close-dialog'));}
  function archiveCurrent(){const a=app();if(!a)return;state.archived.unshift({...clone(a),archivedAt:now()});state.apps=state.apps.filter(x=>x.id!==a.id);state.selected=state.apps[0]?.id||null;ui.formStep=0;render();toast('项目已归档');}
  function archiveDetail(id){const a=state.archived.find(a=>a.id===id);if(!a)return;const t=a.policy?.terms||a;modal('归档项目档案',`<div class="archive-summary"><h3>${user(a.company||'未命名企业')}</h3>${kv('项目编号',esc(a.id))}${kv('归档时间',esc(a.archivedAt))}${kv('项目状态',stageName(a))}${kv('保单编号',esc(a.policy?.id||'—'))}${kv('报价金额',a.quote?esc(a.currency)+' '+money(a.quote.total):'—')}${kv('赔案状态',a.claim?.paid?'已结案':a.claim?.submitted?'已报案':'未报案')}<h3>列明服务附表</h3>${t.services.map(s=>`<p data-user-text>${esc(s.provider+' · '+s.service+' · '+s.business)}</p>`).join('')}<h3>业务轨迹</h3>${historyView(a.history||[])}<details><summary>完整业务档案</summary><pre data-no-translate class="archive-json">${esc(JSON.stringify(a,null,2))}</pre></details></div>`,`<button class="btn" data-action="archives">返回归档</button><button class="btn" data-archive-export="${esc(id)}">导出</button><button class="btn primary" data-archive-restore="${esc(id)}">恢复项目</button>`);}
  function go(view,tab){ui.view=view;if(view==='underwriting')ui.uwTab=['risk','pricing','policy'].includes(tab)?tab:'risk';if(view==='claim')ui.claimTab=['report','loss','materials'].includes(tab)?tab:'report';if(tab){if(view==='underwriting')ui.uwTab=tab;if(view==='assessment')ui.reviewTab=tab;}render();window.scrollTo({top:0,behavior:'instant'});$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show');}
  function worldMap(){
    const group=ui.mapModule==='m2'?'m2':'m1';
    if(window.CBRiskAssets&&!CBRiskAssets.ready(group)){
      CBRiskAssets.ensure(group).catch(()=>{});
      return `<div class='map-toolbar'><div class='segmented'><button data-map='m1' class='${group==='m1'?'active':''}'>M1 普通中断</button><button data-map='m2' class='${group==='m2'?'active':''}'>M2 外部事件中断</button></div></div><div class='risk-loading' role='status' aria-live='polite'><h3>${CBRiskAssets.failed(group)?'地图数据暂未加载完成':'正在加载地图数据…'}</h3><p>${CBRiskAssets.failed(group)?'请重试，或先查看定价明细。':'可以继续使用其他页面，加载完成后自动显示地图。'}</p>${CBRiskAssets.failed(group)?btn('重新加载','retry-risk-data'):''}${btn('查看定价明细','pricing-tab')}</div>`;
    }
    if(ui.mapModule==='m2')return window.CBM2Map.render(app(),state.model,ui);
    return CBUnifiedUI.m1(app(),ui);
  }
  function quoteCard(){const a=app(),q=a.policy?.quote||a.quote||quote();return card('报价试算','',body(`<div class='demo-stamp'>${esc(q.modelVersion)}</div><div class='quote-price number'><small>¥</small>${money(q.total)}<span class='unit'>/ 年</span></div><p class='quote-meta'>${a.m2?'双模块保障':'M1单模块'} · ${a.services.length}项列明服务 · 人民币</p><div class='price-row'><span><i class='dot' style='color:#397aad'></i> M1 日常数字中断</span><strong>¥ ${money(q.p1)}</strong></div><div class='price-row'><span><i class='dot' style='color:#94a3b8'></i> M2 外部事件中断</span><strong>${a.m2?'¥ '+money(q.p2):'未选择'}</strong></div><small>模块保费按期望赔款占比分摊。</small><div class='mini-bar'><span class='m1' style='width:${q.total?q.p1/q.total*100:100}%'></span><span class='m2' style='width:${q.total?q.p2/q.total*100:0}%'></span></div><div class='quote-divider'></div><div class='price-row'><span>每小时约定金额</span><strong>¥ ${money(q.hourly)}</strong></div><div class='price-row'><span>等待期 / 最长赔偿</span><strong>${a.waiting}分钟 <small>/</small> ${a.maxHours}小时</strong></div><div class='price-row'><span>共同事故限额</span><strong>¥ ${integer(a.occLimit)}</strong></div><div class='quote-divider'></div>${a.policy?btn('查看保单','policy-tab','primary full','shield'):btn('生成保单','issue-policy','primary full','shield')}`),'','quote-card');}
  function serviceTable(){const a=app(),services=(a.policy?.terms||a).services,showExposure=ui.mapModule==='m2';return card('列明服务与业务依赖','核保时锁定服务、区域及独立业务组',`<div class='table-wrap' id='insured-service-list'><table><thead><tr>${showExposure?'<th class=exposure-check-col>地图</th>':''}<th>云服务 / 业务</th><th>承保区域</th><th>业务连续性</th><th class='num'>每小时金额</th><th></th></tr></thead><tbody>${services.map(s=>`<tr class='${showExposure&&ui.exposureServices.includes(s.id)?'exposure-selected':''}'>${showExposure?`<td class='exposure-check-col'><input type='checkbox' data-exposure-service='${esc(s.id)}' aria-label='${esc(s.provider+' · '+s.service)}' ${ui.exposureServices.includes(s.id)?'checked':''}></td>`:''}<td><div class='cell-flex'><span class='provider'>${esc(s.provider.slice(0,1))}</span><span><strong>${user(s.provider)} · ${user(s.service)}</strong><small>${user(s.business)}</small></span></div></td><td>${esc(D.regions.find(r=>r.id===s.region)?.name)}</td><td>${badge(s.backup==='tested'?'备用已演练':s.backup==='untested'?'备用未验证':'暂无可用替代',s.backup==='tested'?'green':'orange')}</td><td class='num'>¥ ${money(E.hourly(s))}</td><td><button class='text-btn' data-action='edit-services'>详情 ↗</button></td></tr>`).join('')}</tbody></table></div><div class='card-foot'><span>同一业务多项依赖须合并核定，避免重复承保损失。</span><button class='text-btn' data-action='edit-services'>编辑依赖清单 →</button></div>`);}
  function eventsCard(){return card('历史事件与风险证据','真实公开事件仅作参考，不直接转换为事故概率',`<div class='event-list'>${D.events.map(x=>`<article class='event-item'><time class='event-date'>${x.date}</time><div><h3>${x.title}${badge(x.module)}</h3><p>${x.summary}</p><a href='${x.url}' target='_blank' rel='noopener noreferrer'>${x.source} ↗</a></div></article>`).join('')}</div>`);}
  function underwritingView(){const a=app(),q=a.policy?.quote||a.quote||quote();const tabs=[['risk','风险总览'],['pricing','定价明细'],['policy','报价与保单']];return heading('','核保工作台','',btn('导出核保摘要','export-underwriting','','down')+btn(a.policy?'查看保单':'生成保单',a.policy?'policy-tab':'issue-policy','dark','arrow'))+strip()+`<div class='tabs'>${tabs.map(x=>`<button data-uwtab='${x[0]}' class='${ui.uwTab===x[0]?'active':''}'>${x[1]}${x[0]==='risk'?'<small>01</small>':''}</button>`).join('')}</div>`+(ui.uwTab==='risk'?`<div class='content-grid m2-expanded risk-overview-grid'><div class='stack'>${card('全球风险视图','双模块、分区域风险观察',worldMap(),`<button class='text-btn' data-action='risk-method'>口径与来源 ↗</button>`,'risk-map-card')}${serviceTable()}</div><div class='stack'><div class='insight'><div class='insight-icon'>${icon('spark')}</div><div><h3>待核实事项 ${badge('规则分析')}</h3><p>${a.services.some(s=>s.backup!=='tested')?'当前存在未经验证的替代方案，建议补充切换演练记录，核实关键业务是否真正恢复。':'备用方案已有演练记录；仍需核查备用服务与主服务是否共享上游故障点。'}</p><button class='text-btn' data-action='dependency-insight'>查看依赖分析 →</button></div></div>${card('保障结构','两类事故，统一限额管理',body(kv('M1 普通数字服务中断',badge('已选择','green'))+kv('M2 外部事件中断',badge(a.m2?'已选择':'未选择',a.m2?'orange':''))+kv('M1 / M2年度限额',`${integer(a.annual1)} / ${integer(a.annual2)}元`)+kv('赔款封顶','承保净损失及各项限额')))}</div></div><div class='workflow-footer'>${btn('查看定价明细','pricing-tab','','arrow')}${a.policy?btn('查看保单','policy-tab','primary','shield'):btn('生成保单','issue-policy','primary','shield')}</div>`:ui.uwTab==='pricing'?pricingView():policyView());}
  function pricingView(){const a=app(),q=a.policy?.quote||a.quote||quote();return `<div class='stats'>${stat('约定小时金额',`¥ ${integer(q.hourly)}`,'业务量 × 贡献毛利 × 不可挽回比例','wallet')}${stat('每次事故限额',`¥ ${integer(a.occLimit)}`,'同因事故、多项服务共用限额','shield')}${stat('年度总限额',`¥ ${integer(a.annualTotal)}`,'M1与M2共同受总限额约束','model')}${stat('当前承保依赖',`${a.services.length}<small>项服务</small>`,`${new Set(a.services.map(s=>s.group)).size} 个独立业务组 · ${a.calendar==='business'?'工作日09–17':'全天营业'}`,'link')}</div>`+window.CBPricingView.render(a,q,state.model)+(window.CBM1Catalog?CBM1Catalog.pricing(a,q):'');}
  function olaRules(s){return `<dl class='ola-rules'><div><dt>测量证据</dt><dd>企业调用日志＋独立测试；证据冲突或样本不足时转人工复核，不自动判定恢复。</dd></div><div><dt>有效调用</dt><dd>仅统计列明模型、接口与使用地区的有效调用；排除错误密钥、企业自身配置等约定不承保原因。</dd></div><div><dt>判定与计时</dt><dd>按约定窗口汇总，在响应时限内成功完成的有效调用占比低于标准即为不达标；确认后从该不达标窗口起点计时，另扣保单等待期。</dd></div><div><dt>恢复与停止</dt><dd>原服务或已接入、可接管业务的备用服务连续达标，经恢复窗口确认后，回溯至该达标窗口起点停止计时；无调用不等于已恢复。</dd></div></dl>`;}
  function olaEditor(s,i,disabled){if(!s.olaVersion)return `<p class='basic-ai-note'>OLA按原保单约定执行。</p>`;return `<div class='ola-section'><div class='box-head'><h3>OLA · 两步约定</h3></div><div class='ola-step-title'>01 · 服务标准</div><div class='form-grid'>${field('有效调用成功率（%）',`data-s='${i}.olaSuccess' ${disabled}`,s.olaSuccess,'number','','min=0.01 max=100 step=0.01')}${field('响应时间上限（秒）',`data-s='${i}.olaResponse' ${disabled}`,s.olaResponse,'number','','min=0.1 max=3600 step=0.1')}</div><div class='ola-step-title'>02 · 测量规则</div><div class='form-grid'>${field('持续不达标判定窗口（分钟）',`data-s='${i}.olaWindow' ${disabled}`,s.olaWindow,'number','','min=1 max=60 step=1')}${field('连续达标恢复窗口（分钟）',`data-s='${i}.olaRecovery' ${disabled}`,s.olaRecovery,'number','','min=1 max=60 step=1')}</div><details class='ola-details'><summary>查看测量与恢复约定</summary>${olaRules(s)}</details></div>`;}
  function olaSummary(t=policyTerms()){const services=t.services.filter(s=>s.kind==='AI API');if(!services.length)return '';return `<section class='ola-summary'><h3>OLA · 服务与测量约定</h3>${services.map(s=>`<div class='ola-record'><strong>${user(s.business)}</strong>${s.olaVersion?`<div class='ola-specs'>${kv('列明模型 / 版本',user(s.model))}${kv('受保API接口 / 端点',user(s.endpoint))}${kv('企业使用地区',user(s.usageCountry))}${kv('有效调用成功率（%）',esc(s.olaSuccess))}${kv('响应时间上限（秒）',esc(s.olaResponse))}${kv('持续不达标判定窗口（分钟）',esc(s.olaWindow))}${kv('连续达标恢复窗口（分钟）',esc(s.olaRecovery))}</div>`:'<p>OLA按原保单约定执行。</p>'}</div>`).join('')}${services.some(s=>s.olaVersion)?`<details class='ola-details'><summary>查看测量与恢复约定</summary>${olaRules()}</details>`:''}</section>`;}
  function applicationView(){const a=app(),steps=['基本信息','业务连续性','财务影响','保障条件','投保概览'],disabled=a.policy?'disabled':'';let form='';
    if(ui.formStep===0)form=`<div class='form-grid basic-company'>${field('企业名称 *',`data-a='company' ${disabled}`,a.company)}</div>`+a.services.map((s,i)=>`<section class='service-box'><div class='box-head'><h3>${s.kind==='AI API'?'AI API':'承保服务'} · ${user(s.business)}</h3>${!a.policy&&a.services.length>1?`<button class='icon-btn' data-remove-service='${i}' aria-label='删除服务${i+1}'>${icon('trash')}</button>`:''}</div><div class='form-grid'>${select('服务商 *',`data-s='${i}.provider' ${disabled}`,s.provider,['Google Cloud','Azure','AWS','Alibaba Cloud','Cloudflare','其他'])}${select('服务类型 *',`data-s='${i}.kind' ${disabled}`,s.kind,['AI API','云计算','云存储','数据库','CDN / 网络','其他'])}${field(s.kind==='AI API'?'AI API产品 *':'具体产品 / 服务 *',`data-s='${i}.service' ${disabled}`,s.service)}${select('部署区域 *',`data-s='${i}.region' ${disabled}`,s.region,D.regions.map(r=>[r.id,r.name]))}${s.kind==='AI API'?field('列明模型 / 版本 *',`data-s='${i}.model' ${disabled}`,s.model||''):''}${field(s.kind==='AI API'?'受保API接口 / 端点 *':'生产端点 / 受保功能',`data-s='${i}.endpoint' ${disabled}`,s.endpoint)}${field('用于哪项业务 *',`data-s='${i}.business' ${disabled}`,s.business)}${field('企业使用地区',`data-s='${i}.usageCountry' ${disabled}`,s.usageCountry||'')}</div>${s.kind==='AI API'?olaEditor(s,i,disabled):''}</section>`).join('')+(!a.policy?btn('添加承保服务','add-service','','plus'):'');
    if(ui.formStep===1)form=`<div class='form-grid'>${select('业务运行时间',`data-a='calendar' ${disabled}`,a.calendar,[['24x7','全年 7×24 小时'],['business','工作日 09:00–17:00']])}</div>`+a.services.map((s,i)=>`<section class='service-box'><div class='box-head'><h3>${user(s.business)}</h3></div><div class='form-grid'>${select(s.kind==='AI API'?'备用模型 / API':'替代 / 备份可用性',`data-s='${i}.backup' ${disabled}`,s.backup,[['none','没有可用替代'],['untested','有替代，但尚未完成演练'],['tested','已完成业务切换演练']])}${s.backup!=='none'?field('预计业务恢复时间（分钟）',`data-s='${i}.rto' ${disabled}`,s.rto,'number','','min=0 max=10080'):''}${s.backup==='tested'?field('最近一次切换演练日期',`data-s='${i}.backupDate' ${disabled}`,s.backupDate,'date'):''}${textarea(s.kind==='AI API'?'备用API与切换方案':'备用方案与恢复说明',`data-s='${i}.backupNotes' ${disabled}`,s.backupNotes||'')}</div></section>`).join('');
    if(ui.formStep===2)form=a.services.map((s,i)=>`<section class='service-box'><div class='box-head'><h3>${user(s.business)}</h3>${badge('小时金额依据')}</div><div class='form-grid'>${field('正常业务量（唯一付费任务/小时） *',`data-s='${i}.volume' ${disabled}`,s.volume,'number','按订单或付费任务去重，不使用API请求次数。','min=1 step=1')}${field('每笔贡献毛利（元） *',`data-s='${i}.margin' ${disabled}`,s.margin,'number','收入扣除随业务发生的可变成本。','min=0.01 step=0.01')}${field('不可挽回比例（%） *',`data-s='${i}.irrecoverable' ${disabled}`,s.irrecoverable,'number','恢复后能够补做并取得收入的部分应剔除。','min=0.01 max=100 step=1')}${field('财务依据观察期',`data-s='${i}.basisPeriod' ${disabled}`,s.basisPeriod||'近90天同营业时段','text')}${textarea('数据来源与估算依据',`data-s='${i}.financialBasis' ${disabled}`,s.financialBasis||'业务系统按唯一订单汇总，财务核对单笔贡献毛利；根据历史补单率估计不可挽回比例。')}</div><div class='formula mt'>${integer(s.volume)} 笔/小时 × ¥${money(s.margin)} × ${s.irrecoverable}%<br><strong>建议约定小时金额：¥ ${money(E.hourly(s))}</strong></div></section>`).join('');
    if(ui.formStep===3)form=`<div class='form-grid'>${field('保险起始日期 *',`data-a='periodStart' ${disabled}`,a.periodStart,'date')}${field('保险终止日期 *',`data-a='periodEnd' ${disabled}`,a.periodEnd,'date','终止日00:00不再属于保障期间')}${field('等待期（分钟）',`data-a='waiting' ${disabled}`,a.waiting,'number','同一合并事故累计实际中断时间扣除一次。','min=0 max=1440 step=5')}${field('最长可赔时间（小时）',`data-a='maxHours' ${disabled}`,a.maxHours,'number','仅累计符合营业时间和业务影响的可赔分钟。','min=0.1 max=168 step=0.5')}${field('共同每次事故限额（元）',`data-a='occLimit' ${disabled}`,a.occLimit,'number','','min=1 step=10000')}${field('M1年度累计限额（元）',`data-a='annual1' ${disabled}`,a.annual1,'number','','min=1 step=10000')}${select('是否投保M2扩展',`data-a='m2' data-bool ${disabled}`,a.m2?'true':'false',[['true','投保 · 外部事件中断'],['false','不投保 · 仅M1']])}${field('M2年度累计限额（元）',`data-a='annual2' ${disabled}`,a.annual2,'number','','min=1 step=10000')}${field('保单年度总限额（元）',`data-a='annualTotal' ${disabled}`,a.annualTotal,'number','','min=1 step=10000')}</div><div class='coverage-list'><article><h3>M1 普通中断</h3><p>约定的硬件、软件、操作、供电及网络故障等。仍适用具体责任边界和除外约定。</p></article><article><h3>M2 外部事件中断</h3><p>${esc(CBExternal.policyText(a.policy?.terms||a))}</p></article></div>`;
    if(ui.formStep===4){const errors=E.validateApplication(a);form=`${kv('投保企业',user(a.company))}${kv('承保服务',`${a.services.length}项服务`)}${kv('约定小时金额合计','¥ '+money(quote().hourly))}${kv('保障期间',`${a.periodStart} 至 ${a.periodEnd}`)}${kv('等待期 / 最长可赔时间',`${a.waiting}分钟 / ${a.maxHours}小时`)}${kv('试算年保费','¥ '+money(quote().total))}<div class='note ${errors.length?'red':'green'} mt'>${errors.length?`提交前请处理：<ul class='error-list'>${errors.map(x=>`<li>${x}</li>`).join('')}</ul>`:'问卷检查通过'}</div>`;}
    return heading('','承保 · 客户投保问卷','',btn('保存草稿','save-draft','','file')+btn('核保工作台','go-underwriting','dark','arrow'))+strip()+lockedNote()+`<div class='form-stepper'>${steps.map((x,i)=>`<button data-formstep='${i}' class='${ui.formStep===i?'active':''}'><span>${i+1}</span>${x}</button>`).join('')}</div><div class='content-grid single-column form-workspace'><div>${card(steps[ui.formStep],`第 ${ui.formStep+1} 步 / 共 5 步 · 客户可填写`,body(form,'padded'))}<div class='form-actions'><div>${ui.formStep?btn('上一步','form-prev'):''}${ui.formStep<4?btn('下一步','form-next','primary','arrow'):a.policy?btn('查看保单','policy-tab','primary','shield'):btn('提交投保问卷','submit-application','primary','check')}</div></div></div></div>`;
  }
  function historyView(items){return `<div class='timeline audit-list'>${items.slice(0,20).map(x=>`<div class='timeline-entry'><time>${esc(x.at)}</time><p>${esc(x.text)}</p></div>`).join('')}</div>`;}
  function policyDocument(){const a=app(),q=a.policy?.quote||a.quote||quote(),t=a.policy?.terms||a;return `<div class='document-preview'><div class='doc-brand'>CLOUDBRIDGE / DIGITAL RESILIENCE</div><h2>${a.policy?'保险凭证':'报价单'}</h2><div class='doc-meta'>${esc(a.policy?.id||'QUOTE-'+a.id)} · ${esc(q.modelVersion)}</div>${kv('被保险人',user(t.company))}${kv('保险期间',`${t.periodStart} 00:00 — ${t.periodEnd} 00:00（北京时间，终点不含）`)}${kv('保障模块',t.m2?'M1普通数字中断 + M2外部事件中断':'M1普通数字服务中断')}${kv('年毛保费','¥ '+money(q.total))}${kv('等待期 / 最长可赔',`${t.waiting}分钟 / ${t.maxHours}小时`)}${kv('共同事故限额 / 年总限额',`¥${integer(t.occLimit)} / ¥${integer(t.annualTotal)}`)}${kv('M1 / M2年度限额',`¥${integer(t.annual1)} / ¥${integer(t.annual2)}`)}<h3>列明服务附表</h3><div class='table-wrap'><table><thead><tr><th>服务 / 端点</th><th>区域 / 业务</th><th class='num'>小时金额</th></tr></thead><tbody>${t.services.map(s=>`<tr><td>${user(s.provider)} · ${user(s.service)}<small>${user(s.endpoint)}</small></td><td>${D.regions.find(r=>r.id===s.region).name}<small>${user(s.business)}</small></td><td class='num'>¥ ${money(E.hourly(s))}</td></tr>`).join('')}</tbody></table></div>${olaSummary(t)}<h3>责任与计算口径摘要</h3><p>按约定阈值确认服务中断，并核实列明业务实际受影响。扣等待期后，仅累计营业时段与业务影响的交集；成功切换后停止累计。恢复后30分钟内再次中断按规则合并，中间正常时段不计入赔偿。</p><p><span>最终赔款受承保净损失、服务和共同事故限额、模块年度及总年度剩余额度约束；同一损失不重复补偿。</span> <span>${esc(CBExternal.policyText(t))}</span></p><p>当前不含声誉损失、一般业务波动及未投保额外费用扩展。</p><div class='signature'><span>出单方式：系统生成<br>报价时间：${esc(a.quoteAt||'待核保')}</span><span>出单状态：${a.policy?'已生成':'待生成'}<br>版本状态：${a.policy?'已锁定快照':'未生效报价'}</span></div></div>`;}
  function policyView(){const a=app();if(!a.quote&&!a.policy)return card('报价与保单','查看定价明细后生成',`<div class='empty'><div class='empty-icon'>${icon('file')}</div><h2>这份投保单还没有报价</h2><p>完成投保信息后，查看定价明细并生成保单。</p>${btn('查看定价明细','pricing-tab','primary','arrow')}</div>`);return `<div class='content-grid'><div>${a.policy?`<div class='status-banner'>${icon('shield')}<div><strong>保障已确认 · 保单快照已锁定</strong><small>${a.policy.id} · ${a.policy.confirmedAt}</small></div></div>`:''}${policyDocument()}<div class='download-row'>${btn('下载报价 / 保单HTML','download-policy','','down')}${a.policy?btn('进入客户报案','go-claim','primary','arrow'):btn('生成保单','issue-policy','primary','check')}</div></div><div class='stack'>${quoteCard()}${card('业务记录','报价与保单快照',body(historyView(a.history)))}</div></div>`;}
  function noPolicy(){return heading('','理赔与核赔','')+strip()+card('需要先生成保单','投保信息、报价和核赔使用同一份业务档案',`<div class='empty'><div class='empty-icon'>${icon('shield')}</div><h2>当前投保单尚未生成保单</h2><p>可继续核保并生成保单，也可以载入已经承保的完整样例，直接演示事故申报和保险人核赔。</p><div class='tag-row' style='justify-content:center'>${btn('查看定价明细','pricing-tab','primary','arrow')}${btn('载入已承保样例','load-case','','folder')}</div></div>`);}
  function claimView(){if(!app().policy)return noPolicy();const c=claim(),t=policyTerms(),disabled=c.approved||c.paid?'disabled':'';return heading('','理赔 · 客户事故申报','',btn('下载事故报告','download-claim','','down')+btn('保险人核赔','go-assessment','dark','arrow'))+strip()+`${c.submitted?`<div class='status-banner'>${icon('check')}<div><strong>${c.paid?'案件已支付结案':c.approved?'赔款已审核，等待付款':'事故申报已收到 · 进入核赔调查'}</strong><small>${c.id} · ${c.submittedAt}</small></div></div>`:''}<div class='tabs'><button data-claimtab='report' class='${ui.claimTab==='report'?'active':''}'>事故报告</button><button data-claimtab='loss' class='${ui.claimTab==='loss'?'active':''}'>损失与减损</button><button data-claimtab='materials' class='${ui.claimTab==='materials'?'active':''}'>申报材料</button></div><div class='content-grid single-column form-workspace'><div class='stack'>${ui.claimTab==='report'?card('事故基本信息','客户无需等待服务商根因报告即可报案',body(`<div class='form-grid'>${select('受影响的列明服务',`data-c='serviceId' ${disabled}`,c.serviceId,t.services.map(s=>[s.id,`${s.provider} · ${s.service} / ${s.business}`]))}${select('客户报告的事故线索',`data-c='reportedCause' ${disabled}`,c.reportedCause||(c.module==='m2'?'physical':'ordinary'),[['ordinary','普通服务故障 / 网络异常'],['physical','地缘政治冲突导致数字依赖受损'],['unknown','原因尚不清楚']],'')}</div>${externalClaimFields(c,disabled)}${CBUnifiedUI.businesses(t,c,disabled)}<div class='mini-title'>服务中断区间（北京时间）</div>${c.segments.map((s,i)=>`<div class='seg-row'>${field('中断起点',`data-seg='${i}.start' ${disabled}`,s.start,'datetime-local')}${field('服务恢复时间',`data-seg='${i}.end' ${disabled}`,s.end,'datetime-local')}${c.segments.length>1?`<button class='icon-btn' data-remove-seg='${i}' ${disabled} aria-label='删除区间${i+1}'>${icon('trash')}</button>`:'<span></span>'}</div>`).join('')}${!disabled?btn('添加再次中断区间','add-segment','small','plus'):''}<div class='form-grid mt'>${field('承保业务开始受影响',`data-c='impactStart' ${disabled}`,c.impactStart,'datetime-local')}${field('承保业务最终恢复',`data-c='impactEnd' ${disabled}`,c.impactEnd,'datetime-local')}${textarea('事故经过与当前情况 *',`data-c='description' ${disabled}`,c.description,'')}</div>`,'padded')):ui.claimTab==='loss'?card('损失、切换与恢复','将技术恢复与业务恢复分别记录',body(`<div class='form-grid'>${select('是否尝试替代、切换或补做',`data-c='attempted' data-bool ${disabled}`,c.attempted?'true':'false',[['true','已尝试'],['false','尚未尝试']])}${select('备用服务是否成功恢复业务',`data-c='switched' data-bool ${disabled}`,c.switched?'true':'false',[['false','未成功接管'],['true','已成功接管']])}${c.switched?field('切换后关键业务恢复时刻',`data-c='switchTime' ${disabled}`,c.switchTime,'datetime-local','成功恢复后的时间不再累计赔偿。'):''}${textarea('防损减损措施与结果',`data-c='measures' ${disabled}`,c.measures)}${textarea('服务及业务恢复记录',`data-c='recovery' ${disabled}`,c.recovery)}${field('最终无法挽回的任务数（参考）',`data-c='lostTasks' ${disabled}`,c.lostTasks,'number','','min=0 step=1')}${field('每笔贡献毛利（元，参考）',`data-c='taskMargin' ${disabled}`,c.taskMargin,'number','','min=0 step=0.01')}${field('承保净损失（元） *',`data-c='declaredLoss' ${disabled}`,c.declaredLoss,'number','扣除节省的可变成本；不要直接使用营业收入。','min=0 step=0.01')}${field('针对同一损失的其他补偿（元）',`data-c='otherCompensation' ${disabled}`,c.otherCompensation,'number','与该损失无关的云抵用券不自动全额冲减。','min=0 step=0.01')}${textarea('损失计算依据 *',`data-c='financialBasis' ${disabled}`,c.financialBasis)}</div><div class='note mt'>参考任务毛利：${integer(c.lostTasks)} × ¥${money(c.taskMargin)} = ¥${money(c.lostTasks*c.taskMargin)}</div>`,'padded')):card('索赔材料','现有保单由保险人内部调取，不重复要求客户提供',body(`${evidenceList(false)}<div class='mini-title'>补充附件</div><label class='field'><span>附件名称登记</span><input type='file' id='claim-files' multiple accept='.pdf,.docx,.xlsx,.csv,.json,.txt,.png,.jpg' ${disabled}></label><ul class='upload-list'>${c.uploads.map((f,i)=>`<li><span>${esc(f.name)} · ${(f.size/1024).toFixed(1)} KB</span><button class='text-btn' data-remove-upload='${i}' ${disabled}>移除</button></li>`).join('')}</ul>`,'padded'))}<div class='form-actions'><div>${btn('保存事故草稿','save-claim','','file')}${!disabled?btn(c.submitted?'更新事故申报':'提交事故申报','submit-claim','primary','arrow'):btn('查看核赔结果','go-assessment','primary','arrow')}</div></div></div></div>`;}
  const evidenceDefs=[['E01','独立监测记录','保险人 / 监测机构'],['E02','服务商故障说明','服务商公告或工单 · 可后补根因'],['E03','业务交易与恢复记录','客户技术部门 · 唯一任务及成功率'],['E04','切换与减损记录','客户运营 / 技术 · 是否真正恢复业务'],['E05','业务损失明细','客户财务 · 净损失与其他补偿']];
  function evidenceReceived(id){const c=claim();if(id==='E03')return c.submitted&&c.segments.length>0;if(id==='E04')return c.submitted&&!!(c.measures?.trim()||c.recovery?.trim());if(id==='E05')return c.submitted&&Number.isFinite(Number(c.declaredLoss));return !!c.evidence[id];}
  function evidenceList(review){return evidenceDefs.map(([id,title,desc])=>`<div class='evidence-row'><span class='evidence-id'>${id}</span><span class='copy'><strong>${title}</strong><small>${desc}</small></span>${badge(evidenceReceived(id)?'已接收':review?'待补充':'待接收',evidenceReceived(id)?'green':'gray')}</div>`).join('')+`<div class='evidence-row'><span class='evidence-id'>E06</span><span class='copy'><strong>保单及核保快照</strong><small>保险人内部调取 · ${esc(app().policy?.id||'暂无保单')}</small></span>${badge('内部已有','green')}</div>`;}
  function monitorChart(){const c=claim(),s=c.segments[0],start=E.stamp(s.start),end=E.stamp(s.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return `<div class='note red'>请先填写有效事故时间。</div>`;const agreed=policyTerms().services.find(x=>x.id===c.serviceId),ola=agreed?.olaVersion,threshold=ola?Number(agreed.olaSuccess):50;const span=Math.min(end-start+20,1440),a=start-10;let lines='';['#778e66','#b7a46f','#8bada4'].forEach((color,k)=>{const points=Array.from({length:61},(_,i)=>{const t=a+span*i/60,fail=c.segments.some(x=>t>=E.stamp(x.start)&&t<E.stamp(x.end)),y=ola?(fail?115+k*5+Math.sin(i*1.8+k)*3:25+(i%3)*0.15):(fail?29+k*4+Math.sin(i*1.8+k)*4:141-k*3+Math.sin(i+k)*2);return `${50+i*9.6},${y}`;}).join(' ');lines+=`<polyline fill='none' stroke='${color}' stroke-width='1.8' points='${points}'/>`;});const tick=i=>new Date((a+span*i/4)*60000).toISOString().slice(11,16);return `<svg class='chart' viewBox='0 0 660 205' role='img' aria-label='${ola?'有效调用按时成功率曲线':'三节点失败率曲线'}'><g class='chart-grid'><path d='M50 25h580M50 85h580M50 145h580'/></g><path d='M50 ${145-threshold*1.2}h580' stroke='#c7b57e' stroke-dasharray='4 4'/><g class='chart-label'><text x='7' y='29'>100%</text><text x='13' y='89'>50%</text><text x='19' y='149'>0%</text>${[0,1,2,3,4].map(i=>`<text x='${50+i*144}' y='179' text-anchor='middle'>${tick(i)}</text>`).join('')}<text x='54' y='199'>${esc(s.start.slice(0,10))} · 北京时间</text><text x='630' y='16' text-anchor='end'>${ola?'OLA':'中断判定线'} ${threshold}%</text></g>${lines}</svg>${ola?`<div class='ola-monitor'>${kv('响应时间上限（秒）',esc(agreed.olaResponse))}${kv('持续不达标判定窗口（分钟）',esc(agreed.olaWindow))}${kv('连续达标恢复窗口（分钟）',esc(agreed.olaRecovery))}</div>`:''}`;}
  function assessmentView(){
    if(!app().policy)return noPolicy();
    const c=claim(),r=assessment(),t=policyTerms(),tabs=[['evidence','材料接收与核验'],['calculation','赔款计算'],['closure','结案材料']];
    if(!tabs.some(([id])=>id===ui.reviewTab))ui.reviewTab='evidence';
    const format=v=>esc(v?.replace('T',' ')||'—');
    const businesses=[{serviceId:c.serviceId,segments:c.segments,end:c.switched?c.switchTime:c.impactEnd},...(c.additionalBusinesses||[]).map(b=>({serviceId:b.serviceId,segments:[{start:b.start,end:b.end}],end:b.end}))];
    const allRanges=E.union(businesses.flatMap(b=>b.segments.map(v=>[E.stamp(v.start),E.stamp(v.end)])).filter(v=>v.every(Number.isFinite)));
    const stampText=n=>format(new Date(n*60000).toISOString().slice(0,16));
    const periods=allRanges.map(([start,end])=>`<span>${stampText(start)}<br>— ${stampText(end)}</span>`).join('');
    const restored=businesses.map(b=>b.end).filter(Boolean).sort().at(-1);
    const breakdown=businesses.length>1?`<details class='claim-business-times'><summary>各业务时间</summary>${businesses.map(b=>`<div><strong>${user(t.services.find(s=>s.id===b.serviceId)?.business||'')}</strong>${b.segments.map(v=>`<span>${format(v.start)} — ${format(v.end)}</span>`).join('')}</div>`).join('')}</details>`:'';
    const timeCard=`<div class='stat claim-time-stat'><div class='stat-top'><span>服务中断时间</span>${icon('clock')}</div><div class='stat-value number'>${integer(r.rawMinutes)}<small>分钟</small></div><div class='claim-periods'>${periods}</div><div class='claim-time-detail'><span>业务恢复</span><strong>${format(restored)}</strong></div>${breakdown}</div>`;
    let panel='';
    if(ui.reviewTab==='evidence')panel=card('材料接收与核验','',body(`<div class='claim-evidence-layout'><section class='claim-materials'><h3>申报材料</h3>${evidenceList(true)}<details class='claim-notes'><summary>事故说明与处理记录</summary>${kv('事故说明',user(c.description))}${c.module==='m2'?kv('受损依赖',user(c.damagedDependency))+kv('中断传导',user(c.causalChain)):''}${kv('防损减损',user(c.measures))}${kv('恢复记录',user(c.recovery))}${kv('财务依据',user(c.financialBasis))}${textarea('核赔备注',`data-c='reviewNote' ${c.approved?'disabled':''}`,c.reviewNote)}</details></section><section class='claim-replay'><div class='claim-section-head'><div><h3>中断回放</h3><small>${user(r.s.business)}</small></div>${btn('回放','play-monitor','small','scan')}</div>${monitorChart()}<div class='map-legend'><span><i class='dot' style='color:#778e66'></i>节点A</span><span><i class='dot' style='color:#b7a46f'></i>节点B</span><span><i class='dot' style='color:#8bada4'></i>节点C</span></div>${c.module==='m2'?CBExternal.timeline(c):''}</section></div><div class='form-actions'>${btn('生成赔款计算书','calculation-tab','primary','arrow')}</div>`,'padded'),'','claim-evidence-card');
    if(ui.reviewTab==='calculation')panel=calculationView();
    if(ui.reviewTab==='closure')panel=closureView();
    return heading('','核赔工作台','',btn('导出核赔档案','export-assessment','','down')+btn('赔款计算书','calculation-tab','dark','file'))+strip()+`${!c.submitted?`<div class='note mb'>请先提交事故申报。${btn('进入客户申报','go-claim','small')}</div>`:''}${c.paid?`<div class='status-banner'>${icon('check')}<div><strong>已支付 ¥ ${money(c.settlement.amount)} · 案件已结案</strong></div></div>`:''}<div class='tabs'>${tabs.map(x=>`<button data-reviewtab='${x[0]}' class='${ui.reviewTab===x[0]?'active':''}'>${x[1]}</button>`).join('')}</div><div class='stats claim-stats'>${timeCard}${stat(businesses.length>1?'各业务可赔时间合计':'可赔时间初算',`${integer(r.eligibleMinutes)}<small>分钟</small>`,`${t.waiting}分钟等待期 · ${t.calendar==='business'?'工作日09–17':'7×24'}`,'scan')}${stat('净损失',`¥ ${integer(r.netLoss||0)}`,'贡献毛利扣除同损失补偿','wallet')}${stat(c.paid?'已赔款':'本次赔款试算',`¥ ${money(r.amount)}`,c.module==='pending'?'请补充事故原因':`${c.module.toUpperCase()} · ${c.approved?'已核定':'待核定'}`,'shield')}</div>${panel}`;
  }
  function externalClaimFields(c,disabled){
    if(c.reportedCause!=='physical')return '';
    return `<div class='form-grid mt'>${field('冲突事件 / 证据编号',`data-c='eventReference' ${disabled}`,c.eventReference||'')}${field('受损数字服务 / 基础设施',`data-c='damagedDependency' ${disabled}`,c.damagedDependency||'')}${textarea('受损依赖如何传导至本企业服务',`data-c='causalChain' ${disabled}`,c.causalChain||'')}</div>`;
  }
  function claimIssues(){const a=app(),c=claim(),r=assessment(),issues=[...r.errors];if(!c.submitted)issues.push('客户尚未提交事故申报');if(c.module==='m2')issues.push(...CBExternal.claimErrors(a,c));if(!['m1','m2'].includes(c.module))issues.push('请在事故申报中选择事故原因');if(r.groupCount>1)issues.push('本次申报含多个独立事故，请分别提交');if(r.rawMinutes===0)issues.push('事故时段不在保险期间');if(r.amount<=0)issues.push('当前无可支付赔款');return [...new Set(issues)];}
  function calculationDocument(){const a=app(),c=claim(),r=assessment(),t=policyTerms();return `<div class='document-preview'><div class='doc-brand'>CLOUDBRIDGE / CLAIM CALCULATION</div><h2>赔款计算书</h2><div class='doc-meta'>${esc(c.id)} · ${esc(a.policy.id)} · ${esc(a.policy.model.version)}</div><div class='tag-row mt'>${badge(c.module==='m1'?'M1 普通中断':c.module==='m2'?'M2 外部事件中断':c.module==='pending'?'模块待分配':'责任待人工决定',c.module==='m2'?'orange':'green')}${badge(c.approved?'已审核':'调查阶段初算')}</div>${kv('被保险人',user(a.company))}${r.businessRows?.length>1?`<div class='table-wrap'><table><thead><tr><th>业务</th><th>可赔分钟</th><th>参数金额</th><th>净损失</th><th>逐业务金额</th></tr></thead><tbody>${r.businessRows.map(b=>`<tr><td>${user(b.s.business)}</td><td>${b.eligibleMinutes}</td><td>USD ${money(b.parameter)}</td><td>USD ${money(b.netLoss)}</td><td>USD ${money(b.amount)}</td></tr>`).join('')}</tbody></table></div>`:''}${kv('列明服务 / 区域',`${esc(r.s.provider)} · ${esc(r.s.service)} / ${D.regions.find(x=>x.id===r.s.region).name}`)}<div class='table-wrap'><table><thead><tr><th>计算项目</th><th>口径</th><th class='num'>结果</th></tr></thead><tbody><tr><td>实际服务中断</td><td>区间去重，剔除中间正常运行</td><td class='num'>${r.rawMinutes}分钟</td></tr><tr><td>等待期</td><td>每个合并事故累计扣一次</td><td class='num'>${t.waiting}分钟/事故</td></tr><tr><td>${r.businessRows?.length>1?'各业务可赔分钟合计':'可赔时间'}</td><td>扣等待期 × 营业时间 × 业务影响；成功切换截断</td><td class='num'>${r.eligibleMinutes}分钟</td></tr><tr><td>约定小时金额</td><td>保单快照，核赔不重新议价</td><td class='num'>¥${money(r.hourly)}</td></tr><tr><td>参数计算金额</td><td>${r.businessRows?.length>1?'各独立业务分别计算后汇总':money(r.hourly)+' × '+r.eligibleMinutes+' ÷ 60'}</td><td class='num'>¥${money(r.parameter)}</td></tr><tr><td>净损失封顶</td><td>${r.businessRows?.length>1?'逐业务贡献毛利扣除同损失补偿':'损失金额 '+money(c.declaredLoss)+' − 同损失补偿 '+money(c.otherCompensation)}</td><td class='num'>¥${money(r.netLoss)}</td></tr><tr><td>服务 / 共同事故限额</td><td>同因事故共同约束</td><td class='num'>${integer(r.s.limit)} / ${integer(t.occLimit)}</td></tr><tr><td>模块年度剩余</td><td>M1 / M2，支付前</td><td class='num'>${money(r.remaining1)} / ${money(r.remaining2)}</td></tr><tr><td>总年度剩余</td><td>支付前额度</td><td class='num'>¥${money(r.totalRemaining)}</td></tr><tr><td><strong>本次${c.approved?'核定':'试算'}赔款</strong></td><td>逐项取限，金额最终四舍五入到分</td><td class='num'><strong>¥${money(r.amount)}</strong></td></tr></tbody></table></div><h3>核赔意见</h3><p>${user(c.reviewNote)}</p><p>${user(c.module==='m2'?c.causalChain:'按服务中断时间、贡献毛利净损失和保单限额计算。')}</p><p>${r.groupCount>1?'存在多个独立事故，需人工分案。':''}同一损失不重复赔付；</p><div class='signature'><span>核定状态：${c.approved?'已核定':'待核定'}<br>时间：${esc(c.approvedAt||'—')}</span><span>付款：${c.paid?'已支付':'未支付'}<br>支付时间：${esc(c.paidAt||'—')}</span></div></div>`;}
  function calculationView(){const c=claim(),r=assessment(),issues=claimIssues();return `<div class='content-grid'><div>${calculationDocument()}<div class='download-row'>${btn('下载计算书HTML','download-calculation','','down')}${btn('下载计算明细CSV','download-calculation-csv','','down')}${c.approved?btn('查看结案材料','closure-tab','primary','arrow'):btn('核定赔款','approve-claim','primary','check')}</div></div><div class='stack'>${card('双模块对照','同一事故仅归入适用模块，不重复叠加',body(`<div class='module-grid'><div class='module-card'><h3>M1 ${badge('普通中断','green')}</h3><p>若认定符合M1</p><div class='amount number'>¥${money(r.m1)}</div><small>${c.module==='m1'?'本次选定模块':'仅比较，不计入本次赔款'}</small></div><div class='module-card m2'><h3>M2 ${badge('外部事件中断','orange')}</h3><p>${policyTerms().m2?'若认定符合M2':'当前未投保M2'}</p><div class='amount number'>¥${money(r.m2)}</div><small>${c.module==='m2'?'本次选定模块':'仅比较，不计入本次赔款'}</small></div></div>${c.module==='pending'&&c.bothCovered?`<div class='note mt'>两种归类下均确定应付的下限：¥${money(Math.min(r.m1,r.m2))}。本演示仅试算，不自动支付或结案。</div>`:''}`))}${card('计算检查','',body(issues.length?`<ul class='error-list'>${issues.map(x=>`<li>${x}</li>`).join('')}</ul><div class='mt'>${btn('补充核赔调查','evidence-tab','full','arrow')}</div>`:`<div class='note green'>计算完成，可核定赔款。</div>`))}${card('可赔时段明细','健康间隔不计入等待期和赔偿',body(r.groups.map((g,i)=>kv(`事故组${i+1}`,`${g.rawMinutes}分钟中断 / ${g.payable}分钟可赔<br>${g.ranges.join('、')||'无可赔区间'}`)).join('')))}</div></div>`;}
  function closureView(){const a=app(),c=claim(),r=assessment(),t=policyTerms();return `<div class='content-grid'><div class='stack'>${card('赔案结案与支付','',body(`<div class='timeline'><div class='timeline-entry'><time>${esc(c.submittedAt||'待提交')}</time><p>客户事故申报 ${badge(c.submitted?'已完成':'待完成',c.submitted?'green':'')}</p></div><div class='timeline-entry'><time>${esc(c.approvedAt||'待核定')}</time><p>保险人核定赔款 ¥${money(r.amount)} ${badge(c.approved?'已完成':'待完成',c.approved?'green':'')}</p></div><div class='timeline-entry'><time>${esc(c.paidAt||'待支付')}</time><p>支付与额度入账 ${badge(c.paid?'已完成':'待完成',c.paid?'green':'')}</p></div></div><div class='large-result'><div class='label'>本案${c.paid?'已支付':'核定 / 试算'}金额</div><div class='value number'>¥ ${money(r.amount)}</div></div><div class='tag-row' style='justify-content:center'>${!c.approved?btn('查看赔款计算','calculation-tab','primary','arrow'):!c.paid?btn('支付并结案','pay-claim','primary','wallet'):badge('已结案','green')}</div>`,'padded'))}${card('结案档案清单','',body(`<ul class='review-checklist'><li><span>${icon('file')}事故报告与损失明细</span>${btn('下载','download-claim','small')}</li><li><span>${icon('file')}赔款计算书</span>${btn('下载','download-calculation','small')}</li><li><span>${icon('file')}结案报告与支付凭证</span>${btn('下载','download-closure','small')}</li><li><span>${icon('file')}材料索引、操作轨迹及快照</span>${btn('导出JSON','export-assessment','small')}</li></ul>`))}</div><div class='stack'>${card('年度额度台账','',body(kv('M1年度剩余','¥ '+money(Math.max(0,t.annual1-a.paid.m1)))+kv('M2年度剩余','¥ '+money(Math.max(0,t.annual2-a.paid.m2)))+kv('保单年度总剩余','¥ '+money(Math.max(0,t.annualTotal-a.paid.total)))+kv('本次支付归属',c.paid?c.module.toUpperCase():'待支付')+kv('后续独立事故限额','仍按每次事故 ¥'+integer(t.occLimit))))}${card('案件操作轨迹','',body(historyView(a.history)))}</div></div>`;}
  function modelView(){return CBPricingView.model(state,ui,app());}
  function sensitivityView(){return CBPricingView.model(state,{...ui,modelTab:'sensitivity'},app());}
  function modal(title,content,footer=''){const d=$('#dialog');$('#dialog-content').innerHTML=`<div class='modal-head'><h2>${title}</h2><button class='icon-btn' data-action='close-dialog' aria-label='关闭弹窗'>${icon('close')}</button></div><div class='modal-body'>${present(content)}</div><div class='modal-footer'>${footer||btn('知道了','close-dialog','primary')}</div>`;if(!d.open)d.showModal();}
  const closeModal=()=>$('#dialog').close();
  function errorModal(title,errors){modal(title,`<div class='note red'><ul class='error-list'>${errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`);}
  function termsSnapshot(a){const keys=['currency','termsVersion','pricingProfile','firstInception','continuousRenewal','company','industry','contact','email','registration','periodStart','periodEnd','calendar','waiting','maxHours','occLimit','annual1','annual2','annualTotal','m2','coverageVersion','services'];return Object.fromEntries(keys.map(k=>[k,clone(a[k])]));}
  function invalidateQuote(){const a=app();if(a.quote){a.quote=null;a.quoteModel=null;a.quoteAt=null;a.uwChecks=[];audit('投保资料变更 · 原报价作废，需重新核保');}a.stage='draft';}
  function issuePolicy(){const a=app();if(!a)return;if(a.policy)return go('underwriting','policy');const errors=E.validateApplication(a);if(errors.length){ui.formStep=4;go('application');return errorModal('请补全投保信息',errors);}const q=quote();if(!q.available||q.bindable===false||!Number.isFinite(q.total))return errorModal('请调整投保条件',q.errors?.length?q.errors:['当前条件需要重新测算']);a.quote=clone(q);a.quoteModel=clone(state.model);a.quoteAt=now();a.policy={id:a.id.replace('CB-A','CB-P'),confirmedAt:now(),terms:termsSnapshot(a),quote:clone(q),model:clone(state.model)};a.stage='bound';a.claim.id=a.policy.id.replace('CB-P','CB-C');audit('保单已生成 · 报价与保障条件已锁定');closeModal();go('underwriting','policy');toast('保单已生成');}
  function newApplication(source=null){closeModal();const a=source?clone(source):D.base();a.id='CB-A-'+workspaceUUID().slice(0,12).toUpperCase();delete a.archivedAt;a.company=source?source.company+'（新投保）':'远帆跨境科技有限公司';a.stage='draft';a.quote=null;a.quoteModel=null;a.quoteAt=null;a.policy=null;a.coverageVersion=CBExternal.version;a.services=a.services.map(s=>({...CBExternal.defaults,...s}));a.uwChecks=[];a.paid={m1:0,m2:0,total:0};a.history=[{at:now(),text:source?'复制为新投保单，原保单不变':'新建投保草稿'}];a.consent=false;if(!source){a.contact='';a.email='';a.registration='';}a.claim=D.claim(a);a.claim.evidence={E01:false,E02:false,E03:false,E04:false,E05:false,E07:false};state.apps.unshift(a);state.selected=a.id;ui.formStep=0;ui.region=null;go('application');toast('新投保单已创建');}
  function loadUnified(id){let a=state.apps.find(x=>x.pricingProfile===id&&!x.policy&&CBPricing.match(x));if(!a){a=D.makeApp(id);a.id+='-'+Date.now().toString(36);state.apps.unshift(a);}state.selected=a.id;ui.region=null;closeModal();go('underwriting','risk');}
  function loadCase(kind){let a=state.apps.find(x=>x.sampleKind===kind&&x.policy?.quote?.pricingVersion===CBPricing.version);if(!a){a=D.makeApp('CBU-001');a.id='CB-A-DEMO-'+kind.toUpperCase()+'-'+workspaceUUID().slice(0,8);a.sampleKind=kind;a.quote=quote(a,state.model);a.quoteModel=clone(state.model);a.quoteAt=now();a.uwChecks=[];a.policy={id:a.id.replace('CB-A','CB-P'),confirmedAt:now(),terms:termsSnapshot(a),quote:clone(a.quote),model:clone(state.model)};a.stage='bound';a.claim=D.claim(a);a.claim.id=a.policy.id.replace('CB-P','CB-C');a.history.unshift({at:now(),text:'载入统一研究核赔算例'});state.apps.unshift(a);}state.selected=a.id;ui.region=null;closeModal();go('claim');}
  function download(name,content,type='application/json'){const blob=new Blob([content],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('文件已生成');}
  function downloadHTML(name,title,html){const css="body{font:14px/1.8 system-ui,'PingFang SC',sans-serif;color:#333;max-width:950px;margin:40px auto;padding:25px}h2{font-size:26px}h3{margin-top:25px}.key-value{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e5e5dd;padding:10px 0}.key-value strong{text-align:right;font-weight:500}.key-value span,small,.doc-meta,.signature{color:#888}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f6f5ef}.num{text-align:right}td small{display:block}.note{padding:12px;background:#f5f3eb;margin:15px 0}.badge{background:#eff3e9;border-radius:4px;padding:3px 7px;font-size:11px}.signature{display:flex;justify-content:space-between;border-top:1px solid #ddd;padding-top:20px;margin-top:25px;font-size:12px}.tag-row{display:flex;gap:10px;margin:15px 0}.doc-brand{letter-spacing:2px;color:#6d8066;font-size:11px}.btn{display:none}@media print{body{margin:0;max-width:none}.note{border:1px solid #ddd}}";download(name+'.html',window.CBI18n.html(`<!DOCTYPE html><html lang='zh-CN'><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>${esc(title)}</title><style>${css}</style><body>${present(html)}<p style='font-size:10px;color:#999;margin-top:40px'>CloudBridge · ${esc(now())}</p></body></html>`),'text/html');}
  function incidentDocument(){const a=app(),c=claim();return `<div class='document-preview'><div class='doc-brand'>CLOUDBRIDGE / INCIDENT REPORT</div><h2>事故报告与损失明细</h2><div class='doc-meta'>${esc(c.id)} · 客户申报 ${c.submitted?'已提交':'草稿'}</div>${kv('投保企业',user(a.company))}${kv('列明服务',esc(policyTerms().services.find(s=>s.id===c.serviceId)?.service||''))}${kv('服务中断',c.segments.map(s=>esc(s.start.replace('T',' ')+' 至 '+s.end.replace('T',' '))).join('<br>'))}${kv('业务受影响',esc(c.impactStart.replace('T',' ')+' 至 '+c.impactEnd.replace('T',' ')))}${c.module==='m2'?CBExternal.timeline(c)+kv('事件证据编号',user(c.eventReference||'—')):''}${kv('事故经过',user(c.description))}${kv('切换 / 防损减损',user(c.measures))}${kv('是否成功切换',c.switched?'是，'+esc(c.switchTime):'否')}${kv('恢复记录',user(c.recovery))}${kv('净损失','¥'+money(c.declaredLoss))}${kv('同损失其他补偿','¥'+money(c.otherCompensation))}${kv('财务计算依据',user(c.financialBasis))}<h3>材料索引</h3><p>${evidenceDefs.map(([id,name])=>`${id} ${name}：${evidenceReceived(id)?'已接收':'待补充'}`).join('<br>')}</p><h3>补充附件名称</h3><p>${c.uploads.map(x=>esc(x.name)).join('<br>')||'无'}</p></div>`;}
  function closureDocument(){const a=app(),c=claim(),r=assessment();return `<div class='document-preview'><div class='doc-brand'>CLOUDBRIDGE / CLOSING REPORT</div><h2>结案报告与支付凭证</h2><div class='note'>${c.paid?'已支付':'草稿'}</div>${kv('案件 / 保单',esc(c.id+' / '+a.policy.id))}${kv('被保险人',user(a.company))}${kv('责任模块',esc(c.module.toUpperCase()))}${kv('核定赔款','¥'+money(r.amount))}${kv('支付状态',c.paid?'已支付':'尚未支付')}${kv('支付时间',esc(c.paidAt||'—'))}${kv('M1 / M2已用额度',money(a.paid.m1)+' / '+money(a.paid.m2))}${kv('年度总剩余额度','¥'+money(policyTerms().annualTotal-a.paid.total))}<h3>责任与计算意见</h3><p>${user(c.reviewNote)}</p><p>${user(c.module==='m2'?c.causalChain:'按服务中断时间、贡献毛利净损失和保单限额计算。')}</p><h3>案件操作记录</h3><p>${a.history.map(x=>`<time>${esc(x.at)}</time> <span>${esc(x.text)}</span>`).join('<br>')}</p></div>`;}
  function exportAssessment(){const a=app();download(a.claim.id+'-核赔档案.json',JSON.stringify({demo:true,exportedAt:now(),policy:a.policy,claim:a.claim,calculation:a.policy?assessment():null,ledger:a.paid,audit:a.history},null,2));}
  function modelErrors(){const m=state.draftModel,errors=[];for(const [k,max] of [['capitalRate',100],['reinsuranceLoad',200],['expense',90]])if(!Number.isFinite(m[k])||m[k]<0||m[k]>max)errors.push('模型参数超出允许范围');if(!CBUnifiedData.scenarios[m.scenario])errors.push('请选择有效测算情景');return errors;}
  function submitClaim(){
    if(!app()?.policy||claim().approved)return;
    const c=claim(),errors=[...E.assess(app(),c).errors];
    if(!c.description.trim())errors.push('请填写事故经过');
    if(errors.length)return errorModal('事故报告需要补充',errors);
    c.submitted=true;c.submittedAt=now();c.checked=[];
    for(const id of ['E03','E04','E05'])c.evidence[id]=evidenceReceived(id);
    audit('客户提交事故报告 · '+c.id);closeModal();go('assessment','evidence');toast('保险人已收到报案');
  }
  function approveClaim(){
    const c=claim();if(c.approved)return;
    const issues=claimIssues();if(issues.length)return errorModal('请补充事故信息',issues);
    const result=clone(E.assess(app(),c));c.settlement={amount:result.amount,module:c.module,assessment:result};c.approved=true;c.approvedAt=now();
    audit('核定 '+c.module.toUpperCase()+' 赔款 ¥'+money(result.amount));closeModal();go('assessment','closure');toast('赔款已核定');
  }
  function payClaim(){
    const a=app(),c=claim();if(!c.approved||c.paid||!c.settlement)return;
    const n=c.settlement.amount,module=c.settlement.module;if(!Number.isFinite(n)||n<=0||!['m1','m2'].includes(module))return;
    a.paid[module]=E.round(a.paid[module]+n);a.paid.total=E.round(a.paid.total+n);c.paid=true;c.paidAt=now();
    audit('支付结案 · '+module.toUpperCase()+' · ¥'+money(n));closeModal();render();toast('已支付并更新年度额度');
  }
  const actions={
    'retry-risk-data':()=>{CBRiskAssets.retry(ui.mapModule==='m2'?'m2':'m1').catch(()=>{});render();},
    'archives':showArchives,
    'archive-current':archiveCurrent,
    'load-unified':()=>loadUnified('CBU-001'),
    'add-business':()=>{const c=claim();if(c.approved)return;const used=[c.serviceId,...(c.additionalBusinesses||[]).map(b=>b.serviceId)],s=policyTerms().services.find(s=>!used.includes(s.id));if(!s)return;c.additionalBusinesses||=[];c.additionalBusinesses.push({serviceId:s.id,start:c.impactStart,end:c.impactEnd,declaredLoss:0,otherCompensation:0});changedCustomerClaim('serviceId');render();},

    'close-dialog':closeModal,
    'menu':()=>{$('#sidebar').classList.toggle('open');$('#scrim').classList.toggle('show');},
    'guide':()=>modal('业务流程',`<p>同一份业务档案在客户与保险人两端流转。可从问卷开始，也可载入已承保样例，直接演示赔案。</p><div class='guide-list'>${[['application','客户填写投保问卷','列明厂商、服务、业务依赖、备用方案和财务影响。'],['underwriting','保险人核保与报价','查看风险与定价明细，生成保单。'],['claim','客户提交事故申报','记录中断、切换、业务恢复和损失金额。'],['assessment','保险人调查与核赔','查看材料与中断回放、生成赔款计算书并结案。'],['model','模型参数与版本','调整模型参数，比较敏感性并锁定版本。']].map((x,i)=>`<div class='guide-step'><span>${i+1}</span><div><strong>${x[1]}</strong><p>${x[2]}</p></div><button class='text-btn' data-guide-view='${x[0]}'>进入 →</button></div>`).join('')}</div>`,btn('载入已承保样例','load-case','','folder')+btn('从问卷开始','guide-start','primary','arrow')),
    'guide-start':()=>{closeModal();ui.formStep=0;go('application');},
    'about':()=>modal('关于 CloudBridge',`<p>CloudBridge · 跨境数字服务中断保险</p><p>比赛演示工作台 · 定价与案件采用项目研究数据；公开事件附官方来源。</p>`,btn('查看风险口径','risk-method')+btn('知道了','close-dialog','primary')),
    'm2-compare':()=>modal('M2 区域参考报价',window.CBM2Map.comparison(app(),state.model,ui),btn('关闭','close-dialog')),
    'risk-method':()=>modal('风险资料与定价口径',`<p>M1采用2023–2025年官方事件目录：39条候选、34条纳入、5条剔除，按产品、区域和功能映射。</p><p>M2公共冲突与设施目录用于证据审查；事件频率、命中及恢复仍为研究情景。地图筛选不修改报价。</p><a href="reports/CloudBridge-conflict-pricing.html" target="_blank" rel="noopener">定价方法与口径 ↗</a>`),
    'dependency-insight':()=>modal('服务依赖辅助分析 · 规则分析',`${app().services.map(s=>`<div class='approval-item'><h3>${user(s.business)}</h3><p>${user(s.provider)} / ${user(s.service)} / ${D.regions.find(r=>r.id===s.region).name}</p><p>依赖说明：${user(s.dependency)}</p><p>小时金额依据：${s.volume} × ${s.margin} × ${s.irrecoverable}% = ¥${money(E.hourly(s))}</p><p>待核实：${s.backup==='tested'?'备用独立性、演练日志和实际恢复结果。':'可用替代方案、切换时长及实际业务恢复。'}</p></div>`).join('')}`),
    'new-app':()=>newApplication(),
    'clone-app':()=>newApplication(app()),
    'load-case':()=>modal('选择已承保样例',`<div class='guide-list'><div class='guide-step'><span>01</span><div><strong>M1 · 云计算中断</strong><p>Google Cloud · 核心业务USD 600/h，独立AI业务USD 400/h。</p></div><button class='btn small' data-action='load-m1'>载入</button></div><div class='guide-step'><span>02</span><div><strong>M2 · 外部事件中断</strong><p>冲突损坏上游通信设施，云服务中断传导至企业；两项业务合计赔款USD 2,000。</p></div><button class='btn small' data-action='load-m2'>载入</button></div><div class='guide-step'><span>03</span><div><strong>AI API · 按次收费业务</strong><p>3.5小时中断；参数USD 1,200，净损失封顶后USD 560。</p></div><button class='btn small' data-action='load-ai'>载入</button></div></div>`),
    'load-m1':()=>loadCase('m1'),'load-m2':()=>loadCase('m2'),'load-ai':()=>loadCase('ai'),
    'go-underwriting':()=>go('underwriting'),'go-claim':()=>go('claim'),'go-assessment':()=>go('assessment'),'go-model':()=>go('model'),
    'approval-tab':()=>go('underwriting','pricing'),'pricing-tab':()=>go('underwriting','pricing'),'policy-tab':()=>go('underwriting','policy'),'calculation-tab':()=>go('assessment','calculation'),'closure-tab':()=>go('assessment','closure'),'evidence-tab':()=>go('assessment','evidence'),
    'edit-services':()=>{ui.formStep=0;go('application');},
    'save-draft':()=>{save();toast(app().policy?'已确认保单保持原快照':'草稿已保存');},
    'form-next':()=>{ui.formStep=Math.min(4,ui.formStep+1);render();window.scrollTo({top:0,behavior:'instant'});},
    'form-prev':()=>{ui.formStep=Math.max(0,ui.formStep-1);render();window.scrollTo({top:0,behavior:'instant'});},
    'add-service':()=>{if(app().policy)return;if(app().services.length>=8)return toast('最多列明8项服务');invalidateQuote();let n=1;while(app().services.some(s=>s.id==='SVC-'+String(n).padStart(2,'0')))n++;app().services.push({...clone(D.service),id:'SVC-'+String(n).padStart(2,'0'),group:'BIZ-'+String(n).padStart(2,'0'),business:'新的独立业务',service:'请填写具体服务'});render();toast('已添加服务，请确认其属于另一独立业务组');},
    'submit-application':()=>{const a=app();if(a.policy)return;const errors=E.validateApplication(a);if(errors.length){ui.formStep=4;render();return errorModal('投保问卷需要补充',errors);}a.stage='submitted';audit('客户提交投保问卷');go('underwriting','risk');toast('投保信息已提交');},
    'issue-policy':issuePolicy,
    'approve-quote':issuePolicy,'commit-quote':issuePolicy,'confirm-policy':issuePolicy,'commit-policy':issuePolicy,
    'save-claim':()=>{save();toast('事故草稿已保存');},
    'add-segment':()=>{const c=claim();if(c.approved)return;if(c.segments.length>=8)return toast('最多8个区间');c.segments.push({start:'2026-11-17T12:00',end:'2026-11-17T12:40'});c.submitted=false;c.checked=[];render();},
    'submit-claim':submitClaim,
    'commit-claim':submitClaim,
    'play-monitor':()=>{const c=claim();c.playback=true;render();const graph=document.querySelector('.claim-replay .chart');if(graph)graph.animate([{opacity:.25},{opacity:1}],{duration:700,easing:'ease-out'});},
    'approve-claim':approveClaim,
    'commit-approval':approveClaim,
    'pay-claim':payClaim,
    'commit-payment':payClaim,
    'reset-model-draft':()=>{state.draftModel=clone(state.model);render();toast('未生效参数已还原为当前版本');},
    'activate-model':()=>{const errors=modelErrors();if(errors.length)return errorModal('模型参数需要修正',errors);actions['commit-model']();},
    'commit-model':()=>{if(modelErrors().length)return;const serial=state.modelHistory.length;state.model={...clone(state.draftModel),version:CBPricing.version+'-R'+serial,activatedAt:now(),status:'已生效'};state.draftModel=clone(state.model);state.modelHistory.unshift({at:now(),text:state.model.version+' · 模型版本已生效'});state.apps.forEach(a=>{if(!a.policy&&a.quote){a.quote=null;a.quoteModel=null;a.uwChecks=[];a.stage='submitted';a.history.unshift({at:now(),text:'演示模型版本更新，原报价作废，需重新核保'});}});closeModal();render();toast('新演示版本已生效，已确认保单不受影响');},
    'export-workspace':()=>download('CloudBridge-业务档案.json',JSON.stringify({demo:true,exportedAt:now(),...state},null,2)),
    'export-model':()=>download(state.model.version+'-模型参数.json',JSON.stringify({demo:true,active:state.model,draft:state.draftModel,reference:{version:CBUnifiedData.modelVersion,currency:'USD',assumptions:CBUnifiedData.assumptions,reinsurance:CBUnifiedData.reinsurance,portfolio:CBUnifiedData.portfolioSummary},history:state.modelHistory},null,2)),
    'export-underwriting':()=>download(app().id+'-核保摘要.json',JSON.stringify({demo:true,application:termsSnapshot(app()),quote:app().policy?.quote||app().quote||quote(),model:app().policy?.model||app().quoteModel||state.model,review:app().uwChecks,notes:app().uwNote,audit:app().history},null,2)),
    'export-assessment':exportAssessment,
    'download-policy':()=>downloadHTML((app().policy?.id||app().id)+'-保单','报价与保险凭证',policyDocument()),
    'download-claim':()=>downloadHTML(claim().id+'-事故报告','事故报告与损失明细',incidentDocument()),
    'download-calculation':()=>downloadHTML(claim().id+'-赔款计算书','赔款计算书',calculationDocument()),
    'download-closure':()=>downloadHTML(claim().id+'-结案材料','结案报告',closureDocument()),
    'download-calculation-csv':()=>{const r=assessment(),rows=[['项目','数值','单位'],['服务中断时间',r.rawMinutes,'分钟'],['可赔时间',r.eligibleMinutes,'分钟'],['约定小时金额',r.hourly,'元/小时'],['参数计算金额',r.parameter,'元'],['净损失封顶',r.netLoss,'元'],['M1比较金额',r.m1,'元'],['M2比较金额',r.m2,'元'],['本次试算赔款',r.amount,'元']];download(claim().id+'-计算明细.csv','\uFEFF'+rows.map(x=>x.map(v=>window.CBI18n.t(typeof v==='string'?v.replace('元',currency()):v)).join(',')).join('\r\n'),'text/csv');}
  };
  document.addEventListener('click',e=>{
    const row=e.target.closest('[data-unified-policy]');if(row){loadUnified(row.dataset.unifiedPolicy);return;}
    const page=e.target.closest('[data-book-page]');if(page&&!page.disabled){ui.bookPage=Number(page.dataset.bookPage);render();return;}
    const m1=e.target.closest('[data-m1-page]');if(m1&&!m1.disabled){ui.m1Page=Number(m1.dataset.m1Page);render();return;}
    const remove=e.target.closest('[data-remove-business]');if(remove&&!claim().approved){claim().additionalBusinesses.splice(Number(remove.dataset.removeBusiness),1);changedCustomerClaim('serviceId');render();}
  });
  document.addEventListener('toggle',event=>{if(event.target.matches('[data-exposure-catalog]')&&event.target.isConnected)ui.exposureCatalogOpen=event.target.open;},true);
  function rememberMap(){const b=$('.evidence-world')?.viewBox.baseVal;if(!b)return;ui.mapHistory||=[];ui.mapHistory.push({evidenceViewportCenter:[b.x+b.width/2,b.y+b.height/2],evidenceViewportWidth:b.width,exposureCenter:ui.exposureCenter? [...ui.exposureCenter]:null,exposureGroup:ui.exposureGroup||null,evidenceRegion:ui.evidenceRegion||null,evidenceCell:ui.evidenceCell||null,evidenceFocus:ui.evidenceFocus||'world',evidenceZoom:0,evidenceCenter:null});if(ui.mapHistory.length>12)ui.mapHistory.shift();}
  function holdMapView(){const values=$('.evidence-world')?.getAttribute('viewBox').split(' ').map(Number);if(!values)return;const [x,y,w,h]=values;ui.evidenceViewportCenter=[x+w/2,y+h/2];ui.evidenceViewportWidth=w;ui.evidenceZoom=0;ui.evidenceCenter=null;}
  function drillMap(center){const b=$('.evidence-world')?.viewBox.baseVal;rememberMap();ui.evidenceViewportCenter=CBM2Map.project(...center);ui.evidenceViewportWidth=Math.max(12,Math.min(960,(b?.width||960)/1.8));ui.evidenceZoom=0;ui.evidenceCenter=null;}
  function browseExposure(center,progressive=false){const current=$('.evidence-world')?.viewBox.baseVal.width;if(progressive&&center)rememberMap();else ui.mapHistory=[];ui.exposureCenter=center;ui.exposureGroup=null;ui.evidenceRegion=null;ui.evidenceViewportCenter=null;ui.evidenceViewportWidth=progressive&&center?Math.max(12,Math.min(330,(current||960)/1.8)):null;ui.evidenceZoom=0;ui.evidenceCenter=null;}

  document.addEventListener('click',event=>{const notice=event.target.closest('[data-external-notice]');if(notice){ui.externalNotice=notice.dataset.externalNotice;render();return;}const el=event.target.closest('button,a[data-action],a[data-exposure-scroll],g[data-region],g[data-m1-cluster],g[data-m1-location],g[data-evidence-cell],g[data-evidence-region],g[data-exposure-hub],g[data-exposure-group]');if(!el){const svg=event.target.closest('.evidence-world');if(svg&&ui.mapModule==='m2'&&ui.m2Layer==='exposure'){const matrix=svg.getScreenCTM();if(matrix){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()),center=CBM2Map.unproject(p.x,p.y);if(center){holdMapView();ui.exposureCenter=center;ui.exposureGroup=null;ui.evidenceRegion=null;render();}}}return;}if(el.disabled)return;
    if(el.hasAttribute('data-exposure-scroll')){event.preventDefault();document.getElementById('insured-service-list')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if(el.dataset.archiveView){archiveDetail(el.dataset.archiveView);return;}
    if(el.dataset.archiveExport){const a=state.archived.find(a=>a.id===el.dataset.archiveExport);if(a)download(a.id+'-archive.json',JSON.stringify({exportedAt:now(),project:a},null,2));return;}
    if(el.dataset.archiveRestore){const a=state.archived.find(a=>a.id===el.dataset.archiveRestore);if(!a)return;state.archived=state.archived.filter(x=>x.id!==a.id);delete a.archivedAt;state.apps.unshift(a);state.selected=a.id;ui.formStep=0;closeModal();go('application');toast('项目已恢复');return;}
    if(el.dataset.action==='go-pricing'){go('underwriting','pricing');return;}
    if(el.dataset.action){const fn=actions[el.dataset.action];if(fn)fn();return;}
    if(el.dataset.view){go(el.dataset.view);return;}
    if(el.dataset.guideView){closeModal();go(el.dataset.guideView);return;}
    if(el.dataset.select){state.selected=el.dataset.select;ui.region=null;ui.m2Service=null;ui.exposureServices=[];render();return;}
    if(el.dataset.uwtab){ui.uwTab=el.dataset.uwtab;render();return;}
    if(el.dataset.claimtab){ui.claimTab=el.dataset.claimtab;render();return;}
    if(el.dataset.reviewtab){ui.reviewTab=el.dataset.reviewtab;render();return;}
    if(el.dataset.modeltab){ui.modelTab=el.dataset.modeltab;render();return;}
    if(el.dataset.formstep!==undefined){ui.formStep=Number(el.dataset.formstep);render();return;}
    if(el.dataset.catalogAction){clearTimeout(catalogSearchTimer);Object.assign(ui,{evidenceProvider:'all',evidenceCountry:el.dataset.catalogAction==='china'?'CN':'all',evidenceKind:'all',evidenceStatus:'current',evidenceSearch:'',evidenceRegion:null,evidenceFocus:el.dataset.catalogAction==='china'?'china':'world',evidenceViewportCenter:null,evidenceCenter:null,evidenceZoom:0,evidenceViewportWidth:null,mapHistory:[],exposureCenter:el.dataset.catalogAction==='china'?[105,33]:null,exposureGroup:null});render();return;}
    if(el.dataset.trendYear){holdMapView();ui.evidenceWindow='single';ui.evidenceYear=Number(el.dataset.trendYear);render();document.querySelector(`[data-trend-year='${ui.evidenceYear}']`)?.focus({preventScroll:true});return;}
    if(el.hasAttribute('data-map-back')){const previous=ui.mapHistory?.pop();if(previous)Object.assign(ui,previous);render();return;}
    if(el.hasAttribute('data-exposure-overview')){browseExposure(null);ui.evidenceFocus='world';render();return;}
    if(el.hasAttribute('data-exposure-show-all')){ui.exposureGroup=null;render();return;}
    if(el.dataset.exposureHub){browseExposure(el.dataset.exposureHub.split(',').map(Number),true);render();return;}
    if(el.dataset.exposureGroup){const center=el.dataset.exposureGroup.split(',').map(Number);if(!ui.exposureCenter)browseExposure(center,true);else drillMap(center);ui.exposureGroup=el.dataset.exposureGroup;ui.evidenceRegion=null;render();document.querySelector(`[data-exposure-group='${ui.exposureGroup}']`)?.focus({preventScroll:true});return;}
    if(el.dataset.evidenceCell){holdMapView();ui.evidenceCell=el.dataset.evidenceCell;if(ui.m2Layer==='exposure'){ui.exposureCenter=ui.evidenceCell.split(',').map(x=>Number(x)+.5);ui.exposureGroup=null;ui.evidenceRegion=null;}render();document.querySelector(`g[data-evidence-cell='${ui.evidenceCell}']`)?.focus({preventScroll:true});return;}
    if(el.dataset.evidenceRegion){const r=CBExposureData.records.find(r=>r.id===el.dataset.evidenceRegion);if(ui.m2Layer==='exposure'&&CBExposureCatalog.located(r))drillMap(r.representativeLonLat);ui.evidenceRegion=el.dataset.evidenceRegion;render();document.querySelector(`g[data-evidence-region='${ui.evidenceRegion}']`)?.focus({preventScroll:true});return;}
    if(el.dataset.m1Cluster){const b=$('.m1-world')?.viewBox.baseVal;ui.m1Cluster=el.dataset.m1Cluster.split('~');ui.m1Map={evidenceViewportCenter:el.dataset.clusterCenter.split(',').map(Number),evidenceViewportWidth:Math.max(12,(b?.width||960)/1.8)};render();document.querySelector('.m1-cluster-detail button[data-m1-location]')?.focus({preventScroll:true});return;}
    if(el.hasAttribute('data-m1-cluster-close')){ui.m1Cluster=null;render();return;}
    if(el.dataset.m1Location){ui.m1Cluster=null;ui.m1Region=el.dataset.m1Location;ui.m1Page=0;render();return;}
    if(el.hasAttribute('data-m1-reset')){Object.assign(ui,{m1Provider:'all',m1Product:'all',m1Year:'all',m1Region:'all',m1Relation:'all',m1Page:0,m1Cluster:null});render();return;}
    if(el.dataset.m1Zoom){const b=$('.m1-world')?.viewBox.baseVal;if(b){ui.m1Map.evidenceViewportWidth=Math.max(12,Math.min(960,b.width/Math.pow(1.6,Number(el.dataset.m1Zoom))));ui.m1Map.evidenceViewportCenter=[b.x+b.width/2,b.y+b.height/2];}render();return;}
    if(el.dataset.m1Center){ui.m1Cluster=null;ui.m1Map=el.dataset.m1Center==='reset'?{}:{evidenceViewportCenter:el.dataset.m1Center==='catalog'?CBM2Map.project(...CBM1Catalog.index().regions.get(ui.m1Region).point):CBWorldMap.points[el.dataset.m1Center],evidenceViewportWidth:360};render();return;}
    if(el.dataset.evidenceZoom){const b=$('.evidence-world')?.viewBox.baseVal;if(b){ui.evidenceViewportWidth=Math.max(12,Math.min(960,b.width/Math.pow(1.6,Number(el.dataset.evidenceZoom))));ui.evidenceViewportCenter=[b.x+b.width/2,b.y+b.height/2];ui.evidenceZoom=0;}render();return;}
    if(el.dataset.evidenceCenter){ui.evidenceViewportWidth=null;ui.mapHistory=[];ui.evidenceViewportCenter=null;ui.evidenceCenter=el.dataset.evidenceCenter==='selected'?'selected':null;ui.evidenceZoom=el.dataset.evidenceCenter==='selected'?2:0;if(!ui.evidenceCenter){ui.evidenceFocus='world';ui.exposureCenter=null;ui.exposureGroup=null;}render();return;}
    if(el.dataset.m2Layer){ui.m2Layer=el.dataset.m2Layer;if(ui.m2Layer==='exposure'&&!ui.exposureCenter&&ui.evidenceCell)browseExposure(ui.evidenceCell.split(',').map(x=>Number(x)+.5));render();document.querySelector(`[data-m2-layer='${ui.m2Layer}']`)?.focus({preventScroll:true});return;}
    if(el.dataset.map){ui.mapModule=el.dataset.map;render();return;}
    if(el.dataset.region){ui.region=el.dataset.region;ui.m1Page=0;render();document.querySelector(`.m2-region-switch [data-region='${ui.region}']`)?.focus({preventScroll:true});return;}
    if(el.dataset.removeService!==undefined&&!app().policy){invalidateQuote();app().services.splice(Number(el.dataset.removeService),1);if(!app().services.some(s=>s.id===claim().serviceId))claim().serviceId=app().services[0].id;render();return;}
    if(el.dataset.removeSeg!==undefined&&!claim().approved){claim().segments.splice(Number(el.dataset.removeSeg),1);claim().submitted=false;claim().checked=[];render();return;}
    if(el.dataset.removeUpload!==undefined&&!claim().approved){claim().uploads.splice(Number(el.dataset.removeUpload),1);render();}
  });
  function changedCustomerClaim(key){const customer=['damagedDependency','causalChain','eventReference','noticeAt','effectiveAt','knownAtInception','serviceId','reportedCause','impactStart','impactEnd','attempted','switched','switchTime','measures','recovery','description','declaredLoss','otherCompensation','lostTasks','taskMargin','financialBasis','financeSigner'];if(!customer.includes(key))return;const c=claim();if(c.submitted){c.submitted=false;audit('客户申报信息变更 · 待重新提交');}c.checked=[];c.liabilityConfirmed=false;['externalVerified','dependencyVerified','physicalVerified','countryVerified','causalVerified','legalVerified'].forEach(k=>c[k]=false);if(['declaredLoss','otherCompensation','financialBasis','lostTasks','taskMargin'].includes(key)){c.evidence.E05=false;}}
  function refreshPreviews(){
    const templates={application:applicationView,claim:claimView,model:modelView};
    if(!templates[ui.view])return;
    const fresh=document.createElement('div');fresh.innerHTML=present(templates[ui.view]());
    const selectors=ui.view==='model'?['.model-layout > .stack:last-child']:['.case-strip',...(ui.view==='claim'?['.external-timeline']:[])];
    selectors.forEach(selector=>{const old=$('#main '+selector),updated=fresh.querySelector(selector);if(old&&updated)old.replaceWith(updated);});
    if(ui.view==='application'){
      const old=$$('#main .service-box .formula'),updated=[...fresh.querySelectorAll('.service-box .formula')];
      old.forEach((node,i)=>{if(updated[i])node.innerHTML=updated[i].innerHTML;});
    }
  }
  function handleField(event,typing=false){if(!app())return;const el=event.target;if(!el.matches('input,select,textarea'))return;let val=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.hasAttribute('data-bool')?el.value==='true':window.CBI18n.canonicalValue(el);
    if(el.hasAttribute('data-event-jump'))return;
    if(el.dataset.m1Filter){if(typing)return;const key=el.dataset.m1Filter;if(key==='upstream'){const service=CBM1Catalog.selection(app(),ui);(ui.m1Upstreams??={})[CBM1Catalog.upstreamKey(app(),service)]=val;}else{const fields={provider:'m1Provider',product:'m1Product',year:'m1Year',region:'m1Region',relation:'m1Relation',service:'m1Service'};if(!fields[key])return;ui[fields[key]]=val;if(key==='provider'){ui.m1Product='all';ui.m1Region='all';}}ui.m1Page=0;render();return;}
    if(el.hasAttribute('data-m1-region')){if(typing)return;ui.region=val;ui.m1Page=0;render();return;}
    if(el.hasAttribute('data-exposure-service')){if(typing)return;const id=el.dataset.exposureService;ui.exposureServices=ui.exposureServices.filter(x=>x!==id);if(val){ui.exposureServices.push(id);if(ui.m2Layer==='exposure'){const service=(app().policy?.terms||app()).services.find(s=>s.id===id),point=CBWorldMap.points[service?.region];if(point)browseExposure(CBM2Map.unproject(...point));}}render();document.querySelector(`[data-exposure-service='${id}']`)?.focus({preventScroll:true});return;}
    if(el.hasAttribute('data-exposure-search')){if(!typing)return;ui.evidenceSearch=el.value;ui.evidenceRegion=null;clearTimeout(catalogSearchTimer);catalogSearchTimer=setTimeout(()=>{if(!el.isConnected)return;const focused=document.activeElement===el,start=el.selectionStart,end=el.selectionEnd;render();const input=document.querySelector('[data-exposure-search]');if(focused&&input){input.focus({preventScroll:true});input.setSelectionRange(start,end);}},180);return;}
    if(el.type==='number'&&(!el.value||!Number.isFinite(val)||(el.min!==''&&val<Number(el.min))||(el.max!==''&&val>Number(el.max)))){if(!typing){toast('请输入允许范围内的有效数值');render();}return;}
    if(el.dataset.evidence&&!/^E\d+$/.test(el.dataset.evidence)){const key=el.dataset.evidence;if(!['evidenceSource','evidenceWindow','evidenceYear','evidenceType','evidenceFocus','evidenceProvider','evidenceRegion','evidenceCountry','evidenceKind','evidenceStatus','exposureSpan','m2Service','region'].includes(key))return;if(['evidenceWindow','evidenceYear','evidenceType'].includes(key))holdMapView();ui[key]=val;if(key==='evidenceYear')ui.evidenceWindow='single';if(['exposureSpan','evidenceFocus','evidenceCountry'].includes(key)){ui.evidenceViewportWidth=null;ui.mapHistory=[];}if(key==='exposureSpan'){ui.exposureGroup=null;ui.evidenceRegion=null;ui.evidenceViewportCenter=null;ui.evidenceZoom=0;}if(key==='evidenceFocus'){ui.evidenceViewportCenter=null;ui.evidenceCenter=null;ui.evidenceZoom=0;ui.evidenceCell=null;ui.evidenceRegion=null;const centers={europe:[30,47],middleEast:[44,28],africa:[20,3],asia:[104,25],china:[105,33],americas:[-85,5]};ui.exposureCenter=centers[val]||null;ui.exposureGroup=null;}if(['evidenceProvider','evidenceCountry','evidenceKind','evidenceStatus'].includes(key)){ui.evidenceRegion=null;clearTimeout(catalogSearchTimer);}if(key==='evidenceCountry'&&val==='CN'){ui.evidenceFocus='china';ui.evidenceViewportCenter=null;ui.evidenceCenter=null;ui.evidenceZoom=0;}render();document.querySelector(`[data-evidence='${key}']`)?.nextElementSibling?.focus({preventScroll:true});return;}
    if(el.dataset.m2Option){const key=el.dataset.m2Option;if(!['m2Service','m2Basis','m2Configuration'].includes(key))return;ui[key]=val;if(key==='m2Service'){ui.region=(app().policy?.terms||app()).services.find(s=>s.id===val)?.region||null;}render();document.querySelector(`[data-m2-option='${key}']`)?.nextElementSibling?.focus({preventScroll:true});return;}
    const a=app(),c=claim();
    if(el.dataset.business){if(c.approved)return;const [i,k]=el.dataset.business.split('.');c.additionalBusinesses[Number(i)][k]=val;changedCustomerClaim('serviceId');}
    else if(el.dataset.a){if(a.policy)return;const key=el.dataset.a;if(key!=='uwNote'){invalidateQuote();}a[key]=val;}
    else if(el.dataset.s){if(a.policy)return;invalidateQuote();const [i,key]=el.dataset.s.split('.');a.services[Number(i)][key]=val;if(key==='kind'&&val==='AI API'&&!a.services[Number(i)].olaVersion)Object.assign(a.services[Number(i)],D.olaDefaults);}
    else if(el.dataset.c){if(c.approved)return;const key=el.dataset.c;changedCustomerClaim(key);c[key]=val;if(key==='reportedCause')c.module=val==='physical'?'m2':val==='ordinary'?'m1':'pending';}
    else if(el.dataset.seg){if(c.approved)return;const [i,key]=el.dataset.seg.split('.');c.segments[Number(i)][key]=val;c.submitted=false;c.checked=[];c.liabilityConfirmed=false;}
    else if(el.dataset.uwcheck){if(a.policy)return;a.uwChecks||=[];a.uwChecks=a.uwChecks.filter(x=>x!==el.dataset.uwcheck);if(val)a.uwChecks.push(el.dataset.uwcheck);}
    else if(el.dataset.verify){if(c.approved)return;c.checked=c.checked.filter(x=>x!==el.dataset.verify);if(val)c.checked.push(el.dataset.verify);}
    else if(el.dataset.evidence){if(c.approved)return;c.evidence[el.dataset.evidence]=val;c.checked=c.checked.filter(x=>x!==el.dataset.evidence);c.submitted=false;}
    else if(el.dataset.m){state.draftModel[el.dataset.m]=val;}
    else if(el.dataset.r){const [id,key]=el.dataset.r.split('.');state.draftModel.regionOverrides[id]||={};state.draftModel.regionOverrides[id][key]=val;}
    else if(el.id==='claim-files'){if(c.approved)return;c.uploads.push(...[...el.files].map(f=>({name:f.name,size:f.size,lastModified:f.lastModified})));c.submitted=false;c.checked=[];}
    else return;
    save();
    if(typing){refreshPreviews();return;}
    // Text edits are already synchronized on input. Keep the focused form intact
    // so a blur does not remove a button before its click can be delivered.
    if(el.matches('textarea,input:not([type=checkbox]):not([type=file])'))return;
    render();
  }
  document.addEventListener('input',event=>{if(event.target.matches('textarea,input:not([type=checkbox]):not([type=file])'))handleField(event,true);});
  document.addEventListener('change',event=>handleField(event,false));
  document.addEventListener('submit',event=>{if(!event.target.matches('[data-m1-jump]'))return;event.preventDefault();const pages=Math.max(1,Math.ceil(CBM1Catalog.filter(app(),ui).length/4)),value=Number(new FormData(event.target).get('page'));if(Number.isInteger(value)&&value>=1&&value<=pages){ui.m1Page=value-1;render();}});
  document.addEventListener('keydown',event=>{const cluster=event.target.closest('g[data-m1-cluster]');if(cluster&&(event.key==='Enter'||event.key===' ')){event.preventDefault();cluster.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}const m1=event.target.closest('g[data-m1-location]');if(m1&&(event.key==='Enter'||event.key===' ')){event.preventDefault();ui.m1Cluster=null;ui.m1Region=m1.dataset.m1Location;ui.m1Page=0;render();document.querySelector(`g[data-m1-location='${ui.m1Region}']`)?.focus({preventScroll:true});return;}const target=event.target.closest('g[data-external-notice],g[data-evidence-cell],g[data-evidence-region],g[data-exposure-hub],g[data-exposure-group]');if(!target)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const nodes=[...target.parentElement.querySelectorAll('g[role=button]')],index=nodes.indexOf(target),next=nodes[(index+(['ArrowLeft','ArrowUp'].includes(event.key)?nodes.length-1:1))%nodes.length];next?.focus();}});
  document.addEventListener('keydown',event=>{const layer=event.target.closest('[data-m2-layer]');if(layer&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const ids=['hazard','exposure','recovery'],i=ids.indexOf(ui.m2Layer);ui.m2Layer=event.key==='Home'?ids[0]:event.key==='End'?ids[2]:ids[(i+(event.key==='ArrowRight'?1:2))%3];render();document.querySelector(`[data-m2-layer='${ui.m2Layer}']`).focus({preventScroll:true});return;}const target=event.target.closest('g[data-region]');if(target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();ui.region=target.dataset.region;ui.m1Page=0;render();document.querySelector(`g[data-region='${ui.region}']`)?.focus({preventScroll:true});}});
  $('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
  $('#scrim').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show');});
  window.addEventListener('cloudbridge:language',()=>{if(ui.view==='underwriting'&&ui.uwTab==='risk'&&ui.mapModule==='m2'){render();document.getElementById('language-trigger')?.focus({preventScroll:true});}});
  window.addEventListener('storage',event=>{if(event.key!==KEY||!event.newValue)return;try{const incoming=JSON.parse(event.newValue);if(incoming.version===1&&Array.isArray(incoming.apps)&&incoming.model){state=incoming;state.archived||=[];closeModal();render(false);}}catch{toast('另一个标签页已更新档案，请刷新后继续，避免覆盖');}});
  window.addEventListener('cloudbridge:risk-data',event=>{if(ui.view==='underwriting'&&ui.uwTab==='risk'&&event.detail===(ui.mapModule==='m2'?'m2':'m1'))render();});
  render();
})();
