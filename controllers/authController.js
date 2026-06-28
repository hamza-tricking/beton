const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, config.jwtAccessSecret, { expiresIn: config.jwtAccessExpiresIn });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });
};

const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

exports.register = catchAsync(async (req, res) => {
  const { name, email, password, role, customRole } = req.body;
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw new AppError('Email already in use', 400);
  }
  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: role || 'client',
    customRole: customRole || null,
  });
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();
  setTokenCookies(res, accessToken, refreshToken);
  res.status(201).json({
    success: true,
    data: { user: { id: user._id, name: user.name, email: user.email, role: user.role } },
    error: null,
    source: 'AUTH_REGISTER',
  });
});

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError('Invalid email or password', 401);
  }
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();
  setTokenCookies(res, accessToken, refreshToken);
  res.json({
    success: true,
    data: { user: { id: user._id, name: user.name, email: user.email, role: user.role } },
    error: null,
    source: 'AUTH_LOGIN',
  });
});

exports.refresh = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new AppError('No refresh token provided', 401);
  const decoded = jwt.verify(token, config.jwtRefreshSecret);
  const user = await User.findById(decoded.id);
  if (!user || user.refreshToken !== token) {
    throw new AppError('Invalid refresh token', 401);
  }
  const accessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);
  user.refreshToken = newRefreshToken;
  await user.save();
  setTokenCookies(res, accessToken, newRefreshToken);
  res.json({ success: true, data: { message: 'Tokens refreshed' }, error: null, source: 'AUTH_REFRESH' });
});

exports.logout = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    user.refreshToken = null;
    await user.save();
  }
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true, data: { message: 'Logged out' }, error: null, source: 'AUTH_LOGOUT' });
});

exports.me = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate('customRole').lean();
  res.json({ success: true, data: { user }, error: null, source: 'AUTH_ME' });
});
