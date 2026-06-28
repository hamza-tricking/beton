const Order = require('../models/Order');
const Product = require('../models/Product');
const Location = require('../models/Location');
const catchAsync = require('../utils/catchAsync');

exports.getDashboard = catchAsync(async (req, res) => {
  const [
    totalOrders,
    totalRevenue,
    ordersByStatus,
    topLocations,
    totalProducts,
    totalLocations,
    revenueByDay,
    topProducts,
    recentOrders,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
    Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
        },
      },
    ]),
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
      { $lookup: { from: 'locations', localField: '_id', foreignField: '_id', as: 'location' } },
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
      { $project: { placeName: '$location.placeName', count: 1, revenue: 1 } },
    ]),
    Product.countDocuments(),
    Location.countDocuments(),
    Order.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      {
        $project: {
          productIds: {
            $cond: {
              if: { $and: [{ $isArray: '$items' }, { $gt: [{ $size: '$items' }, 0] }] },
              then: '$items.product',
              else: ['$product'],
            },
          },
        },
      },
      { $unwind: '$productIds' },
      { $group: { _id: '$productIds', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $project: { name: '$product.name', count: 1 } },
    ]),
    Order.find()
      .populate('client', 'name')
      .populate('items.product', 'name')
      .sort('-createdAt')
      .limit(10)
      .lean(),
  ]);

  res.json({
    success: true,
    data: {
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      ordersByStatus,
      topLocations,
      totalProducts,
      totalLocations,
      revenueByDay,
      topProducts,
      recentOrders,
    },
    error: null,
    source: 'ANALYTICS_DASHBOARD',
  });
});

exports.getOrdersByStatus = catchAsync(async (req, res) => {
  const { status } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = { status };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('client', 'name email')
      .populate('createdBy', 'name')
      .populate('globalLocation', 'placeName')
      .populate('items.product', 'name')
      .populate('items.location', 'placeName')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: { orders, total, page, totalPages: Math.ceil(total / limit) },
    error: null,
    source: 'ANALYTICS_ORDERS_BY_STATUS',
  });
});

exports.getOrdersByLocation = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = {
    $or: [
      { location: locationId },
      { 'items.location': locationId },
    ],
  };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('client', 'name email')
      .populate('createdBy', 'name')
      .populate('globalLocation', 'placeName')
      .populate('items.product', 'name')
      .populate('items.location', 'placeName')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: { orders, total, page, totalPages: Math.ceil(total / limit) },
    error: null,
    source: 'ANALYTICS_ORDERS_BY_LOCATION',
  });
});
