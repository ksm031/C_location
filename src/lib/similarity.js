/**
 * similarity.js - 유사상품 판정
 *
 * "찾는 상품이 오분류되면 같은 상품군(사이즈/색 변형) 옆에 꽂혀 있을
 * 확률이 높다" 는 현장 직감을 규칙으로 만든 것.
 *
 * 규칙 A) 바코드 접두: 사이즈/색 변형은 바코드 뒷 2~3자리만 다른 경우가 대부분
 * 규칙 B) 상품명 토큰: 모델코드(DMP26285 류) 또는 브랜드(첫 토큰)를 anchor 로
 *         요구해 범용어 조합(남성 긴팔 티셔츠...)만 겹치는 오탐을 차단
 */

/** 판별력 없는 토큰(변형 축): 색상 · 사이즈 · 수량단위 · 순수숫자 */
const WEAK_TOKEN =
  /^(\d+|\d+(개|매|장|팩|호|입|p|ea|세트|ml|l|g|kg|cm|mm)|xs|s|m|l|xl|2xl|3xl|4xl|xxl|free|프리|단일상품|단일색상|단일|블랙|화이트|네이비|그레이|베이지|핑크|그린|블루|레드|옐로우|퍼플|브라운|아이보리|카키|와인|민트|오렌지|차콜|다크네이비)$/i;

/** 모델코드: 영문+숫자 혼합 3자 이상 (DMP26285, MC0114, HR1806 ...) */
const MODEL_CODE = /^(?=.*[a-z])(?=.*\d)[a-z0-9-]{3,}$/i;

/** 상품명 → 핵심토큰 배열 (순서 유지, [태그] 제거, 약토큰 제외) */
export function tokenizeName(name) {
  if (!name) return [];
  return String(name)
    .replace(/\[[^\]]*\]/g, ' ')     // [중고 상 상품] 류 태그 제거
    .replace(/[/,+*()~]/g, ' ')      // 구분자 → 공백
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 2 && !WEAK_TOKEN.test(t));
}

/**
 * 규칙 A: 같은 길이 && 8자 이상 && 마지막 2자리 제외 접두 동일
 * 뒷 3자리로 잡으면 같은 브랜드의 다른 모델(연번 등록)까지 걸려 오탐이 난다.
 * 실측상 사이즈/색 변형은 뒷 2자리 차이에 몰려 있고, 그보다 먼 변형은
 * 상품명 규칙(B)이 잡아낸다.
 */
export function isBarcodeSimilar(a, b) {
  if (!a || !b || a === b) return false;
  if (a.length !== b.length || a.length < 8) return false;
  return a.slice(0, -2) === b.slice(0, -2);
}

/** 규칙 B: anchor(모델코드 공유 또는 브랜드 동일) + 핵심토큰 겹침 */
export function isNameSimilar(nameA, nameB) {
  const ta = tokenizeName(nameA);
  const tb = tokenizeName(nameB);
  if (ta.length === 0 || tb.length === 0) return false;

  const setB   = new Set(tb);
  const common = ta.filter(t => setB.has(t));

  // anchor 1: 모델코드 공유 → 그 자체가 강한 증거
  if (common.some(t => MODEL_CODE.test(t))) return common.length >= 1;

  // anchor 2: 브랜드(첫 핵심토큰) 동일 → 겹침이 충분히 커야 함
  if (ta[0] !== tb[0]) return false;
  const ratio = common.length / Math.min(ta.length, tb.length);
  return common.length >= 3 && ratio >= 0.6;
}

/** target {barcode, product_name} 과 item 이 유사상품인지 */
export function isSimilarItem(target, item) {
  if (isBarcodeSimilar(target?.barcode, item?.barcode)) return true;
  if (target?.product_name && item?.product_name) {
    return isNameSimilar(target.product_name, item.product_name);
  }
  return false;
}

/**
 * 로케이션 목록에서 유사상품 바코드 수집 (target 자신 제외, dedup)
 * @param {Array} targets   - [{barcode, product_name}]
 * @param {Array} locations - analyses.locations JSONB
 * @returns {string[]}
 */
export function findSimilarBarcodes(targets = [], locations = []) {
  const targetSet = new Set(targets.map(t => t?.barcode).filter(Boolean));
  const out = new Set();
  for (const loc of locations) {
    for (const item of loc?.items ?? []) {
      if (!item?.barcode || targetSet.has(item.barcode) || out.has(item.barcode)) continue;
      if (targets.some(t => isSimilarItem(t, item))) out.add(item.barcode);
    }
  }
  return [...out];
}
