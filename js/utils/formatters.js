export function currency(value = 0, currencyCode = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function datePt(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

export function percent(value = 0) {
  return `${Number(value || 0).toFixed(1)}%`;
}
