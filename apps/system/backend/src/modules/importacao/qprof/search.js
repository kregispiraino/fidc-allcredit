import { assert } from '../../../shared/errors.js';
import { parseCents } from '../../../shared/money.js';
import { validDate } from './parser.js';
import { qprofBase } from './service.js';
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const configured=new WeakSet();
const columns={titulo:'numero',cedente:'cedente',sacado:'sacado',valor:'valor',data_liquidacao:'data_liquidacao',carteira:'carteira',carteira_interna:'carteira_interna'};
export function searchQprof(db,{q='',filters={},page=1}={},pageSize=15){
  assert(typeof q==='string'&&q.length<=160,'Busca deve ter até 160 caracteres.');
  assert(filters&&typeof filters==='object'&&!Array.isArray(filters)&&Object.keys(filters).every(key=>Object.hasOwn(columns,key)),'Filtros de títulos inválidos.');
  page=Number(page);assert(Number.isSafeInteger(page)&&page>0&&page<=100000,'Página inválida.');
  if(!configured.has(db)){db.function('qprof_normalize',{deterministic:true},normalize);configured.add(db);}
  const clauses=[],params=[];
  if(q.trim()){
    const tokens=q.match(/[\p{L}\p{N}]+/gu)||[];
    assert(tokens.length<=20,'Use até 20 termos na busca.');
    if(tokens.length){
      const fulltext=tokens.map(token=>`"${token}"*`).join(' AND ');
      let cents;try{cents=parseCents(q.replace(/R\$|\s/g,'').includes(',')?q.replace(/R\$|\s|\./g,'').replace(',','.'):q.trim());}catch{}
      clauses.push(`(id IN (SELECT rowid FROM importacao_qprof_busca WHERE importacao_qprof_busca MATCH ?)${cents!==undefined?' OR valor=?':''})`);params.push(fulltext);if(cents!==undefined)params.push(cents);
    }else clauses.push('0');
  }
  for(const [key,value] of Object.entries(filters)){
    if(value==='')continue;
    const column=columns[key];
    if(value==='__empty__'){clauses.push(`(${column} IS NULL OR ${column}='')`);continue;}
    if(key==='data_liquidacao'){
      const range=typeof value==='string'?{from:value,to:value}:value;
      assert(range&&typeof range==='object'&&!Array.isArray(range)&&Object.keys(range).every(key=>['from','to'].includes(key)),'Período de liquidação inválido.');
      for(const [bound,date] of Object.entries(range))if(date){assert(validDate(date),'Data de liquidação inválida.');clauses.push(`${column}${bound==='from'?'>=':'<='}?`);params.push(date);}
      assert(!range.from||!range.to||range.from<=range.to,'Período de liquidação inválido.');
    }else if(key==='valor'){clauses.push('valor=?');params.push(parseCents(value));}
    else if(['carteira','carteira_interna'].includes(key)){assert(typeof value==='string'&&value.length<=160,'Carteira inválida.');clauses.push(`${column}=?`);params.push(value);}
    else{assert(typeof value==='string'&&value.length<=160,'Filtro deve ter até 160 caracteres.');if(value.trim()){clauses.push(`instr(qprof_normalize(${column}),?)>0`);params.push(normalize(value));}}
  }
  const versao=qprofBase(db).versao;
  if(!clauses.length)return {items:[],total:0,page:1,pages:1,versao,requiresFilter:true};
  const where='ativo=1 AND '+clauses.join(' AND '),total=db.prepare(`SELECT count(*) total FROM importacao_qprof_titulos WHERE ${where}`).get(...params).total;
  const pages=Math.max(1,Math.ceil(total/pageSize));page=Math.min(page,pages);
  const items=db.prepare(`SELECT id,numero,cedente,sacado,valor,data_liquidacao,carteira,carteira_interna FROM importacao_qprof_titulos WHERE ${where} ORDER BY data_liquidacao DESC,id LIMIT ? OFFSET ?`).all(...params,pageSize,(page-1)*pageSize);
  return {items,total,page,pages,versao,requiresFilter:false};
}

export function selectQprof(db,payload){
  assert(payload.versao===qprofBase(db).versao,'A base Qprof mudou. Atualize a busca antes de selecionar.',409);
  const result=searchQprof(db,{q:payload.q,filters:payload.filters},2000);
  assert(result.total<=2000,'O filtro encontrou mais de 2.000 títulos. Refine os filtros para selecionar todos.',422);
  return result;
}
