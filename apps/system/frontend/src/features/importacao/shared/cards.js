import { esc } from '../../../utils/presentation.js';
import { importStatus } from './status.js';
const uploadIcon='<svg viewBox="0 0 24 24" class="stroke-icon" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></svg>';
// Reusable card shell. Upload parsing and persistence remain in each page's module.
export function renderImportSources(ctx,sources) {
  ctx.root.innerHTML=`<div class="import-grid">${sources.map(source=>{
    const {key,title,description,accept,period,file,busy,result,error,lastImport}=source;
    const available=!!key&&!source.disabled;
    const status=importStatus(lastImport);
    return `<article class="import-card" ${key?`data-import-source="${esc(key)}"`:''} aria-busy="${!!busy}"><header><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><span class="soft-badge">${available?esc(accept.toUpperCase().replaceAll('.','')):'Indisponível'}</span></header>
      <div class="import-meta"><span>Última importação</span><div class="import-meta-row"><strong>${esc(status.dateLabel)}</strong><span class="import-status ${status.updated?'updated':'outdated'}" data-import-last="${esc(lastImport||'')}" role="status">${status.updated?'Atualizado':'Desatualizado'}</span></div></div>
      ${ctx.canWrite===false?'<p class="import-readonly">Acesso de consulta</p>':`
      ${available&&period?`<div class="import-period"><label class="form-field"><span>Data início</span><input type="date" data-import-start aria-label="Data início — ${esc(title)}" value="${esc(period.start)}" required ${busy?'disabled':''}></label><label class="form-field"><span>Data fim</span><input type="date" data-import-end aria-label="Data fim — ${esc(title)}" value="${esc(period.end)}" required ${busy?'disabled':''}></label></div>`:''}
      <div class="dropzone ${file?'has-file':''}" ${available?`tabindex="0" role="button" aria-label="Selecionar ou arrastar arquivo — ${esc(title)}" aria-disabled="${!!busy}"`:''}>${uploadIcon}<strong>${file?esc(file.name):available?esc(source.dropLabel||'Arraste o extrato aqui'):'Importação indisponível'}</strong><span>${file?`${(file.size/1024).toFixed(1)} KB · Pronto para atualizar`:available?'ou clique para selecionar o arquivo':'Confira a conta vinculada'}</span></div>
      ${available?`<input class="import-file-input" type="file" accept="${esc(accept)}" aria-label="Arquivo — ${esc(title)}" hidden>`:''}
      <div class="import-feedback" aria-live="polite">${error?`<p class="import-error" role="alert">${esc(error)}</p>`:result&&source.resultSummary?`<p class="import-success"><strong>${esc(source.resultSummary)}</strong></p><p>${esc(source.resultDetail||'')}</p>`:result?`<p class="import-success"><strong>${result.criados} novos</strong> · ${result.duplicados} já importados · ${result.fora_periodo} fora do período.</p><p>${result.saldo_final_automatico?'Saldos conferidos. Saldo final atualizado.':result.aviso||'Saldo Banco atualizado.'}</p>`:`<p>${available?esc(source.helpText||'O arquivo só será processado ao clicar em Atualizar.'):'A importação exige uma conta vinculada, ativa e com função de movimentação.'}</p>`}</div>
      <footer>${file?`<button class="table-tool" type="button" data-import-clear ${busy?'disabled':''}>Remover arquivo</button>`:''}<button class="form-action secondary" type="button" data-import-select ${!available||busy?'disabled':''}>Selecionar arquivo</button>${available?`<button class="form-action primary" type="button" data-import-submit ${!file||busy?'disabled':''}>${busy?'Atualizando…':esc(source.submitLabel||'Atualizar')}</button>`:''}</footer>`}</article>`;
  }).join('')}</div>`;
  // Refresh only the badges when the day changes, preserving files and in-progress inputs.
  const timer=setInterval(()=>{
    for(const badge of ctx.root.querySelectorAll('[data-import-last]')){
      const {updated}=importStatus(badge.dataset.importLast);
      badge.classList.toggle('updated',updated);badge.classList.toggle('outdated',!updated);
      badge.textContent=updated?'Atualizado':'Desatualizado';
    }
  },60000);
  ctx.onCleanup(()=>clearInterval(timer));
}
