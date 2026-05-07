type SupabaseLike = {
  from: (table: string) => any;
};

export type AutocompleteSuggestion = {
  id: string;
  label: string;
  value: string;
  type: "category" | "transaction" | "project_item" | "recurring_rule";
  helper?: string | null;
};

function normalizeQuery(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function escapeIlike(term: string) {
  return term.replace(/[%_\\]/g, "\\$&");
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function uniqueByValue(items: AutocompleteSuggestion[]) {
  const map = new Map<string, AutocompleteSuggestion>();

  for (const item of items) {
    const key = `${item.type}:${item.value.toLowerCase()}`;

    if (!map.has(key)) map.set(key, item);
  }

  return Array.from(map.values());
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";

  const value = (metadata as Record<string, unknown>)[key];

  return typeof value === "string" ? value.trim() : "";
}

export async function buildFinancialAutocompleteSuggestions(input: {
  supabase: SupabaseLike;
  ownerId: string;
  query: string;
  scope?: string | null;
}) {
  const query = normalizeQuery(input.query);

  if (query.length < 2) return [];

  const safeQuery = escapeIlike(query);
  const pattern = `%${safeQuery}%`;
  const scope = normalizeText(input.scope || "all");
  const suggestions: AutocompleteSuggestion[] = [];

  const shouldSearchCategories = ["all", "category", "categories"].includes(scope);
  const shouldSearchTransactions = ["all", "transaction", "transactions", "description"].includes(scope);
  const shouldSearchProjects = ["all", "project", "projects", "project_item"].includes(scope);
  const shouldSearchRecurring = ["all", "recurring", "recurring_rule"].includes(scope);

  if (shouldSearchCategories) {
    const { data } = await input.supabase
      .from("categories")
      .select("id,name,type")
      .eq("owner_id", input.ownerId)
      .eq("is_deleted", false)
      .ilike("name", pattern)
      .limit(12);

    for (const category of data || []) {
      const value = normalizeText(category.name);

      if (!value) continue;

      suggestions.push({
        id: `category:${category.id}`,
        label: value,
        value,
        type: "category",
        helper: category.type || "Categoria"
      });
    }
  }

  if (shouldSearchTransactions) {
    const { data } = await input.supabase
      .from("transactions")
      .select("id,description,type,amount")
      .eq("owner_id", input.ownerId)
      .eq("is_deleted", false)
      .ilike("description", pattern)
      .order("created_at", { ascending: false })
      .limit(12);

    for (const transaction of data || []) {
      const value = normalizeText(transaction.description);

      if (!value) continue;

      suggestions.push({
        id: `transaction:${transaction.id}`,
        label: value,
        value,
        type: "transaction",
        helper: transaction.type || "Transação"
      });
    }
  }

  if (shouldSearchProjects) {
    const { data } = await input.supabase
      .from("project_items")
      .select("id,name,amount,metadata")
      .eq("owner_id", input.ownerId)
      .eq("is_deleted", false)
      .ilike("name", pattern)
      .limit(12);

    for (const item of data || []) {
      const value = normalizeText(item.name);
      const category = metadataValue(item.metadata, "category");

      if (!value) continue;

      suggestions.push({
        id: `project_item:${item.id}`,
        label: value,
        value,
        type: "project_item",
        helper: category || "Item de projeto"
      });
    }
  }

  if (shouldSearchRecurring) {
    const { data } = await input.supabase
      .from("recurring_rules")
      .select("id,name,rule_type,amount")
      .eq("owner_id", input.ownerId)
      .eq("is_active", true)
      .ilike("name", pattern)
      .limit(12);

    for (const rule of data || []) {
      const value = normalizeText(rule.name);

      if (!value) continue;

      suggestions.push({
        id: `recurring_rule:${rule.id}`,
        label: value,
        value,
        type: "recurring_rule",
        helper: rule.rule_type || "Recorrência"
      });
    }
  }

  return uniqueByValue(suggestions).slice(0, 24);
}
