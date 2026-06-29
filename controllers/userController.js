const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { logAction } = require('../services/historyService');

exports.createUser = catchAsync(async (req, res) => {
  const { name, email, password, role, customRole } = req.body;
  const existing = await User.findOne({ email }).lean();
  if (existing) throw new AppError('Email already in use', 400);
  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, password: hashedPassword, role, customRole: customRole || null });

  logAction('USER_CREATE', req.user._id, {
    targetType: 'User',
    targetId: user._id,
    targetDisplay: name,
    description: `قام ${req.user.name} بإنشاء مستخدم جديد: ${name} (${email})`,
    details: { createdUser: { name, email, role, customRole }, by: req.user.name },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: { user: { id: user._id, name: user.name, email: user.email, role: user.role } }, error: null, source: 'USER_CREATE' });
});

exports.getUsers = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find()
      .populate('customRole')
      .populate('assignedClients', 'name email')
      .populate('allowedAccountants', 'name email')
      .sort('-createdAt').skip(skip).limit(limit).lean(),
    User.countDocuments(),
  ]);
  res.json({ success: true, data: { users, total, page, totalPages: Math.ceil(total / limit) }, error: null, source: 'USER_LIST' });
});

exports.getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).populate('customRole').lean();
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, data: { user }, error: null, source: 'USER_GET' });
});

exports.updateUser = catchAsync(async (req, res) => {
  const updates = { ...req.body };
  if (updates.password) {
    updates.password = await bcrypt.hash(updates.password, 12);
  }
  if (updates.customRole === '') updates.customRole = null;
  if (updates.assignedClients === '') updates.assignedClients = [];
  if (updates.allowedAccountants === '') updates.allowedAccountants = [];
  const oldUser = await User.findById(req.params.id).lean();
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).lean();
  if (!user) throw new AppError('User not found', 404);

  logAction('USER_UPDATE', req.user._id, {
    targetType: 'User',
    targetId: user._id,
    targetDisplay: user.name,
    description: `قام ${req.user.name} بتحديث المستخدم ${user.name}`,
    details: { updatedUserId: user._id, userName: user.name, oldData: oldUser, newData: updates },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { user }, error: null, source: 'USER_UPDATE' });
});

exports.deleteUser = catchAsync(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id).lean();
  if (!user) throw new AppError('User not found', 404);

  logAction('USER_DELETE', req.user._id, {
    targetType: 'User',
    targetId: req.params.id,
    targetDisplay: user.name,
    description: `قام ${req.user.name} بحذف المستخدم ${user.name} (${user.email})`,
    details: { deletedUser: { name: user.name, email: user.email, role: user.role }, by: req.user.name },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { message: 'User deleted' }, error: null, source: 'USER_DELETE' });
});
