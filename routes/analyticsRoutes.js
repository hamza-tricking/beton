const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect, authorize, checkPermission } = require('../middleware/auth');

router.get('/dashboard', protect, authorize('super_admin'), checkPermission('canViewAnalytics'), analyticsController.getDashboard);
router.get('/orders/status/:status', protect, authorize('super_admin'), checkPermission('canViewAnalytics'), analyticsController.getOrdersByStatus);
router.get('/orders/location/:locationId', protect, authorize('super_admin'), checkPermission('canViewAnalytics'), analyticsController.getOrdersByLocation);
router.get('/filter-options', protect, authorize('super_admin'), checkPermission('canViewAnalytics'), analyticsController.getFilterOptions);

module.exports = router;
