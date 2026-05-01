# Checklist de Testes — UltimatePlanner migrado

## Login

- [ ] Criar usuário via Supabase Auth.
- [ ] Entrar com e-mail/senha.
- [ ] Sair e entrar novamente.
- [ ] Confirmar que usuário A não vê dados do usuário B.

## Contas

- [ ] Criar conta.
- [ ] Editar conta.
- [ ] Arquivar/excluir conta.
- [ ] Confirmar saldo derivado a partir das transações.

## Categorias

- [ ] Criar categoria de receita.
- [ ] Criar categoria de despesa.
- [ ] Editar categoria.
- [ ] Excluir categoria sem quebrar transações antigas.

## Transações

- [ ] Criar receita.
- [ ] Criar despesa.
- [ ] Criar transferência.
- [ ] Criar ajuste positivo.
- [ ] Criar ajuste negativo.
- [ ] Editar transação.
- [ ] Excluir transação.
- [ ] Confirmar aviso de conta negativa.
- [ ] Filtrar por mês.
- [ ] Buscar por descrição, conta, cartão ou categoria.

## Cartões e faturas

- [ ] Criar cartão com fechamento/vencimento.
- [ ] Lançar compra à vista.
- [ ] Lançar compra parcelada por valor total.
- [ ] Lançar compra parcelada por valor de cada parcela.
- [ ] Confirmar que parcelas não somam tudo no primeiro mês.
- [ ] Confirmar competência da fatura por data de compra/fechamento.
- [ ] Pagar fatura.
- [ ] Confirmar baixa na conta.
- [ ] Editar parcela do cartão.
- [ ] Excluir parcela do cartão.
- [ ] Adiantar parcela para a fatura selecionada.

## Recorrências

- [ ] Criar receita recorrente mensal.
- [ ] Criar gasto recorrente em conta.
- [ ] Criar gasto recorrente em cartão.
- [ ] Confirmar lançamentos futuros no histórico.
- [ ] Confirmar receitas recorrentes em projeções mensais.
- [ ] Editar recorrência e recalcular lançamentos futuros.
- [ ] Excluir recorrência e remover lançamentos futuros.
- [ ] Confirmar que lançamentos passados permanecem.
- [ ] Verificar duplicidade usando `recurrence_key`.

## Parcelamento no débito

- [ ] Criar parcelamento por valor total.
- [ ] Criar parcelamento por valor de parcela.
- [ ] Expandir e recolher cartão de parcelamento.
- [ ] Marcar parcela como paga.
- [ ] Adiantar parcela futura.
- [ ] Editar parcela individual.
- [ ] Excluir parcela individual.
- [ ] Excluir parcelamento inteiro.
- [ ] Confirmar atualização de parcelas pendentes.
- [ ] Confirmar impacto no saldo derivado.

## Projetos/metas

- [ ] Criar projeto.
- [ ] Criar meta.
- [ ] Adicionar movimentação.
- [ ] Remover movimentação.
- [ ] Compartilhar com outro usuário.
- [ ] Confirmar histórico de atividade.

## Investimentos

- [ ] Criar corretora/conta de investimento.
- [ ] Criar ativo.
- [ ] Registrar aporte.
- [ ] Registrar resgate.
- [ ] Confirmar agrupamento por corretora.

## Dashboard

- [ ] Confirmar receitas do mês.
- [ ] Confirmar despesas do mês.
- [ ] Confirmar faturas do mês.
- [ ] Confirmar recorrências futuras.
- [ ] Confirmar filtros e responsividade.

## Mobile

- [ ] Login no celular.
- [ ] Menu mobile.
- [ ] Navegação entre módulos.
- [ ] Modais em telas pequenas.
- [ ] Tabelas com rolagem horizontal.

## Permissões e segurança

- [ ] RLS ativo no Supabase.
- [ ] Usuário só acessa seus dados.
- [ ] Itens compartilhados aparecem para participantes.
- [ ] Participante não gerencia dono/compartilhamento.
- [ ] Nenhuma chave sensível no front-end.

## Etapa 4 — Projetos, metas e compartilhamento

