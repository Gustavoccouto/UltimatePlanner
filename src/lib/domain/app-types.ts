export type AccountType = "checking" | "savings" | "investment";
export type CategoryType = "income" | "expense" | "transfer" | "investment" | "project" | "goal" | "card";
export type TransactionType = "income" | "expense" | "transfer" | "adjust" | "card_expense" | "invoice_payment";
export type TransactionStatus = "posted" | "planned" | "canceled";
export type InstallmentStatus = "pending" | "paid" | "anticipated" | "canceled";
export type InstallmentPaymentMethod = "debit" | "credit_card";
export type InvoiceStatus = "open" | "closed" | "paid" | "canceled";
export type RecurringRuleType = "recurring_income" | "recurring_expense";
export type RecurringTargetType = "account" | "card";
export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export type Metadata = Record<string, unknown>;

export type Account = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  name: string;
  institution?: string | null;
  type: AccountType;
  initial_balance: number | string;
  current_balance: number | string;
  color?: string | null;
  icon?: string | null;
  is_archived: boolean;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type Category = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  name: string;
  type: CategoryType;
  color?: string | null;
  icon?: string | null;
  is_archived: boolean;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type CreditCard = {
  id: string;
  owner_id: string;
  account_id?: string | null;
  legacy_id?: string | null;
  name: string;
  brand?: string | null;
  limit_amount: number | string;
  closing_day: number;
  due_day: number;
  color?: string | null;
  is_archived: boolean;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type Invoice = {
  id: string;
  owner_id: string;
  credit_card_id: string;
  billing_month: string;
  closing_date?: string | null;
  due_date?: string | null;
  total_amount: number | string;
  paid_amount: number | string;
  status: InvoiceStatus;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type RecurringRule = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  name: string;
  rule_type: RecurringRuleType;
  target_type: RecurringTargetType;
  account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
  amount: number | string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  next_occurrence?: string | null;
  notes?: string | null;
  is_active: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type InstallmentPlan = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  description: string;
  total_amount: number | string;
  installments_count: number;
  remaining_installments: number;
  payment_method: InstallmentPaymentMethod;
  account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
  first_date: string;
  status: "active" | "settled" | "canceled";
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type Installment = {
  id: string;
  owner_id: string;
  installment_plan_id: string;
  installment_number: number;
  installments_count: number;
  description: string;
  amount: number | string;
  due_date: string;
  billing_month?: string | null;
  account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
  transaction_id?: string | null;
  status: InstallmentStatus;
  anticipated_at?: string | null;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type Transaction = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  description: string;
  type: TransactionType;
  amount: number | string;
  date: string;
  billing_month?: string | null;
  account_id?: string | null;
  destination_account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
  invoice_id?: string | null;
  recurring_rule_id?: string | null;
  installment_plan_id?: string | null;
  installment_id?: string | null;
  recurrence_key?: string | null;
  status: TransactionStatus;
  is_paid: boolean;
  notes?: string | null;
  metadata?: Metadata | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AccountSummary = Account & {
  derived_balance: number;
  transaction_count: number;
};

export type SharedItemRole = "viewer" | "editor";
export type SharedItemType = "project" | "goal";
export type ProjectStatus = "active" | "completed" | "archived" | "canceled";
export type MovementType = "add" | "remove" | "adjust";

export type Profile = {
  id: string;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SharedItem = {
  id: string;
  owner_id: string;
  user_id: string;
  item_type: SharedItemType;
  item_id: string;
  role: SharedItemRole;
  created_at?: string;
  profile?: Profile | null;
};

export type ActivityLog = {
  id: string;
  owner_id: string;
  actor_id?: string | null;
  entity_type: string;
  entity_id?: string | null;
  action_type: string;
  field_name?: string | null;
  previous_value?: unknown;
  new_value?: unknown;
  metadata?: Metadata | null;
  created_at?: string;
  actor?: Profile | null;
};

export type Project = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  name: string;
  description?: string | null;
  target_amount: number | string;
  current_amount: number | string;
  status: ProjectStatus;
  color?: string | null;
  image_url?: string | null;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectItem = {
  id: string;
  owner_id: string;
  project_id: string;
  legacy_id?: string | null;
  name: string;
  amount: number | string;
  status: "pending" | "completed" | "canceled";
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectMovement = {
  id: string;
  owner_id: string;
  project_id: string;
  account_id?: string | null;
  actor_id?: string | null;
  type: MovementType;
  amount: number | string;
  description?: string | null;
  is_deleted?: boolean;
  created_at?: string;
};

export type Goal = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  name: string;
  description?: string | null;
  target_amount: number | string;
  current_amount: number | string;
  due_date?: string | null;
  status: ProjectStatus;
  color?: string | null;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type GoalMovement = {
  id: string;
  owner_id: string;
  goal_id: string;
  account_id?: string | null;
  actor_id?: string | null;
  type: MovementType;
  amount: number | string;
  description?: string | null;
  is_deleted?: boolean;
  created_at?: string;
};

export type InvestmentAccount = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  name: string;
  institution?: string | null;
  type: string;
  cash_balance?: number | string;
  color?: string | null;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type InvestmentAssetType = "stock" | "etf" | "fii" | "fixed_income" | "crypto" | "fund" | "savings" | "other";
export type InvestmentTransactionType = "buy" | "sell" | "deposit" | "withdraw" | "dividend" | "yield" | "fee" | "adjust";

export type Investment = {
  id: string;
  owner_id: string;
  investment_account_id?: string | null;
  legacy_id?: string | null;
  name: string;
  ticker?: string | null;
  asset_type: InvestmentAssetType | string;
  quantity: number | string;
  average_price: number | string;
  current_price: number | string;
  purchase_date?: string | null;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type InvestmentTransaction = {
  id: string;
  owner_id: string;
  investment_id?: string | null;
  investment_account_id?: string | null;
  type: InvestmentTransactionType;
  amount: number | string;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  fees?: number | string | null;
  date: string;
  notes?: string | null;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type InvestmentAllocationTarget = {
  id: string;
  owner_id: string;
  target_scope: "asset_type" | "asset" | string;
  target_key: string;
  label: string;
  target_percent: number | string;
  is_deleted?: boolean;
  metadata?: Metadata | null;
  created_at?: string;
  updated_at?: string;
};

export type AiChatMessage = {
  id: string;
  owner_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context?: Metadata | null;
  created_at?: string;
};
