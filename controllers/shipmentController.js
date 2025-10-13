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
    business: String(item.business || '').trim() || '-',
    hub: String(item.hub || '').trim() || '-',
    mitra_name: String(item.mitra_name || '').trim(),
    delivery_date: String(item.delivery_date || '').trim() || '-',
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

    const inserted = await ShipmentPerformance.insertMany(sanitizedData);
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
    console.log("Fetching all shipment data");

    const data = await ShipmentPerformance.find()
      .select('business hub mitra_name delivery_date weekly')
      .sort({ createdAt: -1 });

    console.log(`Retrieved ${data.length} shipment records`);

    res.status(200).json(data);
  } catch (err) {
    console.error("Gagal ambil data shipment:", err.message);
    res.status(500).json({ 
      message: "Gagal ambil data shipment", 
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
      business: String(updateData.business || '').trim() || '-',
      hub: String(updateData.hub || '').trim() || '-',
      mitra_name: String(updateData.mitra_name || '').trim(),
      delivery_date: String(updateData.delivery_date || '').trim() || '-',
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

    const existingShipment = await ShipmentPerformance.findById(id);
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
  updateShipmentData,
  deleteShipmentData,
  deleteMultipleShipmentData
};