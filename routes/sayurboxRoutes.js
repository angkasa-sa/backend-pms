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
const requestId = `${req.method}_${req.originalUrl}_${Date.now()}`;

console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Request ID: ${requestId}`);
console.log(`Request body size: ${JSON.stringify(req.body).length} bytes`);

req.requestId = requestId;

res.on('finish', () => {
const duration = Date.now() - startTime;
console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms) - ID: ${requestId}`);
});
next();
};

const validateBatchData = (req, res, next) => {
if (req.method === 'POST' && (req.url === '/upload' || req.url === '/')) {
console.log(`Validating batch data for ${req.method} ${req.url}`);
console.log(`Request body type: ${typeof req.body}, isArray: ${Array.isArray(req.body)}`);

if (!Array.isArray(req.body)) {
console.error('Validation failed: Data is not an array');
return res.status(400).json({
message: 'Invalid data format: Expected array',
error: 'Data must be an array of objects',
received: typeof req.body
});
}

if (req.body.length === 0) {
console.error('Validation failed: Empty data array');
return res.status(400).json({
message: 'Empty data array',
error: 'At least one record is required'
});
}

const requiredFields = ['order_no', 'driver_name', 'hub_name'];
const firstRecord = req.body[0];
const missingFields = requiredFields.filter(field => !firstRecord[field]);

if (missingFields.length > 0) {
console.error(`Validation failed: Missing required fields: ${missingFields.join(', ')}`);
return res.status(400).json({
message: `Missing required fields: ${missingFields.join(', ')}`,
error: 'Each record must contain order_no, driver_name, and hub_name',
firstRecord: firstRecord
});
}

console.log(`Validation passed: ${req.body.length} records with required fields`);
}
next();
};

const handleErrors = (err, req, res, next) => {
const errorId = `ERROR_${Date.now()}`;
console.error(`[${new Date().toISOString()}] Error ID: ${errorId} in ${req.method} ${req.originalUrl}:`, err.message);
console.error(`Error stack:`, err.stack);

if (err.name === 'ValidationError') {
return res.status(400).json({
message: 'Data validation failed',
error: err.message,
errorId: errorId
});
}

if (err.name === 'MongoError' || err.name === 'MongoServerError') {
console.error('MongoDB Error Details:', {
code: err.code,
codeName: err.codeName,
keyPattern: err.keyPattern,
keyValue: err.keyValue
});
return res.status(500).json({
message: 'Database operation failed',
error: 'Internal server error',
errorId: errorId
});
}

if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
return res.status(408).json({
message: 'Request timeout',
error: 'Operation took too long to complete',
errorId: errorId
});
}

res.status(500).json({
message: 'Internal server error',
error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
errorId: errorId
});
};

router.use(logRequest);
router.use(validateBatchData);

router.post('/reset', resetUploadState);

router.post('/upload', uploadSayurboxData);

router.post('/', uploadSayurboxData);

router.get('/data', getAllSayurboxData);

router.get('/data-info', getDataInfo);

router.get('/hub/:hub', getSayurboxDataByHub);

router.get('/driver/:driver', getSayurboxDataByDriver);

router.delete('/data', deleteSayurboxData);

router.post('/compare', compareDataSayurbox);

router.use(handleErrors);

module.exports = router;