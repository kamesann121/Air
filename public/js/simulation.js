const API_BASE = window.location.origin;
let socket;
let sessionData;
let currentUser;

// Three.js変数
let scene, camera, renderer;
let table, puck, ground;
let mallets = {};
let boundaries = {};

// セッション設定
const TABLE_WIDTH = 10;
const TABLE_DEPTH = 16;
const TABLE_HEIGHT = 0.3;
const PUCK_RADIUS = 0.3;
const PUCK_HEIGHT = 0.2;
const MALLET_RADIUS = 0.5;
const MALLET_HEIGHT = 0.15;
const GOAL_WIDTH = 3;
const MAX_SCORE = 7;

// 物理演算設定
const FRICTION = 0.98;
const PUCK_MAX_SPEED = 0.3;
const BOUNCE_DAMPING = 0.8;

// セッション状態
let sessionState = {
  puck: {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0
  },
  mallets: {},
  scores: {
    team1: 0,
    team2: 0
  },
  sessionOver: false,
  startTime: Date.now(),
  lastGoalTime: 0,
  puckRespawning: false
};

// 補間用データ（カクつき防止）
let interpolatedMallets = {};

// マウス/タッチ位置（ワールド座標）
let mouse = { x: 0, z: 0 };
let raycaster, mouseVector;

// 初期化
async function init() {
  // セッションデータ取得
  const sessionDataStr = localStorage.getItem('sessionData');
  const userStr = localStorage.getItem('user');
  
  if (!sessionDataStr || !userStr) {
    window.location.href = '/lobby.html';
    return;
  }
  
  sessionData = JSON.parse(sessionDataStr);
  currentUser = JSON.parse(userStr);
  
  console.log('Session Data:', sessionData);
  console.log('Current User:', currentUser);
  
  // Three.js初期化
  init3D();
  
  // Socket.IO接続
  connectSocket();
  
  // プレイヤー情報表示
  displayPlayers();
  
  // イベントリスナー
  setupEventListeners();
  
  // アニメーションループ開始
  animate();
}

// Three.js 3Dシーン初期化
function init3D() {
  const container = document.getElementById('game-canvas');
  
  // シーン
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f1e);
  scene.fog = new THREE.Fog(0x0f0f1e, 10, 50);
  
  // カメラ（上から見下ろす角度）
  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, 12, 8);
  camera.lookAt(0, 0, 0);
  
  // レンダラー
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  
  // ライト
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(5, 15, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.left = -15;
  directionalLight.shadow.camera.right = 15;
  directionalLight.shadow.camera.top = 15;
  directionalLight.shadow.camera.bottom = -15;
  scene.add(directionalLight);
  
  // 地面
  const groundGeometry = new THREE.PlaneGeometry(40, 40);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.8,
    metalness: 0.2
  });
  ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // エアホッケー台
  createTable();
  
  // パック
  createPuck();
  
  // マレット（自分の分）
  createMyMallet();
  
  // Raycaster（マウス位置計算用）
  raycaster = new THREE.Raycaster();
  mouseVector = new THREE.Vector2();
  
  // リサイズ対応
  window.addEventListener('resize', onWindowResize);
}

