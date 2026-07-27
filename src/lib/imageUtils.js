import { sb } from './supabase';

/** 이미지 파일을 최대 maxSize px JPEG base64로 압축 */
export function compressImage(file, maxSize = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 로드 실패'));
    };
    img.src = url;
  });
}

/**
 * 세션 캐시: barcode → dataUrl | null (null = DB에 없음)
 * 사이드바·상세·전산목록이 같은 바코드를 반복 조회하는 것을 막는다.
 */
const imgCache = new Map();

/** 캐시 비우기 (매일 초기화로 product_images 를 삭제한 뒤 호출) */
export function clearImgCache() {
  imgCache.clear();
}

/** 단일 바코드 이미지를 DB에 저장 (upsert) */
export async function saveImg(barcode, dataUrl) {
  const { error } = await sb.from('product_images').upsert(
    { barcode, image_data: dataUrl, updated_at: new Date().toISOString() },
    { onConflict: 'barcode' }
  );
  if (error) console.error('이미지 저장 오류:', error.message);
  else imgCache.set(barcode, dataUrl);
}

/** 여러 바코드의 이미지를 한 번에 조회 → { barcode: dataUrl } (캐시 우선) */
export async function getImgs(barcodes) {
  if (!barcodes?.length) return {};
  const uniq    = [...new Set(barcodes.filter(Boolean))];
  const missing = uniq.filter(b => !imgCache.has(b));

  if (missing.length) {
    const { data, error } = await sb
      .from('product_images')
      .select('barcode, image_data')
      .in('barcode', missing);
    if (error) {
      console.error('이미지 조회 오류:', error.message);
    } else {
      const found = new Map((data ?? []).map(r => [r.barcode, r.image_data]));
      // 없는 바코드도 null 로 기록해 재조회를 막는다
      for (const b of missing) imgCache.set(b, found.get(b) ?? null);
    }
  }

  const out = {};
  for (const b of uniq) {
    const v = imgCache.get(b);
    if (v) out[b] = v;
  }
  return out;
}
