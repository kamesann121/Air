const API_BASE = window.location.origin;
let socket;
let sessionData;
let currentUser;

// Canvas設定
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ゲーム設定
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PUCK_RADIUS = 15;
const MALLET_RADIUS = 30;
const GOAL_WIDTH = 200;
const GOAL_HEIGHT = 20;
const MAX_SCORE = 7;
const FRICTION = 0.98;
const PUCK_MAX_SPEED = 15;

// ゲーム状態
let sessionState = {
  puck: {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    vx: 0,
    vy: 0
  },
  mallets: {},
  scores: {
    team1: 0,
    team2: 0
  },
  sessionOver: false,
  startTime: Date.now(),
  myMallet: null
};

// マウス/タッチ位置
let mouseX = 0;
let mouseY = 0;
let isTouching = false;

// 初期化
async function init() {
  // ゲームデータ取得
  const sessionDataStr = localStorage.getItem('sessionData');
  const userStr = localStorage.getItem('user');
  
  if (!sessionDataStr || !userStr) {
    window.location.href = '/lobby.html';
    return;
  }
  
  sessionData = JSON.parse(sessionDataStr);
  currentUser = JSON.parse(userStr);
  
  console.log('Game Data:', sessionData);
  console.log('Current User:', currentUser);
  
  // Canvas設定
  setupCanvas();
  
  // Socket.IO接続
  connectSocket();
  
  // プレイヤー情報表示
  displayPlayers();
  
  // イベントリスナー
  setupEventListeners();
  
  // ゲームループ開始
  sessionLoop();
  
  // モバイルの場合はタッチコントロール表示
  const device = detectDevice();
  if (device.isMobile) {
    document.getElementById('touch-controls').style.display = 'block';
  }
}

// Canvas設定
function setupCanvas() {
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  
  // 初期マレット位置設定
  const myTeam = getMyTeam();
  const myIndex = sessionData.teams[myTeam].indexOf(currentUser._id);
  
  if (myTeam === 'team1') {
    // Team 1は下側
    if (sessionData.mode === '1v1') {
      sessionState.myMallet = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 80 };
    } else {
      // 2v2の場合
      const xPos = myIndex === 0 ? CANVAS_WIDTH / 3 : (2 * CANVAS_WIDTH / 3);
      sessionState.myMallet = { x: xPos, y: CANVAS_HEIGHT - 80 };
    }
  } else {
    // Team 2は上側
    if (sessionData.mode === '1v1') {
      sessionState.myMallet = { x: CANVAS_WIDTH / 2, y: 80 };
    } else {
      const xPos = myIndex === 0 ? CANVAS_WIDTH / 3 : (2 * CANVAS_WIDTH / 3);
      sessionState.myMallet = { x: xPos, y: 80 };
    }
  }
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
  
  // 他プレイヤーのゲーム状態受信
  socket.on('game_state', (state) => {
    // パックの位置更新
    if (state.puck) {
      sessionState.puck = state.puck;
    }
    
    // 他プレイヤーのマレット位置更新
    if (state.mallets) {
      Object.keys(state.mallets).forEach(userId => {
        if (userId !== currentUser._id) {
          sessionState.mallets[userId] = state.mallets[userId];
        }
      });
    }
  });
  
  // スコア更新
  socket.on('score_update', (scores) => {
    sessionState.scores = scores;
    updateScoreUI();
    resetPuck();
  });
  
  // ゲーム終了
  socket.on('game_end', (result) => {
    sessionState.sessionOver = true;
    showGameOver(result);
  });
}

// イベントリスナー設定
function setupEventListeners() {
  // マウス操作
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    mouseY = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
  });
  
  // タッチ操作
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    mouseX = (touch.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    mouseY = (touch.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    isTouching = true;
  });
  
  canvas.addEventListener('touchend', () => {
    isTouching = false;
  });
  
  // ロビーに戻る
  document.getElementById('return-lobby').addEventListener('click', () => {
    localStorage.removeItem('sessionData');
    window.location.href = '/lobby.html';
  });
}

