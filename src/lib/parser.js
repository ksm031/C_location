/**
 * parser.js - 쿠팡 '진열작업 오류보고 상세' 페이지 파싱 엔진
 *
 * 입력: 인트라넷 페이지에서 Ctrl+A → Ctrl+C 한 가시적 텍스트
 * 출력: 구조화된 오류보고 데이터 배열
 *
 * 지원 형식:
 *  - 단일 오류보고 붙여넣기
 *  - 여러 오류보고 연속 붙여넣기 (멀티 파싱)
 */

// ── 정규식 패턴 ────────────────────────────────────────────────────────────

/**
 * 오류보고 데이터 행 패턴
 * 예: 66-20260227-00450\t2026-02-27 22:15:22\t일반입고 >> 진열\t66-RCRT60-19-421\t임병만\tSHORTAGE\t오류보고\t\t4\t1\t3
 * 필드: report_id, reported_at, type, tote_id, worker, reason, status, issue_item, tote_qty, placed_qty, sys_qty
 */
const REPORT_ROW = /^(\d{2}-\d{8}-\d{5})\t(.+?)\t(.+?)\t(.+?)\t(.+?)\t(.+?)\t(.+?)\t(.*?)\t(\d+)\t(\d+)\t(\d+)\s*$/;

/**
 * 진열 내역 데이터 행 패턴 (전체 행)
 * 예: 132016001\t샴푸캡...\tR203666100001\t임병만\t2026-02-27 22:15:15\t66-42C4-49-502\t1
 * 필드: sku_id, product_name, barcode, worker, display_at, location_code, display_qty
 */
const DISPLAY_ROW = /^(\d+)\t(.+?)\t(\S+)\t(.+?)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t([\w-]+)\t(\d+)\s*$/;

/**
 * 진열 내역 연속 행 패턴 (같은 SKU, 다른 로케이션 - SKU/상품명/바코드 없이 이어짐)
 * 예: 56561467\t2026-02-28 18:43:31\t66-32B9-68-104\t26
 * 필드: worker, display_at, location_code, display_qty
 */
const DISPLAY_CONT_ROW = /^(\d+)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t([\w-]+)\t(\d+)\s*$/;

// ── 내부 파싱 함수 ──────────────────────────────────────────────────────────

/**
 * '진열 오류 내역' 섹션부터 시작하는 라인 배열을 받아 단일 오류보고 객체로 파싱
 * @param {string[]} lines - 트림된 라인 배열 (섹션 단위)
 * @returns {object|null} 파싱된 오류보고 객체 또는 null
 */
