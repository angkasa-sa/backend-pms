const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;
const router = express.Router();

const TEMP_DIR = path.join(__dirname, "..", "temp");
const PYTHON_SCRIPT = path.join(__dirname, "..", "utils", "chart_generator.py");

const ensureTempDir = async () => {
try {
await fs.access(TEMP_DIR);
} catch {
await fs.mkdir(TEMP_DIR, { recursive: true });
}
};

const generateUniqueFilename = (prefix = "chart", extension = "xlsx") => {
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const random = Math.random().toString(36).substring(2, 8);
return `${prefix}_${timestamp}_${random}.${extension}`;
};

const cleanupFile = async (filePath) => {
try {
await fs.unlink(filePath);
} catch (error) {
console.warn(`Failed to cleanup file ${filePath}:`, error.message);
}
};

const executePythonScript = (inputPath, outputPath) => {
return new Promise((resolve, reject) => {
const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
const pythonProcess = spawn(pythonCommand, [PYTHON_SCRIPT, inputPath, outputPath], {
stdio: ["pipe", "pipe", "pipe"],
cwd: path.dirname(PYTHON_SCRIPT)
});

let stdout = "";
let stderr = "";

pythonProcess.stdout.on("data", (data) => {
stdout += data.toString();
});

pythonProcess.stderr.on("data", (data) => {
stderr += data.toString();
});

pythonProcess.on("close", (code) => {
console.log(`Python process exited with code: ${code}`);
console.log(`Python stdout: ${stdout}`);
console.log(`Python stderr: ${stderr}`);

if (code === 0) {
try {
const result = JSON.parse(stdout.trim());
resolve(result);
} catch (parseError) {
console.error('Failed to parse Python output:', parseError);
reject(new Error(`Failed to parse Python output: ${parseError.message}`));
}
} else {
reject(new Error(`Python script failed with code ${code}: ${stderr || 'Unknown error'}`));
}
});

pythonProcess.on("error", (error) => {
console.error('Python process error:', error);
reject(new Error(`Failed to start Python process: ${error.message}`));
});

setTimeout(() => {
pythonProcess.kill("SIGTERM");
reject(new Error("Python script timeout"));
}, 120000);
});
};

const validateDashboardData = (data) => {
const { performanceData, summaryData, insightsData } = data;

if (!performanceData || !Array.isArray(performanceData) || performanceData.length === 0) {
throw new Error("Performance data is required and must be a non-empty array");
}

performanceData.forEach((item, index) => {
if (!item || typeof item !== 'object') {
throw new Error(`Performance data item ${index} must be an object`);
}
if (!item['Short Name'] && !item['Location']) {
throw new Error(`Performance data item ${index} must have either 'Short Name' or 'Location'`);
}
});

return true;
};

router.post("/generate-dashboard-chart", async (req, res) => {
let inputPath = null;
let outputPath = null;

try {
console.log('Starting dashboard chart generation...');
await ensureTempDir();

validateDashboardData(req.body);

const { performanceData, summaryData, insightsData } = req.body;

const chartData = {
performanceData: performanceData.map(item => ({
"Rank": item.Rank || 0,
"Location": item.Location || item['Short Name'] || 'Unknown',
"Short Name": item['Short Name'] || item.Location || 'Unknown',
"Category": item.Category || 'Unknown',
"Total Shipments": parseInt(item['Total Shipments']) || 0,
"Late Shipments": parseInt(item['Late Shipments']) || 0,
"On Time Percentage": parseFloat(item['On Time Percentage']) || 0,
"Late Percentage": parseFloat(item['Late Percentage']) || 0,
"Performance Level": item['Performance Level'] || 'N/A',
"Performance Score": parseFloat(item['Performance Score']) || 0
})),
summaryData: summaryData || [],
insightsData: insightsData || []
};

console.log('Processed chart data:', {
performanceCount: chartData.performanceData.length,
summaryCount: chartData.summaryData.length,
insightsCount: chartData.insightsData.length
});

const inputFilename = generateUniqueFilename("dashboard_data", "json");
const outputFilename = generateUniqueFilename("dashboard_chart", "xlsx");

inputPath = path.join(TEMP_DIR, inputFilename);
outputPath = path.join(TEMP_DIR, outputFilename);

console.log('Writing data to:', inputPath);
await fs.writeFile(inputPath, JSON.stringify(chartData, null, 2), "utf-8");

console.log('Executing Python script...');
const result = await executePythonScript(inputPath, outputPath);

if (!result.success) {
throw new Error(result.error || "Chart generation failed");
}

console.log('Checking output file...');
const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
if (!fileExists) {
throw new Error("Output file was not created");
}

const fileBuffer = await fs.readFile(outputPath);
const fileName = `Dashboard_Analytics_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;

console.log('Sending file to client...');
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
res.setHeader('Content-Length', fileBuffer.length);

res.send(fileBuffer);

} catch (error) {
console.error("Chart generation error:", error);
res.status(500).json({
success: false,
error: error.message || "Failed to generate dashboard chart",
details: error.stack
});
} finally {
if (inputPath) {
setTimeout(() => cleanupFile(inputPath), 1000);
}
if (outputPath) {
setTimeout(() => cleanupFile(outputPath), 5000);
}
}
});

router.post("/generate-performance-chart", async (req, res) => {
let inputPath = null;
let outputPath = null;

try {
await ensureTempDir();

const { courierData, chartType = "performance" } = req.body;

if (!courierData || !Array.isArray(courierData)) {
return res.status(400).json({
success: false,
error: "Courier data is required"
});
}

const chartData = {
performanceData: courierData.map((courier, index) => ({
Rank: index + 1,
"Short Name": courier.courierName?.substring(0, 20) || courier.courierCode || `Courier ${index + 1}`,
Category: courier.hub || "Unknown",
"Total Shipments": courier.totalDeliveries || 0,
"Late Shipments": courier.lateDeliveries || 0,
"On Time Percentage": courier.onTimePercentage || 0,
"Performance Level": courier.performanceRating || "N/A"
})),
summaryData: [],
insightsData: []
};

const inputFilename = generateUniqueFilename("performance_data", "json");
const outputFilename = generateUniqueFilename("performance_chart", "xlsx");

inputPath = path.join(TEMP_DIR, inputFilename);
outputPath = path.join(TEMP_DIR, outputFilename);

await fs.writeFile(inputPath, JSON.stringify(chartData, null, 2), "utf-8");

const result = await executePythonScript(inputPath, outputPath);

if (!result.success) {
throw new Error(result.error || "Performance chart generation failed");
}

const fileBuffer = await fs.readFile(outputPath);
const fileName = `Performance_Analytics_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;

res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
res.setHeader('Content-Length', fileBuffer.length);

res.send(fileBuffer);

} catch (error) {
console.error("Performance chart generation error:", error);
res.status(500).json({
success: false,
error: error.message || "Failed to generate performance chart"
});
} finally {
if (inputPath) {
setTimeout(() => cleanupFile(inputPath), 1000);
}
if (outputPath) {
setTimeout(() => cleanupFile(outputPath), 5000);
}
}
});

router.get("/health", (req, res) => {
res.json({
success: true,
message: "Chart service is running",
timestamp: new Date().toISOString(),
pythonScript: PYTHON_SCRIPT,
tempDir: TEMP_DIR
});
});

module.exports = router;