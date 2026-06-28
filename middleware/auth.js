const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return next(new AppError('Not authenticated. Please log in.', 401));
  }
  try {
    const decoded = jwt.verify(token, config.jwtAccessSecret);
    const user = await User.findById(decoded.id).lean();
    if (!user) {
      return next(new AppError('User no longer exists.', 401));
    }
    req.user = user;
    next();
  } catch (err) {
    return next(new AppError('Not authenticated. Invalid or expired token.', 401));
  }
});

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

const checkPermission = (...permissions) => {
  return async (req, res, next) => {
    if (req.user.role === 'super_admin') return next();
    if (req.user.role !== 'custom_staff') {
      return next(new AppError('You do not have permission.', 403));
    }
    const CustomRole = require('../models/CustomRole');
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (!role) {
      return next(new AppError('Custom role not found.', 403));
    }
    const hasAll = permissions.every((perm) => role[perm] === true);
    if (!hasAll) {
      return next(new AppError('You do not have permission for this action.', 403));
    }
    next();
  };
};

module.exports = { protect, authorize, checkPermission };
