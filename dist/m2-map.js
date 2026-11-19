/* Historical evidence explorer. Never converts conflict counts to insured probabilities. */
(function(root){
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:1});
  const link=(url,text)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`;
  const types=['全部事件','国家型冲突','非国家冲突','单方面暴力'];
  const layers=[['hazard','01','危险性','地缘政治冲突观测'],['exposure','02','风险暴露','设施与关键依赖'],['recovery','03','中断与恢复','情景参数']];
  const focuses={world:['全球',0,20,960],europe:['欧洲',30,47,330],middleEast:['中东',44,28,240],africa:['非洲',20,3,430],asia:['亚洲',104,25,450],china:['中国',105,33,260],americas:['美洲',-85,5,470]};
  function raw(lon,lat){const l=lon*Math.PI/180,p=lat*Math.PI/180,p2=p*p,p4=p2*p2;return [l*(.8707-.131979*p2+p4*(-.013791+p4*(.003971*p2-.001529*p4))),p*(1.007226+p2*(.015085+p4*(-.044475+.028874*p2-.005916*p4)))];}
  const scale=228/raw(0,90)[1];
  function project(lon,lat){const [x,y]=raw(lon,lat);return [480+x*scale,240-y*scale];}
  const sum=a=>a.reduce((n,x)=>n+x,0),count=(a,t)=>t?a[t-1]:sum(a);
  const fill=n=>n>=500?'#a74737':n>=100?'#c96a45':n>=20?'#de9565':n>=5?'#eac397':'#f1dfc4';
  const option=(v,t,s)=>`<option value="${esc(v)}" ${String(v)===String(s)?'selected':''}>${esc(t)}</option>`;
  function select(label,key,value,options){return `<label class="field"><span>${label}</span><select aria-label="${label}" data-evidence="${key}">${options.map(([v,t])=>option(v,t,value)).join('')}</select></label>`;}
  function baseMap(){const geo=root.CBWorldMap;return `<path class="risk-ocean" d="${geo.sphere}" fill="#f7f9fb"/><path class="risk-grid" d="${geo.graticule}" fill="none" stroke="#e3e8ed" stroke-width=".5"/><path class="risk-land" d="${geo.land}" fill="#e5e9ec" stroke="#bac6ce" stroke-width=".35"/>`;}
  function sourcePanel(){return `<div class="evidence-sources">
    <div><b>UCDP GED 26.1</b><span>观测数据 · 2016–2025</span><p>致死的有组织暴力；按事件数聚合，不按死亡人数加权。空白网格不代表零风险。</p>${link(root.CBConflictData.source,'下载原始数据')} · ${link(root.CBConflictData.codebook,'字段代码本')}</div>
    ${root.CBExposureCatalog.sourceSummary()}
    <div><b>RIPE Atlas · ACLED</b><span>后续数据候选 · 未接入</span><p>网络测量可补充链路证据；更多政治暴力事件需另行取得数据许可。尚无客户级网络路由或设施故障数据。</p>${link('https://atlas.ripe.net/','网络测量')} · ${link('https://acleddata.com/faq/how-can-i-access-and-use-acled-data','事件数据访问')}</div>
    <p class="evidence-footnote">UCDP / Uppsala University · CC BY 4.0 · 数据整理：2026-11-17。网格为 1° × 1°，面积随纬度变化；只纳入 where_prec 1–2。${link('DATA-SOURCES.md','数据来源与方法')}</p>
  </div>`;}
  function context(a,model,ui){const source=a.policy?.terms||a,services=source.services||a.services,service=services.find(s=>s.id===ui.m2Service)||services[0];const region=Object.hasOwn(root.CBM2Risk.regions,ui.region)?ui.region:service.region;return {source,services,service,region};}
  function recovery(a,model,ui){return root.CBUnifiedUI.recovery(a,model,ui);}
  // Geographic browsing, not a calibrated conflict impact footprint or capacity ranking.
  const hubs=[['美国东部',-77.5,39],['西欧',8.7,50.1],['中国北部',116.4,39.9],['中国东部',121.5,31.2],['新加坡',103.8,1.3],['日本',139.7,35.7],['澳大利亚',151.2,-33.9],['巴西',-46.6,-23.6]];
  const lonDistance=(a,b)=>Math.abs(((a-b+540)%360)-180);
  function nearby(records,center,span){return center?records.filter(r=>root.CBExposureCatalog.located(r)&&lonDistance(r.representativeLonLat[0],center[0])<=span&&Math.abs(r.representativeLonLat[1]-center[1])<=span):[];}
  function unproject(x,y){let low=-90,high=90;for(let i=0;i<50;i++){const mid=(low+high)/2;if(project(0,mid)[1]>y)low=mid;else high=mid;}const lat=(low+high)/2,lon=(x-480)/(project(180,lat)[0]-480)*180;return Math.abs(lon)<=180&&y>=12&&y<=468?[lon,lat]:null;}
  const facilityType=r=>r.infrastructureType||'cloud-region';
  const typeLabels={'cloud-region':'云区域','classic-datacenter':'经典数据中心','edge-pop':'边缘节点'};
  const typeOrder={'cloud-region':0,'classic-datacenter':1,'edge-pop':2};
  function neighborhood(ui){const span=[15,25,40].includes(Number(ui.exposureSpan))?Number(ui.exposureSpan):25,center=ui.exposureCenter;
    const records=root.CBExposureCatalog.filter({}).filter(root.CBExposureCatalog.located),rows=(center?nearby(records,center,span):records).slice().sort((a,b)=>(typeOrder[facilityType(a)]??3)-(typeOrder[facilityType(b)]??3)||a.id.localeCompare(b.id));
    const groups=new Map();for(const r of rows){const point=project(...r.representativeLonLat),match=[...groups.entries()].find(([,rs])=>{const anchor=project(...rs[0].representativeLonLat);return Math.hypot(point[0]-anchor[0],point[1]-anchor[1])<Math.max(.015,(center?26:40)*(Number(ui.evidenceViewportWidth)||(center?300:960))/960);});if(match)match[1].push(r);else groups.set(r.representativeLonLat.map(n=>n.toFixed(2)).join(','),[r]);}
    return {span,center,rows,groups,records};
  }
  function neighborhoodPins(n,ui,width){const k=width/800;
    return [...n.groups.entries()].map(([key,rs])=>{const [x,y]=project(...rs[0].representativeLonLat),kind=rs.length>1&&rs.some(r=>facilityType(r)!=='edge-pop')?'cluster':facilityType(rs[0]),selected=rs.some(r=>r.id===ui.evidenceRegion),cloud=kind==='cloud-region'||kind==='cluster',edge=kind==='edge-pop';
      const radius=(cloud?Math.min(15,6+Math.sqrt(rs.length)*.9):edge?Math.min(5,2.8+Math.log2(rs.length)*.55):Math.min(10,4.5+Math.sqrt(rs.length)*.7))*k;
      const counts=Object.keys(typeLabels).map(type=>[type,rs.filter(r=>facilityType(r)===type).length]).filter(([,v])=>v),label=counts.map(([type,v])=>typeLabels[type]+' '+v).join(' · '),names=[...new Set(rs.map(r=>r.provider))].join(' / ');
      return `<g class="nearby-facility facility-${kind} ${selected?'is-selected':''}" data-exposure-group="${key}" data-facility-type="${kind}" data-entry-count="${rs.length}" role="button" tabindex="0" aria-label="${esc(label+' · '+names)}"><title>${esc(label)}
