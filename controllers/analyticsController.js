const mongoose = require('mongoose');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
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
    .sort('-createdAt')
    .lean();

  const totalOrders = allOrders.length;
  const orderTotalPriceSum = allOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

  // Revenue from accepted payments
  const paymentFilter = {};
  if (filter.client) paymentFilter.client = filter.client;
  if (filter.createdAt) paymentFilter.createdAt = filter.createdAt;
  paymentFilter.status = 'accepted';

  const totalRevenueResult = await Payment.aggregate([
    { $match: paymentFilter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const totalRevenue = totalRevenueResult[0]?.total || 0;

  const statusMap = {};
  for (const o of allOrders) {
    const st = o.status || 'unknown';
    if (!statusMap[st]) statusMap[st] = { count: 0, totalAmount: 0 };
    statusMap[st].count++;
    statusMap[st].totalAmount += o.totalPrice || 0;
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

  // Revenue by day from accepted payments
  const dayMap = {};
  for (const o of allOrders) {
    const day = o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : 'unknown';
    if (!dayMap[day]) dayMap[day] = { orders: 0, totalAmount: 0 };
    dayMap[day].orders++;
    dayMap[day].totalAmount += o.totalPrice || 0;
  }
  // Also include payment days
  const paymentsByDay = await Payment.aggregate([
    { $match: { ...paymentFilter, acceptedAt: { $ne: null } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$acceptedAt' } },
        revenue: { $sum: '$amount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const revenueByDay = paymentsByDay.map(d => ({ _id: d._id, orders: 0, revenue: d.revenue }));

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

  // Total debts from User model
  let clientFilter = {};
  if (req.user.role === 'custom_staff') {
    const clients = await getAssignedClients(req.user);
    if (clients !== null) {
      clientFilter._id = { $in: clients.length > 0 ? clients : [] };
    }
  }
  if (req.query.clientId) {
    clientFilter._id = req.query.clientId;
  }

  const debtResult = await User.aggregate([
    { $match: { ...clientFilter, role: 'client' } },
    { $group: { _id: null, totalDebts: { $sum: '$totalDebt' } } },
  ]);
  const totalDebts = debtResult[0]?.totalDebts || 0;

  // Debts by client
  const clientsWithDebt = await User.find({ ...clientFilter, role: 'client', totalDebt: { $gt: 0 } })
    .select('name totalDebt')
    .sort({ totalDebt: -1 })
    .limit(10)
    .lean();

  const debtsByClient = clientsWithDebt.map(c => ({
    clientId: c._id,
    clientName: c.name,
    totalDebt: c.totalDebt || 0,
    orderCount: 0,
  }));

  const [totalProducts, totalLocations] = await Promise.all([
    Product.countDocuments(),
    Location.countDocuments(),
  ]);

  // Pagination & sorting for orders table
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const sortBy = req.query.sortBy || 'date';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  const sortedOrders = [...allOrders].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'amount') cmp = (a.totalPrice || 0) - (b.totalPrice || 0);
    else cmp = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    return sortOrder * cmp;
  });

  const ordersTotal = sortedOrders.length;
  const totalPages = Math.ceil(ordersTotal / limit) || 1;
  const skip = (page - 1) * limit;
  const orders = sortedOrders.slice(skip, skip + limit);

  res.json({
    success: true,
    data: {
      totalOrders,
      totalRevenue,
      totalDebts,
      ordersByStatus,
      topLocations,
      totalProducts: hasProductFilter ? totalOrders : totalProducts,
      totalLocations,
      revenueByDay,
      topProducts,
      debtsByClient,
      orders,
      ordersTotal,
      page,
      totalPages,
      limit,
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
    User.find(clientFilter).select('name email totalDebt').sort('name').lean(),
    Product.find().select('name').sort('name').lean(),
  ]);
  res.json({
    success: true,
    data: { clients, products },
    error: null,
    source: 'ANALYTICS_FILTER_OPTIONS',
  });
});

exports.getOrdersByClientDebt = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = {
    client: toObjectId(req.params.clientId),
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
    source: 'ANALYTICS_ORDERS_BY_CLIENT_DEBT',
  });
});

// Client Statement API
exports.getClientStatement = catchAsync(async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const client = await User.findById(id).select('name totalDebt').lean();
  if (!client) throw new AppError('Client not found', 404);

  // Get all orders for this client
  const orders = await Order.find({ client: id })
    .populate('items.product', 'name')
    .populate('items.location', 'placeName')
    .sort({ createdAt: -1 })
    .lean();

  // Get all payments for this client
  const payments = await Payment.find({ client: id, status: 'accepted' })
    .populate('createdBy', 'name')
    .populate('acceptedBy', 'name')
    .sort({ acceptedAt: -1 })
    .lean();

  // Build ledger entries
  const entries = [];

  for (const o of orders) {
    entries.push({
      date: o.createdAt,
      type: 'order',
      refId: o._id,
      description: o.items?.length
        ? `إنشاء طلب - ${o.items.map(i => i.product?.name).join('، ')}`
        : 'إنشاء طلب',
      debit: o.totalPrice,
      credit: 0,
    });
    if (o.status === 'cancelled') {
      entries.push({
        date: o.updatedAt,
        type: 'cancel',
        refId: o._id,
        description: 'إلغاء طلب',
        debit: 0,
        credit: o.totalPrice,
      });
    }
  }

  for (const p of payments) {
    entries.push({
      date: p.acceptedAt || p.createdAt,
      type: 'payment',
      refId: p._id,
      description: `تسديد دين - ${p.createdBy?.name || ''}`,
      debit: 0,
      credit: p.amount,
      details: {
        debtBefore: p.debtBefore,
        debtAfter: p.debtAfter,
      },
    });
  }

  // Sort by date ascending, then calculate running balance
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  let balance = 0;
  for (const entry of entries) {
    balance += (entry.debit || 0) - (entry.credit || 0);
    entry.balance = balance;
  }

  // Reverse for newest-first display, but keep balance calculated from oldest
  entries.reverse();

  const total = entries.length;
  const paginated = entries.slice(skip, skip + limit);

  res.json({
    success: true,
    data: {
      client: { _id: client._id, name: client.name, totalDebt: client.totalDebt },
      entries: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
    error: null,
    source: 'CLIENT_STATEMENT',
  });
});
