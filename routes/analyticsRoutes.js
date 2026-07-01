const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect, authorize, checkPermission } = require('../middleware/auth');

router.get('/dashboard', protect, authorize('super_admin', 'custom_staff'), checkPermission('canViewAnalytics'), analyticsController.getDashboard);
router.get('/orders/status/:status', protect, authorize('super_admin', 'custom_staff'), checkPermission('canViewAnalytics'), analyticsController.getOrdersByStatus);
router.get('/orders/location/:locationId', protect, authorize('super_admin', 'custom_staff'), checkPermission('canViewAnalytics'), analyticsController.getOrdersByLocation);
router.get('/orders/client-debt/:clientId', protect, authorize('super_admin', 'custom_staff'), checkPermission('canViewAnalytics'), analyticsController.getOrdersByClientDebt);
router.get('/filter-options', protect, authorize('super_admin', 'custom_staff'), analyticsController.getFilterOptions);

module.exports = router;
