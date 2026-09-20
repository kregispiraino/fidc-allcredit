# Acessos e sessões

`#gerenciador/acessos` cadastra Login, Senha e Acesso. Login é único, sem distinção de maiúsculas. Os perfis disponíveis são Operador e Visualizador. Senhas não são devolvidas pela API ou exportadas; editar com a senha vazia mantém a atual. Não é possível excluir ou rebaixar o último operador.

## Permissões

Todas as APIs de negócio exigem autenticação, inclusive consultas e PDF. Operador pode cadastrar, editar, excluir, importar e exportar. Visualizador pode consultar e exportar. O bloqueio é centralizado no servidor, com os controles de edição também retirados ou desabilitados na interface. A exportação Excel por POST é uma exceção explícita de leitura, pois recebe os IDs filtrados no corpo.

Entrada em outra conta e saída pertencem à sessão do próprio usuário e estão disponíveis para ambos os perfis. Nenhuma dessas ações permite modificar dados financeiros ou criar acessos sem ser operador.

## Persistência e várias contas

- `gerenciador_acessos`: login, hash da senha com scrypt e salt aleatório e perfil.
- `sistema_sessao`: hash SHA-256 do token aleatório da sessão, acesso selecionado e expiração.
- `sistema_sessao_contas`: acessos autenticados neste navegador. Para adicionar uma conta, é necessário fornecer sua senha.

O cookie usa HttpOnly, SameSite=Lax e Secure obrigatório em produção (HTTPS direto ou via proxy). Permanece por 30 dias, com prazo renovado durante o uso. As sessões ficam no SQLite e sobrevivem ao reinício do servidor; não são armazenadas senhas ou tokens no localStorage. A entrada rotaciona o token. As permissões são consultadas a cada requisição. Trocas/saídas recarregam a aplicação e notificam outras abas para descartar o estado da conta anterior.

Sair da conta atual remove sua autenticação neste navegador e passa para outra conta autenticada, se houver. Sair de todas revoga a sessão completa. Trocar a senha revoga esse usuário em todos os dispositivos, inclusive das listas de contas salvas; excluir o acesso também o revoga. Não há página de perfil: adicionar conta, alternar e sair ficam no card do avatar. O card e o rail exibem apenas as iniciais do login, sem foto. Adicionar conta e Sair ficam lado a lado.

O login aplica limite de tentativas por endereço e mensagens genéricas para credenciais incorretas. Requisições de alteração com origem externa são rejeitadas.

## Implantação e verificações

A migration `013_gerenciador_acessos.sql` é aditiva: não modifica movimentos, saldos, títulos ou composições. O primeiro operador foi criado explicitamente na implantação; não existe senha padrão recriada automaticamente ao iniciar o sistema.

Testes em `tests/acessos.test.js` cobrem hashes, permissões, exportação, CRUD, último operador, múltiplas contas, revogação, expiração, renovação, reinício, origem e limitação de tentativas. Os testes de navegador em `tests/ui.test.js` cobrem o login, reabertura, cadastro, troca de conta, iniciais e visualizador.

A migration `014_acessos_sem_foto.sql` remove o campo de foto descontinuado; login, senha, perfil e sessões são preservados.
