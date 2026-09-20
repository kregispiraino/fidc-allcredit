import { api } from '../../../services/api.js';
import { renderCadastro } from '../shared/cadastro.js';
export default {load:()=>api('/gerenciador/naturezas'),render:ctx=>renderCadastro(ctx,{kind:'naturezas'})};
