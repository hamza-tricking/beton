const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createProduct = catchAsync(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json({ success: true, data: { product }, error: null, source: 'PRODUCT_CREATE' });
});

exports.getProducts = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find().sort('-createdAt').skip(skip).limit(limit).lean(),
    Product.countDocuments(),
  ]);
  res.json({ success: true, data: { products, total, page, totalPages: Math.ceil(total / limit) }, error: null, source: 'PRODUCT_LIST' });
});

exports.getProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw new AppError('Product not found', 404);
  res.json({ success: true, data: { product }, error: null, source: 'PRODUCT_GET' });
});

exports.updateProduct = catchAsync(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
  if (!product) throw new AppError('Product not found', 404);
  res.json({ success: true, data: { product }, error: null, source: 'PRODUCT_UPDATE' });
});

exports.deleteProduct = catchAsync(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id).lean();
  if (!product) throw new AppError('Product not found', 404);
  res.json({ success: true, data: { message: 'Product deleted' }, error: null, source: 'PRODUCT_DELETE' });
});
