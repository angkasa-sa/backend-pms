const Mitra = require("../models/MitraModel");
const ShipmentPerformance = require("../models/ShipmentPerformance");

const parseRegisteredAt = (dateString) => {
  if (!dateString || dateString.trim() === '' || dateString === '-') return null;

  const formats = [
    /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(WIB|WITA|WIT)/i,
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{2})\/(\d{2})\/(\d{4})/
  ];

  const monthMap = {
    jan: 0, januari: 0, january: 0,
    feb: 1, februari: 1, february: 1,
    mar: 2, maret: 2, march: 2,
    apr: 3, april: 3,
    mei: 4, may: 4,
    jun: 5, juni: 5, june: 5,
    jul: 6, juli: 6, july: 6,
    agu: 7, agustus: 7, august: 7, aug: 7,
    sep: 8, september: 8,
    okt: 9, oktober: 9, october: 9, oct: 9,
    nov: 10, november: 10,
    des: 11, desember: 11, december: 11, dec: 11
  };

  for (const format of formats) {
    const match = dateString.match(format);
    if (match) {
      if (format === formats[0]) {
        const day = parseInt(match[1]);
        const monthStr = match[2].toLowerCase();
        const year = parseInt(match[3]);
        const month = monthMap[monthStr];
        if (month !== undefined) {
          return new Date(year, month, day);
        }
      } else if (format === formats[1]) {
        return new Date(match[1], parseInt(match[2]) - 1, match[3]);
      } else if (format === formats[2]) {
        return new Date(match[3], parseInt(match[2]) - 1, match[1]);
      }
    }
  }

  const timestamp = Date.parse(dateString);
  if (!isNaN(timestamp)) {
    return new Date(timestamp);
  }

  return null;
};

const parseDeliveryDate = (dateString) => {
  if (!dateString || dateString.trim() === '' || dateString === '-') return null;

  const ddmmyyyyPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateString.match(ddmmyyyyPattern);

  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  return null;
};

const MONTH_NAMES = {
  0: 'January', 1: 'February', 2: 'March', 3: 'April',
  4: 'May', 5: 'June', 6: 'July', 7: 'August',
  8: 'September', 9: 'October', 10: 'November', 11: 'December'
};

const findDuplicates = async (dataArray) => {
  const phoneNumberSet = new Set();
  const duplicatesInPayload = [];

  dataArray.forEach((item, index) => {
    const duplicateFields = [];

    if (item.phoneNumber && phoneNumberSet.has(item.phoneNumber.toLowerCase())) {
      duplicateFields.push('phoneNumber');
    } else if (item.phoneNumber) {
      phoneNumberSet.add(item.phoneNumber.toLowerCase());
    }

    if (duplicateFields.length > 0) {
      duplicatesInPayload.push({
        row: index + 2,
        data: item,
        duplicateFields
      });
    }
  });

  const phoneNumbers = dataArray.map(d => d.phoneNumber).filter(Boolean);

  const existingMitras = await Mitra.find({
    phoneNumber: { $in: phoneNumbers }
  });

  const existingPhoneNumbers = new Set(existingMitras.map(d => d.phoneNumber?.toLowerCase()));

  const duplicatesInDB = [];

  dataArray.forEach((item, index) => {
    const duplicateFields = [];

    if (item.phoneNumber && existingPhoneNumbers.has(item.phoneNumber.toLowerCase())) {
      duplicateFields.push('phoneNumber');
    }

    if (duplicateFields.length > 0) {
      duplicatesInDB.push({
        row: index + 2,
        data: item,
        duplicateFields
      });
    }
  });

  return {
    duplicatesInPayload,
    duplicatesInDB,
    hasDuplicates: duplicatesInPayload.length > 0 || duplicatesInDB.length > 0
  };
};

