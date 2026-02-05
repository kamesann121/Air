// lobby.js - ロビー、マッチメイキング、パーティー機能のクライアント側処理

class LobbyManager {
  constructor(socket) {
    this.socket = socket;
    this.currentParty = null;
    this.friendsList = [];
    this.onlineFriends = new Set();
    this.inQueue = false;
    
    this.setupSocketListeners();
    this.setupUIListeners();
    this.loadFriends();
  }
  
  setupSocketListeners() {
    // フレンドリスト受信
    this.socket.on('friends_list', (friends) => {
      this.friendsList = friends;
      this.renderFriendsList();
    });
    
    // フレンドがオンラインになった
    this.socket.on('friend_online', (friendId) => {
      this.onlineFriends.add(friendId);
      this.updateFriendStatus(friendId, true);
    });
    
    // フレンドがオフラインになった
    this.socket.on('friend_offline', (friendId) => {
      this.onlineFriends.delete(friendId);
      this.updateFriendStatus(friendId, false);
    });
    
    // フレンドリクエスト受信
    this.socket.on('friend_request', (data) => {
      this.showFriendRequest(data);
    });
    
    // フレンドリクエスト承認
    this.socket.on('friend_added', (friend) => {
      this.friendsList.push(friend);
      this.renderFriendsList();
      this.showNotification(`${friend.username}とフレンドになりました！`);
    });
    
    // パーティー招待受信
    this.socket.on('party_invite', (data) => {
      this.showPartyInvite(data);
    });
    
    // パーティー参加成功
    this.socket.on('party_joined', (party) => {
      this.currentParty = party;
      this.renderParty();
      this.showNotification('パーティーに参加しました');
    });
    
    // パーティー更新
    this.socket.on('party_updated', (party) => {
      this.currentParty = party;
      this.renderParty();
    });
    
    // パーティー退出
    this.socket.on('left_party', () => {
      this.currentParty = null;
      this.renderParty();
      this.showNotification('パーティーから退出しました');
    });
    
    // マッチメイキングキュー参加
    this.socket.on('queue_joined', () => {
      this.inQueue = true;
      this.updateQueueStatus(true);
      this.showNotification('マッチメイキング中...');
    });
    
    // マッチメイキングキュー退出
    this.socket.on('queue_left', () => {
      this.inQueue = false;
      this.updateQueueStatus(false);
    });
    
    // セッション開始
    this.socket.on('session_start', (sessionData) => {
      this.startGame(sessionData);
    });
    
    // エラー
    this.socket.on('error', (message) => {
      this.showNotification(message, 'error');
    });
  }
  
  setupUIListeners() {
    // ソロキューボタン
    const soloQueueBtn = document.getElementById('solo-queue-btn');
    if (soloQueueBtn) {
      soloQueueBtn.addEventListener('click', () => {
        if (this.inQueue) {
          this.leaveSoloQueue();
        } else {
          this.joinSoloQueue();
        }
      });
    }
    
    // パーティー作成ボタン
    const createPartyBtn = document.getElementById('create-party-btn');
    if (createPartyBtn) {
      createPartyBtn.addEventListener('click', () => {
        this.showPartyCreationDialog();
      });
    }
    
    // パーティー退出ボタン
    const leavePartyBtn = document.getElementById('leave-party-btn');
    if (leavePartyBtn) {
      leavePartyBtn.addEventListener('click', () => {
        this.leaveParty();
      });
    }
    
    // 準備完了トグルボタン
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
      readyBtn.addEventListener('click', () => {
        this.toggleReady();
      });
    }
    
    // フレンド追加ボタン
    const addFriendBtn = document.getElementById('add-friend-btn');
    if (addFriendBtn) {
      addFriendBtn.addEventListener('click', () => {
        this.showAddFriendDialog();
      });
    }
    
