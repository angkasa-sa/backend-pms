const express = require("express");
const router = express.Router();
const {
uploadData,
getAllData,
getDataByClient,
replaceData,
appendData,
deleteData,
} = require("../controllers/uploadController");

router.post("/upload", uploadData);
router.post("/append", appendData);
router.post("/replace", replaceData);
router.post("/delete", deleteData);
router.get("/data", getAllData);
router.get("/data/:client", getDataByClient);

module.exports = router;