/**
 * 아주 작은 알림 버스.
 *
 * DB 쓰기가 여러 컴포넌트에 흩어져 있어서 prop 으로 알림 함수를 내려보내면
 * 배선이 커진다. 모듈 레벨 구독자 목록만 두고 어디서든 notify() 를 부른다.
 */

const listeners = new Set();
let seq = 0;

/** @param {'error'|'info'} type */
export function notify(message, type = 'error') {
  const toast = { id: ++seq, message, type };
  for (const fn of listeners) fn(toast);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
