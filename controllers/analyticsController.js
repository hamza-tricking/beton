const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Location = require('../models/Location');
const User = require('../models/User');
const CustomRole = require('../models/CustomRole');
const { getAssignedClients, getPeriodConfig, buildDateFilter } = require('../utils/accountantAccess');
const catchAsync = require('../utils/catchAsync');

const toObjectId = (id) => {
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return id;
};

const buildMatchFilter = async (query, user) => {
  const filter = {};

  if (user.role === 'custom_staff') {
    const clients = await getAssignedClients(user);
    if (clients !== null) {
      filter.client = { $in: clients.length > 0 ? clients.map(toObjectId) : [] };
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
    const clientId = toObjectId(query.clientId);
    filter.client = filter.client
      ? { $in: [clientId].concat((filter.client.$in || []).map(toObjectId)) }
      : clientId;
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
  const filter = await buildMatchFilter(req.query, req.user);
  const hasProductFilter = !!req.query.productId;
  if (hasProductFilter) {
    const productId = toObjectId(req.query.productId);
    filter.$or = [
      { product: productId },
      { 'items.product': productId },
    ];
  }

  const allOrders = await Order.find(filter)
    .populate('client', 'name')
    .populate('items.product', 'name')
    .populate('items.location', 'placeName')
    .populate({
      path: 'payments.payment',
      select: 'amount status createdAt createdBy',
      populate: { path: 'createdBy', select: 'name' },
    })
    .populate('payments.acceptedBy', 'name')
    .sort('-createdAt')
    .lean();

  const totalOrders = allOrders.length;
  const totalRevenue = allOrders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);

  const statusMap = {};
  for (const o of allOrders) {
    const st = o.status || 'unknown';
    if (!statusMap[st]) statusMap[st] = { count: 0, revenue: 0 };
    statusMap[st].count++;
    statusMap[st].revenue += o.paidAmount || 0;
  }
  const ordersByStatus = Object.entries(statusMap).map(([status, data]) => ({ _id: status, ...data }));

  const locationMap = {};
  for (const o of allOrders) {
    const locs = [];
    if (o.items?.length) {
      for (const item of o.items) {
        if (item.location?.placeName) locs.push(item.location.placeName);
        const locName = item.location?.placeName || 'بدون منطقة';
        if (!locationMap[locName]) locationMap[locName] = { count: 0, revenue: 0 };
        locationMap[locName].count++;
        locationMap[locName].revenue += item.totalPrice || 0;
      }
    } else {
      const locName = o.location?.placeName || 'بدون منطقة';
      if (!locationMap[locName]) locationMap[locName] = { count: 0, revenue: 0 };
      locationMap[locName].count++;
      locationMap[locName].revenue += o.totalPrice || 0;
    }
  }
  const topLocations = Object.entries(locationMap)
    .map(([placeName, data]) => ({ _id: placeName, placeName, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const dayMap = {};
  for (const o of allOrders) {
    const day = o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : 'unknown';
    if (!dayMap[day]) dayMap[day] = { orders: 0, revenue: 0 };
    dayMap[day].orders++;
    dayMap[day].revenue += o.paidAmount || 0;
  }
  const revenueByDay = Object.entries(dayMap)
    .map(([d, data]) => ({ _id: d, ...data }))
    .sort((a, b) => a._id.localeCompare(b._id));

  const productMap = {};
  for (const o of allOrders) {
    const prods = o.items?.length ? o.items.map(i => i.product?.name || 'محذوف') : [o.product?.name || 'محذوف'];
    for (const name of prods) {
      if (!productMap[name]) productMap[name] = 0;
      productMap[name]++;
    }
  }
  const topProducts = Object.entries(productMap)
    .map(([name, count]) => ({ _id: name, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalDebts = allOrders.reduce((sum, o) => sum + (o.remainingAmount || 0), 0);

  const clientDebtMap = {};
  for (const o of allOrders) {
    if ((o.remainingAmount || 0) <= 0) continue;
    const cid = o.client?._id || o.client || 'unknown';
    const cname = o.client?.name || 'غير معروف';
    if (!clientDebtMap[cid]) clientDebtMap[cid] = { clientId: cid, clientName: cname, totalDebt: 0, orderCount: 0 };
    clientDebtMap[cid].totalDebt += o.remainingAmount || 0;
    clientDebtMap[cid].orderCount++;
  }
  const debtsByClient = Object.values(clientDebtMap)
    .sort((a, b) => b.totalDebt - a.totalDebt)
    .slice(0, 10);

  const [totalProducts, totalLocations] = await Promise.all([
    Product.countDocuments(),
    Location.countDocuments(),
  ]);

  const recentOrders = allOrders.slice(0, 10);

  res.json({
    success: true,
    data: {
      totalOrders,
      totalRevenue,
      ordersByStatus,
      topLocations,
      totalProducts: hasProductFilter ? totalOrders : totalProducts,
      totalLocations,
      revenueByDay,
      topProducts,
      recentOrders,
      totalDebts,
      debtsByClient,
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
      .populate({
        path: 'payments.payment',
        select: 'amount status createdAt createdBy',
        populate: { path: 'createdBy', select: 'name' },
      })
      .populate('payments.acceptedBy', 'name')
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
      .populate({
        path: 'payments.payment',
        select: 'amount status createdAt createdBy',
        populate: { path: 'createdBy', select: 'name' },
      })
      .populate('payments.acceptedBy', 'name')
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
