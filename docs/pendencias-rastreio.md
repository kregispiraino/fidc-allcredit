# Pendências de rastreio

Conciliação e Liquidação mostram movimentos sem composição ou com diferença/valores não preenchidos. Ausência de associação ao Extrato e status históricos de atenção não mantêm uma composição fechada nessas filas. As composições concluídas continuam consultáveis no Rastreio.

A aba Pendências mostra recebimentos que aguardam saída: o campo calculado `aguarda_saida` exige crédito, título/parcial (ou recebimento sem título identificado) e saldo restante positivo ou ainda não informado. Saídas parciais mantêm o saldo restante; quitar retira o item, e desvincular a saída reabre a pendência. Itens somente com débito, tarifas, custas e outros ajustes não entram nessa fila.

O card Aguardam saída usa o mesmo conjunto da tabela. A página exibe 25 linhas por página com rolagem vertical pela página e rolagem horizontal na tabela.

Compor saída reutiliza o `registro_id` do recebimento, inclusive depois de substituir a base Qprof. Não cria título ou movimento bancário adicional. O percurso do título permite consultar entradas, saídas e compensações.

A importação histórica pode ter uma dispensa explícita em `pendencia_dispensa`, auditável na base. Essa condição não é atribuída aos novos registros e não fabrica saídas. Compensações são registradas separadamente do total bancário. Os relatórios e instruções da revisão da base real ficam somente no arquivo privado de implantação.

Tipos únicos: Título, Parcial, Tarifa, Custas e Ajuste. A categoria original de uma importação histórica é proveniência, não um tipo disponível para novos cadastros.
