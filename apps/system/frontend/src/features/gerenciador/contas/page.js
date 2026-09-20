import { api } from '../../../services/api.js';
import { renderCadastro } from '../shared/cadastro.js';
export default {load:()=>api('/gerenciador/contas'),render:ctx=>renderCadastro(ctx,{kind:'contas'})};
