import { getAll, bulkPut } from './services/storage.js';
import { createId } from './utils/ids.js';
import { nowIso, formatDateInput } from './utils/dates.js';

export async function seedDemoData() {
  const hasAccounts = await getAll('accounts');
  if (hasAccounts.length) return;

  const ts = nowIso();
  const account1 = { id: createId('acct'), name: 'Conta principal', bankName: 'Nubank', type: 'checking', currency: 'BRL', createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 };
  const account2 = { id: createId('acct'), name: 'Reserva', bankName: 'Inter', type: 'savings', currency: 'BRL', createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 };
  const card = { id: createId('card'), name: 'Visa Black', brand: 'Visa', limitAmount: 8000, dueDay: 10, closingDay: 3, createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 };
  const plan = { id: createId('plan'), cardId: card.id, description: 'Notebook parcelado', totalAmount: 1800, installmentCount: 3, remainingInstallments: 2, purchaseDate: formatDateInput(), createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 };
  const goal = { id: createId('goal'), name: 'Reserva de emergência', category: 'Reserva', targetAmount: 12000, currentAmount: 3200, lastContribution: 500, targetDate: formatDateInput(), createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 };
  const investment = { id: createId('inv'), name: 'Tesouro Selic', type: 'Renda fixa', broker: 'Nubank', amountInvested: 2500, currentValue: 2680, purchaseDate: formatDateInput(), createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 };

  const transactions = [
    { id: createId('tx'), description: 'Salário', type: 'income', accountId: account1.id, amount: 5200, category: 'Renda', date: formatDateInput(), createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 },
    { id: createId('tx'), description: 'Mercado', type: 'expense', accountId: account1.id, amount: 620, category: 'Alimentação', date: formatDateInput(), createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 },
    { id: createId('tx'), description: 'Transferência para reserva', type: 'transfer', accountId: account1.id, destinationAccountId: account2.id, amount: 1200, category: 'Reserva', date: formatDateInput(), createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 },
    { id: createId('tx'), description: 'Notebook 1/3', type: 'card_expense', cardId: card.id, installmentPlanId: plan.id, accountId: '', amount: 600, category: 'Tecnologia', date: formatDateInput(), isPaid: false, createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 },
    { id: createId('tx'), description: 'Notebook 2/3', type: 'card_expense', cardId: card.id, installmentPlanId: plan.id, accountId: '', amount: 600, category: 'Tecnologia', date: formatDateInput(), isPaid: false, createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 },
    { id: createId('tx'), description: 'Notebook 3/3', type: 'card_expense', cardId: card.id, installmentPlanId: plan.id, accountId: '', amount: 600, category: 'Tecnologia', date: formatDateInput(), isPaid: true, createdAt: ts, updatedAt: ts, syncStatus: 'synced', isDeleted: false, version: 1 }
  ];

  await bulkPut('accounts', [account1, account2]);
  await bulkPut('transactions', transactions);
  await bulkPut('creditCards', [card]);
  await bulkPut('installmentPlans', [plan]);
  await bulkPut('goals', [goal]);
  await bulkPut('investments', [investment]);
}
