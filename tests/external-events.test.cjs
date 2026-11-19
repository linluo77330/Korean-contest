const assert=require('node:assert/strict');global.window=global;global.document={addEventListener(){}};
for(const f of ['engine','external-events','data','world-map','m2-risk','conflict-data','exposure-data','exposure-catalog','hazard-history','m2-map','unified-data','pricing','unified-bootstrap'])require('../dist/'+f+'.js');
const a=CBData.makeApp('CBU-001');a.sampleKind='m2';a.claim=CBData.claim(a);
assert.equal(a.claim.reportedCause,'physical');assert.deepEqual(CBExternal.claimErrors(a,a.claim),[]);assert.equal(CBEngine.assess(a,a.claim).amount,2000);
for(const cause of ['access','connection','unknown']){const c=structuredClone(a.claim);c.reportedCause=cause;assert.ok(CBExternal.claimErrors(a,c).length);assert.equal(CBEngine.assess(a,c).amount,0);}
for(const field of ['eventReference','damagedDependency','causalChain']){const c=structuredClone(a.claim);c[field]='';assert.ok(CBExternal.claimErrors(a,c).length);}
assert.match(CBExternal.policyText(a),/地缘政治冲突损坏/);assert.doesNotMatch(CBExternal.policyText(a),/准入|过渡/);
assert.equal(CBExternal.effectiveHours(72,{backup:'tested',backupDate:'2026-10-20',sharedDependency:'no',rto:120}),2);
console.log('PASS conflict dependency chain, excluded access changes, no manual check flags, policy scope and recovery');