    // プロフィールボタン
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        this.showProfile();
      });
    }
  }
  
  loadFriends() {
    this.socket.emit('get_friends');
  }
  
  renderFriendsList() {
    const friendsListElement = document.getElementById('friends-list');
    if (!friendsListElement) return;
    
    friendsListElement.innerHTML = '';
    
    if (this.friendsList.length === 0) {
      friendsListElement.innerHTML = '<p class="no-friends">フレンドがいません</p>';
      return;
    }
    
    this.friendsList.forEach(friend => {
      const friendElement = document.createElement('div');
      friendElement.className = 'friend-item';
      
      const isOnline = this.onlineFriends.has(friend._id);
      const statusClass = isOnline ? 'online' : 'offline';
      const statusText = isOnline ? 'オンライン' : 'オフライン';
      
      friendElement.innerHTML = `
        <div class="friend-info">
          <div class="friend-avatar">
            <img src="${friend.avatar || '/images/default-avatar.png'}" alt="${friend.username}">
            <span class="status-indicator ${statusClass}"></span>
          </div>
          <div class="friend-details">
            <h4>${friend.username}</h4>
            <p class="friend-status">${statusText}</p>
          </div>
        </div>
        <div class="friend-actions">
          ${isOnline ? `
            <button class="btn btn-sm btn-primary invite-btn" data-friend-id="${friend._id}">
              招待
            </button>
          ` : ''}
          <button class="btn btn-sm btn-secondary remove-btn" data-friend-id="${friend._id}">
            削除
          </button>
        </div>
      `;
      
      // 招待ボタンのイベントリスナー
      const inviteBtn = friendElement.querySelector('.invite-btn');
      if (inviteBtn) {
        inviteBtn.addEventListener('click', () => {
          this.inviteToParty(friend._id);
        });
      }
      
      // 削除ボタンのイベントリスナー
      const removeBtn = friendElement.querySelector('.remove-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          this.removeFriend(friend._id);
        });
      }
      
      friendsListElement.appendChild(friendElement);
    });
  }
  
  updateFriendStatus(friendId, isOnline) {
    const friendElement = document.querySelector(`[data-friend-id="${friendId}"]`);
    if (!friendElement) return;
    
    const statusIndicator = friendElement.querySelector('.status-indicator');
    const statusText = friendElement.querySelector('.friend-status');
    
    if (isOnline) {
      statusIndicator.classList.remove('offline');
      statusIndicator.classList.add('online');
      statusText.textContent = 'オンライン';
    } else {
      statusIndicator.classList.remove('online');
      statusIndicator.classList.add('offline');
      statusText.textContent = 'オフライン';
    }
  }
  
  renderParty() {
    const partyElement = document.getElementById('party-info');
    if (!partyElement) return;
    
    if (!this.currentParty) {
      partyElement.innerHTML = '<p class="no-party">パーティーに参加していません</p>';
      
      // ボタンの表示を更新
      document.getElementById('leave-party-btn')?.classList.add('hidden');
      document.getElementById('ready-btn')?.classList.add('hidden');
      return;
    }
    
    const userId = localStorage.getItem('userId');
    const isLeader = this.currentParty.leader === userId;
    
    partyElement.innerHTML = `
      <div class="party-header">
        <h3>パーティー (${this.currentParty.members.length}/${this.currentParty.maxSize})</h3>
        ${isLeader ? '<span class="leader-badge">リーダー</span>' : ''}
      </div>
      <div class="party-members">
        ${this.currentParty.memberDetails.map(member => {
          const isReady = this.currentParty.readyStatus[member._id] || false;
          const isCurrentUser = member._id === userId;
          
          return `
            <div class="party-member ${isReady ? 'ready' : ''}">
              <div class="member-avatar">
                <img src="${member.avatar || '/images/default-avatar.png'}" alt="${member.username}">
                ${isReady ? '<span class="ready-badge">✓</span>' : ''}
              </div>
              <div class="member-info">
                <h4>${member.username} ${isCurrentUser ? '(あなた)' : ''}</h4>
                <p>${isReady ? '準備完了' : '準備中'}</p>
              </div>
              ${isLeader && !isCurrentUser ? `
                <button class="btn btn-sm btn-danger kick-btn" data-member-id="${member._id}">
                  キック
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
    
    // キックボタンのイベントリスナー
    partyElement.querySelectorAll('.kick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memberId = e.target.dataset.memberId;
        this.kickMember(memberId);
      });
    });
    
    // ボタンの表示を更新
    document.getElementById('leave-party-btn')?.classList.remove('hidden');
    document.getElementById('ready-btn')?.classList.remove('hidden');
    
    // 準備完了ボタンのテキスト更新
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
      const isReady = this.currentParty.readyStatus[userId] || false;
      readyBtn.textContent = isReady ? '準備解除' : '準備完了';
      readyBtn.classList.toggle('ready', isReady);
    }
  }
  
  showPartyCreationDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <h3>パーティーを作成</h3>
        <div class="form-group">
          <label>最大人数:</label>
          <select id="party-size-select">
            <option value="2">2人 (1v1)</option>
            <option value="4">4人 (2v2)</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="confirm-create-party">作成</button>
          <button class="btn btn-secondary" id="cancel-create-party">キャンセル</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('confirm-create-party').addEventListener('click', () => {
      const maxSize = parseInt(document.getElementById('party-size-select').value);
      this.createParty(maxSize);
      document.body.removeChild(dialog);
    });
    
    document.getElementById('cancel-create-party').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
  }
  
  createParty(maxSize) {
    this.socket.emit('create_party', { maxSize });
  }
  
  inviteToParty(friendId) {
    if (!this.currentParty) {
      this.showNotification('パーティーを作成してください', 'error');
      return;
    }
    
    this.socket.emit('invite_to_party', { friendId });
    this.showNotification('招待を送信しました');
  }
  
  showPartyInvite(data) {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <h3>パーティー招待</h3>
        <p>${data.inviterName}があなたをパーティーに招待しています</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="accept-invite">参加</button>
          <button class="btn btn-secondary" id="decline-invite">拒否</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('accept-invite').addEventListener('click', () => {
      this.socket.emit('join_party', { partyId: data.partyId });
      document.body.removeChild(dialog);
    });
    
    document.getElementById('decline-invite').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    // 30秒後に自動的に閉じる
    setTimeout(() => {
      if (document.body.contains(dialog)) {
        document.body.removeChild(dialog);
      }
    }, 30000);
  }
  
  leaveParty() {
    this.socket.emit('leave_party');
  }
  
  toggleReady() {
    this.socket.emit('toggle_ready');
  }
  
  kickMember(memberId) {
    this.socket.emit('kick_member', { memberId });
  }
  
  joinSoloQueue() {
    this.socket.emit('join_solo_queue');
  }
  
  leaveSoloQueue() {
    this.socket.emit('leave_solo_queue');
  }
  
  updateQueueStatus(inQueue) {
    const soloQueueBtn = document.getElementById('solo-queue-btn');
    if (!soloQueueBtn) return;
    
    if (inQueue) {
      soloQueueBtn.textContent = 'キャンセル';
      soloQueueBtn.classList.add('in-queue');
    } else {
      soloQueueBtn.textContent = 'ソロマッチ';
      soloQueueBtn.classList.remove('in-queue');
    }
  }
  
  showAddFriendDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <h3>フレンドを追加</h3>
        <div class="form-group">
          <label>ユーザー名:</label>
          <input type="text" id="friend-username-input" placeholder="ユーザー名を入力">
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="send-friend-request">送信</button>
          <button class="btn btn-secondary" id="cancel-friend-request">キャンセル</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('send-friend-request').addEventListener('click', () => {
      const username = document.getElementById('friend-username-input').value.trim();
      if (username) {
        this.sendFriendRequest(username);
        document.body.removeChild(dialog);
      }
    });
    
    document.getElementById('cancel-friend-request').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
  }
  
  sendFriendRequest(username) {
    this.socket.emit('send_friend_request', { username });
    this.showNotification('フレンドリクエストを送信しました');
  }
  
  showFriendRequest(data) {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <h3>フレンドリクエスト</h3>
        <p>${data.fromUsername}からフレンドリクエストが届いています</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="accept-friend-request">承認</button>
          <button class="btn btn-secondary" id="decline-friend-request">拒否</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('accept-friend-request').addEventListener('click', () => {
      this.socket.emit('accept_friend_request', { requestId: data.requestId });
      document.body.removeChild(dialog);
    });
    
    document.getElementById('decline-friend-request').addEventListener('click', () => {
      this.socket.emit('decline_friend_request', { requestId: data.requestId });
      document.body.removeChild(dialog);
    });
  }
  
  removeFriend(friendId) {
    if (confirm('本当にこのフレンドを削除しますか？')) {
      this.socket.emit('remove_friend', { friendId });
    }
  }
  
  showProfile() {
    // プロフィール画面への遷移
    window.location.href = '/profile.html';
  }
  
  startGame(sessionData) {
    // セッションデータをローカルストレージに保存
    localStorage.setItem('sessionData', JSON.stringify(sessionData));
    
    // アプリ画面に遷移
    window.location.href = '/simulation.html';
  }
  
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // アニメーション
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // 3秒後に削除
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// グローバルに公開
window.LobbyManager = LobbyManager;
