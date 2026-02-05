require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const { exec } = require("child_process");
const { promisify } = require("util");
const { createProxyMiddleware } = require("http-proxy-middleware");
const execAsync = promisify(exec);
const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const driverRoutes = require("./routes/driverRoutes");
const mitraRoutes = require("./routes/mitraRoutes");
const mitraExtendedRoutes = require("./routes/mitraExtendedRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const bonusRoutes = require("./routes/bonusRoutes");
const sayurboxRoutes = require("./routes/sayurboxRoutes");
const fleetRoutes = require("./routes/fleetRoutes");
const taskManagementRoutes = require("./routes/taskManagementRoutes");
const larkRoutes = require("./routes/larkRoutes");
const chartRoutes = require("./routes/chartRoutes");
const loginRoutes = require("./routes/loginRoutes");
const sellerRoutes = require("./routes/sellerRoutes");
const phoneMessageRoutes = require("./routes/phoneMessageRoutes");
const errorHandler = require("./middleware/errorHandler");
const { initializeLarkTokens } = require("./services/larkTokenService");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false
}));
app.use(compression());
app.use(morgan("dev"));

app.use(express.json({ 
  limit: "500mb",
  strict: false
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: "500mb",
  parameterLimit: 100000
}));

app.use((req, res, next) => {
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 0) {
    const sizeMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
    if (parseFloat(sizeMB) > 10) {
      console.log(`📦 ${req.method} ${req.path} - Payload size: ${sizeMB}MB`);
    }
  }
  next();
});

