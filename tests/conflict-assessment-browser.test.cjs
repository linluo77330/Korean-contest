const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const click=async s=>{await p.locator(s).first().click();await p.waitForTimeout(100)}, KEY='cloudbridge-workspace-demo-v3',state=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
 await p.goto('http://127.0.0.1:8787/?v=conflict3');await click('[data-action=load-case]');await click('[data-action=load-m2]');
 assert.equal(await p.locator('[data-c=noticeAt]').count(),0);assert.equal(await p.locator('[data-c=effectiveAt]').count(),0);assert.equal(await p.locator('[data-c=damagedDependency]').count(),1);
 await click('[data-claimtab=materials]');
 for(const lang of ['zh-CN','en','ko','ja']){await p.evaluate(l=>CBI18n.setLanguage(l),lang);for(const width of [1440,390]){await p.setViewportSize({width,height:1050});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}if(['en','ko'].includes(lang))assert.doesNotMatch(await p.locator('#main').innerText(),/[\u4e00-\u9fa5]/u);}
 await p.evaluate(()=>CBI18n.setLanguage('zh-CN'));await p.setViewportSize({width:1440,height:1050});await p.screenshot({path:'/private/tmp/cloudbridge-materials-flow4.png',fullPage:true});

 assert.equal(await p.locator('[data-c=declaration],[data-c=financeSigner],[data-c=account],input[type=checkbox]').count(),0);await click('[data-action=submit-claim]');assert.equal(await p.locator('dialog[open]').count(),0);
 assert.equal(await p.locator('[data-reviewtab]').count(),3);assert.equal(await p.locator('[data-reviewtab=monitor]').count(),0);assert.equal(await p.locator('[data-reviewtab=liability]').count(),0);assert.equal(await p.locator('[data-verify]').count(),0);
 assert.doesNotMatch(await p.locator('#main').innerText(),/客户申报摘要|责任认定|事故监测/);assert.match(await p.locator('.claim-time-stat').innerText(),/2027-01-10 10:00/);
 assert.ok(await p.locator('.claim-evidence-card .chart').isVisible());await click('[data-action=play-monitor]');
 await p.waitForTimeout(800);await p.screenshot({path:'/private/tmp/cloudbridge-claims-conflict3.png',fullPage:true});
 for(const lang of ['zh-CN','en','ko','ja']){
  await p.evaluate(l=>CBI18n.setLanguage(l),lang);
  for(const width of [1440,768,390]){await p.setViewportSize({width,height:1050});await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),lang+' width '+width);}
  if(['en','ko'].includes(lang)){const text=await p.locator('.claim-evidence-card').innerText();assert.doesNotMatch(text,/[\u4e00-\u9fa5]/u);}
 }
 await p.setViewportSize({width:1440,height:1050});await p.evaluate(()=>CBI18n.setLanguage('zh-CN'));
 await click('[data-action=calculation-tab]');assert.match(await p.locator('.document-preview').innerText(),/2,000.00/);
 await click('[data-action=approve-claim]');assert.equal(await p.locator('dialog[open]').count(),0);assert.equal(await p.locator('[data-action=accept-settlement]').count(),0);await click('[data-action=pay-claim]');assert.equal(await p.locator('dialog[open]').count(),0);
 for(const lang of ['zh-CN','en','ko','ja']){await p.evaluate(l=>CBI18n.setLanguage(l),lang);for(const width of [1440,390]){await p.setViewportSize({width,height:1050});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}if(['en','ko'].includes(lang))assert.doesNotMatch(await p.locator('.content-grid').innerText(),/[\u4e00-\u9fa5]/u);}
 await p.evaluate(()=>CBI18n.setLanguage('zh-CN'));await p.setViewportSize({width:1440,height:1050});await p.screenshot({path:'/private/tmp/cloudbridge-closure-flow4.png',fullPage:true});

 let s=await state(),a=s.apps.find(x=>x.id===s.selected);assert.equal(a.claim.paid,true);assert.equal(a.paid.m2,2000);assert.equal(a.claim.checked.length,0);await p.evaluate(()=>{const b=document.createElement('button');b.dataset.action='pay-claim';document.body.append(b);b.click();b.click();b.remove();});assert.equal((await state()).apps.find(x=>x.id===a.id).paid.m2,2000);assert.notEqual(a.claim.accepted,true);assert.notEqual(a.claim.declaration,true);
 // New scope is reflected across underwriting, map, recovery and model.
 await click('[data-view=underwriting]');await click('[data-uwtab=risk]');await click('[data-map=m2]');assert.equal(await p.locator('[data-evidence=evidenceSource]').count(),0);assert.ok(await p.locator('[data-evidence=evidenceWindow]').count());
 await click('[data-m2-layer=recovery]');assert.doesNotMatch(await p.locator('#main').innerText(),/准入|公告准备|过渡中断/);assert.match(await p.locator('.conflict-chain').first().innerText(),/数字依赖受损/);
 await click('[data-view=model]');await click('[data-action=activate-model]');assert.equal(await p.locator('dialog[open]').count(),0);assert.doesNotMatch(await p.locator('#main').innerText(),/准入|公告准备|首次投保年度/);
 await click('[data-view=underwriting]');await click('[data-uwtab=pricing]');assert.match(await p.locator('.pricing-total').innerText(),/4,567.84/);
 // Upgrade a stored older policy without changing its original snapshot.
 await p.evaluate(k=>{const data=JSON.parse(localStorage.getItem(k)),old=data.apps.find(a=>a.id===data.selected);old.policy.terms.coverageVersion='EE-2.0';old.coverageVersion='EE-2.0';old.policy.quote.pricingVersion='CB-UNIFIED-2.0';old.policy.quote.total=4811.96;data.scopeVersion='EE-2.0';data.archived=[];localStorage.setItem('migration-original',JSON.stringify(old.policy));localStorage.setItem(k,JSON.stringify(data));},KEY);
 await p.reload();s=await state();assert.equal(s.archived.length,1);assert.equal(JSON.stringify(s.archived[0].policy),await p.evaluate(()=>localStorage.getItem('migration-original')));a=s.apps.find(a=>a.id===s.selected);assert.equal(a.policy,null);assert.equal(a.coverageVersion,'EE-CONFLICT-3.0');await p.reload();assert.equal((await state()).archived.length,1);
 assert.deepEqual(errors,[]);console.log('PASS simplified assessment, four-language responsive layout, no manual verification, M2 settlement, map and revised pricing');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
