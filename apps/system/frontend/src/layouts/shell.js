import { bindProfile } from '../features/sistema/sessao/profile.js';
import { initials,roleLabel } from '../features/sistema/sessao/client.js';
import { clearHeaderTabs } from '../components/navigation/header-tabs.js';
import { sections, sectionDefinition, pageDefinition, routeHash } from '../app/routes.js';
import { esc } from '../utils/presentation.js';
const paths={workflow:'M4 7h16m-4-4 4 4-4 4M20 17H4l4-4m-4 4 4 4',importacao:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',gerenciador:'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01',dashboards:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'};
const icon=key=>`<svg class="stroke-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[key]}"/></svg>`;
export function renderShell(ctx) {
  const {state}=ctx,sidebar=document.querySelector('#sidebar');
  const section=sectionDefinition(state.section),page=pageDefinition(state);
  document.querySelector('#breadcrumbSection').textContent=section.label;
  document.querySelector('#breadcrumbPage').textContent=page.label;
  document.title=`${page.label} · ${section.label} | ALLCREDIT FIDC System`;
  sidebar.innerHTML=`<div class="brand-rail"><a class="brand-logo" href="#dashboards/home" aria-label="All Credit · Home"><img src="/assets/allcredit-logo.png" alt="All Credit"></a><nav class="rail-nav" aria-label="Seções">${sections.map(({key,label})=>`<button type="button" class="rail-btn" data-section="${key}" title="${label}" aria-label="${label}" aria-controls="sectionPages">${icon(key)}</button>`).join('')}</nav><button class="mobile-menu-trigger" aria-label="Abrir menu" aria-expanded="false" aria-controls="sidebarPanel">☰</button><div class="rail-bottom"><button type="button" class="profile-avatar" data-profile-trigger aria-label="Conta de ${esc(ctx.usuario.login)}" aria-expanded="false" aria-controls="accountPopover">${esc(initials(ctx.usuario.login))}</button></div></div>
    <div class="sidebar-panel" id="sidebarPanel"><div class="sidebar-top"><div class="system-brand"><strong>ALLCREDIT</strong><span>FIDC System</span></div></div>
    <nav class="mobile-sections" aria-label="Seções">${sections.map(({key,label})=>`<button type="button" data-section="${key}">${icon(key)}<span>${label}</span></button>`).join('')}</nav>
    <nav class="section-content" id="sectionPages" aria-label="Páginas"></nav>
    <div class="panel-bottom"><button class="utility-item" data-theme-toggle><span aria-hidden="true">◐</span><span>Alternar tema</span></button><div class="divider"></div><div class="profile-label"><strong>${esc(ctx.usuario.login)}</strong><span>${roleLabel(ctx.usuario.acesso)}</span></div></div></div>`;
  const close=()=>{
    sidebar.classList.remove('menu-open');sidebar.classList.add('navigation-complete');
    sidebar.querySelector('.mobile-menu-trigger').setAttribute('aria-expanded','false');
  };
  const showSection=key=>{
    const current=sectionDefinition(key);
    sidebar.querySelectorAll('[data-section]').forEach(button=>{const active=button.dataset.section===key;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    sidebar.querySelector('#sectionPages').innerHTML=`<div class="section-title">${esc(current.label)}</div>${current.pages.map(({key:page,label})=>`<a class="panel-item ${state.section===key&&state.page===page?'active':''}" href="${routeHash({section:key,page})}" ${state.section===key&&state.page===page?'aria-current="page"':''}>${esc(label)}</a>`).join('')}`;
    sidebar.querySelectorAll('.panel-item').forEach(link=>link.onclick=close);
  };
  showSection(state.section);
  sidebar.querySelectorAll('[data-section]').forEach(button=>{
    button.onclick=()=>{sidebar.classList.remove('navigation-complete');showSection(button.dataset.section);};
    button.onpointerenter=event=>{if(event.pointerType==='mouse'){sidebar.classList.remove('navigation-complete');showSection(button.dataset.section);}};
    button.onfocus=()=>showSection(button.dataset.section);
  });
  sidebar.querySelector('.brand-logo').onclick=close;
  sidebar.querySelector('[data-theme-toggle]').onclick=()=>{
    const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('allcredit-theme',theme);}catch{}
  };
  sidebar.querySelector('.mobile-menu-trigger').onclick=event=>{
    const open=sidebar.classList.toggle('menu-open');sidebar.classList.remove('navigation-complete');event.currentTarget.setAttribute('aria-expanded',String(open));
  };
  sidebar.onpointerleave=()=>sidebar.classList.remove('navigation-complete');
  sidebar.onkeydown=event=>{if(event.key==='Escape'){close();sidebar.querySelector('.mobile-menu-trigger').focus({preventScroll:true});}};
  bindProfile(ctx);
  clearHeaderTabs(document.querySelector('#headerTabs'),document.querySelector('#topbar'));
}
