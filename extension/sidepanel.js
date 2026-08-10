/**
 * 사이드바: 앱을 iframe 으로 띄우고, 배경에서 긁어온 텍스트를 앱으로 전달한다.
 *
 * 앱은 postMessage 로 { type: 'PS_PASTE_TEXT', text } 를 받으면
 * 붙여넣기 모달을 열고 자동으로 파싱한다.
 */

const APP_ORIGIN = 'https://ksm031.github.io';

const iframe   = document.getElementById('app');
const fallback = document.getElementById('fallback');
const statusEl = document.getElementById('status');
const copyBtn  = document.getElementById('copyBtn');

let appReady = false;   // iframe 로드 완료
let lastText = '';      // 폴백 복사용

const showStatus = (msg) => {
  statusEl.textContent = msg;
  statusEl.style.display = msg ? 'block' : 'none';
  if (msg) setTimeout(() => { statusEl.style.display = 'none'; }, 2500);
};

/** 앱으로 텍스트 전달 (iframe 이 아직 안 떴으면 로드 후 재시도) */
function sendToApp(text) {
  lastText = text;
  if (!text.trim()) { showStatus('페이지에서 읽어온 내용이 없습니다'); return; }

  const post = () => {
    iframe.contentWindow?.postMessage({ type: 'PS_PASTE_TEXT', text }, APP_ORIGIN);
    showStatus(`${text.length.toLocaleString()}자 전달됨`);
  };

  if (appReady) post();
  else iframe.addEventListener('load', post, { once: true });
}

iframe.addEventListener('load', () => { appReady = true; });

// iframe 이 끝내 뜨지 않으면 폴백 안내 (X-Frame-Options 등)
setTimeout(() => {
  if (!appReady) {
    iframe.style.display = 'none';
    fallback.style.display = 'block';
  }
}, 4000);

copyBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastText);
    showStatus('복사했습니다');
  } catch {
    showStatus('복사 실패 — 수동으로 Ctrl+A, Ctrl+C 해주세요');
  }
});

// 1) 사이드바가 이미 열려 있을 때: 배경에서 보낸 메시지 수신
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PS_PASTE') sendToApp(msg.text ?? '');
});

// 2) 사이드바가 방금 열렸을 때: 배경이 미리 적어둔 내용을 읽어감
chrome.storage.local.get('pendingPaste').then(({ pendingPaste }) => {
  if (!pendingPaste) return;
  // 오래된 잔재는 무시 (30초)
  if (Date.now() - (pendingPaste.at ?? 0) > 30_000) return;
  sendToApp(pendingPaste.text ?? '');
  chrome.storage.local.remove('pendingPaste');
});
