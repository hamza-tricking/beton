const Location = require('../models/Location');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { logAction } = require('../services/historyService');

exports.createLocation = catchAsync(async (req, res) => {
  const location = await Location.create(req.body);

  logAction('LOCATION_CREATE', req.user._id, {
    targetType: 'Location',
    targetId: location._id,
    targetDisplay: location.placeName,
    description: `قام ${req.user.name} بإضافة منطقة جديدة: ${location.placeName}`,
    details: { placeName: location.placeName },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: { location }, error: null, source: 'LOCATION_CREATE' });
});

exports.getLocations = catchAsync(async (req, res) => {
  const locations = await Location.find().sort('placeName').lean();
  res.json({ success: true, data: { locations }, error: null, source: 'LOCATION_LIST' });
});

exports.getLocation = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.id).lean();
  if (!location) throw new AppError('Location not found', 404);
  res.json({ success: true, data: { location }, error: null, source: 'LOCATION_GET' });
});

exports.updateLocation = catchAsync(async (req, res) => {
  const oldLocation = await Location.findById(req.params.id).lean();
  const location = await Location.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
  if (!location) throw new AppError('Location not found', 404);

  logAction('LOCATION_UPDATE', req.user._id, {
    targetType: 'Location',
    targetId: location._id,
    targetDisplay: location.placeName,
    description: `قام ${req.user.name} بتحديث المنطقة: ${oldLocation?.placeName} ← ${location.placeName}`,
    details: { locationId: location._id, oldName: oldLocation?.placeName, newName: location.placeName },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { location }, error: null, source: 'LOCATION_UPDATE' });
});

exports.deleteLocation = catchAsync(async (req, res) => {
  const location = await Location.findByIdAndDelete(req.params.id).lean();
  if (!location) throw new AppError('Location not found', 404);

  logAction('LOCATION_DELETE', req.user._id, {
    targetType: 'Location',
    targetId: req.params.id,
    targetDisplay: location.placeName,
    description: `قام ${req.user.name} بحذف المنطقة: ${location.placeName}`,
    details: { deletedPlace: location.placeName },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { message: 'Location deleted' }, error: null, source: 'LOCATION_DELETE' });
});
