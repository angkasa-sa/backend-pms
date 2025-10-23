require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const driverRoutes = require("./routes/driverRoutes");
const mitraRoutes = require("./routes/mitraRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const bonusRoutes = require("./routes/bonusRoutes");
const sayurboxRoutes = require("./routes/sayurboxRoutes");
const fleetRoutes = require("./routes/fleetRoutes");
const taskManagementRoutes = require("./routes/taskManagementRoutes");
const larkRoutes = require("./routes/larkRoutes");
const chartRoutes = require("./routes/chartRoutes");
const loginRoutes = require("./routes/loginRoutes");
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

app.use("/api/auth", loginRoutes);
app.use("/api", uploadRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/mitra", mitraRoutes);
app.use("/api/shipment", shipmentRoutes);
app.use("/api/bonus", bonusRoutes);
app.use("/api/sayurbox", sayurboxRoutes);
app.use("/api/fleet", fleetRoutes);
app.use("/api/task-management", taskManagementRoutes);
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
    console.log("Database connected successfully");

    setImmediate(async () => {
      try {
        await initializeLarkTokens();
        console.log("Lark tokens initialization completed");
      } catch (tokenError) {
        console.warn("Lark tokens initialization failed:", tokenError.message);
      }
    });

    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running at http://localhost:${port}`);
      console.log("Available endpoints:");
      console.log("   - POST /api/auth/login (User login)");
      console.log("   - POST /api/auth/logout (User logout)");
      console.log("   - GET /api/auth/verify (Verify token)");
      console.log("   - POST /api/upload (Upload Excel data)");
      console.log("   - POST /api/driver/upload (Upload driver data)");
      console.log("   - POST /api/task-management/upload (Upload task data - Protected)");
      console.log("   - GET /api/task-management/data (Get task data - Protected)");
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();