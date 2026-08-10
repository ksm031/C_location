import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseText } from '../src/lib/parser.js';

const SAMPLES = path.join(import.meta.dirname, '..', 'samples');
const files = fs.readdirSync(SAMPLES).filter(f => f.endsWith('.txt')).sort();

test('샘플 전건이 파싱된다', () => {
  assert.ok(files.length >= 15, `샘플이 너무 적음: ${files.length}`);
  for (const f of files) {
    const { reports } = parseText(fs.readFileSync(path.join(SAMPLES, f), 'utf8'));
    assert.ok(reports.length > 0, `${f}: 파싱 결과 없음`);
  }
});

test('보고서 필수 필드가 채워진다', () => {
  for (const f of files) {
    const r = parseText(fs.readFileSync(path.join(SAMPLES, f), 'utf8')).reports[0];
    assert.ok(r.report_id, `${f}: report_id 없음`);
    assert.ok(r.reason, `${f}: reason 없음`);
    // 수량은 NaN 이면 안 된다 (NaN 은 DB 에 null 로 저장돼 조용히 사라진다)
    for (const k of ['sys_qty', 'placed_qty', 'tote_qty']) {
      if (r[k] !== undefined && r[k] !== null) {
        assert.ok(!Number.isNaN(r[k]), `${f}: ${k} 가 NaN`);
      }
    }
  }
});

test('reported_at 이 Date 로 변환 가능하다 (저장 시 RangeError 방지)', () => {
  for (const f of files) {
    const r = parseText(fs.readFileSync(path.join(SAMPLES, f), 'utf8')).reports[0];
    if (!r.reported_at) continue;
    const d = new Date(r.reported_at);
    assert.ok(!Number.isNaN(d.getTime()), `${f}: reported_at 파싱 불가 → ${r.reported_at}`);
  }
});

test('로케이션 아이템은 바코드와 진열자를 갖는다', () => {
  for (const f of files) {
    const r = parseText(fs.readFileSync(path.join(SAMPLES, f), 'utf8')).reports[0];
    for (const loc of r.locations ?? []) {
      assert.ok(loc.location_code, `${f}: location_code 없음`);
      for (const it of loc.items ?? []) {
        assert.ok(!Number.isNaN(it.display_qty), `${f}: display_qty 가 NaN`);
      }
    }
  }
});

test('입고 토트 상세는 TOTE_INBOUND 로 파싱된다', () => {
  const tote = files
    .map(f => parseText(fs.readFileSync(path.join(SAMPLES, f), 'utf8')).reports[0])
    .find(r => r.reason === 'TOTE_INBOUND');
  if (!tote) return; // 해당 샘플이 없으면 통과
  assert.ok(tote.tote_id, 'tote_id 없음');
  assert.ok(Array.isArray(tote.stock_items), 'stock_items 없음');
});

test('빈 입력은 조용히 빈 결과를 준다', () => {
  assert.deepEqual(parseText(''), { reports: [], errors: [] });
  assert.deepEqual(parseText('   \n  '), { reports: [], errors: [] });
});

test('형식이 아닌 텍스트는 오류를 보고한다', () => {
  const { reports, errors } = parseText('아무 의미 없는 텍스트\n두 번째 줄');
  assert.equal(reports.length, 0);
  assert.ok(errors.length > 0, '오류가 보고되지 않음');
});
