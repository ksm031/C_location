import { compareLocation } from './utils.js';

/**
 * parser.js - 쿠팡 인트라넷 페이지 파싱 엔진
 *
 * 입력: 인트라넷 페이지에서 Ctrl+A → Ctrl+C 한 가시적 텍스트
 * 출력: 구조화된 데이터 배열
 *
 * 지원 형식:
 *  - 진열작업 오류보고 상세 (단일/멀티)
 *  - 입고 토트 상세
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
 * 예: 변철환\t2026-02-28 20:28:55\t66-32B5-43-405\t1
 * 필드: worker, display_at, location_code, display_qty
 */
const DISPLAY_CONT_ROW = /^(.+?)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t([\w-]+)\t(\d+)\s*$/;

/**
 * 토트에 남은 전산재고 행 패턴
 * 예: 138074898\t스피드샵...\tS0031042022238 출력\t3\t3\t0\t0
 * 바코드 뒤에 '출력' 버튼 텍스트가 붙을 수 있어 [^\t]* 로 흡수
 * 필드: sku_id, product_name, barcode, sys_qty (이후 입력 칸은 가변)
 */
const TOTE_REM_ROW = /^(\d+)\t([^\t]+)\t(\S+)[^\t]*\t(\d+)/;

/**
 * 오버리지 등록 항목 행 패턴
 * 예: 176984690\tIFNA...\tS0035759030971\t1\t2026-02-28 18:46:56\t김승민
 * 필드: sku_id, product_name, barcode, qty, registered_at, registered_by
 */
const OVERAGE_ITEM_ROW = /^(\d+)\t(.+?)\t(\S+)\t(\d+)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t(.+?)\s*$/;

/**
 * 입고 토트 상세 헤더 행 패턴
 * 예: 66-RCRT10-52-136	LARGE C/N	2026-03-06 20:46:52	B5997067	RCS0000021006	-	컨베이어	S4IB0203	6	6	6	0	0	-
 * 필드: tote_id, destination, inbound_at, worker, work_desk, dist_type, move_type, conveyor_dest,
 *        tote_qty, placed_qty, buffer_picking, problem_zone, return_buffer, display_error
 */
const TOTE_DETAIL_ROW = /^([^\t]+)\t([^\t]*)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t([^\t]+)\t([^\t]+)\t([^\t]*)\t([^\t]*)\t([^\t]*)\t(\d+)\t(\d+)\t(\d+)\t(\d+)\t(\d+)\t([^\t]*)\s*$/;

/**
 * 입고 토트 상세 > 진열 내역 행 패턴
 * 예: PICKING	66-42HV5-6-404	188089362	일반	1	2026-03-07 01:44:30	R1499794				-
 * 필드: location_type, location_code, sku_id, item_type, qty, display_at, worker
 */
const TOTE_DISP_ROW = /^(PICKING|BUFFER|SHELF|FLOOR)\t([\w-]+)\t(\d+)\t([^\t]+)\t(\d+)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t(\w+)/;

/**
 * 입고 토트 상세 > 토트 내 재고 행 패턴
 * 예: IBC0130853417	125929360	69652250	188089362	S0037085600721	뽀로로 배변 팬티 2P / 2개 핑크 S(12M)	1	-	-
 * 필드: ibc_barcode, ext_order, ext_sku_id, sku_id, barcode, product_name, qty
 */
const TOTE_STOCK_ROW = /^(IBC\w+)\t(\w+)\t(\w+)\t(\d+)\t(\S+)\t([^\t]+)\t(\d+)/;

/**
 * 오류보고 > '토트 내역' 행 패턴 (입고된 전체 상품 목록)
 * 예: 192368119	라라홀리 야상 점퍼 / FREE 카키	WHKR10120450817	21070590	133952354	1	조준현	2026-04-08 16:42:25
 * 필드: sku_id, product_name, barcode, ext_po, unload_no, tote_qty, inbound_worker, inbound_at
 */
const TOTE_INBOUND_ROW =
  /^(\d+)\t([^\t]+)\t(\S+)\t([^\t]*)\t([^\t]*)\t(\d+)\t([^\t]+)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;

/** 오류보고 > '토트 내역' 최소 패턴 (열 구성이 달라도 바코드는 확보) */
const TOTE_INBOUND_MIN_ROW = /^(\d+)\t([^\t]+)\t(\S+)\t/;


