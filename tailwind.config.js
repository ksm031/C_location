/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Pretendard Variable', 'Pretendard',
          '-apple-system', 'BlinkMacSystemFont', 'system-ui',
          'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
