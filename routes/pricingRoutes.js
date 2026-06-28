const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricingController');
const { protect, authorize, checkPermission } = require('../middleware/auth');

router.use(protect);

router.get('/all', pricingController.getAllPricing);

router.post('/set', authorize('super_admin'), checkPermission('canCreateProduct'), pricingController.setPrice);
router.post('/bulk', authorize('super_admin'), checkPermission('canCreateProduct'), pricingController.bulkSetPrices);
router.get('/product/:productId', pricingController.getProductWithPrices);
router.get('/product/:productId/prices', pricingController.getProductPrices);

module.exports = router;
