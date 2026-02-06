const API_BASE = window.location.origin;
let socket;
let currentUser = null;
let currentParty = null;
let pendingInvite = null;

// 認証チェック
async function checkAuth() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    window.location.href = '/auth.html';
    return null;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Auth failed');
    }
    
    const data = await response.json();
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    
    return currentUser;
  } catch (error) {
    console.error('Auth check failed:', error);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth.html';
    return null;
  }
}

// 初期化
async function init() {
  const user = await checkAuth();
  if (!user) return;
  
  // UI更新
  document.getElementById('user-nickname').textContent = user.nickname;
  document.getElementById('user-uid').textContent = user.uid;
  document.getElementById('edit-nickname').value = user.nickname;
  
  // アバター表示（画像URL対応）
  updateAvatarDisplay(user.avatar);
  
  // 統計表示
  updateStats(user.stats);
  
  // Socket.IO接続
  connectSocket();
  
  // フレンドリストを読み込み
  loadFriends();
  
  // フレンド申請を読み込み
  loadFriendRequests();
  
  // イベントリスナー設定
  setupEventListeners();
}

// Socket.IO接続
function connectSocket() {
  socket = io(API_BASE, {
    auth: {
      token: localStorage.getItem('token')
    }
  });
  
  socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('authenticate', currentUser._id);
  });
  
  socket.on('authenticated', (data) => {
    console.log('Authenticated:', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });
  
  // フレンドオンライン/オフライン
  socket.on('friend_online', (userId) => {
    updateFriendOnlineStatus(userId, true);
  });
  
  socket.on('friend_offline', (userId) => {
    updateFriendOnlineStatus(userId, false);
  });
  
  // パーティー関連
  socket.on('party_created', (party) => {
    currentParty = party;
    showPartyUI();
  });
  
  socket.on('party_updated', (party) => {
    currentParty = party;
    updatePartyUI(party);
  });
  
  socket.on('party_invite', (invite) => {
    pendingInvite = invite;
    showInviteModal(invite);
  });
  
  socket.on('left_party', () => {
    currentParty = null;
    showSoloUI();
  });
  
  // キュー関連
  socket.on('queue_joined', () => {
    showQueueStatus(true);
  });
  
  socket.on('queue_left', () => {
    showQueueStatus(false);
  });
  
  // ゲーム開始
  socket.on('session_start', (sessionData) => {
    console.log('Game starting:', sessionData);
    // ゲーム画面へ遷移
    localStorage.setItem('sessionData', JSON.stringify(sessionData));
    window.location.href = '/simulation.html';
  });
  
  socket.on('error', (message) => {
    showNotification(message, 'error');
  });
}

// イベントリスナー設定
function setupEventListeners() {
  // 設定パネル開閉
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.add('open');
    document.getElementById('settings-overlay').classList.add('show');
  });
  
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', closeSettings);
  
  // タブ切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
  
  // アバター入力方法タブ切り替え
  document.querySelectorAll('.avatar-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.avatarTab;
      
      document.querySelectorAll('.avatar-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.avatar-input-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`avatar-${tabName}-input`).classList.add('active');
    });
  });
  
  // アバターURL プレビュー
  document.getElementById('preview-avatar-url').addEventListener('click', previewAvatarURL);
  
  // アバターファイル選択
  document.getElementById('select-avatar-file').addEventListener('click', () => {
    document.getElementById('avatar-file').click();
  });
  
  document.getElementById('avatar-file').addEventListener('change', handleAvatarFileUpload);
  
  // プロフィール保存
  document.getElementById('save-profile').addEventListener('click', saveProfile);
  
  // ログアウト
  document.getElementById('logout-btn').addEventListener('click', logout);
  
  // UID コピー
  document.getElementById('copy-uid').addEventListener('click', () => {
    const uid = document.getElementById('user-uid').textContent;
    navigator.clipboard.writeText(uid).then(() => {
      showNotification('UIDをコピーしました！', 'success');
    });
  });
  
  // フレンド追加
  document.getElementById('add-friend-form').addEventListener('submit', addFriend);
  
  // フレンド更新
  document.getElementById('refresh-friends').addEventListener('click', loadFriends);
  
  // パーティー作成
  document.getElementById('create-party-2').addEventListener('click', () => createParty(2));
  document.getElementById('create-party-4').addEventListener('click', () => createParty(4));
  
  // パーティー退出
  document.getElementById('leave-party').addEventListener('click', leaveParty);
  
  // 準備トグル
  document.getElementById('toggle-ready').addEventListener('click', toggleReady);
  
  // ソロキュー
  document.getElementById('join-solo-queue').addEventListener('click', joinSoloQueue);
  document.getElementById('leave-solo-queue').addEventListener('click', leaveSoloQueue);
  
  // 招待モーダル
  document.getElementById('close-invite').addEventListener('click', () => {
    document.getElementById('invite-modal').classList.remove('show');
  });
  
  document.getElementById('accept-invite').addEventListener('click', acceptInvite);
  document.getElementById('decline-invite').addEventListener('click', declineInvite);
}

