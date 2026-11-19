const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 fs.mkdirSync('/private/tmp/cb-ui-audit',{recursive:true});
 const b=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const p=await b.newPage({viewport:{width:1440,height:1050},acceptDownloads:true}),errors=[],checked=[];
  p.on('pageerror',e=>errors.push(e.message));
  const KEY='cloudbridge-workspace-demo-v3',get=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
  const click=async s=>{await p.locator(s).first().click();await p.waitForTimeout(90)};
  const language=async l=>{await p.evaluate(l=>CBI18n.setLanguage(l),l);await p.waitForTimeout(70)};
  async function scan(name,{download,screenshot=false}={}){
   await language('zh-CN');const before=await get();
   for(const lang of ['en','ko','ja','zh-CN']){
    await language(lang);
    const bad=await p.evaluate(lang=>{
     const out=[],w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
     const check=(s,e)=>{if(!s.trim()||e.closest('script,style,[data-no-translate]')||!e.getClientRects().length)return;
      // User-written values are deliberately preserved; official source titles retain their original language.
      if(e.closest('[data-user-text]'))return;
      if((lang==='en'||lang==='ko')&&/[\u3400-\u9fff]/u.test(s))out.push(s.trim());
      if(lang==='ja'&&/赔款|保单|净损失|事故申报|请填写|已支付|核赔|待核定|损失金额/.test(s))out.push(s.trim());};
     while(w.nextNode())if(!w.currentNode.parentElement.closest('textarea'))check(w.currentNode.nodeValue,w.currentNode.parentElement);
     for(const e of document.querySelectorAll('input[type=text],textarea'))check(e.value,e);
     return [...new Set(out)];
    },lang);
    assert.deepEqual(bad,[],`${name}/${lang}: untranslated interface text`);
    for(const width of [1440,390]){
     await p.setViewportSize({width,height:1050});await p.waitForTimeout(60);
     assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`${name}/${lang}/${width}: page overflow`);
    }
    await p.setViewportSize({width:1440,height:1050});
    if(screenshot){await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await p.waitForTimeout(250);await p.screenshot({path:`/private/tmp/cb-ui-audit/${name}-${lang}.png`,fullPage:true})}
    if(download){
     const done=p.waitForEvent('download');await click(`[data-action=${download}]`);const html=fs.readFileSync(await(await done).path(),'utf8');
     const bad=await p.evaluate(({html,lang})=>{const d=new DOMParser().parseFromString(html,'text/html');d.querySelectorAll('[data-user-text],script,style,[data-no-translate]').forEach(e=>e.remove());return {lang:d.documentElement.lang,text:d.body.textContent,title:d.title};},{html,lang});
     assert.equal(bad.lang,lang);if(['en','ko'].includes(lang))assert.deepEqual((bad.text+bad.title).match(/.{0,45}[\u3400-\u9fff].{0,65}/gu)||[],[],`${name}/${lang}: export`);
     assert.doesNotMatch(bad.text,/¥/);assert.match(bad.text,/USD/);
    }
    assert.deepEqual(await get(),before,`${name}/${lang}: language switching changed business data`);
    checked.push(name+'/'+lang);
   }
  }
  await p.goto(process.env.CB_TEST_URL||'http://127.0.0.1:8787/');await click('[data-action=new-app]');
  for(let n=0;n<5;n++){await click(`[data-formstep="${n}"]`);await scan('application-'+n)}
  await click('[data-action=go-underwriting]');await scan('risk-m1');await click('[data-map=m2]');
  for(const layer of ['hazard','exposure','recovery']){await click(`[data-m2-layer=${layer}]`);await scan('risk-m2-'+layer)}
  await click('[data-uwtab=pricing]');await scan('pricing');await click('[data-action=issue-policy]');
  await scan('policy',{download:'download-policy',screenshot:true});
  await click('[data-action=go-claim]');assert.equal(await p.locator('[data-claimtab].active').getAttribute('data-claimtab'),'report');
  for(const tab of ['report','loss','materials']){await click(`[data-claimtab=${tab}]`);await scan('claim-'+tab,{download:tab==='report'?'download-claim':undefined,screenshot:tab==='report'})}
  // Sidebar, policy shortcut, case loading and direct URL must all start at the report.
  await click('[data-view=underwriting]');await click('[data-view=claim]');assert.equal(await p.locator('[data-claimtab].active').getAttribute('data-claimtab'),'report');
  await click('[data-claimtab=loss]');await click('[data-view=underwriting]');await click('[data-action=go-claim]');assert.equal(await p.locator('[data-claimtab].active').getAttribute('data-claimtab'),'report');
  await p.goto('http://127.0.0.1:8787/#claim');assert.equal(await p.locator('[data-claimtab].active').getAttribute('data-claimtab'),'report');
  assert.equal(await p.locator('[data-c=declaration],[data-c=financeSigner]').count(),0);
  await click('[data-action=submit-claim]');
  for(const tab of ['evidence','calculation','closure']){await click(`[data-reviewtab=${tab}]`);await scan('assessment-'+tab,{download:tab==='calculation'?'download-calculation':undefined,screenshot:tab==='calculation'})}
  await click('[data-action=calculation-tab]');await click('[data-action=approve-claim]');assert.equal(await p.locator('dialog[open]').count(),0);
  assert.equal((await get()).apps[0].claim.approved,true);assert.notEqual((await get()).apps[0].claim.declaration,true);
  await click('[data-action=pay-claim]');assert.equal((await get()).apps[0].claim.paid,true);await scan('paid',{download:'download-closure'});
  await click('[data-view=model]');for(const tab of ['parameters','regions','sensitivity','versions']){await click(`[data-modeltab=${tab}]`);await scan('model-'+tab)}
  await click('[data-action=load-case]');await scan('case-picker');await click('[data-action=load-m2]');assert.equal(await p.locator('[data-claimtab].active').getAttribute('data-claimtab'),'report');
  await scan('m2-report');await click('[data-action=submit-claim]');await click('[data-action=calculation-tab]');await scan('m2-calculation',{download:'download-calculation'});
  await click('[data-action=approve-claim]');assert.equal(await p.locator('dialog[open]').count(),0);await click('[data-action=pay-claim]');assert.equal((await get()).apps[0].claim.settlement.amount,2000);
  // A missing sentence must stay whole, never become a mixture of translated words.
  for(const l of ['en','ko','ja']){await language(l);assert.equal(await p.evaluate(()=>CBI18n.t('尚未收录的新句子：承保服务年度')),'尚未收录的新句子：承保服务年度');}
  // User-authored business descriptions survive language changes without persistence mutations.
  await click('[data-action=new-app]');await language('zh-CN');await p.locator('[data-a=company]').fill('用户自填公司');await p.locator('[data-a=company]').blur();const stored=await get();
  for(const l of ['en','ko','ja','zh-CN']){await language(l);assert.equal(await p.locator('[data-a=company]').inputValue(),'用户自填公司');assert.deepEqual(await get(),stored)}
  assert.deepEqual(errors,[]);console.log(`PASS ${checked.length} localized views, desktop/mobile, policy/report/calculation/closure exports, report-first navigation, M1/M2 approval without financial authorization, state preservation and no browser errors`);
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exit(1)});
