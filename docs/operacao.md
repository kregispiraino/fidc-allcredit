# Operação

## Workflow → Rastreio

A página possui três abas com lista de movimentações à esquerda e composição à direita:

- **Conciliação:** créditos sem rastreio das contas ativas com função Rastreada.
- **Liquidação:** débitos sem rastreio das contas ativas com função Rastreada.
- **Rastreio:** créditos e débitos que já têm composição salva, preservando as composições já registradas.

Selecione uma movimentação. **Todos os títulos** consulta a base Qprof somente após uma busca ou filtro, com 15 resultados por página. Vincular copia título, cedente, sacado, valor, data de liquidação, carteira e carteira interna para o item da composição, com tipo Título. A tabela mantém somente Tipo, Título, Cedente, Sacado e Valor. **Vinculados** mostra os itens da composição. O lápis edita o item e o botão de desvincular o remove do rascunho. A base Qprof permanece intacta.

**Editar** e **Criar registro** aparecem nas três abas operacionais e ficam habilitados apenas em **Vinculados**. Editar abre os campos na própria tabela e Salvar aplica a edição ao rascunho até a confirmação; Cancelar restaura os campos anteriores. Criar registro abre o formulário, com os tipos Título, Parcial, Tarifa e Custas. Valores negativos permitem ajustes. Esses itens pertencem somente à composição, sem criar extrato ou título importado.

**Rastrear transferência** confirma a composição das filas; **Salvar alterações** atualiza uma composição na aba Rastreio. A soma precisa coincidir com o valor da movimentação. Salvar após remover todos os itens pede confirmação para remover o rastreio; a movimentação permanece no Extrato e volta à fila.

Os rascunhos são separados por aba e movimentação. Trocar entre elas preserva o trabalho local; sair da página pede confirmação se há alterações. Recarregar descarta o que ainda não foi salvo. **Descartar alterações** restaura a composição persistida.

O ícone **PDF**, no cabeçalho da composição, baixa um documento da transferência selecionada: identificação, data, conta, crédito/débito, histórico, itens, total, diferença, versão e emissão. Usa exclusivamente os dados salvos e fica desabilitado enquanto há alterações locais. O relatório inclui todos os itens, independentemente dos filtros/paginação da tela.

## Workflow → Extrato

O status Pendente/Conciliado/Estorno é um controle independente do Qprof: não impede edição, exclusão ou rastreio. Todos os campos exibidos podem ser editados. A confirmação de rastreio não muda esse status.

Alterar valor de uma movimentação rastreada preserva seus itens, mostrando eventual diferença na aba Rastreio. Excluir a movimentação também exclui sua composição, conforme informado na confirmação, mas preserva a base Qprof.

A tabela mantém edição inline, seleção, filtros, cadastro rápido, duplicação e rolagem estável. No Extrato são 25 registros por página, com rolagem vertical da página e somente rolagem horizontal interna. O seletor azul do cabeçalho inicia em Todas as contas e filtra por conta ativa, sincronizado com o filtro da tabela. Durante a edição ele fica desabilitado para preservar os campos. As colunas de Status e Data têm largura compacta e a barra de ações acompanha a rolagem. **Ctrl/Cmd + Enter** salva. **Ver rastreio** consulta a composição salva.

## Workflow → Saldos

Tabela padrão com todas as contas ativas, incluindo Neutra. A conta identifica a linha; as colunas financeiras são Saldo Sistema, Saldo Banco e Saldo final, mais uma única data/hora de atualização.

Saldo Sistema soma créditos e débitos de todos os registros da conta, independentemente do status Qprof; acompanha inclusões, alterações, troca de conta e exclusões. Histórico anterior de uma conta convertida para Neutra é preservado no cálculo. Saldo Banco é alimentado por Importação → Extratos.

Somente Saldo final é editável manualmente: aceita valor positivo, negativo, zero ou vazio. Na importação, é atualizado automaticamente somente quando Sistema e Banco coincidem; fora dessa condição, é preservado. Use Salvar para persistir; o componente também permite seleção e edição em lote. Contas inativas ficam fora da página, sem perder seus saldos; reativá-las torna a linha visível novamente. A linha é criada automaticamente ao cadastrar a conta.

## Outras páginas

Gerenciador possui Naturezas, Entidades e Contas. **Contas** tem apenas a tabela: a função Rastreada define as filas automaticamente pelo sinal: créditos em Conciliação e débitos em Liquidação; Operacional participa do Extrato; Neutra é exclusiva para controle de saldos. Contas neutras não aparecem nas opções de movimentação nem na listagem do Extrato. Alterar a função não apaga registros históricos. Cadastros referenciados continuam protegidos contra exclusão para preservar referências válidas.

Importação → Qprof substitui a base de títulos; Extratos importa os arquivos bancários. Dashboards → Home permanece preparado, sem indicadores.

## Validação

`npm test` cobre centavos, transações, snapshots, desvinculação, edição concorrente, status independente, cascades, migração histórica, persistência, arquitetura e PDF multipágina.

`npm run test:ui` cobre navegação, tabelas e rolagem, filtros, edição, registros manuais nas três abas, confirmação, atualização da composição, PDF, exclusão de extrato rastreado e mobile. Os testes usam bancos isolados.

## Importação → Extratos

Os cards são Bradesco **57420-1** (agência 3, XLS), Singulare **89727720** (Rastreada, CSV) e Singulare **59697697** (Operacional, CSV). Selecione ou arraste um arquivo para seu card, confira **Data início** e **Data fim** e clique em **Atualizar**. Selecionar/arrastar não grava dados. O início padrão é o dia anterior, recuando até sexta-feira quando cair no fim de semana; o fim é hoje, ambos no fuso de São Paulo. O intervalo é inclusivo.