// 統計更新
function updateStats(stats) {
  document.getElementById('stat-wins').textContent = stats.wins || 0;
  document.getElementById('stat-losses').textContent = stats.losses || 0;
  
  const total = (stats.wins || 0) + (stats.losses || 0);
  const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
  document.getElementById('stat-winrate').textContent = `${winRate}%`;
}

// 設定パネルを閉じる
function closeSettings() {
  document.getElementById('settings-panel').classList.remove('open');
  document.getElementById('settings-overlay').classList.remove('show');
}

// アバター表示を更新（画像URL対応）
function updateAvatarDisplay(avatarUrl) {
  // ヘッダーのアバター
  const headerAvatar = document.getElementById('user-avatar');
  const headerFallback = document.getElementById('user-avatar-fallback');
  
  if (avatarUrl && avatarUrl.startsWith('http')) {
    headerAvatar.src = avatarUrl;
    headerAvatar.style.display = 'inline';
    headerFallback.style.display = 'none';
  } else {
    headerAvatar.style.display = 'none';
    headerFallback.style.display = 'inline';
    headerFallback.textContent = avatarUrl || '👤';
  }
  
  // プレビューのアバター
  const previewImg = document.getElementById('current-avatar-img');
  const previewPlaceholder = document.getElementById('current-avatar-placeholder');
  
  if (avatarUrl && avatarUrl.startsWith('http')) {
    previewImg.src = avatarUrl;
    previewImg.style.display = 'block';
    previewPlaceholder.style.display = 'none';
  } else {
    previewImg.style.display = 'none';
    previewPlaceholder.style.display = 'flex';
    previewPlaceholder.querySelector('span').textContent = avatarUrl || '👤';
  }
  
  // URL入力欄にも反映
  if (avatarUrl && avatarUrl.startsWith('http')) {
    document.getElementById('avatar-url').value = avatarUrl;
  }
}

// アバターURLのプレビュー
function previewAvatarURL() {
  const url = document.getElementById('avatar-url').value.trim();
  
  if (!url) {
    showNotification('URLを入力してください', 'error');
    return;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showNotification('有効なURLを入力してください（http:// または https://）', 'error');
    return;
  }
  
  // プレビュー更新
  updateAvatarDisplay(url);
  showNotification('プレビューを更新しました。保存ボタンを押してください。', 'success');
}

// アバターファイルアップロード処理
function handleAvatarFileUpload(e) {
  const file = e.target.files[0];
  
  if (!file) return;
  
  // ファイルサイズチェック（1MB以下）
  if (file.size > 1024 * 1024) {
    showNotification('ファイルサイズは1MB以下にしてください', 'error');
    return;
  }
  
  // 画像ファイルチェック
  if (!file.type.startsWith('image/')) {
    showNotification('画像ファイルを選択してください', 'error');
    return;
  }
  
  // Base64に変換してプレビュー
  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target.result;
    updateAvatarDisplay(base64);
    showNotification('プレビューを更新しました。保存ボタンを押してください。', 'success');
  };
  reader.onerror = () => {
    showNotification('ファイルの読み込みに失敗しました', 'error');
  };
  reader.readAsDataURL(file);
}

