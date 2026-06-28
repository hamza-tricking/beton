const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize, checkPermission } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(productController.getProducts)
  .post(authorize('super_admin'), checkPermission('canCreateProduct'), productController.createProduct);

router.route('/:id')
  .get(productController.getProduct)
  .put(authorize('super_admin'), checkPermission('canCreateProduct'), productController.updateProduct)
  .delete(authorize('super_admin'), checkPermission('canCreateProduct'), productController.deleteProduct);

module.exports = router;
