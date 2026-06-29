const Order = require('../models/Order');
const ProductLocationPrice = require('../models/ProductLocationPrice');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

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
  });

  const populated = await Order.findById(order._id)
    .populate('client', 'name email')
    .populate('globalLocation', 'placeName')
    .populate('items.product', 'name basePrice')
    .populate('items.location', 'placeName')
    .lean();

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
  if (req.user.role === 'custom_staff' && req.user.customRole) {
    const CustomRole = require('../models/CustomRole');
    const role = await CustomRole.findById(req.user.customRole).lean();
    if (role?.canManagePayments && !role.analyticsViewAll && role.analyticsClients?.length) {
      filter.client = { $in: role.analyticsClients };
    }
  }
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('client', 'name email')
      .populate('createdBy', 'name')
      .populate('globalLocation', 'placeName')
      .populate('items.product', 'name basePrice')
      .populate('items.location', 'placeName')
      .sort('-createdAt')
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
  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }).lean();
  if (!order) throw new AppError('Order not found', 404);
  res.json({ success: true, data: { order }, error: null, source: 'ORDER_UPDATE' });
});

exports.deleteOrder = catchAsync(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id).lean();
  if (!order) throw new AppError('Order not found', 404);
  res.status(200).json({ success: true, data: { message: 'Order deleted' }, error: null, source: 'ORDER_DELETE' });
});

exports.getAccountantOrders = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const CustomRole = require('../models/CustomRole');
  const role = await CustomRole.findById(req.user.customRole).lean();
  if (!role || !role.canManagePayments) throw new AppError('Not authorized', 403);

  let clientIds;
  if (role.analyticsViewAll) {
    const User = require('../models/User');
    const clients = await User.find({ role: 'client' }).select('_id').lean();
    clientIds = clients.map(c => c._id);
  } else {
    clientIds = role.analyticsClients || [];
  }

  const filter = { client: { $in: clientIds } };
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
