(function(root){
 'use strict';
 const cache=new Map(),pending=new Map(),size=5;let current={years:[],key:'',type:0,cell:'',page:0};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const types=['全部事件','国家型冲突','非国家冲突','单方面暴力'];
 const tr=x=>root.CBI18n?root.CBI18n.t(x):x;
 const period=years=>years.length===1?String(years[0]):years[0]+'–'+years.at(-1);
 function shell(years,type,cell){const values=(Array.isArray(years)?years:[Number(years)]).map(Number);return `<div id="event-directory" data-years="${values.join(',')}" data-type="${type}" data-cell="${esc(cell||'')}"><p>${cell?'正在加载事件目录…':'点击热图网格查看该区域的事件'}</p></div>`;}
 function rows(){return current.years.flatMap(year=>(cache.get(year)?.get(current.cell)||[]).filter(r=>!current.type||r[3]===current.type).map(r=>({r,year}))).sort((a,b)=>b.year-a.year||b.r[1].localeCompare(a.r[1])||Number(b.r[0])-Number(a.r[0]));}
 function paint(){const host=document.getElementById('event-directory');if(!host||current.key!==host.dataset.years||current.cell!==host.dataset.cell||current.years.some(y=>!cache.has(y)))return;
  const selected=rows(),pages=Math.max(1,Math.ceil(selected.length/size));current.page=Math.min(current.page,pages-1);
  const [x,y]=current.cell.split(',').map(Number);
  host.innerHTML=`<div class="event-directory-toolbar"><div><strong>具体事件目录</strong><p>UCDP GED 26.1 · ${period(current.years)} · <span>${types[current.type]}</span> · <b data-event-count>${selected.length.toLocaleString('en-US')}</b> <span>条记录</span></p></div><div class="event-cell-label"><span>所选网格</span><b data-no-translate>${x}° → ${x+1}° E · ${y}° → ${y+1}° N</b></div></div>
  <div class="table-wrap"><table><thead><tr><th>事件编号</th><th>日期区间</th><th>事件类型</th><th>地点与行政区</th><th>位置精度</th></tr></thead><tbody>${selected.slice(current.page*size,(current.page+1)*size).map(({r,year})=>`<tr data-event-id="${esc(r[0])}" data-event-year="${year}"><td>GED #${esc(r[0])}</td><td>${esc(r[1])}${r[2]!==r[1]?'<br>→ '+esc(r[2]):''}<small>${year} · date_prec ${r[8]}</small></td><td>${types[r[3]]}</td><td><span data-no-translate>${esc(r[6])}<small>${esc([r[5],r[4]].filter(Boolean).join(' · '))}</small></span></td><td>${r[7]}<small>${r[7]===1?'具体地点':'已知点周边'}</small></td></tr>`).join('')||'<tr><td colspan="5">该网格在当前时段及类型下没有事件</td></tr>'}</tbody></table></div>
  <div class="event-pagination"><span><b data-event-current>${current.page+1}</b> / <b data-event-pages>${pages}</b> <span>页</span> · <span>每页</span> ${size}</span><div class="event-page-controls"><button data-event-page="first" ${current.page===0?'disabled':''}>首页</button><button data-event-page="prev" ${current.page===0?'disabled':''}>上一页</button><button data-event-page="next" ${current.page>=pages-1?'disabled':''}>下一页</button><button data-event-page="last" ${current.page>=pages-1?'disabled':''}>末页</button><form data-event-jump-form><label><span>跳至</span><input type="number" data-event-jump aria-label="页码" min="1" max="${pages}" step="1" value="${current.page+1}" required><span>页</span></label><button type="submit">跳转</button></form></div></div>`;
  root.CBI18n?.apply();
 }
 async function load(year){if(cache.has(year))return;if(!pending.has(year))pending.set(year,(root.CBEventManifest&&location.protocol!=='file:'&&typeof DecompressionStream!=='undefined'?root.CBRiskAssets.json(root.CBEventManifest[year]):fetch(`events/${year}.json`).then(r=>{if(!r.ok)throw Error(r.status);return r.json();})).then(d=>{if(d.year!==year)throw Error('Wrong event year');const cells=new Map();for(const r of d.records){if(!r[9])continue;if(!cells.has(r[9]))cells.set(r[9],[]);cells.get(r[9]).push(r);}cache.set(year,cells);}).finally(()=>pending.delete(year)));await pending.get(year);}
 async function mount(){const host=document.getElementById('event-directory');if(!host)return;const key=host.dataset.years,years=key.split(',').map(Number),type=Number(host.dataset.type),cell=host.dataset.cell||'';
  if(current.key!==key||current.type!==type||current.cell!==cell)current={years,key,type,cell,page:0};
  if(!cell){root.CBI18n?.apply();return;}
  if(years.every(y=>cache.has(y))){paint();return;}
  try{await Promise.all(years.map(load));if(document.getElementById('event-directory')===host)paint();}
  catch{if(host.isConnected)host.innerHTML=`<p>${tr('事件目录加载失败，请重试。')}</p><button data-event-retry>${tr('重试')}</button>`;}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-event-page],[data-event-retry]');if(!b||b.disabled)return;if(b.hasAttribute('data-event-retry')){mount();return;}const last=Math.max(0,Math.ceil(rows().length/size)-1);current.page=b.dataset.eventPage==='first'?0:b.dataset.eventPage==='last'?last:Math.max(0,Math.min(last,current.page+(b.dataset.eventPage==='next'?1:-1)));paint();document.querySelector(`[data-event-page="${b.dataset.eventPage}"]`)?.focus({preventScroll:true});});
 document.addEventListener('submit',e=>{if(!e.target.matches('[data-event-jump-form]'))return;e.preventDefault();const input=e.target.querySelector('[data-event-jump]');if(!input.reportValidity())return;current.page=Number(input.value)-1;paint();document.querySelector('[data-event-jump]')?.focus({preventScroll:true});});
 root.CBEventDirectory={shell,mount};
})(window);
