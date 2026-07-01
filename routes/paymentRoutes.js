const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect, authorize, checkPermission } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(paymentController.getPayments)
  .post(authorize('super_admin', 'custom_staff'), checkPermission('canManagePayments'), paymentController.createPayment);

router.get('/filter-options', authorize('super_admin', 'custom_staff'), paymentController.getPaymentFilterOptions);
router.get('/pending', authorize('super_admin', 'custom_staff'), paymentController.getPendingPayments);
router.get('/accountants', authorize('super_admin'), paymentController.getPaymentAccountants);
router.patch('/:id/accept', authorize('super_admin', 'custom_staff'), paymentController.acceptPayment);
router.patch('/:id/reject', authorize('super_admin', 'custom_staff'), paymentController.rejectPayment);

module.exports = router;