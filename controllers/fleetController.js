const FleetData = require("../models/FleetData");

const BATCH_SIZE = 1000;

const validateRequiredFields = (item, index) => {
const requiredFields = ['name', 'vehNumb'];
const missingFields = requiredFields.filter(field => !item[field] || !item[field].toString().trim());

if (missingFields.length > 0) {
throw new Error(`Record ${index + 1}: Field wajib tidak boleh kosong - ${missingFields.join(', ')}`);
}
};

const transformFleetItem = (item) => ({
name: String(item.name || '').trim(),
phoneNumber: String(item.phoneNumber || item['No Telepon'] || '').trim(),
status: String(item.status || '').trim(),
molis: String(item.molis || '').trim(),
deductionAmount: String(item.deductionAmount || '').trim(),
statusSecond: String(item.statusSecond || '').trim(),
project: String(item.project || '').trim(),
distribusi: String(item.distribusi || '').trim(),
rushHour: String(item.rushHour || '').trim(),
vehNumb: String(item.vehNumb || '').trim().toUpperCase(),
type: String(item.type || '').trim(),
notes: String(item.notes || '').trim()
});

const transformFleetData = (dataArray) => {
return dataArray.map((item, index) => {
validateRequiredFields(item, index);
return transformFleetItem(item);
});
};

