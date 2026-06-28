const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize, checkPermission } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(authorize('super_admin'), userController.getUsers)
  .post(authorize('super_admin'), checkPermission('canManageUsers'), userController.createUser);

router.route('/:id')
  .get(authorize('super_admin'), userController.getUser)
  .put(authorize('super_admin'), checkPermission('canManageUsers'), userController.updateUser)
  .delete(authorize('super_admin'), checkPermission('canManageUsers'), userController.deleteUser);

module.exports = router;