// エアホッケー台を作成
function createTable() {
  // テーブル本体
  const tableGeometry = new THREE.BoxGeometry(TABLE_WIDTH, TABLE_HEIGHT, TABLE_DEPTH);
  const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c3e50,
    roughness: 0.3,
    metalness: 0.7
  });
  table = new THREE.Mesh(tableGeometry, tableMaterial);
  table.position.y = TABLE_HEIGHT / 2;
  table.receiveShadow = true;
  table.castShadow = true;
  scene.add(table);
  
  // プレイエリア（明るい色）
  const playAreaGeometry = new THREE.PlaneGeometry(TABLE_WIDTH - 0.4, TABLE_DEPTH - 0.4);
  const playAreaMaterial = new THREE.MeshStandardMaterial({
    color: 0x34495e,
    roughness: 0.2,
    metalness: 0.5
  });
  const playArea = new THREE.Mesh(playAreaGeometry, playAreaMaterial);
  playArea.rotation.x = -Math.PI / 2;
  playArea.position.y = TABLE_HEIGHT + 0.01;
  playArea.receiveShadow = true;
  scene.add(playArea);
  
  // 中央線
  const centerLineGeometry = new THREE.PlaneGeometry(TABLE_WIDTH - 0.4, 0.05);
  const centerLineMaterial = new THREE.MeshBasicMaterial({ color: 0xecf0f1 });
  const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
  centerLine.rotation.x = -Math.PI / 2;
  centerLine.position.y = TABLE_HEIGHT + 0.02;
  scene.add(centerLine);
  
  // 壁（4方向）
  const wallHeight = 0.5;
  const wallThickness = 0.2;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x7f8c8d,
    roughness: 0.6
  });
  
  // 左壁
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, TABLE_DEPTH),
    wallMaterial
  );
  leftWall.position.set(-TABLE_WIDTH / 2 - wallThickness / 2, TABLE_HEIGHT + wallHeight / 2, 0);
  leftWall.castShadow = true;
  scene.add(leftWall);
  boundaries.left = -TABLE_WIDTH / 2 + PUCK_RADIUS;
  
  // 右壁
  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, TABLE_DEPTH),
    wallMaterial
  );
  rightWall.position.set(TABLE_WIDTH / 2 + wallThickness / 2, TABLE_HEIGHT + wallHeight / 2, 0);
  rightWall.castShadow = true;
  scene.add(rightWall);
  boundaries.right = TABLE_WIDTH / 2 - PUCK_RADIUS;
  
  // 上壁（Team 2ゴール側）
  createWallWithGoal(TABLE_DEPTH / 2, 0xe74c3c, 'team2');
  boundaries.top = TABLE_DEPTH / 2 - PUCK_RADIUS;
  
  // 下壁（Team 1ゴール側）
  createWallWithGoal(-TABLE_DEPTH / 2, 0x3498db, 'team1');
  boundaries.bottom = -TABLE_DEPTH / 2 + PUCK_RADIUS;
  
  // マレット移動制限用の境界
  const myTeam = getMyTeam();
  if (myTeam === 'team1') {
    boundaries.malletMin = -TABLE_DEPTH / 2 + MALLET_RADIUS;
    boundaries.malletMax = -0.2; // 中央線まで
  } else {
    boundaries.malletMin = 0.2; // 中央線から
    boundaries.malletMax = TABLE_DEPTH / 2 - MALLET_RADIUS;
  }
}

// ゴール付きの壁を作成
function createWallWithGoal(zPosition, color, team) {
  const wallHeight = 0.5;
  const wallThickness = 0.2;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.6
  });
  
  const sideWidth = (TABLE_WIDTH - GOAL_WIDTH) / 2;
  
  // 左側の壁
  const leftSide = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness),
    wallMaterial
  );
  leftSide.position.set(-TABLE_WIDTH / 2 + sideWidth / 2, TABLE_HEIGHT + wallHeight / 2, zPosition);
  leftSide.castShadow = true;
  scene.add(leftSide);
  
  // 右側の壁
  const rightSide = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness),
    wallMaterial
  );
  rightSide.position.set(TABLE_WIDTH / 2 - sideWidth / 2, TABLE_HEIGHT + wallHeight / 2, zPosition);
  rightSide.castShadow = true;
  scene.add(rightSide);
  
  // ゴールエリアの床（色付き）
  const goalFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL_WIDTH, 1),
    new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.3 })
  );
  goalFloor.rotation.x = -Math.PI / 2;
  goalFloor.position.set(0, TABLE_HEIGHT + 0.005, zPosition);
  scene.add(goalFloor);
}

// パックを作成
function createPuck() {
  const puckGeometry = new THREE.CylinderGeometry(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 32);
  const puckMaterial = new THREE.MeshStandardMaterial({
    color: 0xf39c12,
    roughness: 0.3,
    metalness: 0.7
  });
  puck = new THREE.Mesh(puckGeometry, puckMaterial);
  puck.position.set(0, TABLE_HEIGHT + PUCK_HEIGHT / 2, 0);
  puck.castShadow = true;
  scene.add(puck);
}

