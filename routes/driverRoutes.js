const express = require("express");
const router = express.Router();

const { uploadDriverData, getAllDrivers } = require("../controllers/driverController");

router.post("/upload", uploadDriverData);
router.get("/data", getAllDrivers); // ✅ Sekarang getAllDrivers sudah dikenali

module.exports = router;