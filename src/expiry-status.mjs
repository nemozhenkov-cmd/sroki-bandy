// Compare calendar dates, not elapsed 24-hour periods (which vary with DST).
export function daysLeft(date, now = new Date()) {
  const [year, month, day] = date.split('-').map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return (Date.UTC(year, month - 1, day) - today) / 86400000;
}

export function statusFor(date, now = new Date()) {
  const days = daysLeft(date, now);
  return days < 0 ? 'expired' : days === 0 ? 'today' : days <= 3 ? 'soon' : 'ok';
}
