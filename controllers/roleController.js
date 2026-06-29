const CustomRole = require('../models/CustomRole');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { logAction } = require('../services/historyService');

exports.createRole = catchAsync(async (req, res) => {
  const role = await CustomRole.create(req.body);

  logAction('ROLE_CREATE', req.user._id, {
    targetType: 'CustomRole',
    targetId: role._id,
    targetDisplay: role.roleName,
    description: `قام ${req.user.name} بإنشاء دور جديد: ${role.roleName}`,
    details: { roleName: role.roleName, permissions: req.body },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: { role }, error: null, source: 'ROLE_CREATE' });
});

exports.getRoles = catchAsync(async (req, res) => {
  const roles = await CustomRole.find().lean();
  res.json({ success: true, data: { roles }, error: null, source: 'ROLE_LIST' });
});

exports.getRole = catchAsync(async (req, res) => {
  const role = await CustomRole.findById(req.params.id).lean();
  if (!role) throw new AppError('Role not found', 404);
  res.json({ success: true, data: { role }, error: null, source: 'ROLE_GET' });
});

exports.updateRole = catchAsync(async (req, res) => {
  const oldRole = await CustomRole.findById(req.params.id).lean();
  const role = await CustomRole.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
  if (!role) throw new AppError('Role not found', 404);

  logAction('ROLE_UPDATE', req.user._id, {
    targetType: 'CustomRole',
    targetId: role._id,
    targetDisplay: role.roleName,
    description: `قام ${req.user.name} بتحديث دور ${role.roleName}`,
    details: { roleId: role._id, roleName: role.roleName, oldRole, newData: req.body },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { role }, error: null, source: 'ROLE_UPDATE' });
});

exports.deleteRole = catchAsync(async (req, res) => {
  const role = await CustomRole.findByIdAndDelete(req.params.id).lean();
  if (!role) throw new AppError('Role not found', 404);

  logAction('ROLE_DELETE', req.user._id, {
    targetType: 'CustomRole',
    targetId: req.params.id,
    targetDisplay: role.roleName,
    description: `قام ${req.user.name} بحذف دور ${role.roleName}`,
    details: { deletedRole: role },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { message: 'Role deleted' }, error: null, source: 'ROLE_DELETE' });
});
