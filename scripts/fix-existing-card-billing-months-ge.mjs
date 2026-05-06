#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();

function loadEnvFile(filename) {
  const file = path.join(root, filename);
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const onlyOwnerId = process.env.FIX_OWNER_ID || "";
const dryRun = process.argv.includes("--dry-run");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function clampDay(year, monthIndex, day) {
  return Math.min(Math.max(Number(day || 1), 1), new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

function normalizeBillingMonth(month) {
  if (!month) return "";
  const text = String(month);
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text.slice(0, 7)}-01`;
  return text;
}

function asDate(dateInput) {
  const text = String(dateInput || "");
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : /^\d{4}-\d{2}$/.test(text)
      ? `${text}-01`
      : normalizeBillingMonth(text);

  const [year, month, day] = normalized.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day || 1));
}

function addMonths(dateInput, months) {
  const date = asDate(dateInput);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  target.setUTCDate(clampDay(target.getUTCFullYear(), target.getUTCMonth(), date.getUTCDate()));
  return formatDate(target);
}

function calculateBillingMonth(purchaseDateInput, closingDay) {
  const purchaseDate = asDate(purchaseDateInput);
  const year = purchaseDate.getUTCFullYear();
  const month = purchaseDate.getUTCMonth();
  const day = purchaseDate.getUTCDate();
  const closing = clampDay(year, month, closingDay);

  /*
   * Nova regra solicitada:
   * dia >= fechamento => próxima fatura.
   */
  const invoiceMonthDate = new Date(Date.UTC(year, month + (day >= closing ? 1 : 0), 1));

  return formatDate(invoiceMonthDate);
}

function extractInstallmentNumber(transaction) {
  const metadata = transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {};

  return Math.max(
    1,
    Number(
      metadata.installment_number ||
      transaction.installment_number ||
      transaction.installment_current ||
      1
    )
  );
}

function extractOriginalPurchaseDate(transaction) {
  const metadata = transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {};
  const candidates = [
    metadata.purchase_date,
    metadata.original_purchase_date,
    metadata.first_purchase_date,
    metadata.first_date,
    transaction.purchase_date,
    transaction.original_purchase_date,
    transaction.date
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  }

  return transaction.date;
}

function calculateTransactionBillingMonth(transaction, card) {
  const installmentNumber = extractInstallmentNumber(transaction);
  const originalPurchaseDate = extractOriginalPurchaseDate(transaction);
  const firstBillingMonth = calculateBillingMonth(originalPurchaseDate, card.closing_day);

  return normalizeBillingMonth(addMonths(firstBillingMonth, installmentNumber - 1));
}

function getInvoiceDates(billingMonthInput, closingDay, dueDay) {
  const billingMonth = asDate(normalizeBillingMonth(billingMonthInput));
  const year = billingMonth.getUTCFullYear();
  const month = billingMonth.getUTCMonth();
  const closingDate = new Date(Date.UTC(year, month, clampDay(year, month, closingDay)));
  const dueMonthOffset = Number(dueDay) <= Number(closingDay) ? 1 : 0;
  const dueBase = new Date(Date.UTC(year, month + dueMonthOffset, 1));
  const dueDate = new Date(Date.UTC(
    dueBase.getUTCFullYear(),
    dueBase.getUTCMonth(),
    clampDay(dueBase.getUTCFullYear(), dueBase.getUTCMonth(), dueDay)
  ));

  return {
    billing_month: formatDate(new Date(Date.UTC(year, month, 1))),
    closing_date: formatDate(closingDate),
    due_date: formatDate(dueDate)
  };
}

async function ensureOk(response, context) {
  if (response.error) throw new Error(`${context}: ${response.error.message}`);
  return response.data;
}

async function recalculateInvoice(ownerId, card, billingMonth) {
  const normalized = normalizeBillingMonth(billingMonth);
  if (!normalized) return;

  const transactions = await ensureOk(
    await supabase
      .from("transactions")
      .select("amount,status,is_deleted")
      .eq("owner_id", ownerId)
      .eq("credit_card_id", card.id)
      .eq("billing_month", normalized)
      .eq("type", "card_expense"),
    `buscar transações da fatura ${normalized}`
  );

  const validTransactions = (transactions || []).filter(
    (transaction) => !transaction.is_deleted && transaction.status !== "canceled"
  );

  const totalAmount = money(validTransactions.reduce((sum, transaction) => sum + money(transaction.amount), 0));

  const { data: existing, error: existingError } = await supabase
    .from("invoices")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("credit_card_id", card.id)
    .eq("billing_month", normalized)
    .maybeSingle();

  if (existingError) throw new Error(`buscar fatura existente ${normalized}: ${existingError.message}`);

  const paidAmount = Math.min(money(existing?.paid_amount), totalAmount);
  const dates = getInvoiceDates(normalized, Number(card.closing_day), Number(card.due_day));
  const status = totalAmount <= 0 && paidAmount <= 0 ? "open" : paidAmount >= totalAmount && totalAmount > 0 ? "paid" : "open";

  if (dryRun) {
    console.log(`[DRY-RUN] Recalcularia fatura ${card.name || card.id} ${normalized}: ${totalAmount}`);
    return;
  }

  await ensureOk(
    await supabase
      .from("invoices")
      .upsert(
        {
          id: existing?.id,
          owner_id: ownerId,
          credit_card_id: card.id,
          billing_month: normalized,
          closing_date: dates.closing_date,
          due_date: dates.due_date,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          status,
          metadata: existing?.metadata || {}
        },
        { onConflict: "credit_card_id,billing_month" }
      ),
    `recalcular fatura ${normalized}`
  );
}

async function updateInstallmentFromTransaction(transaction, nextMonth) {
  const ids = new Set();

  if (transaction.installment_id) ids.add(transaction.installment_id);

  const metadata = transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {};
  if (typeof metadata.installment_id === "string") ids.add(metadata.installment_id);

  for (const installmentId of ids) {
    await ensureOk(
      await supabase
        .from("installments")
        .update({ billing_month: nextMonth })
        .eq("owner_id", transaction.owner_id)
        .eq("id", installmentId),
      `atualizar parcela ${installmentId}`
    );
  }

  return ids.size;
}

async function main() {
  let cardsQuery = supabase
    .from("credit_cards")
    .select("id,owner_id,name,closing_day,due_day,is_deleted,is_archived");

  if (onlyOwnerId) cardsQuery = cardsQuery.eq("owner_id", onlyOwnerId);

  const cards = await ensureOk(await cardsQuery, "buscar cartões");
  const activeCards = (cards || []).filter((card) => !card.is_deleted);

  let scannedTransactions = 0;
  let changedTransactions = 0;
  let changedInstallments = 0;
  let recalculatedInvoices = 0;

  for (const card of activeCards) {
    const touchedMonths = new Set();

    const transactions = await ensureOk(
      await supabase
        .from("transactions")
        .select("*")
        .eq("owner_id", card.owner_id)
        .eq("credit_card_id", card.id)
        .eq("type", "card_expense"),
      `buscar compras do cartão ${card.name || card.id}`
    );

    for (const transaction of transactions || []) {
      scannedTransactions += 1;

      if (transaction.is_deleted || transaction.status === "canceled") continue;

      const previousMonth = normalizeBillingMonth(transaction.billing_month);
      const nextMonth = calculateTransactionBillingMonth(transaction, card);

      if (previousMonth === nextMonth) continue;

      touchedMonths.add(previousMonth);
      touchedMonths.add(nextMonth);

      console.log(
        `${dryRun ? "[DRY-RUN] " : ""}${card.name || card.id}: ${transaction.description || transaction.id} | ${transaction.date} | ${previousMonth || "sem mês"} -> ${nextMonth}`
      );

      if (!dryRun) {
        await ensureOk(
          await supabase
            .from("transactions")
            .update({ billing_month: nextMonth })
            .eq("owner_id", card.owner_id)
            .eq("id", transaction.id),
          `atualizar transação ${transaction.id}`
        );

        changedInstallments += await updateInstallmentFromTransaction(transaction, nextMonth);
      }

      changedTransactions += 1;
    }

    for (const month of touchedMonths) {
      if (!month) continue;
      await recalculateInvoice(card.owner_id, card, month);
      recalculatedInvoices += 1;
    }
  }

  console.log("");
  console.log("Correção concluída.");
  console.log(`Transações analisadas: ${scannedTransactions}`);
  console.log(`Transações corrigidas: ${changedTransactions}`);
  console.log(`Parcelas corrigidas: ${changedInstallments}`);
  console.log(`Faturas recalculadas: ${recalculatedInvoices}`);
  if (dryRun) console.log("DRY-RUN: nenhuma alteração foi salva.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
