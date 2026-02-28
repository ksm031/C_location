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

/** 단일 바코드 이미지를 DB에 저장 (upsert) */
export async function saveImg(barcode, dataUrl) {
  const { error } = await sb.from('product_images').upsert(
    { barcode, image_data: dataUrl, updated_at: new Date().toISOString() },
    { onConflict: 'barcode' }
  );
  if (error) console.error('이미지 저장 오류:', error.message);
}

/** 여러 바코드의 이미지를 한 번에 조회 → { barcode: dataUrl } */
export async function getImgs(barcodes) {
  if (!barcodes?.length) return {};
  const { data } = await sb
    .from('product_images')
    .select('barcode, image_data')
    .in('barcode', barcodes);
  return Object.fromEntries((data ?? []).map(r => [r.barcode, r.image_data]));
}
