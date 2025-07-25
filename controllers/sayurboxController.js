const SayurboxData = require("../models/SayurboxData");
const ExcelData = require("../models/ExcelData");

const calculateWeightMetrics = (weight) => {
const numericWeight = Number(weight) || 0;
const integerPart = Math.floor(numericWeight);
const decimalPart = numericWeight - integerPart;
const WEIGHT_THRESHOLD = 0.30;
const WEIGHT_BASE = 10;
const WEIGHT_CHARGE_RATE = 400;

const roundDown = numericWeight < 1 ? 0 : integerPart;
const roundUp = decimalPart > WEIGHT_THRESHOLD ? integerPart + 1 : integerPart;
const weightDecimal = Number((numericWeight - roundDown).toFixed(2));
const addCharge1 = roundUp < WEIGHT_BASE ? 0 : (roundUp - WEIGHT_BASE) * WEIGHT_CHARGE_RATE;

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
const DISTANCE_THRESHOLD = 0.30;

const roundDown = distanceVal < 1 ? 0 : integerPart;
const roundUp = decimalPart > DISTANCE_THRESHOLD ? integerPart + 1 : integerPart;

return {
distance: distanceVal,
roundDownDistance: roundDown,
roundUpDistance: roundUp
};
};

const transformSayurboxData = (dataArray) => {
return dataArray.map((item, index) => {
if (!item.order_no || !item.hub_name || !item.driver_name) {
throw new Error(`Record ${index + 1}: Order No, Hub Name, dan Driver Name wajib diisi`);
}

return {
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
};
});
};

const uploadState = {
isInitialized: false,
totalProcessed: 0,
reset() {
this.isInitialized = false;
this.totalProcessed = 0;
console.log('Upload state reset');
}
};

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

const batchSize = 500;
let totalInserted = 0;
const insertResults = [];

for (let i = 0; i < transformedData.length; i += batchSize) {
const batch = transformedData.slice(i, i + batchSize);
const subBatchNum = Math.floor(i / batchSize) + 1;
const totalSubBatches = Math.ceil(transformedData.length / batchSize);

console.log(`Inserting sub-batch ${subBatchNum}/${totalSubBatches} (${batch.length} records)`);

try {
const insertResult = await SayurboxData.insertMany(batch, { 
ordered: false,
rawResult: false 
});

const insertedCount = Array.isArray(insertResult) ? insertResult.length : insertResult.insertedCount || 0;
totalInserted += insertedCount;
insertResults.push({
subBatch: subBatchNum,
inserted: insertedCount,
records: batch.length
});

console.log(`Sub-batch ${subBatchNum} completed: ${insertedCount}/${batch.length} records inserted`);

} catch (insertError) {
console.error(`Sub-batch ${subBatchNum} insert failed:`, insertError.message);

if (insertError.code === 11000) {
console.warn(`Duplicate key error in sub-batch ${subBatchNum}, continuing...`);
const partialInsert = insertError.result?.result?.nInserted || 0;
totalInserted += partialInsert;
insertResults.push({
subBatch: subBatchNum,
inserted: partialInsert,
records: batch.length,
error: 'Partial insert due to duplicates'
});
} else {
throw new Error(`Database insert failed at sub-batch ${subBatchNum}: ${insertError.message}`);
}
}
}

uploadState.totalProcessed += totalInserted;
const duration = Date.now() - startTime;

console.log(`Batch upload completed successfully:`);
console.log(`- Records processed: ${transformedData.length}`);
console.log(`- Records inserted: ${totalInserted}`);
console.log(`- Total processed in session: ${uploadState.totalProcessed}`);
console.log(`- Duration: ${duration}ms`);

const currentCount = await SayurboxData.countDocuments();
console.log(`Current total records in database: ${currentCount}`);

