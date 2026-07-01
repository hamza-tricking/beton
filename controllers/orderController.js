const Order = require('../models/Order');
const ProductLocationPrice = require('../models/ProductLocationPrice');
const Product = require('../models/Product');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { logAction } = require('../services/historyService');

const calcUnitPrice = async (productId, locationId) => {
  const product = await Product.findById(productId).lean();
  if (!product) throw new AppError('Product not found', 404);
  let unitPrice = product.basePrice;
  if (locationId) {
    const pricing = await ProductLocationPrice.findOne({ product: productId, location: locationId }).lean();
    unitPrice = product.basePrice + (pricing?.priceOffset || 0);
  }
  return unitPrice;
};

exports.createOrder = catchAsync(async (req, res) => {
  const { clientId, globalLocationId, items, productId, locationId, quantity } = req.body;

  let orderItems;
  if (items && Array.isArray(items) && items.length > 0) {
    const computed = await Promise.all(
      items.map(async (item) => {
        const effectiveLocation = item.locationId || globalLocationId || null;
        const unitPrice = await calcUnitPrice(item.productId, effectiveLocation);
        const qty = item.quantity || 1;
        return {
          product: item.productId,
          location: effectiveLocation,
          quantity: qty,
          unitPrice,
          totalPrice: unitPrice * qty,
        };
      })
    );
    orderItems = computed;
  } else if (productId) {
    const unitPrice = await calcUnitPrice(productId, locationId);
    const qty = quantity || 1;
    orderItems = [{
      product: productId,
      location: locationId || null,
      quantity: qty,
      unitPrice,
      totalPrice: unitPrice * qty,
    }];
  } else {
    throw new AppError('Provide either items array or productId', 400);
  }

  const totalPrice = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);

  const order = await Order.create({
    client: clientId,
    createdBy: req.user._id,
    globalLocation: globalLocationId || null,
    items: orderItems,
    totalPrice,
    status: 'pending',
  });

  // Update client's total debt
  await User.findByIdAndUpdate(clientId, { $inc: { totalDebt: totalPrice } });

  let clientName;
  const clientDoc = await User.findById(clientId).select('name').lean();
  clientName = clientDoc?.name || 'غير معروف';

  const populated = await Order.findById(order._id)
    .populate('client', 'name email')
    .populate('globalLocation', 'placeName')
    .populate('items.product', 'name basePrice')
    .populate('items.location', 'placeName')
    .lean();

  clientName = populated.client?.name || 'غير معروف';
  logAction('ORDER_CREATE', req.user._id, {
    targetType: 'Order',
    targetId: order._id,
    targetDisplay: `طلب #${order._id}`,
    description: `قام ${req.user.name} بإنشاء طلب للزبون ${clientName} بقيمة ${totalPrice.toLocaleString()} دج`,
    details: { clientId: clientId, clientName, totalPrice, itemsCount: orderItems.length, globalLocation: populated.globalLocation?.placeName || null },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: { order: populated }, error: null, source: 'ORDER_CREATE' });
});

exports.getOrders = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.user.role === 'client') {
    filter.client = req.user._id;
  }
  if (req.user.role === 'custom_staff') {
    const { getAssignedClients } = require('../utils/accountantAccess');
    const clients = await getAssignedClients(req.user);
    if (clients !== null) {
      filter.client = { $in: clients.length > 0 ? clients : [] };
    }
  }

  // Query filters
  if (req.query.clientId) {
    filter.client = filter.client?.$in
      ? { $in: filter.client.$in.filter((c) => c.toString() === req.query.clientId) }
      : req.query.clientId;
  }
  if (req.query.productId) {
    filter.$or = [
      { product: req.query.productId },
      { 'items.product': req.query.productId },
    ];
  }
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // Sorting
  const sortBy = req.query.sortBy || 'date';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
  const sort = {};
  if (sortBy === 'amount') sort.totalPrice = sortOrder;
  else sort.createdAt = sortOrder;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('client', 'name email')
      .populate('createdBy', 'name')
      .populate('globalLocation', 'placeName')
      .populate('items.product', 'name basePrice')
      .populate('items.location', 'placeName')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, data: { orders, total, page, totalPages: Math.ceil(total / limit) }, error: null, source: 'ORDER_LIST' });
});

exports.getOrder = catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('client', 'name email')
    .populate('createdBy', 'name')
    .populate('globalLocation', 'placeName')
    .populate('items.product', 'name basePrice')
    .populate('items.location', 'placeName')
    .lean();
  if (!order) throw new AppError('Order not found', 404);
  if (req.user.role === 'client' && order.client._id.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized', 403);
  }
  res.json({ success: true, data: { order }, error: null, source: 'ORDER_GET' });
});

exports.updateOrderStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const oldOrder = await Order.findById(req.params.id).lean();
  if (!oldOrder) throw new AppError('Order not found', 404);
  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }).lean();

  // If cancelled, subtract from client's total debt
  if (status === 'cancelled' && oldOrder.status !== 'cancelled') {
    await User.findByIdAndUpdate(order.client, { $inc: { totalDebt: -order.totalPrice } });
  }
  // If uncancelled (restored), add back to total debt
  if (oldOrder.status === 'cancelled' && status !== 'cancelled') {
    await User.findByIdAndUpdate(order.client, { $inc: { totalDebt: order.totalPrice } });
  }

  logAction('ORDER_STATUS_CHANGE', req.user._id, {
    targetType: 'Order',
    targetId: order._id,
    targetDisplay: `طلب #${order._id}`,
    description: `قام ${req.user.name} بتغيير حالة الطلب #${order._id} من "${oldOrder.status}" إلى "${status}"`,
    details: { oldStatus: oldOrder.status, newStatus: status, totalPrice: order.totalPrice },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { order }, error: null, source: 'ORDER_UPDATE' });
});

exports.deleteOrder = catchAsync(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id).lean();
  if (!order) throw new AppError('Order not found', 404);
  // Subtract from client's total debt
  await User.findByIdAndUpdate(order.client, { $inc: { totalDebt: -order.totalPrice } });
  res.status(200).json({ success: true, data: { message: 'Order deleted' }, error: null, source: 'ORDER_DELETE' });
});

exports.getAccountantOrders = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const { getAssignedClients } = require('../utils/accountantAccess');
  const clients = await getAssignedClients(req.user);
  if (clients === null) {
    // super_admin or unrestricted — show all
  } else if (clients.length === 0) {
    return res.json({ success: true, data: { orders: [], total: 0, page, totalPages: 0 }, error: null, source: 'ORDER_ACCOUNTANT_LIST' });
  }

  const filter = {};
  if (clients !== null) {
    filter.client = { $in: clients };
  }
  if (req.query.clientId) filter.client = { $in: [req.query.clientId] };

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('client', 'name email')
      .populate('globalLocation', 'placeName')
      .populate('items.product', 'name basePrice')
      .populate('items.location', 'placeName')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({ success: true, data: { orders, total, page, totalPages: Math.ceil(total / limit) }, error: null, source: 'ORDER_ACCOUNTANT_LIST' });
});
