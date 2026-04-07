import { TRANSACTION_TYPES } from "./constants.js";

export function validateRequired(value, label) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${label} é obrigatório.`);
  }
}

export function validateNonNegative(value, label) {
  if (Number(value) < 0) {
    throw new Error(`${label} não pode ser negativo.`);
  }
}

export function validatePositive(value, label) {
  if (Number(value) <= 0) {
    throw new Error(`${label} deve ser maior que zero.`);
  }
}

export function validateTransaction(payload) {
  validateRequired(payload.description, "Descrição");
  validateRequired(payload.type, "Tipo");
  validateRequired(payload.date, "Data");
  validateRequired(payload.amount, "Valor");

  if (!Object.values(TRANSACTION_TYPES).includes(payload.type)) {
    throw new Error("Tipo de transação inválido.");
  }

  validatePositive(payload.amount, "Valor");

  if (payload.type !== TRANSACTION_TYPES.cardExpense) {
    validateRequired(payload.accountId, "Conta");
  }

  if (payload.type === TRANSACTION_TYPES.transfer) {
    validateRequired(payload.destinationAccountId, "Conta destino");
    if (payload.destinationAccountId === payload.accountId) {
      throw new Error(
        "Conta destino precisa ser diferente da conta de origem.",
      );
    }
  }

  if (payload.type === TRANSACTION_TYPES.cardExpense) {
    validateRequired(payload.cardId, "Cartão");
  }
}

export function validateAccount(payload) {
  validateRequired(payload.name, "Nome da conta");
  validateRequired(payload.bankName, "Banco");
  validateRequired(payload.type, "Tipo de conta");
}

export function validateCard(payload) {
  validateRequired(payload.name, "Nome do cartão");
  validateRequired(payload.brand, "Bandeira");
  validateRequired(payload.limitAmount, "Limite");
  validatePositive(payload.limitAmount, "Limite");

  const dueDay = Number(payload.dueDay);
  const closingDay = Number(payload.closingDay);

  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error("Vencimento deve estar entre 1 e 31.");
  }

  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw new Error("Fechamento deve estar entre 1 e 31.");
  }
}