app.use("/waha", createProxyMiddleware({
  target: "http://localhost:5001",
  changeOrigin: true,
  ws: true,
  autoRewrite: true,
  protocolRewrite: 'http',
  cookieDomainRewrite: "localhost",
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
    proxyReq.setHeader('X-Forwarded-Proto', 'http');
    proxyReq.setHeader('X-Forwarded-Prefix', '/waha');
  },
  onProxyRes: (proxyRes, req, res) => {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    
    const contentType = proxyRes.headers['content-type'];
    if (contentType && contentType.includes('text/html')) {
      let body = '';
      proxyRes.on('data', (chunk) => {
        body += chunk.toString();
      });
      proxyRes.on('end', () => {
        body = body.replace(/href="\//g, 'href="/waha/')
                   .replace(/src="\//g, 'src="/waha/')
                   .replace(/action="\//g, 'action="/waha/')
                   .replace(/"\/dashboard\//g, '"/waha/dashboard/')
                   .replace(/"\/api\//g, '"/waha/api/')
                   .replace(/url\(\//g, 'url(/waha/');
      });
    }
  },
  onError: (err, req, res) => {
    console.error(`❌ Proxy error for ${req.url}:`, err.message);
    res.status(503).json({
      error: "WAHA service unavailable",
      message: err.message,
      suggestion: "Use direct access: http://localhost:5001/dashboard"
    });
  }
}));

app.use("/api/auth", loginRoutes);
app.use("/api", uploadRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/mitra", mitraRoutes);
app.use("/api/mitra", mitraExtendedRoutes);
app.use("/api/shipment", shipmentRoutes);
app.use("/api/bonus", bonusRoutes);
app.use("/api/sayurbox", sayurboxRoutes);
app.use("/api/fleet", fleetRoutes);
app.use("/api/task-management", taskManagementRoutes);
app.use("/api/chart", chartRoutes);
app.use("/api", larkRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/phone-message", phoneMessageRoutes);

app.get("/api/health", async (req, res) => {
  try {
    const wahaRunning = await isWAHARunning();
    
    let wahaHealth = "disconnected";
    let wahaStatus = "not_running";
    
    if (wahaRunning) {
      try {
        const response = await fetch('http://localhost:5001/health', { 
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok || response.status === 401) {
          wahaHealth = "connected";
          wahaStatus = response.status === 401 ? "running_auth_required" : "running_ok";
        }
      } catch (e) {
        wahaStatus = "container_running_not_ready";
      }
    }
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      waha: wahaHealth,
      wahaStatus: wahaStatus,
      wahaContainer: wahaRunning ? "running" : "stopped",
      note: wahaStatus === "running_auth_required" ? "WAHA is running and requires authentication (this is normal)" : undefined
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      waha: "disconnected",
      error: error.message
    });
  }
});

app.get("/", (req, res) => {
  res.json({ 
    message: "PMS API Server is running", 
    timestamp: new Date().toISOString(),
    bodyParserLimit: "500MB",
    maxParameters: 100000,
    wahaStatus: "integrated",
    wahaDashboard: "http://localhost:5000/waha/dashboard/",
    wahaDirect: "http://localhost:5001/dashboard",
    wahaSwagger: "http://localhost:5000/waha/"
  });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    console.error(`❌ Payload too large on ${req.method} ${req.path}`);
    return res.status(413).json({
      success: false,
      message: 'Request payload too large',
      error: 'Please apply filters to reduce dataset size (max: 500MB)',
      maxSize: '500MB',
      suggestion: 'Filter by Project, Hub, or Year to reduce data size'
    });
  }
  
  next(err);
});

app.use(errorHandler);

const checkDockerInstalled = async () => {
  try {
    await execAsync("docker --version");
    return true;
  } catch (error) {
    return false;
  }
};

const isWAHARunning = async () => {
  try {
    const { stdout } = await execAsync("docker ps --filter name=waha --format '{{.Names}}'");
    return stdout.trim() === "waha";
  } catch (error) {
    return false;
  }
};

const stopWAHA = async () => {
  try {
    const { stdout } = await execAsync("docker ps --filter name=waha --format '{{.Names}}'");
    if (stdout.trim() === "waha") {
      console.log("🛑 Stopping WAHA container...");
      await execAsync("docker stop waha");
      await execAsync("docker rm waha");
      console.log("✅ WAHA container stopped and removed");
    } else {
      console.log("ℹ️  WAHA container not running");
    }
  } catch (error) {
    console.log("ℹ️  No WAHA container found");
  }
};

const startWAHA = async () => {
  try {
    console.log("\n🚀 Starting WAHA (WhatsApp HTTP API)...");
    
    const dockerInstalled = await checkDockerInstalled();
    if (!dockerInstalled) {
      console.warn("⚠️  Docker not installed. Run install_docker.sh first");
      return false;
    }

    const isRunning = await isWAHARunning();
    if (isRunning) {
      console.log("✅ WAHA container already running");
      return true;
    }

    const { stdout: existingContainer } = await execAsync("docker ps -a --filter name=waha --format '{{.Names}}'").catch(() => ({ stdout: "" }));
    if (existingContainer.trim() === "waha") {
      console.log("🗑️  Removing existing WAHA container...");
      await execAsync("docker rm waha");
      console.log("✅ Old container removed");
    }

    console.log("📥 Pulling WAHA Docker image...");
    await execAsync("docker pull devlikeapro/waha");

    console.log("🔧 Starting WAHA container on port 5001...");
    const wahaEnvPath = process.env.WAHA_ENV_PATH || `${process.cwd()}/waha/.env`;
    const wahaSessionsPath = process.env.WAHA_SESSIONS_PATH || `${process.cwd()}/waha/sessions`;

    await execAsync(`mkdir -p ${wahaSessionsPath}`);

    const dockerCommand = `docker run -d \
      --env-file "${wahaEnvPath}" \
      -v "${wahaSessionsPath}:/app/.sessions" \
      -p 5001:3000 \
      --name waha \
      --restart unless-stopped \
      devlikeapro/waha`;

    await execAsync(dockerCommand);

    console.log("⏳ Waiting for WAHA to be ready...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log("✅ WAHA started successfully");
    console.log("📊 WAHA Dashboard: http://localhost:5001/dashboard (Direct - Recommended)");
    console.log("📊 WAHA via Proxy: http://localhost:5000/waha/dashboard/ (Limited support)");
    console.log("📚 WAHA Swagger: http://localhost:5000/waha/");
    console.log("🔑 Login with credentials from waha/.env file");
    console.log("\n⚠️  IMPORTANT: Proxy has limitations with static assets.");
    console.log("⚠️  For best experience, use Direct Access on port 5001");
    
    return true;
  } catch (error) {
    console.error("❌ Failed to start WAHA:", error.message);
    return false;
  }
};

const startServer = async () => {
  try {
    await connectDB();
    console.log("✅ Database connected successfully");

    await startWAHA();

    setTimeout(async () => {
      try {
        await initializeLarkTokens();
        console.log("✅ Lark tokens initialization completed");
      } catch (tokenError) {
        console.warn("⚠️ Lark token initialization failed:", tokenError.message);
      }
    }, 5000);

    app.listen(port, "0.0.0.0", () => {
      console.log(`\n🎉 Server running at http://localhost:${port}`);
      console.log(`\n📦 Body Parser Configuration:`);
      console.log(`   - JSON limit: 500MB`);
      console.log(`   - URL encoded limit: 500MB`);
      console.log(`   - Max parameters: 100,000`);
      console.log("\n📋 Available endpoints:");
      console.log("   - POST /api/mitra/extended/manual-sync (Manual sync MitraExtended - Button Only)");
      console.log("   - GET /api/mitra/extended/bulk-all (Get all MitraExtended data)");
      console.log("   - POST /api/chart/generate-project-analysis (Export Project Analysis)");
      console.log("   - POST /api/chart/generate-mitra-analysis (Export Mitra Analysis)");
      console.log("   - POST /api/phone-message/upload (Upload Excel with phone & message)");
      console.log("   - GET /api/phone-message/all (Get all phone messages)");
      console.log("   - DELETE /api/phone-message/all (Delete all phone messages)");
      console.log("\n💬 WAHA WhatsApp API:");
      console.log("   - 🔵 Direct Access (Recommended): http://localhost:5001/dashboard");
      console.log("   - ⚪ Via Proxy (Limited): http://localhost:5000/waha/dashboard/");
      console.log("   - 📚 Swagger: http://localhost:5000/waha/");
      console.log("   - 🏥 Health Check: http://localhost:5000/api/health");
      console.log("\n🔑 WAHA Login Required:");
      console.log("   - Username: Check waha/.env → WAHA_DASHBOARD_USERNAME");
      console.log("   - Password: Check waha/.env → WAHA_DASHBOARD_PASSWORD");
      console.log("\n⚠️  CRITICAL: Proxy method has known issues with static assets!");
      console.log("⚠️  Use Direct Access (port 5001) for reliable dashboard access");
      console.log("💡 Sync is MANUAL ONLY - use the button in frontend!");
      console.log("💡 Large dataset exports supported up to 500MB");
    });

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  console.log("\n🛑 Shutting down gracefully...");
  
  try {
    await stopWAHA();
  } catch (error) {
    console.warn("⚠️  Error stopping WAHA:", error.message);
  }
  
  process.exit(0);
};

startServer();