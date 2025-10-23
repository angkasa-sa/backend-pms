const ShipmentPerformance = require("../models/ShipmentPerformance");

const validateShipmentData = (dataArray) => {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    throw new Error("Data shipment kosong atau tidak valid.");
  }

  const requiredField = 'mitra_name';

  dataArray.forEach((item, index) => {
    if (!item[requiredField] || String(item[requiredField]).trim() === '') {
      throw new Error(`Baris ${index + 2}: Field '${requiredField}' wajib diisi`);
    }
  });
};

const sanitizeShipmentData = (dataArray) => {
  return dataArray.map(item => ({
    client_name: String(item.client_name || '').trim() || '-',
    project_name: String(item.project_name || '').trim() || '-',
    delivery_date: String(item.delivery_date || '').trim() || '-',
    drop_point: String(item.drop_point || '').trim() || '-',
    hub: String(item.hub || '').trim() || '-',
    order_code: String(item.order_code || '').trim() || '-',
    weight: String(item.weight || '').trim() || '-',
    distance_km: String(item.distance_km || '').trim() || '-',
    mitra_code: String(item.mitra_code || '').trim() || '-',
    mitra_name: String(item.mitra_name || '').trim(),
    receiving_date: String(item.receiving_date || '').trim() || '-',
    vehicle_type: String(item.vehicle_type || '').trim() || '-',
    cost: String(item.cost || '').trim() || '-',
    sla: String(item.sla || '').trim() || '-',
    weekly: String(item.weekly || '').trim() || '-'
  }));
};

const uploadShipmentData = async (req, res) => {
  try {
    const dataArray = req.body;
    const replaceAll = req.headers['x-replace-data'] === 'true';

    validateShipmentData(dataArray);
    const sanitizedData = sanitizeShipmentData(dataArray);

    console.log(`Processing ${sanitizedData.length} shipment records for upload (replaceAll: ${replaceAll})`);

    if (replaceAll) {
      await ShipmentPerformance.deleteMany({});
      console.log("Data shipment lama dihapus");
    }

    const inserted = await ShipmentPerformance.insertMany(sanitizedData, { ordered: false });
    console.log(`Data shipment disimpan: ${inserted.length} records`);

    res.status(201).json({
      message: `Data shipment berhasil disimpan: ${inserted.length} records`,
      data: inserted,
      summary: {
        totalRecords: inserted.length,
        success: true
      },
      success: true
    });
  } catch (error) {
    console.error("Shipment upload error:", error.message);

    const statusCode = error.message.includes('wajib diisi') ? 400 : 500;

    res.status(statusCode).json({ 
      message: "Upload data shipment gagal", 
      error: error.message,
      success: false
    });
  }
};

const getAllShipments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10000, 10000);
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    console.log(`Fetching shipment data - Page: ${page}, Limit: ${limit}`);

    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { client_name: { $regex: search, $options: 'i' } },
          { project_name: { $regex: search, $options: 'i' } },
          { hub: { $regex: search, $options: 'i' } },
          { mitra_name: { $regex: search, $options: 'i' } },
          { order_code: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const [data, totalCount] = await Promise.all([
      ShipmentPerformance.find(query)
        .select('client_name project_name delivery_date drop_point hub order_code weight distance_km mitra_code mitra_name receiving_date vehicle_type cost sla weekly')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
        .allowDiskUse(true)
        .hint({ [sortBy]: sortOrder }),
      ShipmentPerformance.countDocuments(query)
    ]);

    console.log(`Retrieved ${data.length} of ${totalCount} total shipment records`);

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
    console.error("Gagal ambil data shipment:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil data shipment", 
      error: err.message,
      success: false
    });
  }
};

const getShipmentStats = async (req, res) => {
  try {
    console.log('Fetching shipment statistics...');

    const stats = await ShipmentPerformance.aggregate([
      {
        $facet: {
          total: [{ $count: "count" }],
          uniqueClients: [
            { $match: { client_name: { $ne: '-' } } },
            { $group: { _id: "$client_name" } },
            { $count: "count" }
          ],
          uniqueProjects: [
            { $match: { project_name: { $ne: '-' } } },
            { $group: { _id: "$project_name" } },
            { $count: "count" }
          ],
          uniqueHubs: [
            { $match: { hub: { $ne: '-' } } },
            { $group: { _id: "$hub" } },
            { $count: "count" }
          ],
          uniqueMitras: [
            { $match: { mitra_name: { $ne: '-' } } },
            { $group: { _id: "$mitra_name" } },
            { $count: "count" }
          ],
          uniqueWeeks: [
            { $match: { weekly: { $ne: '-' } } },
            { $group: { _id: "$weekly" } },
            { $count: "count" }
          ]
        }
      }
    ]).allowDiskUse(true);

    const result = {
      total: stats[0].total[0]?.count || 0,
      uniqueClients: stats[0].uniqueClients[0]?.count || 0,
      uniqueProjects: stats[0].uniqueProjects[0]?.count || 0,
      uniqueHubs: stats[0].uniqueHubs[0]?.count || 0,
      uniqueMitras: stats[0].uniqueMitras[0]?.count || 0,
      uniqueWeeks: stats[0].uniqueWeeks[0]?.count || 0
    };

    console.log('Statistics fetched successfully');

    res.status(200).json({
      data: result,
      success: true
    });
  } catch (err) {
    console.error("Gagal ambil statistik shipment:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil statistik shipment", 
      error: err.message,
      success: false
    });
  }
};

