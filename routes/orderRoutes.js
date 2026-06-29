const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, authorize, checkPermission, checkAnyPermission } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(orderController.getOrders)
  .post(authorize('super_admin'), checkPermission('canCreateOrder'), orderController.createOrder);

router.get('/accountant-orders', authorize('super_admin', 'custom_staff'), orderController.getAccountantOrders);

router.get('/:id', orderController.getOrder);
router.patch('/:id/status', authorize('super_admin'), orderController.updateOrderStatus);
router.delete('/:id', authorize('super_admin'), orderController.deleteOrder);

module.exports = router;
