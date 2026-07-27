/** UTC ISO → KST "MM.DD HH:mm:ss" */
export function cardDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mm}.${dd} ${hh}:${mi}:${ss}`;
}

export const REASON_STYLE = {
  SHORTAGE: {
    accent:     'border-l-blue-400',   // 카드 좌측 4px 유형 표시
    badge:      'bg-blue-100 text-blue-700',
    countColor: 'text-blue-600',
    label:      'SHORTAGE',
  },
  OVERAGE: {
    accent:     'border-l-yellow-400',
    badge:      'bg-yellow-100 text-yellow-700',
    countColor: 'text-yellow-600',
    label:      'OVERAGE',
  },
};