// 自分のマレットを作成
function createMyMallet() {
  const myTeam = getMyTeam();
  const malletGeometry = new THREE.CylinderGeometry(MALLET_RADIUS, MALLET_RADIUS, MALLET_HEIGHT, 32);
  const malletMaterial = new THREE.MeshStandardMaterial({
    color: myTeam === 'team1' ? 0x3498db : 0xe74c3c,
    roughness: 0.4,
    metalness: 0.6
  });
  
  const myMallet = new THREE.Mesh(malletGeometry, malletMaterial);
  const initialZ = myTeam === 'team1' ? -TABLE_DEPTH / 2 + 2 : TABLE_DEPTH / 2 - 2;
  myMallet.position.set(0, TABLE_HEIGHT + MALLET_HEIGHT / 2, initialZ);
  myMallet.castShadow = true;
  scene.add(myMallet);
  
  mallets[currentUser._id] = myMallet;
  sessionState.mallets[currentUser._id] = { x: 0, z: initialZ };
  interpolatedMallets[currentUser._id] = { x: 0, z: initialZ, targetX: 0, targetZ: initialZ };
}

// 他プレイヤーのマレットを作成
function createOpponentMallet(userId, team) {
  if (mallets[userId]) return;
  
  const malletGeometry = new THREE.CylinderGeometry(MALLET_RADIUS, MALLET_RADIUS, MALLET_HEIGHT, 32);
  const malletMaterial = new THREE.MeshStandardMaterial({
    color: team === 'team1' ? 0x3498db : 0xe74c3c,
    roughness: 0.4,
    metalness: 0.6,
    transparent: true,
    opacity: 0.8
  });
  
  const mallet = new THREE.Mesh(malletGeometry, malletMaterial);
  const initialZ = team === 'team1' ? -TABLE_DEPTH / 2 + 2 : TABLE_DEPTH / 2 - 2;
  mallet.position.set(0, TABLE_HEIGHT + MALLET_HEIGHT / 2, initialZ);
  mallet.castShadow = true;
  scene.add(mallet);
  
  mallets[userId] = mallet;
  interpolatedMallets[userId] = { x: 0, z: initialZ, targetX: 0, targetZ: initialZ };
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
  
  // 他プレイヤーのセッション状態受信
  socket.on('session_state', (state) => {
    // パックの位置更新
    if (state.puck) {
      sessionState.puck = state.puck;
    }
    
    // 他プレイヤーのマレット位置更新（補間用ターゲット設定）
    if (state.mallets) {
      Object.keys(state.mallets).forEach(userId => {
        if (userId !== currentUser._id) {
          const team = getTeamByUserId(userId);
          if (!mallets[userId]) {
            createOpponentMallet(userId, team);
          }
          
          // 補間用のターゲット位置を設定
          if (!interpolatedMallets[userId]) {
            interpolatedMallets[userId] = {
              x: state.mallets[userId].x,
              z: state.mallets[userId].z,
              targetX: state.mallets[userId].x,
              targetZ: state.mallets[userId].z
            };
          } else {
            interpolatedMallets[userId].targetX = state.mallets[userId].x;
            interpolatedMallets[userId].targetZ = state.mallets[userId].z;
          }
        }
      });
    }
  });
  
  // スコア更新
  socket.on('score_update', (scores) => {
    sessionState.scores = scores;
    updateScoreUI();
  });
  
  // セッション終了
  socket.on('session_end', (result) => {
    sessionState.sessionOver = true;
    showSessionOver(result);
  });
}

// イベントリスナー設定
function setupEventListeners() {
  // マウス移動
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  
  // タッチ操作
  renderer.domElement.addEventListener('touchmove', onTouchMove);
  renderer.domElement.addEventListener('touchend', onTouchEnd);
  
  // ロビーに戻る
  document.getElementById('return-lobby').addEventListener('click', () => {
    localStorage.removeItem('sessionData');
    window.location.href = '/lobby.html';
  });
}

// マウス移動
function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVector.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVector.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  updateMousePosition();
}

// タッチ移動
function onTouchMove(event) {
  event.preventDefault();
  const touch = event.touches[0];
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVector.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVector.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
  
  updateMousePosition();
}

function onTouchEnd() {
  // タッチ終了処理（必要に応じて）
}

