# Arquitetura por seção e página

A navegação segue o padrão do Askora V2: ícones selecionam seções no rail; o painel apresenta o título da seção e suas páginas. A hierarquia também organiza módulos do frontend, endpoints, módulos do backend e nomes das tabelas. O identificador da rota usa português sem acentos; funções internas e componentes podem usar inglês, como no Askora.

## Mapa canônico

| Seção / página | Rota da interface | Dados principais |
| --- | --- | --- |
| Workflow / Saldos | `#workflow/saldos` | `workflow_saldos` |
| Workflow / Extrato | `#workflow/extrato` | `workflow_extrato` |
| Workflow / Rastreio | `#workflow/rastreio/conciliacao` ou `/liquidacao` ou `/rastreio` | `workflow_rastreio_transferencias`, `workflow_rastreio_itens` |
| Importação / Qprof | `#importacao/qprof` | `importacao_qprof_titulos`, `importacao_qprof_base`, `importacao_qprof_busca` |
| Importação / Extratos | `#importacao/extratos` | `importacao_extratos_fontes`, `importacao_extratos_lotes`, `importacao_extratos_registros` |
| Gerenciador / Naturezas | `#gerenciador/naturezas` | `gerenciador_naturezas` |
| Gerenciador / Entidades | `#gerenciador/entidades` | `gerenciador_entidades` |
| Gerenciador / Contas | `#gerenciador/contas` | `gerenciador_contas` |
| Gerenciador / Acessos | `#gerenciador/acessos` | `gerenciador_acessos` |
| Sistema / Sessão | Tela de entrada e card do perfil | `sistema_sessao`, `sistema_sessao_contas` |
| Dashboards / Home | `#dashboards/home` | Página preparada, sem indicadores nesta etapa |

Extrato tem somente a tabela. Rastreio contém Conciliação, Liquidação e Rastreio como visualizações da mesma página, com abas operacionais e resumo alinhados. As páginas do Gerenciador são acessadas pelo menu. Abas de uma página futura não devem substituir a navegação entre páginas.

Qprof substitui sua base de títulos por planilha de aba única, com validação integral e consulta paginada no servidor. Extratos importa XLS Bradesco 57420-1 e CSV Singulare 89727720/59697697, com leitores independentes, período explícito, deduplicação e atualização dos saldos.

## Estrutura

```text
apps/system/
  frontend/
    index.html
    assets/allcredit-logo.png
    src/
      app/
        routes.js               seções, páginas, visualizações e resolução de rotas
        pages.js                registro dos módulos de página
        main.js                 ciclo de carregamento, navegação e estado por página
      layouts/shell.js          rail, painel, identidade do sistema e breadcrumb
      features/
        workflow/
          saldos/               page.js, api.js
          extrato/              page.js, api.js
          rastreio/             page.js, api.js, composicao.js, composition-state.js, composition-view.js, composition-editing.js, item-form.js, detalhes.js, styles.css
        importacao/
          qprof/                page.js, api.js
          extratos/             page.js, api.js
          shared/               cards e estilos das fontes de importação
        gerenciador/
          naturezas/page.js
          entidades/page.js
          contas/page.js        cadastro e função das contas
          shared/cadastro.js    composição comum das tabelas dos cadastros
        dashboards/home/         página e estilos próprios
      components/               tabelas, filtros, campos, modais e navegação reutilizáveis
      services/api.js           transporte HTTP, sem regras de domínio
      styles/                   shell, tema e componentes compartilhados
      utils/                    apresentação e exportação
  backend/src/
    app.js                      Express, arquivos estáticos e tratamento de erros
    server.js                   início, migrations e encerramento
    api/routes.js               montagem explícita dos routers de página
    modules/
      workflow/
        saldos/                 routes.js e service.js
        extrato/                routes.js e service.js
        rastreio/               routes.js, service.js, repository.js, itens.js, pdf.js
      importacao/
        qprof/                  routes.js, service.js, search.js, parser.js e parser-worker.js
        extratos/               routes.js, service.js, sources.js e parsers por banco
      gerenciador/
        naturezas/routes.js
        entidades/routes.js
        contas/routes.js
        shared/                 router e serviço de CRUD dos cadastros
    infrastructure/database/    SQLite, migrations e transações
    shared/errors.js            validação de contratos e erros HTTP

database/
  migrations/                   histórico SQL versionado
  backups/                      cópias locais anteriores a alterações estruturais
  migrate.js
  seed.js                       carga fictícia explícita e idempotente
  allcredit.sqlite

tests/                          domínio, API, migração, arquitetura e navegador
docs/                           contratos, operação e decisões técnicas
```

