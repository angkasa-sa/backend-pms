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
  return isNaN(timestamp) ? null : new Date(timestamp);
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
  }).select('phoneNumber').lean();

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
      console.log("Data mitra lama dihapus");
    }

    const inserted = await Mitra.insertMany(dataArray, { ordered: false });
    console.log(`Data mitra disimpan: ${inserted.length} records`);

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

      console.warn(`Duplicate warning: ${totalDuplicates} records with duplicate phoneNumber`);
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
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 5000, 5000);
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    console.log(`Fetching mitra data - Page: ${page}, Limit: ${limit}`);

    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { mitraStatus: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const selectFields = 'fullName phoneNumber mitraStatus city registeredAt lastActive hubCategory businessCategory createdAt';

    const [data, totalCount] = await Promise.all([
      Mitra.find(query)
        .select(selectFields)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
        .allowDiskUse(true),
      Mitra.countDocuments(query)
    ]);

    console.log(`Retrieved ${data.length} of ${totalCount} total mitra records`);

    res.status(200).json({
      data: data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalRecords: totalCount,
        recordsPerPage: limit,
        hasNextPage: skip + data.length < totalCount,
        hasPrevPage: page > 1
      },
      success: true
    });
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

    const pipeline = [
      {
        $addFields: {
          registeredDate: {
            $cond: {
              if: { $and: [
                { $ne: ["$registeredAt", null] },
                { $ne: ["$registeredAt", "-"] }
              ]},
              then: "$registeredAt",
              else: "$createdAt"
            }
          }
        }
      },
      {
        $group: {
          _id: "$mitraStatus",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    const allMitras = await Mitra.aggregate(pipeline).allowDiskUse(true);

    const stats = {};
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

    statusList.forEach(status => {
      const found = allMitras.find(m => m._id === status);
      stats[status] = found ? found.count : 0;
    });

    const totalMitras = Object.values(stats).reduce((a, b) => a + b, 0);

    console.log(`Dashboard stats generated: ${totalMitras} mitras found`);

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

    const pipeline = [
      {
        $match: {
          delivery_date: { $ne: '-', $exists: true },
          mitra_name: { $ne: '-', $exists: true }
        }
      },
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: {
                $concat: [
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 2] }, 0, 4] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 1] }, 0, 2] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 0] }, 0, 2] }
                ]
              },
              onError: null
            }
          },
          normalizedMitraName: { $toLower: "$mitra_name" }
        }
      },
      {
        $match: {
          parsedDate: { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$parsedDate" },
            month: { $month: "$parsedDate" },
            mitra: "$normalizedMitraName"
          },
          originalName: { $first: "$mitra_name" }
        }
      },
      {
        $group: {
          _id: {
            year: "$_id.year",
            month: "$_id.month"
          },
          activeRiders: { 
            $addToSet: {
              normalized: "$_id.mitra",
              original: "$originalName"
            }
          }
        }
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1
        }
      }
    ];

    const aggregatedData = await ShipmentPerformance.aggregate(pipeline).allowDiskUse(true);

    const MONTH_NAMES = {
      1: 'January', 2: 'February', 3: 'March', 4: 'April',
      5: 'May', 6: 'June', 7: 'July', 8: 'August',
      9: 'September', 10: 'October', 11: 'November', 12: 'December'
    };

    const result = [];
    
    for (let i = 0; i < aggregatedData.length; i++) {
      const current = aggregatedData[i];
      const previous = i > 0 ? aggregatedData[i - 1] : null;

      const currentRidersMap = new Map();
      current.activeRiders.forEach(rider => {
        currentRidersMap.set(rider.normalized, rider.original);
      });

      const previousRidersMap = new Map();
      if (previous) {
        previous.activeRiders.forEach(rider => {
          previousRidersMap.set(rider.normalized, rider.original);
        });
      }

      const inactiveRiders = [];
      previousRidersMap.forEach((originalName, normalizedName) => {
        if (!currentRidersMap.has(normalizedName)) {
          inactiveRiders.push(originalName);
        }
      });

      result.push({
        month: MONTH_NAMES[current._id.month],
        year: current._id.year.toString(),
        activeCount: currentRidersMap.size,
        activeRiders: Array.from(currentRidersMap.values()),
        inactiveCount: inactiveRiders.length,
        inactiveRiders: inactiveRiders,
        totalUniqueRiders: currentRidersMap.size + inactiveRiders.length
      });
    }

    console.log(`Rider active/inactive stats generated: ${result.length} periods found`);

    res.status(200).json({
      message: "Rider active/inactive statistics by month and year",
      data: result,
      summary: {
        totalPeriods: result.length
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

    const shipmentPipeline = [
      {
        $match: {
          delivery_date: { $ne: '-', $exists: true },
          weekly: { $ne: '-', $exists: true },
          mitra_name: { $ne: '-', $exists: true }
        }
      },
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: {
                $concat: [
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 2] }, 0, 4] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 1] }, 0, 2] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 0] }, 0, 2] }
                ]
              },
              onError: null
            }
          },
          normalizedMitraName: { $toLower: "$mitra_name" }
        }
      },
      {
        $match: {
          parsedDate: { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$parsedDate" },
            month: { $month: "$parsedDate" },
            week: "$weekly",
            mitra: "$normalizedMitraName"
          },
          originalName: { $first: "$mitra_name" }
        }
      },
      {
        $group: {
          _id: {
            year: "$_id.year",
            month: "$_id.month",
            week: "$_id.week"
          },
          activeRiders: { 
            $addToSet: {
              normalized: "$_id.mitra",
              original: "$originalName"
            }
          }
        }
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.week": 1
        }
      }
    ];

    const shipmentData = await ShipmentPerformance.aggregate(shipmentPipeline).allowDiskUse(true);

    const MONTH_NAMES = {
      1: 'January', 2: 'February', 3: 'March', 4: 'April',
      5: 'May', 6: 'June', 7: 'July', 8: 'August',
      9: 'September', 10: 'October', 11: 'November', 12: 'December'
    };

    const weekYearMonthMap = new Map();

    shipmentData.forEach(item => {
      const key = `${item._id.year}_${MONTH_NAMES[item._id.month]}_${item._id.week}`;
      const ridersMap = new Map();
      item.activeRiders.forEach(rider => {
        ridersMap.set(rider.normalized, rider.original);
      });
      
      weekYearMonthMap.set(key, {
        week: item._id.week,
        month: MONTH_NAMES[item._id.month],
        year: item._id.year,
        monthNumber: item._id.month,
        activeRiders: ridersMap,
        statusCounts: {},
        total: 0
      });
    });

    const mitraData = await Mitra.find({}).select('mitraStatus registeredAt fullName').lean();

    mitraData.forEach(mitra => {
      const dateToUse = parseRegisteredAt(mitra.registeredAt);
      if (!dateToUse) return;

      const month = MONTH_NAMES[dateToUse.getMonth() + 1];
      const year = dateToUse.getFullYear();

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
          activeRiders: new Map(),
          statusCounts: {},
          total: 0
        });
      }

      const entry = weekYearMonthMap.get(key);
      entry.statusCounts[status] = (entry.statusCounts[status] || 0) + 1;
      entry.total++;
    });

    const sortedPeriods = Array.from(weekYearMonthMap.values())
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

      const currentRiders = current.activeRiders;
      const previousRiders = previous ? previous.activeRiders : new Map();

      const inactiveRiders = [];
      previousRiders.forEach((originalName, normalizedName) => {
        if (!currentRiders.has(normalizedName)) {
          inactiveRiders.push(originalName);
        }
      });

      const activeStatusCount = current.statusCounts['Active'] || 0;
      const previousActiveRidersCount = previous ? previous.activeRiders.size : 0;

      const gettingValue = previousActiveRidersCount - inactiveRiders.length + activeStatusCount;

      let retentionRate = null;
      if (previousActiveRidersCount > 0) {
        let retainedCount = 0;
        previousRiders.forEach((originalName, normalizedName) => {
          if (currentRiders.has(normalizedName)) {
            retainedCount++;
          }
        });
        retentionRate = (retainedCount / previousActiveRidersCount) * 100;
      }

      let churnRate = null;
      if (previousActiveRidersCount > 0 && inactiveRiders.length > 0) {
        churnRate = (inactiveRiders.length / previousActiveRidersCount) * 100;
      }

      result.push({
        week: current.week,
        month: current.month,
        year: current.year.toString(),
        activeCount: currentRiders.size,
        activeRiders: Array.from(currentRiders.values()),
        inactiveCount: inactiveRiders.length,
        inactiveRiders: inactiveRiders,
        statusCounts: current.statusCounts,
        total: current.total,
        gettingValue: Math.max(0, gettingValue),
        retentionRate,
        churnRate,
        totalUniqueRiders: currentRiders.size + inactiveRiders.length
      });
    }

    console.log(`Rider weekly stats generated: ${result.length} periods found`);

    res.status(200).json({
      message: "Rider active/inactive statistics by week, month and year",
      data: result,
      summary: {
        totalPeriods: result.length
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

const getActiveRidersDetails = async (req, res) => {
  try {
    const { month, year, week } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
        error: "Please provide both month and year",
        success: false
      });
    }

    console.log(`Fetching active riders details for ${week ? `${week} - ` : ''}${month} ${year}`);

    const MONTH_MAP = {
      'January': 1, 'February': 2, 'March': 3, 'April': 4,
      'May': 5, 'June': 6, 'July': 7, 'August': 8,
      'September': 9, 'October': 10, 'November': 11, 'December': 12
    };

    const monthNumber = MONTH_MAP[month];
    if (!monthNumber) {
      return res.status(400).json({
        message: "Invalid month name",
        error: "Month must be a valid month name",
        success: false
      });
    }

    const matchStage = {
      delivery_date: { $ne: '-', $exists: true },
      mitra_name: { $ne: '-', $exists: true }
    };

    if (week) {
      matchStage.weekly = week;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: {
                $concat: [
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 2] }, 0, 4] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 1] }, 0, 2] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 0] }, 0, 2] }
                ]
              },
              onError: null
            }
          }
        }
      },
      {
        $match: {
          parsedDate: { $ne: null },
          $expr: {
            $and: [
              { $eq: [{ $year: "$parsedDate" }, parseInt(year)] },
              { $eq: [{ $month: "$parsedDate" }, monthNumber] }
            ]
          }
        }
      },
      {
        $project: {
          mitra_name: 1,
          delivery_date: 1,
          order_code: 1,
          hub: 1,
          project_name: "$client_name",
          weekly: 1
        }
      },
      {
        $sort: {
          mitra_name: 1,
          delivery_date: 1
        }
      }
    ];

    const details = await ShipmentPerformance.aggregate(pipeline).allowDiskUse(true);

    console.log(`Active riders details fetched: ${details.length} records`);

    res.status(200).json({
      message: `Active riders details for ${week ? `${week} - ` : ''}${month} ${year}`,
      data: details,
      summary: {
        totalRecords: details.length,
        period: week ? `${week} - ${month} ${year}` : `${month} ${year}`
      },
      success: true
    });
  } catch (error) {
    console.error("Active riders details error:", error.message);
    res.status(500).json({
      message: "Failed to fetch active riders details",
      error: error.message,
      success: false
    });
  }
};