const uploadMitraData = async (req, res) => {
  try {
    const dataArray = req.body;
    const replaceAll = req.headers['x-replace-data'] === 'true';

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ 
        message: "Data mitra kosong atau tidak valid.",
        success: false
      });
    }

    console.log(`Processing ${dataArray.length} mitra records for upload (replaceAll: ${replaceAll})`);

    const validationResult = await findDuplicates(dataArray);

    if (replaceAll) {
      await Mitra.deleteMany({});
      console.log("🗑️ Data mitra lama dihapus");
    }

    const inserted = await Mitra.insertMany(dataArray);
    console.log(`✅ Data mitra disimpan: ${inserted.length} records`);

    const response = {
      message: `Data mitra berhasil disimpan: ${inserted.length} records`,
      data: inserted,
      summary: {
        totalRecords: inserted.length,
        success: true
      },
      success: true
    };

    if (validationResult.hasDuplicates) {
      const totalDuplicates = validationResult.duplicatesInPayload.length + validationResult.duplicatesInDB.length;

      response.warning = {
        message: `Perhatian: Ditemukan ${totalDuplicates} data dengan phoneNumber duplikat`,
        duplicates: {
          inPayload: validationResult.duplicatesInPayload,
          inDatabase: validationResult.duplicatesInDB,
          total: totalDuplicates
        }
      };

      console.warn(`⚠️ Duplicate warning: ${totalDuplicates} records with duplicate phoneNumber`);
    }

    res.status(201).json(response);
  } catch (error) {
    console.error("Mitra upload error:", error.message);
    res.status(500).json({ 
      message: "Upload data mitra gagal", 
      error: error.message,
      success: false
    });
  }
};

const getAllMitras = async (req, res) => {
  try {
    console.log("Fetching all mitra data");

    const data = await Mitra.find().sort({ createdAt: -1 });

    console.log(`✅ Retrieved ${data.length} mitra records`);

    res.status(200).json(data);
  } catch (err) {
    console.error("Gagal ambil data mitra:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil data mitra", 
      error: err.message,
      success: false
    });
  }
};

const getMitraDashboardStats = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
        error: "Please provide both month and year",
        success: false
      });
    }

    console.log(`Generating dashboard stats for ${month}/${year}`);

    const allMitras = await Mitra.find({});

    const filteredMitras = allMitras.filter(mitra => {
      let dateToUse = parseRegisteredAt(mitra.registeredAt);
      if (!dateToUse) {
        dateToUse = parseRegisteredAt(mitra.createdAt);
      }
      if (!dateToUse) return false;

      const registeredMonth = dateToUse.getMonth() + 1;
      const registeredYear = dateToUse.getFullYear();

      return registeredMonth === month && registeredYear === year;
    });

    const statusList = [
      'Active',
      'New',
      'Driver Training',
      'Registered',
      'Inactive',
      'Banned',
      'Invalid Documents',
      'Pending Verification'
    ];

    const stats = {};
    statusList.forEach(status => {
      stats[status] = 0;
    });

    filteredMitras.forEach(mitra => {
      const status = mitra.mitraStatus;
      if (status && stats.hasOwnProperty(status)) {
        stats[status]++;
      } else if (status) {
        if (!stats[status]) {
          stats[status] = 0;
        }
        stats[status]++;
      }
    });

    const totalMitras = filteredMitras.length;

    console.log(`✅ Dashboard stats generated: ${totalMitras} mitras found for ${month}/${year}`);

    res.status(200).json({
      message: `Dashboard stats for ${month}/${year}`,
      data: stats,
      summary: {
        totalMitras,
        month,
        year,
        statusBreakdown: Object.keys(stats).map(status => ({
          status,
          count: stats[status],
          percentage: totalMitras > 0 ? ((stats[status] / totalMitras) * 100).toFixed(2) : 0
        }))
      },
      success: true
    });
  } catch (error) {
    console.error("Dashboard stats error:", error.message);
    res.status(500).json({
      message: "Failed to generate dashboard statistics",
      error: error.message,
      success: false
    });
  }
};