## Limites entre módulos

- `main.js` não decide regras de Extrato, Rastreio ou Gerenciador. Localiza a página registrada e executa `load` e `render`.
- Cada página carrega seu contrato HTTP. Não existe endpoint agregador de toda a aplicação. Importação usa sua própria API; Qprof e Dashboards não consultam dados operacionais.
- Estado temporário é armazenado por `seção/página`. As visualizações de Rastreio ainda separam seus rascunhos por etapa e movimentação.
- Uma resposta atrasada de uma página abandonada não pode substituir a página atual. Erros de carga mostram uma nova tentativa na própria página.
- O shell conhece metadados de navegação, não campos nem regras financeiras. Escolher uma seção no rail apenas troca o painel; a navegação acontece ao escolher uma página.
- Componentes compartilhados não importam `features`. A tabela recebe colunas, ações, restrições de edição/exclusão e campo inicial do cadastro por parâmetros; não conhece vínculos financeiros.
- As páginas do Gerenciador compartilham o mecanismo de cadastro, sem copiar CRUD. A função da conta define as filas do Rastreio.
- Extrato pode abrir a consulta pública de detalhes do módulo Rastreio. Os dados da composição são buscados sob demanda; Extrato não precisa carregar toda a base de títulos.
- Os routers do backend adaptam HTTP; serviços concentram validações, SQL e transações. O router principal não executa SQL nem confirma operações.
- Rastreio consulta movimentações do módulo Extrato e contas do Gerenciador por funções explícitas. Qprof fornece a busca de títulos; registros persistentes de Rastreio mantêm sua identidade entre entradas e saídas, inclusive os importados do controle manual. Os vínculos operacionais são gravados somente pelo serviço de Rastreio.

## Banco e migrações

Tabelas seguem `secao_pagina` ou `secao_pagina_finalidade`. A transferência referencia uma movimentação quando há correspondência; os itens pertencem à transferência e podem compartilhar um registro econômico persistente. A base Qprof serve apenas como consulta, com referência opcional nos itens. Regras e migração da composição estão em [Banco](banco.md).

A migração `003_rastreio_composicoes.sql` converte os vínculos antigos em snapshots independentes, preserva dados e remove as restrições antigas do Extrato. Os históricos `001` e `002` permanecem imutáveis. `prompt_inicial.md` é o briefing original, não o contrato atual.

Saldos tem serviço e página próprios. Compartilha somente a tabela padrão; seu serviço permite editar o saldo final. Triggers garantem o saldo calculado no banco. A migração `004_contas_funcoes_saldos.sql` preserva os dados e substitui a configuração de contas pela função.

## Contratos HTTP

Todas as rotas abaixo têm prefixo `/api`.

| Método / rota | Contrato |
| --- | --- |
| `GET /importacao/extratos` | Fontes, contas e resultado da última importação. |
| `POST /importacao/extratos/:fonte` | `{ filename, content, start, end }`; arquivo em base64, datas ISO inclusivas, limite de 8 MB. |
| `GET /importacao/qprof` | Versão, arquivo, quantidade e atualização da base vigente. |
| `POST /importacao/qprof` | `{ filename, content, versao }`; base64 até 25 MB, até 100.000 títulos, substituição transacional. |
| `GET /importacao/qprof/titulos` | `q`, `filters` (JSON com os sete campos permitidos) e `page`; 15 resultados por página; sem critérios retorna lista vazia. |
| `GET /health` | Saúde do serviço. |
| `GET /workflow/saldos` | Saldos das contas ativas de todas as funções. |
| `PUT /workflow/saldos/batch` | `{ items: [{ id, saldo_final_reais }] }`; edição manual atômica, demais colunas são somente leitura. |
| `POST /workflow/extrato/exportar` | `{ ids }`; Excel com registros filtrados/selecionados e revisão por linha. |
| `POST /workflow/extrato/importar/conferir` | `{ filename, content }`; valida a planilha inteira e retorna contagens/revisões, sem gravação. |
| `POST /workflow/extrato/importar` | `{ filename, content, revisoes }`; atualização atômica dos IDs existentes, até 10.000 linhas/8 MB. |
| `POST /importacao/qprof/titulos/selecao` | `{ q, filters, versao }`; busca explícita de até 2.000 títulos para seleção em lote. |
| `GET /workflow/extrato` | Movimentações e opções de contas, entidades e naturezas. |
| `PATCH /workflow/extrato` | `{ ids, changes }`; classificação atômica. |
| `PUT /workflow/extrato/batch` | `{ items }`; criação/edição atômica de até 500 linhas. |
| `DELETE /workflow/extrato/:id` | Exclui movimentação e sua composição, preservando Qprof. |
| `GET /workflow/rastreio` | Movimentações, metadados Qprof (sem títulos), transferências, composições, resumo dos registros e contas. |
| `GET /workflow/rastreio/registros/:id` | Registro econômico, recebimentos, condições e percurso entre transferências. |
| `PATCH /workflow/rastreio/transferencias/:id/movimentacao` | `{ extrato_id, versao }`; associação explícita de uma transferência sem movimento, com conta/data/valor coincidentes. |
| `POST /workflow/rastreio/transferencias` | `{ extrato_id, itens }`; confirmação atômica. |
| `PUT /workflow/rastreio/transferencias/:id` | `{ versao, itens }`; atualiza a composição ou remove rastreio se vazia. |
| `GET /workflow/rastreio/transferencias/:id/pdf` | PDF da composição salva. |
| `GET /workflow/rastreio/transferencias/:id` | Transferência e snapshots dos itens. |
| `GET /gerenciador/{pagina}` | Objeto com os cadastros da página. |
| `POST /gerenciador/{pagina}` | Cria um cadastro. |
| `PUT /gerenciador/{pagina}/batch` | `{ items }`; criação/edição atômica. |
| `PUT /gerenciador/{pagina}/:id` | Edita um cadastro. |
| `DELETE /gerenciador/{pagina}/:id` | Exclui um cadastro sem referências. |

