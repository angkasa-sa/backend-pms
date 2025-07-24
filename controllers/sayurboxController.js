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
  return dataArray.map(item => {
    if (!item.order_no || !item.hub_name || !item.driver_name) {
      throw new Error("Order No, Hub Name, dan Driver Name wajib diisi");
    }

    return {
      orderNo: item.order_no,
      timeSlot: item.time_slot || '',
      channel: item.channel || '',
      deliveryDate: item.delivery_date || '',
      driverName: item.driver_name,
      hubName: item.hub_name,
      shippedAt: item.shipped_at || '',
      deliveredAt: item.delivered_at || '',
      puOrder: item.pu_order || '',
      timeSlotStart: item.time_slot_start || '',
      latePickupMinute: parseFloat(item.late_pickup_minute) || 0,
      puAfterTsMinute: parseFloat(item.pu_after_ts_minute) || 0,
      timeSlotEnd: item.time_slot_end || '',
      lateDeliveryMinute: parseFloat(item.late_delivery_minute) || 0,
      isOntime: item.is_ontime === true || item.is_ontime === 'true' || item.is_ontime === '1',
      distanceInKm: parseFloat(item.distance_in_km) || 0,
      totalWeightPerorder: parseFloat(item.total_weight_perorder) || 0,
      paymentMethod: item.payment_method || '',
      monthly: item.Monthly || ''
    };
  });
};

const uploadSayurboxData = async (req, res) => {
  try {
    const dataArray = req.body;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ 
        message: "Data sayurbox tidak valid atau kosong." 
      });
    }

    console.log(`Uploading ${dataArray.length} sayurbox records (replace mode)...`);

    await SayurboxData.deleteMany({});
    console.log("Existing sayurbox data cleared");

    const transformedData = transformSayurboxData(dataArray);

    const batchSize = 1000;
    let totalInserted = 0;

    for (let i = 0; i < transformedData.length; i += batchSize) {
      const batch = transformedData.slice(i, i + batchSize);
      const inserted = await SayurboxData.insertMany(batch, { ordered: false });
      totalInserted += inserted.length;
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${inserted.length} records inserted`);
    }

    console.log(`Total sayurbox data inserted: ${totalInserted}`);

    res.status(201).json({
      message: "Data sayurbox berhasil disimpan ke database",
      count: totalInserted,
      summary: {
        totalRecords: totalInserted,
        success: true
      }
    });

  } catch (error) {
    console.error("Upload sayurbox error:", error.message);
    res.status(500).json({ 
      message: "Upload data sayurbox gagal", 
      error: error.message 
    });
  }
};

const appendSayurboxData = async (req, res) => {
  try {
    const dataArray = req.body;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ 
        message: "Data sayurbox tidak valid atau kosong." 
      });
    }

    console.log(`Appending ${dataArray.length} sayurbox records...`);

    const transformedData = transformSayurboxData(dataArray);

    const batchSize = 1000;
    let totalUpserted = 0;
    let totalModified = 0;

    for (let i = 0; i < transformedData.length; i += batchSize) {
      const batch = transformedData.slice(i, i + batchSize);
      
      const bulkOps = batch.map(item => ({
        updateOne: {
          filter: { 
            orderNo: item.orderNo, 
            hubName: item.hubName, 
            driverName: item.driverName 
          },
          update: { $set: item },
          upsert: true
        }
      }));

      const result = await SayurboxData.bulkWrite(bulkOps, { ordered: false });
      totalUpserted += result.upsertedCount;
      totalModified += result.modifiedCount;
      
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
    }

    const totalProcessed = totalUpserted + totalModified;
    console.log(`Total sayurbox data processed: ${totalProcessed} (${totalUpserted} new, ${totalModified} updated)`);

    res.status(201).json({
      message: "Data sayurbox berhasil ditambahkan ke database",
      count: totalProcessed,
      upserted: totalUpserted,
      modified: totalModified,
      summary: {
        totalRecords: totalProcessed,
        dataAdded: totalUpserted,
        dataUpdated: totalModified,
        success: true
      }
    });

  } catch (error) {
    console.error("Append sayurbox error:", error.message);
    res.status(500).json({ 
      message: "Append data sayurbox gagal", 
      error: error.message 
    });
  }
};

const getAllSayurboxData = async (req, res) => {
  try {
    const { page = 1, limit = 1000 } = req.query;
    const skip = (page - 1) * limit;

    const data = await SayurboxData.find()
      .sort({ hubName: 1, driverName: 1, deliveryDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SayurboxData.countDocuments();

    res.status(200).json({
      message: "Data sayurbox berhasil diambil",
      count: data.length,
      total: total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: data
    });
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
    .limit(parseInt(limit));

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
    .limit(parseInt(limit));

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
      estimatedMatches: Math.min(sayurboxCount, excelCount)
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
  try {
    console.log("Starting data comparison process...");

    const session = await ExcelData.db.startSession();
    session.startTransaction();

    try {
      const sayurboxData = await SayurboxData.find({}, { 
        orderNo: 1, 
        totalWeightPerorder: 1, 
        distanceInKm: 1 
      }).lean();

      if (sayurboxData.length === 0) {
        return res.status(400).json({
          message: "Tidak ada data Sayurbox untuk dibandingkan"
        });
      }

      console.log(`Found ${sayurboxData.length} Sayurbox records`);

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

      const batchSize = 1000;
      let totalUpdated = 0;
      let totalChecked = 0;
      let matchedRecords = 0;
      let unmatchedExcelCodes = [];
      const processedExcelCodes = new Set();

      const excelDataCount = await ExcelData.countDocuments();
      console.log(`Total ExcelData records to process: ${excelDataCount}`);

      for (let skip = 0; skip < excelDataCount; skip += batchSize) {
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
            }

            const unmatchedSayurboxCodes = Array.from(sayurboxOrderNos).filter(orderNo => 
                !processedExcelCodes.has(orderNo)
            );

            await session.commitTransaction();

            const notMatchedRecords = totalChecked - matchedRecords;

            console.log(`Comparison completed: ${totalUpdated} records updated out of ${totalChecked} checked`);
            console.log(`Unmatched Excel Order Codes: ${unmatchedExcelCodes.length}`);
            console.log(`Unmatched Sayurbox Order Nos: ${unmatchedSayurboxCodes.length}`);

            res.status(200).json({
                message: `Data comparison completed successfully`,
                summary: {
                    totalChecked,
                    totalUpdated,
                    matchedRecords,
                    notMatchedRecords,
                    unmatchedExcelCount: unmatchedExcelCodes.length,
                    unmatchedSayurboxCount: unmatchedSayurboxCodes.length,
                    success: true
                },
                unmatchedExcelCodes: unmatchedExcelCodes.slice(0, 500),
                unmatchedSayurboxCodes: unmatchedSayurboxCodes.slice(0, 500),
                hasMoreUnmatchedExcel: unmatchedExcelCodes.length > 500,
                hasMoreUnmatchedSayurbox: unmatchedSayurboxCodes.length > 500
            });

        } catch (transactionError) {
            await session.abortTransaction();
            throw transactionError;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error("Compare data error:", error.message);
        res.status(500).json({
            message: "Compare data gagal",
            error: error.message
        });
    }
};

module.exports = {
    uploadSayurboxData,
    appendSayurboxData,
    getAllSayurboxData,
    getSayurboxDataByHub,
    getSayurboxDataByDriver,
    deleteSayurboxData,
    compareDataSayurbox,
    getDataInfo
};