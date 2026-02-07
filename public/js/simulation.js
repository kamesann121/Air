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
const FRICTION = 0.985;
const PUCK_MAX_SPEED = 0.25;
const BOUNCE_DAMPING = 0.75;

// セッション状態
let sessionState = {
  puck: { x: 0, z: 0, vx: 0, vz: 0 },
  mallets: {},
  scores: { team1: 0, team2: 0 },
  sessionOver: false,
  startTime: Date.now(),
  lastGoalTime: 0,
  puckRespawning: false,
  serverPuck: { x: 0, z: 0, vx: 0, vz: 0 }
};

// 補間用データ
let interpolatedMallets = {};
let interpolatedPuck = { x: 0, z: 0, targetX: 0, targetZ: 0 };

// マウス/タッチ位置
let mouse = { x: 0, z: 0 };
let raycaster, mouseVector;

// 離脱検知
let lastOpponentActivity = Date.now();
let activityCheckInterval;

// 初期化
async function init() {
  const sessionDataStr = localStorage.getItem('sessionData');
  const userStr = localStorage.getItem('user');
  
  if (!sessionDataStr || !userStr) {
    window.location.href = '/lobby.html';
    return;
  }
  
  sessionData = JSON.parse(sessionDataStr);
  currentUser = JSON.parse(userStr);
  
  // サーバーから現在のセッション状態を取得（リロード対応）
  await loadSessionState();
  
  init3D();
  connectSocket();
  displayPlayers();
  setupEventListeners();
  startActivityCheck();
  animate();
}

