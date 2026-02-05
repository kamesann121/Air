const express = require('express');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const auth = require('../middleware/auth');

const router = express.Router();

// フレンドリスト取得
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'uid nickname avatar stats');
    res.json({ friends: user.friends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// フレンド申請送信
router.post('/request', auth, async (req, res) => {
  try {
    const { searchTerm } = req.body; // nicknameまたはUID
    
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term required' });
    }

    // ユーザー検索（nicknameまたはUID）
    const targetUser = await User.findOne({
      $or: [
        { nickname: searchTerm },
        { uid: searchTerm.toUpperCase() }
      ]
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 自分自身には送れない
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // 既にフレンドかチェック
    if (req.user.friends.includes(targetUser._id)) {
      return res.status(400).json({ error: 'Already friends with this user' });
    }

    // 既存のリクエストをチェック
    const existingRequest = await FriendRequest.findOne({
      from: req.user._id,
      to: targetUser._id,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // 逆方向のリクエストがあるかチェック（相手から既に送られている）
    const reverseRequest = await FriendRequest.findOne({
      from: targetUser._id,
      to: req.user._id,
      status: 'pending'
    });

    if (reverseRequest) {
      return res.status(400).json({ 
        error: 'This user has already sent you a friend request',
        suggestion: 'Check your friend requests inbox'
      });
    }

    // 新規フレンド申請作成
    const friendRequest = new FriendRequest({
      from: req.user._id,
      to: targetUser._id
    });

    await friendRequest.save();

    res.json({
      message: 'Friend request sent successfully',
      request: friendRequest
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    
    // 重複エラーの処理
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Friend request already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
});

// 受信したフレンド申請一覧取得
router.get('/requests/received', auth, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      to: req.user._id,
      status: 'pending'
    }).populate('from', 'uid nickname avatar');

    res.json({ requests });
  } catch (error) {
    console.error('Get received requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 送信したフレンド申請一覧取得
router.get('/requests/sent', auth, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      from: req.user._id,
      status: 'pending'
    }).populate('to', 'uid nickname avatar');

    res.json({ requests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// フレンド申請を承認
router.post('/request/:requestId/accept', auth, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // 自分宛のリクエストか確認
    if (request.to.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    // リクエストを承認済みに
    request.status = 'accepted';
    await request.save();

    // 双方のフレンドリストに追加
    await User.findByIdAndUpdate(request.from, {
      $addToSet: { friends: request.to }
    });

    await User.findByIdAndUpdate(request.to, {
      $addToSet: { friends: request.from }
    });

    res.json({
      message: 'Friend request accepted',
      request
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// フレンド申請を拒否
router.post('/request/:requestId/reject', auth, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // 自分宛のリクエストか確認
    if (request.to.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    // リクエストを拒否済みに（削除してもOK）
    request.status = 'rejected';
    await request.save();

    res.json({
      message: 'Friend request rejected',
      request
    });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// フレンド削除
router.delete('/:friendId', auth, async (req, res) => {
  try {
    const friendId = req.params.friendId;

    // 双方のフレンドリストから削除
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { friends: friendId }
    });

    await User.findByIdAndUpdate(friendId, {
      $pull: { friends: req.user._id }
    });

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
