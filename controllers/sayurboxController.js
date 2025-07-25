const SayurboxData = require("../models/SayurboxData");
const ExcelData = require("../models/ExcelData");

const BATCH_SIZE = 3000;
const COMPARE_BATCH_SIZE = 500;
const DISPLAY_LIMIT = 50;

const WEIGHT_CONFIG = {
  THRESHOLD: 0.30,
  BASE: 10,
  CHARGE_RATE: 400
};

const DISTANCE_CONFIG = {
  THRESHOLD: 0.30
};

const calculateWeightMetrics = (weight) => {
  const numericWeight = Number(weight) || 0;
  const integerPart = Math.floor(numericWeight);
  const decimalPart = numericWeight - integerPart;

  const roundDown = numericWeight < 1 ? 0 : integerPart;
  const roundUp = decimalPart > WEIGHT_CONFIG.THRESHOLD ? integerPart + 1 : integerPart;
  const weightDecimal = Number((numericWeight - roundDown).toFixed(2));
  const addCharge1 = roundUp < WEIGHT_CONFIG.BASE ? 0 : (roundUp - WEIGHT_CONFIG.BASE) * WEIGHT_CONFIG.CHARGE_RATE;

  return {
    weight: numericWeight.toFixed(2),
    roundDown,
    roundUp,
    weightDecimal,
    addCharge1: addCharge1.toString()
  };
};

const calculateDistanceMetrics = (distance) => {
  const distanceVal = Number(distance) || 0;
  const integerPart = Math.floor(distanceVal);
  const decimalPart = distanceVal - integerPart;

  const roundDown = distanceVal < 1 ? 0 : integerPart;
  const roundUp = decimalPart > DISTANCE_CONFIG.THRESHOLD ? integerPart + 1 : integerPart;

  return {
    distance: distanceVal,
    roundDownDistance: roundDown,
    roundUpDistance: roundUp
  };
};

