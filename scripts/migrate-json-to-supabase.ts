import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerId = process.env.MIGRATION_OWNER_ID;
const sourcePath = process.argv[2] || "./export.json";

if (!url || !serviceRole || !ownerId) {
  throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e MIGRATION_OWNER_ID antes de migrar.");
}

const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

type LegacyRecord = Record<string, any>;
type LegacyData = Record<string, LegacyRecord[]>;

type IdMap = Map<string, string>;

function withOwner(record: LegacyRecord) {
  return {
    owner_id: ownerId,
    legacy_id: record.id ? String(record.id) : null,
    metadata: record
  };
}

function money(value: unknown) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function truthyDeleted(item: LegacyRecord) {
  return Boolean(item.isDeleted || item.is_deleted || item.deleted);
}

function normalizeTransactionType(type: unknown) {
  const value = String(type || "expense");
  if (["income", "expense", "transfer", "adjust", "card_expense", "invoice_payment"].includes(value)) return value;
  if (value === "adjustment") return "adjust";
  return "expense";
}

async function upsert(table: string, rows: Record<string, any>[]) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from(table).upsert(rows, { onConflict: "owner_id,legacy_id" }).select("id, legacy_id");
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`${table}: ${rows.length} registros processados`);
  return data || [];
}

function mapRows(rows: { id: string; legacy_id: string | null }[]) {
  const map: IdMap = new Map();
  for (const row of rows) {
    if (row.legacy_id) map.set(String(row.legacy_id), row.id);
  }
  return map;
}

function legacyRef(map: IdMap, value: unknown) {
  if (!value) return null;
  return map.get(String(value)) || null;
}

async function main() {
  const absolute = path.resolve(sourcePath);
  const data = JSON.parse(await fs.readFile(absolute, "utf8")) as LegacyData;

  const accountRows = await upsert("accounts", (data.accounts || []).map((item) => ({
    ...withOwner(item),
    name: item.name || item.title || "Conta",
    institution: item.bankName || item.bank || item.institution || null,
    type: item.type || "checking",
    initial_balance: money(item.initialBalance || item.initial_balance),
    current_balance: money(item.balance || item.currentBalance || item.current_balance || item.initialBalance),
    color: item.color || null,
    icon: item.icon || null,
    is_archived: Boolean(item.isArchived || item.archived),
    is_deleted: truthyDeleted(item)
  })));
  const accountMap = mapRows(accountRows);

  const categoryRowsFromFile = (data.categories || []).map((item) => ({
    ...withOwner(item),
    name: item.name || "Categoria",
    type: item.type || "expense",
    color: item.color || null,
    icon: item.icon || null,
    is_archived: Boolean(item.isArchived || item.archived),
    is_deleted: truthyDeleted(item)
  }));

  const categoryNamesFromTransactions = Array.from(
    new Set((data.transactions || []).map((item) => String(item.category || "").trim()).filter(Boolean))
  ).map((name) => ({
    owner_id: ownerId,
    legacy_id: `category:${name}`,
    name,
    type: "expense",
    color: null,
    icon: null,
    is_archived: false,
    is_deleted: false,
    metadata: { generated_from_legacy_transaction_category: true }
  }));

  const categoryRows = await upsert("categories", [...categoryRowsFromFile, ...categoryNamesFromTransactions]);
  const categoryMap = mapRows(categoryRows);
  const categoryByName = new Map<string, string>();
  for (const row of categoryRows) {
    if (row.legacy_id?.startsWith("category:")) categoryByName.set(row.legacy_id.replace("category:", ""), row.id);
  }

  await upsert("credit_cards", (data.creditCards || []).map((item) => ({
    ...withOwner(item),
    name: item.name || "Cartão",
    brand: item.brand || null,
    limit_amount: money(item.limit || item.limitAmount || item.limit_amount),
    closing_day: Number(item.closingDay || item.closing_day || 1),
    due_day: Number(item.dueDay || item.due_day || 1),
    color: item.color || null,
    is_archived: Boolean(item.isArchived || item.archived)
  })));

  await upsert("projects", (data.projects || []).map((item) => ({
    ...withOwner(item),
    name: item.name || "Projeto",
    description: item.description || item.notes || null,
    target_amount: money(item.targetAmount || item.target_amount || item.budget),
    current_amount: money(item.currentAmount || item.current_amount || item.savedAmount),
    status: item.status || "active",
    color: item.color || null,
    image_url: item.imageUrl || item.image_url || null
  })));

  await upsert("goals", (data.goals || []).map((item) => ({
    ...withOwner(item),
    name: item.name || "Meta",
    description: item.description || item.notes || null,
    target_amount: money(item.targetAmount || item.target_amount),
    current_amount: money(item.currentAmount || item.current_amount),
    due_date: item.dueDate || item.due_date || null,
    status: item.status || "active",
    color: item.color || null
  })));

  await upsert("investments", (data.investments || []).map((item) => ({
    ...withOwner(item),
    name: item.name || item.assetName || "Investimento",
    ticker: item.ticker || null,
    asset_type: item.assetType || item.type || "other",
    quantity: money(item.quantity),
    average_price: money(item.averagePrice || item.average_price),
    current_price: money(item.currentPrice || item.current_price || item.value)
  })));

  await upsert("installment_plans", (data.installmentPlans || []).map((item) => ({
    ...withOwner(item),
    description: item.description || item.name || "Parcelamento",
    total_amount: money(item.totalAmount || item.total_amount),
    installments_count: Number(item.installmentsCount || item.installments_count || item.totalInstallments || 1),
    remaining_installments: Number(item.remainingInstallments || item.remaining_installments || 0),
    payment_method: item.paymentMethod === "debit" ? "debit" : "credit_card",
    first_date: item.firstDate || item.first_date || item.date || new Date().toISOString().slice(0, 10),
    status: item.status || "active"
  })));

  await upsert("transactions", (data.transactions || []).map((item) => {
    const categoryName = String(item.category || "").trim();
    return {
      ...withOwner(item),
      description: item.description || item.name || "Transação",
      type: normalizeTransactionType(item.type),
      amount: money(item.amount),
      date: item.date || new Date().toISOString().slice(0, 10),
      billing_month: item.billingMonth || item.billing_month || null,
      account_id: legacyRef(accountMap, item.accountId || item.account_id),
      destination_account_id: legacyRef(accountMap, item.destinationAccountId || item.destination_account_id),
      category_id: legacyRef(categoryMap, item.categoryId || item.category_id) || categoryByName.get(categoryName) || null,
      recurrence_key: item.recurrenceKey || item.recurrence_key || null,
      status: item.status === "scheduled" ? "planned" : item.status || "posted",
      is_paid: Boolean(item.isPaid || item.is_paid),
      notes: item.notes || null,
      is_deleted: truthyDeleted(item)
    };
  }));

  console.log("Migração base finalizada. Revise vínculos por legacy_id antes de remover a estrutura antiga.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
