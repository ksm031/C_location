/**
 * 단축키 → 현재 탭 내용을 긁어 사이드바로 전달
 *
 * 사이드바(sidepanel.html)는 열리는 데 시간이 걸리므로 메시지를 놓칠 수 있다.
 * 그래서 chrome.storage 에 먼저 적어두고(사이드바가 켜지면 읽어감)
 * 메시지도 함께 보낸다(이미 열려 있으면 즉시 반영).
 */

const COMMAND = 'scrape-and-register';

/** 툴바 아이콘 클릭으로도 사이드바가 열리게 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== COMMAND) return;

  const target = tab?.id
    ? tab
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!target?.id) return;

  // 1) 사이드바 먼저 열기 — 단축키가 사용자 제스처로 인정되는 동안 호출해야 한다
  try {
    await chrome.sidePanel.open({ tabId: target.id });
  } catch (e) {
    console.warn('사이드바 열기 실패:', e);
  }

  // 2) 탭의 보이는 텍스트 수집 (Ctrl+A → Ctrl+C 와 동일한 형태)
  //    표 셀은 탭 문자로 구분되어 파서가 그대로 읽을 수 있다
  let text = '';
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: target.id },
      func: () => document.body?.innerText ?? '',
    });
    text = res?.result ?? '';
  } catch (e) {
    console.warn('페이지 읽기 실패:', e);
    text = '';
  }

  // 3) 사이드바로 전달
  const payload = { text, sourceUrl: target.url ?? '', at: Date.now() };
  await chrome.storage.local.set({ pendingPaste: payload });
  chrome.runtime.sendMessage({ type: 'PS_PASTE', ...payload }).catch(() => {
    // 사이드바가 아직 안 떠 있으면 storage 로 전달되므로 무시
  });
});