const getRiderActiveInactiveStats = async (req, res) => {
  try {
    console.log("Fetching rider active/inactive statistics from shipment data");

    const allShipments = await ShipmentPerformance.find({});

    const monthYearMap = new Map();

    allShipments.forEach(shipment => {
      const deliveryDate = shipment.delivery_date;
      const mitraName = shipment.mitra_name;

      if (!deliveryDate || deliveryDate === '-' || !mitraName || mitraName === '-') return;

      const parsedDate = parseDeliveryDate(deliveryDate);
      if (!parsedDate) return;

      const month = MONTH_NAMES[parsedDate.getMonth()];
      const year = parsedDate.getFullYear();

      const key = `${year}_${month}`;

      if (!monthYearMap.has(key)) {
        monthYearMap.set(key, {
          month,
          year,
          monthNumber: parsedDate.getMonth() + 1,
          activeRiders: new Set()
        });
      }

      monthYearMap.get(key).activeRiders.add(mitraName);
    });

    const sortedPeriods = Array.from(monthYearMap.entries())
      .map(([key, value]) => ({
        key,
        month: value.month,
        year: parseInt(value.year),
        monthNumber: value.monthNumber,
        activeRiders: value.activeRiders
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.monthNumber - b.monthNumber;
      });

    const result = [];

    for (let i = 0; i < sortedPeriods.length; i++) {
      const current = sortedPeriods[i];
      const previous = i > 0 ? sortedPeriods[i - 1] : null;

      const activeCount = current.activeRiders.size;
      const activeRiders = Array.from(current.activeRiders);

      let inactiveCount = 0;
      let inactiveRiders = [];

      if (previous) {
        const previousActiveRiders = previous.activeRiders;

        inactiveRiders = Array.from(previousActiveRiders).filter(
          rider => !current.activeRiders.has(rider)
        );
        inactiveCount = inactiveRiders.length;
      }

      result.push({
        month: current.month,
        year: current.year.toString(),
        activeCount,
        activeRiders,
        inactiveCount,
        inactiveRiders,
        totalUniqueRiders: activeCount + inactiveCount
      });
    }

    console.log(`✅ Rider active/inactive stats generated: ${result.length} periods found`);

    res.status(200).json({
      message: "Rider active/inactive statistics by month and year",
      data: result,
      summary: {
        totalPeriods: result.length,
        totalShipmentRecords: allShipments.length
      },
      success: true
    });
  } catch (error) {
    console.error("Rider active/inactive stats error:", error.message);
    res.status(500).json({
      message: "Failed to generate rider active/inactive statistics",
      error: error.message,
      success: false
    });
  }
};

const getRiderWeeklyStats = async (req, res) => {
  try {
    console.log("Fetching rider weekly statistics from shipment data");

    const allShipments = await ShipmentPerformance.find({}).sort({ createdAt: 1 });
    const allMitras = await Mitra.find({});

    const weekYearMonthMap = new Map();

    allShipments.forEach(shipment => {
      const deliveryDate = shipment.delivery_date;
      const weekly = shipment.weekly;
      const mitraName = shipment.mitra_name;

      if (!deliveryDate || deliveryDate === '-' || !weekly || weekly === '-' || !mitraName || mitraName === '-') return;

      const parsedDate = parseDeliveryDate(deliveryDate);
      if (!parsedDate) return;

      const month = MONTH_NAMES[parsedDate.getMonth()];
      const year = parsedDate.getFullYear();

      const key = `${year}_${month}_${weekly}`;

      if (!weekYearMonthMap.has(key)) {
        weekYearMonthMap.set(key, {
          week: weekly,
          month,
          year,
          monthNumber: parsedDate.getMonth() + 1,
          activeRiders: new Set()
        });
      }

      weekYearMonthMap.get(key).activeRiders.add(mitraName);
    });

    allMitras.forEach(mitra => {
      let dateToUse = parseRegisteredAt(mitra.registeredAt);
      if (!dateToUse) {
        dateToUse = parseRegisteredAt(mitra.createdAt);
      }
      if (!dateToUse) return;

      const month = MONTH_NAMES[dateToUse.getMonth()];
      const year = dateToUse.getFullYear().toString();

      const existingWeeks = Array.from(weekYearMonthMap.keys())
        .filter(key => key.startsWith(`${year}_${month}_`))
        .map(key => key.split('_')[2]);

      let week;
      if (existingWeeks.length > 0) {
        const day = dateToUse.getDate();
        const matchingWeek = existingWeeks.find(w => {
          const weekNum = parseInt(w.replace(/\D/g, '')) || 0;
          const weekStart = (weekNum - 1) * 7 + 1;
          const weekEnd = weekNum * 7;
          return day >= weekStart && day <= weekEnd;
        });
        week = matchingWeek || existingWeeks[0];
      } else {
        const day = dateToUse.getDate();
        const weekNumber = Math.ceil(day / 7);
        week = `week ${weekNumber}`;
      }

      const status = mitra.mitraStatus || 'Unknown';
      const key = `${year}_${month}_${week}`;

      if (!weekYearMonthMap.has(key)) {
        weekYearMonthMap.set(key, {
          week,
          month,
          year,
          monthNumber: dateToUse.getMonth() + 1,
          activeRiders: new Set(),
          statusCounts: {},
          total: 0
        });
      }

      const entry = weekYearMonthMap.get(key);
      if (!entry.statusCounts) {
        entry.statusCounts = {};
      }
      entry.statusCounts[status] = (entry.statusCounts[status] || 0) + 1;
      entry.total = (entry.total || 0) + 1;
    });

    const sortedPeriods = Array.from(weekYearMonthMap.entries())
      .map(([key, value]) => ({
        key,
        week: value.week,
        month: value.month,
        year: parseInt(value.year),
        monthNumber: value.monthNumber,
        activeRiders: value.activeRiders,
        statusCounts: value.statusCounts || {},
        total: value.total || 0
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        if (a.monthNumber !== b.monthNumber) return a.monthNumber - b.monthNumber;

        const weekNumA = parseInt(a.week.replace(/[^\d]/g, '')) || 0;
        const weekNumB = parseInt(b.week.replace(/[^\d]/g, '')) || 0;
        return weekNumA - weekNumB;
      });

    const result = [];

    for (let i = 0; i < sortedPeriods.length; i++) {
      const current = sortedPeriods[i];
      const previous = i > 0 ? sortedPeriods[i - 1] : null;

      const activeCount = current.activeRiders.size;
      const activeRiders = Array.from(current.activeRiders);

      let inactiveCount = 0;
      let inactiveRiders = [];

      if (previous) {
        const previousActiveRiders = previous.activeRiders;

        inactiveRiders = Array.from(previousActiveRiders).filter(
          rider => !current.activeRiders.has(rider)
        );
        inactiveCount = inactiveRiders.length;
      }

      const activeStatusCount = current.statusCounts['Active'] || 0;

      let previousActiveRidersCount = 0;
      if (previous) {
        previousActiveRidersCount = previous.activeRiders.size;
      }

      const gettingValue = previousActiveRidersCount - inactiveCount + activeStatusCount;

      let retentionRate = null;
      if (previousActiveRidersCount > 0) {
        const numerator = activeCount - activeStatusCount;
        retentionRate = (numerator / previousActiveRidersCount) * 100;
      }

      let churnRate = null;
      if (previousActiveRidersCount > 0 && inactiveCount > 0) {
        churnRate = (inactiveCount / previousActiveRidersCount) * 100;
      }

      result.push({
        week: current.week,
        month: current.month,
        year: current.year.toString(),
        activeCount,
        activeRiders,
        inactiveCount,
        inactiveRiders,
        statusCounts: current.statusCounts,
        total: current.total,
        gettingValue: Math.max(0, gettingValue),
        retentionRate,
        churnRate,
        totalUniqueRiders: activeCount + inactiveCount
      });
    }

    console.log(`✅ Rider weekly stats generated: ${result.length} periods found`);

    res.status(200).json({
      message: "Rider active/inactive statistics by week, month and year with mitra status",
      data: result,
      summary: {
        totalPeriods: result.length,
        totalShipmentRecords: allShipments.length,
        totalMitraRecords: allMitras.length
      },
      success: true
    });
  } catch (error) {
    console.error("Rider weekly stats error:", error.message);
    res.status(500).json({
      message: "Failed to generate rider weekly statistics",
      error: error.message,
      success: false
    });
  }
};

const updateMitraData = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log(`Updating mitra ID: ${id}`);

    if (!id) {
      return res.status(400).json({
        message: "ID mitra tidak valid",
        error: "Mitra ID is required",
        success: false
      });
    }

    const existingMitra = await Mitra.findById(id);
    if (!existingMitra) {
      console.warn(`Mitra not found: ${id}`);
      return res.status(404).json({
        message: "Mitra tidak ditemukan",
        error: "Mitra with specified ID does not exist",
        success: false
      });
    }

    if (updateData.phoneNumber && updateData.phoneNumber !== existingMitra.phoneNumber) {
      const phoneNumberDuplicate = await Mitra.findOne({ 
        phoneNumber: updateData.phoneNumber,
        _id: { $ne: id }
      });
      if (phoneNumberDuplicate) {
        return res.status(409).json({
          message: "Data duplikat ditemukan pada field: phoneNumber",
          error: "Duplicate data detected",
          duplicateFields: ['phoneNumber'],
          success: false
        });
      }
    }

    const updatedMitra = await Mitra.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log(`✅ Mitra updated successfully: ${updatedMitra.fullName}`);

    res.status(200).json({
      message: "Data mitra berhasil diperbarui",
      data: updatedMitra,
      success: true
    });
  } catch (error) {
    console.error("Update mitra error:", error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "ID mitra tidak valid",
        error: "Invalid mitra ID format",
        success: false
      });
    }

    res.status(500).json({
      message: "Gagal memperbarui data mitra",
      error: error.message,
      success: false
    });
  }
};