// マウス位置をワールド座標に変換
function updateMousePosition() {
  raycaster.setFromCamera(mouseVector, camera);
  
  // テーブル面との交差判定
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_HEIGHT);
  const intersectPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersectPoint);
  
  if (intersectPoint) {
    mouse.x = intersectPoint.x;
    mouse.z = intersectPoint.z;
  }
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
        ${isSelf ? 'あなた' : 'プレイヤー'} (Team ${team === 'team1' ? '1' : '2'})
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

// UserIDからチーム取得
function getTeamByUserId(userId) {
  if (sessionData.teams.team1.includes(userId)) {
    return 'team1';
  }
  return 'team2';
}

// アニメーションループ
function animate() {
  if (sessionState.sessionOver) return;
  
  requestAnimationFrame(animate);
  
  // 更新
  update();
  
  // レンダリング
  renderer.render(scene, camera);
}

// 更新処理
function update() {
  // 自分のマレット更新（マウス位置に追従、範囲制限付き）
  if (mallets[currentUser._id]) {
    let targetX = Math.max(boundaries.left + MALLET_RADIUS, Math.min(boundaries.right - MALLET_RADIUS, mouse.x));
    let targetZ = Math.max(boundaries.malletMin, Math.min(boundaries.malletMax, mouse.z));
    
    const mallet = mallets[currentUser._id];
    mallet.position.x += (targetX - mallet.position.x) * 0.2;
    mallet.position.z += (targetZ - mallet.position.z) * 0.2;
    
    sessionState.mallets[currentUser._id] = { x: mallet.position.x, z: mallet.position.z };
    
    // サーバーに送信（スロットリング）
    if (!update.lastSent || Date.now() - update.lastSent > 50) {
      socket.emit('session_update', {
        sessionId: sessionData.sessionId,
        type: 'mallet_move',
        position: { x: mallet.position.x, z: mallet.position.z }
      });
      update.lastSent = Date.now();
    }
  }
  
  // 他プレイヤーのマレット補間（カクつき防止）
  Object.keys(interpolatedMallets).forEach(userId => {
    if (userId !== currentUser._id && mallets[userId]) {
      const interpData = interpolatedMallets[userId];
      
      // 滑らかに補間
      interpData.x += (interpData.targetX - interpData.x) * 0.15;
      interpData.z += (interpData.targetZ - interpData.z) * 0.15;
      
      mallets[userId].position.x = interpData.x;
      mallets[userId].position.z = interpData.z;
    }
  });
  
  // パック物理演算
  if (!sessionState.puckRespawning) {
    updatePuck();
  }
  
  // パック位置を3Dオブジェクトに反映
  puck.position.x = sessionState.puck.x;
  puck.position.z = sessionState.puck.z;
  
  // タイマー更新
  const elapsed = Math.floor((Date.now() - sessionState.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// パック物理演算
function updatePuck() {
  // 摩擦
  sessionState.puck.vx *= FRICTION;
  sessionState.puck.vz *= FRICTION;
  
  // 位置更新
  sessionState.puck.x += sessionState.puck.vx;
  sessionState.puck.z += sessionState.puck.vz;
  
  // 左右の壁との衝突
  if (sessionState.puck.x - PUCK_RADIUS < boundaries.left) {
    sessionState.puck.x = boundaries.left;
    sessionState.puck.vx *= -BOUNCE_DAMPING;
  }
  if (sessionState.puck.x + PUCK_RADIUS > boundaries.right) {
    sessionState.puck.x = boundaries.right;
    sessionState.puck.vx *= -BOUNCE_DAMPING;
  }
  
  // 上下のゴール判定
  const goalLeft = -GOAL_WIDTH / 2;
  const goalRight = GOAL_WIDTH / 2;
  
  // Team 2のゴール（上側）
  if (sessionState.puck.z + PUCK_RADIUS > boundaries.top) {
    if (sessionState.puck.x >= goalLeft && sessionState.puck.x <= goalRight) {
      // ゴール！
      if (Date.now() - sessionState.lastGoalTime > 2000) {
        scoreGoal('team1');
      }
    } else {
      sessionState.puck.z = boundaries.top;
      sessionState.puck.vz *= -BOUNCE_DAMPING;
    }
  }
  
  // Team 1のゴール（下側）
  if (sessionState.puck.z - PUCK_RADIUS < boundaries.bottom) {
    if (sessionState.puck.x >= goalLeft && sessionState.puck.x <= goalRight) {
      // ゴール！
      if (Date.now() - sessionState.lastGoalTime > 2000) {
        scoreGoal('team2');
      }
    } else {
      sessionState.puck.z = boundaries.bottom;
      sessionState.puck.vz *= -BOUNCE_DAMPING;
    }
  }
  
  // マレットとの衝突（全プレイヤー）
  Object.keys(mallets).forEach(userId => {
    checkMalletCollision(mallets[userId]);
  });
  
  // 速度制限
  const speed = Math.sqrt(sessionState.puck.vx ** 2 + sessionState.puck.vz ** 2);
  if (speed > PUCK_MAX_SPEED) {
    const ratio = PUCK_MAX_SPEED / speed;
    sessionState.puck.vx *= ratio;
    sessionState.puck.vz *= ratio;
  }
}

// マレットとパックの衝突
function checkMalletCollision(mallet) {
  const dx = sessionState.puck.x - mallet.position.x;
  const dz = sessionState.puck.z - mallet.position.z;
  const distance = Math.sqrt(dx ** 2 + dz ** 2);
  
  if (distance < PUCK_RADIUS + MALLET_RADIUS) {
    // 衝突角度
    const angle = Math.atan2(dz, dx);
    
    // パックを押し出す
    const overlap = (PUCK_RADIUS + MALLET_RADIUS) - distance;
    sessionState.puck.x += Math.cos(angle) * overlap;
    sessionState.puck.z += Math.sin(angle) * overlap;
    
    // 反発力
    const force = 0.03;
    sessionState.puck.vx += Math.cos(angle) * force;
    sessionState.puck.vz += Math.sin(angle) * force;
    
    // パック状態をサーバーに送信
    socket.emit('session_update', {
      sessionId: sessionData.sessionId,
      type: 'puck_update',
      puck: sessionState.puck
    });
  }
}

// 得点処理
function scoreGoal(team) {
  sessionState.lastGoalTime = Date.now();
  
  // ゴール演出表示
  showGoalNotification(team);
  
  // サーバーに得点通知
  socket.emit('score', {
    sessionId: sessionData.sessionId,
    team: team
  });
  
  // パックを右側から入荷（ゲーセン風）
  respawnPuck();
}

// ゴール演出
function showGoalNotification(team) {
  const notification = document.getElementById('goal-notification');
  const playerName = document.getElementById('goal-player');
  
  // 得点したチームのプレイヤー名取得（簡易版）
  const scorer = team === 'team1' ? 'Team 1' : 'Team 2';
  playerName.textContent = scorer;
  
  // 演出表示
  notification.classList.add('show');
  
  // 2秒後に非表示
  setTimeout(() => {
    notification.classList.remove('show');
  }, 2000);
}

// パックを右側から入荷
function respawnPuck() {
  sessionState.puckRespawning = true;
  
  // 右側からスタート
  sessionState.puck.x = TABLE_WIDTH / 2 - PUCK_RADIUS;
  sessionState.puck.z = 0;
  sessionState.puck.vx = -0.1; // 左方向に転がる
  sessionState.puck.vz = 0;
  
  // 1秒後に通常に戻す
  setTimeout(() => {
    sessionState.puckRespawning = false;
  }, 1000);
}

// スコアUI更新
function updateScoreUI() {
  document.getElementById('score-team1').textContent = sessionState.scores.team1;
  document.getElementById('score-team2').textContent = sessionState.scores.team2;
}

// セッション終了表示
function showSessionOver(result) {
  const overlay = document.getElementById('game-over');
  const winnerText = document.getElementById('winner-text');
  
  winnerText.textContent = result.winner === 'team1' ? 'Team 1 が勝利！' : 'Team 2 が勝利！';
  
  document.getElementById('final-score-team1').textContent = result.scores.team1;
  document.getElementById('final-score-team2').textContent = result.scores.team2;
  
  overlay.style.display = 'flex';
}

// ウィンドウリサイズ対応
function onWindowResize() {
  const container = document.getElementById('game-canvas');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// ページロード時に初期化
document.addEventListener('DOMContentLoaded', init);
