import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * CODE128 바코드 SVG
 * @param {string} value  - 인코딩할 값 (바코드 / 로케이션 코드)
 * @param {number} height - 막대 높이 px
 * @param {number} width  - 막대 두께 (작을수록 얇음)
 */
export default function Barcode128({ value, height = 32, width = 1.2, className = '' }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,
        height,
        margin: 4,
        displayValue: false,
      });
    } catch (_) {
      // 인코딩 불가한 값은 조용히 무시 (빈 SVG 유지)
    }
  }, [value, height, width]);

  return <svg ref={svgRef} className={`max-w-full ${className}`} />;
}