const validateRequiredFields = (item, index) => {
  const requiredFields = ['order_no', 'hub_name', 'driver_name'];
  const missingFields = requiredFields.filter(field => !item[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Record ${index + 1}: ${missingFields.join(', ')} wajib diisi`);
  }
};

const transformSayurboxItem = (item) => ({
  orderNo: String(item.order_no).trim(),
  timeSlot: String(item.time_slot || '').trim(),
  channel: String(item.channel || '').trim(),
  deliveryDate: String(item.delivery_date || '').trim(),
  driverName: String(item.driver_name).trim(),
  hubName: String(item.hub_name).trim(),
  shippedAt: String(item.shipped_at || '').trim(),
  deliveredAt: String(item.delivered_at || '').trim(),
  puOrder: String(item.pu_order || '').trim(),
  timeSlotStart: String(item.time_slot_start || '').trim(),
  latePickupMinute: parseFloat(item.late_pickup_minute) || 0,
  puAfterTsMinute: parseFloat(item.pu_after_ts_minute) || 0,
  timeSlotEnd: String(item.time_slot_end || '').trim(),
  lateDeliveryMinute: parseFloat(item.late_delivery_minute) || 0,
  isOntime: item.is_ontime === true || item.is_ontime === 'true' || item.is_ontime === '1',
  distanceInKm: parseFloat(item.distance_in_km) || 0,
  totalWeightPerorder: parseFloat(item.total_weight_perorder) || 0,
  paymentMethod: String(item.payment_method || '').trim(),
  monthly: String(item.Monthly || '').trim()
});

const transformSayurboxData = (dataArray) => {
  return dataArray.map((item, index) => {
    validateRequiredFields(item, index);
    return transformSayurboxItem(item);
  });
};

const createUploadState = () => ({
  isInitialized: false,
  totalProcessed: 0,
  reset() {
    this.isInitialized = false;
    this.totalProcessed = 0;
    console.log('Upload state reset');
  }
});

const uploadState = createUploadState();

const logBatchOperation = (operation, batchNum, totalBatches, count, total = null) => {
  const message = total 
    ? `${operation} batch ${batchNum}/${totalBatches} (${count} records): ${total} total`
    : `${operation} batch ${batchNum}/${totalBatches} (${count} records)`;
  console.log(message);
};

const handleBatchInsert = async (batch, batchNum, totalBatches) => {
  logBatchOperation('Inserting', batchNum, totalBatches, batch.length);

  try {
    const insertResult = await SayurboxData.insertMany(batch, { 
      ordered: false,
      rawResult: false 
    });

    const insertedCount = Array.isArray(insertResult) ? insertResult.length : insertResult.insertedCount || 0;
    logBatchOperation('Completed', batchNum, totalBatches, insertedCount, batch.length);

    return {
      batchNum,
      inserted: insertedCount,
      records: batch.length,
      success: true
    };
  } catch (insertError) {
    console.error(`Batch ${batchNum} insert failed:`, insertError.message);

    if (insertError.code === 11000) {
      const partialInsert = insertError.result?.result?.nInserted || 0;
      console.warn(`Duplicate key error in batch ${batchNum}, continuing with ${partialInsert} inserts...`);
      
      return {
        batchNum,
        inserted: partialInsert,
        records: batch.length,
        error: 'Partial insert due to duplicates',
        success: true
      };
    }

    throw new Error(`Database insert failed at batch ${batchNum}: ${insertError.message}`);
  }
};

const processBatchInserts = async (transformedData) => {
  let totalInserted = 0;
  const insertResults = [];

  const totalBatches = Math.ceil(transformedData.length / BATCH_SIZE);

  for (let i = 0; i < transformedData.length; i += BATCH_SIZE) {
    const batch = transformedData.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const result = await handleBatchInsert(batch, batchNum, totalBatches);
    
    totalInserted += result.inserted;
    insertResults.push(result);
  }

  return { totalInserted, insertResults };
};

const createUploadResponse = (totalInserted, processedRecords, sessionTotal, databaseTotal, duration, insertResults) => ({
  message: "Data sayurbox berhasil disimpan ke database",
  count: totalInserted,
  summary: {
    totalRecords: totalInserted,
    processedRecords,
    sessionTotal,
    databaseTotal,
    success: true,
    duration: `${duration}ms`,
    insertResults
  }
});

const createErrorResponse = (message, error, duration) => ({
  message,
  error: error.message,
  duration: `${duration}ms`
});

const resetUploadState = async (req, res) => {
  try {
    uploadState.reset();
    console.log('Upload state has been reset manually');
    
    res.status(200).json({ 
      message: "Upload state reset successfully",
      success: true 
    });
  } catch (error) {
    console.error("Reset upload state error:", error.message);
    res.status(500).json({ 
      message: "Reset upload state failed", 
      error: error.message 
    });
  }
};

const uploadSayurboxData = async (req, res) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting sayurbox data upload...`);

  try {
    const dataArray = req.body;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      console.error("Invalid data format received");
      return res.status(400).json({ 
        message: "Data sayurbox tidak valid atau kosong",
        error: "Expected non-empty array"
      });
    }

    console.log(`Processing batch with ${dataArray.length} records...`);
    console.log(`Upload state initialized: ${uploadState.isInitialized}`);

    if (!uploadState.isInitialized) {
      console.log("First batch detected - clearing existing sayurbox data");
      const deleteResult = await SayurboxData.deleteMany({});
      console.log(`Deleted ${deleteResult.deletedCount} existing sayurbox records`);
      uploadState.isInitialized = true;
    }

    let transformedData;
    try {
      transformedData = transformSayurboxData(dataArray);
      console.log(`Data transformation completed: ${transformedData.length} valid records`);
    } catch (transformError) {
      console.error("Data transformation failed:", transformError.message);
      return res.status(400).json({
        message: "Data validation failed",
        error: transformError.message
      });
    }

    const { totalInserted, insertResults } = await processBatchInserts(transformedData);

    uploadState.totalProcessed += totalInserted;
    const duration = Date.now() - startTime;

    console.log(`Batch upload completed successfully:`);
    console.log(`- Records processed: ${transformedData.length}`);
    console.log(`- Records inserted: ${totalInserted}`);
    console.log(`- Total processed in session: ${uploadState.totalProcessed}`);
    console.log(`- Duration: ${duration}ms`);

    const currentCount = await SayurboxData.countDocuments();
    console.log(`Current total records in database: ${currentCount}`);

    const response = createUploadResponse(
      totalInserted, 
      transformedData.length, 
      uploadState.totalProcessed, 
      currentCount, 
      duration, 
      insertResults
    );

    res.status(201).json(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Upload sayurbox failed after ${duration}ms:`, error.message);
    console.error("Error stack:", error.stack);

    res.status(500).json(createErrorResponse("Upload data sayurbox gagal", error, duration));
  }
};

const createDataQuery = (page, limit) => {
  const skip = limit > 0 ? (page - 1) * limit : 0;
  
  const query = SayurboxData.find()
    .sort({ hubName: 1, driverName: 1, deliveryDate: -1 })
    .lean();

  if (limit > 0) {
    query.skip(skip).limit(parseInt(limit));
  }

  return query;
};

const createPaginatedResponse = (data, total, page, limit, message) => {
  const response = {
    message,
    count: data.length,
    total,
    data
  };

  if (limit > 0) {
    response.page = parseInt(page);
    response.totalPages = Math.ceil(total / limit);
  }

  return response;
};

const getAllSayurboxData = async (req, res) => {
  try {
    const { page = 1, limit = 0 } = req.query;

    console.log(`Fetching sayurbox data - page: ${page}, limit: ${limit}`);

    const query = createDataQuery(page, limit);
    const [data, total] = await Promise.all([
      query,
      SayurboxData.countDocuments()
    ]);

    console.log(`Sayurbox data fetched: ${data.length} records, Total in DB: ${total}`);

    const response = createPaginatedResponse(data, total, page, limit, "Data sayurbox berhasil diambil");
    res.status(200).json(response);
  } catch (error) {
    console.error("Get sayurbox error:", error.message);
    res.status(500).json({ 
      message: "Gagal mengambil data sayurbox", 
      error: error.message 
    });
  }
};

const createFilterQuery = (field, value) => ({
  [field]: { $regex: new RegExp(value, "i") }
});

const getSayurboxDataByFilter = async (req, res, filterField, filterValue, filterName) => {
  try {
    const { page = 1, limit = 1000 } = req.query;
    const skip = (page - 1) * limit;

    console.log(`Mencari data sayurbox untuk ${filterName}: ${filterValue}`);

    const filterQuery = createFilterQuery(filterField, filterValue);
    const sortQuery = filterField === 'hubName' 
      ? { driverName: 1, deliveryDate: -1 }
      : { deliveryDate: -1, hubName: 1 };

    const data = await SayurboxData.find(filterQuery)
      .sort(sortQuery)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await SayurboxData.countDocuments(filterQuery);

    console.log(`Jumlah data sayurbox ditemukan untuk ${filterName} ${filterValue}: ${total}`);

    res.status(200).json({
      message: `Data sayurbox untuk ${filterName} ${filterValue} berhasil diambil`,
      count: data.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    console.error(`Get sayurbox by ${filterName} error:`, error.message);
    res.status(500).json({ 
      message: `Gagal mengambil data sayurbox berdasarkan ${filterName}`, 
      error: error.message 
    });
  }
};

const getSayurboxDataByHub = async (req, res) => {
  const hub = req.params.hub;
  await getSayurboxDataByFilter(req, res, 'hubName', hub, 'hub');
};

const getSayurboxDataByDriver = async (req, res) => {
  const driver = req.params.driver;
  await getSayurboxDataByFilter(req, res, 'driverName', driver, 'driver');
};

const deleteSayurboxData = async (req, res) => {
  try {
    const result = await SayurboxData.deleteMany({});
    uploadState.reset();

    console.log(`Deleted ${result.deletedCount} sayurbox records`);

    res.status(200).json({
      message: "Semua data sayurbox berhasil dihapus",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Delete sayurbox error:", error.message);
    res.status(500).json({ 
      message: "Gagal menghapus data sayurbox", 
      error: error.message 
    });
  }
};

const getDataInfo = async (req, res) => {
  try {
    const [sayurboxCount, excelCount] = await Promise.all([
      SayurboxData.countDocuments(),
      ExcelData.countDocuments()
    ]);

    res.status(200).json({
      sayurboxCount,
      excelCount,
      estimatedMatches: Math.min(sayurboxCount, excelCount),
      uploadState: {
        isInitialized: uploadState.isInitialized,
        totalProcessed: uploadState.totalProcessed
      }
    });
  } catch (error) {
    console.error("Get data info error:", error.message);
    res.status(500).json({ 
      message: "Gagal mengambil info data", 
      error: error.message 
    });
  }
};

const validateDataForComparison = async () => {
  const [sayurboxCount, excelCount] = await Promise.all([
    SayurboxData.countDocuments(),
    ExcelData.countDocuments()
  ]);

  if (sayurboxCount === 0) {
    throw new Error("Tidak ada data Sayurbox untuk dibandingkan. Silakan upload data Sayurbox terlebih dahulu.");
  }

  if (excelCount === 0) {
    throw new Error("Tidak ada data Excel untuk dibandingkan. Silakan upload data Excel terlebih dahulu.");
  }

  return { sayurboxCount, excelCount };
};

const createSayurboxMap = (sayurboxData) => {
  const sayurboxMap = new Map();
  const sayurboxOrderNos = new Set();

  sayurboxData.forEach(item => {
    if (item.orderNo) {
      sayurboxMap.set(item.orderNo, {
        totalWeightPerorder: item.totalWeightPerorder,
        distanceInKm: item.distanceInKm
      });
      sayurboxOrderNos.add(item.orderNo);
    }
  });

  return { sayurboxMap, sayurboxOrderNos };
};

const processBatchComparison = async (excelBatch, sayurboxMap, session) => {
  const bulkOps = [];
  let batchChecked = 0;
  let batchMatched = 0;
  const batchUnmatchedExcel = [];
  const batchProcessedExcel = new Set();

  for (const excelItem of excelBatch) {
    batchChecked++;
    const orderCode = excelItem["Order Code"];

    if (orderCode) {
      batchProcessedExcel.add(orderCode);

      if (sayurboxMap.has(orderCode)) {
        const sayurboxItem = sayurboxMap.get(orderCode);
        batchMatched++;

        const weightMetrics = calculateWeightMetrics(sayurboxItem.totalWeightPerorder);
        const distanceMetrics = calculateDistanceMetrics(sayurboxItem.distanceInKm);

        bulkOps.push({
          updateOne: {
            filter: { _id: excelItem._id },
            update: {
              $set: {
                Weight: weightMetrics.weight,
                RoundDown: weightMetrics.roundDown,
                RoundUp: weightMetrics.roundUp,
                WeightDecimal: weightMetrics.weightDecimal,
                "Add Charge 1": weightMetrics.addCharge1,
                Distance: distanceMetrics.distance,
                "RoundDown Distance": distanceMetrics.roundDownDistance,
                "RoundUp Distance": distanceMetrics.roundUpDistance
              }
            }
          }
        });
      } else {
        batchUnmatchedExcel.push(orderCode);
      }
    }
  }

  let batchUpdated = 0;
  if (bulkOps.length > 0) {
    const result = await ExcelData.bulkWrite(bulkOps, { session });
    batchUpdated = result.modifiedCount;
  }

  return {
    batchChecked,
    batchMatched,
    batchUpdated,
    batchUnmatchedExcel,
    batchProcessedExcel
  };
};

const createComparisonSummary = (totalChecked, totalUpdated, matchedRecords, unmatchedExcelCodes, unmatchedSayurboxCodes, duration) => ({
  totalChecked,
  totalUpdated,
  matchedRecords,
  notMatchedRecords: totalChecked - matchedRecords,
  unmatchedExcelCount: unmatchedExcelCodes.length,
  unmatchedSayurboxCount: unmatchedSayurboxCodes.length,
  processingTime: `${duration}ms`,
  success: true
});

const createComparisonResponse = (summary, unmatchedExcelCodes, unmatchedSayurboxCodes, duration) => ({
  message: `Data comparison completed successfully in ${duration}ms`,
  summary,
  unmatchedExcelCodes: unmatchedExcelCodes.slice(0, DISPLAY_LIMIT),
  unmatchedSayurboxCodes: unmatchedSayurboxCodes.slice(0, DISPLAY_LIMIT),
  displayInfo: {
    excelDisplayed: Math.min(unmatchedExcelCodes.length, DISPLAY_LIMIT),
    excelTotal: unmatchedExcelCodes.length,
    sayurboxDisplayed: Math.min(unmatchedSayurboxCodes.length, DISPLAY_LIMIT),
    sayurboxTotal: unmatchedSayurboxCodes.length,
    displayLimit: DISPLAY_LIMIT
  }
});

const handleComparisonError = (error, duration) => {
  let errorMessage = error.message;
  let statusCode = 500;

  if (error.message.includes('Sayurbox data empty') || error.message.includes('Excel data empty')) {
    statusCode = 400;
  } else if (error.name === 'MongoTimeoutError') {
    errorMessage = 'Database timeout - proses compare membutuhkan waktu lama. Silakan coba lagi.';
  } else if (error.name === 'MongoNetworkError') {
    errorMessage = 'Database connection error. Silakan coba lagi.';
  }

  return {
    statusCode,
    response: {
      message: "Compare data gagal",
      error: errorMessage,
      duration: `${duration}ms`,
      success: false
    }
  };
};

const compareDataSayurbox = async (req, res) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting data comparison process...`);

  try {
    const { sayurboxCount, excelCount } = await validateDataForComparison();
    console.log(`Found ${sayurboxCount} Sayurbox records and ${excelCount} Excel records`);

    const session = await ExcelData.db.startSession();
    session.startTransaction();

    try {
      const sayurboxData = await SayurboxData.find({}, { 
        orderNo: 1, 
        totalWeightPerorder: 1, 
        distanceInKm: 1 
      }).lean();

      console.log(`Retrieved ${sayurboxData.length} Sayurbox records for comparison`);

      const { sayurboxMap, sayurboxOrderNos } = createSayurboxMap(sayurboxData);

      let totalUpdated = 0;
      let totalChecked = 0;
      let matchedRecords = 0;
      let unmatchedExcelCodes = [];
      const processedExcelCodes = new Set();

      console.log(`Processing Excel data in batches of ${COMPARE_BATCH_SIZE}...`);

      for (let skip = 0; skip < excelCount; skip += COMPARE_BATCH_SIZE) {
        const excelBatch = await ExcelData.find({}, { "Order Code": 1, Weight: 1, Distance: 1 })
          .skip(skip)
          .limit(COMPARE_BATCH_SIZE)
          .lean();

        const batchResult = await processBatchComparison(excelBatch, sayurboxMap, session);
        
        totalChecked += batchResult.batchChecked;
        matchedRecords += batchResult.batchMatched;
        totalUpdated += batchResult.batchUpdated;
        unmatchedExcelCodes.push(...batchResult.batchUnmatchedExcel);
        
        batchResult.batchProcessedExcel.forEach(code => processedExcelCodes.add(code));

        console.log(`Batch processed: ${batchResult.batchMatched} matches found, ${batchResult.batchUpdated} updated`);

        if (skip + COMPARE_BATCH_SIZE < excelCount) {
          console.log(`Processed ${skip + COMPARE_BATCH_SIZE}/${excelCount} Excel records...`);
        }
      }

      const unmatchedSayurboxCodes = Array.from(sayurboxOrderNos).filter(orderNo => 
        !processedExcelCodes.has(orderNo)
      );

      await session.commitTransaction();

      const duration = Date.now() - startTime;

      console.log(`Comparison completed successfully in ${duration}ms:`);
      console.log(`- Total checked: ${totalChecked}`);
      console.log(`- Total updated: ${totalUpdated}`);
      console.log(`- Matched records: ${matchedRecords}`);
      console.log(`- Unmatched Excel codes: ${unmatchedExcelCodes.length}`);
      console.log(`- Unmatched Sayurbox codes: ${unmatchedSayurboxCodes.length}`);

      const summary = createComparisonSummary(
        totalChecked, 
        totalUpdated, 
        matchedRecords, 
        unmatchedExcelCodes, 
        unmatchedSayurboxCodes, 
        duration
      );

      const response = createComparisonResponse(summary, unmatchedExcelCodes, unmatchedSayurboxCodes, duration);
      res.status(200).json(response);

    } catch (transactionError) {
      await session.abortTransaction();
      throw transactionError;
    } finally {
      session.endSession();
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Compare data failed after ${duration}ms:`, error.message);
    console.error("Error stack:", error.stack);

    const { statusCode, response } = handleComparisonError(error, duration);
    res.status(statusCode).json(response);
  }
};

module.exports = {
  uploadSayurboxData,
  resetUploadState,
  getAllSayurboxData,
  getSayurboxDataByHub,
  getSayurboxDataByDriver,
  deleteSayurboxData,
  compareDataSayurbox,
  getDataInfo
};