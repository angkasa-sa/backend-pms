const ExcelData = require("../models/ExcelData");

const uploadData = async (req, res) => {
try {
const dataArray = req.body.records || req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data tidak valid atau kosong." });
}

console.log(`Starting upload process for ${dataArray.length} records`);

const session = await ExcelData.db.startSession();
session.startTransaction();

try {
await ExcelData.deleteMany({}, { session });
console.log("Existing data cleared");

const validData = dataArray.filter(item => 
item && typeof item === 'object' && Object.keys(item).length > 0
);

if (validData.length === 0) {
throw new Error("Tidak ada data valid untuk disimpan");
}

console.log(`Valid records to insert: ${validData.length}`);

const batchSize = 1000;
let totalInserted = 0;

for (let i = 0; i < validData.length; i += batchSize) {
const batch = validData.slice(i, i + batchSize);
console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validData.length / batchSize)} - ${batch.length} records`);

const result = await ExcelData.insertMany(batch, { 
session, 
ordered: false
});

const insertedCount = Array.isArray(result) ? result.length : result.length;
totalInserted += insertedCount;

console.log(`Batch inserted: ${insertedCount} records, Total so far: ${totalInserted}`);
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

const session = await ExcelData.db.startSession();
session.startTransaction();

try {
const validData = dataArray.filter(item => 
item && typeof item === 'object' && Object.keys(item).length > 0
);

if (validData.length === 0) {
throw new Error("Tidak ada data valid untuk ditambahkan");
}

console.log(`Valid records to append: ${validData.length}`);

const batchSize = 1000;
let totalInserted = 0;

for (let i = 0; i < validData.length; i += batchSize) {
const batch = validData.slice(i, i + batchSize);
console.log(`Appending batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validData.length / batchSize)} - ${batch.length} records`);

const result = await ExcelData.insertMany(batch, { 
session, 
ordered: false
});

const insertedCount = Array.isArray(result) ? result.length : result.length;
totalInserted += insertedCount;

console.log(`Batch appended: ${insertedCount} records, Total appended so far: ${totalInserted}`);
}

await session.commitTransaction();

const countAfter = await ExcelData.countDocuments();
console.log(`Records after append: ${countAfter}`);

if (countAfter !== countBefore + totalInserted) {
console.warn(`Warning: Expected ${countBefore + totalInserted} records, but found ${countAfter}`);
}

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
throw transactionError;
} finally {
session.endSession();
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
let matchedCount = 0;
let notFoundCount = 0;
let updatedRecords = [];
let notFoundRecords = [];

const batchSize = 500;
const totalBatches = Math.ceil(dataArray.length / batchSize);

for (let i = 0; i < dataArray.length; i += batchSize) {
const batch = dataArray.slice(i, i + batchSize);
const batchNumber = Math.floor(i / batchSize) + 1;

console.log(`Processing replace batch ${batchNumber}/${totalBatches} - ${batch.length} records`);

for (const item of batch) {
const { clientName, orderCode, updateData } = item;

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

const cleanUpdateData = {};
Object.keys(updateData).forEach(key => {
if (updateData[key] !== null && updateData[key] !== undefined && updateData[key] !== "") {
cleanUpdateData[key] = updateData[key];
}
});

if (Object.keys(cleanUpdateData).length === 0) {
notFoundCount++;
notFoundRecords.push({ clientName, orderCode, error: "Tidak ada data untuk diupdate" });
continue;
}

const updateResult = await ExcelData.updateOne(
filter,
{ $set: cleanUpdateData },
{ session, upsert: false }
);

if (updateResult.matchedCount > 0) {
matchedCount++;
updatedRecords.push({
clientName,
orderCode,
updatedFields: Object.keys(cleanUpdateData)
});
} else {
notFoundCount++;
notFoundRecords.push({ clientName, orderCode, error: "Data tidak ditemukan" });
}

} catch (updateError) {
console.error(`Error updating ${clientName} - ${orderCode}:`, updateError.message);
notFoundCount++;
notFoundRecords.push({ 
clientName, 
orderCode, 
error: updateError.message 
});
}
}

console.log(`Replace batch ${batchNumber} completed`);
}

await session.commitTransaction();

const responseMessage = `Replace selesai. ${matchedCount} data berhasil diupdate, ${notFoundCount} data tidak ditemukan.`;
console.log(`Replace completed: ${matchedCount} successful, ${notFoundCount} failed`);

res.status(200).json({
message: responseMessage,
summary: {
totalProcessed: dataArray.length,
successfulUpdates: matchedCount,
notFound: notFoundCount,
batchesProcessed: totalBatches,
success: true
},
updatedRecords: updatedRecords.slice(0, 100),
notFoundRecords: notFoundRecords.slice(0, 100)
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
};