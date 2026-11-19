/* Presentation-only localization. Stored business values and calculation inputs stay canonical. */
(function () {
  'use strict';
  const key='cloudbridge-language', messages=window.CBLocaleMessages;
  const languages=[['zh-CN','简体中文','中文'],['en','English','EN'],['ko','한국어','KO'],['ja','日本語','JA']];
  let lang='zh-CN';
  try {const saved=localStorage.getItem(key);if(languages.some(x=>x[0]===saved))lang=saved;} catch {}
  const index=()=>({en:0,ko:1,ja:2}[lang]);
  const records=new WeakMap(), attributes=new WeakMap(), values=new WeakMap();
  const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const phraseRE=new RegExp(Object.keys(messages).filter(s=>s.length>1).sort((a,b)=>b.length-a.length).map(escapeRE).join('|'),'g');
  const patterns=(window.CBLocalePatterns||[]).map(([source,...translations])=>({
    source,re:new RegExp('^'+source.split(/(\{\d+\})/).map(s=>/^\{\d+\}$/.test(s)?'(.+?)':escapeRE(s)).join('')+'$'),translations
  })).sort((a,b)=>b.source.replace(/\{\d+\}/g,'').length-a.source.replace(/\{\d+\}/g,'').length);
  function t(value,exact=false){
    const text=String(value??'');if(lang==='zh-CN')return text;
    const source=text.trim();let result=messages[source]?.[index()];
    if(result===undefined){
      for(const p of patterns){if(exact&&!p.source.startsWith('{0}笔最终'))continue;const match=source.match(p.re);if(match){result=p.translations[index()].replace(/\{(\d+)\}/g,(_,n)=>t(match[Number(n)+1]));break;}}
    }
    if(result===undefined&&!exact){
      // Never expose a partly translated sentence. Track unmatched source text,
      // rather than testing the output (Japanese translations also contain Han).
      let remainder='',last=0;
      result=source.replace(phraseRE,(k,offset)=>{remainder+=source.slice(last,offset);last=offset+k.length;return messages[k][index()];});
      remainder+=source.slice(last);
      remainder=remainder.replace(/(\d[\d,.]*)\s*(分钟|小时|元)/g,'');
      if(/[\u3400-\u9fff]/u.test(remainder))return text;
      result=result.replace(/(\d[\d,.]*)\s*分钟/g,'$1 '+['min','분','分'][index()])
        .replace(/(\d[\d,.]*)\s*小时/g,'$1 '+['hours','시간','時間'][index()])
        .replace(/(\d[\d,.]*)元/g,(_,n)=>'CNY '+n)
        .replace(/¥\s*/g,'CNY ');
    }
    if(result===undefined)return text;
    return text.slice(0,text.length-text.trimStart().length)+result+text.slice(text.trimEnd().length);
  }
  function translateNode(node){
    const old=records.get(node),source=old&&old.output===node.nodeValue?old.source:node.nodeValue;
    const output=t(source,!!node.parentElement?.closest('[data-user-text]'));
    records.set(node,{source,output});if(output!==node.nodeValue)node.nodeValue=output;
  }
  function apply(root=document.body){
    observer?.disconnect();
    if(root.nodeType===Node.TEXT_NODE){translateNode(root);}else{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode;
        if(!node.parentElement?.closest('script,style,textarea,[data-no-translate]'))translateNode(node);
      }
      const els=[...(root.matches?.('*')?[root]:[]),...root.querySelectorAll('*')];
      for(const el of els){
        if(el.closest('[data-no-translate]'))continue;
        for(const attr of ['aria-label','title','placeholder','alt']){
          if(!el.hasAttribute(attr))continue;
          const map=attributes.get(el)||{},old=map[attr],current=el.getAttribute(attr);
          const source=old&&old.output===current?old.source:current,output=t(source);
          map[attr]={source,output};attributes.set(el,map);if(output!==current)el.setAttribute(attr,output);
        }
        // Translate known sample field values for display only. Never dispatch input/change.
        if(el.matches('input[type=text],textarea')){
          const old=values.get(el),source=old&&old.output===el.value?old.source:el.value;
          const output=t(source,true);values.set(el,{source,output});if(el.value!==output)el.value=output;
        }
      }
    }
    if(root.isConnected)fitMapLabels();
    observer?.observe(document.body,{subtree:true,childList:true,characterData:true});
  }
  function canonicalValue(el){const v=values.get(el);return v&&v.output===el.value?v.source:el.value;}
  function fitMapLabels(){
    document.querySelectorAll('.geo-pin,.m2-pin').forEach(pin=>{
      const text=pin.querySelector('text'),rect=pin.querySelector('rect');if(!text||!rect)return;
      const width=Math.max(pin.classList.contains('m2-pin')?126:66,Math.ceil(text.getComputedTextLength())+22);
      rect.setAttribute('width',width);rect.setAttribute('x',Number(text.getAttribute('x'))-width/2);
    });
  }
  const globe='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>';
  function controlHTML(){return `<div class="language-control" data-no-translate><button type="button" class="language-trigger" id="language-trigger" aria-haspopup="menu" aria-controls="language-menu" aria-expanded="false" aria-label="${t('界面语言')}">${globe}<span><small>${t('语言设置')}</small><strong>${languages.find(x=>x[0]===lang)[1]}</strong></span><svg class="language-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg></button><div class="language-menu" id="language-menu" role="menu" aria-label="${t('界面语言')}" hidden>${languages.map(([code,name,short])=>`<button type="button" role="menuitemradio" aria-checked="${lang===code}" data-language="${code}" lang="${code}" tabindex="-1"><span>${name}</span><small>${lang===code?'✓':short}</small></button>`).join('')}</div></div>`;}
  function closeMenu(focus=false){const trigger=document.getElementById('language-trigger'),menu=document.getElementById('language-menu');if(menu)menu.hidden=true;trigger?.setAttribute('aria-expanded','false');if(focus)trigger?.focus();}
  function openMenu(){window.CBSelectUI?.close();const trigger=document.getElementById('language-trigger'),menu=document.getElementById('language-menu');if(!menu)return;menu.hidden=false;trigger.setAttribute('aria-expanded','true');menu.querySelector('[aria-checked=true]').focus();}
  function setLanguage(next){
    if(!languages.some(x=>x[0]===next))return;
    window.CBSelectUI?.close();
    lang=next;try{localStorage.setItem(key,lang);}catch{}
    document.documentElement.lang=lang;document.title='CloudBridge · '+t('跨境数字服务中断保险');
    document.querySelector('meta[name=description]')?.setAttribute('content',t('跨境数字服务中断保险'));
    apply();
    const host=document.querySelector('.sidebar-bottom');if(host)host.innerHTML=controlHTML();
    document.getElementById('language-trigger')?.focus({preventScroll:true});
    window.dispatchEvent(new CustomEvent('cloudbridge:language',{detail:lang}));
  }
  function html(source){const d=new DOMParser().parseFromString(source,'text/html');apply(d.body);d.documentElement.lang=lang;d.title=t(d.title);return '<!DOCTYPE html>\n'+d.documentElement.outerHTML;}
  let observer=null;
  window.CBI18n={t,apply,controlHTML,canonicalValue,setLanguage,html,get language(){return lang;},get locale(){return {en:'en-US',ko:'ko-KR',ja:'ja-JP','zh-CN':'zh-CN'}[lang];}};
  document.documentElement.lang=lang;
  document.title='CloudBridge · '+t('跨境数字服务中断保险');
  document.addEventListener('click',e=>{
    const option=e.target.closest('[data-language]');if(option){setLanguage(option.dataset.language);return;}
    if(e.target.closest('#language-trigger')){document.getElementById('language-menu').hidden?openMenu():closeMenu();return;}
    if(!e.target.closest('.language-control'))closeMenu();
  });
  document.addEventListener('keydown',e=>{
    const menu=document.getElementById('language-menu');
    if(e.target.closest('#language-trigger')&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();openMenu();return;}
    if(!menu||menu.hidden||!e.target.closest('.language-control'))return;
    if(e.key==='Escape'){e.preventDefault();closeMenu(true);return;}
    if(e.key==='Tab'){closeMenu();return;}
    if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();const opts=[...menu.querySelectorAll('button')],i=opts.indexOf(document.activeElement);
      opts[e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowDown'?1:3))%4].focus();
    }
  });
  observer=new MutationObserver(()=>apply());
  apply();
})();
