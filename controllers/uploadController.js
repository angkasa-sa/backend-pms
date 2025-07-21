const ExcelData = require("../models/ExcelData");

const uploadData = async (req, res) => {
try {
const dataArray = req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data tidak valid atau kosong." });
}

await ExcelData.deleteMany({});
console.log("Data lama dihapus");

const inserted = await ExcelData.insertMany(dataArray);
console.log("Data disimpan:", inserted.length);

res.status(201).json({
message: "Data berhasil disimpan. Data lama dihapus.",
data: inserted,
});
} catch (error) {
console.error("Upload error:", error.message);
res.status(500).json({ message: "Upload gagal", error: error.message });
}
};

const appendData = async (req, res) => {
try {
const dataArray = req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data tidak valid atau kosong." });
}

console.log("Memulai proses append data...");

const countBefore = await ExcelData.countDocuments();
console.log("Jumlah data sebelum append:", countBefore);

const inserted = await ExcelData.insertMany(dataArray);
console.log("Data baru ditambahkan:", inserted.length);

const countAfter = await ExcelData.countDocuments();
console.log("Jumlah data setelah append:", countAfter);

res.status(201).json({
message: `${inserted.length} data baru berhasil ditambahkan. Total data sekarang: ${countAfter}`,
summary: {
dataBefore: countBefore,
dataAdded: inserted.length,
dataAfter: countAfter
},
data: inserted,
});
} catch (error) {
console.error("Append error:", error.message);
res.status(500).json({ message: "Append gagal", error: error.message });
}
};

const replaceData = async (req, res) => {
try {
const dataArray = req.body;

if (!Array.isArray(dataArray) || dataArray.length === 0) {
return res.status(400).json({ message: "Data replace tidak valid atau kosong." });
}

let matchedCount = 0;
let notFoundCount = 0;
let updatedRecords = [];
let notFoundRecords = [];

console.log("Memulai proses replace data...");

for (const item of dataArray) {
const { clientName, orderCode, updateData } = item;

if (!clientName || !orderCode) {
console.log("Skipping item - Client Name atau Order Code kosong");
continue;
}

try {
const filter = {
"Client Name": { $regex: new RegExp(`^${clientName}$`, "i") },
"Order Code": { $regex: new RegExp(`^${orderCode}$`, "i") }
};

console.log(`Mencari data dengan filter:`, filter);

const cleanUpdateData = {};
Object.keys(updateData).forEach(key => {
if (updateData[key] !== null && updateData[key] !== undefined && updateData[key] !== "") {
cleanUpdateData[key] = updateData[key];
}
});

if (Object.keys(cleanUpdateData).length === 0) {
console.log(`Tidak ada data untuk diupdate untuk ${clientName} - ${orderCode}`);
continue;
}

if (cleanUpdateData["Distance"] !== undefined) {
console.log(`Distance update for ${clientName} - ${orderCode}:`, {
distance: cleanUpdateData["Distance"],
roundDownDistance: cleanUpdateData["RoundDown Distance"],
roundUpDistance: cleanUpdateData["RoundUp Distance"]
});
}

const updateResult = await ExcelData.updateOne(
filter,
{ $set: cleanUpdateData },
{ upsert: false }
);

if (updateResult.matchedCount > 0) {
matchedCount++;
updatedRecords.push({
clientName,
orderCode,
updatedFields: Object.keys(cleanUpdateData)
});
console.log(`Updated: ${clientName} - ${orderCode}`);
} else {
notFoundCount++;
notFoundRecords.push({ clientName, orderCode });
console.log(`Tidak ditemukan: ${clientName} - ${orderCode}`);
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

const responseMessage = `Replace selesai. ${matchedCount} data berhasil diupdate, ${notFoundCount} data tidak ditemukan.`;

console.log("Hasil replace:", {
total: dataArray.length,
matched: matchedCount,
notFound: notFoundCount
});

res.status(200).json({
message: responseMessage,
summary: {
totalProcessed: dataArray.length,
successfulUpdates: matchedCount,
notFound: notFoundCount
},
updatedRecords: updatedRecords,
notFoundRecords: notFoundRecords
});

} catch (error) {
console.error("Replace error:", error.message);
res.status(500).json({ message: "Replace gagal", error: error.message });
}
};

const getAllData = async (req, res) => {
try {
const data = await ExcelData.find();
res.status(200).json(data);
} catch (error) {
console.error("Get error:", error.message);
res.status(500).json({ message: "Gagal mengambil data", error: error.message });
}
};

const getDataByClient = async (req, res) => {
try {
const client = req.params.client;
console.log("Mencari clientName:", client);

const data = await ExcelData.find({
"Client Name": { $regex: new RegExp(client, "i") }
});

console.log("Jumlah data ditemukan:", data.length);
res.status(200).json(data);
} catch (error) {
console.error("Gagal mengambil data:", error.message);
res.status(500).json({ message: "Gagal ambil data", error: error.message });
}
};

module.exports = {
uploadData,
appendData,
getAllData,
getDataByClient,
replaceData,
};