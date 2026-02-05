const API_BASE = window.location.origin;

// フォーム切り替え
document.getElementById('show-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('signup-form').classList.remove('active');
  document.getElementById('login-form').classList.add('active');
  hideError();
});

document.getElementById('show-signup')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').classList.remove('active');
  document.getElementById('signup-form').classList.add('active');
  hideError();
});

// サインアップ処理
document.getElementById('signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const nickname = document.getElementById('signup-nickname').value.trim();
  const password = document.getElementById('signup-password').value;
  const deviceFingerprint = getOrCreateFingerprint();
  
  if (!nickname || !password) {
    showError('Please fill in all fields');
    return;
  }
  
  if (password.length < 4) {
    showError('Password must be at least 4 characters');
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setLoading(submitBtn, true);
  hideError();
  
  try {
    const response = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ nickname, password, deviceFingerprint })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Signup failed');
    }
    
    // トークンとユーザー情報を保存
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    // ロビーへリダイレクト
    window.location.href = '/lobby.html';
    
  } catch (error) {
    console.error('Signup error:', error);
    showError(error.message);
    setLoading(submitBtn, false);
  }
});

// ログイン処理
document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const nickname = document.getElementById('login-nickname').value.trim();
  const password = document.getElementById('login-password').value;
  const deviceFingerprint = getOrCreateFingerprint();
  
  if (!nickname || !password) {
    showError('Please fill in all fields');
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setLoading(submitBtn, true);
  hideError();
  
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ nickname, password, deviceFingerprint })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    // トークンとユーザー情報を保存
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    // ロビーへリダイレクト
    window.location.href = '/lobby.html';
    
  } catch (error) {
    console.error('Login error:', error);
    showError(error.message);
    setLoading(submitBtn, false);
  }
});

// 自動ログイン（既存トークンがある場合）
async function checkExistingAuth() {
  const token = localStorage.getItem('token');
  
  if (!token) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/lobby.html';
    } else {
      // トークンが無効な場合は削除
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  } catch (error) {
    console.error('Auth verification error:', error);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}

// ページロード時に自動ログインをチェック
checkExistingAuth();

// ヘルパー関数
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
}

function hideError() {
  const errorDiv = document.getElementById('error-message');
  errorDiv.classList.remove('show');
}

function setLoading(button, loading) {
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');
  
  if (loading) {
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';
    button.disabled = true;
  } else {
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    button.disabled = false;
  }
}
