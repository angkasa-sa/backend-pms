const Driver = require("../models/Driver");

const uploadDriverData = async (req, res) => {
  try {
    const dataArray = req.body;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ message: "Data driver kosong atau tidak valid." });
    }

    await Driver.deleteMany({});
    console.log("🗑️ Data driver lama dihapus");

    const inserted = await Driver.insertMany(dataArray);
    console.log("✅ Data driver disimpan:", inserted.length);

    res.status(201).json({
      message: "Data driver berhasil disimpan.",
      data: inserted,
    });
  } catch (error) {
    console.error("Driver upload error:", error.message);
    res.status(500).json({ message: "Upload data driver gagal", error: error.message });
  }
};

const getAllDrivers = async (req, res) => {
  try {
    const data = await Driver.find();
    res.status(200).json(data);
  } catch (err) {
    console.error("Gagal ambil data driver:", err.message);
    res.status(500).json({ message: "Gagal ambil data driver", error: err.message });
  }
};

module.exports = {
  uploadDriverData,
  getAllDrivers,
};