${esc(names)}</title><circle cx="${x}" cy="${y}" r="${Math.max(radius+2*k,10*k)}" fill="transparent"/>${selected?`<circle cx="${x}" cy="${y}" r="${radius+4*k}" fill="none" stroke="#83b0cf" stroke-opacity=".6" stroke-width="${k}"/>`:''}<circle class="facility-symbol" cx="${x}" cy="${y}" r="${radius}" fill="${cloud?'#dcebf5':edge?'#a8b8c4':'#668fac'}" fill-opacity="${cloud?'.82':'.95'}" stroke="${cloud?'#6596b8':'#fff'}" stroke-width="${(cloud?1.2:1)*k}"/>${rs.length>1&&!edge?`<text x="${x}" y="${y+3*k}" text-anchor="middle" font-size="${9*k}" font-weight="600" fill="${cloud?'#376b91':'#fff'}" pointer-events="none">${rs.length}</text>`:cloud?`<circle cx="${x}" cy="${y}" r="${2*k}" fill="#6596b8" pointer-events="none"/>`:''}</g>`;}).join('');
  }
  function facilityLegend(){return `<div class="facility-legend"><span><i class="legend-cluster">n</i>区域聚合</span><span><i class="legend-cloud"></i>云区域</span><span><i class="legend-datacenter"></i>经典数据中心</span><span><i class="legend-edge"></i>边缘节点</span><small>圆圈大小表示聚合数量</small></div>`;}
  function neighborhoodDetail(n,ui){if(!n.center)return `<span class="evidence-badge">全球总览</span><h3>全球设施分布</h3><p class="exposure-empty">点击设施圆点展开，滚轮或双指缩放地图。</p><div class="facility-overview-stats">${Object.entries(typeLabels).map(([type,label])=>`<div><span><i class="type-dot type-${type}"></i>${label}</span><b>${n.records.filter(r=>facilityType(r)===type).length}</b></div>`).join('')}</div><details class="facility-quick-nav"><summary>快速定位</summary><div class="exposure-hub-links">${hubs.map(([name,x,y])=>`<button data-exposure-hub="${x},${y}">${name} ↗</button>`).join('')}</div></details><p class="evidence-note">按设施类型分层，非容量或机房等级排名。</p>`;
    const focused=ui.exposureGroup?n.groups.get(ui.exposureGroup):null,rows=focused||n.rows,selected=n.rows.find(r=>r.id===ui.evidenceRegion);
    return `<span class="evidence-badge">周边设施</span><h3>${n.rows.length} <span>条目录记录</span></h3><p class="evidence-code"><span>经纬度各 ±</span> ${n.span}° · <span>现行目录</span></p>${focused?`<div class="nearby-list-heading"><span>邻近合并目录</span><b>${rows.length}</b><button data-exposure-show-all>查看周边全部</button></div>`:''}<div class="nearby-facility-list">${rows.map(r=>`<button data-evidence-region="${esc(r.id)}" class="${r.id===ui.evidenceRegion?'active':''}"><strong data-no-translate>${esc(r.provider+' · '+r.code)}</strong><span data-no-translate>${esc(r.name)}</span><small>${r.infrastructureType==='edge-pop'?'边缘节点':r.infrastructureType==='classic-datacenter'?'经典数据中心':'云区域'}</small></button>`).join('')||'<p class="exposure-empty">此范围内暂无可定位设施，可扩大检索范围。</p>'}</div>${selected?`<details class="nearby-facility-detail" open><summary>所选设施</summary>${root.CBExposureCatalog.detail(selected)}</details>`:''}<p class="evidence-note">邻近用于地图检索，不代表设施已受事件影响。</p>`;
  }
  function render(a,model,ui){
    const noticeMode=false,history=root.CBHazardHistory.scope(ui),year=String(history.year),layer=ui.m2Layer||'hazard',type=Number(ui.evidenceType)||0,provider=ui.evidenceProvider||'all',focus=ui.evidenceFocus||'world';
    const data=history.data,divisor=history.divisor,cells=data.cells.filter(c=>count(c.n,type)>0),ranked=[...cells].sort((a,b)=>count(b.n,type)-count(a.n,type));
    let selected=cells.find(c=>`${c.x},${c.y}`===ui.evidenceCell)||ranked[0];
    const insured=context(a,model,ui).services.filter(s=>(ui.exposureServices||[]).includes(s.id)),areas=[...new Set(insured.map(s=>s.region))];
    const n=neighborhood(ui);
    const records=root.CBExposureCatalog.filter(ui);let region=records.find(r=>r.id===ui.evidenceRegion)||records[0];
    const f=focuses[focus]||focuses.world;let center=project(f[1],f[2]),width=f[3];
    const inFocus=([x,y])=>focus==='world'||Math.abs(x-center[0])<width/2&&Math.abs(y-center[1])<width/4;
    const focusRanked=ranked.filter(c=>inFocus(project(c.x+.5,c.y+.5)));
    if(!ui.evidenceCell)selected=focusRanked[0]||selected;
    if(!ui.evidenceRegion)region=records.find(r=>root.CBExposureCatalog.located(r)&&inFocus(project(...r.representativeLonLat)))||region;
    if(ui.evidenceCenter==='selected'){if(layer==='exposure'&&areas.length&&root.CBWorldMap.points[areas[0]])center=root.CBWorldMap.points[areas[0]];else if(cells.some(c=>`${c.x},${c.y}`===ui.evidenceCell))center=project(selected.x+.5,selected.y+.5);else if(areas.length&&root.CBWorldMap.points[areas[0]])center=root.CBWorldMap.points[areas[0]];}
    if(focus==='world'&&ui.evidenceCenter!=='selected')center=[480,250];
    if(layer==='exposure'&&n.center){center=project(...n.center);width=Math.min(960,Math.max(220,(project(0,Math.max(-89,n.center[1]-n.span))[1]-project(0,Math.min(89,n.center[1]+n.span))[1])*2.25));}
    if(ui.evidenceViewportCenter)center=ui.evidenceViewportCenter;
    width=Math.max(12,Math.min(960,Number(ui.evidenceViewportWidth)||(width/Math.pow(1.6,Number(ui.evidenceZoom)||0))));const height=width*.50;
    const viewBox=`${center[0]-width/2} ${center[1]-height/2} ${width} ${height}`;
    const cellPath=c=>[[c.x,c.y],[c.x+1,c.y],[c.x+1,c.y+1],[c.x,c.y+1]].map(([x,y],i)=>`${i?'L':'M'}${project(x,y).map(v=>v.toFixed(3)).join(',')}`).join('')+'Z';
    const hasSelected=cells.some(c=>`${c.x},${c.y}`===ui.evidenceCell);
    const heat=noticeMode?root.CBExternal.noticePins(ui,project,width):cells.map(c=>{const id=`${c.x},${c.y}`,is=id===ui.evidenceCell;return `<g data-evidence-cell="${id}" role="button" aria-pressed="${is}" tabindex="${is||(!ui.evidenceCell&&c===selected)?0:-1}" aria-label="${esc(c.countries.join(', '))} · ${id} · ${num(count(c.n,type)/divisor)}"><title>${esc(c.countries.join(', '))} · ${id} · ${num(count(c.n,type)/divisor)}</title><path d="${cellPath(c)}" fill="${fill(count(c.n,type)/divisor)}" fill-opacity="${layer==='exposure'&&!is?'.58':'.95'}" stroke="${is?'#286b9b':'#ffffff'}" stroke-width="${is?'1.7':'.15'}" vector-effect="non-scaling-stroke"/></g>`;}).join('');
    const missingSelected=ui.evidenceCell&&!hasSelected?root.CBHazardHistory.aggregate(history.all).cells.find(c=>`${c.x},${c.y}`===ui.evidenceCell):null;
    const selectionOutline=!noticeMode&&missingSelected?`<g data-evidence-cell="${ui.evidenceCell}" role="button" tabindex="0" aria-pressed="true" aria-label="${esc(ui.evidenceCell)} · 0"><path d="${cellPath(missingSelected)}" fill="transparent" stroke="#286b9b" stroke-width="1.7" vector-effect="non-scaling-stroke"/></g>`:'';
    // Policy region markers: one per selected region, never one per public facility.
    const pins=areas.map(id=>{const point=root.CBWorldMap.points[id];if(!point)return '';const [x,y]=point,r=root.CBData.regions.find(r=>r.id===id),services=insured.filter(s=>s.region===id),scale=Math.min(1,width/550);return `<g class="insured-exposure-marker" data-insured-region="${esc(id)}" pointer-events="none"><title>${esc(r?.name||id)} · ${esc(services.map(s=>s.provider+' '+s.service).join(' / '))}</title><circle cx="${x}" cy="${y}" r="${24*scale}" fill="#659bc2" fill-opacity=".16" stroke="#4a86b1" stroke-width="1.4" vector-effect="non-scaling-stroke"/><circle cx="${x}" cy="${y}" r="${3*scale}" fill="#4a86b1"/><text x="${x+28*scale}" y="${y+3*scale}" font-size="${10*scale}" fill="#35698f" stroke="#f7f9fb" stroke-width="${3*scale}" paint-order="stroke" data-no-translate>${esc(r?.name||id)} · ${services.length}</text></g>`;}).join('');
    const exposureDetail=`<span class="evidence-badge">列明承保区域</span><h3>${insured.length} <span>项列明服务</span> · ${areas.length} <span>个区域</span></h3>${insured.length?`<div class="insured-exposure-list">${areas.map(id=>`<div><strong>${esc(root.CBData.regions.find(r=>r.id===id)?.name||id)}</strong>${insured.filter(s=>s.region===id).map(s=>`<span data-user-text>${esc(s.provider+' · '+s.service)}</span><small data-user-text>${esc(s.business)}</small>${root.CBExternal.dependency(s)}`).join('')}</div>`).join('')}</div><p class="evidence-note">标记表示列明承保区域，不是具体设施地址。</p>`:'<p class="exposure-empty">勾选下方列明服务，查看对应区域的风险暴露。</p>'}`;
    const detail=layer==='exposure'?neighborhoodDetail(n,ui)+(insured.length?`<details class="insured-selected-details"><summary>列明承保区域</summary>${exposureDetail}</details>`:''):noticeMode?root.CBExternal.noticeDetail(ui):root.CBHazardHistory.detail(ui,history,type);
    return `<div class="m2-explorer evidence-explorer risk-explorer"><div class="map-toolbar"><div class="segmented" aria-label="风险模块"><button data-map="m1">M1 普通中断</button><button class="active" data-map="m2">M2 外部事件中断</button></div><span class="m2-model-label">${noticeMode?'OFAC · GitHub · Amazon':'UCDP GED 26.1 · 2016–2025'}</span></div>
      <div class="m2-layer-tabs" role="tablist" aria-label="M2风险图层">${layers.map(([id,n,title,sub])=>`<button role="tab" aria-selected="${layer===id}" aria-controls="m2-layer-panel" id="m2-tab-${id}" tabindex="${layer===id?0:-1}" class="${layer===id?'active':''}" data-m2-layer="${id}"><span>${n}</span><div><strong>${title}</strong><small>${sub}</small></div></button>`).join('')}</div>
      <div id="m2-layer-panel" role="tabpanel" aria-labelledby="m2-tab-${layer}">${layer==='recovery'?recovery(a,model,ui):`
        <div class="m2-controls evidence-controls">${noticeMode?'':select('观察窗口','evidenceWindow',history.mode,[['5','近五年基准（2021–2025）'],['10','近十年对照（2016–2025）'],['single','单年查询']])}${!noticeMode&&history.annual?select('统计年度','evidenceYear',year,[...history.all].reverse().map(y=>[y,String(y)])):''}${noticeMode?'':select('事件类型','evidenceType',type,types.map((s,i)=>[i,s]))}${select('地图范围','evidenceFocus',focus,Object.entries(focuses).map(([k,v])=>[k,v[0]]))}</div>
        
        ${layer==='exposure'?`<div class="exposure-browse-controls">${n.center?select('周边检索范围','exposureSpan',n.span,[[15,'经纬度各 ±15°'],[25,'经纬度各 ±25°'],[40,'经纬度各 ±40°']]):''}<span>${n.center?'周边设施':'可定位目录'}</span><strong>${n.rows.length}</strong>${n.center?'<button class="text-btn" data-exposure-overview>返回全球总览</button>':''}</div><div class="exposure-selection-bar"><span>已勾选服务</span><strong>${insured.length}</strong><span>承保区域</span><strong>${areas.length}</strong><a href="#insured-service-list" data-exposure-scroll>选择列明服务 ↓</a></div>`:noticeMode?'':`<div class="evidence-summary"><div><span>${history.annual?'所选年度 · 全球事件':'全球年均事件'}</span><strong>${num(count(data.total,type)/divisor)}</strong></div><div><span>${history.annual?'纳入精细热图':'年均纳入热图'}</span><strong>${num(count(data.included,type)/divisor)}</strong></div><div><span>${history.annual?'位置精度不足 · 未入图':'年均未入图 · 位置精度不足'}</span><strong>${num(count(data.excluded,type)/divisor)}</strong></div></div>`}
        <div class="m2-map-layout"><div class="evidence-map-column"><div class="evidence-map-actions"><span><span>${noticeMode?'公开公告 · 国家示意位置':history.period+' · 1° × 1° · '+(history.annual?'网格事件数':'年均事件数')}</span> <small class="map-drag-hint">· 拖动 / 双指缩放</small></span><div>${ui.mapHistory?.length?'<button data-map-back>返回上一级</button>':''}<button data-evidence-zoom="-1" aria-label="缩小地图">−</button><button data-evidence-zoom="1" aria-label="放大地图">＋</button><button data-evidence-center="selected" ${!ui.evidenceCell&&!areas.length&&!n.center?'disabled':''}>定位所选</button><button data-evidence-center="reset">重置</button></div></div>
          <svg class="evidence-world" viewBox="${viewBox}" role="group" aria-label="历史冲突事件与公开云区域地图"><defs><clipPath id="evidence-world-clip"><path d="${root.CBWorldMap.sphere}"/></clipPath></defs><g clip-path="url(#evidence-world-clip)">${baseMap()}${heat}${selectionOutline}${layer==='exposure'?neighborhoodPins(n,ui,width):''}${pins}</g></svg>
          ${layer==='exposure'?facilityLegend():''}<div class="evidence-legend">${noticeMode?'':(history.annual?[[1,'1–4'],[5,'5–19'],[20,'20–99'],[100,'100–499'],[500,'500+']]:[[1,'>0–<5'],[5,'5–<20'],[20,'20–<100'],[100,'100–<500'],[500,'≥500']]).map(([v,s])=>`<span><i style="background:${fill(v)}"></i>${s}</span>`).join('')}<span>${noticeMode?'公开公告 ≠ 客户实际中断':'历史事件数 ≠ 中断概率'}</span></div>

        </div><aside class="m2-layer-detail evidence-detail">${detail}</aside></div>`}</div>

      <details class="evidence-provenance" open><summary>数据来源、位置精度与模型连接</summary>${noticeMode?root.CBExternal.directory(ui):root.CBEventDirectory.shell(history.years,type,ui.evidenceCell)}<details class="event-method" data-exposure-catalog ${ui.exposureCatalogOpen?'open':''}><summary>公开设施资料</summary>${root.CBExposureCatalog.controls(ui,records,region)}${root.CBExposureCatalog.summary(records)}${root.CBExposureCatalog.detail(region)}${root.CBExposureCatalog.coverage()}</details><details class="event-method"><summary>来源与方法</summary>${sourcePanel()}<div class="evidence-chain"><span>地缘政治冲突</span><b>→</b><span>数字依赖受损</span><b>→</b><span>列明服务中断</span><b>→</b><span>业务损失与赔款</span></div><p>已取得冲突观测与公开区域资料；中间因果链、恢复分布与承保条件仍需验证。定价参数暂保留情景假设，热图筛选不改变报价。</p></details></details>
      <div class="evidence-pricing-link"><span>风险证据 → 年度赔款分布 → 四层定价</span><button class="text-btn" data-uwtab="pricing">查看定价明细 →</button></div>
    </div>`;
  }
  // Keep active pointer gestures on one SVG; regroup facilities only after zoom ends.
  let releaseGesture=null;
  function bindPan(svg,ui,onCommit){
    releaseGesture?.();if(!svg)return;
    const controller=new AbortController(),signal=controller.signal,points=new Map();
    let base=null,dirty=false,wheelTimer=null,nativeGesture=null;
    const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal});
    const box=()=>{const b=svg.viewBox.baseVal;return {x:b.x,y:b.y,w:b.width,h:b.height};};
    const middle=()=>{const p=[...points.values()];return p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:{...p[0],d:0};};
    const transform=(p,m)=>new DOMPoint(p.x,p.y).matrixTransform(m);
    const suppress=()=>{ui.mapSuppressClickUntil=Date.now()+500;};
    function snapshot(){const matrix=svg.getScreenCTM();if(!matrix||!points.size){base=null;return;}const mid=middle();base={box:box(),inverse:matrix.inverse(),mid};base.anchor=transform(mid,base.inverse);}
    function write(x,y,w){w=Math.max(12,Math.min(960,w));const h=w/2,cx=Math.max(0,Math.min(960,x+w/2)),cy=Math.max(12,Math.min(468,y+h/2));
      ui.evidenceViewportCenter=[cx,cy];ui.evidenceViewportWidth=w;ui.evidenceZoom=0;
      svg.setAttribute('viewBox',`${cx-w/2} ${cy-h/2} ${w} ${h}`);dirty=true;
    }
    function anchoredZoom(b,anchor,position,width){const w=Math.max(12,Math.min(960,width)),u=(position.x-b.x)/b.w,v=(position.y-b.y)/b.h;write(anchor.x-u*w,anchor.y-v*w/2,w);}
    function commit(){clearTimeout(wheelTimer);wheelTimer=null;if(points.size||nativeGesture||!dirty)return;dirty=false;svg.classList.remove('is-dragging');if(ui.m2Layer==='exposure'){const b=box();if(b.w>=750){ui.exposureCenter=null;ui.exposureGroup=null;}else{const location=unproject(b.x+b.w/2,b.y+b.h/2);if(location)ui.exposureCenter=location;}}onCommit?.();}
    listen(svg,'click',e=>{if(e.detail!==0&&Date.now()<(ui.mapSuppressClickUntil||0)){e.preventDefault();e.stopPropagation();}}, {capture:true});
    listen(svg,'pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      clearTimeout(wheelTimer);wheelTimer=null;if(!points.size)ui.mapSuppressClickUntil=0;
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});snapshot();
      if(points.size>1){e.preventDefault();suppress();for(const id of points.keys())try{svg.setPointerCapture(id);}catch{}}
    });
    listen(window,'pointermove',e=>{
      if(!points.has(e.pointerId)||!base)return;
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});const mid=middle();
      if(points.size===1&&Math.hypot(mid.x-base.mid.x,mid.y-base.mid.y)<5&&!svg.classList.contains('is-dragging'))return;
      e.preventDefault();suppress();svg.classList.add('is-dragging');for(const id of points.keys())try{svg.setPointerCapture(id);}catch{}
      const at=transform(mid,base.inverse);
      if(points.size>1&&base.mid.d>0)anchoredZoom(base.box,base.anchor,at,base.box.w*base.mid.d/Math.max(1,mid.d));
      else write(base.box.x-(at.x-base.anchor.x),base.box.y-(at.y-base.anchor.y),base.box.w);
    },{passive:false});
    function finish(e){if(!points.has(e.pointerId))return;points.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(points.size)snapshot();else{base=null;svg.classList.remove('is-dragging');commit();}}
    listen(window,'pointerup',finish);listen(window,'pointercancel',finish);listen(svg,'lostpointercapture',e=>{if(e.target===svg)finish(e);});
    listen(window,'blur',()=>{points.clear();base=null;nativeGesture=null;suppress();commit();});
    listen(svg,'wheel',e=>{
      e.preventDefault();if(points.size||nativeGesture)return;
      const matrix=svg.getScreenCTM();if(!matrix)return;const b=box(),anchor=transform({x:e.clientX,y:e.clientY},matrix.inverse());
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);
      anchoredZoom(b,anchor,anchor,b.w*Math.exp(Math.max(-250,Math.min(250,delta))*(e.ctrlKey ? .008 : .002)));
      suppress();clearTimeout(wheelTimer);wheelTimer=setTimeout(commit,160);
    },{passive:false});
    // Safari trackpad pinch uses GestureEvents instead of ctrl+wheel.
    listen(svg,'gesturestart',e=>{e.preventDefault();if(points.size)return;clearTimeout(wheelTimer);const matrix=svg.getScreenCTM();if(!matrix)return;const r=svg.getBoundingClientRect(),x=Number.isFinite(e.clientX)?e.clientX:r.x+r.width/2,y=Number.isFinite(e.clientY)?e.clientY:r.y+r.height/2;nativeGesture={box:box(),anchor:transform({x,y},matrix.inverse())};suppress();},{passive:false});
    listen(svg,'gesturechange',e=>{e.preventDefault();if(nativeGesture){const g=nativeGesture;anchoredZoom(g.box,g.anchor,g.anchor,g.box.w/Math.max(.05,Number(e.scale)||1));}},{passive:false});
    listen(svg,'gestureend',e=>{e.preventDefault();nativeGesture=null;suppress();commit();},{passive:false});
    releaseGesture=()=>{controller.abort();clearTimeout(wheelTimer);for(const id of points.keys())if(svg.hasPointerCapture(id))svg.releasePointerCapture(id);points.clear();svg.classList.remove('is-dragging');releaseGesture=null;};
  }
  root.CBM2Map={baseMap,render,context,project,unproject,nearby,neighborhood,sourcePanel,bindPan,comparison:()=>sourcePanel()};
})(window);
