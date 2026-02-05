// socket-client.js - Socket.IOクライアント接続管理

class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }
  
  connect() {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        reject(new Error('認証トークンがありません'));
        return;
      }
      
      // Socket.IO接続
      this.socket = io({
        auth: {
          token: token
        },
        reconnection: true,
        reconnectionDelay: this.reconnectDelay,
        reconnectionAttempts: this.maxReconnectAttempts
      });
      
      // 接続成功
      this.socket.on('connect', () => {
        console.log('Socket.IO接続成功');
        this.connected = true;
        this.reconnectAttempts = 0;
        resolve(this.socket);
      });
      
      // 接続エラー
      this.socket.on('connect_error', (error) => {
        console.error('Socket.IO接続エラー:', error);
        this.connected = false;
        
        if (error.message === 'Authentication error') {
          // 認証エラーの場合はログイン画面へ
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          window.location.href = '/login.html';
        }
        
        reject(error);
      });
      
      // 切断
      this.socket.on('disconnect', (reason) => {
        console.log('Socket.IO切断:', reason);
        this.connected = false;
        
        if (reason === 'io server disconnect') {
          // サーバー側から切断された場合は再接続しない
          this.showConnectionStatus('サーバーから切断されました', 'error');
        } else {
          // それ以外は自動再接続を試みる
          this.showConnectionStatus('接続が切断されました。再接続中...', 'warning');
        }
      });
      
      // 再接続試行
      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`再接続試行 ${attemptNumber}/${this.maxReconnectAttempts}`);
        this.reconnectAttempts = attemptNumber;
        this.showConnectionStatus(
          `再接続中... (${attemptNumber}/${this.maxReconnectAttempts})`,
          'warning'
        );
      });
      
      // 再接続成功
      this.socket.on('reconnect', (attemptNumber) => {
        console.log(`再接続成功 (試行回数: ${attemptNumber})`);
        this.showConnectionStatus('再接続しました', 'success');
        
        // 再接続後、必要な情報を再取得
        this.reloadAfterReconnect();
      });
      
      // 再接続失敗
      this.socket.on('reconnect_failed', () => {
        console.error('再接続失敗');
        this.showConnectionStatus(
          '再接続に失敗しました。ページを再読み込みしてください。',
          'error'
        );
      });
      
      // ping/pong（接続維持）
      this.socket.on('pong', (latency) => {
        this.updateLatency(latency);
      });
    });
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
  
  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      console.error('Socket未接続のため送信できません:', event);
    }
  }
  
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }
  
  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
  
  showConnectionStatus(message, type = 'info') {
    // 既存の接続ステータスを削除
    const existingStatus = document.getElementById('connection-status');
    if (existingStatus) {
      existingStatus.remove();
    }
    
    // 新しいステータスを表示
    const statusElement = document.createElement('div');
    statusElement.id = 'connection-status';
    statusElement.className = `connection-status connection-status-${type}`;
    statusElement.textContent = message;
    
    document.body.appendChild(statusElement);
    
    // 成功メッセージは3秒後に自動削除
    if (type === 'success') {
      setTimeout(() => {
        if (statusElement.parentNode) {
          statusElement.remove();
        }
      }, 3000);
    }
  }
  
  updateLatency(latency) {
    const latencyElement = document.getElementById('latency-display');
    if (latencyElement) {
      latencyElement.textContent = `${latency}ms`;
      
      // レイテンシに応じて色を変更
      if (latency < 50) {
        latencyElement.className = 'latency latency-good';
      } else if (latency < 100) {
        latencyElement.className = 'latency latency-ok';
      } else {
        latencyElement.className = 'latency latency-bad';
      }
    }
  }
  
  reloadAfterReconnect() {
    // 現在のページに応じて必要なデータを再取得
    const currentPage = window.location.pathname;
    
    if (currentPage.includes('lobby')) {
      // ロビー画面の場合
      this.emit('get_friends');
      
      // パーティーに参加していた場合は状態を確認
      const userId = localStorage.getItem('userId');
      if (userId) {
        this.emit('check_party_status');
      }
    }
  }
  
  getSocket() {
    return this.socket;
  }
  
  isConnected() {
    return this.connected;
  }
}

// グローバルに公開
window.SocketClient = SocketClient;
