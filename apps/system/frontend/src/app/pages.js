import saldos from '../features/workflow/saldos/page.js';
import extrato from '../features/workflow/extrato/page.js';
import rastreio from '../features/workflow/rastreio/page.js';
import naturezas from '../features/gerenciador/naturezas/page.js';
import entidades from '../features/gerenciador/entidades/page.js';
import contas from '../features/gerenciador/contas/page.js';
import qprof from '../features/importacao/qprof/page.js';
import extratos from '../features/importacao/extratos/page.js';
import home from '../features/dashboards/home/page.js';
import acessos from '../features/gerenciador/acessos/page.js';

// Adding a page registers a module; it does not add business branches to main.js.
export const pages={
  'workflow/saldos':saldos,'workflow/extrato':extrato,'workflow/rastreio':rastreio,
  'gerenciador/naturezas':naturezas,'gerenciador/entidades':entidades,'gerenciador/contas':contas,'gerenciador/acessos':acessos,
  'importacao/qprof':qprof,'importacao/extratos':extratos,'dashboards/home':home
};
