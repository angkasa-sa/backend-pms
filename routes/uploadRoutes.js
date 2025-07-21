const express = require("express");
const router = express.Router();
const {
  uploadData,
  getAllData,
  getDataByClient,
  replaceData,
  appendData,
} = require("../controllers/uploadController");

router.post("/upload", uploadData);
router.post("/append", appendData); // Route baru untuk append data
router.post("/replace", replaceData); // Route untuk replace data
router.get("/data", getAllData);
router.get("/data/:client", getDataByClient);

module.exports = router;