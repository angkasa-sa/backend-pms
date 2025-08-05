const ExcelData = require("../models/ExcelData");

const uploadData = async (req, res) => {
try {
const dataArray = req.body.records || req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data tidak valid atau kosong." });
}

console.log(`Starting upload process for ${dataArray.length} records`);

const validData = dataArray.filter(item => 
item && typeof item === 'object' && Object.keys(item).length > 0
);

if (validData.length === 0) {
return res.status(400).json({ message: "Tidak ada data valid untuk disimpan" });
}

const orderCodes = new Set();
const duplicateErrors = [];

validData.forEach((item, index) => {
const orderCode = item["Order Code"];
if (orderCode) {
const trimmedOrderCode = orderCode.toString().trim();
if (orderCodes.has(trimmedOrderCode)) {
duplicateErrors.push(`Data ke-${index + 1}: Order Code '${trimmedOrderCode}' duplikat dalam file`);
} else {
orderCodes.add(trimmedOrderCode);
}
}
});

if (duplicateErrors.length > 0) {
return res.status(400).json({ 
message: `Duplikasi Order Code ditemukan dalam file: ${duplicateErrors.length} duplikat`,
errors: duplicateErrors
});
}

const session = await ExcelData.db.startSession();
session.startTransaction();

try {
await ExcelData.deleteMany({}, { session });
console.log("Existing data cleared");

const batchSize = 1000;
let totalInserted = 0;
const insertErrors = [];

for (let i = 0; i < validData.length; i += batchSize) {
const batch = validData.slice(i, i + batchSize);
console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validData.length / batchSize)} - ${batch.length} records`);

try {
const result = await ExcelData.insertMany(batch, { 
session, 
ordered: false
});

const insertedCount = Array.isArray(result) ? result.length : result.length;
totalInserted += insertedCount;

console.log(`Batch inserted: ${insertedCount} records, Total so far: ${totalInserted}`);
} catch (batchError) {
if (batchError.code === 11000) {
const duplicateKeys = batchError.writeErrors?.map(err => {
const keyValue = err.keyValue || {};
return `Order Code: ${keyValue["Order Code"] || "unknown"}`;
}) || ["Unknown duplicate"];

insertErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: Duplikasi ditemukan - ${duplicateKeys.join(", ")}`);
} else {
insertErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError.message}`);
}
throw batchError;
}
}

await session.commitTransaction();
console.log(`Upload completed successfully: ${totalInserted} total records inserted`);

const finalCount = await ExcelData.countDocuments();
console.log(`Database count after upload: ${finalCount}`);

res.status(201).json({
message: `Data berhasil disimpan: ${totalInserted} records. Data lama dihapus.`,
summary: {
totalRecords: totalInserted,
finalDatabaseCount: finalCount,
success: true
}
});

} catch (transactionError) {
await session.abortTransaction();

if (transactionError.code === 11000) {
const duplicateKey = transactionError.keyValue ? 
`Order Code: ${transactionError.keyValue["Order Code"]}` : 
"Unknown duplicate key";

return res.status(400).json({ 
message: `Duplikasi Order Code ditemukan di database: ${duplicateKey}`,
error: "Duplicate key error"
});
}
throw transactionError;
} finally {
session.endSession();
}

} catch (error) {
console.error("Upload error:", error.message);
res.status(500).json({ 
message: "Upload gagal", 
error: error.message
});
}
};

const appendData = async (req, res) => {
try {
const dataArray = req.body.records || req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data tidak valid atau kosong." });
}

console.log(`Starting append process for ${dataArray.length} records`);

const countBefore = await ExcelData.countDocuments();
console.log(`Records before append: ${countBefore}`);

const validData = dataArray.filter(item => 
item && typeof item === 'object' && Object.keys(item).length > 0
);

if (validData.length === 0) {
return res.status(400).json({ message: "Tidak ada data valid untuk ditambahkan" });
}

const orderCodes = new Set();
const duplicateErrors = [];

validData.forEach((item, index) => {
const orderCode = item["Order Code"];
if (orderCode) {
const trimmedOrderCode = orderCode.toString().trim();
if (orderCodes.has(trimmedOrderCode)) {
duplicateErrors.push(`Data ke-${index + 1}: Order Code '${trimmedOrderCode}' duplikat dalam file`);
} else {
orderCodes.add(trimmedOrderCode);
}
}
});

if (duplicateErrors.length > 0) {
return res.status(400).json({ 
message: `Duplikasi Order Code ditemukan dalam file: ${duplicateErrors.length} duplikat`,
errors: duplicateErrors
});
}

const uniqueOrderCodes = Array.from(orderCodes);
const existingRecords = await ExcelData.find(
{ "Order Code": { $in: uniqueOrderCodes } },
{ "Order Code": 1, "Client Name": 1 }
).lean();

const existingOrderCodes = new Set(existingRecords.map(record => record["Order Code"]));

const newData = [];
const conflictingData = [];

validData.forEach((item, index) => {
const orderCode = item["Order Code"];
const trimmedOrderCode = orderCode?.toString().trim();

if (trimmedOrderCode && existingOrderCodes.has(trimmedOrderCode)) {
const existingRecord = existingRecords.find(r => r["Order Code"] === trimmedOrderCode);
conflictingData.push({
index: index + 1,
orderCode: trimmedOrderCode,
clientName: item["Client Name"],
existingClientName: existingRecord["Client Name"]
});
} else {
newData.push(item);
}
});

if (conflictingData.length > 0) {
console.log(`Found ${conflictingData.length} conflicting records, but proceeding with update operation`);


const session = await ExcelData.db.startSession();
session.startTransaction();

try {
let updatedCount = 0;
let insertedCount = 0;
const batchSize = 500;
const processedRecords = [];

for (let i = 0; i < validData.length; i += batchSize) {
const batch = validData.slice(i, i + batchSize);
console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validData.length / batchSize)} - ${batch.length} records`);