res.status(201).json({
message: "Data sayurbox berhasil disimpan ke database",
count: totalInserted,
summary: {
totalRecords: totalInserted,
processedRecords: transformedData.length,
sessionTotal: uploadState.totalProcessed,
databaseTotal: currentCount,
success: true,
duration: `${duration}ms`,
insertResults: insertResults
}
});

} catch (error) {
const duration = Date.now() - startTime;
console.error(`Upload sayurbox failed after ${duration}ms:`, error.message);
console.error("Error stack:", error.stack);

res.status(500).json({ 
message: "Upload data sayurbox gagal", 
error: error.message,
duration: `${duration}ms`
});
}
};

const getAllSayurboxData = async (req, res) => {
try {
const { page = 1, limit = 0 } = req.query;
const skip = limit > 0 ? (page - 1) * limit : 0;

console.log(`Fetching sayurbox data - page: ${page}, limit: ${limit}`);

const query = SayurboxData.find()
.sort({ hubName: 1, driverName: 1, deliveryDate: -1 })
.lean();

if (limit > 0) {
query.skip(skip).limit(parseInt(limit));
}

const [data, total] = await Promise.all([
query,
SayurboxData.countDocuments()
]);

console.log(`Sayurbox data fetched: ${data.length} records, Total in DB: ${total}`);

const response = {
message: "Data sayurbox berhasil diambil",
count: data.length,
total: total,
data: data
};

if (limit > 0) {
response.page = parseInt(page);
response.totalPages = Math.ceil(total / limit);
}

res.status(200).json(response);
} catch (error) {
console.error("Get sayurbox error:", error.message);
res.status(500).json({ 
message: "Gagal mengambil data sayurbox", 
error: error.message 
});
}
};

const getSayurboxDataByHub = async (req, res) => {
try {
const hub = req.params.hub;
const { page = 1, limit = 1000 } = req.query;
const skip = (page - 1) * limit;

console.log(`Mencari data sayurbox untuk hub: ${hub}`);

const data = await SayurboxData.find({
hubName: { $regex: new RegExp(hub, "i") }
})
.sort({ driverName: 1, deliveryDate: -1 })
.skip(skip)
.limit(parseInt(limit))
.lean();

const total = await SayurboxData.countDocuments({
hubName: { $regex: new RegExp(hub, "i") }
});

console.log(`Jumlah data sayurbox ditemukan untuk hub ${hub}: ${total}`);

res.status(200).json({
message: `Data sayurbox untuk hub ${hub} berhasil diambil`,
count: data.length,
total: total,
page: parseInt(page),
totalPages: Math.ceil(total / limit),
data: data
});
} catch (error) {
console.error("Get sayurbox by hub error:", error.message);
res.status(500).json({ 
message: "Gagal mengambil data sayurbox berdasarkan hub", 
error: error.message 
});
}
};

