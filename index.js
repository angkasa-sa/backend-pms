require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cluster = require("cluster");
const os = require("os");
const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const driverRoutes = require("./routes/driverRoutes");
const bonusRoutes = require("./routes/bonusRoutes");
const errorHandler = require("./middleware/errorHandler");

const numCPUs = os.cpus().length;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && cluster.isMaster && numCPUs > 1) {
    console.log(`Master ${process.pid} is running`);
    
    for (let i = 0; i < Math.min(numCPUs, 4); i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork();
    });
} else {
    const app = express();
    const port = process.env.PORT || 5000;

    const corsOptions = {
        origin: function (origin, callback) {
            const allowedOrigins = [
                "http://localhost:3000",
                "http://localhost:5173", 
                "http://localhost:8080",
                "http://localhost:5000",
                "https://backend-pms-phi.vercel.app"
            ];
            
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type', 
            'Authorization', 
            'X-Requested-With',
            'Accept',
            'Origin',
            'Cache-Control',
            'X-File-Name'
        ],
        exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
        maxAge: 86400,
        optionsSuccessStatus: 200
    };

    const strictUploadLimiter = rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 20,
        message: { error: "Too many upload requests, please try again later" },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        keyGenerator: (req) => {
            return req.ip + ':' + (req.headers['x-forwarded-for'] || req.connection.remoteAddress);
        }
    });

    const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 500,
        standardHeaders: true,
        legacyHeaders: false,
    });

    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions));

    app.use(helmet({ 
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: false
    }));
    
    app.use(compression({ 
        level: 6, 
        threshold: 1024,
        filter: (req, res) => {
            if (req.headers['x-no-compression']) return false;
            return compression.filter(req, res);
        }
    }));

    if (!isProduction) {
        app.use(morgan("combined"));
    }

    app.use(generalLimiter);

    app.use(express.json({ 
        limit: "200mb", 
        parameterLimit: 200000,
        extended: true,
        verify: (req, res, buf) => {
            req.rawBody = buf;
        }
    }));

    app.use(express.urlencoded({ 
        extended: true, 
        limit: "200mb",
        parameterLimit: 200000 
    }));

    app.use("/api/upload", strictUploadLimiter);
    app.use("/api/append", strictUploadLimiter);
    app.use("/api/replace", strictUploadLimiter);

    app.use("/api", uploadRoutes);
    app.use("/api/driver", driverRoutes);
    app.use("/api/bonus", bonusRoutes);

    app.get("/api/health", (req, res) => {
        const memUsage = process.memoryUsage();
        res.json({ 
            status: "healthy",
            message: "PMS API Server is running", 
            timestamp: new Date().toISOString(),
            memory: {
                used: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                total: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
                external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
            },
            uptime: Math.round(process.uptime()),
            pid: process.pid
        });
    });

    app.get("/", (req, res) => {
        res.json({ 
            message: "PMS API Server is running", 
            timestamp: new Date().toISOString(),
            version: "2.0.0"
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

    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully');
        process.exit(0);
    });

    connectDB().then(() => {
        const server = app.listen(port, "0.0.0.0", () => {
            console.log(`🚀 Worker ${process.pid} - Server running at http://localhost:${port}`);
            console.log(`📊 Available endpoints:`);
            console.log(`   - POST /api/upload (Upload Excel data)`);
            console.log(`   - POST /api/append (Append Excel data)`);
            console.log(`   - POST /api/replace (Replace Excel data)`);
            console.log(`   - POST /api/bonus/upload (Upload bonus data)`);
            console.log(`   - GET /api/bonus/data (Get all bonus data)`);
            console.log(`   - GET /api/driver/* (Driver routes)`);
            console.log(`   - GET /api/health (Health check)`);
        });

        server.timeout = 300000;
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;
    }).catch(err => {
        console.error('Failed to connect to database:', err);
        process.exit(1);
    });
}