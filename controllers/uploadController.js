const ExcelData = require("../models/ExcelData");

const OPTIMAL_BATCH_SIZE = 500;
const MAX_MEMORY_THRESHOLD = 100 * 1024 * 1024;
const BULK_WRITE_OPTIONS = {
    ordered: false,
    writeConcern: { w: 1, j: false },
    maxTimeMS: 300000
};

const memoryMonitor = {
    checkMemory() {
        const usage = process.memoryUsage();
        return {
            used: usage.heapUsed,
            isHigh: usage.heapUsed > MAX_MEMORY_THRESHOLD
        };
    },
    
    async forceGC() {
        if (global.gc) {
            global.gc();
            await new Promise(resolve => setImmediate(resolve));
        }
    }
};

const processBulkInsert = async (batch) => {
    try {
        const bulkOps = batch.map(doc => ({
            insertOne: { document: doc }
        }));
        
        const result = await ExcelData.bulkWrite(bulkOps, BULK_WRITE_OPTIONS);
        return { success: result.insertedCount, errors: 0 };
    } catch (error) {
        console.error('Bulk insert error:', error.message);
        
        if (error.writeErrors && error.writeErrors.length < batch.length / 2) {
            return { 
                success: batch.length - error.writeErrors.length, 
                errors: error.writeErrors.length 
            };
        }
        throw error;
    }
};

const processBulkReplace = async (batch) => {
    try {
        const bulkOps = batch.map(item => ({
            replaceOne: {
                filter: { 
                    "Client Name": item["Client Name"], 
                    "Order Code": item["Order Code"] 
                },
                replacement: item,
                upsert: true
            }
        }));
        
        const result = await ExcelData.bulkWrite(bulkOps, BULK_WRITE_OPTIONS);
        return { 
            matched: result.matchedCount,
            modified: result.modifiedCount,
            upserted: result.upsertedCount,
            errors: 0
        };
    } catch (error) {
        console.error('Bulk replace error:', error.message);
        throw error;
    }
};

