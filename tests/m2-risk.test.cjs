const assert=require('node:assert/strict');
const M=require('../dist/m2-risk.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('等待期内不赔、等待期后按小时赔付',()=>{assert.equal(M.payout(.5),0);assert.equal(M.payout(2),30000);});
test('事故限额与最长时长分别限制赔款',()=>{assert.equal(M.payout(30),400000);assert.equal(M.payout(30,{occLimit:50000}),50000);assert.equal(M.payout(30,{maxHours:1}),20000);});
test('年度限额仅容纳一次赔款时，年损失等于至少出险一次的概率乘限额',()=>{near(M.annualLoss(.8,[{payout:100,weight:1}],100),100*(1-Math.exp(-.8)));});
test('年度限额容纳两次赔款时仍计入多次事故',()=>{near(M.annualLoss(.8,[{payout:100,weight:1}],200),100*(2-(2+.8)*Math.exp(-.8)));});
test('条件概率、情景权重与触发概率使用不同口径',()=>{for(const id of Object.keys(M.regions)){const r=M.evaluate(id);near(r.outcomes.reduce((s,o)=>s+o.weight,0),1);assert.ok(r.triggerP<r.sourceP);assert.ok(r.annual<=r.terms.annualLimit);assert.ok(Number.isFinite(r.premium));}});
test('增长等待期会降低触发概率和参考价',()=>{const a=M.evaluate('middle-east'),b=M.evaluate('middle-east',{terms:{waiting:240}});assert.ok(b.triggerP<a.triggerP);assert.ok(b.premium<a.premium);});
test('服务独立路径冗余降低中断时长与参考价',()=>{const a=M.evaluate('singapore'),b=M.evaluate('singapore',{configuration:'independent'}),c=M.evaluate('singapore',{configuration:'shared'});assert.ok(b.meanHours<a.meanHours);assert.ok(b.premium<a.premium&&a.premium<c.premium);});
test('零赔付额、零年度限额及极长等待期均无赔款',()=>{for(const terms of [{hourly:0},{annualLimit:0},{waiting:10000}]){const r=M.evaluate('middle-east',{terms});assert.equal(r.annual,0);assert.equal(r.premium,0);assert.equal(r.triggerP,0);}});
test('保障金额不改变地区风险等级',()=>{const a=M.evaluate('eu-west'),b=M.evaluate('eu-west',{terms:{hourly:1000}});assert.equal(a.level,b.level);assert.ok(b.premium<a.premium);});
test('年限额下降会降低期望赔款',()=>{assert.ok(M.evaluate('middle-east',{terms:{annualLimit:50000}}).annual<M.evaluate('middle-east').annual);});
test('参考模型不根据客户业务备用缩短原服务中断',()=>{assert.deepEqual(M.evaluate('singapore',{backup:'tested'}),M.evaluate('singapore',{backup:'none'}));});
test('未知地区不返回伪造的低风险',()=>assert.equal(M.evaluate('unknown'),null));
console.log(`${count} M2 reference-model checks passed.`);