const getShipmentFilters = async (req, res) => {
  try {
    console.log('Fetching shipment filter options...');

    const filters = await ShipmentPerformance.aggregate([
      {
        $facet: {
          clients: [
            { $match: { client_name: { $ne: '-', $exists: true } } },
            { $group: { _id: "$client_name" } },
            { $sort: { _id: 1 } },
            { $limit: 100 }
          ],
          projects: [
            { $match: { project_name: { $ne: '-', $exists: true } } },
            { $group: { _id: "$project_name" } },
            { $sort: { _id: 1 } },
            { $limit: 100 }
          ],
          hubs: [
            { $match: { hub: { $ne: '-', $exists: true } } },
            { $group: { _id: "$hub" } },
            { $sort: { _id: 1 } },
            { $limit: 100 }
          ],
          vehicleTypes: [
            { $match: { vehicle_type: { $ne: '-', $exists: true } } },
            { $group: { _id: "$vehicle_type" } },
            { $sort: { _id: 1 } },
            { $limit: 50 }
          ],
          slas: [
            { $match: { sla: { $ne: '-', $exists: true } } },
            { $group: { _id: "$sla" } },
            { $sort: { _id: 1 } }
          ],
          weeklys: [
            { $match: { weekly: { $ne: '-', $exists: true } } },
            { $group: { _id: "$weekly" } },
            { $sort: { _id: 1 } },
            { $limit: 100 }
          ]
        }
      }
    ]).allowDiskUse(true);

    const result = {
      client_name: filters[0].clients.map(f => f._id),
      project_name: filters[0].projects.map(f => f._id),
      hub: filters[0].hubs.map(f => f._id),
      vehicle_type: filters[0].vehicleTypes.map(f => f._id),
      sla: filters[0].slas.map(f => f._id),
      weekly: filters[0].weeklys.map(f => f._id)
    };

    console.log('Filter options fetched successfully');

    res.status(200).json({
      data: result,
      success: true
    });
  } catch (err) {
    console.error("Gagal ambil filter options:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil filter options", 
      error: err.message,
      success: false
    });
  }
};

const getProjectAnalysis = async (req, res) => {
  try {
    const { year, project, hub } = req.query;
    const filters = {};
    
    if (year) filters.year = year;
    if (project) filters.project = project;
    if (hub) filters.hub = hub;

    console.log('Fetching project analysis data with filters:', filters);

    const data = await ShipmentPerformance.getProjectAnalysisData(filters);

    res.status(200).json({
      data: data,
      success: true
    });
  } catch (err) {
    console.error("Gagal ambil project analysis:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil project analysis", 
      error: err.message,
      success: false
    });
  }
};

const getProjectWeeklyAnalysis = async (req, res) => {
  try {
    const { year, project, hub } = req.query;
    const filters = {};
    
    if (year) filters.year = year;
    if (project) filters.project = project;
    if (hub) filters.hub = hub;

    console.log('Fetching project weekly analysis with filters:', filters);

    const data = await ShipmentPerformance.getProjectWeeklyData(filters);

    res.status(200).json({
      data: data,
      success: true
    });
  } catch (err) {
    console.error("Gagal ambil project weekly analysis:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil project weekly analysis", 
      error: err.message,
      success: false
    });
  }
};

const getMitraAnalysis = async (req, res) => {
  try {
    const { year, client, hub, mitra } = req.query;
    const filters = {};
    
    if (year) filters.year = year;
    if (client) filters.client = client;
    if (hub) filters.hub = hub;
    if (mitra) filters.mitra = mitra;

    console.log('Fetching mitra analysis data with filters:', filters);

    const data = await ShipmentPerformance.getMitraAnalysisData(filters);

    res.status(200).json({
      data: data,
      success: true
    });
  } catch (err) {
    console.error("Gagal ambil mitra analysis:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil mitra analysis", 
      error: err.message,
      success: false
    });
  }
};

const getMitraWeeklyAnalysis = async (req, res) => {
  try {
    const { year, client, hub, mitra } = req.query;
    const filters = {};
    
    if (year) filters.year = year;
    if (client) filters.client = client;
    if (hub) filters.hub = hub;
    if (mitra) filters.mitra = mitra;

    console.log('Fetching mitra weekly analysis with filters:', filters);

    const data = await ShipmentPerformance.getMitraWeeklyData(filters);

    res.status(200).json({
      data: data,
      success: true
    });
  } catch (err) {
    console.error("Gagal ambil mitra weekly analysis:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil mitra weekly analysis", 
      error: err.message,
      success: false
    });
  }
};

