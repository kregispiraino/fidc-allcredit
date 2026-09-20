import { isAbsolute,resolve,relative } from 'node:path';
export function runtimeConfig(env=process.env){
  const production=env.NODE_ENV==='production';
  const supplied=env.APP_ORIGIN||(env.RAILWAY_PUBLIC_DOMAIN?`https://${env.RAILWAY_PUBLIC_DOMAIN}`:'');
  let origin=null;
  if(supplied){
    const url=new URL(supplied);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('APP_ORIGIN deve conter somente a origem pública do sistema.');
    origin=url.origin;
    if(production&&url.protocol!=='https:')throw new Error('APP_ORIGIN deve usar HTTPS em produção.');
  }
  if(production&&!origin)throw new Error('Configure APP_ORIGIN ou gere o domínio público no Railway.');
  const allowedOrigins=new Set(origin?[origin]:[]);
  for(const additional of (env.APP_ADDITIONAL_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean)){
    const url=new URL(additional);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||(production&&url.protocol!=='https:'))throw new Error('APP_ADDITIONAL_ORIGINS deve conter origens válidas, usando HTTPS em produção.');
    allowedOrigins.add(url.origin);
  }
  if(production&&(!env.ALLCREDIT_DB||!isAbsolute(env.ALLCREDIT_DB)))throw new Error('ALLCREDIT_DB deve apontar para um arquivo absoluto no volume persistente.');
  if(production&&env.RAILWAY_ENVIRONMENT_ID){
    if(!env.RAILWAY_VOLUME_MOUNT_PATH)throw new Error('Conecte um volume Railway antes de iniciar o banco.');
    const path=relative(resolve(env.RAILWAY_VOLUME_MOUNT_PATH),resolve(env.ALLCREDIT_DB));
    if(!path||path.startsWith('..')||isAbsolute(path))throw new Error('ALLCREDIT_DB deve ficar dentro do volume Railway.');
  }
  const proxy=env.TRUST_PROXY??(env.RAILWAY_ENVIRONMENT_ID?'1':'0');
  if(!['0','1'].includes(proxy))throw new Error('TRUST_PROXY deve ser 0 (direto) ou 1 (um proxy confiável).');
  return {production,origin,allowedOrigins,trustProxy:Number(proxy)};
}
export function securityHeaders(config){
  return (req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"});
    if(config.production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
    const mutation=!['GET','HEAD','OPTIONS'].includes(req.method);
    const allowed=config.allowedOrigins.size?config.allowedOrigins:new Set([`${req.protocol}://${req.get('host')}`]);
    if(mutation&&((req.headers.origin&&!allowed.has(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site'))return res.status(403).json({error:'Origem não permitida.'});
    next();
  };
}
