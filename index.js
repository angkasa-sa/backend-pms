require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const driverRoutes = require("./routes/driverRoutes");
const bonusRoutes = require("./routes/bonusRoutes");
const sayurboxRoutes = require("./routes/sayurboxRoutes");
const fleetRoutes = require("./routes/fleetRoutes");
const larkRoutes = require("./routes/larkRoutes");
const chartRoutes = require("./routes/chartRoutes");
const errorHandler = require("./middleware/errorHandler");
const { initializeLarkTokens } = require("./services/larkTokenService");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", uploadRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/bonus", bonusRoutes);
app.use("/api/sayurbox", sayurboxRoutes);
app.use("/api/fleet", fleetRoutes);
app.use("/api/chart", chartRoutes);
app.use("/api", larkRoutes);

app.get("/", (req, res) => {
res.json({ 
message: "PMS API Server is running", 
timestamp: new Date().toISOString() 
});
});

app.use(errorHandler);

const startServer = async () => {
try {
await connectDB();
console.log("📊 Database connected successfully");

setImmediate(async () => {
try {
await initializeLarkTokens();
console.log("✅ Lark tokens initialization completed");
} catch (tokenError) {
console.warn("⚠️ Lark tokens initialization failed:", tokenError.message);
}
});

app.listen(port, "0.0.0.0", () => {
console.log(`🚀 Server running at http://localhost:${port}`);
console.log(`📊 Available endpoints:`);
console.log(`   - POST /api/upload (Upload Excel data)`);
console.log(`   - POST /api/bonus/upload (Upload bonus data)`);
console.log(`   - GET /api/bonus/data (Get all bonus data)`);
console.log(`   - POST /api/sayurbox/upload (Upload sayurbox data)`);
console.log(`   - GET /api/sayurbox/data (Get all sayurbox data)`);
console.log(`   - POST /api/sayurbox/edata-upload (Upload edata)`);
console.log(`   - GET /api/sayurbox/edata (Get all edata)`);
console.log(`   - POST /api/fleet/upload (Upload fleet data)`);
console.log(`   - GET /api/fleet/data (Get fleet data with pagination & filters)`);
console.log(`   - GET /api/fleet/filters (Get available filter options)`);
console.log(`   - GET /api/fleet/stats (Get fleet statistics)`);
console.log(`   - GET /api/driver/* (Driver routes)`);
console.log(`   - POST /api/chart/generate-dashboard-chart (Generate dashboard charts)`);
console.log(`   - POST /api/chart/generate-performance-chart (Generate performance charts)`);
console.log(`   - GET /api/chart/health (Chart service health check)`);
console.log(`   - GET /api/records (Get LarkSuite records with pagination)`);
console.log(`   - GET /api/records/all (Get all LarkSuite records)`);
});
} catch (error) {
console.error("❌ Failed to start server:", error.message);
process.exit(1);
}
};

startServer();