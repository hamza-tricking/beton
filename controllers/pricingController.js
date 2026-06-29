const ProductLocationPrice = require('../models/ProductLocationPrice');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { logAction } = require('../services/historyService');

exports.setPrice = catchAsync(async (req, res) => {
  const { productId, locationId, priceOffset } = req.body;
  const existing = await ProductLocationPrice.findOne({ product: productId, location: locationId });
  let pricing;
  if (existing) {
    existing.priceOffset = priceOffset;
    pricing = await existing.save();
  } else {
    pricing = await ProductLocationPrice.create({ product: productId, location: locationId, priceOffset });
  }

  const productPricing = await Product.findById(productId).lean();
  const locationPricing = await Location.findById(locationId).lean();
  const productName = productPricing?.name || 'غير معروف';
  const placeName = locationPricing?.placeName || 'غير معروف';
  logAction('PRICING_SET', req.user._id, {
    targetType: 'ProductLocationPrice',
    targetId: pricing._id,
    targetDisplay: `${productName} @ ${placeName}`,
    description: `قام ${req.user.name} بتحديث تسعير ${productName} في ${placeName} (${priceOffset >= 0 ? '+' : ''}${priceOffset} دج)`,
    details: { productId, productName, locationId, placeName, priceOffset, basePrice: productPricing?.basePrice },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({ success: true, data: { pricing }, error: null, source: 'PRICING_SET' });
});

exports.getProductPrices = catchAsync(async (req, res) => {
  const prices = await ProductLocationPrice.find({ product: req.params.productId })
    .populate('location', 'placeName')
    .lean();
  res.json({ success: true, data: { prices }, error: null, source: 'PRICING_GET' });
});

exports.getAllPricing = catchAsync(async (req, res) => {
  const pricing = await ProductLocationPrice.find()
    .populate('product', 'name basePrice')
    .populate('location', 'placeName')
    .lean();
  res.json({ success: true, data: { pricing }, error: null, source: 'PRICING_ALL' });
});

exports.getProductWithPrices = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.productId).lean();
  if (!product) throw new AppError('Product not found', 404);
  const prices = await ProductLocationPrice.find({ product: req.params.productId })
    .populate('location', 'placeName')
    .lean();
  const enriched = prices.map((p) => ({
    location: p.location,
    priceOffset: p.priceOffset,
    finalPrice: product.basePrice + p.priceOffset,
  }));
  res.json({ success: true, data: { product, prices: enriched }, error: null, source: 'PRICING_PRODUCT' });
});

exports.bulkSetPrices = catchAsync(async (req, res) => {
  const { prices } = req.body;
  const ops = prices.map((p) => ({
    updateOne: {
      filter: { product: p.productId, location: p.locationId },
      update: { $set: { priceOffset: p.priceOffset } },
      upsert: true,
    },
  }));
  await ProductLocationPrice.bulkWrite(ops);

  logAction('PRICING_BULK', req.user._id, {
    targetType: 'ProductLocationPrice',
    targetId: null,
    targetDisplay: `${prices.length} تسعيرة`,
    description: `قام ${req.user.name} بتحديث ${prices.length} تسعيرة بشكل مجمع`,
    details: { count: prices.length, prices: prices.map(p => ({ productId: p.productId, locationId: p.locationId, priceOffset: p.priceOffset })) },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: { message: `${prices.length} prices updated` }, error: null, source: 'PRICING_BULK' });
});