for (const item of batch) {
const orderCode = item["Order Code"]?.toString().trim();
const clientName = item["Client Name"]?.toString().trim();

if (!orderCode || !clientName) continue;

try {
const existingRecord = await ExcelData.findOne({
"Order Code": orderCode
}).session(session);

if (existingRecord) {
const updateResult = await ExcelData.updateOne(
{ "Order Code": orderCode },
{ $set: item },
{ session, runValidators: true }
);

if (updateResult.modifiedCount > 0) {
updatedCount++;
processedRecords.push({
action: 'updated',
orderCode,
clientName
});
}
} else {
await ExcelData.create([item], { session });
insertedCount++;
processedRecords.push({
action: 'inserted',
orderCode,
clientName
});
}
} catch (itemError) {
console.error(`Error processing ${orderCode}:`, itemError.message);
}
}
}

await session.commitTransaction();

const countAfter = await ExcelData.countDocuments();
console.log(`Records after append: ${countAfter}`);

res.status(201).json({
message: `Proses selesai: ${insertedCount} data baru ditambahkan, ${updatedCount} data diperbarui. Total data: ${countAfter}`,
summary: {
dataBefore: countBefore,
dataInserted: insertedCount,
dataUpdated: updatedCount,
dataAfter: countAfter,
totalProcessed: insertedCount + updatedCount,
success: true
},
processedRecords: processedRecords.slice(0, 50)
});

} catch (transactionError) {
await session.abortTransaction();
throw transactionError;
} finally {
session.endSession();
}

} else {
const session = await ExcelData.db.startSession();
session.startTransaction();

try {
console.log(`Valid records to append: ${newData.length}`);

const batchSize = 1000;
let totalInserted = 0;

for (let i = 0; i < newData.length; i += batchSize) {
const batch = newData.slice(i, i + batchSize);
console.log(`Appending batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(newData.length / batchSize)} - ${batch.length} records`);

try {
const result = await ExcelData.insertMany(batch, { 
session, 
ordered: false
});

const insertedCount = Array.isArray(result) ? result.length : result.length;
totalInserted += insertedCount;

console.log(`Batch appended: ${insertedCount} records, Total appended so far: ${totalInserted}`);
} catch (batchError) {
if (batchError.code === 11000) {
const duplicateKeys = batchError.writeErrors?.map(err => {
const keyValue = err.keyValue || {};
return `Order Code: ${keyValue["Order Code"] || "unknown"}`;
}) || ["Unknown duplicate"];

throw new Error(`Duplikasi Order Code ditemukan: ${duplicateKeys.join(", ")}`);
}
throw batchError;
}
}

await session.commitTransaction();

const countAfter = await ExcelData.countDocuments();
console.log(`Records after append: ${countAfter}`);

res.status(201).json({
message: `${totalInserted} data baru berhasil ditambahkan. Total data: ${countAfter}`,
summary: {
dataBefore: countBefore,
dataAdded: totalInserted,
dataAfter: countAfter,
success: true
}
});

} catch (transactionError) {
await session.abortTransaction();

if (transactionError.message.includes("Duplikasi Order Code")) {
return res.status(400).json({ 
message: transactionError.message,
error: "Duplicate key error"
});
}
throw transactionError;
} finally {
session.endSession();
}
}

} catch (error) {
console.error("Append error:", error.message);
res.status(500).json({ 
message: "Append gagal", 
error: error.message
});
}
};

