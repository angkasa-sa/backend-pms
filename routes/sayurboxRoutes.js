const express = require('express');
const router = express.Router();
const {
  uploadSayurboxData,
  appendSayurboxData,
  getAllSayurboxData,
  getSayurboxDataByHub,
  getSayurboxDataByDriver,
  deleteSayurboxData,
  compareDataSayurbox,
  getDataInfo
} = require('../controllers/sayurboxController');

router.post('/upload', uploadSayurboxData);

router.post('/append', appendSayurboxData);

router.get('/data', getAllSayurboxData);

router.get('/data-info', getDataInfo);

router.get('/hub/:hub', getSayurboxDataByHub);

router.get('/driver/:driver', getSayurboxDataByDriver);

router.delete('/data', deleteSayurboxData);

router.post('/compare', compareDataSayurbox);

module.exports = router;