// デバイス検出とリダイレクト処理
document.addEventListener('DOMContentLoaded', () => {
  const device = detectDevice();
  
  // モバイル・タブレットの場合は直接認証画面へ
  if (device.isMobile && !device.isTablet) {
    console.log('Mobile device detected, redirecting to auth...');
    window.location.href = '/auth.html';
    return;
  }
  
  // タブレットの場合も認証画面へ（学習サイトはスキップ）
  if (device.isTablet) {
    console.log('Tablet detected, redirecting to auth...');
    window.location.href = '/auth.html';
    return;
  }
  
  // PCの場合は Ctrl+1 を待つ
  console.log('Desktop detected, waiting for secret command...');
  
  document.addEventListener('keydown', (e) => {
    // Ctrl+1 または Cmd+1 (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
      e.preventDefault();
      
      // 簡単なアニメーション効果
      document.body.style.transition = 'opacity 0.5s';
      document.body.style.opacity = '0';
      
      setTimeout(() => {
        window.location.href = '/auth.html';
      }, 500);
    }
  });
  
  // イースターエッグ: 3回連続でロゴをクリックしても開ける
  let logoClicks = 0;
  let lastClickTime = 0;
  
  const logo = document.querySelector('.logo');
  if (logo) {
    logo.addEventListener('click', () => {
      const now = Date.now();
      
      if (now - lastClickTime < 1000) {
        logoClicks++;
      } else {
        logoClicks = 1;
      }
      
      lastClickTime = now;
      
      if (logoClicks >= 3) {
        document.body.style.transition = 'opacity 0.3s';
        document.body.style.opacity = '0';
        
        setTimeout(() => {
          window.location.href = '/auth.html';
        }, 300);
      }
    });
  }
});
