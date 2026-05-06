#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "app", "api", "cards", "installments", "route.ts");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  console.error("Rode este script na raiz do projeto UltimatePlanner.");
  process.exit(1);
}

const backup = `${file}.backup-before-installment-delete-fix`;
let text = fs.readFileSync(file, "utf8");
const original = text;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, original, "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

if (!/action:\s*z\.literal\("delete_plan_by_id"\)/.test(text)) {
  text = text.replace(
    /z\.object\(\{\s*action:\s*z\.literal\("delete_plan"\),\s*id:\s*z\.string\(\)\.uuid\([^)]*\)\s*\}\)/,
    `$&
  ,
  z.object({
    action: z.literal("delete_plan_by_id"),
    id: z.string().uuid("Parcelamento inválido.")
  })`
  );
}

if (!/target_plan_id:\s*payload\.id/.test(text)) {
  const marker = /if\s*\(\s*payload\.action\s*===\s*"delete_plan"\s*\)\s*\{/;
  const match = text.match(marker);

  if (match && match.index !== undefined) {
    const block = `
    if (payload.action === "delete_plan_by_id") {
      const { data, error } = await context.supabase.rpc("delete_credit_installment_plan", {
        target_plan_id: payload.id
      });

      if (error) return jsonError(error.message, 500);

      const result = Array.isArray(data) ? (data[0] as DeletePlanResult | undefined) : undefined;

      if (result?.card_id && result.billing_months?.length) {
        await recalculateInvoicesForCardMonths(context.supabase, context.user.id, result.card_id, result.billing_months);
      }

      return NextResponse.json({
        ok: true,
        behavior: "entire_credit_installment_plan_deleted"
      });
    }

`;
    text = text.slice(0, match.index) + block + text.slice(match.index);
  }
}

const deleteBlockRegex = /if\s*\(\s*payload\.action\s*===\s*"delete"\s*\)\s*\{[\s\S]*?return\s+NextResponse\.json\(\{\s*data\s*\}\);\s*\}/m;

if (deleteBlockRegex.test(text) && !/delete_credit_installment_from_transaction/.test(text)) {
  text = text.replace(deleteBlockRegex, `if (payload.action === "delete") {
      const { data, error } = await context.supabase.rpc("delete_credit_installment_from_transaction", {
        target_transaction_id: payload.id
      });

      if (error) return jsonError(error.message, 500);

      const result = Array.isArray(data) ? (data[0] as DeletePlanResult | undefined) : undefined;

      if (result?.card_id && result.billing_months?.length) {
        await recalculateInvoicesForCardMonths(context.supabase, context.user.id, result.card_id, result.billing_months);
      }

      return NextResponse.json({
        ok: true,
        behavior: "single_credit_installment_deleted"
      });
    }`);
}

if (text === original) {
  console.log("Nenhuma alteração automática foi feita. Talvez o arquivo já esteja corrigido ou tenha estrutura diferente.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
}
