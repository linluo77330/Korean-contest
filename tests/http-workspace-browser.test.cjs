const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const b=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('http://cloudbridge-http.test/**',async route=>{const u=new URL(route.request().url()),f=path.join(__dirname,'../dist',u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));await route.fulfill({path:f})});
 await p.goto('http://cloudbridge-http.test/');
 assert.equal(await p.evaluate(()=>isSecureContext),false);assert.equal(await p.evaluate(()=>typeof crypto.randomUUID),'undefined');
 await p.locator('[data-action=new-app]').first().click();
 assert.deepEqual(errors,[],'HTTP create application must not throw');
 assert.equal(await p.locator('[data-a=company]').count(),1);
 const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('cloudbridge-workspace-demo-v3')));
 const first=(await state()).apps[0].id;
 await p.locator('[data-action=new-app]').first().click();const next=await state();assert.equal(next.apps.length,2);assert.notEqual(next.apps[0].id,first);
 await p.reload();assert.equal((await state()).apps.length,2);
 await p.locator('[data-action=load-case]').first().click();await p.locator('[data-action=load-m2]').click();
 assert.equal(await p.locator('[data-claimtab].active').getAttribute('data-claimtab'),'report');assert.ok((await state()).apps.some(a=>a.sampleKind==='m2'&&a.policy));
 assert.deepEqual(errors,[]);console.log('PASS plain HTTP: secure-only UUID API absent, new applications, unique IDs, persistence and M2 case loading');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
