function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function isDateInputString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildDateInput(year, month, day) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseDateInput(value) {
  if (!value) return null;

  if (value instanceof Date) {
    const parsed = new Date(value.getTime());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (isDateInputString(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateInput(date = new Date()) {
  if (isDateInputString(date)) return date;

  const parsed = parseDateInput(date);
  if (!parsed) return "";

  return buildDateInput(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
  );
}

export function getTodayDateInput(date = new Date()) {
  return formatDateInput(date);
}

export function toMonthKey(input) {
  const parsed = parseDateInput(input);
  if (!parsed) return "";

  return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}`;
}

export function getCurrentMonthKey(date = new Date()) {
  return toMonthKey(date);
}

export function isInMonth(dateValue, monthKey) {
  return toMonthKey(dateValue) === monthKey;
}

export function getMonthBounds(monthKey) {
  const [year, month] = String(monthKey || "")
    .split("-")
    .map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export function isOnOrBeforeMonth(dateValue, monthKey) {
  const date = parseDateInput(dateValue);
  if (!date || !monthKey) return false;

  return date.getTime() <= getMonthBounds(monthKey).end.getTime();
}

export function compareDateInputs(a, b) {
  const first = parseDateInput(a)?.getTime() || 0;
  const second = parseDateInput(b)?.getTime() || 0;
  return first - second;
}

export function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function addMonthsToMonthKey(monthKey, offset = 0) {
  const [year, month] = String(monthKey || "")
    .split("-")
    .map(Number);
  const base = new Date(year, (month || 1) - 1 + Number(offset || 0), 1);
  return `${base.getFullYear()}-${padDatePart(base.getMonth() + 1)}`;
}

export function addMonthsToDateInput(dateInput, offset = 0) {
  const parsed = parseDateInput(dateInput);
  if (!parsed) return "";

  const targetMonthIndex = parsed.getMonth() + Number(offset || 0);
  const targetYear = parsed.getFullYear();
  const targetLastDay = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const targetDay = Math.min(parsed.getDate(), targetLastDay);
  const nextDate = new Date(targetYear, targetMonthIndex, targetDay, 12, 0, 0, 0);

  return formatDateInput(nextDate);
}
