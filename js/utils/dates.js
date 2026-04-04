export function nowIso() {
  return new Date().toISOString();
}

export function formatDateInput(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

export function toMonthKey(input) {
  const d = new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentMonthKey(date = new Date()) {
  return toMonthKey(date);
}

export function isInMonth(dateValue, monthKey) {
  return toMonthKey(dateValue) === monthKey;
}

export function getMonthBounds(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export function isOnOrBeforeMonth(dateValue, monthKey) {
  const date = new Date(dateValue);
  return date.getTime() <= getMonthBounds(monthKey).end.getTime();
}

export function monthLabel(monthKey) {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}


export function addMonthsToMonthKey(monthKey, offset = 0) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  const base = new Date(year, ((month || 1) - 1) + Number(offset || 0), 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
}