const getSayurboxDataByDriver = async (req, res) => {
try {
const driver = req.params.driver;
const { page = 1, limit = 1000 } = req.query;
const skip = (page - 1) * limit;

console.log(`Mencari data sayurbox untuk driver: ${driver}`);

const data = await SayurboxData.find({
driverName: { $regex: new RegExp(driver, "i") }
})
.sort({ deliveryDate: -1, hubName: 1 })
.skip(skip)
.limit(parseInt(limit))
.lean();

const total = await SayurboxData.countDocuments({
driverName: { $regex: new RegExp(driver, "i") }
});

console.log(`Jumlah data sayurbox ditemukan untuk driver ${driver}: ${total}`);

res.status(200).json({
message: `Data sayurbox untuk driver ${driver} berhasil diambil`,
count: data.length,
total: total,
page: parseInt(page),
totalPages: Math.ceil(total / limit),
data: data
});
} catch (error) {
console.error("Get sayurbox by driver error:", error.message);
res.status(500).json({ 
message: "Gagal mengambil data sayurbox berdasarkan driver", 
error: error.message 
});
}
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
const sayurboxCount = await SayurboxData.countDocuments();
const excelCount = await ExcelData.countDocuments();

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

const compareDataSayurbox = async (req, res) => {
const startTime = Date.now();
const DISPLAY_LIMIT = 50;
console.log(`[${new Date().toISOString()}] Starting data comparison process...`);

try {
const [sayurboxCount, excelCount] = await Promise.all([
SayurboxData.countDocuments(),
ExcelData.countDocuments()
]);

if (sayurboxCount === 0) {
return res.status(400).json({
message: "Tidak ada data Sayurbox untuk dibandingkan. Silakan upload data Sayurbox terlebih dahulu.",
error: "Sayurbox data empty"
});
}

if (excelCount === 0) {
return res.status(400).json({
message: "Tidak ada data Excel untuk dibandingkan. Silakan upload data Excel terlebih dahulu.",
error: "Excel data empty"
});
}

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

const batchSize = 500;
let totalUpdated = 0;
let totalChecked = 0;
let matchedRecords = 0;
let unmatchedExcelCodes = [];
const processedExcelCodes = new Set();

console.log(`Processing Excel data in batches of ${batchSize}...`);

for (let skip = 0; skip < excelCount; skip += batchSize) {
const excelBatch = await ExcelData.find({}, { "Order Code": 1, Weight: 1, Distance: 1 })
.skip(skip)
.limit(batchSize)
.lean();

const bulkOps = [];

for (const excelItem of excelBatch) {
totalChecked++;
const orderCode = excelItem["Order Code"];

if (orderCode) {
processedExcelCodes.add(orderCode);

if (sayurboxMap.has(orderCode)) {
const sayurboxItem = sayurboxMap.get(orderCode);
matchedRecords++;

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
unmatchedExcelCodes.push(orderCode);
}
}
}

if (bulkOps.length > 0) {
const result = await ExcelData.bulkWrite(bulkOps, { session });
totalUpdated += result.modifiedCount;
console.log(`Batch processed: ${bulkOps.length} matches found, ${result.modifiedCount} updated`);
}

if (skip + batchSize < excelCount) {
console.log(`Processed ${skip + batchSize}/${excelCount} Excel records...`);
}
}

const unmatchedSayurboxCodes = Array.from(sayurboxOrderNos).filter(orderNo => 
!processedExcelCodes.has(orderNo)
);

await session.commitTransaction();

const duration = Date.now() - startTime;
const notMatchedRecords = totalChecked - matchedRecords;

console.log(`Comparison completed successfully in ${duration}ms:`);
console.log(`- Total checked: ${totalChecked}`);
console.log(`- Total updated: ${totalUpdated}`);
console.log(`- Matched records: ${matchedRecords}`);
console.log(`- Unmatched Excel codes: ${unmatchedExcelCodes.length}`);
console.log(`- Unmatched Sayurbox codes: ${unmatchedSayurboxCodes.length}`);

res.status(200).json({
message: `Data comparison completed successfully in ${duration}ms`,
summary: {
totalChecked,
totalUpdated,
matchedRecords,
notMatchedRecords,
unmatchedExcelCount: unmatchedExcelCodes.length,
unmatchedSayurboxCount: unmatchedSayurboxCodes.length,
processingTime: `${duration}ms`,
success: true
},
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

let errorMessage = error.message;
let statusCode = 500;

if (error.message.includes('Sayurbox data empty')) {
statusCode = 400;
} else if (error.message.includes('Excel data empty')) {
statusCode = 400;
} else if (error.name === 'MongoTimeoutError') {
errorMessage = 'Database timeout - proses compare membutuhkan waktu lama. Silakan coba lagi.';
} else if (error.name === 'MongoNetworkError') {
errorMessage = 'Database connection error. Silakan coba lagi.';
}

res.status(statusCode).json({
message: "Compare data gagal",
error: errorMessage,
duration: `${duration}ms`,
success: false
});
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