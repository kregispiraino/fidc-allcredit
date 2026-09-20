import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { assert } from '../../../shared/errors.js';
export function hashPassword(password){
  assert(typeof password==='string'&&password.length>=6&&password.length<=128,'A senha deve ter entre 6 e 128 caracteres.');
  const salt=randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;
}
export function verifyPassword(password,hash){
  if(typeof password!=='string'||password.length>128)return false;
  const [algorithm,salt,key]=String(hash).split('$');
  if(algorithm!=='scrypt'||!salt||!key)return false;
  const expected=Buffer.from(key,'hex'),actual=scryptSync(password,salt,64);
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
