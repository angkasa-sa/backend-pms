require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const driverRoutes = require("./routes/driverRoutes");
const bonusRoutes = require("./routes/bonusRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173", 
    "http://localhost:8080",
    "https://frontend-pms-nu.vercel.app",
    /\.vercel\.app$/,
    /localhost:\d+$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400
};

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many upload requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression({ level: 6, threshold: 1024 }));
app.use(morgan("combined"));
app.use(generalLimiter);

app.use(express.json({ 
  limit: "100mb", 
  parameterLimit: 100000,
  extended: true 
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: "100mb",
  parameterLimit: 100000 
}));

app.use("/api/upload", uploadLimiter);
app.use("/api/append", uploadLimiter);
app.use("/api/replace", uploadLimiter);

app.use("/api", uploadRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/bonus", bonusRoutes);

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy",
    message: "PMS API Server is running", 
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

app.get("/", (req, res) => {
  res.json({ 
    message: "PMS API Server is running", 
    timestamp: new Date().toISOString() 
  });
});

app.use(errorHandler);

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

connectDB().then(() => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`📊 Available endpoints:`);
    console.log(`   - POST /api/upload (Upload Excel data)`);
    console.log(`   - POST /api/append (Append Excel data)`);
    console.log(`   - POST /api/replace (Replace Excel data)`);
    console.log(`   - POST /api/bonus/upload (Upload bonus data)`);
    console.log(`   - GET /api/bonus/data (Get all bonus data)`);
    console.log(`   - GET /api/driver/* (Driver routes)`);
    console.log(`   - GET /api/health (Health check)`);
  });
});