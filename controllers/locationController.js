const Location = require('../models/Location');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createLocation = catchAsync(async (req, res) => {
  const location = await Location.create(req.body);
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
  const location = await Location.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
  if (!location) throw new AppError('Location not found', 404);
  res.json({ success: true, data: { location }, error: null, source: 'LOCATION_UPDATE' });
});

exports.deleteLocation = catchAsync(async (req, res) => {
  const location = await Location.findByIdAndDelete(req.params.id).lean();
  if (!location) throw new AppError('Location not found', 404);
  res.json({ success: true, data: { message: 'Location deleted' }, error: null, source: 'LOCATION_DELETE' });
});
