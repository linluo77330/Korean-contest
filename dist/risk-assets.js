/* Optional map data loads once per session; never blocks application or claims. */
(function(root){
 'use strict';
 const groups={m1:['world','m1'],m2:['world','conflict','exposure']},jobs=new Map(),errors=new Map();
 function has(id){const key=CBRiskManifest[id].global;return id==='world'?!!root[key]?.land:!!root[key];}
 async function json(url,background=false){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const r=await fetch(url,{signal:controller.signal,priority:background?'low':'auto'});if(!r.ok)throw Error('HTTP '+r.status);const bytes=new Uint8Array(await r.arrayBuffer());const blob=new Blob([bytes]);return await new Response(bytes[0]===31&&bytes[1]===139?blob.stream().pipeThrough(new DecompressionStream('gzip')):blob.stream()).json();}finally{clearTimeout(timer)}}
 function script(url,background=false){return new Promise((resolve,reject)=>{const el=document.createElement('script'),timer=setTimeout(()=>{el.remove();reject(Error('Load timeout'))},30000);el.fetchPriority=background?'low':'auto';el.src=url;el.onload=()=>{clearTimeout(timer);el.remove();resolve()};el.onerror=()=>{clearTimeout(timer);el.remove();reject(Error('Load failed'))};document.head.append(el)})}
 function load(id,background=false){if(has(id))return Promise.resolve();if(jobs.has(id))return jobs.get(id);const spec=CBRiskManifest[id],points=id==='world'?{...root.CBWorldMap?.points}:null;
  const job=(async()=>{if(location.protocol==='file:'||typeof DecompressionStream==='undefined'){await script(spec.script,background)}else{const data=await json(spec.packed,background);root[spec.global]=data;}if(id==='world')Object.assign(root.CBWorldMap.points,points);if(!has(id))throw Error('Missing data');})().catch(e=>{jobs.delete(id);throw e});jobs.set(id,job);return job;
 }
 const running=new Map();
 function ensure(group){if(ready(group))return Promise.resolve();if(errors.has(group))return Promise.reject(errors.get(group));if(running.has(group))return running.get(group);const job=Promise.all(groups[group].map(id=>load(id))).catch(e=>{errors.set(group,e);throw e}).finally(()=>{running.delete(group);root.dispatchEvent(new CustomEvent('cloudbridge:risk-data',{detail:group}))});running.set(group,job);return job;}
 function ready(group){return groups[group].every(has)}
 let warming=false;
 function idle(){return new Promise(resolve=>{
  const schedule=()=>{if(document.hidden){document.addEventListener('visibilitychange',visible,{once:true});return;}if(root.requestIdleCallback)root.requestIdleCallback(resolve,{timeout:2500});else setTimeout(resolve,150)};
  const visible=()=>schedule();schedule();
 })}
 function warm(){if(warming)return;warming=true;
  // Let the first screen paint and accept input before any speculative download.
  requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(async()=>{
   for(const group of ['m1','m2']){
    if(ready(group))continue;
    try{for(const id of groups[group]){if(has(id))continue;await idle();await load(id,true);}errors.delete(group);root.dispatchEvent(new CustomEvent('cloudbridge:risk-data',{detail:group}));}catch{/* Background failures stay silent; normal navigation can retry. */}
   }
  },1200)));
 }
 root.CBRiskAssets={warm,json,ready,ensure,failed:group=>errors.has(group),retry(group){errors.delete(group);return ensure(group)}};
})(window);
