const ExcelData = require("../models/ExcelData");

const BATCH_SIZE = 1000;

const processBatch = async (batch, operation = 'insert') => {
  try {
    switch (operation) {
      case 'insert':
        return await ExcelData.insertMany(batch, { ordered: false });
      case 'replace':
        const results = [];
        for (const item of batch) {
          const result = await ExcelData.replaceOne(
            { 
              "Client Name": item["Client Name"], 
              "Order Code": item["Order Code"] 
            },
            item,
            { upsert: true }
          );
          results.push(result);
        }
        return results;
      default:
        throw new Error('Invalid operation');
    }
  } catch (error) {
    console.error(`Batch ${operation} error:`, error.message);
    throw error;
  }
};

const uploadData = async (req, res) => {
  try {
    const dataArray = req.body;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ message: "Data tidak valid atau kosong." });
    }

    console.log(`Starting upload process for ${dataArray.length} records`);

    await ExcelData.deleteMany({});
    console.log("Existing data cleared");

    let totalInserted = 0;
    let currentBatch = 1;
    const totalBatches = Math.ceil(dataArray.length / BATCH_SIZE);

    for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
      const batch = dataArray.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${currentBatch}/${totalBatches} (${batch.length} records)`);
      
      const inserted = await processBatch(batch, 'insert');
      totalInserted += inserted.length;
      currentBatch++;

      if (currentBatch % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Upload completed: ${totalInserted} records inserted`);

    res.status(201).json({
      message: "Data berhasil disimpan. Data lama dihapus.",
      summary: {
        totalProcessed: dataArray.length,
        totalInserted: totalInserted,
        batches: totalBatches,
        batchSize: BATCH_SIZE
      }
    });

  } catch (error) {
    console.error("Upload error:", error.message);
    res.status(500).json({ 
      message: "Upload gagal", 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

const appendData = async (req, res) => {
  try {
    const dataArray = req.body;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ message: "Data tidak valid atau kosong." });
    }

    console.log(`Starting append process for ${dataArray.length} records`);

    const countBefore = await ExcelData.countDocuments();
    console.log("Records before append:", countBefore);

    let totalInserted = 0;
    let currentBatch = 1;
    const totalBatches = Math.ceil(dataArray.length / BATCH_SIZE);

    for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
      const batch = dataArray.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${currentBatch}/${totalBatches} (${batch.length} records)`);
      
      const inserted = await processBatch(batch, 'insert');
      totalInserted += inserted.length;
      currentBatch++;

      if (currentBatch % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const countAfter = await ExcelData.countDocuments();
    console.log(`Append completed: ${totalInserted} new records added`);

    res.status(201).json({
      message: `${totalInserted} data baru berhasil ditambahkan. Total data sekarang: ${countAfter}`,
      summary: {
        dataBefore: countBefore,
        dataAdded: totalInserted,
        dataAfter: countAfter,
        batches: totalBatches,
        batchSize: BATCH_SIZE
      }
    });

  } catch (error) {
    console.error("Append error:", error.message);
    res.status(500).json({ 
      message: "Append gagal", 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

const replaceData = async (req, res) => {
  try {
    const dataArray = req.body;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ message: "Data replace tidak valid atau kosong." });
    }

    console.log(`Starting replace process for ${dataArray.length} records`);

    let matchedCount = 0;
    let notFoundCount = 0;
    let updatedRecords = [];
    let notFoundRecords = [];

    let currentBatch = 1;
    const totalBatches = Math.ceil(dataArray.length / BATCH_SIZE);

    for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
      const batch = dataArray.slice(i, i + BATCH_SIZE);
      console.log(`Processing replace batch ${currentBatch}/${totalBatches} (${batch.length} records)`);

      for (const item of batch) {
        const { clientName, orderCode, updateData } = item;

        if (!clientName || !orderCode) {
          notFoundCount++;
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
            continue;
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
          } else {
            notFoundCount++;
            notFoundRecords.push({ clientName, orderCode });
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

      currentBatch++;
      if (currentBatch % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Replace completed: ${matchedCount} updated, ${notFoundCount} not found`);

    res.status(200).json({
      message: `Replace selesai. ${matchedCount} data berhasil diupdate, ${notFoundCount} data tidak ditemukan.`,
      summary: {
        totalProcessed: dataArray.length,
        successfulUpdates: matchedCount,
        notFound: notFoundCount,
        batches: totalBatches,
        batchSize: BATCH_SIZE
      },
      updatedRecords: updatedRecords.slice(0, 100),
      notFoundRecords: notFoundRecords.slice(0, 100)
    });

  } catch (error) {
    console.error("Replace error:", error.message);
    res.status(500).json({ 
      message: "Replace gagal", 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

const getAllData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    const total = await ExcelData.countDocuments();
    const data = await ExcelData.find().skip(skip).limit(limit).lean();

    res.status(200).json({
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Get error:", error.message);
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    console.log("Searching for client:", client);

    const filter = { "Client Name": { $regex: new RegExp(client, "i") } };
    const total = await ExcelData.countDocuments(filter);
    const data = await ExcelData.find(filter).skip(skip).limit(limit).lean();

    console.log(`Found ${data.length} records for client: ${client}`);

    res.status(200).json({
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
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