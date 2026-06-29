const Order = require('../models/Order');
const Product = require('../models/Product');
const Location = require('../models/Location');
const User = require('../models/User');
const CustomRole = require('../models/CustomRole');
const { getAssignedClients, getPeriodConfig, buildDateFilter } = require('../utils/accountantAccess');
const catchAsync = require('../utils/catchAsync');

const buildMatchFilter = async (query, user) => {
  const filter = {};

  if (user.role === 'custom_staff') {
    const clients = await getAssignedClients(user);
    if (clients !== null) {
      filter.client = { $in: clients.length > 0 ? clients : [] };
    }
    const role = await CustomRole.findById(user.customRole).lean();
    const periodConfig = getPeriodConfig(user, role);
    const dateFilter = buildDateFilter(periodConfig);
    if (dateFilter) {
      filter.createdAt = dateFilter;
    }
  }

  // Apply query filters on top
  if (query.clientId) {
    filter.client = filter.client
      ? { $in: [query.clientId].concat(filter.client.$in || []) }
      : query.clientId;
  }
  if (query.startDate || query.endDate) {
    if (!filter.createdAt) filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  return filter;
};

const buildMatchStage = async (query, user) => {
  const filter = await buildMatchFilter(query, user);
  if (query.productId) {
    filter.$or = [
      { product: query.productId },
      { 'items.product': query.productId },
    ];
  }
  return { $match: filter };
};

exports.getDashboard = catchAsync(async (req, res) => {
  const matchStage = await buildMatchStage(req.query, req.user);

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
    Order.countDocuments(matchStage.$match || {}),
    Order.aggregate([matchStage, { $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
    Order.aggregate([
      matchStage,
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
    ]),
    Order.aggregate([
      matchStage,
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
      { $group: { _id: '$locations', count: { $sum: 1 }, revenue: { $sum: '$revenues' } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'locations', localField: '_id', foreignField: '_id', as: 'location' } },
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
      { $project: { placeName: '$location.placeName', count: 1, revenue: 1 } },
    ]),
    Product.countDocuments(),
    Location.countDocuments(),
    Order.aggregate([
      matchStage,
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
      matchStage,
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
    Order.find(matchStage.$match || {})
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
      totalProducts: req.query.productId ? totalOrders : totalProducts,
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
  const matchStage = await buildMatchStage(req.query, req.user);
  const status = req.params.status;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = { ...(matchStage.$match || {}), status };
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
  const matchStage = await buildMatchStage(req.query, req.user);
  const locationId = req.params.locationId;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = {
    ...(matchStage.$match || {}),
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

exports.getFilterOptions = catchAsync(async (req, res) => {
  let clientFilter = { role: 'client' };

  if (req.user.role === 'custom_staff') {
    const clients = await getAssignedClients(req.user);
    if (clients !== null) {
      clientFilter._id = { $in: clients.length > 0 ? clients : [] };
    }
  }

  const [clients, products] = await Promise.all([
    User.find(clientFilter).select('name email').sort('name').lean(),
    Product.find().select('name').sort('name').lean(),
  ]);
  res.json({
    success: true,
    data: { clients, products },
    error: null,
    source: 'ANALYTICS_FILTER_OPTIONS',
  });
});