const replaceData = async (req, res) => {
try {
const dataArray = req.body.records || req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data replace tidak valid atau kosong." });
}

console.log(`Starting replace process for ${dataArray.length} records`);

const session = await ExcelData.db.startSession();
session.startTransaction();

try {
let successCount = 0;
let failedCount = 0;
let updatedRecords = [];
let notFoundRecords = [];

for (const item of dataArray) {
const { clientName, orderCode, updateData } = item;

if (!clientName || !orderCode) {
failedCount++;
notFoundRecords.push({ 
clientName: clientName || "N/A", 
orderCode: orderCode || "N/A", 
error: "Client Name atau Order Code kosong" 
});
continue;
}

try {
const trimmedClientName = clientName.toString().trim();
const trimmedOrderCode = orderCode.toString().trim();

const filter = {
"Client Name": trimmedClientName,
"Order Code": trimmedOrderCode
};

console.log(`Searching for: Client Name="${trimmedClientName}", Order Code="${trimmedOrderCode}"`);

let existingRecord = await ExcelData.findOne(filter).session(session);

if (!existingRecord) {
const caseInsensitiveFilter = {
"Client Name": { $regex: new RegExp(`^${trimmedClientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") },
"Order Code": { $regex: new RegExp(`^${trimmedOrderCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") }
};
existingRecord = await ExcelData.findOne(caseInsensitiveFilter).session(session);
}

if (!existingRecord) {
failedCount++;
notFoundRecords.push({ 
clientName: trimmedClientName, 
orderCode: trimmedOrderCode, 
error: "Data tidak ditemukan di database" 
});
console.log(`Record not found: ${trimmedClientName} - ${trimmedOrderCode}`);
continue;
}

const cleanUpdateData = {};
Object.keys(updateData).forEach(key => {
const value = updateData[key];
if (value !== null && value !== undefined && value !== "") {
cleanUpdateData[key] = value;
}
});

if (Object.keys(cleanUpdateData).length === 0) {
failedCount++;
notFoundRecords.push({ 
clientName: trimmedClientName, 
orderCode: trimmedOrderCode, 
error: "Tidak ada data untuk diupdate" 
});
continue;
}

const updateResult = await ExcelData.updateOne(
{ _id: existingRecord._id },
{ $set: cleanUpdateData },
{ session, runValidators: true }
);

if (updateResult.modifiedCount > 0) {
successCount++;
updatedRecords.push({
clientName: trimmedClientName,
orderCode: trimmedOrderCode,
updatedFields: Object.keys(cleanUpdateData),
recordId: existingRecord._id
});
console.log(`Successfully updated: ${trimmedClientName} - ${trimmedOrderCode}`);
} else {
failedCount++;
notFoundRecords.push({ 
clientName: trimmedClientName, 
orderCode: trimmedOrderCode, 
error: "Update tidak berhasil (tidak ada perubahan)" 
});
}

} catch (updateError) {
console.error(`Error updating ${clientName} - ${orderCode}:`, updateError.message);
failedCount++;
notFoundRecords.push({ 
clientName, 
orderCode, 
error: updateError.message 
});
}
}

await session.commitTransaction();

const responseMessage = `Replace selesai. ${successCount} data berhasil diupdate, ${failedCount} data gagal/tidak ditemukan.`;
console.log(`Replace completed: ${successCount} successful, ${failedCount} failed`);

res.status(200).json({
message: responseMessage,
summary: {
totalProcessed: dataArray.length,
successfulUpdates: successCount,
notFound: failedCount,
success: true
},
updatedRecords: updatedRecords.slice(0, 50),
notFoundRecords: notFoundRecords.slice(0, 50)
});

} catch (transactionError) {
await session.abortTransaction();
throw transactionError;
} finally {
session.endSession();
}

} catch (error) {
console.error("Replace error:", error.message);
res.status(500).json({ 
message: "Replace gagal", 
error: error.message
});
}
};

const deleteData = async (req, res) => {
try {
const dataArray = req.body.records || req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data delete tidak valid atau kosong." });
}

console.log(`Starting delete process for ${dataArray.length} records`);

const session = await ExcelData.db.startSession();
session.startTransaction();

try {
let deletedCount = 0;
let notFoundCount = 0;
let deletedRecords = [];
let notFoundRecords = [];

const batchSize = 500;
const totalBatches = Math.ceil(dataArray.length / batchSize);

for (let i = 0; i < dataArray.length; i += batchSize) {
const batch = dataArray.slice(i, i + batchSize);
const batchNumber = Math.floor(i / batchSize) + 1;

console.log(`Processing delete batch ${batchNumber}/${totalBatches} - ${batch.length} records`);

for (const item of batch) {
const { clientName, orderCode } = item;

if (!clientName || !orderCode) {
notFoundCount++;
notFoundRecords.push({ clientName, orderCode, error: "Client Name atau Order Code kosong" });
continue;
}

try {
const filter = {
"Client Name": { $regex: new RegExp(`^${clientName}$`, "i") },
"Order Code": { $regex: new RegExp(`^${orderCode}$`, "i") }
};

const deleteResult = await ExcelData.deleteOne(filter, { session });

if (deleteResult.deletedCount > 0) {
deletedCount++;
deletedRecords.push({ clientName, orderCode });
} else {
notFoundCount++;
notFoundRecords.push({ clientName, orderCode, error: "Data tidak ditemukan" });
}

} catch (deleteError) {
console.error(`Error deleting ${clientName} - ${orderCode}:`, deleteError.message);
notFoundCount++;
notFoundRecords.push({ 
clientName, 
orderCode, 
error: deleteError.message 
});
}
}

console.log(`Delete batch ${batchNumber} completed`);
}

await session.commitTransaction();

const responseMessage = `Delete selesai. ${deletedCount} data berhasil dihapus, ${notFoundCount} data tidak ditemukan.`;
console.log(`Delete completed: ${deletedCount} successful, ${notFoundCount} failed`);

res.status(200).json({
message: responseMessage,
summary: {
totalProcessed: dataArray.length,
successfulDeletes: deletedCount,
notFound: notFoundCount,
batchesProcessed: totalBatches,
success: true
},
deletedRecords: deletedRecords.slice(0, 100),
notFoundRecords: notFoundRecords.slice(0, 100)
});

} catch (transactionError) {
await session.abortTransaction();
throw transactionError;
} finally {
session.endSession();
}

} catch (error) {
console.error("Delete error:", error.message);
res.status(500).json({ 
message: "Delete gagal", 
error: error.message
});
}
};

const getAllData = async (req, res) => {
try {
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 0;
const skip = limit > 0 ? (page - 1) * limit : 0;

const query = ExcelData.find().lean();

if (limit > 0) {
query.skip(skip).limit(limit);
}

const [data, total] = await Promise.all([
query,
ExcelData.countDocuments()
]);

console.log(`Data fetched: ${data.length} records${limit > 0 ? ` (page ${page})` : ' (all data)'}, Total in DB: ${total}`);

const response = {
data,
totalRecords: total,
fetchedRecords: data.length
};

if (limit > 0) {
response.pagination = {
page,
limit,
total,
totalPages: Math.ceil(total / limit)
};
}

res.status(200).json(response);
} catch (error) {
console.error("Get data error:", error.message);
res.status(500).json({ 
message: "Gagal mengambil data", 
error: error.message
});
}
};

const getDataByClient = async (req, res) => {
try {
const client = req.params.client;
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 0;
const skip = limit > 0 ? (page - 1) * limit : 0;

console.log(`Searching for client: ${client}`);

const filter = { "Client Name": { $regex: new RegExp(client, "i") } };
const query = ExcelData.find(filter).lean();

if (limit > 0) {
query.skip(skip).limit(limit);
}

const [data, total] = await Promise.all([
query,
ExcelData.countDocuments(filter)
]);

console.log(`Client data found: ${data.length} records${limit > 0 ? ` (page ${page})` : ' (all data)'}`);

const response = {
data,
totalRecords: total,
fetchedRecords: data.length
};

if (limit > 0) {
response.pagination = {
page,
limit,
total,
totalPages: Math.ceil(total / limit)
};
}

res.status(200).json(response);
} catch (error) {
console.error("Get client data error:", error.message);
res.status(500).json({ 
message: "Gagal ambil data client", 
error: error.message
});
}
};

module.exports = {
uploadData,
appendData,
getAllData,
getDataByClient,
replaceData,
deleteData,
};