const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('super_admin'));

router.get('/', historyController.getHistory);
router.get('/stats', historyController.getHistoryStats);
router.get('/recent', historyController.getRecentHistory);

module.exports = router;
