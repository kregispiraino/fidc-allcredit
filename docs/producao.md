# Produção no Railway

## Serviço e volume

A aplicação usa Node.js 24 LTS, Express e SQLite. `railway.toml` seleciona Docker, uma réplica, `/healthz` e reinício em caso de falha. O Docker instala as dependências do lockfile com `npm ci --omit=dev --ignore-scripts`. Somente código de execução, migrations e ferramentas de acesso/backup entram na imagem.

No Railway, conecte o repositório, crie um volume no serviço montado em `/data` e gere um domínio público. Faça isso antes do primeiro deploy funcional. Defina:

| Variável | Valor |
| --- | --- |
| `NODE_ENV` | `production` (padrão da imagem) |
| `HOST` | `0.0.0.0` (padrão da imagem) |
| `PORT` | Fornecido pelo Railway; padrão local da imagem `4310` |
| `ALLCREDIT_DB` | `/data/allcredit.sqlite` |
| `APP_ORIGIN` | URL HTTPS sem caminho, como `https://fidc.seudominio.com`; opcional quando `RAILWAY_PUBLIC_DOMAIN` está disponível |
| `TRUST_PROXY` | `1`, para o proxy do Railway |

O início falha se a configuração de produção não tiver origem HTTPS ou caminho absoluto de banco. No Railway também exige volume conectado e banco dentro dele, evitando gravar acidentalmente no filesystem descartável.

Volumes do Railway são montados como root. O entrypoint ajusta a propriedade do diretório e dos arquivos SQLite existentes e executa o Node como usuário `node`, sem privilégios de root. Migrations rodam no início do processo, quando o volume já está disponível; não use pre-deploy para alterar esse banco.

Não configure múltiplas réplicas nem outros processos escritores independentes para esse arquivo. Mantenha o volume ao atualizar/reimplantar o serviço. Mudanças de schema requerem backup anterior: voltar só a imagem não desfaz uma migration.

## Login inicial

Em uma instalação vazia, execute `npm run access:create` no terminal do serviço (`railway ssh` também pode ser usado). Ele solicita login e senha sem exibi-la e cria um operador. Para automação, aceita um objeto JSON com `login` e `senha` pela entrada padrão; não grave esse objeto no repositório.

Não há login/senha padrão na imagem. Ao transportar a base de desenvolvimento, os acessos existentes também são transportados. **Troque a senha provisória do operador por uma senha exclusiva antes de tornar a base real acessível pela internet.** Use Gerenciador → Acessos. Trocar a senha revoga as sessões desse acesso.

## Transportar a base existente

O banco e seus relatórios são privados e não entram no Git.

1. Com o sistema local funcionando, execute `npm run db:backup -- local/producao/allcredit.sqlite`. O comando utiliza a API de backup SQLite e inclui o estado confirmado do WAL, gerando uma cópia consistente sem copiar arquivos abertos manualmente.
2. Guarde outra cópia desse backup em armazenamento privado. Pause alterações locais durante o corte definitivo para produção.
3. No Railway, faça a carga no volume **antes de iniciar o processo que abrirá o banco**, ou pare o serviço durante a substituição. Não sobrescreva um banco aberto. Use os comandos de arquivos do volume/terminal do Railway, por canal autenticado, para colocar a cópia em `/data/allcredit.sqlite`.
4. Em caso de substituição de uma base já criada no destino, faça backup dela antes. Com o processo parado, remova os antigos arquivos `allcredit.sqlite-wal` e `allcredit.sqlite-shm` do destino; não reutilize WAL de outro banco.
5. Inicie o serviço. Confira o healthcheck, login, contas, saldos e composições. A aplicação aplica somente as migrations ainda pendentes.

Para entrar em produção com banco vazio, use apenas `access:create` e os cadastros/importações da interface, sem seed fictício. A associação das fontes de extrato às contas precisa estar cadastrada antes de importar.

## Backups e operação

Ative backups periódicos do volume pelo Railway e mantenha cópias fora do mesmo volume. `npm run db:backup -- /data/backups/nome-novo.sqlite` também gera uma cópia consistente, que deve ser baixada para armazenamento privado. O comando não sobrescreve destinos existentes. Teste a restauração em ambiente separado.

`/healthz` verifica a conexão com o banco e retorna somente status. Demais endpoints de dados exigem autenticação. Cookies são HttpOnly, SameSite=Lax e obrigatoriamente Secure em produção, mesmo com TLS terminado no proxy. O servidor valida a origem pública das alterações e fornece CSP, bloqueio de frames e HSTS.

O encerramento SIGTERM/SIGINT fecha o servidor e o SQLite, com limite de espera. Logs não registram senhas, cookies ou corpos de importações. O frontend é servido diretamente; não há processo de build JavaScript separado.

## Validação e custo

`npm test` usa apenas dados sintéticos. `npm run test:ui` gera suas capturas em pasta ignorada. O modelo de CI não publica capturas ou bases como artifacts. Testes e Playwright não entram na imagem, portanto não consomem memória/CPU na aplicação implantada. A configuração proposta está em `docs/examples/ci.yml`, sem ativação automática. Para ativar, copie para `.github/workflows/ci.yml` com uma credencial que tenha permissão `workflow`. As ações de CI têm custo separado, conforme o plano GitHub; o teste de navegador desse modelo é manual.

Referências: [Node.js — releases](https://nodejs.org/en/about/previous-releases), [Railway — Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Volumes](https://docs.railway.com/volumes), [Configuração por código](https://docs.railway.com/config-as-code/reference), [Healthchecks](https://docs.railway.com/deployments/healthchecks).
