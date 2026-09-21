import { assert } from '../../../shared/errors.js';

export function csvRows(buffer){
  const bytes=Buffer.from(buffer);
  let text;
  if(bytes[0]===0xff&&bytes[1]===0xfe)text=new TextDecoder('utf-16le').decode(bytes);
  else if(bytes[0]===0xfe&&bytes[1]===0xff)text=new TextDecoder('utf-16be').decode(bytes);
  else {try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}}
  text=text.replace(/^\uFEFF/,'');
  const separator=/^sep=([;,\t])\r?\n/i.exec(text);
  if(separator)text=text.slice(separator[0].length);
  let quoted=false;const counts={';':0,',':0,'\t':0};
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}
    if(!quoted&&/[\r\n]/.test(c))break;
    if(!quoted&&Object.hasOwn(counts,c))counts[c]++;
  }
  const delimiter=separator?.[1]||Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  const rows=[];let row=[],value='',inQuotes=false,closed=false;
  const cell=()=>{row.push(value);value='';closed=false;assert(row.length<=200,'O CSV deve conter até 200 colunas.');};
  const line=()=>{cell();if(row.some(v=>v.trim()))rows.push(row);row=[];assert(rows.length<=100001,'O CSV deve conter até 100.000 títulos.');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{inQuotes=false;closed=true;}}else value+=c;continue;}
    if(c===delimiter){cell();continue;}
    if(c==='\r'||c==='\n'){line();if(c==='\r'&&text[i+1]==='\n')i++;continue;}
    if(c==='"'){assert(!value.trim()&&!closed,'Aspas inválidas no CSV.');value='';inQuotes=true;continue;}
    assert(!closed||/\s/.test(c),'Conteúdo inesperado após aspas no CSV.');if(!closed)value+=c;
  }
  assert(!inQuotes,'O CSV contém um campo com aspas não fechadas.');
  if(value||row.length||closed)line();
  assert(rows.length>0,'O CSV está vazio.');
  return rows;
}
