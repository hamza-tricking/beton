const Order = require('../models/Order');
const catchAsync = require('../utils/catchAsync');

exports.getDashboard = catchAsync(async (req, res) => {
  const [totalOrders, totalRevenue, ordersByStatus, topLocations] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      {
        $project: {
          locations: {
            $cond: {
              if: { $and: [{ $isArray: '$items' }, { $gt: [{ $size: '$items' }, 0] }] },
              then: '$items.location',
              else: ['$location'],
            },
          },
          revenues: {
            $cond: {
              if: { $and: [{ $isArray: '$items' }, { $gt: [{ $size: '$items' }, 0] }] },
              then: '$items.totalPrice',
              else: ['$totalPrice'],
            },
          },
        },
      },
      { $unwind: '$locations' },
      { $unwind: '$revenues' },
      {
        $group: {
          _id: '$locations',
          count: { $sum: 1 },
          revenue: { $sum: '$revenues' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: { from: 'locations', localField: '_id', foreignField: '_id', as: 'location' },
      },
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
      { $project: { placeName: '$location.placeName', count: 1, revenue: 1 } },
    ]),
  ]);
  res.json({
    success: true,
    data: {
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      ordersByStatus,
      topLocations,
    },
    error: null,
    source: 'ANALYTICS_DASHBOARD',
  });
});