const getInactiveRidersDetails = async (req, res) => {
  try {
    const { month, year, week } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
        error: "Please provide both month and year",
        success: false
      });
    }

    console.log(`Fetching inactive riders details for ${week ? `${week} - ` : ''}${month} ${year}`);

    const MONTH_MAP = {
      'January': 1, 'February': 2, 'March': 3, 'April': 4,
      'May': 5, 'June': 6, 'July': 7, 'August': 8,
      'September': 9, 'October': 10, 'November': 11, 'December': 12
    };

    const monthNumber = MONTH_MAP[month];
    if (!monthNumber) {
      return res.status(400).json({
        message: "Invalid month name",
        error: "Month must be a valid month name",
        success: false
      });
    }

    const currentMatchStage = {
      delivery_date: { $ne: '-', $exists: true },
      mitra_name: { $ne: '-', $exists: true }
    };

    if (week) {
      currentMatchStage.weekly = week;
    }

    const currentPeriodPipeline = [
      { $match: currentMatchStage },
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: {
                $concat: [
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 2] }, 0, 4] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 1] }, 0, 2] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 0] }, 0, 2] }
                ]
              },
              onError: null
            }
          },
          normalizedMitraName: { $toLower: "$mitra_name" }
        }
      },
      {
        $match: {
          parsedDate: { $ne: null },
          $expr: {
            $and: [
              { $eq: [{ $year: "$parsedDate" }, parseInt(year)] },
              { $eq: [{ $month: "$parsedDate" }, monthNumber] }
            ]
          }
        }
      },
      {
        $group: {
          _id: "$normalizedMitraName"
        }
      }
    ];

    const currentRiders = await ShipmentPerformance.aggregate(currentPeriodPipeline).allowDiskUse(true);
    const currentRiderNames = new Set(currentRiders.map(r => r._id));

    let previousYear = parseInt(year);
    let previousMonth = monthNumber;
    let previousWeek = null;

    if (week) {
      const allWeeksPipeline = [
        {
          $match: {
            delivery_date: { $ne: '-', $exists: true },
            weekly: { $ne: '-', $exists: true }
          }
        },
        {
          $addFields: {
            parsedDate: {
              $dateFromString: {
                dateString: {
                  $concat: [
                    { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 2] }, 0, 4] },
                    "-",
                    { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 1] }, 0, 2] },
                    "-",
                    { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 0] }, 0, 2] }
                  ]
                },
                onError: null
              }
            }
          }
        },
        {
          $match: {
            parsedDate: { $ne: null }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$parsedDate" },
              month: { $month: "$parsedDate" },
              week: "$weekly"
            }
          }
        },
        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1,
            "_id.week": 1
          }
        }
      ];

      const allWeeks = await ShipmentPerformance.aggregate(allWeeksPipeline).allowDiskUse(true);
      
      const currentWeekIndex = allWeeks.findIndex(w => 
        w._id.year === parseInt(year) && 
        w._id.month === monthNumber && 
        w._id.week === week
      );

      if (currentWeekIndex > 0) {
        const prevWeek = allWeeks[currentWeekIndex - 1];
        previousYear = prevWeek._id.year;
        previousMonth = prevWeek._id.month;
        previousWeek = prevWeek._id.week;
      } else {
        return res.status(200).json({
          message: `No previous week found for ${week} - ${month} ${year}`,
          data: [],
          summary: {
            totalRecords: 0,
            period: `${week} - ${month} ${year}`
          },
          success: true
        });
      }
    } else {
      previousMonth = monthNumber - 1;
      if (previousMonth === 0) {
        previousMonth = 12;
        previousYear -= 1;
      }
    }

    const previousMatchStage = {
      delivery_date: { $ne: '-', $exists: true },
      mitra_name: { $ne: '-', $exists: true }
    };

    if (previousWeek) {
      previousMatchStage.weekly = previousWeek;
    }

    const previousPeriodPipeline = [
      { $match: previousMatchStage },
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: {
                $concat: [
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 2] }, 0, 4] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 1] }, 0, 2] },
                  "-",
                  { $substr: [{ $arrayElemAt: [{ $split: ["$delivery_date", "/"] }, 0] }, 0, 2] }
                ]
              },
              onError: null
            }
          },
          normalizedMitraName: { $toLower: "$mitra_name" }
        }
      },
      {
        $match: {
          parsedDate: { $ne: null },
          $expr: {
            $and: [
              { $eq: [{ $year: "$parsedDate" }, previousYear] },
              { $eq: [{ $month: "$parsedDate" }, previousMonth] }
            ]
          }
        }
      },
      {
        $group: {
          _id: "$normalizedMitraName",
          lastDeliveryDate: { $max: "$delivery_date" },
          lastOrderCode: { $last: "$order_code" },
          lastHub: { $last: "$hub" },
          lastProject: { $last: "$client_name" },
          lastWeekly: { $last: "$weekly" },
          originalName: { $first: "$mitra_name" }
        }
      }
    ];

    const previousRiders = await ShipmentPerformance.aggregate(previousPeriodPipeline).allowDiskUse(true);

    const inactiveRiders = previousRiders
      .filter(rider => !currentRiderNames.has(rider._id))
      .map(rider => ({
        mitra_name: rider.originalName,
        delivery_date: rider.lastDeliveryDate,
        order_code: rider.lastOrderCode || '-',
        hub: rider.lastHub || '-',
        project_name: rider.lastProject || '-',
        weekly: rider.lastWeekly || '-'
      }));

    console.log(`Inactive riders details fetched: ${inactiveRiders.length} records`);

    res.status(200).json({
      message: `Inactive riders details for ${week ? `${week} - ` : ''}${month} ${year}`,
      data: inactiveRiders,
      summary: {
        totalRecords: inactiveRiders.length,
        period: week ? `${week} - ${month} ${year}` : `${month} ${year}`
      },
      success: true
    });
  } catch (error) {
    console.error("Inactive riders details error:", error.message);
    res.status(500).json({
      message: "Failed to fetch inactive riders details",
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

    console.log(`Mitra updated successfully: ${updatedMitra.fullName}`);

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

    console.log(`Mitra deleted successfully: ${deletedMitra.fullName}`);

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

    console.log(`Bulk delete completed: ${result.deletedCount} mitras deleted`);

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
  getActiveRidersDetails,
  getInactiveRidersDetails,
  updateMitraData,
  deleteMitraData,
  deleteMultipleMitraData
};