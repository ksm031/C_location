-- ================================================================
-- PS 업무 보조 도구 - Supabase DB 스키마
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- ================================================================

-- 1. 파싱된 오류보고 분석 세션
CREATE TABLE IF NOT EXISTS analyses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    TEXT        UNIQUE NOT NULL,          -- 문제보고 번호 (예: 66-20260227-00450)
  reported_at  TIMESTAMPTZ,                          -- 문제보고 일시
  reason       TEXT,                                 -- SHORTAGE / OVERAGE
  tote_id      TEXT,                                 -- 토트 바코드
  worker       TEXT,                                 -- 진열 작업자
  sys_qty      INTEGER,                              -- 보고시 전산수량 (찾아야 할 수량)
  placed_qty   INTEGER,                              -- 진열 수량
  tote_qty     INTEGER,                              -- 토트 수량
  locations    JSONB       DEFAULT '[]'::JSONB,      -- 로케이션 목록 (JSON 배열)
  created_by   TEXT,                                 -- 등록한 사람 닉네임
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 로케이션 방문 체크 결과
CREATE TABLE IF NOT EXISTS location_checks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    UUID        REFERENCES analyses(id) ON DELETE CASCADE,
  location_code  TEXT        NOT NULL,               -- 로케이션 코드 (예: 66-42C7-62-201)
  result         TEXT        CHECK(result IN ('found', 'not_found')),
  checked_by     TEXT,                               -- 체크한 사람 닉네임
  checked_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(analysis_id, location_code)
);

-- 3. 앱 전역 설정 (기기 간 공유 - daily_reset_date 등)
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 초기값 삽입 (이미 존재하면 무시)
INSERT INTO app_settings (key, value)
VALUES ('daily_reset_date', '')
ON CONFLICT (key) DO NOTHING;

-- ================================================================
-- RLS (Row Level Security) 설정
-- anon key 로 읽기/쓰기 모두 허용 (내부 인트라넷 도구)
-- ================================================================
ALTER TABLE analyses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_analyses" ON analyses;
DROP POLICY IF EXISTS "anon_all_location_checks" ON location_checks;
DROP POLICY IF EXISTS "anon_all_app_settings" ON app_settings;

CREATE POLICY "anon_all_analyses"
  ON analyses FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_location_checks"
  ON location_checks FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_app_settings"
  ON app_settings FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 4. 공유 메모 (타이틀 클릭으로 접근하는 비밀 메모장)
CREATE TABLE IF NOT EXISTS memos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content    TEXT        NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_memos" ON memos;
CREATE POLICY "anon_all_memos"
  ON memos FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ================================================================
-- Realtime 활성화 (실시간 동기화)
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE analyses;
ALTER PUBLICATION supabase_realtime ADD TABLE location_checks;
ALTER PUBLICATION supabase_realtime ADD TABLE memos;

-- ================================================================
-- 기존 테이블에 컬럼 추가 (이미 테이블이 존재하는 경우 실행)
-- ================================================================
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS overage_items        JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS tote_remaining_items JSONB DEFAULT '[]'::JSONB;

-- ================================================================
-- locations JSONB 구조 예시 (참고용)
-- [
--   {
--     "location_code": "66-42C7-62-201",
--     "total_qty": 2,
--     "items": [
--       {
--         "sku_id": "189217321",
--         "product_name": "상품명",
--         "barcode": "8800306974270",
--         "display_qty": 1,
--         "display_at": "2026-02-27 21:50:21"
--       }
--     ]
--   }
-- ]
-- ================================================================
