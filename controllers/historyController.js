const History = require('../models/History');
const catchAsync = require('../utils/catchAsync');

exports.getHistory = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.query.action) filter.action = req.query.action;
  if (req.query.actorId) filter.actor = req.query.actorId;
  if (req.query.targetType) filter.targetType = req.query.targetType;

  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const [entries, total] = await Promise.all([
    History.find(filter)
      .populate('actor', 'name email')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    History.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { entries, total, page, totalPages: Math.ceil(total / limit) },
    error: null,
    source: 'HISTORY_LIST',
  });
});

exports.getHistoryStats = catchAsync(async (req, res) => {
  const stats = await History.aggregate([
    { $group: { _id: '$action', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  res.json({
    success: true,
    data: { stats },
    error: null,
    source: 'HISTORY_STATS',
  });
});

exports.getRecentHistory = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;

  const entries = await History.find()
    .populate('actor', 'name email')
    .sort('-createdAt')
    .limit(limit)
    .lean();

  res.json({
    success: true,
    data: { entries },
    error: null,
    source: 'HISTORY_RECENT',
  });
});