const uploadData = async (req, res) => {
    let startTime = Date.now();
    
    try {
        const dataArray = req.body;

        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return res.status(400).json({ 
                message: "Data tidak valid atau kosong.",
                timestamp: new Date().toISOString()
            });
        }

        console.log(`🚀 Starting upload process for ${dataArray.length} records`);

        await ExcelData.deleteMany({}).maxTimeMS(60000);
        console.log("✅ Existing data cleared");

        let totalInserted = 0;
        let totalErrors = 0;
        const totalBatches = Math.ceil(dataArray.length / OPTIMAL_BATCH_SIZE);
        
        for (let i = 0; i < dataArray.length; i += OPTIMAL_BATCH_SIZE) {
            const batch = dataArray.slice(i, i + OPTIMAL_BATCH_SIZE);
            const currentBatch = Math.floor(i / OPTIMAL_BATCH_SIZE) + 1;
            
            console.log(`📦 Processing batch ${currentBatch}/${totalBatches} (${batch.length} records)`);

            const result = await processBulkInsert(batch);
            totalInserted += result.success;
            totalErrors += result.errors;

            const memCheck = memoryMonitor.checkMemory();
            if (memCheck.isHigh) {
                console.log(`⚠️ High memory usage detected: ${Math.round(memCheck.used / 1024 / 1024)}MB`);
                await memoryMonitor.forceGC();
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (currentBatch % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Upload completed in ${duration}ms: ${totalInserted} inserted, ${totalErrors} errors`);

        res.status(201).json({
            message: `Data berhasil disimpan. ${totalInserted} records berhasil diupload, ${totalErrors} errors.`,
            summary: {
                totalProcessed: dataArray.length,
                totalInserted,
                totalErrors,
                batches: totalBatches,
                batchSize: OPTIMAL_BATCH_SIZE,
                duration: `${duration}ms`
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Upload failed after ${duration}ms:`, error.message);
        
        res.status(500).json({ 
            message: "Upload gagal", 
            error: error.message,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
        });
    }
};

const appendData = async (req, res) => {
    let startTime = Date.now();
    
    try {
        const dataArray = req.body;

        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return res.status(400).json({ 
                message: "Data tidak valid atau kosong.",
                timestamp: new Date().toISOString()
            });
        }

        console.log(`🚀 Starting append process for ${dataArray.length} records`);

        const countBefore = await ExcelData.estimatedDocumentCount();
        console.log(`📊 Records before append: ${countBefore}`);

        let totalInserted = 0;
        let totalErrors = 0;
        const totalBatches = Math.ceil(dataArray.length / OPTIMAL_BATCH_SIZE);
        
        for (let i = 0; i < dataArray.length; i += OPTIMAL_BATCH_SIZE) {
            const batch = dataArray.slice(i, i + OPTIMAL_BATCH_SIZE);
            const currentBatch = Math.floor(i / OPTIMAL_BATCH_SIZE) + 1;
            
            console.log(`📦 Processing append batch ${currentBatch}/${totalBatches} (${batch.length} records)`);

            const result = await processBulkInsert(batch);
            totalInserted += result.success;
            totalErrors += result.errors;

            const memCheck = memoryMonitor.checkMemory();
            if (memCheck.isHigh) {
                await memoryMonitor.forceGC();
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (currentBatch % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const countAfter = await ExcelData.estimatedDocumentCount();
        const duration = Date.now() - startTime;
        
        console.log(`✅ Append completed in ${duration}ms: ${totalInserted} new records added`);

        res.status(201).json({
            message: `${totalInserted} data baru berhasil ditambahkan. Total data sekarang: ~${countAfter}`,
            summary: {
                dataBefore: countBefore,
                dataAdded: totalInserted,
                dataAfter: countAfter,
                totalErrors,
                batches: totalBatches,
                batchSize: OPTIMAL_BATCH_SIZE,
                duration: `${duration}ms`
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Append failed after ${duration}ms:`, error.message);
        
        res.status(500).json({ 
            message: "Append gagal", 
            error: error.message,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
        });
    }
};

const replaceData = async (req, res) => {
    let startTime = Date.now();
    
    try {
        const dataArray = req.body;

        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return res.status(400).json({ 
                message: "Data replace tidak valid atau kosong.",
                timestamp: new Date().toISOString()
            });
        }

        console.log(`🚀 Starting replace process for ${dataArray.length} records`);

        let totalMatched = 0;
        let totalModified = 0;
        let totalUpserted = 0;
        let totalErrors = 0;
        
        const totalBatches = Math.ceil(dataArray.length / OPTIMAL_BATCH_SIZE);

        for (let i = 0; i < dataArray.length; i += OPTIMAL_BATCH_SIZE) {
            const batch = dataArray.slice(i, i + OPTIMAL_BATCH_SIZE);
            const currentBatch = Math.floor(i / OPTIMAL_BATCH_SIZE) + 1;
            
            console.log(`📦 Processing replace batch ${currentBatch}/${totalBatches} (${batch.length} records)`);

            try {
                const result = await processBulkReplace(batch);
                totalMatched += result.matched;
                totalModified += result.modified;
                totalUpserted += result.upserted;
                totalErrors += result.errors;
            } catch (batchError) {
                console.error(`Batch ${currentBatch} failed:`, batchError.message);
                totalErrors += batch.length;
            }

            const memCheck = memoryMonitor.checkMemory();
            if (memCheck.isHigh) {
                await memoryMonitor.forceGC();
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (currentBatch % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Replace completed in ${duration}ms: ${totalModified} updated, ${totalUpserted} created, ${totalErrors} errors`);

        res.status(200).json({
            message: `Replace selesai. ${totalModified} records diupdate, ${totalUpserted} records baru dibuat, ${totalErrors} errors.`,
            summary: {
                totalProcessed: dataArray.length,
                matched: totalMatched,
                modified: totalModified,
                upserted: totalUpserted,
                errors: totalErrors,
                batches: totalBatches,
                batchSize: OPTIMAL_BATCH_SIZE,
                duration: `${duration}ms`
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Replace failed after ${duration}ms:`, error.message);
        
        res.status(500).json({ 
            message: "Replace gagal", 
            error: error.message,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
        });
    }
};

const getAllData = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(5000, Math.max(100, parseInt(req.query.limit) || 1000));
        const skip = (page - 1) * limit;

        const [total, data] = await Promise.all([
            ExcelData.estimatedDocumentCount(),
            ExcelData.find({}, null, { 
                skip, 
                limit, 
                lean: true,
                maxTimeMS: 30000
            })
        ]);

        res.status(200).json({
            data,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalRecords: total,
                hasNext: page * limit < total,
                hasPrev: page > 1,
                limit
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error("Get all data error:", error.message);
        res.status(500).json({ 
            message: "Gagal mengambil data", 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

const getDataByClient = async (req, res) => {
    try {
        const client = req.params.client;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(5000, Math.max(100, parseInt(req.query.limit) || 1000));
        const skip = (page - 1) * limit;

        console.log(`🔍 Searching for client: ${client}`);

        const filter = { "Client Name": new RegExp(client, "i") };
        
        const [total, data] = await Promise.all([
            ExcelData.countDocuments(filter).maxTimeMS(30000),
            ExcelData.find(filter, null, { 
                skip, 
                limit, 
                lean: true,
                maxTimeMS: 30000
            })
        ]);

        console.log(`✅ Found ${data.length} records for client: ${client}`);

        res.status(200).json({
            data,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalRecords: total,
                hasNext: page * limit < total,
                hasPrev: page > 1,
                limit
            },
            client,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error("Get client data error:", error.message);
        res.status(500).json({ 
            message: "Gagal ambil data", 
            error: error.message,
            timestamp: new Date().toISOString()
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