// サーバーからセッション状態を読み込み（リロード時の同期）
async function loadSessionState() {
  try {
    const response = await fetch(`${API_BASE}/api/session/${sessionData.sessionId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (response.ok) {
      const state = await response.json();
      if (state.puck) {
        sessionState.puck = state.puck;
      }
      if (state.scores) {
        sessionState.scores = state.scores;
      }
      if (state.startTime) {
        sessionState.startTime = state.startTime;
      }
      console.log('Session state loaded from server:', state);
    }
  } catch (err) {
    console.log('Loading initial state from local storage');
  }
}

// Three.js初期化（真上から、画面全体に、自分の陣地を手前に）
function init3D() {
  const container = document.getElementById('game-canvas');
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f1e);
  
  // 真上からのOrthographicカメラ（画面全体に台が収まる）
  const aspect = container.clientWidth / container.clientHeight;
  const viewSize = 9;
  camera = new THREE.OrthographicCamera(
    -viewSize * aspect, viewSize * aspect,
    viewSize, -viewSize,
    0.1, 100
  );
  camera.position.set(0, 20, 0);
  camera.lookAt(0, 0, 0);
  
  // 自分の陣地を手前にするためカメラを回転
  const myTeam = getMyTeam();
  if (myTeam === 'team2') {
    camera.rotation.z = Math.PI; // 180度回転
  }
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
  directionalLight.position.set(0, 20, 0);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  
  const groundGeometry = new THREE.PlaneGeometry(40, 40);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
  ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);
  
  createTable();
  createPuck();
  createMyMallet();
  
  raycaster = new THREE.Raycaster();
  mouseVector = new THREE.Vector2();
  
  window.addEventListener('resize', onWindowResize);
}

function createTable() {
  const tableGeometry = new THREE.BoxGeometry(TABLE_WIDTH, TABLE_HEIGHT, TABLE_DEPTH);
  const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
  table = new THREE.Mesh(tableGeometry, tableMaterial);
  table.position.y = TABLE_HEIGHT / 2;
  table.receiveShadow = true;
  table.castShadow = true;
  scene.add(table);
  
  const playAreaGeometry = new THREE.PlaneGeometry(TABLE_WIDTH - 0.4, TABLE_DEPTH - 0.4);
  const playAreaMaterial = new THREE.MeshStandardMaterial({ color: 0x34495e });
  const playArea = new THREE.Mesh(playAreaGeometry, playAreaMaterial);
  playArea.rotation.x = -Math.PI / 2;
  playArea.position.y = TABLE_HEIGHT + 0.01;
  playArea.receiveShadow = true;
  scene.add(playArea);
  
  const centerLineGeometry = new THREE.PlaneGeometry(TABLE_WIDTH - 0.4, 0.05);
  const centerLineMaterial = new THREE.MeshBasicMaterial({ color: 0xecf0f1 });
  const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
  centerLine.rotation.x = -Math.PI / 2;
  centerLine.position.y = TABLE_HEIGHT + 0.02;
  scene.add(centerLine);
  
  const wallHeight = 0.5;
  const wallThickness = 0.2;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x7f8c8d });
  
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, TABLE_DEPTH), wallMaterial);
  leftWall.position.set(-TABLE_WIDTH / 2 - wallThickness / 2, TABLE_HEIGHT + wallHeight / 2, 0);
  leftWall.castShadow = true;
  scene.add(leftWall);
  boundaries.left = -TABLE_WIDTH / 2 + PUCK_RADIUS;
  
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, TABLE_DEPTH), wallMaterial);
  rightWall.position.set(TABLE_WIDTH / 2 + wallThickness / 2, TABLE_HEIGHT + wallHeight / 2, 0);
  rightWall.castShadow = true;
  scene.add(rightWall);
  boundaries.right = TABLE_WIDTH / 2 - PUCK_RADIUS;
  
  createWallWithGoal(TABLE_DEPTH / 2, 0xe74c3c);
  boundaries.top = TABLE_DEPTH / 2 - PUCK_RADIUS;
  
  createWallWithGoal(-TABLE_DEPTH / 2, 0x3498db);
  boundaries.bottom = -TABLE_DEPTH / 2 + PUCK_RADIUS;
  
  const myTeam = getMyTeam();
  if (myTeam === 'team1') {
    boundaries.malletMin = -TABLE_DEPTH / 2 + MALLET_RADIUS;
    boundaries.malletMax = -0.2;
  } else {
    boundaries.malletMin = 0.2;
    boundaries.malletMax = TABLE_DEPTH / 2 - MALLET_RADIUS;
  }
}

function createWallWithGoal(zPosition, color) {
  const wallHeight = 0.5;
  const wallThickness = 0.2;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: color });
  const sideWidth = (TABLE_WIDTH - GOAL_WIDTH) / 2;
  
  const leftSide = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness), wallMaterial);
  leftSide.position.set(-TABLE_WIDTH / 2 + sideWidth / 2, TABLE_HEIGHT + wallHeight / 2, zPosition);
  leftSide.castShadow = true;
  scene.add(leftSide);
  
  const rightSide = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness), wallMaterial);
  rightSide.position.set(TABLE_WIDTH / 2 - sideWidth / 2, TABLE_HEIGHT + wallHeight / 2, zPosition);
  rightSide.castShadow = true;
  scene.add(rightSide);
  
  const goalFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL_WIDTH, 1),
    new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.3 })
  );
  goalFloor.rotation.x = -Math.PI / 2;
  goalFloor.position.set(0, TABLE_HEIGHT + 0.005, zPosition);
  scene.add(goalFloor);
}

function createPuck() {
  const puckGeometry = new THREE.CylinderGeometry(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 32);
  const puckMaterial = new THREE.MeshStandardMaterial({ color: 0xf39c12, roughness: 0.3, metalness: 0.7 });
  puck = new THREE.Mesh(puckGeometry, puckMaterial);
  puck.position.set(sessionState.puck.x, TABLE_HEIGHT + PUCK_HEIGHT / 2, sessionState.puck.z);
  puck.castShadow = true;
  scene.add(puck);
  
  interpolatedPuck.x = sessionState.puck.x;
  interpolatedPuck.z = sessionState.puck.z;
  interpolatedPuck.targetX = sessionState.puck.x;
  interpolatedPuck.targetZ = sessionState.puck.z;
}

function createMyMallet() {
  const myTeam = getMyTeam();
  const malletGeometry = new THREE.CylinderGeometry(MALLET_RADIUS, MALLET_RADIUS, MALLET_HEIGHT, 32);
  const malletMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, // 白色（ゲーセン風）
    roughness: 0.3, 
    metalness: 0.8 
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

function createOpponentMallet(userId, team) {
  if (mallets[userId]) return;
  
  const malletGeometry = new THREE.CylinderGeometry(MALLET_RADIUS, MALLET_RADIUS, MALLET_HEIGHT, 32);
  const malletMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, // 白色（ゲーセン風）
    roughness: 0.3, 
    metalness: 0.8, 
    transparent: true, 
    opacity: 0.9 
  });
  
  const mallet = new THREE.Mesh(malletGeometry, malletMaterial);
  const initialZ = team === 'team1' ? -TABLE_DEPTH / 2 + 2 : TABLE_DEPTH / 2 - 2;
  mallet.position.set(0, TABLE_HEIGHT + MALLET_HEIGHT / 2, initialZ);
  mallet.castShadow = true;
  scene.add(mallet);
  
  mallets[userId] = mallet;
  interpolatedMallets[userId] = { x: 0, z: initialZ, targetX: 0, targetZ: initialZ };
}

function connectSocket() {
  socket = io(API_BASE, { auth: { token: localStorage.getItem('token') } });
  
  socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('authenticate', currentUser._id);
    socket.emit('join_session', { sessionId: sessionData.sessionId });
  });
  
  socket.on('session_state', (state) => {
    lastOpponentActivity = Date.now();
    
    // パックの位置更新（補間用ターゲット設定でカクつき防止）
    if (state.puck) {
      sessionState.serverPuck = state.puck;
      interpolatedPuck.targetX = state.puck.x;
      interpolatedPuck.targetZ = state.puck.z;
    }
    
    // 他プレイヤーのマレット位置更新
    if (state.mallets) {
      Object.keys(state.mallets).forEach(userId => {
        if (userId !== currentUser._id) {
          const team = getTeamByUserId(userId);
          if (!mallets[userId]) createOpponentMallet(userId, team);
          
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
  
  socket.on('score_update', (scores) => {
    sessionState.scores = scores;
    updateScoreUI();
  });
  
  socket.on('session_end', (result) => {
    sessionState.sessionOver = true;
    showSessionOver(result);
  });
  
  socket.on('opponent_left', () => {
    alert('相手が離脱しました。あなたの勝ちです！');
    sessionState.sessionOver = true;
    setTimeout(() => {
      window.location.href = '/lobby.html';
    }, 2000);
  });
}

// 15秒離席チェック
function startActivityCheck() {
  activityCheckInterval = setInterval(() => {
    if (Date.now() - lastOpponentActivity > 15000) {
      socket.emit('claim_victory', { sessionId: sessionData.sessionId });
      sessionState.sessionOver = true;
      alert('相手が15秒間応答していません。あなたの勝ちです！');
      clearInterval(activityCheckInterval);
      setTimeout(() => {
        window.location.href = '/lobby.html';
      }, 2000);
    }
  }, 5000);
}

function setupEventListeners() {
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('touchmove', onTouchMove);
  renderer.domElement.addEventListener('touchend', onTouchEnd);
  
  document.getElementById('return-lobby').addEventListener('click', () => {
    localStorage.removeItem('sessionData');
    window.location.href = '/lobby.html';
  });
  
  // 降参ボタン
  const surrenderBtn = document.getElementById('surrender-btn');
  if (surrenderBtn) {
    surrenderBtn.addEventListener('click', () => {
      if (confirm('降参しますか？')) {
        socket.emit('surrender', { sessionId: sessionData.sessionId });
        alert('降参しました');
        window.location.href = '/lobby.html';
      }
    });
  }
}

function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVector.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVector.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  updateMousePosition();
}

function onTouchMove(event) {
  event.preventDefault();
  const touch = event.touches[0];
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVector.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVector.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
  updateMousePosition();
}

function onTouchEnd() {}

function updateMousePosition() {
  raycaster.setFromCamera(mouseVector, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_HEIGHT);
  const intersectPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersectPoint);
  
  if (intersectPoint) {
    mouse.x = intersectPoint.x;
    mouse.z = intersectPoint.z;
  }
}

function displayPlayers() {
  const playersList = document.getElementById('players-list');
  const allPlayers = [...sessionData.teams.team1, ...sessionData.teams.team2];
  
  playersList.innerHTML = allPlayers.map(userId => {
    const team = sessionData.teams.team1.includes(userId) ? 'team1' : 'team2';
    const isSelf = userId === currentUser._id;
    return `<div class="player-item ${team}">${isSelf ? 'あなた' : 'プレイヤー'} (Team ${team === 'team1' ? '1' : '2'})</div>`;
  }).join('');
}

function getMyTeam() {
  return sessionData.teams.team1.includes(currentUser._id) ? 'team1' : 'team2';
}

function getTeamByUserId(userId) {
  return sessionData.teams.team1.includes(userId) ? 'team1' : 'team2';
}

function animate() {
  if (sessionState.sessionOver) return;
  requestAnimationFrame(animate);
  update();
  renderer.render(scene, camera);
}

function update() {
  // 自分のマレット更新
  if (mallets[currentUser._id]) {
    let targetX = Math.max(boundaries.left + MALLET_RADIUS, Math.min(boundaries.right - MALLET_RADIUS, mouse.x));
    let targetZ = Math.max(boundaries.malletMin, Math.min(boundaries.malletMax, mouse.z));
    
    const mallet = mallets[currentUser._id];
    mallet.position.x += (targetX - mallet.position.x) * 0.2;
    mallet.position.z += (targetZ - mallet.position.z) * 0.2;
    
    sessionState.mallets[currentUser._id] = { x: mallet.position.x, z: mallet.position.z };
    
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
      interpData.x += (interpData.targetX - interpData.x) * 0.2;
      interpData.z += (interpData.targetZ - interpData.z) * 0.2;
      mallets[userId].position.x = interpData.x;
      mallets[userId].position.z = interpData.z;
    }
  });
  
  // パック補間（カクつき完全防止）
  interpolatedPuck.x += (interpolatedPuck.targetX - interpolatedPuck.x) * 0.25;
  interpolatedPuck.z += (interpolatedPuck.targetZ - interpolatedPuck.z) * 0.25;
  
  puck.position.x = interpolatedPuck.x;
  puck.position.z = interpolatedPuck.z;
  
  if (!sessionState.puckRespawning) {
    updatePuck();
  }
  
  // タイマー更新（サーバーのstartTimeから計算）
  const elapsed = Math.floor((Date.now() - sessionState.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updatePuck() {
  sessionState.puck.vx *= FRICTION;
  sessionState.puck.vz *= FRICTION;
  
  sessionState.puck.x += sessionState.puck.vx;
  sessionState.puck.z += sessionState.puck.vz;
  
  if (sessionState.puck.x < boundaries.left) {
    sessionState.puck.x = boundaries.left;
    sessionState.puck.vx *= -BOUNCE_DAMPING;
  }
  if (sessionState.puck.x > boundaries.right) {
    sessionState.puck.x = boundaries.right;
    sessionState.puck.vx *= -BOUNCE_DAMPING;
  }
  
  const goalLeft = -GOAL_WIDTH / 2;
  const goalRight = GOAL_WIDTH / 2;
  
  if (sessionState.puck.z > boundaries.top) {
    if (sessionState.puck.x >= goalLeft && sessionState.puck.x <= goalRight) {
      if (Date.now() - sessionState.lastGoalTime > 2000) scoreGoal('team1');
    } else {
      sessionState.puck.z = boundaries.top;
      sessionState.puck.vz *= -BOUNCE_DAMPING;
    }
  }
  
  if (sessionState.puck.z < boundaries.bottom) {
    if (sessionState.puck.x >= goalLeft && sessionState.puck.x <= goalRight) {
      if (Date.now() - sessionState.lastGoalTime > 2000) scoreGoal('team2');
    } else {
      sessionState.puck.z = boundaries.bottom;
      sessionState.puck.vz *= -BOUNCE_DAMPING;
    }
  }
  
  Object.keys(mallets).forEach(userId => {
    checkMalletCollision(mallets[userId]);
  });
  
  const speed = Math.sqrt(sessionState.puck.vx ** 2 + sessionState.puck.vz ** 2);
  if (speed > PUCK_MAX_SPEED) {
    const ratio = PUCK_MAX_SPEED / speed;
    sessionState.puck.vx *= ratio;
    sessionState.puck.vz *= ratio;
  }
}

function checkMalletCollision(mallet) {
  const dx = sessionState.puck.x - mallet.position.x;
  const dz = sessionState.puck.z - mallet.position.z;
  const distance = Math.sqrt(dx ** 2 + dz ** 2);
  
  if (distance < PUCK_RADIUS + MALLET_RADIUS) {
    const angle = Math.atan2(dz, dx);
    const overlap = (PUCK_RADIUS + MALLET_RADIUS) - distance;
    sessionState.puck.x += Math.cos(angle) * overlap;
    sessionState.puck.z += Math.sin(angle) * overlap;
    
    const force = 0.04;
    sessionState.puck.vx += Math.cos(angle) * force;
    sessionState.puck.vz += Math.sin(angle) * force;
    
    socket.emit('session_update', {
      sessionId: sessionData.sessionId,
      type: 'puck_update',
      puck: sessionState.puck
    });
  }
}

function scoreGoal(team) {
  sessionState.lastGoalTime = Date.now();
  showGoalNotification(team);
  
  socket.emit('score', { sessionId: sessionData.sessionId, team: team });
  respawnPuck();
}

function showGoalNotification(team) {
  const notification = document.getElementById('goal-notification');
  const playerName = document.getElementById('goal-player');
  
  const scorer = team === 'team1' ? 'Team 1' : 'Team 2';
  playerName.textContent = scorer;
  
  notification.classList.add('show');
  setTimeout(() => notification.classList.remove('show'), 2000);
}

function respawnPuck() {
  sessionState.puckRespawning = true;
  sessionState.puck.x = TABLE_WIDTH / 2 - PUCK_RADIUS;
  sessionState.puck.z = 0;
  sessionState.puck.vx = -0.1;
  sessionState.puck.vz = 0;
  
  interpolatedPuck.targetX = sessionState.puck.x;
  interpolatedPuck.targetZ = sessionState.puck.z;
  
  setTimeout(() => { sessionState.puckRespawning = false; }, 1000);
}

function updateScoreUI() {
  document.getElementById('score-team1').textContent = sessionState.scores.team1;
  document.getElementById('score-team2').textContent = sessionState.scores.team2;
}

function showSessionOver(result) {
  const overlay = document.getElementById('game-over');
  const winnerText = document.getElementById('winner-text');
  
  winnerText.textContent = result.winner === 'team1' ? 'Team 1 が勝利！' : 'Team 2 が勝利！';
  
  document.getElementById('final-score-team1').textContent = result.scores.team1;
  document.getElementById('final-score-team2').textContent = result.scores.team2;
  
  overlay.style.display = 'flex';
}

function onWindowResize() {
  const container = document.getElementById('game-canvas');
  const aspect = container.clientWidth / container.clientHeight;
  const viewSize = 9;
  
  camera.left = -viewSize * aspect;
  camera.right = viewSize * aspect;
  camera.top = viewSize;
  camera.bottom = -viewSize;
  camera.updateProjectionMatrix();
  
  renderer.setSize(container.clientWidth, container.clientHeight);
}

document.addEventListener('DOMContentLoaded', init);
