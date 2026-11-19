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