const createUploadState = () => ({
isInitialized: false,
totalProcessed: 0,
reset() {
this.isInitialized = false;
this.totalProcessed = 0;
console.log('Fleet upload state reset');
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
logBatchOperation('Inserting fleet', batchNum, totalBatches, batch.length);

try {
const insertedDocs = await FleetData.insertMany(batch, { 
ordered: false,
lean: true 
});

const insertedCount = insertedDocs.length;

logBatchOperation('Fleet insert completed', batchNum, totalBatches, insertedCount, batch.length);

return {
batchNum,
inserted: insertedCount,
updated: 0,
processed: insertedCount,
records: batch.length,
actualSaved: insertedCount,
success: true
};
} catch (insertError) {
console.error(`Fleet batch ${batchNum} insert failed:`, insertError.message);

if (insertError.writeErrors) {
console.log(`Partial success: ${insertError.insertedDocs ? insertError.insertedDocs.length : 0} records inserted`);
const partialCount = insertError.insertedDocs ? insertError.insertedDocs.length : 0;
return {
batchNum,
inserted: partialCount,
updated: 0,
processed: partialCount,
records: batch.length,
actualSaved: partialCount,
success: true,
errors: insertError.writeErrors.length
};
}
throw new Error(`Database insert failed at batch ${batchNum}: ${insertError.message}`);
}
};

const processBatchInserts = async (transformedData) => {
let totalProcessed = 0;
let totalInserted = 0;
let totalUpdated = 0;
let totalActualSaved = 0;
const insertResults = [];

const totalBatches = Math.ceil(transformedData.length / BATCH_SIZE);

for (let i = 0; i < transformedData.length; i += BATCH_SIZE) {
const batch = transformedData.slice(i, i + BATCH_SIZE);
const batchNum = Math.floor(i / BATCH_SIZE) + 1;

const result = await handleBatchInsert(batch, batchNum, totalBatches);

totalProcessed += result.processed;
totalInserted += result.inserted;
totalUpdated += result.updated;
totalActualSaved += result.actualSaved;
insertResults.push(result);
}

return { totalProcessed, totalInserted, totalUpdated, totalActualSaved, insertResults };
};

const createInsertResponse = (totalActualSaved, totalInserted, totalUpdated, processedRecords, sessionTotal, databaseTotal, duration, insertResults) => ({
message: `Data fleet berhasil disimpan ke database`,
count: totalActualSaved,
summary: {
totalRecords: totalActualSaved,
insertedRecords: totalInserted,
updatedRecords: totalUpdated,
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

const resetFleetUploadState = async (req, res) => {
try {
uploadState.reset();
console.log('Fleet upload state has been reset manually');

res.status(200).json({ 
message: "Fleet upload state reset successfully",
success: true 
});
} catch (error) {
console.error("Reset fleet upload state error:", error.message);
res.status(500).json({ 
message: "Reset fleet upload state failed", 
error: error.message 
});
}
};

const replaceAllFleetData = async (transformedData) => {
console.log('Starting replace all fleet data process...');

try {
const deleteResult = await FleetData.deleteMany({});
console.log(`Deleted ${deleteResult.deletedCount} existing fleet records`);

uploadState.reset();

const { totalProcessed, totalInserted, totalUpdated, totalActualSaved, insertResults } = await processBatchInserts(transformedData);

console.log(`Replace completed - Inserted: ${totalInserted} new records`);
return { totalProcessed, totalInserted, totalUpdated, totalActualSaved, insertResults };

} catch (error) {
console.error('Replace all fleet data failed:', error.message);
throw error;
}
};

const uploadFleetData = async (req, res) => {
const startTime = Date.now();
console.log(`[${new Date().toISOString()}] Starting fleet data upload...`);

try {
const dataArray = req.body;
const replaceAll = req.query.replace === 'true' || req.headers['x-replace-data'] === 'true';

if (!Array.isArray(dataArray) || dataArray.length === 0) {
console.error("Invalid fleet data format received");
return res.status(400).json({ 
message: "Data fleet tidak valid atau kosong",
error: "Expected non-empty array"
});
}

console.log(`Processing fleet batch with ${dataArray.length} records (replace mode: ${replaceAll})...`);

let transformedData;
try {
transformedData = transformFleetData(dataArray);
console.log(`Fleet data transformation completed: ${transformedData.length} valid records`);
} catch (transformError) {
console.error("Fleet data transformation failed:", transformError.message);
return res.status(400).json({
message: "Fleet data validation failed",
error: transformError.message
});
}

let totalProcessed, totalInserted, totalUpdated, totalActualSaved, insertResults;

if (replaceAll) {
({ totalProcessed, totalInserted, totalUpdated, totalActualSaved, insertResults } = await replaceAllFleetData(transformedData));
} else {
({ totalProcessed, totalInserted, totalUpdated, totalActualSaved, insertResults } = await processBatchInserts(transformedData));
uploadState.totalProcessed += totalActualSaved;
}

const duration = Date.now() - startTime;

console.log(`Fleet ${replaceAll ? 'replacement' : 'batch'} upload completed successfully:`);
console.log(`- Records processed: ${transformedData.length}`);
console.log(`- Records inserted: ${totalInserted}`);
console.log(`- Records updated: ${totalUpdated}`);
console.log(`- Total actually saved: ${totalActualSaved}`);
console.log(`- Total saved in session: ${replaceAll ? totalActualSaved : uploadState.totalProcessed}`);
console.log(`- Duration: ${duration}ms`);

const currentCount = await FleetData.countDocuments();
console.log(`Current total fleet records in database: ${currentCount}`);

const response = createInsertResponse(
totalActualSaved,
totalInserted,
totalUpdated,
transformedData.length, 
replaceAll ? totalActualSaved : uploadState.totalProcessed, 
currentCount, 
duration, 
insertResults
);

res.status(201).json(response);

} catch (error) {
const duration = Date.now() - startTime;
console.error(`Upload fleet failed after ${duration}ms:`, error.message);
console.error("Error stack:", error.stack);

res.status(500).json(createErrorResponse("Upload data fleet gagal", error, duration));
}
};

const buildSearchQuery = (searchTerm) => {
if (!searchTerm || searchTerm.length < 2) return {};

const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

return {
$or: [
{ name: searchRegex },
{ vehNumb: searchRegex },
{ status: searchRegex },
{ project: searchRegex },
{ type: searchRegex },
{ molis: searchRegex },
{ distribusi: searchRegex },
{ phoneNumber: searchRegex }
]
};
};

const buildFilterQuery = (filters) => {
const query = {};

if (filters.status) {
query.status = new RegExp(filters.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

if (filters.project) {
query.project = new RegExp(filters.project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

if (filters.type) {
query.type = new RegExp(filters.type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

if (filters.statusFilter && filters.statusFilter !== 'all') {
if (filters.statusFilter === 'active') {
query.status = { $regex: /^ACTIVE$/i };
} else if (filters.statusFilter === 'inactive') {
query.status = { $not: { $regex: /^ACTIVE$/i } };
}
}

return query;
};

const buildSortQuery = (sortKey, sortDirection) => {
const sortObj = {};

if (sortKey === 'createdAt' || sortKey === 'name' || sortKey === 'vehNumb' || sortKey === 'status' || sortKey === 'project' || sortKey === 'type' || sortKey === 'phoneNumber') {
sortObj[sortKey] = sortDirection === 'asc' ? 1 : -1;
} else {
sortObj.createdAt = -1;
}

return sortObj;
};

const getAllFleetData = async (req, res) => {
try {
const {
page = 1,
limit = 25,
search = '',
sortKey = 'createdAt',
sortDirection = 'desc',
status = '',
project = '',
type = '',
statusFilter = 'all'
} = req.query;

const pageNum = Math.max(1, parseInt(page));
const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
const skip = (pageNum - 1) * limitNum;

const searchQuery = buildSearchQuery(search);
const filterQuery = buildFilterQuery({
status,
project,
type,
statusFilter
});
const sortQuery = buildSortQuery(sortKey, sortDirection);

const combinedQuery = { ...searchQuery, ...filterQuery };

console.log(`Fetching fleet data - page: ${pageNum}, limit: ${limitNum}, filters: ${JSON.stringify(combinedQuery)}`);

const [data, total] = await Promise.all([
FleetData.find(combinedQuery)
.sort(sortQuery)
.skip(skip)
.limit(limitNum)
.lean()
.exec(),
FleetData.countDocuments(combinedQuery)
]);

console.log(`Fleet data fetched: ${data.length} records, Total matching: ${total}`);

const response = {
message: "Data fleet berhasil diambil",
count: data.length,
total,
page: pageNum,
totalPages: Math.ceil(total / limitNum),
hasMore: pageNum * limitNum < total,
data
};

res.status(200).json(response);
} catch (error) {
console.error("Get fleet data error:", error.message);
res.status(500).json({ 
message: "Gagal mengambil data fleet", 
error: error.message 
});
}
};

const updateFleetData = async (req, res) => {
try {
const { id } = req.params;
const updateData = req.body;

console.log(`Updating fleet data with ID: ${id}`);

const transformedData = transformFleetItem(updateData);

const updatedFleet = await FleetData.findByIdAndUpdate(
id,
{ ...transformedData, updatedAt: Date.now() },
{ new: true, runValidators: true }
).lean();

if (!updatedFleet) {
return res.status(404).json({
message: "Data fleet tidak ditemukan",
error: "Fleet dengan ID tersebut tidak ada"
});
}

console.log(`Fleet data updated successfully: ${updatedFleet.name}`);

res.status(200).json({
message: "Data fleet berhasil diperbarui",
data: updatedFleet
});
} catch (error) {
console.error("Update fleet data error:", error.message);
res.status(500).json({ 
message: "Gagal memperbarui data fleet", 
error: error.message 
});
}
};

const deleteFleetData = async (req, res) => {
try {
const { id } = req.params;

console.log(`Deleting fleet data with ID: ${id}`);

const deletedFleet = await FleetData.findByIdAndDelete(id).lean();

if (!deletedFleet) {
return res.status(404).json({
message: "Data fleet tidak ditemukan",
error: "Fleet dengan ID tersebut tidak ada"
});
}

console.log(`Fleet data deleted successfully: ${deletedFleet.name}`);

res.status(200).json({
message: "Data fleet berhasil dihapus",
data: deletedFleet
});
} catch (error) {
console.error("Delete fleet data error:", error.message);
res.status(500).json({ 
message: "Gagal menghapus data fleet", 
error: error.message 
});
}
};

const deleteMultipleFleetData = async (req, res) => {
try {
const { ids } = req.body;

if (!ids || !Array.isArray(ids) || ids.length === 0) {
return res.status(400).json({
message: "Invalid request: No IDs provided",
error: "Array of IDs is required"
});
}

console.log(`Deleting ${ids.length} fleet records`);

const result = await FleetData.deleteMany({ _id: { $in: ids } });

console.log(`Bulk delete completed: ${result.deletedCount} records deleted`);

res.status(200).json({
message: `${result.deletedCount} data fleet berhasil dihapus`,
deletedCount: result.deletedCount,
requestedCount: ids.length
});
} catch (error) {
console.error("Bulk delete fleet data error:", error.message);
res.status(500).json({ 
message: "Gagal menghapus data fleet", 
error: error.message 
});
}
};

const deleteAllFleetData = async (req, res) => {
try {
const result = await FleetData.deleteMany({});
uploadState.reset();

console.log(`Deleted ${result.deletedCount} fleet records`);

res.status(200).json({
message: "Semua data fleet berhasil dihapus",
deletedCount: result.deletedCount
});
} catch (error) {
console.error("Delete all fleet data error:", error.message);
res.status(500).json({ 
message: "Gagal menghapus data fleet", 
error: error.message 
});
}
};

const getFleetFilters = async (req, res) => {
try {
const [statuses, projects, types] = await Promise.all([
FleetData.distinct('status', { status: { $ne: '', $exists: true } }),
FleetData.distinct('project', { project: { $ne: '', $exists: true } }),
FleetData.distinct('type', { type: { $ne: '', $exists: true } })
]);

const [activeCount, totalCount] = await Promise.all([
FleetData.countDocuments({ status: { $regex: /^ACTIVE$/i } }),
FleetData.countDocuments()
]);

res.status(200).json({
statuses: statuses.sort(),
projects: projects.sort(),
types: types.sort(),
statistics: {
total: totalCount,
active: activeCount,
inactive: totalCount - activeCount
}
});
} catch (error) {
console.error("Get fleet filters error:", error.message);
res.status(500).json({ 
message: "Gagal mengambil filter fleet", 
error: error.message 
});
}
};

const getFleetDataByPlat = async (req, res) => {
try {
const vehNumb = req.params.plat;
console.log(`Mencari data fleet untuk nomor kendaraan: ${vehNumb}`);

const data = await FleetData.find({ 
vehNumb: { $regex: new RegExp(vehNumb, "i") } 
}).lean();

if (!data || data.length === 0) {
return res.status(404).json({
message: `Data fleet untuk nomor kendaraan ${vehNumb} tidak ditemukan`,
count: 0,
data: []
});
}

console.log(`Data fleet ditemukan untuk nomor kendaraan ${vehNumb}: ${data.length} records`);

res.status(200).json({
message: `Data fleet untuk nomor kendaraan ${vehNumb} berhasil diambil`,
count: data.length,
data: data
});
} catch (error) {
console.error(`Get fleet by vehicle number error:`, error.message);
res.status(500).json({ 
message: `Gagal mengambil data fleet berdasarkan nomor kendaraan`, 
error: error.message 
});
}
};

const getFleetInfo = async (req, res) => {
try {
const fleetCount = await FleetData.countDocuments();

res.status(200).json({
fleetCount,
uploadState: {
isInitialized: uploadState.isInitialized,
totalProcessed: uploadState.totalProcessed
}
});
} catch (error) {
console.error("Get fleet info error:", error.message);
res.status(500).json({ 
message: "Gagal mengambil info fleet", 
error: error.message 
});
}
};

module.exports = {
uploadFleetData,
resetFleetUploadState,
getAllFleetData,
getFleetFilters,
getFleetDataByPlat,
deleteFleetData,
deleteAllFleetData,
deleteMultipleFleetData,
updateFleetData,
getFleetInfo
};