const deleteMitraData = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Deleting mitra ID: ${id}`);

    if (!id) {
      return res.status(400).json({
        message: "ID mitra tidak valid",
        error: "Mitra ID is required",
        success: false
      });
    }

    const deletedMitra = await Mitra.findByIdAndDelete(id);

    if (!deletedMitra) {
      console.warn(`Mitra not found: ${id}`);
      return res.status(404).json({
        message: "Mitra tidak ditemukan",
        error: "Mitra with specified ID does not exist",
        success: false
      });
    }

    console.log(`✅ Mitra deleted successfully: ${deletedMitra.fullName}`);

    res.status(200).json({
      message: "Data mitra berhasil dihapus",
      data: deletedMitra,
      success: true
    });
  } catch (error) {
    console.error("Delete mitra error:", error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "ID mitra tidak valid",
        error: "Invalid mitra ID format",
        success: false
      });
    }

    res.status(500).json({
      message: "Gagal menghapus data mitra",
      error: error.message,
      success: false
    });
  }
};

const deleteMultipleMitraData = async (req, res) => {
  try {
    const { ids } = req.body;

    console.log(`Bulk delete request for ${ids.length} mitras`);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        message: "ID mitra tidak valid",
        error: "Array of mitra IDs is required",
        success: false
      });
    }

    const result = await Mitra.deleteMany({ _id: { $in: ids } });

    console.log(`✅ Bulk delete completed: ${result.deletedCount} mitras deleted`);

    res.status(200).json({
      message: `Berhasil menghapus ${result.deletedCount} data mitra`,
      deletedCount: result.deletedCount,
      success: true
    });
  } catch (error) {
    console.error("Bulk delete mitra error:", error.message);

    res.status(500).json({
      message: "Gagal menghapus data mitra",
      error: error.message,
      success: false
    });
  }
};

module.exports = {
  uploadMitraData,
  getAllMitras,
  getMitraDashboardStats,
  getRiderActiveInactiveStats,
  getRiderWeeklyStats,
  updateMitraData,
  deleteMitraData,
  deleteMultipleMitraData
};