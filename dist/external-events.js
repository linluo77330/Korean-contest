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
