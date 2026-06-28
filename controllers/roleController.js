const CustomRole = require('../models/CustomRole');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createRole = catchAsync(async (req, res) => {
  const role = await CustomRole.create(req.body);
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
  const role = await CustomRole.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
  if (!role) throw new AppError('Role not found', 404);
  res.json({ success: true, data: { role }, error: null, source: 'ROLE_UPDATE' });
});

exports.deleteRole = catchAsync(async (req, res) => {
  const role = await CustomRole.findByIdAndDelete(req.params.id).lean();
  if (!role) throw new AppError('Role not found', 404);
  res.json({ success: true, data: { message: 'Role deleted' }, error: null, source: 'ROLE_DELETE' });
});
