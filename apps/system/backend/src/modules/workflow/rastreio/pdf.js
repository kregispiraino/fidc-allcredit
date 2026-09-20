import PDFDocument from 'pdfkit';
import { resolve } from 'node:path';
import { projectRoot } from '../../../infrastructure/database/connection.js';
import { transferDetails } from './service.js';
const currency=value=>value==null?'Não informado':(value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:4});
const date=value=>value.split('-').reverse().join('/');
const labels={titulo:'Título',parcial:'Parcial',tarifa:'Tarifa',custas:'Custas',ajuste:'Ajuste'};

// Render from persisted snapshots only. Filters and unfinished browser drafts never
// change the document. Layout repeats column headings and numbers every page.
export async function compositionPdf(db,id) {
  const transfer=transferDetails(db,id);
  const doc=new PDFDocument({size:'A4',margin:42,bufferPages:true,info:{Title:`Composição ${transfer.codigo}`,Author:'ALLCREDIT · FIDC System'}});
  const chunks=[];
  const output=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const width=doc.page.width-84,bottom=doc.page.height-70;
  const columns=[['Tipo',56],['Título',92],['Cedente',118],['Sacado',140],['Valor (R$)',width-406]];
  const text=(value,x,y,w,font='Helvetica',size=9)=>doc.font(font).fontSize(size).fillColor('#253148').text(String(value||'—'),x,y,{width:w,lineGap:2});
  function heading(continued=false){
    doc.rect(0,0,doc.page.width,doc.page.height).fill('#ffffff');
    doc.roundedRect(42,36,38,38,6).fill('#071b4a');doc.image(resolve(projectRoot,'apps/system/frontend/assets/allcredit-logo.png'),43,37,{fit:[36,36],align:'center'});
    text('ALLCREDIT',91,39,300,'Helvetica-Bold',15);text('FIDC System',91,59,300,'Helvetica',9);
    text('COMPOSIÇÃO DA TRANSFERÊNCIA',42,94,width,'Helvetica-Bold',14);
    text(`${transfer.codigo} · ${transfer.extrato_id?`Extrato #${transfer.extrato_id}`:'Sem movimentação associada'}${continued?' · Continuação':''}`,42,118,width);
    let y=147;
    if(!continued){
      text(`${transfer.movimento_valor>0?'Crédito':'Débito'} · ${date(transfer.data)} · ${transfer.conta}`,42,y,width,'Helvetica-Bold',10);y=doc.y+12;
      text(transfer.historico,42,y,width);y=doc.y+12;
      if(transfer.documento){text(`Documento: ${transfer.documento}`,42,y,width);y=doc.y+8;}
      if(transfer.observacao_revisao){text(`Revisão: ${transfer.observacao_revisao}`,42,y,width);y=doc.y+12;}
      if(transfer.origem_chave){text(`Condição original: ${transfer.status_origem||'Não informada'}${transfer.diferenca_origem!=null?` · Diferença da fonte: ${currency(transfer.diferenca_origem)}`:''}`,42,y,width);y=doc.y+8;}
      if(transfer.observacao){text(transfer.observacao,42,y,width);y=doc.y+12;}
      text(`Valor da transferência: ${currency(transfer.valor)}`,42,y,width,'Helvetica-Bold',10);y=doc.y+20;
    }
    return header(y);
  }
  function header(y){doc.rect(42,y,width,26).fill('#edf0f7');let x=42;for(const [label,w]of columns){text(label,x+7,y+8,w-14,'Helvetica-Bold',8);x+=w;}return y+26;}
  let y=heading();
  for(const item of transfer.itens){
    const values=[labels[item.tipo]+(item.efeito==='compensacao'?' · Compensação de saldo':''),item.titulo,item.cedente,item.sacado,currency(item.valor)];
    const height=Math.max(32,...values.map((value,index)=>doc.font('Helvetica').fontSize(9).heightOfString(String(value||'—'),{width:columns[index][1]-14,lineGap:2})+16));
    if(y+height>bottom){doc.addPage();y=heading(true);}
    let x=42;values.forEach((value,index)=>{text(value,x+7,y+8,columns[index][1]-14,index===4?'Helvetica-Bold':'Helvetica');x+=columns[index][1];});
    doc.moveTo(42,y+height).lineTo(42+width,y+height).lineWidth(.5).strokeColor('#dce1e7').stroke();y+=height;
  }
  if(y+155>bottom){doc.addPage();y=heading(true);}
  if(transfer.itens.some(i=>i.efeito==='compensacao')){y+=12;text('Compensações de saldo encerram o controle do item e não somam ao total bancário.',42,y,width);y=doc.y+8;}
  y+=18;text(`${transfer.itens.length} item(ns) na composição`,42,y,width);y+=20;
  text(`${transfer.alocacoes_vazias?'Total das alocações informadas':'Total da composição'}: ${currency(transfer.total_composicao)}`,42,y,width,'Helvetica-Bold',11);y+=23;
  text(`Diferença: ${currency(transfer.diferenca)}`,42,y,width,'Helvetica-Bold',10);y+=22;
  text(transfer.pendente?`Requer análise: ${transfer.motivos.join(' · ')}.`:'Composição conferida com o valor atual da transferência.',42,y,width,'Helvetica',9);
  const range=doc.bufferedPageRange(),emitted=new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  for(let page=0;page<range.count;page++){
    doc.switchToPage(page);text(`Emitido em ${emitted} · Versão ${transfer.versao}`,42,doc.page.height-58,width-100,'Helvetica',8);
    text(`${page+1} / ${range.count}`,doc.page.width-105,doc.page.height-58,63,'Helvetica',8);
  }
  doc.end();return output;
}