// プロフィール保存
async function saveProfile() {
  const nickname = document.getElementById('edit-nickname').value.trim();
  
  // アバター取得（URL または Base64）
  let avatar;
  const avatarUrl = document.getElementById('avatar-url').value.trim();
  const previewImg = document.getElementById('current-avatar-img');
  
  if (previewImg.style.display !== 'none' && previewImg.src) {
    avatar = previewImg.src;
  } else if (avatarUrl && avatarUrl.startsWith('http')) {
    avatar = avatarUrl;
  } else {
    const fallback = document.getElementById('current-avatar-placeholder').querySelector('span').textContent;
    avatar = fallback || '👤';
  }
  
  if (!nickname || nickname.length < 1 || nickname.length > 20) {
    showNotification('ニックネームは1〜20文字で入力してください', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      credentials: 'include',
      body: JSON.stringify({ nickname, avatar })
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'プロフィールの更新に失敗しました');
    }
    
    const data = await response.json();
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    
    // UI更新
    document.getElementById('user-nickname').textContent = currentUser.nickname;
    updateAvatarDisplay(currentUser.avatar);
    
    showNotification('プロフィールを更新しました！', 'success');
    
    // 設定パネルを閉じる
    setTimeout(() => {
      closeSettings();
    }, 1000);
    
  } catch (error) {
    console.error('Profile update error:', error);
    showNotification(error.message, 'error');
  }
}

// ログアウト
async function logout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      credentials: 'include'
    });
  } catch (error) {
    console.error('Logout error:', error);
  }
  
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  if (socket) {
    socket.disconnect();
  }
  
  window.location.href = '/auth.html';
}