O resultado informa registros novos, já importados e fora do período. Arquivo de outra conta, formato desconhecido, data/valor inválido ou saldo inconsistente não grava movimentações. Falhas mantêm o arquivo para nova tentativa. Cada banco tem seu próprio leitor e compartilha apenas a validação/gravação da importação.

A Singulare contém saldos disponíveis entre grupos de movimentos e um resumo financeiro final com horário 00:00:00. O resumo nunca é uma movimentação; o saldo utilizado vem da linha SALDO DISPONIVEL associada ao último movimento do período. No Bradesco, os blocos Extrato e Últimos Lançamentos são lidos em sequência; SALDO ANTERIOR e Total são usados apenas na conferência. O Bradesco não informa horário: a Atualização exibe somente a data.

Saldo Banco é atualizado com a última posição elegível, preservando uma observação mais recente já importada. Se Sistema e Banco forem iguais, Saldo final é preenchido automaticamente. Divergências mantêm o saldo final anterior e geram aviso. Não há geração automática de ajustes para forçar igualdade; a abertura deve corresponder ao saldo anterior real.


## Importação → Qprof

Arraste ou selecione a planilha e clique em **Atualizar títulos**. Selecionar o arquivo não inicia a importação. A nova base substitui integralmente a anterior; não há período de importação nem geração de movimentações. Composições já salvas preservam seus itens. Arquivos inválidos não modificam a base anterior e exibem a linha com problema. Atualizações concorrentes exigem recarregar a página para conferir a base vigente.

Formato: XLSX ou XLS, uma aba, cabeçalhos na primeira linha, até 25 MB e 100.000 títulos. São aproveitados apenas Cedente, Sacado, S. Núm. (Título), Vlr. Pago (Valor), Dta. Liq. (Data de liquidação), Carteira e Cart. Interna. As colunas são identificadas pelos cabeçalhos, evitando deslocamento de dados. Os valores devem ser positivos e as datas válidas. Número do título pode se repetir. Valores numéricos e datas Excel são lidos pelo conteúdo, independentemente da aparência americana das células.


Em **Todos os títulos**, pesquise por palavras ou início de palavras/números, ou use o filtro padrão para combinar Título, Cedente, Sacado, Valor, Data de liquidação (início/fim), Carteira e Carteira interna. Carteira e Carteira interna usam seletores preenchidos com os valores distintos da base Qprof e correspondência exata. Em Vinculados, os seletores também incluem valores dos itens salvos, mesmo após substituir a base. Os demais filtros textuais localizam trechos; a pesquisa desconsidera acentos. Limpar todos os critérios volta ao estado inicial, sem carregar títulos. A pesquisa descarta respostas de buscas anteriores e mantém os itens vinculados ao trocar de página de resultados.

Os cards de Qprof e Extratos exibem o indicador ao lado da última importação: **Atualizado** (verde) quando a importação ocorreu hoje no fuso de São Paulo; **Desatualizado** (amarelo) quando é de outro dia ou ainda não há importação. A indicação acompanha a virada do dia enquanto a página permanece aberta.

## Seleção e planilha do Extrato

**Selecionar todos** completa a seleção de todos os registros encontrados pelos filtros, em todas as páginas. Quando todos estão selecionados, o mesmo botão desmarca esse conjunto. **Exportar** gera `extrato.xlsx` com os IDs e as colunas da tabela; respeita os filtros e, quando houver seleção, exporta somente os selecionados dentro deles.

Para editar no Excel, preserve os IDs e cabeçalhos. Status aceita Pendente, Conciliado e Estorno. Entidade, Natureza e Conta usam os nomes dos cadastros; entidade e natureza podem ficar vazias. Valor é uma célula numérica em reais, inclusive negativo. Use **Importar → Conferir arquivo → Importar alterações**. A conferência informa quantas linhas mudaram e não grava dados. A confirmação atualiza os registros existentes pelo ID; não cria nem exclui movimentações. Aceita XLSX/XLS e o CSV anteriormente exportado, até 8 MB e 10.000 registros. IDs repetidos, inexistentes ou campos inválidos impedem o lote inteiro. Uma coluna técnica oculta de revisão protege contra sobrescrever mudanças feitas depois da exportação; a conferência também protege alterações concorrentes.

Os campos monetários aceitam `1.000`, `1.234,56`, `1234.56` e valores copiados como `-R$ 6,35`. O prefixo R$ identifica a unidade; a formatação brasileira aparece ao sair do campo. Valores inválidos são sinalizados e não reaplicam um valor anterior. O filtro compara centavos e respeita o sinal no Extrato.

Na **Composição por títulos**, a caixa no cabeçalho da coluna de ações seleciona/vincula todos os títulos encontrados na busca e filtros, incluindo outras páginas. A seleção parcial é completada sem duplicar itens; a seleção completa pode ser desfeita para o mesmo conjunto. Vínculos fora do filtro são preservados. Em Vinculados, a caixa remove do rascunho os itens filtrados, em todas as páginas. As alterações só são persistidas ao confirmar o rastreio. O limite é de 2.000 itens por composição; acima disso é necessário refinar os filtros.

Na aba **Rastreio**, composições salvas abrem somente para consulta. Clique em **Editar** no resumo para liberar inclusão, edição e desvinculação; o botão passa a **Salvar alterações**. Salvar ou cancelar devolve a composição à visualização. Os filtros de **Todos os títulos** e **Vinculados** são independentes. Criar um item manual limpa a busca e os filtros de Vinculados e abre a página do item para exibi-lo imediatamente; os critérios de busca na base Qprof são preservados.
