// simulation.js - Three.jsを使った3Dエアホッケーアプリのメインロジック

class AirHockeyGame {
  constructor(containerId, socket, sessionData) {
    this.container = document.getElementById(containerId);
    this.socket = socket;
    this.sessionData = sessionData;
    
    // アプリ状態
    this.isMyTurn = true;
    this.gameStarted = false;
    this.myTeam = this.determineMyTeam();
    
    // Three.js基本要素
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    // アプリオブジェクト
    this.table = null;
    this.puck = null;
    this.myMallet = null;
    this.opponentMallet = null;
    this.walls = [];
    this.goals = [];
    
    // 物理演算用
    this.puckVelocity = new THREE.Vector3(0, 0, 0);
    this.friction = 0.98;
    this.malletForce = 0.5;
    
    // マウス/タッチ操作
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    
    // スコア
    this.scores = { team1: 0, team2: 0 };
    
    this.init();
  }
  
  determineMyTeam() {
    const myUserId = localStorage.getItem('userId');
    if (this.sessionData.teams.team1.includes(myUserId)) {
      return 'team1';
    }
    return 'team2';
  }
  
  init() {
    this.setupScene();
    this.setupLights();
    this.createTable();
    this.createPuck();
    this.createMallets();
    this.createWalls();
    this.createGoals();
    this.setupControls();
    this.setupSocketListeners();
    this.animate();
    
    this.gameStarted = true;
  }
  
  setupScene() {
    // シーン作成
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    
    // カメラ設定
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    
    // チームによってカメラ位置を変更
    if (this.myTeam === 'team1') {
      this.camera.position.set(0, 12, 15);
    } else {
      this.camera.position.set(0, 12, -15);
      this.camera.rotation.y = Math.PI;
    }
    
    this.camera.lookAt(0, 0, 0);
    
    // レンダラー設定
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    
    // リサイズ対応
    window.addEventListener('resize', () => this.onWindowResize());
  }
  