// フレンドリスト読み込み
async function loadFriends() {
  try {
    const response = await fetch(`${API_BASE}/api/friends`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load friends');
    
    const data = await response.json();
    displayFriends(data.friends);
  } catch (error) {
    console.error('Load friends error:', error);
  }
}

// フレンド表示
function displayFriends(friends) {
  const friendsList = document.getElementById('friends-list');
  
  if (!friends || friends.length === 0) {
    friendsList.innerHTML = `
      <div class="empty-state">
        <p>まだフレンドがいません</p>
        <p class="hint">設定からフレンドを追加できます</p>
      </div>
    `;
    return;
  }
  
  friendsList.innerHTML = friends.map(friend => {
    const avatarHtml = friend.avatar && friend.avatar.startsWith('http')
      ? `<img class="friend-avatar" src="${friend.avatar}" alt="${friend.nickname}" onerror="this.outerHTML='<div class=\\'friend-avatar\\' style=\\'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;\\'>👤</div>';">`
      : `<div class="friend-avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">${friend.avatar || '👤'}</div>`;
    
    return `
      <div class="friend-item" data-user-id="${friend._id}">
        <div class="friend-info">
          ${avatarHtml}
          <div class="friend-details">
            <h4>${friend.nickname}</h4>
            <p>UID: ${friend.uid}</p>
          </div>
        </div>
        <div class="friend-actions">
          <div class="online-status" id="status-${friend._id}"></div>
          <button class="btn btn-primary btn-sm" onclick="inviteFriend('${friend._id}')">
            招待
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// フレンドオンライン状態更新
function updateFriendOnlineStatus(userId, isOnline) {
  const statusEl = document.getElementById(`status-${userId}`);
  if (statusEl) {
    if (isOnline) {
      statusEl.classList.add('online');
    } else {
      statusEl.classList.remove('online');
    }
  }
}

// フレンド招待
function inviteFriend(friendId) {
  if (!currentParty) {
    showNotification('先にパーティーを作成してください', 'error');
    return;
  }
  
  socket.emit('invite_to_party', { targetUserId: friendId });
  showNotification('招待を送信しました！', 'success');
}

// フレンド追加
async function addFriend(e) {
  e.preventDefault();
  
  const searchTerm = document.getElementById('friend-search').value.trim();
  const resultDiv = document.getElementById('add-friend-result');
  
  if (!searchTerm) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      credentials: 'include',
      body: JSON.stringify({ searchTerm })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send request');
    }
    
    resultDiv.textContent = 'フレンド申請を送信しました！';
    resultDiv.className = 'result-message success show';
    
    document.getElementById('friend-search').value = '';
    
    setTimeout(() => {
      resultDiv.classList.remove('show');
    }, 3000);
    
  } catch (error) {
    console.error('Add friend error:', error);
    resultDiv.textContent = error.message;
    resultDiv.className = 'result-message error show';
  }
}

// フレンド申請読み込み
async function loadFriendRequests() {
  try {
    const [receivedRes, sentRes] = await Promise.all([
      fetch(`${API_BASE}/api/friends/requests/received`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        credentials: 'include'
      }),
      fetch(`${API_BASE}/api/friends/requests/sent`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        credentials: 'include'
      })
    ]);
    
    const receivedData = await receivedRes.json();
    const sentData = await sentRes.json();
    
    displayReceivedRequests(receivedData.requests);
    displaySentRequests(sentData.requests);
    
    // バッジ更新
    const badge = document.getElementById('requests-badge');
    if (receivedData.requests.length > 0) {
      badge.textContent = receivedData.requests.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
    
  } catch (error) {
    console.error('Load requests error:', error);
  }
}

// 受信リクエスト表示
function displayReceivedRequests(requests) {
  const container = document.getElementById('received-requests');
  
  if (!requests || requests.length === 0) {
    container.innerHTML = '<p class="empty-state">申請はありません</p>';
    return;
  }
  
  container.innerHTML = requests.map(req => {
    const avatarHtml = req.from.avatar && req.from.avatar.startsWith('http')
      ? `<img class="request-avatar" src="${req.from.avatar}" alt="${req.from.nickname}">`
      : `<div class="request-avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">${req.from.avatar || '👤'}</div>`;
    
    return `
      <div class="request-item">
        <div class="request-user">
          ${avatarHtml}
          <div class="request-details">
            <h4>${req.from.nickname}</h4>
            <p>UID: ${req.from.uid}</p>
          </div>
        </div>
        <div class="request-actions">
          <button class="btn btn-primary" onclick="acceptRequest('${req._id}')">承認</button>
          <button class="btn btn-secondary" onclick="rejectRequest('${req._id}')">拒否</button>
        </div>
      </div>
    `;
  }).join('');
}

// 送信リクエスト表示
function displaySentRequests(requests) {
  const container = document.getElementById('sent-requests');
  
  if (!requests || requests.length === 0) {
    container.innerHTML = '<p class="empty-state">申請はありません</p>';
    return;
  }
  
  container.innerHTML = requests.map(req => {
    const avatarHtml = req.to.avatar && req.to.avatar.startsWith('http')
      ? `<img class="request-avatar" src="${req.to.avatar}" alt="${req.to.nickname}">`
      : `<div class="request-avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">${req.to.avatar || '👤'}</div>`;
    
    return `
      <div class="request-item">
        <div class="request-user">
          ${avatarHtml}
          <div class="request-details">
            <h4>${req.to.nickname}</h4>
            <p>UID: ${req.to.uid}</p>
          </div>
        </div>
        <div class="request-actions">
          <span style="color: var(--text-muted); font-size: 0.9rem;">送信済み...</span>
        </div>
      </div>
    `;
  }).join('');
}

// リクエスト承認
async function acceptRequest(requestId) {
  try {
    const response = await fetch(`${API_BASE}/api/friends/request/${requestId}/accept`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('申請の承認に失敗しました');
    
    showNotification('フレンド申請を承認しました！', 'success');
    loadFriendRequests();
    loadFriends();
    
  } catch (error) {
    console.error('Accept request error:', error);
    showNotification(error.message, 'error');
  }
}

// リクエスト拒否
async function rejectRequest(requestId) {
  try {
    const response = await fetch(`${API_BASE}/api/friends/request/${requestId}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('申請の拒否に失敗しました');
    
    showNotification('フレンド申請を拒否しました', 'success');
    loadFriendRequests();
    
  } catch (error) {
    console.error('Reject request error:', error);
    showNotification(error.message, 'error');
  }
}

// パーティー作成
function createParty(maxSize) {
  if (currentParty) {
    showNotification('既にパーティーに参加しています', 'error');
    return;
  }
  
  socket.emit('create_party', { maxSize });
}

// パーティーUI表示
function showPartyUI() {
  document.getElementById('solo-matchmaking').style.display = 'none';
  document.getElementById('party-matchmaking').style.display = 'block';
  updatePartyUI(currentParty);
}

// ソロUI表示
function showSoloUI() {
  document.getElementById('solo-matchmaking').style.display = 'block';
  document.getElementById('party-matchmaking').style.display = 'none';
}

// パーティーUI更新
function updatePartyUI(party) {
  const membersContainer = document.getElementById('party-members');
  const statusContainer = document.getElementById('party-status');
  
  // メンバー表示
  membersContainer.innerHTML = party.members.map(memberId => {
    const isReady = party.readyStatus[memberId];
    const isLeader = memberId === party.leaderId;
    const isSelf = memberId === currentUser._id;
    
    return `
      <div class="party-member">
        <div class="member-info">
          <span>${isSelf ? 'あなた' : 'メンバー'}</span>
          ${isLeader ? '<span class="member-status leader">リーダー</span>' : ''}
          ${isReady ? '<span class="member-status ready">準備OK</span>' : '<span class="member-status not-ready">待機中</span>'}
        </div>
      </div>
    `;
  }).join('');
  
  // ステータス更新
  const allReady = Object.values(party.readyStatus).every(r => r === true);
  const isFull = party.members.length === party.maxSize;
  
  if (allReady && isFull) {
    statusContainer.textContent = '全員準備完了！セッションを開始します...';
    statusContainer.style.backgroundColor = 'rgba(80, 200, 120, 0.1)';
    statusContainer.style.borderLeftColor = 'var(--secondary-color)';
  } else if (!isFull) {
    statusContainer.textContent = `あと${party.maxSize - party.members.length}人待っています...`;
    statusContainer.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
    statusContainer.style.borderLeftColor = 'var(--warning-color)';
  } else {
    statusContainer.textContent = '全員の準備が完了するのを待っています...';
    statusContainer.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
    statusContainer.style.borderLeftColor = 'var(--primary-color)';
  }
  
  // 準備ボタン更新
  const readyBtn = document.getElementById('toggle-ready');
  const readyText = document.getElementById('ready-text');
  const isCurrentUserReady = party.readyStatus[currentUser._id];
  
  if (isCurrentUserReady) {
    readyText.textContent = '準備解除';
    readyBtn.classList.remove('btn-primary');
    readyBtn.classList.add('btn-secondary');
  } else {
    readyText.textContent = '準備完了';
    readyBtn.classList.remove('btn-secondary');
    readyBtn.classList.add('btn-primary');
  }
}

// パーティー退出
function leaveParty() {
  socket.emit('leave_party');
}

// 準備トグル
function toggleReady() {
  socket.emit('toggle_ready');
}

// ソロキュー参加
function joinSoloQueue() {
  socket.emit('join_solo_queue');
}

// ソロキュー退出
function leaveSoloQueue() {
  socket.emit('leave_solo_queue');
}

// キューステータス表示
function showQueueStatus(inQueue) {
  const button = document.getElementById('join-solo-queue');
  const status = document.getElementById('solo-queue-status');
  
  if (inQueue) {
    button.style.display = 'none';
    status.style.display = 'block';
  } else {
    button.style.display = 'block';
    status.style.display = 'none';
  }
}

// 招待モーダル表示
function showInviteModal(invite) {
  const modal = document.getElementById('invite-modal');
  const message = document.getElementById('invite-message');
  
  message.textContent = `${invite.maxSize}人パーティーに招待されました！`;
  modal.classList.add('show');
}

// 招待受諾
function acceptInvite() {
  if (pendingInvite) {
    socket.emit('join_party', { partyId: pendingInvite.partyId });
    document.getElementById('invite-modal').classList.remove('show');
    pendingInvite = null;
  }
}

// 招待拒否
function declineInvite() {
  document.getElementById('invite-modal').classList.remove('show');
  pendingInvite = null;
}

// 通知表示
function showNotification(message, type = 'info') {
  // 簡易的な通知（よりリッチなUIにする場合はtoastライブラリを使用）
  alert(message);
}

// ページロード時に初期化
document.addEventListener('DOMContentLoaded', init);
