/* Local, accessible select presentation. Native selects remain the data source. */
(function () {
  'use strict';
  let opened=null,typeBuffer='',typeTimer;
  const glyphs={
    industry:'M4 21V9l8-6 8 6v12M9 21v-7h6v7M8 10h.01M16 10h.01',
    clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    cloud:'M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11 1 4.5 4.5 0 0 1 0 9Z',
    globe:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20',
    shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6',
    layers:'m12 3 10 5-10 5L2 8ZM2 12l10 5 10-5M2 16l10 5 10-5'
  };
  const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  function close(){
    if(!opened)return;
    opened.button.setAttribute('aria-expanded','false');
    opened.button.removeAttribute('aria-activedescendant');
    opened.button.removeAttribute('aria-controls');
    opened.menu.remove();opened=null;typeBuffer='';clearTimeout(typeTimer);
  }
  function position(){
    if(!opened)return;
    const {button,menu}=opened;
    if(!button.isConnected){close();return;}
    const r=button.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight;
    if(r.bottom<0||r.top>vh){close();return;}
    const width=Math.min(Math.max(r.width,220),vw-24),desired=Math.min(menu.scrollHeight,288),below=vh-r.bottom-12,above=r.top-12;
    const up=below<desired&&above>below,height=Math.max(60,Math.min(desired,up?above:below));
    Object.assign(menu.style,{width:width+'px',maxHeight:height+'px',left:Math.max(12,Math.min(r.left,vw-width-12))+'px',top:(up?r.top-height-6:r.bottom+6)+'px'});
  }
  function highlight(index){
    if(!opened)return;
    const {select,button,menu}=opened,options=[...select.options];
    index=Math.max(0,Math.min(index,options.length-1));
    opened.active=index;
    [...menu.children].forEach((item,i)=>item.classList.toggle('is-active',i===index));
    const item=menu.children[index];
    button.setAttribute('aria-activedescendant',item.id);
    item.scrollIntoView({block:'nearest'});
  }
  function commit(index){
    if(!opened||opened.select.options[index]?.disabled)return;
    const {select,button}=opened,key=button.dataset.selectKey;
    const changed=select.selectedIndex!==index;
    select.selectedIndex=index;close();
    if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));
    const replacement=[...document.querySelectorAll('.select-trigger')].find(x=>x.dataset.selectKey===key);
    (replacement||button).focus({preventScroll:true});
  }
  function open(select,button,initial){
    close();if(select.disabled)return;
    const menu=document.createElement('div');menu.className='select-menu';menu.id=button.id+'-list';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',button.getAttribute('aria-label'));
    [...select.options].forEach((option,index)=>{
      const item=document.createElement('div');item.className='select-option';item.id=menu.id+'-'+index;item.setAttribute('role','option');item.setAttribute('aria-selected',String(index===select.selectedIndex));
      if(option.disabled)item.setAttribute('aria-disabled','true');
      const text=document.createElement('span');text.textContent=option.textContent;item.append(text);
      if(index===select.selectedIndex){item.classList.add('is-selected');item.insertAdjacentHTML('beforeend',svg('m5 12 4 4L19 6'));}
      item.addEventListener('pointerdown',event=>event.preventDefault());
      item.addEventListener('click',()=>commit(index));
      menu.append(item);
    });
    // Keep the menu in a dialog's top layer when a dialog owns the field.
    (button.closest('dialog')||document.body).append(menu);
    opened={select,button,menu,active:select.selectedIndex};button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',menu.id);
    position();highlight(initial??select.selectedIndex);
  }
  function enhance(root){
    root.querySelectorAll('select:not([data-enhanced])').forEach((select,index)=>{
      const field=select.closest('.field'),label=field?.querySelector('span')?.textContent||'选择选项';
      const key=['a','s','c','seg','m','r'].map(k=>select.dataset[k]?'data-'+k+':'+select.dataset[k]:'').filter(Boolean).join('|')||label+index;
      const name=/行业/.test(label)?'industry':/时间|等待/.test(label)?'clock':/区域|地区/.test(label)?'globe':/厂商/.test(label)?'cloud':/备份|保障|责任/.test(label)?'shield':'layers';
      // Replace the wrapping label so clicking the custom button does not activate the hidden native control.
      if(field?.tagName==='LABEL'){const div=document.createElement('div');div.className=field.className;while(field.firstChild)div.append(field.firstChild);field.replaceWith(div);}
      const button=document.createElement('button');button.type='button';button.className='select-trigger';button.id='cb-select-'+index;button.dataset.selectKey=key;button.disabled=select.disabled;
      button.setAttribute('role','combobox');button.setAttribute('aria-label',label);button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
      button.innerHTML=`<span class="select-leading">${svg(glyphs[name])}</span><span class="select-value"></span><span class="select-chevron">${svg('m7 10 5 5 5-5')}</span>`;
      button.querySelector('.select-value').textContent=select.selectedOptions[0]?.textContent||'请选择';
      const note=select.parentElement.querySelector('small');if(note){note.id=button.id+'-hint';button.setAttribute('aria-describedby',note.id);}
      select.dataset.enhanced='true';select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(button);
      button.addEventListener('click',()=>opened?.button===button?close():open(select,button));
      button.addEventListener('keydown',event=>{
        if(['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(event.key)){
          event.preventDefault();
          if(event.key==='Escape'){close();return;}
          if(event.key==='Enter'||event.key===' '){if(opened?.button===button)commit(opened.active);else open(select,button);return;}
          if(opened?.button!==button)open(select,button);
          const step=event.key==='ArrowDown'?1:-1;
          let next=event.key==='Home'?0:event.key==='End'?select.options.length-1:opened.active+step;
          while(select.options[next]?.disabled)next+=step;
          highlight(next);return;
        }
        if(event.key==='Tab'){close();return;}
        if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
          if(opened?.button!==button)open(select,button);
          clearTimeout(typeTimer);typeBuffer+=event.key.toLocaleLowerCase();typeTimer=setTimeout(()=>{typeBuffer='';},700);
          const match=[...select.options].findIndex(o=>!o.disabled&&o.textContent.toLocaleLowerCase().startsWith(typeBuffer));if(match>=0)highlight(match);
        }
      });
    });
  }
  document.addEventListener('pointerdown',event=>{if(opened&&!opened.button.contains(event.target)&&!opened.menu.contains(event.target))close();});
  document.addEventListener('focusin',event=>{if(opened&&!opened.button.contains(event.target)&&!opened.menu.contains(event.target))close();});
  window.addEventListener('resize',position);
  document.addEventListener('scroll',event=>{if(opened&&!opened.menu.contains(event.target))position();},true);
  window.CBSelectUI={enhance,close};
})();