  setupLights() {
    // 環境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // ディレクショナルライト
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
    
    // ポイントライト（雰囲気作り）
    const pointLight1 = new THREE.PointLight(0x00ffff, 0.5, 50);
    pointLight1.position.set(-8, 5, 0);
    this.scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0xff00ff, 0.5, 50);
    pointLight2.position.set(8, 5, 0);
    this.scene.add(pointLight2);
  }
  
  createTable() {
    // テーブル本体
    const tableGeometry = new THREE.BoxGeometry(20, 0.5, 30);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x16213e,
      roughness: 0.3,
      metalness: 0.7
    });
    this.table = new THREE.Mesh(tableGeometry, tableMaterial);
    this.table.position.y = -0.25;
    this.table.receiveShadow = true;
    this.scene.add(this.table);
    
    // センターライン
    const lineGeometry = new THREE.PlaneGeometry(0.1, 30);
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.01;
    this.scene.add(centerLine);
    
    // センターサークル
    const circleGeometry = new THREE.RingGeometry(3, 3.1, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const centerCircle = new THREE.Mesh(circleGeometry, circleMaterial);
    centerCircle.rotation.x = -Math.PI / 2;
    centerCircle.position.y = 0.01;
    this.scene.add(centerCircle);
  }
  
  createPuck() {
    const puckGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 32);
    const puckMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.6
    });
    this.puck = new THREE.Mesh(puckGeometry, puckMaterial);
    this.puck.position.set(0, 0.15, 0);
    this.puck.castShadow = true;
    this.scene.add(this.puck);
    
    // パックの光エフェクト
    const puckLight = new THREE.PointLight(0xffff00, 0.5, 5);
    puckLight.position.copy(this.puck.position);
    this.scene.add(puckLight);
    this.puck.userData.light = puckLight;
  }
  
  createMallets() {
    const malletGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 32);
    
    // 自分のマレット
    const myMalletMaterial = new THREE.MeshStandardMaterial({
      color: this.myTeam === 'team1' ? 0x00ff00 : 0xff0000,
      emissive: this.myTeam === 'team1' ? 0x00ff00 : 0xff0000,
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.5
    });
    this.myMallet = new THREE.Mesh(malletGeometry, myMalletMaterial);
    this.myMallet.position.set(0, 0.25, this.myTeam === 'team1' ? 12 : -12);
    this.myMallet.castShadow = true;
    this.scene.add(this.myMallet);
    
    // 相手のマレット
    const opponentMalletMaterial = new THREE.MeshStandardMaterial({
      color: this.myTeam === 'team1' ? 0xff0000 : 0x00ff00,
      emissive: this.myTeam === 'team1' ? 0xff0000 : 0x00ff00,
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.5
    });
    this.opponentMallet = new THREE.Mesh(malletGeometry, opponentMalletMaterial);
    this.opponentMallet.position.set(0, 0.25, this.myTeam === 'team1' ? -12 : 12);
    this.opponentMallet.castShadow = true;
    this.scene.add(this.opponentMallet);
  }
  
  createWalls() {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f3460,
      transparent: true,
      opacity: 0.6,
      roughness: 0.7
    });
    
    // 左右の壁
    const sideWallGeometry = new THREE.BoxGeometry(0.5, 2, 30);
    
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    leftWall.position.set(-10, 1, 0);
    this.scene.add(leftWall);
    this.walls.push({ mesh: leftWall, type: 'side' });
    
    const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    rightWall.position.set(10, 1, 0);
    this.scene.add(rightWall);
    this.walls.push({ mesh: rightWall, type: 'side' });
    
    // 上下の壁（ゴール部分を除く）
    const endWallGeometry = new THREE.BoxGeometry(14, 2, 0.5);
    
    const topWallLeft = new THREE.Mesh(endWallGeometry, wallMaterial);
    topWallLeft.position.set(-3, 1, -15);
    this.scene.add(topWallLeft);
    this.walls.push({ mesh: topWallLeft, type: 'end' });
    
    const topWallRight = new THREE.Mesh(endWallGeometry, wallMaterial);
    topWallRight.position.set(3, 1, -15);
    this.scene.add(topWallRight);
    this.walls.push({ mesh: topWallRight, type: 'end' });
    
    const bottomWallLeft = new THREE.Mesh(endWallGeometry, wallMaterial);
    bottomWallLeft.position.set(-3, 1, 15);
    this.scene.add(bottomWallLeft);
    this.walls.push({ mesh: bottomWallLeft, type: 'end' });
    
    const bottomWallRight = new THREE.Mesh(endWallGeometry, wallMaterial);
    bottomWallRight.position.set(3, 1, 15);
    this.scene.add(bottomWallRight);
    this.walls.push({ mesh: bottomWallRight, type: 'end' });
  }
  
  createGoals() {
    const goalMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.3
    });
    
    const goalGeometry = new THREE.BoxGeometry(4, 1, 0.5);
    
    // Team1のゴール
    const goal1 = new THREE.Mesh(goalGeometry, goalMaterial);
    goal1.position.set(0, 0.5, 15);
    this.scene.add(goal1);
    this.goals.push({ mesh: goal1, team: 'team1' });
    
    // Team2のゴール
    const goal2 = new THREE.Mesh(goalGeometry, goalMaterial);
    goal2.position.set(0, 0.5, -15);
    this.scene.add(goal2);
    this.goals.push({ mesh: goal2, team: 'team2' });
  }
  
  setupControls() {
    const canvas = this.renderer.domElement;
    
    // マウス操作
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    
    // タッチ操作
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));
  }
  
  setupSocketListeners() {
    // セッション状態の更新を受信
    this.socket.on('session_state', (state) => {
      this.updateGameState(state);
    });
    
    // スコア更新を受信
    this.socket.on('score_update', (scores) => {
      this.scores = scores;
      this.updateScoreDisplay();
      this.resetPuck();
    });
    
    // セッション終了
    this.socket.on('session_end', (data) => {
      this.endGame(data);
    });
  }
  
  onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    if (this.isDragging) {
      this.updateMalletPosition();
    }
  }
  
  onMouseDown(event) {
    this.isDragging = true;
  }
  
  onMouseUp(event) {
    this.isDragging = false;
  }
  
  onTouchMove(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
    
    if (this.isDragging) {
      this.updateMalletPosition();
    }
  }
  
  onTouchStart(event) {
    event.preventDefault();
    this.isDragging = true;
    this.onTouchMove(event);
  }
  
  onTouchEnd(event) {
    event.preventDefault();
    this.isDragging = false;
  }
  
  updateMalletPosition() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // テーブル平面との交点を計算
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersection);
    
    if (intersection) {
      // 移動範囲を制限（自陣のみ）
      const maxZ = this.myTeam === 'team1' ? 15 : 0;
      const minZ = this.myTeam === 'team1' ? 0 : -15;
      
      intersection.x = Math.max(-9, Math.min(9, intersection.x));
      intersection.z = Math.max(minZ, Math.min(maxZ, intersection.z));
      
      this.myMallet.position.x = intersection.x;
      this.myMallet.position.z = intersection.z;
      
      // サーバーに送信
      this.socket.emit('session_update', {
        sessionId: this.sessionData.sessionId,
        type: 'mallet_move',
        position: {
          x: this.myMallet.position.x,
          y: this.myMallet.position.y,
          z: this.myMallet.position.z
        }
      });
    }
  }
  
  updateGameState(state) {
    // 相手のマレット位置を更新
    if (state.mallets) {
      const opponentId = this.sessionData.players.find(id => 
        id !== localStorage.getItem('userId')
      );
      
      if (state.mallets[opponentId]) {
        this.opponentMallet.position.copy(state.mallets[opponentId]);
      }
    }
    
    // パックの位置を更新
    if (state.puck && !this.isMyTurn) {
      this.puck.position.copy(state.puck.position);
      this.puckVelocity.copy(state.puck.velocity);
    }
  }
  
  checkCollisions() {
    // マレットとパックの衝突判定
    const malletDistance = this.myMallet.position.distanceTo(this.puck.position);
    if (malletDistance < 1.8) {
      const direction = new THREE.Vector3()
        .subVectors(this.puck.position, this.myMallet.position)
        .normalize();
      
      this.puckVelocity.add(direction.multiplyScalar(this.malletForce));
      
      // パックを押し出す
      const pushDistance = 1.8 - malletDistance;
      this.puck.position.add(direction.multiplyScalar(pushDistance));
    }
    
    // 壁との衝突判定
    this.walls.forEach(wall => {
      const wallBox = new THREE.Box3().setFromObject(wall.mesh);
      const puckBox = new THREE.Box3().setFromObject(this.puck);
      
      if (wallBox.intersectsBox(puckBox)) {
        if (wall.type === 'side') {
          this.puckVelocity.x *= -0.8;
          // パックを壁から押し出す
          if (this.puck.position.x > 0) {
            this.puck.position.x = 9.2;
          } else {
            this.puck.position.x = -9.2;
          }
        } else {
          this.puckVelocity.z *= -0.8;
          if (this.puck.position.z > 0) {
            this.puck.position.z = 14.2;
          } else {
            this.puck.position.z = -14.2;
          }
        }
      }
    });
    
    // ゴール判定
    this.goals.forEach(goal => {
      const goalBox = new THREE.Box3().setFromObject(goal.mesh);
      const puckBox = new THREE.Box3().setFromObject(this.puck);
      
      if (goalBox.intersectsBox(puckBox)) {
        this.handleGoal(goal.team);
      }
    });
  }
  
  handleGoal(scoringTeam) {
    // 相手チームが得点
    const scoredTeam = scoringTeam === 'team1' ? 'team2' : 'team1';
    
    // サーバーに送信
    this.socket.emit('score', {
      sessionId: this.sessionData.sessionId,
      team: scoredTeam
    });
  }
  
  resetPuck() {
    this.puck.position.set(0, 0.15, 0);
    this.puckVelocity.set(0, 0, 0);
    
    // パックの光も更新
    if (this.puck.userData.light) {
      this.puck.userData.light.position.copy(this.puck.position);
    }
  }
  
  updateScoreDisplay() {
    // スコア表示を更新（DOM要素）
    const scoreElement = document.getElementById('score-display');
    if (scoreElement) {
      scoreElement.textContent = `${this.scores.team1} - ${this.scores.team2}`;
    }
  }
  
  updatePhysics() {
    if (!this.gameStarted) return;
    
    // パックの移動
    this.puck.position.add(this.puckVelocity);
    
    // 摩擦を適用
    this.puckVelocity.multiplyScalar(this.friction);
    
    // 速度が十分小さくなったら停止
    if (this.puckVelocity.length() < 0.001) {
      this.puckVelocity.set(0, 0, 0);
    }
    
    // パックの光を更新
    if (this.puck.userData.light) {
      this.puck.userData.light.position.copy(this.puck.position);
    }
    
    // 衝突判定
    this.checkCollisions();
    
    // パックの状態をサーバーに送信（一定間隔で）
    if (Math.random() < 0.1) {
      this.socket.emit('session_update', {
        sessionId: this.sessionData.sessionId,
        type: 'puck_update',
        puck: {
          position: this.puck.position,
          velocity: this.puckVelocity
        }
      });
    }
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.updatePhysics();
    this.renderer.render(this.scene, this.camera);
  }
  
  onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
  
  endGame(data) {
    this.gameStarted = false;
    
    // 結果表示
    const resultMessage = data.isWinner ? '勝利！' : '敗北...';
    const resultElement = document.getElementById('result-overlay');
    if (resultElement) {
      resultElement.textContent = resultMessage;
      resultElement.style.display = 'block';
    }
    
    // 数秒後にロビーに戻る
    setTimeout(() => {
      window.location.href = '/lobby.html';
    }, 5000);
  }
  
  destroy() {
    this.gameStarted = false;
    
    // イベントリスナーを削除
    window.removeEventListener('resize', this.onWindowResize);
    
    // Three.jsリソースを解放
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}

// グローバルに公開
window.AirHockeyGame = AirHockeyGame;
