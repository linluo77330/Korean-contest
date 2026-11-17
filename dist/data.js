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
  const service={id:'SVC-01',provider:'Azure',kind:'云计算',service:'Virtual Machines',region:'us-east',endpoint:'生产数据面 / vm-prod-eastus',business:'跨境电商订单处理',group:'BIZ-01',volume:100,margin:400,irrecoverable:50,backup:'none',backupDate:'',rto:60,limit:400000,dependency:'订单校验、库存确认与支付后履约必须调用该生产服务；备用系统尚未通过端到端演练。'};
  function base() { return {id:'CB-A-2026-001',company:'远帆跨境科技有限公司',industry:'跨境电商',contact:'陈晓 · 财务负责人',email:'chen@example.com',registration:'DEMO-91310000',periodStart:'2026-11-01',periodEnd:'2027-11-01',calendar:'business',waiting:30,maxHours:20,occLimit:400000,annual1:800000,annual2:400000,annualTotal:1200000,m2:true,services:[structuredClone(service)],stage:'submitted',consent:true,quote:null,policy:null,paid:{m1:0,m2:0,total:0},history:[{at:'2026-10-26 09:20',text:'客户提交投保问卷 · 等待核保'}]}; }
  function claim(app) {
    const physical=app.sampleKind==='m2'||app.id.endsWith('003');
    const margin=Number(app.services[0].margin)||400;
    return {id:'CB-C-'+app.id.slice(5),serviceId:app.services[0].id,module:physical?'m2':'m1',reportedCause:physical?'physical':'ordinary',segments:[{start:'2026-11-17T10:00',end:'2026-11-17T11:50'}],impactStart:'2026-11-17T10:00',impactEnd:'2026-11-17T11:50',switched:false,switchTime:'2026-11-17T10:40',attempted:true,
      measures:'10:08 启动备用方案；10:18 验证失败，未成功接管。持续重试并暂停新增任务，恢复后核对积压队列。',
      recovery:'11:50 服务及关键交易恢复；11:55 完成连续五分钟恢复确认。',
      description:physical?'情景假设：第三国设施上游供电因约定物理事件受损，导致列明服务中断。须调查设施国地位及因果链。':'模拟服务商网络配置故障，导致生产数据面连接失败。关键订单无法完成，未成功切换。',
      declaredLoss:80*margin,otherCompensation:0,lostTasks:80,taskMargin:margin,financialBasis:`80笔最终取消且无法补做的付费任务 × 每笔${margin}元贡献毛利；已扣除节省的可变成本。`,financeSigner:app.contact,
      declaration:false,submitted:false,reviewed:false,approved:false,paid:false,playback:false,bothCovered:false,physicalVerified:false,countryVerified:false,causalVerified:false,account:'演示对公账户 · 尾号0000',evidence:{E01:true,E02:true,E03:true,E04:true,E05:false,E07:true},uploads:[],notes:'',
      reviewNote:'示例调查记录：监测、业务交易和切换记录的事故时段相互吻合。待核赔人逐项复核。',
      liabilityNote:physical?'演示调查意见：按M2物理冲突外溢情景审查，须核实约定物理事件、非直接交战国设施及完整因果链后方可核定。':'演示调查意见：模拟网络配置故障按M1审查，列明服务与业务影响相对应；须核查原始材料及具体除外事实后确认责任。',checked:[]};
  }
  const a=base(),b=base(),c=base();
  b.id='CB-A-2026-002';b.company='语桥智能服务有限公司';b.industry='AI应用服务';b.stage='draft';b.contact='林远 · 运营负责人';b.email='lin@example.com';b.services=[{...structuredClone(service),kind:'AI API',service:'Azure OpenAI',endpoint:'gpt-4.1 / deployment-prod（示例）',business:'按次收费的多语种内容生成',group:'BIZ-AI',volume:120,margin:100,irrecoverable:60,backup:'tested',backupDate:'2026-10-20',rto:15,dependency:'按唯一付费任务归集调用；失败重试不重复计算，恢复后可补做部分不计永久损失。'}];b.history=[{at:'2026-10-26 08:50',text:'客户保存AI API投保草稿'}];
  c.id='CB-A-2026-003';c.company='星链出海软件有限公司';c.industry='跨境SaaS';c.contact='周宁 · 技术负责人';c.email='zhou@example.com';c.services=[{...structuredClone(service),region:'singapore',business:'跨境SaaS付费任务处理',dependency:'独立业务组；用于演示非直接交战国设施的物理冲突外溢情景。'}];c.history=[{at:'2026-10-26 09:10',text:'客户提交第三国物理外溢情景投保单'}];
  [a,b,c].forEach(x=>x.claim=claim(x));
  const events=[
    {date:'2024.07.30',title:'Azure Front Door 连接异常',provider:'Azure',region:'多地区',module:'M1参考',summary:'微软披露部分客户出现连接错误、超时和延迟；涉及DDoS防护、网络路由及控制面问题。',url:'https://azure.status.microsoft/status/history/?trackingId=KTY1-HW8',source:'Microsoft Azure · 官方事后报告'},
    {date:'2021.12.07',title:'AWS US-EAST-1 服务事件',provider:'AWS',region:'美国东部',module:'M1参考',summary:'AWS披露北弗吉尼亚区域服务中断。用于说明区域及上游依赖，不等同于本客户事故。',url:'https://aws.amazon.com/message/12721/',source:'Amazon Web Services · 官方事件总结'},
    {date:'2025.06.12',title:'Cloudflare 多项服务中断',provider:'Cloudflare',region:'多地区',module:'M1参考',summary:'官方披露Workers KV等多项服务受到影响，展示公共上游依赖带来的跨服务传播。',url:'https://blog.cloudflare.com/cloudflare-service-outage-june-12-2025/',source:'Cloudflare · 官方事故复盘'}
  ];
  window.CBData={regions,model,apps:[a,b,c],events,base,claim,service};
})();
