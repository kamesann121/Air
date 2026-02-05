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
  document.getElementById('user-avatar').textContent = user.avatar;
  document.getElementById('user-uid').textContent = user.uid;
  document.getElementById('edit-nickname').value = user.nickname;
  
  // 統計表示
  updateStats(user.stats);
  
  // アバター選択状態
  document.querySelectorAll('.avatar-option').forEach(btn => {
    if (btn.dataset.avatar === user.avatar) {
      btn.classList.add('selected');
    }
  });
  
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
  
  // セッション開始
  socket.on('session_start', (sessionData) => {
    console.log('Session starting:', sessionData);
    // セッション画面へ遷移
    localStorage.setItem('sessionData', JSON.stringify(sessionData));
    window.location.href = '/simulation.html';
  });
  
  socket.on('error', (message) => {
    showNotification(message, 'error');
  });
}

// イベントリスナー設定
function setupEventListeners() {
  // 設定モーダル
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('show');
  });
  
  document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('show');
  });
  
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
  
  // プロフィール保存
  document.getElementById('save-profile').addEventListener('click', saveProfile);
  
  // ログアウト
  document.getElementById('logout-btn').addEventListener('click', logout);
  
  // アバター選択
  document.querySelectorAll('.avatar-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  
  // UID コピー
  document.getElementById('copy-uid').addEventListener('click', () => {
    const uid = document.getElementById('user-uid').textContent;
    navigator.clipboard.writeText(uid).then(() => {
      showNotification('UID copied to clipboard!', 'success');
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

// プロフィール保存
async function saveProfile() {
  const nickname = document.getElementById('edit-nickname').value.trim();
  const selectedAvatar = document.querySelector('.avatar-option.selected');
  const avatar = selectedAvatar ? selectedAvatar.dataset.avatar : currentUser.avatar;
  
  if (!nickname || nickname.length < 1 || nickname.length > 20) {
    showNotification('Nickname must be 1-20 characters', 'error');
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
      throw new Error(data.error || 'Failed to update profile');
    }
    
    const data = await response.json();
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    
    // UI更新
    document.getElementById('user-nickname').textContent = currentUser.nickname;
    document.getElementById('user-avatar').textContent = currentUser.avatar;
    
    showNotification('Profile updated successfully!', 'success');
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
        <p>No friends yet</p>
        <p class="hint">Use settings to add friends</p>
      </div>
    `;
    return;
  }
  
  friendsList.innerHTML = friends.map(friend => `
    <div class="friend-item" data-user-id="${friend._id}">
      <div class="friend-info">
        <span class="friend-avatar">${friend.avatar}</span>
        <div class="friend-details">
          <h4>${friend.nickname}</h4>
          <p>UID: ${friend.uid}</p>
        </div>
      </div>
      <div class="friend-actions">
        <div class="online-status" id="status-${friend._id}"></div>
        <button class="btn btn-primary btn-sm" onclick="inviteFriend('${friend._id}')">
          Invite
        </button>
      </div>
    </div>
  `).join('');
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
    showNotification('Create a party first!', 'error');
    return;
  }
  
  socket.emit('invite_to_party', { targetUserId: friendId });
  showNotification('Invitation sent!', 'success');
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
    
    resultDiv.textContent = 'Friend request sent successfully!';
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
    container.innerHTML = '<p class="empty-state">No pending requests</p>';
    return;
  }
  
  container.innerHTML = requests.map(req => `
    <div class="request-item">
      <div class="request-user">
        <span class="request-avatar">${req.from.avatar}</span>
        <div class="request-details">
          <h4>${req.from.nickname}</h4>
          <p>UID: ${req.from.uid}</p>
        </div>
      </div>
      <div class="request-actions">
        <button class="btn btn-primary" onclick="acceptRequest('${req._id}')">Accept</button>
        <button class="btn btn-secondary" onclick="rejectRequest('${req._id}')">Reject</button>
      </div>
    </div>
  `).join('');
}

// 送信リクエスト表示
function displaySentRequests(requests) {
  const container = document.getElementById('sent-requests');
  
  if (!requests || requests.length === 0) {
    container.innerHTML = '<p class="empty-state">No pending requests</p>';
    return;
  }
  
  container.innerHTML = requests.map(req => `
    <div class="request-item">
      <div class="request-user">
        <span class="request-avatar">${req.to.avatar}</span>
        <div class="request-details">
          <h4>${req.to.nickname}</h4>
          <p>UID: ${req.to.uid}</p>
        </div>
      </div>
      <div class="request-actions">
        <span style="color: var(--text-muted); font-size: 0.9rem;">Pending...</span>
      </div>
    </div>
  `).join('');
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
    
    if (!response.ok) throw new Error('Failed to accept request');
    
    showNotification('Friend request accepted!', 'success');
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
    
    if (!response.ok) throw new Error('Failed to reject request');
    
    showNotification('Friend request rejected', 'success');
    loadFriendRequests();
    
  } catch (error) {
    console.error('Reject request error:', error);
    showNotification(error.message, 'error');
  }
}

// パーティー作成
function createParty(maxSize) {
  if (currentParty) {
    showNotification('You are already in a party', 'error');
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
          <span>${isSelf ? 'You' : 'Member'}</span>
          ${isLeader ? '<span class="member-status leader">Leader</span>' : ''}
          ${isReady ? '<span class="member-status ready">Ready</span>' : '<span class="member-status not-ready">Not Ready</span>'}
        </div>
      </div>
    `;
  }).join('');
  
  // ステータス更新
  const allReady = Object.values(party.readyStatus).every(r => r === true);
  const isFull = party.members.length === party.maxSize;
  
  if (allReady && isFull) {
    statusContainer.textContent = 'All players ready! Starting session...';
    statusContainer.style.backgroundColor = 'rgba(80, 200, 120, 0.1)';
    statusContainer.style.borderLeftColor = 'var(--secondary-color)';
  } else if (!isFull) {
    statusContainer.textContent = `Waiting for ${party.maxSize - party.members.length} more player(s)...`;
    statusContainer.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
    statusContainer.style.borderLeftColor = 'var(--warning-color)';
  } else {
    statusContainer.textContent = 'Waiting for all members to be ready...';
    statusContainer.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
    statusContainer.style.borderLeftColor = 'var(--primary-color)';
  }
  
  // 準備ボタン更新
  const readyBtn = document.getElementById('toggle-ready');
  const readyText = document.getElementById('ready-text');
  const isCurrentUserReady = party.readyStatus[currentUser._id];
  
  if (isCurrentUserReady) {
    readyText.textContent = 'Not Ready';
    readyBtn.classList.remove('btn-primary');
    readyBtn.classList.add('btn-secondary');
  } else {
    readyText.textContent = 'Ready';
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
  
  message.textContent = `You have been invited to a ${invite.maxSize}-player party!`;
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
