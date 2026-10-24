export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Store the exclusive expiry boundary: manufacturing date plus the full shelf life.
export function calculateExpiry(manufactured, amount, unit) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manufactured)) return '';
  const [year, month, day] = manufactured.split('-').map(Number);
  const date = new Date(`${manufactured}T12:00:00Z`);
  const count = Number(amount);
  if (!Number.isSafeInteger(count) || count <= 0 ||
      !['days', 'months', 'years'].includes(unit) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== manufactured) return '';
  if (unit === 'days') {
    date.setUTCDate(date.getUTCDate() + count);
  } else {
    date.setUTCDate(1);
    date.setUTCMonth(month - 1 + (unit === 'months' ? count : count * 12));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  if (!Number.isFinite(date.getTime())) return '';
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < year || date.getUTCFullYear() > 9999) return '';
  return date.toISOString().slice(0, 10);
}