- [ ] Criar projeto.
- [ ] Editar nome, descrição, ícone e tema do projeto.
- [ ] Criar item planejado em projeto.
- [ ] Marcar item como concluído.
- [ ] Reabrir item concluído.
- [ ] Editar item planejado.
- [ ] Excluir item planejado.
- [ ] Registrar aporte no projeto.
- [ ] Registrar retirada no projeto.
- [ ] Conferir total estimado, caixa, progresso e falta cobrir.
- [ ] Conferir analytics por categoria.
- [ ] Conferir histórico do projeto.
- [ ] Compartilhar projeto com outro usuário como viewer.
- [ ] Confirmar que viewer não edita.
- [ ] Compartilhar projeto como editor.
- [ ] Confirmar que editor edita itens e movimentos.
- [ ] Remover usuário compartilhado.
- [ ] Criar meta.
- [ ] Editar meta.
- [ ] Registrar aporte na meta.
- [ ] Registrar retirada da meta.
- [ ] Conferir progresso automático.
- [ ] Conferir status completed quando atinge 100%.
- [ ] Conferir histórico da meta.
- [ ] Compartilhar meta como viewer/editor.
- [ ] Remover compartilhamento de meta.

## Etapa 5 — Investimentos

- [ ] Rodar `supabase/migrations/0006_etapa_5_investments.sql` no Supabase.
- [ ] Criar corretora/conta de investimento.
- [ ] Editar corretora.
- [ ] Excluir corretora por exclusão lógica.
- [ ] Criar posição inicial de ativo.
- [ ] Editar posição.
- [ ] Excluir posição por exclusão lógica.
- [ ] Registrar aporte na corretora.
- [ ] Confirmar aumento do caixa da corretora.
- [ ] Registrar retirada da corretora.
- [ ] Confirmar redução do caixa.
- [ ] Registrar compra de ativo.
- [ ] Confirmar redução do caixa, aumento da quantidade e recalculo do preço médio.
- [ ] Registrar venda de ativo.
- [ ] Confirmar aumento do caixa e redução da quantidade.
- [ ] Registrar dividendo/provento.
- [ ] Registrar rendimento.
- [ ] Registrar taxa.
- [ ] Registrar ajuste manual.
- [ ] Editar movimentação e confirmar que o efeito antigo foi revertido e o novo aplicado.
- [ ] Excluir movimentação e confirmar reversão do efeito.
- [ ] Criar alocação alvo por classe de ativo.
- [ ] Criar alocação alvo por ativo.
- [ ] Conferir distribuição por classe.
- [ ] Conferir distribuição por corretora.
- [ ] Conferir histórico de atividade.
- [ ] Testar tela no mobile.

## Etapa 9 — checklist financeiro pesado

- [ ] Saldo de conta não muda ao lançar compra no cartão.
- [ ] Saldo de conta muda ao pagar fatura.
- [ ] Pagamento parcial reduz fatura aberta.
- [ ] Dashboard não soma compra no cartão + pagamento da mesma fatura como duas despesas de caixa.
- [ ] Parcelas de crédito respeitam competência de fatura.
- [ ] Parcelas de débito afetam conta na data da parcela.
- [ ] Adiantamento de parcela muda a competência/data correta.
- [ ] Exclusão de parcela recalcula fatura e plano.
- [ ] Exclusão de transação vinculada a fatura recalcula fatura.
- [ ] Recorrências não duplicam lançamentos.
- [ ] Auditoria `/api/finance/audit` não retorna erros críticos.

## Etapa 10 — segurança, RLS e compartilhamento

- [ ] Rodar `supabase/migrations/0007_etapa_10_security_rls.sql`.
- [ ] Confirmar que o app abre com o usuário A.
- [ ] Criar usuário B.
- [ ] Confirmar que B não vê contas/transações/cartões/investimentos privados de A.
- [ ] Compartilhar projeto de A com B como `viewer`.
- [ ] Confirmar que B vê o projeto.
- [ ] Confirmar que B não edita como `viewer`.
- [ ] Alterar B para `editor`.
- [ ] Confirmar que B consegue editar itens/movimentos do projeto.
- [ ] Confirmar que B não consegue gerenciar participantes.
- [ ] Remover B do projeto e confirmar que ele perde acesso.
- [ ] Repetir viewer/editor/remover para metas.
- [ ] Testar busca de perfis com menos de 2 caracteres.
- [ ] Testar busca de perfis com nome/e-mail real.
- [ ] Confirmar que `owner_id` não pode ser alterado por update.

## Etapa 11 — Consultor IA e cores

- [ ] Criar conta usando seletor visual de cor.
- [ ] Criar categoria usando seletor visual de cor.
- [ ] Criar cartão usando seletor visual de cor.
- [ ] Criar projeto usando seletor visual de cor.
- [ ] Criar meta usando seletor visual de cor.
- [ ] Criar corretora usando seletor visual de cor.
- [ ] Abrir `/ai` e testar análise rápida de compra no crédito.
- [ ] Testar análise de compra à vista/débito.
- [ ] Confirmar que a IA diferencia saldo atual, fatura futura e projeção.
- [ ] Confirmar que a IA não trata investimentos como dinheiro livre.
