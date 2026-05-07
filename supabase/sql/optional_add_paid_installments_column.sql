/*
  Alternativa se você preferir criar a coluna no banco em vez de remover do código.
  Eu NÃO recomendo como primeira opção, porque o app já consegue calcular parcelas pagas
  pelas tabelas de transações/parcelas. Use apenas se quiser manter compatibilidade
  com patches antigos que ainda escrevem em paid_installments.
*/

alter table public.installment_plans
add column if not exists paid_installments integer not null default 0;

update public.installment_plans p
set paid_installments = coalesce(src.paid_count, 0)
from (
  select
    installment_plan_id,
    count(*) filter (where status = 'paid')::integer as paid_count
  from public.installments
  where installment_plan_id is not null
  group by installment_plan_id
) src
where p.id = src.installment_plan_id;
