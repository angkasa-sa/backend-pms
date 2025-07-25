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

const validateBatchData = (req, res, next) => {
if (req.method === 'POST' && req.url === '/') {
if (!Array.isArray(req.body)) {
return res.status(400).json({
message: 'Invalid data format: Expected array',
error: 'Data must be an array of objects'
});
}

if (req.body.length === 0) {
return res.status(400).json({
message: 'Empty data array',
error: 'At least one record is required'
});
}

const requiredFields = ['order_no', 'driver_name', 'hub_name'];
const firstRecord = req.body[0];
const missingFields = requiredFields.filter(field => !firstRecord[field]);

if (missingFields.length > 0) {
return res.status(400).json({
message: `Missing required fields: ${missingFields.join(', ')}`,
error: 'Each record must contain order_no, driver_name, and hub_name'
});
}
}
next();
};

const handleErrors = (err, req, res, next) => {
console.error(`[${new Date().toISOString()}] Error in ${req.method} ${req.originalUrl}:`, err.message);

if (err.name === 'ValidationError') {
return res.status(400).json({
message: 'Data validation failed',
error: err.message
});
}

if (err.name === 'MongoError' || err.name === 'MongoServerError') {
return res.status(500).json({
message: 'Database operation failed',
error: 'Internal server error'
});
}

if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
return res.status(408).json({
message: 'Request timeout',
error: 'Operation took too long to complete'
});
}

res.status(500).json({
message: 'Internal server error',
error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
});
};

router.use(logRequest);
router.use(validateBatchData);

router.post('/reset', resetUploadState);

router.post('/', uploadSayurboxData);

router.get('/data', getAllSayurboxData);

router.get('/data-info', getDataInfo);

router.get('/hub/:hub', getSayurboxDataByHub);

router.get('/driver/:driver', getSayurboxDataByDriver);

router.delete('/data', deleteSayurboxData);

router.post('/compare', compareDataSayurbox);

router.use(handleErrors);

module.exports = router;