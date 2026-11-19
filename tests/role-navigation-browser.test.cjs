const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const type of [chromium,...(process.env.CB_TEST_WEBKIT?[webkit]:[])]){
 const b=await type.launch({headless:true,...(type===chromium&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('http://cloudbridge-http.test/**',r=>r.fulfill({path:path.join(__dirname,'../dist',new URL(r.request().url()).pathname==='/'?'index.html':decodeURIComponent(new URL(r.request().url()).pathname))}));
 const click=async s=>{await p.locator(s).first().click();await p.waitForTimeout(60)};
 const role=async r=>assert.equal(await p.locator('body').getAttribute('data-role'),r);
 const risk=async()=>{assert.equal(await p.locator('[data-uwtab].active').getAttribute('data-uwtab'),'risk');assert.ok(await p.locator('.risk-map-card').isVisible());await role('insurer')};
 await p.goto('http://cloudbridge-http.test/');await click('[data-action=new-app]');
 for(const lang of ['en','zh-CN','ko','ja']){
  await p.evaluate(l=>CBI18n.setLanguage(l),lang);await click('[data-view=application]');await role('insured');await click('[data-formstep="0"]');
  await p.locator('[data-a=company]').fill('CloudBridge navigation');await click('[data-action=go-underwriting]');await risk();
  await click('[data-uwtab=pricing]');await click('[data-view=application]');await click('[data-view=underwriting]');await risk();
  await click('[data-view=application]');await click('[data-formstep="4"]');await click('[data-action=submit-application]');await risk();
  await click('[data-action=pricing-tab]');assert.equal(await p.locator('[data-uwtab].active').getAttribute('data-uwtab'),'pricing');
  await click('[data-view=model]');await role('insurer');await click('[data-view=underwriting]');await risk();
  assert.equal(await p.locator('.nav-item.active').evaluate(e=>getComputedStyle(e).color),'rgb(111, 99, 79)');
  await p.setViewportSize({width:390,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await p.setViewportSize({width:1440,height:1000});
 }
 await p.evaluate(()=>CBI18n.setLanguage('en'));await p.evaluate(()=>document.activeElement?.blur());await p.screenshot({path:'/private/tmp/cloudbridge-insurer-'+type.name()+'.png'});
 await click('[data-action=issue-policy]');assert.equal(await p.locator('[data-uwtab].active').getAttribute('data-uwtab'),'policy');
 await click('[data-action=go-claim]');await role('insured');assert.equal(await p.locator('[data-claimtab].active').getAttribute('data-claimtab'),'report');
 await p.screenshot({path:'/private/tmp/cloudbridge-insured-'+type.name()+'.png'});
 await click('[data-action=submit-claim]');await role('insurer');await click('[data-action=calculation-tab]');await click('[data-action=approve-claim]');await click('[data-action=pay-claim]');
 await click('[data-view=application]');await click('[data-view=underwriting]');await risk();assert.deepEqual(errors,[]);
 console.log('PASS '+type.name()+': four languages, report/risk-first navigation, explicit pricing/policy routes, role colors, mobile layout and complete claim flow');
 }finally{await b.close()}
}})().catch(e=>{console.error(e);process.exit(1)});
