const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// サインアップ
router.post('/signup', async (req, res) => {
  try {
    const { nickname, password, deviceFingerprint } = req.body;

    // バリデーション
    if (!nickname || !password || !deviceFingerprint) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // 同じデバイスで既存アカウントがあるかチェック（シークレットモード対策）
    const existingDevice = await User.findOne({ deviceFingerprint });
    if (existingDevice) {
      return res.status(400).json({ 
        error: 'An account already exists on this device',
        existingUid: existingDevice.uid 
      });
    }

    // UID生成（重複チェック付き）
    let uid;
    let isUnique = false;
    while (!isUnique) {
      uid = Math.random().toString(36).substring(2, 10).toUpperCase();
      const existing = await User.findOne({ uid });
      if (!existing) isUnique = true;
    }

    // 新規ユーザー作成
    const user = new User({
      uid,
      nickname,
      password,
      deviceFingerprint
    });

    await user.save();

    // JWTトークン生成
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30日
    });

    res.status(201).json({
      message: 'Account created successfully',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// ログイン
router.post('/login', async (req, res) => {
  try {
    const { nickname, password, deviceFingerprint } = req.body;

    if (!nickname || !password || !deviceFingerprint) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // ユーザー検索
    const user = await User.findOne({ nickname });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // パスワード検証
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // デバイスフィンガープリント更新（端末変更に対応）
    user.deviceFingerprint = deviceFingerprint;
    user.lastLogin = new Date();
    await user.save();

    // JWTトークン生成
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// 自動ログイン（トークン検証）
router.get('/verify', auth, async (req, res) => {
  try {
    res.json({
      user: req.user.toJSON()
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ログアウト
router.post('/logout', auth, (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// プロフィール更新
router.patch('/profile', auth, async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    const user = req.user;

    if (nickname) {
      if (nickname.length < 1 || nickname.length > 20) {
        return res.status(400).json({ error: 'Nickname must be 1-20 characters' });
      }
      user.nickname = nickname;
    }

    if (avatar) {
      user.avatar = avatar;
    }

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