/** 배열에서 가장 많이 등장한 값 (없으면 null) */
function topValue(list) {
  if (!list.length) return null;
  const count = new Map();
  for (const v of list) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * '진열 오류 내역' 섹션부터 시작하는 라인 배열을 받아 단일 오류보고 객체로 파싱
 * @param {string[]} lines - 트림된 라인 배열 (섹션 단위)
 * @returns {object|null} 파싱된 오류보고 객체 또는 null
 */
function parseSectionLines(lines) {
  let report = null;

  let inDisplay        = false;
  let passedExcelBtn   = false;
  const displayRows    = [];
  let lastDisplayRow   = null;

  let inToteInbound        = false; // 토트 내역 (입고된 전체 상품 목록)
  let inToteRemaining      = false;
  let inOverage            = false;
  const stockItems         = []; // 토트 내역 items → parsedBarcodeMap 매칭용
  const inboundWorkers     = []; // 토트 내역 작업자 (= 입고자)
  const toteRemainingItems = [];
  const overageItems       = [];

  for (const line of lines) {
    // ① 오류보고 헤더 행 파싱 (아직 못 찾은 경우)
    if (!report) {
      const m = REPORT_ROW.exec(line);
      if (m) {
        report = {
          report_id:   m[1],
          reported_at: m[2],
          type:        m[3],
          tote_id:     m[4],
          worker:      m[5],
          reason:      m[6],
          status:      m[7],
          issue_item:  m[8],
          tote_qty:    parseInt(m[9]),
          placed_qty:  parseInt(m[10]),
          sys_qty:     parseInt(m[11]),
        };
      }
      continue;
    }

    // ② 섹션 전환 감지
    if (line.startsWith('토트 내역')) {
      inToteInbound = true;
      continue;
    }
    if (line === '진열 내역') {
      inToteInbound = false; inDisplay = true; passedExcelBtn = false;
      continue;
    }
    if (line === '토트에 남은 전산재고') {
      inDisplay = false; inToteRemaining = true;
      continue;
    }
    if (line.startsWith('문제 토트에')) {
      inToteRemaining = false; inOverage = true;
      continue;
    }
    if (line.startsWith('문제처리 이력')) {
      inOverage = false;
      continue;
    }

    // ③ 토트 내역 섹션 처리 (입고된 전체 상품 목록 → 바코드 매칭 + 입고자)
    if (inToteInbound) {
      if (line.startsWith('SKU ID\t') || line === '조회된 데이터가 없습니다.') continue;
      const m = TOTE_INBOUND_ROW.exec(line);
      if (m) {
        stockItems.push({ sku_id: m[1], product_name: m[2], barcode: m[3] });
        inboundWorkers.push(m[7]);
        continue;
      }
      const s = TOTE_INBOUND_MIN_ROW.exec(line);
      if (s) stockItems.push({ sku_id: s[1], product_name: s[2], barcode: s[3] });
      continue;
    }

    // ④ 진열 내역 섹션 처리
    if (inDisplay) {
      if (!passedExcelBtn) {
        if (line.startsWith('엑셀 파일 다운로드')) passedExcelBtn = true;
        continue;
      }
      if (line.startsWith('SKU ID\t') || line === '조회된 데이터가 없습니다.') continue;

      const m = DISPLAY_ROW.exec(line);
      if (m) {
        lastDisplayRow = {
          sku_id: m[1], product_name: m[2], barcode: m[3],
          display_worker: m[4], display_at: m[5],
          location_code: m[6], display_qty: parseInt(m[7]),
        };
        displayRows.push(lastDisplayRow);
        continue;
      }
      const mc = DISPLAY_CONT_ROW.exec(line);
      if (mc && lastDisplayRow) {
        displayRows.push({
          sku_id: lastDisplayRow.sku_id, product_name: lastDisplayRow.product_name,
          barcode: lastDisplayRow.barcode,
          display_worker: mc[1], display_at: mc[2],
          location_code: mc[3], display_qty: parseInt(mc[4]),
        });
      }
      continue;
    }

    // ⑤ 토트에 남은 전산재고 섹션 처리
    if (inToteRemaining) {
      if (line.startsWith('SKU ID\t') || line === '조회된 데이터가 없습니다.') continue;
      const m = TOTE_REM_ROW.exec(line);
      if (m) {
        toteRemainingItems.push({
          sku_id: m[1], product_name: m[2], barcode: m[3], sys_qty: parseInt(m[4]),
        });
      }
      continue;
    }

    // ⑥ 오버리지 등록 섹션 처리
    if (inOverage) {
      if (line.startsWith('SKU ID\t') || line === '조회된 데이터가 없습니다.') continue;
      const m = OVERAGE_ITEM_ROW.exec(line);
      if (m) {
        overageItems.push({
          sku_id: m[1], product_name: m[2], barcode: m[3],
          qty: parseInt(m[4]), registered_at: m[5], registered_by: m[6],
        });
      }
      continue;
    }
  }

  if (!report) return null;

  // ⑦ 진열 내역을 로케이션별로 그룹핑
  const locationMap = {};
  for (const row of displayRows) {
    if (!locationMap[row.location_code]) {
      locationMap[row.location_code] = { location_code: row.location_code, items: [], total_qty: 0 };
    }
    locationMap[row.location_code].items.push({
      sku_id: row.sku_id, product_name: row.product_name, barcode: row.barcode,
      display_worker: row.display_worker, display_qty: row.display_qty, display_at: row.display_at,
    });
    locationMap[row.location_code].total_qty += row.display_qty;
  }

  report.locations            = Object.values(locationMap)
    .sort((a, b) => compareLocation(a.location_code, b.location_code));
  report.inbound_worker       = topValue(inboundWorkers);
  report.stock_items          = stockItems;        // 토트 내역 (바코드 매칭용, 저장 안 함)
  report.tote_remaining_items = toteRemainingItems;
  report.overage_items        = overageItems;

  return report;
}

/**
 * 입고 토트 상세 페이지 라인 배열을 받아 토트 정보 객체로 파싱
 * 상품 정보는 수기 입력으로만 추가 (자동 파싱 안 함)
 */
function parseToteDetail(lines) {
  let tote = null;
  let inStock  = false;
  let inDisplay = false;
  const stockItems  = [];
  const displayRows = [];

  for (const line of lines) {
    if (!tote) {
      const m = TOTE_DETAIL_ROW.exec(line);
      if (m) {
        tote = {
          tote_id:    m[1],
          worker:     m[4],
          reported_at: m[3],
          tote_qty:   parseInt(m[9]),
          placed_qty: parseInt(m[10]),
        };
      }
      continue;
    }

    if (line === '토트 내 재고') { inStock = true; continue; }
    if (line === '진열 내역')  { inStock = false; inDisplay = true; continue; }

    if (inStock) {
      if (line.startsWith('하차번호')) continue; // 헤더
      const m = TOTE_STOCK_ROW.exec(line);
      if (m) {
        stockItems.push({ sku_id: m[4], product_name: m[6], barcode: m[5], qty: parseInt(m[7]) });
      }
      continue;
    }

    if (inDisplay) {
      if (line.startsWith('로케이션 유형\t')) continue;
      const m = TOTE_DISP_ROW.exec(line);
      if (m) {
        displayRows.push({
          location_code:  m[2],
          sku_id:         m[3],
          display_qty:    parseInt(m[5]),
          display_at:     m[6],
          display_worker: m[7],
        });
      }
    }
  }

  if (!tote) return null;

  // stock_items로 sku_id → { barcode, product_name } 맵 구성
  const skuMap = new Map();
  for (const s of stockItems) {
    if (!skuMap.has(s.sku_id)) skuMap.set(s.sku_id, { barcode: s.barcode, product_name: s.product_name });
  }

  // 진열 내역 → 로케이션별 그룹핑
  const locationMap = {};
  for (const row of displayRows) {
    if (!locationMap[row.location_code]) {
      locationMap[row.location_code] = { location_code: row.location_code, items: [], total_qty: 0 };
    }
    const info = skuMap.get(row.sku_id) ?? {};
    locationMap[row.location_code].items.push({
      sku_id: row.sku_id,
      barcode: info.barcode ?? null,
      product_name: info.product_name ?? '',
      display_worker: row.display_worker,
      display_qty: row.display_qty,
      display_at: row.display_at,
    });
    locationMap[row.location_code].total_qty += row.display_qty;
  }

  // 토트 바코드 기반 synthetic report_id (중복 방지)
  const dateCompact = tote.reported_at.replace(/[-: ]/g, '').slice(0, 12);
  tote.report_id           = `TOTE_${tote.tote_id}_${dateCompact}`;
  tote.reason              = 'TOTE_INBOUND';
  tote.sys_qty             = tote.tote_qty;
  tote.locations           = Object.values(locationMap)
    .sort((a, b) => compareLocation(a.location_code, b.location_code));
  tote.inbound_worker       = tote.worker; // 입고 토트 상세의 작업자 = 입고자
  tote.stock_items          = stockItems; // 바코드 매치용 (저장 안 함)
  tote.overage_items        = [];
  tote.tote_remaining_items = [];
  tote.page_type            = 'tote_detail';

  return tote;
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

  const reports = [];
  const errors  = [];

  // 입고 토트 상세 감지 - 오류보고와 공존 가능 (둘 다 파싱)
  const hasToteDetail = lines.some(l => l.startsWith('토트바코드\t토트목적지'));
  if (hasToteDetail) {
    const tote = parseToteDetail(lines);
    if (tote) reports.push(tote);
    else errors.push('입고 토트 상세 파싱 실패');
  }

  // '진열 오류 내역' 을 각 보고서의 시작점으로 사용
  const sectionStarts = [];
  lines.forEach((l, i) => { if (l === '진열 오류 내역') sectionStarts.push(i); });

  if (sectionStarts.length > 0) {
    for (let i = 0; i < sectionStarts.length; i++) {
      const start = sectionStarts[i];
      const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1] : lines.length;
      const report = parseSectionLines(lines.slice(start, end));
      if (report) reports.push(report);
      else errors.push(`섹션 ${i + 1}: 파싱 실패 (데이터 형식 확인 필요)`);
    }
  } else if (!hasToteDetail) {
    // 마커 없고 토트 상세도 없으면 전체를 단일 파싱 시도
    const report = parseSectionLines(lines);
    if (report) reports.push(report);
    else errors.push('오류보고 데이터를 찾을 수 없습니다. 올바른 페이지에서 복사했는지 확인하세요.');
  }

  const pageType = hasToteDetail && sectionStarts.length === 0 ? 'tote_detail' : undefined;
  return { reports, errors, pageType };
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
