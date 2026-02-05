const User = require('../models/User');

// オンラインユーザー管理
const onlineUsers = new Map(); // userId -> socketId
const socketToUser = new Map(); // socketId -> userId

// パーティー管理
const parties = new Map(); // partyId -> Party object
const userToParty = new Map(); // userId -> partyId

// マッチメイキング待機キュー
const soloQueue = new Set(); // userId (野良1v1待ち)

// 進行中のセッション
const activeSessions = new Map(); // sessionId -> Session object

class Party {
  constructor(leaderId, maxSize) {
    this.id = `party_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.leaderId = leaderId;
    this.maxSize = maxSize; // 2 or 4
    this.members = [leaderId];
    this.readyStatus = new Map(); // userId -> boolean
    this.readyStatus.set(leaderId, false);
    this.createdAt = Date.now();
  }

  addMember(userId) {
    if (this.members.length >= this.maxSize) {
      return false;
    }
    this.members.push(userId);
    this.readyStatus.set(userId, false);
    return true;
  }

  removeMember(userId) {
    this.members = this.members.filter(id => id !== userId);
    this.readyStatus.delete(userId);
    
    // リーダーが抜けたら次の人をリーダーに
    if (userId === this.leaderId && this.members.length > 0) {
      this.leaderId = this.members[0];
    }
  }

  setReady(userId, ready) {
    this.readyStatus.set(userId, ready);
  }

  isAllReady() {
    if (this.members.length < this.maxSize) return false;
    for (const [userId, ready] of this.readyStatus) {
      if (!ready) return false;
    }
    return true;
  }

  getStatus() {
    return {
      id: this.id,
      leaderId: this.leaderId,
      maxSize: this.maxSize,
      members: this.members,
      readyStatus: Object.fromEntries(this.readyStatus)
    };
  }
}

class Session {
  constructor(players, mode) {
    this.id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.mode = mode; // '1v1' or '2v2'
    this.players = players;
    this.teams = this.assignTeams();
    this.scores = { team1: 0, team2: 0 };
    this.sessionState = this.initSessionState();
    this.startTime = Date.now();
  }

  assignTeams() {
    if (this.mode === '1v1') {
      return {
        team1: [this.players[0]],
        team2: [this.players[1]]
      };
    } else {
      // 2v2: ランダムにチーム分け
      const shuffled = [...this.players].sort(() => Math.random() - 0.5);
      return {
        team1: [shuffled[0], shuffled[1]],
        team2: [shuffled[2], shuffled[3]]
      };
    }
  }

  initSessionState() {
    return {
      puck: { x: 400, y: 300, vx: 0, vy: 0, radius: 15 },
      mallets: {},
      canvas: { width: 800, height: 600 }
    };
  }

  updateSessionState(data) {
    // セッション状態の更新処理
    this.sessionState = { ...this.sessionState, ...data };
  }

  addScore(team) {
    this.scores[team]++;
  }
}

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // ユーザー認証とオンライン状態設定
    socket.on('authenticate', async (userId) => {
      try {
        const user = await User.findById(userId);
        if (!user) {
          socket.emit('auth_error', 'User not found');
          return;
        }

        onlineUsers.set(userId, socket.id);
        socketToUser.set(socket.id, userId);

        // オンラインフレンドリストを送信
        const onlineFriends = user.friends.filter(friendId => 
          onlineUsers.has(friendId.toString())
        );

        socket.emit('authenticated', {
          userId,
          onlineFriends: onlineFriends.map(id => id.toString())
        });

        // フレンドにオンライン通知
        user.friends.forEach(friendId => {
          const friendSocketId = onlineUsers.get(friendId.toString());
          if (friendSocketId) {
            io.to(friendSocketId).emit('friend_online', userId);
          }
        });

        console.log(`User authenticated: ${userId}`);
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('auth_error', 'Authentication failed');
      }
    });

    // パーティー作成
    socket.on('create_party', (data) => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      // 既にパーティーに入っていないか確認
      if (userToParty.has(userId)) {
        socket.emit('error', 'Already in a party');
        return;
      }

      const maxSize = data.maxSize === 4 ? 4 : 2;
      const party = new Party(userId, maxSize);
      
      parties.set(party.id, party);
      userToParty.set(userId, party.id);

      socket.join(party.id);
      socket.emit('party_created', party.getStatus());
    });

    // パーティー招待
    socket.on('invite_to_party', async (data) => {
      const userId = socketToUser.get(socket.id);
      const partyId = userToParty.get(userId);
      
      if (!partyId) {
        socket.emit('error', 'Not in a party');
        return;
      }

      const party = parties.get(partyId);
      if (!party) return;

      const targetSocketId = onlineUsers.get(data.targetUserId);
      if (!targetSocketId) {
        socket.emit('error', 'User is offline');
        return;
      }

      // 招待を送信
      io.to(targetSocketId).emit('party_invite', {
        partyId: party.id,
        from: userId,
        maxSize: party.maxSize
      });
    });

    // パーティー参加
    socket.on('join_party', (data) => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      // 既にパーティーに入っていないか確認
      if (userToParty.has(userId)) {
        socket.emit('error', 'Already in a party');
        return;
      }

      const party = parties.get(data.partyId);
      if (!party) {
        socket.emit('error', 'Party not found');
        return;
      }

      if (!party.addMember(userId)) {
        socket.emit('error', 'Party is full');
        return;
      }

      userToParty.set(userId, party.id);
      socket.join(party.id);

      // パーティー全員に更新通知
      io.to(party.id).emit('party_updated', party.getStatus());
    });

    // パーティー退出
    socket.on('leave_party', () => {
      const userId = socketToUser.get(socket.id);
      const partyId = userToParty.get(userId);
      
      if (!partyId) return;

      const party = parties.get(partyId);
      if (!party) return;

      party.removeMember(userId);
      userToParty.delete(userId);
      socket.leave(partyId);

      if (party.members.length === 0) {
        // パーティーが空になったら削除
        parties.delete(partyId);
      } else {
        // 残りメンバーに更新通知
        io.to(partyId).emit('party_updated', party.getStatus());
      }

      socket.emit('left_party');
    });

    // 準備状態トグル
    socket.on('toggle_ready', () => {
      const userId = socketToUser.get(socket.id);
      const partyId = userToParty.get(userId);
      
      if (!partyId) return;

      const party = parties.get(partyId);
      if (!party) return;

      const currentReady = party.readyStatus.get(userId) || false;
      party.setReady(userId, !currentReady);

      io.to(partyId).emit('party_updated', party.getStatus());

      // 全員準備OKならセッション開始
      if (party.isAllReady()) {
        startPartySession(party);
      }
    });

    // 野良マッチメイキング参加
    socket.on('join_solo_queue', () => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      // パーティーに入っていたら拒否
      if (userToParty.has(userId)) {
        socket.emit('error', 'Leave your party first');
        return;
      }

      soloQueue.add(userId);
      socket.emit('queue_joined');

      // マッチング試行
      tryMatchmaking();
    });

    // 野良マッチメイキング退出
    socket.on('leave_solo_queue', () => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      soloQueue.delete(userId);
      socket.emit('queue_left');
    });

    // セッション中の状態更新
    socket.on('session_update', (data) => {
      const userId = socketToUser.get(socket.id);
      const session = activeSessions.get(data.sessionId);
      
      if (!session || !session.players.includes(userId)) return;

      // セッション状態を更新
      if (data.type === 'mallet_move') {
        session.sessionState.mallets[userId] = data.position;
      } else if (data.type === 'puck_update') {
        session.sessionState.puck = data.puck;
      }

      // 他のプレイヤーに送信
      session.players.forEach(playerId => {
        if (playerId !== userId) {
          const socketId = onlineUsers.get(playerId);
          if (socketId) {
            io.to(socketId).emit('session_state', session.sessionState);
          }
        }
      });
    });

    // スコア更新
    socket.on('score', (data) => {
      const session = activeSessions.get(data.sessionId);
      if (!session) return;

      session.addScore(data.team);
      
      // 全プレイヤーにスコア送信
      session.players.forEach(playerId => {
        const socketId = onlineUsers.get(playerId);
        if (socketId) {
          io.to(socketId).emit('score_update', session.scores);
        }
      });

      // セッション終了判定（例: 7点先取）
      if (session.scores.team1 >= 7 || session.scores.team2 >= 7) {
        endSession(session);
      }
    });

    // 切断処理
    socket.on('disconnect', async () => {
      const userId = socketToUser.get(socket.id);
      if (!userId) return;

      console.log('User disconnected:', userId);

      // オンライン状態削除
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);

      // フレンドにオフライン通知
      try {
        const user = await User.findById(userId);
        if (user) {
          user.friends.forEach(friendId => {
            const friendSocketId = onlineUsers.get(friendId.toString());
            if (friendSocketId) {
              io.to(friendSocketId).emit('friend_offline', userId);
            }
          });
        }
      } catch (error) {
        console.error('Error notifying friends:', error);
      }

      // パーティーから退出
      const partyId = userToParty.get(userId);
      if (partyId) {
        const party = parties.get(partyId);
        if (party) {
          party.removeMember(userId);
          userToParty.delete(userId);
          
          if (party.members.length === 0) {
            parties.delete(partyId);
          } else {
            io.to(partyId).emit('party_updated', party.getStatus());
          }
        }
      }

      // マッチメイキングキューから削除
      soloQueue.delete(userId);
    });

    // マッチメイキング処理
    function tryMatchmaking() {
      if (soloQueue.size >= 2) {
        const players = Array.from(soloQueue).slice(0, 2);
        const session = new Session(players, '1v1');
        
        activeSessions.set(session.id, session);

        // キューから削除
        players.forEach(userId => soloQueue.delete(userId));

        // セッション開始通知
        players.forEach(userId => {
          const socketId = onlineUsers.get(userId);
          if (socketId) {
            io.to(socketId).emit('session_start', {
              sessionId: session.id,
              mode: session.mode,
              teams: session.teams,
              players: players
            });
          }
        });
      }
    }

    // パーティーセッション開始
    function startPartySession(party) {
      const mode = party.maxSize === 2 ? '1v1' : '2v2';
      const session = new Session(party.members, mode);
      
      activeSessions.set(session.id, session);

      // パーティー全員にセッション開始通知
      io.to(party.id).emit('session_start', {
        sessionId: session.id,
        mode: session.mode,
        teams: session.teams,
        players: party.members
      });

      // パーティーを解散
      parties.delete(party.id);
      party.members.forEach(userId => {
        userToParty.delete(userId);
      });
    }

    // セッション終了処理
    async function endSession(session) {
      const winner = session.scores.team1 > session.scores.team2 ? 'team1' : 'team2';
      
      // 勝敗を各プレイヤーに通知
      session.players.forEach(async (userId) => {
        const socketId = onlineUsers.get(userId);
        const isWinner = session.teams[winner].includes(userId);
        
        if (socketId) {
          io.to(socketId).emit('session_end', {
            sessionId: session.id,
            winner: winner,
            scores: session.scores,
            isWinner: isWinner
          });
        }

        // 統計を更新
        try {
          const user = await User.findById(userId);
          if (user) {
            if (isWinner) {
              user.stats.wins++;
            } else {
              user.stats.losses++;
            }
            await user.save();
          }
        } catch (error) {
          console.error('Error updating stats:', error);
        }
      });

      // セッションを削除
      activeSessions.delete(session.id);
    }
  });
};
