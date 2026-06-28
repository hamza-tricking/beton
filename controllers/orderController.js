const Order = require('../models/Order');
const ProductLocationPrice = require('../models/ProductLocationPrice');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createOrder = catchAsync(async (req, res) => {
  const { clientId, productId, locationId, quantity } = req.body;
  const product = await Product.findById(productId).lean();
  if (!product) throw new AppError('Product not found', 404);
  const pricing = await ProductLocationPrice.findOne({ product: productId, location: locationId }).lean();
  const unitPrice = product.basePrice + (pricing?.priceOffset || 0);
  const totalPrice = unitPrice * (quantity || 1);
  const order = await Order.create({
    client: clientId,
    createdBy: req.user._id,
    product: productId,
    location: locationId,
    quantity: quantity || 1,
    unitPrice,
    totalPrice,
  });
  const populated = await Order.findById(order._id)
    .populate('client', 'name email')
    .populate('product', 'name basePrice')
    .populate('location', 'placeName')
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
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('client', 'name email')
      .populate('createdBy', 'name')
      .populate('product', 'name basePrice')
      .populate('location', 'placeName')
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
    .populate('product', 'name basePrice')
    .populate('location', 'placeName')
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
  res.json({ success: true, data: { message: 'Order deleted' }, error: null, source: 'ORDER_DELETE' });
});