const updateShipmentData = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log(`Updating shipment ID: ${id}`);

    if (!id) {
      return res.status(400).json({
        message: "ID shipment tidak valid",
        error: "Shipment ID is required",
        success: false
      });
    }

    const sanitizedUpdate = {
      client_name: String(updateData.client_name || '').trim() || '-',
      project_name: String(updateData.project_name || '').trim() || '-',
      delivery_date: String(updateData.delivery_date || '').trim() || '-',
      drop_point: String(updateData.drop_point || '').trim() || '-',
      hub: String(updateData.hub || '').trim() || '-',
      order_code: String(updateData.order_code || '').trim() || '-',
      weight: String(updateData.weight || '').trim() || '-',
      distance_km: String(updateData.distance_km || '').trim() || '-',
      mitra_code: String(updateData.mitra_code || '').trim() || '-',
      mitra_name: String(updateData.mitra_name || '').trim(),
      receiving_date: String(updateData.receiving_date || '').trim() || '-',
      vehicle_type: String(updateData.vehicle_type || '').trim() || '-',
      cost: String(updateData.cost || '').trim() || '-',
      sla: String(updateData.sla || '').trim() || '-',
      weekly: String(updateData.weekly || '').trim() || '-',
      updatedAt: Date.now()
    };

    if (!sanitizedUpdate.mitra_name || sanitizedUpdate.mitra_name === '') {
      return res.status(400).json({
        message: "Field 'mitra_name' wajib diisi",
        error: "mitra_name is required",
        success: false
      });
    }

    const existingShipment = await ShipmentPerformance.findById(id).lean();
    if (!existingShipment) {
      console.warn(`Shipment not found: ${id}`);
      return res.status(404).json({
        message: "Shipment tidak ditemukan",
        error: "Shipment with specified ID does not exist",
        success: false
      });
    }

    const updatedShipment = await ShipmentPerformance.findByIdAndUpdate(
      id,
      sanitizedUpdate,
      { new: true, runValidators: true }
    );

    console.log(`Shipment updated successfully: ${updatedShipment.mitra_name}`);

    res.status(200).json({
      message: "Data shipment berhasil diperbarui",
      data: updatedShipment,
      success: true
    });
  } catch (error) {
    console.error("Update shipment error:", error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "ID shipment tidak valid",
        error: "Invalid shipment ID format",
        success: false
      });
    }

    res.status(500).json({
      message: "Gagal memperbarui data shipment",
      error: error.message,
      success: false
    });
  }
};

const deleteShipmentData = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Deleting shipment ID: ${id}`);

    if (!id) {
      return res.status(400).json({
        message: "ID shipment tidak valid",
        error: "Shipment ID is required",
        success: false
      });
    }

    const deletedShipment = await ShipmentPerformance.findByIdAndDelete(id);

    if (!deletedShipment) {
      console.warn(`Shipment not found: ${id}`);
      return res.status(404).json({
        message: "Shipment tidak ditemukan",
        error: "Shipment with specified ID does not exist",
        success: false
      });
    }

    console.log(`Shipment deleted successfully: ${deletedShipment.mitra_name}`);

    res.status(200).json({
      message: "Data shipment berhasil dihapus",
      data: deletedShipment,
      success: true
    });
  } catch (error) {
    console.error("Delete shipment error:", error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "ID shipment tidak valid",
        error: "Invalid shipment ID format",
        success: false
      });
    }

    res.status(500).json({
      message: "Gagal menghapus data shipment",
      error: error.message,
      success: false
    });
  }
};

const deleteMultipleShipmentData = async (req, res) => {
  try {
    const { ids } = req.body;

    console.log(`Bulk delete request for ${ids.length} shipment`);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        message: "ID shipment tidak valid",
        error: "Array of shipment IDs is required",
        success: false
      });
    }

    const result = await ShipmentPerformance.deleteMany({ _id: { $in: ids } });

    console.log(`Bulk delete completed: ${result.deletedCount} shipment deleted`);

    res.status(200).json({
      message: `Berhasil menghapus ${result.deletedCount} data shipment`,
      deletedCount: result.deletedCount,
      success: true
    });
  } catch (error) {
    console.error("Bulk delete shipment error:", error.message);

    res.status(500).json({
      message: "Gagal menghapus data shipment",
      error: error.message,
      success: false
    });
  }
};

module.exports = {
  uploadShipmentData,
  getAllShipments,
  getShipmentStats,
  getShipmentFilters,
  getProjectAnalysis,
  getProjectWeeklyAnalysis,
  getMitraAnalysis,
  getMitraWeeklyAnalysis,
  updateShipmentData,
  deleteShipmentData,
  deleteMultipleShipmentData
};