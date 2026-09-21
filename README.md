# ALLCREDIT · FIDC System

Sistema de operações financeiras com Extrato, Rastreio, Saldos, importação de extratos bancários e base de títulos Qprof (CSV, XLS e XLSX).

| Seção | Páginas |
| --- | --- |
| Dashboards | Home |
| Workflow | Extrato, Rastreio e Saldos |
| Importação | Qprof e Extratos |
| Gerenciador | Naturezas, Entidades, Contas e Acessos |

Operadores podem alterar os dados. Visualizadores podem consultar e exportar Excel/PDF. O controle de permissão é aplicado pelo servidor. Senhas usam hash scrypt; sessões persistem no SQLite e permitem alternar entre contas autenticadas.

## Desenvolvimento

Requer Node.js 24 ou superior. A imagem de produção usa a linha 24 LTS.

```sh
npm ci
npm run db:migrate
npm run access:create
npm start
```

Acesse http://127.0.0.1:4310. O comando `access:create` solicita login e senha no terminal, sem exibir a senha. Não há credencial padrão no código.

Para carregar exemplos fictícios em um banco vazio, execute `npm run db:seed` explicitamente. Nunca use o seed para preparar a base real. O servidor aplica migrations ao iniciar, mas não cria usuários nem movimentos automaticamente.

Configuração opcional: copie `.env.example` para `.env` e execute `npm run start:env`. `npm start` recebe as variáveis diretamente do ambiente.

## Produção no Railway

O repositório inclui `Dockerfile` e `railway.toml`. A imagem instala somente dependências de execução e não contém testes, capturas, relatórios, planilhas, banco local ou backups.

1. Conecte este repositório a um serviço Railway.
2. Monte um **Volume em `/data`** e mantenha **uma réplica**.
3. Gere o domínio público HTTPS. `APP_ORIGIN` pode ser informado explicitamente ou será derivado de `RAILWAY_PUBLIC_DOMAIN`.
4. Confirme `ALLCREDIT_DB=/data/allcredit.sqlite`, `NODE_ENV=production`, `HOST=0.0.0.0` e `TRUST_PROXY=1`. `PORT` é fornecido pelo Railway.
5. Publique e crie o primeiro operador no terminal do serviço com `npm run access:create`.

**O push do código não transfere o banco local.** Para continuar com a base existente, transporte um backup consistente por canal privado para o Volume, conforme [Produção e Railway](docs/producao.md). O procedimento preserva contas, saldos, composições e acessos.

## Testes

```sh
npm test
npx playwright install chromium
npm run test:ui
```

Os testes criam bancos temporários e planilhas fictícias em memória. Não dependem de extratos ou documentos de clientes. Screenshots e PDFs ficam em `test-results/`, ignorada pelo Git e pela imagem. O código de testes ocupa pouco espaço no repositório e não roda em produção.

O modelo em `docs/examples/ci.yml` verifica backend e build da imagem, com navegador opcional. A automação ainda não está ativada: para habilitá-la, copie para `.github/workflows/ci.yml` usando uma credencial GitHub com permissão `workflow`. Os mesmos testes podem ser executados localmente.

## Estrutura e documentação

Frontend e backend são modularizados por seção/página. Tabelas seguem a mesma nomenclatura, por exemplo `workflow_extrato` e `gerenciador_acessos`. O banco SQLite precisa de armazenamento persistente e não deve ser compartilhado entre múltiplas réplicas.

- [Produção, backup e Railway](docs/producao.md)
- [Arquitetura](docs/arquitetura.md)
- [Banco de dados](docs/banco.md)
- [Operação](docs/operacao.md)
- [Acessos e sessões](docs/acessos.md)
- [Regra de pendências](docs/pendencias-rastreio.md)
