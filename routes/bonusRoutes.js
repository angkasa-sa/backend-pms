const express = require('express');
const router = express.Router();
const {
  uploadBonusData,
  getAllBonusData,
  getBonusDataByHub,
  deleteBonusData
} = require('../controllers/bonusController');

// POST /api/bonus/upload - Upload driver bonus data
router.post('/upload', uploadBonusData);

// GET /api/bonus/data - Get all bonus data
router.get('/data', getAllBonusData);

// GET /api/bonus/hub/:hub - Get bonus data by hub
router.get('/hub/:hub', getBonusDataByHub);

// DELETE /api/bonus/data - Delete all bonus data
router.delete('/data', deleteBonusData);

module.exports = router;