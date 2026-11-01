export const isStaff = role => ['rtz','srtz','srtz_rtz'].includes(role);
export const roleLabel = role => ({admin:'Администратор',tm:'Территориальный менеджер',manager:'Управляющий магазина',rtz:'РТЗ',srtz:'СРТЗ',srtz_rtz:'РТЗ'})[role] || 'Неизвестная роль';
export const canReadRecommendations = role => role === 'manager' || isStaff(role);
