require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cluster = require("cluster");
const os = require("os");
const EventEmitter = require("events");
const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const driverRoutes = require("./routes/driverRoutes");
const bonusRoutes = require("./routes/bonusRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const port = process.env.PORT || 5000;
const isDevelopment = process.env.NODE_ENV === "development";

EventEmitter.defaultMaxListeners = 50;

if (cluster.isMaster && !isDevelopment && process.env.ENABLE_CLUSTER !== "false") {
const numWorkers = Math.min(os.cpus().length, parseInt(process.env.MAX_WORKERS) || 4);

console.log(`🚀 Master ${process.pid} starting ${numWorkers} workers`);

for (let i = 0; i < numWorkers; i++) {
cluster.fork();
}

cluster.on("exit", (worker, code, signal) => {
console.log(`💀 Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
setTimeout(() => cluster.fork(), 2000);
});

cluster.on("online", (worker) => {
console.log(`✅ Worker ${worker.process.pid} is online`);
});

process.on('SIGTERM', () => {
console.log('🔄 Master received SIGTERM, shutting down gracefully');
for (const id in cluster.workers) {
cluster.workers[id].kill('SIGTERM');
}
process.exit(0);
});

} else {
const rateLimitStore = new Map();
const requestQueue = new Map();
const connectionMetrics = { active: 0, total: 0 };

const cleanupInterval = setInterval(() => {
const now = Date.now();
for (const [key, value] of rateLimitStore.entries()) {
if (now > value.resetTime) rateLimitStore.delete(key);
}
for (const [key, value] of requestQueue.entries()) {
if (now - value.timestamp > 10000) requestQueue.delete(key);
}
}, 30000);

const advancedRateLimit = (windowMs = 60000, max = 200) => {
return (req, res, next) => {
const key = req.ip + req.path;
const now = Date.now();
const window = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

if (now > window.resetTime) {
window.count = 0;
window.resetTime = now + windowMs;
}

if (window.count >= max) {
return res.status(429).json({ 
error: "Too many requests", 
retryAfter: Math.ceil((window.resetTime - now) / 1000)
});
}

window.count++;
rateLimitStore.set(key, window);
next();
};
};

const requestDeduplication = (req, res, next) => {
if (req.method !== 'POST') return next();

const bodyHash = req.body ? JSON.stringify(req.body).substring(0, 100) : '';
const key = `${req.ip}_${req.path}_${bodyHash}`;
const existing = requestQueue.get(key);

if (existing && Date.now() - existing.timestamp < 5000) {
return res.status(409).json({ 
error: "Duplicate request detected", 
message: "Please wait before retrying" 
});
}

requestQueue.set(key, { timestamp: Date.now() });
setTimeout(() => requestQueue.delete(key), 10000);
next();
};

const connectionTracker = (req, res, next) => {
connectionMetrics.active++;
connectionMetrics.total++;

res.on('finish', () => {
connectionMetrics.active--;
});

res.on('close', () => {
if (connectionMetrics.active > 0) connectionMetrics.active--;
});

next();
};

const optimizedCors = cors({
origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
credentials: false,
maxAge: 86400,
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
optionsSuccessStatus: 200
});

const optimizedHelmet = helmet({
crossOriginEmbedderPolicy: false,
contentSecurityPolicy: {
useDefaults: true,
directives: {
"script-src": ["'self'", "'unsafe-inline'"],
"style-src": ["'self'", "'unsafe-inline'"]
}
}
});

const optimizedCompression = compression({
level: 6,
threshold: 1024,
filter: (req, res) => {
if (req.headers['x-no-compression']) return false;
return compression.filter(req, res);
}
});

app.use(connectionTracker);
app.use(optimizedCors);
app.use(optimizedHelmet);
app.use(optimizedCompression);

if (isDevelopment) {
app.use(morgan("dev"));
} else {
app.use(morgan("combined", {
skip: (req, res) => res.statusCode < 400
}));
}

app.use(advancedRateLimit(60000, 300));
app.use(requestDeduplication);

app.use(express.json({ 
limit: process.env.JSON_LIMIT || "100mb",
verify: (req, res, buf) => {
if (buf.length > 104857600) {
const error = new Error('Payload too large');
error.status = 413;
throw error;
}
}
}));

app.use(express.urlencoded({ 
extended: true, 
limit: process.env.JSON_LIMIT || "100mb",
parameterLimit: 10000
}));

app.use((req, res, next) => {
req.startTime = Date.now();
res.setHeader('X-Worker-PID', process.pid);
res.setHeader('X-Response-Time-Start', req.startTime);
next();
});

app.use("/api", uploadRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/bonus", bonusRoutes);

app.get("/", (req, res) => {
res.json({ 
message: "PMS API Server is running", 
timestamp: new Date().toISOString(),
worker: process.pid,
uptime: process.uptime(),
memory: process.memoryUsage(),
connections: connectionMetrics
});
});

app.get("/api/health", (req, res) => {
const healthData = {
status: "healthy",
timestamp: new Date().toISOString(),
worker: process.pid,
uptime: Math.floor(process.uptime()),
memory: {
used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
},
connections: connectionMetrics,
rateLimitEntries: rateLimitStore.size,
requestQueueSize: requestQueue.size
};

res.status(200).json(healthData);
});

app.use((req, res, next) => {
res.status(404).json({ 
error: "Endpoint not found",
path: req.path,
method: req.method 
});
});

app.use((req, res, next) => {
const duration = Date.now() - req.startTime;
res.setHeader('X-Response-Time', `${duration}ms`);
next();
});

app.use(errorHandler);

const gracefulShutdown = () => {
console.log('🔄 Received shutdown signal, closing server gracefully...');
clearInterval(cleanupInterval);

process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
console.error('💥 Uncaught Exception:', error);
process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
process.exit(1);
});

connectDB().then(() => {
const server = app.listen(port, "0.0.0.0", () => {
console.log(`🚀 Worker ${process.pid} running at http://localhost:${port}`);
console.log(`📊 Available endpoints:`);
console.log(`   - POST /api/upload (Upload Excel data)`);
console.log(`   - POST /api/append (Append Excel data)`);
console.log(`   - POST /api/replace (Replace Excel data)`);
console.log(`   - POST /api/bonus/upload (Upload bonus data)`);
console.log(`   - GET /api/bonus/data (Get all bonus data)`);
console.log(`   - GET /api/driver/* (Driver routes)`);
console.log(`   - GET /api/health (Health check)`);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.timeout = 300000;
server.maxHeadersCount = 2000;

server.on('connection', (socket) => {
socket.setKeepAlive(true, 60000);
socket.setNoDelay(true);
});

}).catch(error => {
console.error('❌ Failed to connect to database:', error);
process.exit(1);
});
}