// プレイヤー情報表示
function displayPlayers() {
  const playersList = document.getElementById('players-list');
  const allPlayers = [...sessionData.teams.team1, ...sessionData.teams.team2];
  
  playersList.innerHTML = allPlayers.map(userId => {
    const team = sessionData.teams.team1.includes(userId) ? 'team1' : 'team2';
    const isSelf = userId === currentUser._id;
    return `
      <div class="player-item ${team}">
        ${isSelf ? 'You' : 'Player'} (Team ${team === 'team1' ? '1' : '2'})
      </div>
    `;
  }).join('');
}

// 自分のチーム取得
function getMyTeam() {
  if (sessionData.teams.team1.includes(currentUser._id)) {
    return 'team1';
  }
  return 'team2';
}

// ゲームループ
function sessionLoop() {
  if (sessionState.sessionOver) return;
  
  // 更新
  update();
  
  // 描画
  render();
  
  // 次のフレーム
  requestAnimationFrame(sessionLoop);
}

// 更新処理
function update() {
  // 自分のマレット更新
  if (sessionState.myMallet) {
    const targetX = Math.max(MALLET_RADIUS, Math.min(CANVAS_WIDTH - MALLET_RADIUS, mouseX));
    const targetY = Math.max(MALLET_RADIUS, Math.min(CANVAS_HEIGHT - MALLET_RADIUS, mouseY));
    
    // 滑らかに移動
    sessionState.myMallet.x += (targetX - sessionState.myMallet.x) * 0.2;
    sessionState.myMallet.y += (targetY - sessionState.myMallet.y) * 0.2;
    
    // サーバーに送信（スロットリング）
    if (!sessionLoop.lastSent || Date.now() - sessionLoop.lastSent > 50) {
      socket.emit('game_update', {
        gameId: sessionData.gameId,
        type: 'mallet_move',
        position: sessionState.myMallet
      });
      sessionLoop.lastSent = Date.now();
    }
  }
  
  // パック物理演算（簡易版）
  updatePuck();
  
  // タイマー更新
  const elapsed = Math.floor((Date.now() - sessionState.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// パック物理演算
function updatePuck() {
  // 速度に摩擦を適用
  sessionState.puck.vx *= FRICTION;
  sessionState.puck.vy *= FRICTION;
  
  // 位置更新
  sessionState.puck.x += sessionState.puck.vx;
  sessionState.puck.y += sessionState.puck.vy;
  
  // 壁との衝突
  if (sessionState.puck.x - PUCK_RADIUS < 0 || sessionState.puck.x + PUCK_RADIUS > CANVAS_WIDTH) {
    sessionState.puck.vx *= -0.8;
    sessionState.puck.x = Math.max(PUCK_RADIUS, Math.min(CANVAS_WIDTH - PUCK_RADIUS, sessionState.puck.x));
  }
  
  // ゴール判定（上下の壁）
  if (sessionState.puck.y - PUCK_RADIUS < 0) {
    // 上ゴール（Team 2のゴール） = Team 1のスコア
    const goalLeft = (CANVAS_WIDTH - GOAL_WIDTH) / 2;
    const goalRight = goalLeft + GOAL_WIDTH;
    
    if (sessionState.puck.x >= goalLeft && sessionState.puck.x <= goalRight) {
      scoreGoal('team1');
    } else {
      sessionState.puck.vy *= -0.8;
      sessionState.puck.y = PUCK_RADIUS;
    }
  }
  
  if (sessionState.puck.y + PUCK_RADIUS > CANVAS_HEIGHT) {
    // 下ゴール（Team 1のゴール） = Team 2のスコア
    const goalLeft = (CANVAS_WIDTH - GOAL_WIDTH) / 2;
    const goalRight = goalLeft + GOAL_WIDTH;
    
    if (sessionState.puck.x >= goalLeft && sessionState.puck.x <= goalRight) {
      scoreGoal('team2');
    } else {
      sessionState.puck.vy *= -0.8;
      sessionState.puck.y = CANVAS_HEIGHT - PUCK_RADIUS;
    }
  }
  
  // マレットとの衝突（自分のマレットのみ）
  if (sessionState.myMallet) {
    checkMalletCollision(sessionState.myMallet);
  }
  
  // 速度制限
  const speed = Math.sqrt(sessionState.puck.vx ** 2 + sessionState.puck.vy ** 2);
  if (speed > PUCK_MAX_SPEED) {
    const ratio = PUCK_MAX_SPEED / speed;
    sessionState.puck.vx *= ratio;
    sessionState.puck.vy *= ratio;
  }
}

// マレットとパックの衝突
function checkMalletCollision(mallet) {
  const dx = sessionState.puck.x - mallet.x;
  const dy = sessionState.puck.y - mallet.y;
  const distance = Math.sqrt(dx ** 2 + dy ** 2);
  
  if (distance < PUCK_RADIUS + MALLET_RADIUS) {
    // 衝突角度
    const angle = Math.atan2(dy, dx);
    
    // パックを押し出す
    const overlap = (PUCK_RADIUS + MALLET_RADIUS) - distance;
    sessionState.puck.x += Math.cos(angle) * overlap;
    sessionState.puck.y += Math.sin(angle) * overlap;
    
    // 反発力を与える
    const force = 1.5;
    sessionState.puck.vx += Math.cos(angle) * force;
    sessionState.puck.vy += Math.sin(angle) * force;
    
    // パック状態をサーバーに送信
    socket.emit('game_update', {
      gameId: sessionData.gameId,
      type: 'puck_update',
      puck: sessionState.puck
    });
  }
}

// 得点処理
function scoreGoal(team) {
  socket.emit('score', {
    gameId: sessionData.gameId,
    team: team
  });
}

// パックリセット
function resetPuck() {
  sessionState.puck = {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    vx: 0,
    vy: 0
  };
}

// 描画処理
function render() {
  // 背景
  ctx.fillStyle = '#1a2332';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
  // 中央線
  ctx.strokeStyle = '#2d3e50';
  ctx.lineWidth = 3;
  ctx.setLineDash([15, 10]);
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT / 2);
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // センターサークル
  ctx.strokeStyle = '#2d3e50';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 50, 0, Math.PI * 2);
  ctx.stroke();
  
  // ゴール（上）
  const goalLeft = (CANVAS_WIDTH - GOAL_WIDTH) / 2;
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(goalLeft, 0, GOAL_WIDTH, GOAL_HEIGHT);
  
  // ゴール（下）
  ctx.fillStyle = '#3498db';
  ctx.fillRect(goalLeft, CANVAS_HEIGHT - GOAL_HEIGHT, GOAL_WIDTH, GOAL_HEIGHT);
  
  // パック
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.arc(sessionState.puck.x, sessionState.puck.y, PUCK_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  
  // パックの輪郭
  ctx.strokeStyle = '#d68910';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // 自分のマレット
  if (sessionState.myMallet) {
    const myTeam = getMyTeam();
    ctx.fillStyle = myTeam === 'team1' ? '#3498db' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(sessionState.myMallet.x, sessionState.myMallet.y, MALLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // マレットの輪郭
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  
  // 他プレイヤーのマレット
  Object.keys(sessionState.mallets).forEach(userId => {
    if (userId !== currentUser._id) {
      const mallet = sessionState.mallets[userId];
      const team = sessionData.teams.team1.includes(userId) ? 'team1' : 'team2';
      ctx.fillStyle = team === 'team1' ? '#3498db' : '#e74c3c';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(mallet.x, mallet.y, MALLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }
  });
}

// スコアUI更新
function updateScoreUI() {
  document.getElementById('score-team1').textContent = sessionState.scores.team1;
  document.getElementById('score-team2').textContent = sessionState.scores.team2;
}

// ゲームオーバー表示
function showGameOver(result) {
  const overlay = document.getElementById('game-over');
  const winnerText = document.getElementById('winner-text');
  
  winnerText.textContent = result.winner === 'team1' ? 'Team 1 Wins!' : 'Team 2 Wins!';
  
  document.getElementById('final-score-team1').textContent = result.scores.team1;
  document.getElementById('final-score-team2').textContent = result.scores.team2;
  
  overlay.style.display = 'flex';
}

// ページロード時に初期化
document.addEventListener('DOMContentLoaded', init);
