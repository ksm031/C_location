import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDateKey, toIsoOrNull, compareLocation, checkOutcome,
  activeLocations, primaryLocationCode,
} from '../src/lib/utils.js';
import { isBarcodeSimilar, isNameSimilar, isSimilarItem } from '../src/lib/similarity.js';

/* ── 날짜 키: UTC 가 아니라 로컬 기준이어야 한다 ── */
test('localDateKey 는 로컬 날짜를 쓴다', () => {
  // KST 08:30 은 UTC 로 전날 23:30 — toISOString 을 쓰면 전날이 나온다
  const d = new Date(2026, 7, 7, 8, 30); // 2026-08-07 08:30 로컬
  assert.equal(localDateKey(d), '2026-08-07');
  assert.equal(localDateKey(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

test('초기화가 하루 한 번만 발동한다', () => {
  const fire = (d, stored) => {
    const resetAt = new Date(d); resetAt.setHours(8, 0, 0, 0);
    return d >= resetAt && stored !== localDateKey(d);
  };
  let stored = '2026-08-05';           // 주말 뒤: 마지막 초기화가 이틀 전
  const day = [[7, 59], [8, 5], [8, 40], [9, 10], [14, 0]];
  const fired = [];
  for (const [h, m] of day) {
    const d = new Date(2026, 7, 7, h, m);
    if (fire(d, stored)) { fired.push(`${h}:${m}`); stored = localDateKey(d); }
  }
  assert.deepEqual(fired, ['8:5'], `하루 한 번만 발동해야 함 (실제: ${fired})`);
});

/* ── 날짜 변환: 저장이 RangeError 로 멈추면 안 된다 ── */
test('toIsoOrNull 은 잘못된 값에 null 을 준다', () => {
  assert.equal(toIsoOrNull('일반입고 >> 진열'), null);
  assert.equal(toIsoOrNull(''), null);
  assert.equal(toIsoOrNull(null), null);
  assert.ok(toIsoOrNull('2026-02-27 22:15:22').startsWith('2026-'));
});

/* ── 로케이션 정렬 예외 ── */
test('42MD 는 42A 와 42B 사이', () => {
  const s = ['66-42B3-1-1', '66-42MD11-49-402', '66-42A5-10-101'].sort(compareLocation);
  assert.deepEqual(s, ['66-42A5-10-101', '66-42MD11-49-402', '66-42B3-1-1']);
});

test('42HV 는 42E 와 42F 사이', () => {
  const s = ['66-42F2-1-1', '66-42HV5-6-404', '66-42E9-1-1'].sort(compareLocation);
  assert.deepEqual(s, ['66-42E9-1-1', '66-42HV5-6-404', '66-42F2-1-1']);
});

test('숫자는 자릿수가 아니라 값으로 정렬', () => {
  const s = ['66-42A12-1-1', '66-42A5-1-1'].sort(compareLocation);
  assert.deepEqual(s, ['66-42A5-1-1', '66-42A12-1-1']);
});

/* ── 체크 결과 판정 ── */
test('checkOutcome', () => {
  const L = c => ({ location_code: c });
  const locs = [L('A'), L('B')];
  assert.equal(checkOutcome([], {}), 'none');
  assert.equal(checkOutcome(locs, {}), 'progress');
  assert.equal(checkOutcome(locs, { A: { result: 'not_found' } }), 'progress');
  assert.equal(checkOutcome(locs, { A: { result: 'not_found' }, B: { result: 'not_found' } }), 'missing');
  assert.equal(checkOutcome(locs, { A: { result: 'found' } }), 'found');
});

test("'없음' 로케이션은 대표에서 빠지고, 전부 없음이면 원본 유지", () => {
  const L = c => ({ location_code: c });
  const locs = [L('66-42A5-1-1'), L('66-42C7-1-1')];
  assert.equal(primaryLocationCode(locs, {}), '66-42A5-1-1');
  assert.equal(primaryLocationCode(locs, { '66-42A5-1-1': { result: 'not_found' } }), '66-42C7-1-1');
  const allNF = { '66-42A5-1-1': { result: 'not_found' }, '66-42C7-1-1': { result: 'not_found' } };
  assert.equal(activeLocations(locs, allNF).length, 2); // 비지 않게 원본 유지
});

/* ── 유사상품 판정 ── */
test('바코드: 뒷 2자리 변형만 유사', () => {
  assert.ok(isBarcodeSimilar('S0034557232570', 'S0034557232566'));
  assert.ok(!isBarcodeSimilar('8800306972672', '8800306972948')); // 같은 브랜드 다른 모델
  assert.ok(!isBarcodeSimilar('8800306969900', '8800306974317'));
  assert.ok(!isBarcodeSimilar('R203666100001', 'S0034557232570')); // 형식 다름
  assert.ok(!isBarcodeSimilar('880', '881')); // 너무 짧음
});

test('상품명: 모델코드 또는 브랜드 anchor 필요', () => {
  assert.ok(isNameSimilar(
    '아이더 남성 긴팔 티셔츠 DMP26285 / L 화이트',
    '아이더 남성 긴팔 티셔츠 DMP26285 / XL 화이트'));
  assert.ok(!isNameSimilar(
    '아이더 남성 반팔 쿨티 DMM26281 / M 블랙',
    '아이더 남성 긴팔 라운드 티셔츠 DMP26285 / L 화이트'));
  assert.ok(!isNameSimilar('케어센스 혈당측정검사지 / 8개', '유니더스 밀리언콘돔 12P'));
});

test('이름이 없으면 바코드 규칙만 적용', () => {
  assert.ok(isSimilarItem(
    { barcode: 'S0034557232570', product_name: null },
    { barcode: 'S0034557232566', product_name: '무언가' }));
});
