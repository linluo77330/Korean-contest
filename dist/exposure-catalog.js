/* Public infrastructure catalog UI; does not read or mutate insurance pricing inputs. */
(function(root){
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
 const labels={'Azure':'Azure','AWS':'AWS','Google Cloud':'Google Cloud','Alibaba Cloud':'阿里云','Tencent Cloud':'腾讯云','Huawei Cloud':'华为云','Volcengine':'火山引擎','Oracle Cloud':'Oracle Cloud','IBM Cloud':'IBM Cloud','Cloudflare':'Cloudflare'};
 const types={'cloud-region':'云区域','classic-datacenter':'经典数据中心','edge-pop':'边缘节点'};
 const statuses={listed:'目录收录',restricted:'受限访问',retired:'已退役',announced:'已公告',unknown:'待核实'};
 const data=()=>root.CBExposureData;
 const kind=r=>r.infrastructureType||'cloud-region';
 const status=r=>r.catalogStatus||'listed';
 const located=r=>Array.isArray(r?.representativeLonLat)&&r.representativeLonLat.length===2&&r.representativeLonLat.every(Number.isFinite);
 function countryName(code){if(!code)return '位置待核实';try{return new Intl.DisplayNames([root.CBI18n?.locale||'zh-CN'],{type:'region'}).of(code)||code;}catch{return code;}}
 function select(label,key,value,options){return `<label class="field"><span>${label}</span><select aria-label="${label}" data-evidence="${key}" ${options.length?'':'disabled'}>${(options.length?options:[['','没有匹配结果']]).map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
 function filter(ui){
  const query=String(ui.evidenceSearch||'').trim().toLowerCase();
  return data().records.filter(r=>(!ui.evidenceProvider||ui.evidenceProvider==='all'||r.provider===ui.evidenceProvider)&&(!ui.evidenceCountry||ui.evidenceCountry==='all'||r.countryCode===ui.evidenceCountry)&&(!ui.evidenceKind||ui.evidenceKind==='all'||kind(r)===ui.evidenceKind)&&((ui.evidenceStatus||'current')==='all'||['listed','restricted'].includes(status(r)))&&(!query||[r.provider,labels[r.provider],r.code,r.name,r.publishedLocation,r.countryCode,countryName(r.countryCode),...(r.searchAliases||[])].join(' ').toLowerCase().includes(query)));
 }
 function controls(ui,records,region){
  const providers=[...new Set(data().records.map(r=>r.provider))];
  const countries=[...new Set(data().records.map(r=>r.countryCode).filter(Boolean))].sort((a,b)=>countryName(a).localeCompare(countryName(b)));
  return `<div class="catalog-controls">
    ${select('云服务商','evidenceProvider',ui.evidenceProvider||'all',[['all','全部厂商'],...providers.map(p=>[p,labels[p]||p])])}
    ${select('国家 / 地区','evidenceCountry',ui.evidenceCountry||'all',[['all','全部国家 / 地区'],...countries.map(c=>[c,countryName(c)])])}
    ${select('基础设施类型','evidenceKind',ui.evidenceKind||'all',[['all','全部类型'],...Object.entries(types)])}
    ${select('目录状态','evidenceStatus',ui.evidenceStatus||'current',[['current','现行目录'],['all','包含公告与退役记录']])}
    <label class="field catalog-search"><span>搜索目录</span><input type="search" data-exposure-search="true" value="${esc(ui.evidenceSearch||'')}" placeholder="搜索区域、城市或代码" autocomplete="off" aria-label="搜索目录"></label>
    <div class="catalog-actions"><button class="text-btn" data-catalog-action="china">查看中国区域</button><button class="text-btn" data-catalog-action="reset">清空筛选</button><a href="cloud-infrastructure.csv" download>下载完整目录 ↗</a></div>
  </div><div class="catalog-region-row">${select('区域 / 节点','evidenceRegion',region?.id||'',records.map(r=>[r.id,(labels[r.provider]||r.provider)+' · '+r.code+' · '+r.name]))}</div>`;
 }
 function summary(records){return `<div class="evidence-summary catalog-summary"><div><span>完整目录记录</span><strong>${data().records.length}</strong></div><div><span>符合筛选条件</span><strong>${records.length}</strong></div><div><span>可定位记录</span><strong>${records.filter(located).length}</strong></div></div>`;}
 function detail(r){if(!r)return `<div class="catalog-empty"><h3>没有匹配结果</h3><p>调整厂商、地区、类型或搜索条件。</p><button class="text-btn" data-catalog-action="reset">清空筛选</button></div>`;
  const precision={country:'国家级',admin1:'行政区级',metro:'都市圈',city:'城市级',unknown:'位置待核实'}[r.publishedAccuracy]||'近似区域';
  const zones=r.zones||[],zoneCount=r.zoneCount??zones.length;
  const zoneText=zones.map(z=>typeof z==='string'?z:z.code||z.id||z.name).filter(Boolean);
  const note=Array.isArray(r.notes)?r.notes.join(' '):r.notes||r.sourceNote||'';
  return `<span class="evidence-badge">${types[kind(r)]||kind(r)}</span><h3 data-no-translate>${esc(r.name)}</h3><div class="evidence-code" data-no-translate>${esc(r.provider)} · ${esc(r.code)}</div>
   ${r.codeStatus==='editorial_city_identifier_not_provider_region_code'?'<p class="evidence-note">城市目录标识，非厂商区域代码。</p>':''}<dl><div><dt>官方公布位置</dt><dd data-no-translate>${esc(r.publishedLocation||'—')}</dd></div><div><dt>国家 / 地区</dt><dd data-no-translate>${esc(countryName(r.countryCode))}</dd></div><div><dt>位置精度</dt><dd>${precision}</dd></div><div><dt>目录状态</dt><dd>${statuses[status(r)]||'待核实'}${r.restricted&&status(r)!=='restricted'?' · 受限访问':''}</dd></div>
   ${r.partition?`<div><dt>运营分区</dt><dd data-no-translate>${esc(r.partition)}</dd></div>`:''}${r.operator?`<div><dt>运营方</dt><dd data-no-translate>${esc(r.operator)}</dd></div>`:''}
   ${zoneCount?`<div><dt>目录可用区 / 可用域</dt><dd>${zoneCount}</dd></div>`:''}<div><dt>服务可用性</dt><dd>以具体产品目录为准</dd></div></dl>
   <p class="evidence-note">${located(r)?'地图标记为城市或区域代表位置，不是具体机房地址。':'位置未公开或尚未核实，保留目录记录，不在地图定位。'}</p>
   <div class="evidence-links">${link(r.sourceUrl,'官方目录来源')}${r.serviceEvidence?.url&&r.serviceEvidence.url!==r.sourceUrl?link(r.serviceEvidence.url,'服务区域目录'):''}</div>
   ${zoneText.length?`<details><summary>可用区 / 可用域标识</summary><p class="catalog-zone-list" data-no-translate>${zoneText.map(esc).join(' · ')}</p></details>`:''}
   ${note?`<details><summary>目录核对备注</summary><p class="evidence-note" data-no-translate>${esc(note)}</p>${r.statusSourceUrl?link(r.statusSourceUrl,'状态依据'):''}</details>`:''}
   ${kind(r)==='edge-pop'?'<p class="evidence-note">边缘网络节点不等于可部署虚拟机的云区域。</p>':''}`;
 }
 function sourceSummary(){return `<div><b>公开云基础设施目录</b><span>${data().records.length} · ${[...new Set(data().records.map(r=>r.provider))].length} <span>家厂商</span></span><p>按官方目录收录云区域、经典数据中心与边缘节点；分别标明运营分区、状态和位置精度。</p>${link('cloud-infrastructure.csv','下载完整目录')} · ${link('DATA-SOURCES.md','数据来源与方法')}</div>`;}
 function coverage(){
  const providers=[...new Set(data().records.map(r=>r.provider))];
  return `<details class="catalog-coverage"><summary>目录覆盖与官方来源</summary><p>记录数量按目录条目计算，不等于物理机房数量。边缘节点、云区域和经典数据中心分开筛选。</p><div class="table-wrap"><table><thead><tr><th>云服务商</th><th class="num">目录记录</th><th class="num">中国内地</th><th>官方来源</th></tr></thead><tbody>${providers.map(p=>{const rows=data().records.filter(r=>r.provider===p),urls=[...new Set(rows.map(r=>r.sourceUrl))];return `<tr><td>${labels[p]||esc(p)}</td><td class="num">${rows.length}</td><td class="num">${rows.filter(r=>r.countryCode==='CN').length}</td><td>${urls.map((url,i)=>link(url,urls.length>1?'来源 '+(i+1):'官方目录')).join(' · ')}</td></tr>`;}).join('')}</tbody></table></div><p>核对日期：2026-11-17。具体产品、配额与实时运行状态需另行核验。</p><p>城市参考坐标：GeoNames · CC BY 4.0 · ${link('https://www.geonames.org/export/','坐标来源')}</p></details>`;
 }
 root.CBExposureCatalog={filter,controls,summary,detail,sourceSummary,coverage,located};
})(window);
