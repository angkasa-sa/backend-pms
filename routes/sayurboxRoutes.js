const express = require('express');
const router = express.Router();
const {
uploadSayurboxData,
resetUploadState,
getAllSayurboxData,
getSayurboxDataByHub,
getSayurboxDataByDriver,
deleteSayurboxData,
compareDataSayurbox,
getDataInfo
} = require('../controllers/sayurboxController');

const logRequest = (req, res, next) => {
const startTime = Date.now();
console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Start`);

res.on('finish', () => {
const duration = Date.now() - startTime;
console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
});
next();
};

router.use(logRequest);

router.post('/upload/reset', resetUploadState);

router.post('/upload', uploadSayurboxData);

router.get('/data', getAllSayurboxData);

router.get('/data-info', getDataInfo);

router.get('/hub/:hub', getSayurboxDataByHub);

router.get('/driver/:driver', getSayurboxDataByDriver);

router.delete('/data', deleteSayurboxData);

router.post('/compare', compareDataSayurbox);

module.exports = router;