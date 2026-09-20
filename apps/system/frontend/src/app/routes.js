// Canonical navigation contract: section → page → optional view inside the page.
export const sections=[
  {key:'dashboards',label:'Dashboards',pages:[{key:'home',label:'Home'}]},
  {key:'workflow',label:'Workflow',pages:[{key:'extrato',label:'Extrato'},{key:'rastreio',label:'Rastreio',tabs:[['conciliacao','Conciliação'],['liquidacao','Liquidação'],['rastreio','Rastreio'],['pendencias','Pendências']]},{key:'saldos',label:'Saldos'}]},
  {key:'importacao',label:'Importação',pages:[{key:'qprof',label:'Qprof'},{key:'extratos',label:'Extratos'}]},
  {key:'gerenciador',label:'Gerenciador',pages:[{key:'naturezas',label:'Naturezas'},{key:'entidades',label:'Entidades'},{key:'contas',label:'Contas'},{key:'acessos',label:'Acessos'}]},
];
export const sectionDefinition=key=>sections.find(section=>section.key===key);
export const pageDefinition=route=>sectionDefinition(route.section)?.pages.find(page=>page.key===route.page);
export const pageKey=route=>`${route.section}/${route.page}`;
export const routeHash=route=>`#${pageKey(route)}${route.tab?`/${route.tab}`:''}`;
export function resolveRoute(hash) {
  const [sectionKey,pageKey,tab]=hash.replace(/^#/,'').split('/');
  const section=sectionDefinition(sectionKey)||sections[0];
  const page=section.pages.find(page=>page.key===pageKey)||section.pages[0];
  return {section:section.key,page:page.key,tab:page.tabs?.find(([key])=>key===tab)?.[0]||page.tabs?.[0][0]};
}
