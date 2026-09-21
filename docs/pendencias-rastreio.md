# Pendências de rastreio

Conciliação e Liquidação mostram movimentos sem composição ou com diferença/valores não preenchidos. Ausência de associação ao Extrato e status históricos de atenção não mantêm uma composição fechada nessas filas. As composições concluídas continuam consultáveis no Rastreio.

A aba Pendências mostra recebimentos que aguardam saída: o campo calculado `aguarda_saida` exige crédito, título/parcial (ou recebimento sem título identificado) e saldo restante positivo ou ainda não informado. Saídas parciais mantêm o saldo restante; quitar retira o item, e desvincular a saída reabre a pendência. Itens somente com débito, tarifas, custas e outros ajustes não entram nessa fila.

O card Aguardam saída usa o mesmo conjunto da tabela. A página exibe 25 linhas por página com rolagem vertical pela página e rolagem horizontal na tabela.

Compor saída reutiliza o `registro_id` do recebimento, inclusive depois de substituir a base Qprof. Não cria título ou movimento bancário adicional. O percurso do título permite consultar entradas, saídas e compensações.

A importação histórica pode ter uma dispensa explícita em `pendencia_dispensa`, auditável na base. Essa condição não é atribuída aos novos registros e não fabrica saídas. Compensações são registradas separadamente do total bancário. Os relatórios e instruções da revisão da base real ficam somente no arquivo privado de implantação.

Tipos únicos: Título, Parcial, Tarifa, Custas e Ajuste. A categoria original de uma importação histórica é proveniência, não um tipo disponível para novos cadastros.

## Identidade e reimportação

O ID da linha Qprof não identifica o título no rastreio. O domínio normaliza o número (capitalização, acentos, espaços e pontuação; preserva zeros e dígitos de parcelas) e reutiliza o cadastro existente. Números iguais de cedentes distintos existem na base e permanecem separados. O cedente também é normalizado; quando está ausente, o número só é associado automaticamente se houver uma única identidade possível.

Registros históricos com IDs diferentes para a mesma identidade são agregados na leitura. O percurso de qualquer um desses IDs mostra todos os vínculos. Os IDs, valores, transferências e informações de auditoria originais são preservados. Não há baixa manual nem exceção por data, TED ou número de título.

A regra usa os valores atuais de composição: `saldo = entradas - saídas - compensações`. Recebimentos com saldo positivo ou alocação desconhecida aguardam saída. Saídas parciais reduzem esse saldo; saldo zero encerra a pendência, inclusive quando a fonte histórica tinha um status provisório. Movimentos marcados como legado sem rastreio são excluídos do cálculo. Pendências e a aba Todas as pendências usam o mesmo `controlRecords` e o campo `aguarda_saida`.

A importação Qprof renova a seleção ativa, mas preserva os cadastros e IDs para reimportações futuras. Títulos ausentes do último arquivo ficam inativos na busca, mantendo seus vínculos. Duplicatas idênticas no arquivo são reutilizadas; baixas conflitantes para a mesma identidade são rejeitadas antes da gravação. Os snapshots das composições não são alterados pela importação.

CSV é lido diretamente, além de XLS/XLSX. São aceitos ponto e vírgula, vírgula ou tabulação, campos entre aspas, BOM e UTF-8, UTF-16 ou Windows-1252. A coluna Situação tem precedência sobre Status: somente BAIXADO é aceito quando a situação está presente. Nos relatórios sem essa coluna, permanecem obrigatórios valor pago positivo e data de liquidação válida.

A busca na aba Rastreio filtra todas as transferências pelos números nos vínculos, sem consultar Qprof. A seleção mostra quantidade e total antes de salvar, e mantém o total da composição salva separado. A troca de abas recarrega a fonte no servidor e preserva os rascunhos locais com controle de versão.
