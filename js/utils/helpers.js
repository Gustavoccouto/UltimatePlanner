export function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function sumBy(items, getValue) {
  return items.reduce((sum, item) => sum + Number(getValue(item) || 0), 0);
}

export function sortByDateDesc(items, field = 'date') {
  return [...items].sort((a, b) => new Date(b[field]) - new Date(a[field]));
}
