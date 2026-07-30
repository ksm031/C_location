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

/**
 * 진열존 코드 정렬 예외
 *   key   = 실제 코드의 존 부분 (숫자+알파벳, 뒤 번호 제외)
 *   value = 정렬에 쓸 알파벳
 *
 * '￿' 는 문자열 비교에서 같은 알파벳 뒤에 오게 만드는 꼬리표.
 *   'A' < 'A￿' < 'B'  →  42A* 전부 다음, 42B* 앞
 *
 * 42MD: 코드는 MD 지만 실물은 42A 구역 → 42A 와 42B 사이
 * 42HV: 코드는 HV 지만 실물은 42E 구역 → 42E 와 42F 사이
 */
const ZONE_SORT_ALIAS = {
  '42MD': 'A￿',
  '42HV': 'E￿',
};

/** 숫자 문자열을 자릿수 맞춰 0 패딩 (문자열 비교로 숫자 정렬) */
const pad = (n) => String(n ?? '').padStart(6, '0');

/**
 * 진열존 코드를 정렬용 키로 변환. 이 키끼리는 단순 문자열 비교로 정렬한다.
 * 예: 66-42MD11-49-402 → "0042|A￿|000011|000049|000402"
 */
export function locationSortKey(code) {
  if (!code) return '';
  const segs = String(code).replace(/^66-/, '').split('-');
  const zone = segs[0] ?? '';

  // 존 = 숫자(구역) + 알파벳(라인) + 숫자(번호)
  const m = /^(\d*)([A-Za-z]*)(\d*)$/.exec(zone);
  const head = m
    ? (() => {
        const [, area, rawLetters, num] = m;
        const letters = rawLetters.toUpperCase();
        const sortLetters = ZONE_SORT_ALIAS[`${area}${letters}`] ?? letters;
        // 글자 수가 달라도 알파벳 순이 유지되도록 공백(모든 대문자보다 작음)으로 폭 고정
        // 'A   ' < 'AB  ' < 'A￿  ' < 'B   '
        return `${area.padStart(4, '0')}|${sortLetters.padEnd(4, ' ')}|${pad(num)}`;
      })()
    : zone; // 형식이 다르면 원본 그대로 (수기 입력 진열존 등)

  const rest = segs.slice(1)
    .map(s => (/^\d+$/.test(s) ? pad(s) : s))
    .join('|');

  return rest ? `${head}|${rest}` : head;
}

/** 진열존 코드 비교자 (Array.prototype.sort 에 그대로 사용) */
export function compareLocation(a, b) {
  const ka = locationSortKey(a);
  const kb = locationSortKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * '없음'으로 확인된 로케이션을 제외한 목록.
 * 이미 없다고 확인한 곳은 다음 후보에서 빠져야 하므로 대표 로케이션/정렬에서 제외한다.
 * 전부 '없음'이면 표시할 게 없어지므로 원본을 그대로 돌려준다.
 *
 * @param {Array}  locations - [{ location_code, ... }]
 * @param {object} checks    - { [location_code]: { result } }
 */
export function activeLocations(locations = [], checks = {}) {
  const alive = locations.filter(l => checks?.[l.location_code]?.result !== 'not_found');
  return alive.length > 0 ? alive : locations;
}

/** '없음' 제외 후 가장 빠른 로케이션 코드 (카드 대표 표기 · 목록 정렬 기준) */
export function primaryLocationCode(locations = [], checks = {}) {
  let best = null;
  for (const l of activeLocations(locations, checks)) {
    if (best === null || compareLocation(l.location_code, best) < 0) best = l.location_code;
  }
  return best ?? '';
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