function parseSectionLines(lines) {
  let report = null;

  // 진열 내역 섹션 상태 머신
  let inDisplay = false;
  let passedExcelBtn = false;
  const displayRows = [];
  let lastDisplayRow = null; // 연속 행을 위해 직전 전체 행 보관

  for (const line of lines) {
    // ① 오류보고 헤더 행 파싱 (아직 못 찾은 경우)
    if (!report) {
      const m = REPORT_ROW.exec(line);
      if (m) {
        report = {
          report_id:  m[1],
          reported_at: m[2],
          type:        m[3],
          tote_id:     m[4],
          worker:      m[5],
          reason:      m[6],   // SHORTAGE / OVERAGE
          status:      m[7],   // 오류보고 / 문제처리 완료 등
          issue_item:  m[8],   // 문제 항목 (빈 문자열일 수 있음)
          tote_qty:    parseInt(m[9]),
          placed_qty:  parseInt(m[10]),
          sys_qty:     parseInt(m[11]),  // 찾아야 할 수량
        };
      }
      continue;
    }

    // ② 진열 내역 섹션 진입 감지
    if (line === '진열 내역') {
      inDisplay = true;
      passedExcelBtn = false;
      continue;
    }

    // ③ '엑셀 파일 다운로드' 버튼 텍스트 통과
    if (inDisplay && !passedExcelBtn && line.startsWith('엑셀 파일 다운로드')) {
      passedExcelBtn = true;
      continue;
    }

    // ④ 진열 내역 섹션 내부 처리
    if (inDisplay && passedExcelBtn) {
      // 다음 섹션 도달 시 종료
      if (
        line === '토트에 남은 전산재고' ||
        line.startsWith('문제처리 이력') ||
        line.startsWith('문제 토트에')
      ) {
        inDisplay = false;
        continue;
      }

      // 헤더 행 및 데이터 없음 메시지 스킵
      if (line.startsWith('SKU ID\t') || line === '조회된 데이터가 없습니다.') {
        continue;
      }

      // 진열 내역 전체 행 파싱
      const m = DISPLAY_ROW.exec(line);
      if (m) {
        lastDisplayRow = {
          sku_id:         m[1],
          product_name:   m[2],
          barcode:        m[3],
          display_worker: m[4],
          display_at:     m[5],
          location_code:  m[6],
          display_qty:    parseInt(m[7]),
        };
        displayRows.push(lastDisplayRow);
        continue;
      }

      // 진열 내역 연속 행 파싱 (SKU 생략, 같은 SKU 다른 로케이션)
      const mc = DISPLAY_CONT_ROW.exec(line);
      if (mc && lastDisplayRow) {
        displayRows.push({
          sku_id:         lastDisplayRow.sku_id,
          product_name:   lastDisplayRow.product_name,
          barcode:        lastDisplayRow.barcode,
          display_worker: mc[1],
          display_at:     mc[2],
          location_code:  mc[3],
          display_qty:    parseInt(mc[4]),
        });
      }
    }
  }

  if (!report) return null;

  // ⑤ 진열 내역을 로케이션별로 그룹핑
  const locationMap = {};
  for (const row of displayRows) {
    if (!locationMap[row.location_code]) {
      locationMap[row.location_code] = {
        location_code: row.location_code,
        items: [],
        total_qty: 0,
      };
    }
    locationMap[row.location_code].items.push({
      sku_id:          row.sku_id,
      product_name:    row.product_name,
      barcode:         row.barcode,
      display_worker:  row.display_worker,
      display_qty:     row.display_qty,
      display_at:      row.display_at,
    });
    locationMap[row.location_code].total_qty += row.display_qty;
  }

  // 로케이션 코드 오름차순 정렬 (숫자 세그먼트는 수치 비교)
  report.locations = Object.values(locationMap).sort((a, b) =>
    a.location_code.localeCompare(b.location_code, undefined, { numeric: true })
  );

  return report;
}

// ── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 인트라넷에서 복사한 텍스트를 파싱하여 오류보고 배열로 반환
 *
 * @param {string} rawText - 붙여넣은 원본 텍스트
 * @returns {{ reports: object[], errors: string[] }}
 *   reports: 파싱된 오류보고 배열
 *   errors:  파싱 실패한 섹션 정보 (빈 배열이면 전부 성공)
 */
export function parseText(rawText) {
  if (!rawText || !rawText.trim()) {
    return { reports: [], errors: [] };
  }

  // 라인 단위로 분리 (탭은 유지, 앞뒤 공백만 제거, 빈 줄 제거)
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // '진열 오류 내역' 을 각 보고서의 시작점으로 사용
  const sectionStarts = [];
  lines.forEach((l, i) => {
    if (l === '진열 오류 내역') sectionStarts.push(i);
  });

  // 섹션 마커가 없으면 전체 텍스트로 단일 파싱 시도
  if (sectionStarts.length === 0) {
    const report = parseSectionLines(lines);
    if (report) return { reports: [report], errors: [] };
    return {
      reports: [],
      errors: ['오류보고 데이터를 찾을 수 없습니다. 올바른 페이지에서 복사했는지 확인하세요.'],
    };
  }

  const reports = [];
  const errors = [];

  for (let i = 0; i < sectionStarts.length; i++) {
    const start = sectionStarts[i];
    const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1] : lines.length;
    const sectionLines = lines.slice(start, end);

    const report = parseSectionLines(sectionLines);
    if (report) {
      reports.push(report);
    } else {
      errors.push(`섹션 ${i + 1}: 파싱 실패 (데이터 형식 확인 필요)`);
    }
  }

  return { reports, errors };
}

/**
 * 파싱 결과의 reason 코드를 한국어로 변환
 */
export function reasonLabel(reason) {
  switch (reason?.toUpperCase()) {
    case 'SHORTAGE': return '부족 (SHORTAGE)';
    case 'OVERAGE':  return '초과 (OVERAGE)';
    default:         return reason || '-';
  }
}

/**
 * 날짜 문자열을 보기 좋게 포맷
 * "2026-02-27 22:15:22" → "02/27 22:15"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/\d{4}-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return dateStr;
  return `${m[1]}/${m[2]} ${m[3]}:${m[4]}`;
}
