const ProductLocationPrice = require('../models/ProductLocationPrice');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

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
  res.json({ success: true, data: { message: `${prices.length} prices updated` }, error: null, source: 'PRICING_BULK' });
});
