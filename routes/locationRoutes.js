const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(locationController.getLocations)
  .post(authorize('super_admin'), locationController.createLocation);

router.route('/:id')
  .get(locationController.getLocation)
  .put(authorize('super_admin'), locationController.updateLocation)
  .delete(authorize('super_admin'), locationController.deleteLocation);

module.exports = router;