`{pagina}` é uma das três páginas explicitamente montadas: `naturezas`, `entidades`, `contas`.

## Checkup técnico e limites atuais

- Imports relativos são verificados automaticamente: arquivos existentes, ausência de ciclos e componentes sem dependência de páginas.
- As nove páginas possuem módulo próprio e rotas canônicas testadas. O código ativo é inspecionado contra nomes de banco e terminologia obsoletos.
- Testes de navegador cobrem menu desktop/mobile, rotas diretas, histórico do navegador, carregamento por página, filtros, cadastro, edição, preservação da rolagem, confirmação e consulta do rastreio.
- Testes de domínio preservam validação de contas/sinais, centavos, exclusões, unicidade, rollback e confirmação concorrente.
- SQLite é adequado à execução local atual. A separação em serviços ajuda uma evolução futura, mas não torna uma troca de banco automática.
- A base de títulos Qprof é pesquisada e paginada no servidor, com FTS5 e índices. As demais listagens ainda filtram e paginam os dados carregados por página.
- Componentes e serviços compartilhados continuam sendo pontos de integração. A modularização reduz acoplamento e os testes cobrem os fluxos existentes; não elimina a necessidade de regressão ao adicionar regras novas.

O gerador de documento está isolado em `pdf.js`, usando PDFKit ([documentação](https://pdfkit.org/docs/getting_started.html)). Recebe snapshots persistidos pelo serviço e não depende do DOM, filtros ou paginação da interface.

Os leitores ficam em `modules/importacao/extratos/parsers/`. A orquestração valida conta, período e identidades antes de persistir em uma única transação. O leitor XLS usa SheetJS CE 0.20.3 pela [distribuição oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), sem enviar arquivos a serviços externos. Novos bancos podem fornecer o mesmo contrato normalizado sem alterar os leitores existentes.

O módulo `modules/importacao/qprof/` separa `parser.js` (normalização dos sete campos), `parser-worker.js` (leitura fora do thread HTTP), `service.js` (troca transacional), `search.js` (filtros e paginação) e `routes.js` (contratos). O frontend compartilha apenas o card e a leitura do arquivo com Extratos; cada fluxo mantém sua própria regra. `title-search.js` em Rastreio controla debounce, cancelamento, erros e descarte de respostas antigas, sem carregar a base completa.

O fluxo de planilha de manutenção do Extrato está em `workflow/extrato/spreadsheet.js` no frontend e backend. Usa a validação comum de movimentações e preserva os gatilhos de Saldos/Rastreio. Não compartilha a regra de criação de movimentos dos importadores bancários.

A autenticação e a autorização estão isoladas em `modules/sistema/sessao`, e o CRUD de usuários em `modules/gerenciador/acessos`. O frontend mantém a mesma separação. Veja [Acessos e sessões](acessos.md).

A implantação Railway e as variáveis de produção estão em [Produção](producao.md). Scripts e relatórios pontuais da migração real não integram o repositório público nem a imagem.
