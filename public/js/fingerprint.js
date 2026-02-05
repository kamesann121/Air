// シンプルなデバイスフィンガープリント生成
// より高度な実装には fingerprintjs2 などのライブラリを使用可能

function generateDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Canvas fingerprinting
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText('Device fingerprint', 2, 15);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.fillText('Device fingerprint', 4, 17);
  
  const canvasData = canvas.toDataURL();
  
  // 各種ブラウザ・デバイス情報
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    navigator.hardwareConcurrency || 'unknown',
    navigator.deviceMemory || 'unknown',
    canvasData
  ];
  
  // シンプルなハッシュ関数
  const hash = simpleHash(components.join('|||'));
  
  return hash;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// デバイスタイプ検出
function detectDevice() {
  const ua = navigator.userAgent;
  
  return {
    isIOS: /iPad|iPhone|iPod/.test(ua) && !window.MSStream,
    isAndroid: /Android/.test(ua),
    isTablet: /(iPad|tablet|playbook)|(android(?!.*mobile))/i.test(ua),
    isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
    isPC: !/iPhone|iPad|iPod|Android/i.test(ua),
    hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0
  };
}

// ローカルストレージに保存/取得
function getOrCreateFingerprint() {
  const stored = localStorage.getItem('device_fingerprint');
  
  if (stored) {
    return stored;
  }
  
  const fingerprint = generateDeviceFingerprint();
  localStorage.setItem('device_fingerprint', fingerprint);
  
  return fingerprint;
}
