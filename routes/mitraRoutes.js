const express = require("express");
const router = express.Router();

const { 
  uploadMitraData, 
  getAllMitras,
  getMitraDashboardStats,
  getRiderActiveInactiveStats,
  getRiderWeeklyStats,
  getActiveRidersDetails,
  getInactiveRidersDetails,
  updateMitraData, 
  deleteMitraData, 
  deleteMultipleMitraData 
} = require("../controllers/mitraController");

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

const validateMitraData = (req, res, next) => {
  if (req.method === 'POST' && req.url === '/upload') {
    console.log('Validating mitra batch data for upload');

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

    console.log(`Validation passed: ${req.body.length} mitra records`);
  }

  next();
};

const validateDashboardRequest = (req, res, next) => {
  if (req.method === 'POST' && req.url === '/dashboard-stats') {
    console.log('Validating dashboard stats request');

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        message: 'Invalid request: No data provided',
        error: 'Request body with month and year is required',
        success: false
      });
    }

    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        message: 'Invalid request: Missing required fields',
        error: 'Both month and year are required',
        success: false
      });
    }

    if (typeof month !== 'number' || month < 1 || month > 12) {
      return res.status(400).json({
        message: 'Invalid month value',
        error: 'Month must be a number between 1 and 12',
        success: false
      });
    }

    if (typeof year !== 'number' || year < 2000 || year > 2100) {
      return res.status(400).json({
        message: 'Invalid year value',
        error: 'Year must be a valid number',
        success: false
      });
    }

    console.log(`Validation passed: Dashboard stats for ${month}/${year}`);
  }

  next();
};

const validateSingleMitraData = (req, res, next) => {
  if (req.method === 'PUT' && req.url.includes('/data/')) {
    console.log('Validating single mitra data for update');

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        message: 'Invalid request: No data provided',
        error: 'Request body with mitra data is required',
        success: false
      });
    }

    console.log('Validation passed: Single mitra data');
  }

  next();
};

const validateBulkDelete = (req, res, next) => {
  if (req.method === 'DELETE' && req.url === '/data/bulk-delete') {
    console.log('Validating bulk delete request');

    if (!req.body || !req.body.ids) {
      return res.status(400).json({
        message: 'Invalid request: No IDs provided',
        error: 'Array of IDs is required for bulk delete',
        success: false
      });
    }

    if (!Array.isArray(req.body.ids) || req.body.ids.length === 0) {
      return res.status(400).json({
        message: 'Invalid data format: Expected non-empty array of IDs',
        error: 'IDs must be provided as array',
        success: false
      });
    }

    console.log(`Validation passed: ${req.body.ids.length} IDs for bulk delete`);
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
    message = 'Mitra data validation failed';
    errorDetails = err.message;
  } else if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = 'Invalid mitra ID';
    errorDetails = 'Mitra ID format tidak valid';
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    console.error('MongoDB Error Details:', {
      code: err.code,
      codeName: err.codeName,
      keyPattern: err.keyPattern,
      keyValue: err.keyValue
    });

    statusCode = 400;
    message = 'Database operation failed';
    errorDetails = 'Database operation error';
  } else if (err.name === 'MongoTimeoutError') {
    statusCode = 408;
    message = 'Database timeout';
    errorDetails = 'Operation took too long to complete';
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    statusCode = 408;
    message = 'Request timeout';
    errorDetails = 'Operation took too long to complete';
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

router.post("/upload", validateMitraData, handleAsyncErrors(uploadMitraData));

router.get("/data", handleAsyncErrors(getAllMitras));

router.post("/dashboard-stats", validateDashboardRequest, handleAsyncErrors(getMitraDashboardStats));

router.get("/rider-active-inactive-stats", handleAsyncErrors(getRiderActiveInactiveStats));

router.get("/rider-weekly-stats", handleAsyncErrors(getRiderWeeklyStats));

router.get("/active-riders-details", handleAsyncErrors(getActiveRidersDetails));

router.get("/inactive-riders-details", handleAsyncErrors(getInactiveRidersDetails));

router.put("/data/:id", validateSingleMitraData, handleAsyncErrors(updateMitraData));

router.delete("/data/bulk-delete", validateBulkDelete, handleAsyncErrors(deleteMultipleMitraData));

router.delete("/data/:id", handleAsyncErrors(deleteMitraData));

console.log('✅ Mitra routes registered:');
console.log('   - POST /api/mitra/upload');
console.log('   - GET /api/mitra/data');
console.log('   - POST /api/mitra/dashboard-stats');
console.log('   - GET /api/mitra/rider-active-inactive-stats');
console.log('   - GET /api/mitra/rider-weekly-stats');
console.log('   - GET /api/mitra/active-riders-details');
console.log('   - GET /api/mitra/inactive-riders-details');
console.log('   - PUT /api/mitra/data/:id');
console.log('   - DELETE /api/mitra/data/bulk-delete');
console.log('   - DELETE /api/mitra/data/:id');

router.use(handleErrors);

module.exports = router;