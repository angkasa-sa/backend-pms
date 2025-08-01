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
  
  if (req.body && typeof req.body === 'object') {
    if (Array.isArray(req.body)) {
      console.log(`Request body: Array with ${req.body.length} items`);
    } else {
      console.log(`Request body size: ${JSON.stringify(req.body).length} bytes`);
    }
  }

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
    
    if (!req.body) {
      console.error('Validation failed: No request body');
      return res.status(400).json({
        message: 'Invalid request: No data provided',
        error: 'Request body is required',
        success: false
      });
    }

    if (!Array.isArray(req.body)) {
      console.error('Validation failed: Data is not an array');
      console.error('Received data type:', typeof req.body);
      return res.status(400).json({
        message: 'Invalid data format: Expected array',
        error: 'Data must be an array of objects',
        received: typeof req.body,
        success: false
      });
    }

    if (req.body.length === 0) {
      console.error('Validation failed: Empty data array');
      return res.status(400).json({
        message: 'Empty data array',
        error: 'At least one record is required',
        success: false
      });
    }

    const requiredFields = ['order_no', 'driver_name', 'hub_name'];
    const firstRecord = req.body[0];
    
    if (!firstRecord || typeof firstRecord !== 'object') {
      console.error('Validation failed: Invalid first record');
      return res.status(400).json({
        message: 'Invalid record format',
        error: 'Each record must be an object',
        success: false
      });
    }

    const missingFields = requiredFields.filter(field => !firstRecord[field]);

    if (missingFields.length > 0) {
      console.error(`Validation failed: Missing required fields: ${missingFields.join(', ')}`);
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(', ')}`,
        error: 'Each record must contain order_no, driver_name, and hub_name',
        firstRecord: firstRecord,
        success: false
      });
    }

    console.log(`Validation passed: ${req.body.length} records with required fields`);
  }
  
  next();
};

const handleAsyncErrors = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const handleErrors = (err, req, res, next) => {
  const errorId = `ERROR_${Date.now()}`;
  const timestamp = new Date().toISOString();
  
  console.error(`[${timestamp}] Error ID: ${errorId} in ${req.method} ${req.originalUrl}:`);
  console.error(`Error message: ${err.message}`);
  console.error(`Error stack: ${err.stack}`);

  let statusCode = 500;
  let message = 'Internal server error';
  let errorDetails = process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Data validation failed';
    errorDetails = err.message;
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    console.error('MongoDB Error Details:', {
      code: err.code,
      codeName: err.codeName,
      keyPattern: err.keyPattern,
      keyValue: err.keyValue
    });
    
    if (err.code === 11000) {
      statusCode = 409;
      message = 'Duplicate data found';
      errorDetails = 'Some records already exist in database';
    } else {
      message = 'Database operation failed';
      errorDetails = 'Internal database error';
    }
  } else if (err.name === 'MongoTimeoutError') {
    statusCode = 408;
    message = 'Database timeout';
    errorDetails = 'Operation took too long to complete';
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    statusCode = 408;
    message = 'Request timeout';
    errorDetails = 'Operation took too long to complete';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data type';
    errorDetails = 'Invalid data format provided';
  }

  res.status(statusCode).json({
    message: message,
    error: errorDetails,
    errorId: errorId,
    timestamp: timestamp,
    success: false
  });
};

router.use(logRequest);

router.post('/reset', handleAsyncErrors(resetUploadState));

router.post('/upload', validateBatchData, handleAsyncErrors(uploadSayurboxData));

router.post('/', validateBatchData, handleAsyncErrors(uploadSayurboxData));

router.get('/data', handleAsyncErrors(getAllSayurboxData));

router.get('/data-info', handleAsyncErrors(getDataInfo));

router.get('/hub/:hub', handleAsyncErrors(getSayurboxDataByHub));

router.get('/driver/:driver', handleAsyncErrors(getSayurboxDataByDriver));

router.delete('/data', handleAsyncErrors(deleteSayurboxData));

router.post('/compare', handleAsyncErrors(compareDataSayurbox));

router.use(handleErrors);

module.exports = router;