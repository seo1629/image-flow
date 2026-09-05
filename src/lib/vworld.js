// The VWorld SDK script tag lives statically in index.html (see the comment
// there for why) and loads asynchronously in the background. This just
// waits for the globals it eventually defines: window.vw, window.Cesium.
export function waitForVWorldSdk(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (window.vw && window.Cesium) {
        resolve(window.vw);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('VWorld SDK를 불러오지 못했습니다. Settings에 VWorld API 키가 올바르게 저장되어 있는지 확인하고 페이지를 새로고침해주세요.'));
        return;
      }
      setTimeout(poll, 150);
    };
    poll();
  });
}
