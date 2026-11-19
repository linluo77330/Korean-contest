const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const type of [chromium,...(process.env.CB_TEST_WEBKIT?[webkit]:[])]){
 const browser=await type.launch({headless:true,...(type===chromium&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const failFirst of [false,true]){
  const p=await browser.newPage(),errors=[],requests=[];let failed=false;
  p.on('pageerror',e=>errors.push(e.message));
  // Hold the idle scheduler until the first screen has accepted user input.
  await p.addInitScript(()=>{window.idleJobs=[];window.requestIdleCallback=fn=>{if(window.releaseIdle)setTimeout(fn,0);else window.idleJobs.push(fn);return 1}});
  await p.route('http://cloudbridge-http.test/**',async route=>{
   const u=new URL(route.request().url());requests.push(u.pathname);
   if(u.pathname.startsWith('/packed/')){await new Promise(r=>setTimeout(r,120));if(failFirst&&!failed&&u.pathname==='/packed/m1.json.gz'){failed=true;await route.fulfill({status:503,body:'unavailable'});return;}}
   await route.fulfill({path:path.join(__dirname,'../dist',u.pathname==='/'?'index.html':decodeURIComponent(u.pathname))});
  });
  await p.goto('http://cloudbridge-http.test/');await p.locator('[data-action=new-app]').first().click();
  const field=p.locator('[data-a=company]');await field.fill('Background loading check');
  await p.evaluate(()=>{window.originalField=document.querySelector('[data-a=company]')});
  await p.waitForFunction(()=>window.idleJobs.length>0);
  assert.equal(requests.filter(x=>x.startsWith('/packed/')).length,0);
  await p.evaluate(()=>{window.releaseIdle=true;window.idleJobs.splice(0).forEach(fn=>fn())});
  await p.waitForFunction(()=>CBRiskAssets.ready('m2'));
  assert.equal(await field.inputValue(),'Background loading check');
  assert.ok(await p.evaluate(()=>window.originalField===document.activeElement));
  assert.equal(await p.locator('.risk-loading').count(),0);
  assert.equal(await p.locator('[data-action=retry-risk-data]').count(),0);
  assert.equal(requests.filter(x=>x.includes('events-')).length,0);
  if(failFirst){assert.equal(await p.evaluate(()=>CBRiskAssets.failed('m1')),false)}
  else{assert.ok(await p.evaluate(()=>CBRiskAssets.ready('m1')))}
  await p.locator('[data-view=underwriting]').click();await p.locator('.m1-world').waitFor();
  await p.locator('[data-map=m2]').click();assert.ok(await p.locator('.evidence-world').isVisible());
  for(const id of ['world','conflict','exposure'])assert.equal(requests.filter(x=>x===`/packed/${id}.json.gz`).length,1);
  assert.equal(requests.filter(x=>x==='/packed/m1.json.gz').length,failFirst?2:1);
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS '+type.name()+': first screen and input precede background maps; focus preserved; cached navigation; silent failure recovers on demand');
 }finally{await browser.close()}
}})().catch(e=>{console.error(e);process.exit(1)});
