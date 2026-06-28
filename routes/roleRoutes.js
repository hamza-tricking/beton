const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('super_admin'));

router.route('/')
  .post(roleController.createRole)
  .get(roleController.getRoles);

router.route('/:id')
  .get(roleController.getRole)
  .put(roleController.updateRole)
  .delete(roleController.deleteRole);

module.exports = router;
