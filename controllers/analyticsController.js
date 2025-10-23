const TaskManagementData = require("../models/TaskManagementData");
const XLSX = require('xlsx');
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;

const TEMP_DIR = path.join(__dirname, "..", "temp");
const PYTHON_SCRIPT = path.join(__dirname, "..", "utils", "taskAnalyticsChartGenerator.py");

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

const getPerformanceAnalytics = async (req, res) => {
  try {
    const { startDate: customStartDate, endDate: customEndDate, users = [] } = req.query;

    let dateFilter = {};
    if (customStartDate && customEndDate) {
      const startDateObj = new Date(customStartDate);
      const endDateObj = new Date(customEndDate);
      
      const filterStart = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate(), 0, 0, 0, 0);
      const filterEnd = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999);

      console.log('Date Filter Applied:', {
        startDate: customStartDate,
        endDate: customEndDate,
        filterStart: filterStart.toISOString(),
        filterEnd: filterEnd.toISOString()
      });

      dateFilter = {
        date: {
          $gte: filterStart,
          $lte: filterEnd
        }
      };
    }

    let userFilter = {};
    if (users && Array.isArray(users) && users.length > 0) {
      userFilter = { user: { $in: users } };
    }

    const query = { ...dateFilter, ...userFilter };

    console.log('MongoDB Query:', JSON.stringify(query));

    const allTasks = await TaskManagementData.find(query).lean();

    console.log('Tasks Found:', allTasks.length);
    if (allTasks.length > 0 && allTasks[0].date) {
      console.log('Sample Task Date:', {
        raw: allTasks[0].date,
        iso: new Date(allTasks[0].date).toISOString(),
        type: typeof allTasks[0].date
      });
    }

    const userPerformanceMap = new Map();

    allTasks.forEach(task => {
      const userName = task.user || 'Unknown';

      if (!userPerformanceMap.has(userName)) {
        userPerformanceMap.set(userName, {
          userName,
          totalTasks: 0,
          eligible: 0,
          notEligible: 0,
          invited: 0,
          changedMind: 0,
          noResponse: 0,
          projects: new Set(),
          cities: new Set()
        });
      }

      const userStats = userPerformanceMap.get(userName);
      userStats.totalTasks++;

      if (task.finalStatus === 'Eligible') {
        userStats.eligible++;
      } else if (task.finalStatus && task.finalStatus.includes('Not Eligible')) {
        userStats.notEligible++;
      }

      if (task.replyRecord === 'Invited') {
        userStats.invited++;
      } else if (task.replyRecord === 'Changed Mind') {
        userStats.changedMind++;
      } else if (task.replyRecord === 'No Responses') {
        userStats.noResponse++;
      }

      if (task.project) {
        userStats.projects.add(task.project);
      }
      if (task.city) {
        userStats.cities.add(task.city);
      }
    });

    const analyticsData = Array.from(userPerformanceMap.values()).map(user => ({
      ...user,
      projects: Array.from(user.projects),
      cities: Array.from(user.cities)
    }));

    analyticsData.sort((a, b) => b.totalTasks - a.totalTasks);

    const summary = {
      total: allTasks.length,
      eligible: allTasks.filter(t => t.finalStatus === 'Eligible').length,
      notEligible: allTasks.filter(t => t.finalStatus && t.finalStatus.includes('Not Eligible')).length,
      avgTasksPerUser: analyticsData.length > 0 ? Math.round(allTasks.length / analyticsData.length) : 0
    };

    res.status(200).json({
      success: true,
      message: "Performance analytics berhasil diambil",
      data: analyticsData,
      summary,
      dateRange: customStartDate && customEndDate ? {
        start: customStartDate,
        end: customEndDate
      } : null,
      totalUsers: analyticsData.length
    });
  } catch (error) {
    console.error("Get performance analytics error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Gagal mengambil performance analytics", 
      error: error.message 
    });
  }
};

const getUserPerformance = async (req, res) => {
  try {
    const { userName } = req.params;
    const { startDate: customStartDate, endDate: customEndDate } = req.query;

    let dateFilter = {};
    if (customStartDate && customEndDate) {
      const startDateObj = new Date(customStartDate);
      const endDateObj = new Date(customEndDate);
      
      const filterStart = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate(), 0, 0, 0, 0);
      const filterEnd = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: filterStart,
          $lte: filterEnd
        }
      };
    }

    const query = { ...dateFilter, user: userName };

    const userTasks = await TaskManagementData.find(query).lean();

    const stats = {
      userName,
      totalTasks: userTasks.length,
      eligible: userTasks.filter(t => t.finalStatus === 'Eligible').length,
      notEligible: userTasks.filter(t => t.finalStatus && t.finalStatus.includes('Not Eligible')).length,
      invited: userTasks.filter(t => t.replyRecord === 'Invited').length,
      changedMind: userTasks.filter(t => t.replyRecord === 'Changed Mind').length,
      noResponse: userTasks.filter(t => t.replyRecord === 'No Responses').length,
      projects: [...new Set(userTasks.map(t => t.project).filter(Boolean))],
      cities: [...new Set(userTasks.map(t => t.city).filter(Boolean))]
    };

    res.status(200).json({
      success: true,
      message: "User performance berhasil diambil",
      data: stats,
      dateRange: customStartDate && customEndDate ? {
        start: customStartDate,
        end: customEndDate
      } : null
    });
  } catch (error) {
    console.error("Get user performance error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Gagal mengambil user performance", 
      error: error.message 
    });
  }
};

const getPerformanceSummary = async (req, res) => {
  try {
    const { startDate: customStartDate, endDate: customEndDate, groupBy = 'user' } = req.query;

    let dateFilter = {};
    if (customStartDate && customEndDate) {
      const startDateObj = new Date(customStartDate);
      const endDateObj = new Date(customEndDate);
      
      const filterStart = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate(), 0, 0, 0, 0);
      const filterEnd = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: filterStart,
          $lte: filterEnd
        }
      };
    }

    const allTasks = await TaskManagementData.find(dateFilter).lean();

    let groupedData = {};

    if (groupBy === 'user') {
      allTasks.forEach(task => {
        const key = task.user || 'Unknown';
        if (!groupedData[key]) {
          groupedData[key] = { count: 0, eligible: 0, notEligible: 0 };
        }
        groupedData[key].count++;
        if (task.finalStatus === 'Eligible') groupedData[key].eligible++;
        if (task.finalStatus && task.finalStatus.includes('Not Eligible')) groupedData[key].notEligible++;
      });
    } else if (groupBy === 'project') {
      allTasks.forEach(task => {
        const key = task.project || 'Unknown';
        if (!groupedData[key]) {
          groupedData[key] = { count: 0, eligible: 0, notEligible: 0 };
        }
        groupedData[key].count++;
        if (task.finalStatus === 'Eligible') groupedData[key].eligible++;
        if (task.finalStatus && task.finalStatus.includes('Not Eligible')) groupedData[key].notEligible++;
      });
    } else if (groupBy === 'city') {
      allTasks.forEach(task => {
        const key = task.city || 'Unknown';
        if (!groupedData[key]) {
          groupedData[key] = { count: 0, eligible: 0, notEligible: 0 };
        }
        groupedData[key].count++;
        if (task.finalStatus === 'Eligible') groupedData[key].eligible++;
        if (task.finalStatus && task.finalStatus.includes('Not Eligible')) groupedData[key].notEligible++;
      });
    }

    res.status(200).json({
      success: true,
      message: "Performance summary berhasil diambil",
      data: groupedData,
      dateRange: customStartDate && customEndDate ? {
        start: customStartDate,
        end: customEndDate
      } : null,
      groupBy
    });
  } catch (error) {
    console.error("Get performance summary error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Gagal mengambil performance summary", 
      error: error.message 
    });
  }
};

const exportPerformanceReport = async (req, res) => {
  try {
    const { users = [], startDate: customStartDate, endDate: customEndDate } = req.body;

    let dateFilter = {};
    if (customStartDate && customEndDate) {
      const startDateObj = new Date(customStartDate);
      const endDateObj = new Date(customEndDate);
      
      const filterStart = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate(), 0, 0, 0, 0);
      const filterEnd = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: filterStart,
          $lte: filterEnd
        }
      };
    }

    let userFilter = {};
    if (users && Array.isArray(users) && users.length > 0) {
      userFilter = { user: { $in: users } };
    }

    const query = { ...dateFilter, ...userFilter };
    const allTasks = await TaskManagementData.find(query).lean();

    const userPerformanceMap = new Map();

    allTasks.forEach(task => {
      const userName = task.user || 'Unknown';

      if (!userPerformanceMap.has(userName)) {
        userPerformanceMap.set(userName, {
          userName,
          totalTasks: 0,
          eligible: 0,
          notEligible: 0,
          invited: 0,
          changedMind: 0,
          noResponse: 0,
          projects: new Set(),
          cities: new Set()
        });
      }

      const userStats = userPerformanceMap.get(userName);
      userStats.totalTasks++;

      if (task.finalStatus === 'Eligible') {
        userStats.eligible++;
      } else if (task.finalStatus && task.finalStatus.includes('Not Eligible')) {
        userStats.notEligible++;
      }

      if (task.replyRecord === 'Invited') {
        userStats.invited++;
      } else if (task.replyRecord === 'Changed Mind') {
        userStats.changedMind++;
      } else if (task.replyRecord === 'No Responses') {
        userStats.noResponse++;
      }

      if (task.project) userStats.projects.add(task.project);
      if (task.city) userStats.cities.add(task.city);
    });

    const analyticsData = Array.from(userPerformanceMap.values()).map(user => ({
      ...user,
      projects: Array.from(user.projects),
      cities: Array.from(user.cities)
    }));

    analyticsData.sort((a, b) => b.totalTasks - a.totalTasks);

    const wb = XLSX.utils.book_new();

    const summarySheet = createSummarySheet(analyticsData, allTasks, customStartDate, customEndDate);
    XLSX.utils.book_append_sheet(wb, summarySheet, '1. Executive Summary');

    const performanceSheet = createPerformanceSheet(analyticsData);
    XLSX.utils.book_append_sheet(wb, performanceSheet, '2. User Performance');

    const detailsSheet = createDetailsSheet(allTasks);
    XLSX.utils.book_append_sheet(wb, detailsSheet, '3. Task Details');

    const insightsSheet = createInsightsSheet(analyticsData);
    XLSX.utils.book_append_sheet(wb, insightsSheet, '4. Insights');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);

    console.log(`Performance report exported: ${analyticsData.length} users, ${allTasks.length} tasks`);
  } catch (error) {
    console.error("Export performance report error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Gagal export performance report", 
      error: error.message 
    });
  }
};

const createSummarySheet = (analyticsData, allTasks, startDate, endDate) => {
  const totalTasks = allTasks.length;
  const totalEligible = allTasks.filter(t => t.finalStatus === 'Eligible').length;
  const totalNotEligible = allTasks.filter(t => t.finalStatus && t.finalStatus.includes('Not Eligible')).length;
  const totalInvited = allTasks.filter(t => t.replyRecord === 'Invited').length;
  const totalChangedMind = allTasks.filter(t => t.replyRecord === 'Changed Mind').length;
  const totalNoResponse = allTasks.filter(t => t.replyRecord === 'No Responses').length;
  
  const successRate = totalTasks > 0 ? ((totalEligible / totalTasks) * 100).toFixed(1) : '0.0';
  const avgTasksPerUser = analyticsData.length > 0 ? (totalTasks / analyticsData.length).toFixed(1) : '0.0';
  const responseRate = totalTasks > 0 ? (((totalInvited + totalChangedMind + totalNoResponse) / totalTasks) * 100).toFixed(1) : '0.0';

  const summaryData = [
    ['PERFORMANCE ANALYTICS - EXECUTIVE SUMMARY'],
    [''],
    ['Report Generated', new Date().toLocaleString('id-ID')],
    ['Report Period', startDate && endDate ? `${new Date(startDate).toLocaleDateString('id-ID')} - ${new Date(endDate).toLocaleDateString('id-ID')}` : 'All Time'],
    [''],
    ['KEY PERFORMANCE INDICATORS'],
    ['Metric', 'Value', 'Description'],
    ['Total Tasks', totalTasks, 'Total number of tasks processed'],
    ['Overall Success Rate', `${successRate}%`, 'Percentage of tasks marked as Eligible'],
    ['Total Eligible', totalEligible, 'Tasks successfully qualified'],
    ['Total Not Eligible', totalNotEligible, 'Tasks that did not meet criteria'],
    ['Active Users', analyticsData.length, 'Number of users who processed tasks'],
    ['Average Tasks per User', avgTasksPerUser, 'Average workload distribution'],
    ['Response Rate', `${responseRate}%`, 'Percentage of tasks with responses'],
    [''],
    ['REPLY RECORD DISTRIBUTION'],
    ['Status', 'Count', 'Percentage'],
    ['Invited', totalInvited, totalTasks > 0 ? `${((totalInvited/totalTasks)*100).toFixed(1)}%` : '0%'],
    ['Changed Mind', totalChangedMind, totalTasks > 0 ? `${((totalChangedMind/totalTasks)*100).toFixed(1)}%` : '0%'],
    ['No Response', totalNoResponse, totalTasks > 0 ? `${((totalNoResponse/totalTasks)*100).toFixed(1)}%` : '0%'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(summaryData);
  
  ws['!cols'] = [
    { wch: 30 },
    { wch: 20 },
    { wch: 50 }
  ];

  return ws;
};

const createPerformanceSheet = (analyticsData) => {
  const performanceData = analyticsData.map((user, index) => {
    const successRate = user.totalTasks > 0 ? ((user.eligible / user.totalTasks) * 100).toFixed(1) : '0.0';
    const responseRate = user.totalTasks > 0 ? (((user.invited + user.changedMind + user.noResponse) / user.totalTasks) * 100).toFixed(1) : '0.0';
    const conversionRate = user.invited > 0 ? ((user.eligible / user.invited) * 100).toFixed(1) : '0.0';
    
    let performanceLevel = 'Needs Improvement';
    if (parseFloat(successRate) >= 70) performanceLevel = 'Excellent';
    else if (parseFloat(successRate) >= 50) performanceLevel = 'Good';
    else if (parseFloat(successRate) >= 30) performanceLevel = 'Fair';

    return {
      'Rank': index + 1,
      'User Name': user.userName,
      'Total Tasks': user.totalTasks,
      'Eligible': user.eligible,
      'Not Eligible': user.notEligible,
      'Success Rate (%)': successRate,
      'Invited': user.invited,
      'Changed Mind': user.changedMind,
      'No Response': user.noResponse,
      'Response Rate (%)': responseRate,
      'Conversion Rate (%)': conversionRate,
      'Performance Level': performanceLevel,
      'Projects': user.projects.join(', '),
      'Cities': user.cities.join(', ')
    };
  });

  const ws = XLSX.utils.json_to_sheet(performanceData);
  
  ws['!cols'] = [
    { wch: 6 },
    { wch: 20 },
    { wch: 12 },
    { wch: 10 },
    { wch: 13 },
    { wch: 15 },
    { wch: 10 },
    { wch: 13 },
    { wch: 12 },
    { wch: 16 },
    { wch: 17 },
    { wch: 18 },
    { wch: 30 },
    { wch: 30 }
  ];

  return ws;
};

const createDetailsSheet = (allTasks) => {
  const detailsData = allTasks.map(task => ({
    'User': task.user || '',
    'Full Name': task.fullName || '',
    'Date': task.date ? new Date(task.date).toLocaleDateString('id-ID') : '',
    'Phone Number': task.phoneNumber || '',
    'City': task.city || '',
    'Project': task.project || '',
    'Reply Record': task.replyRecord || '',
    'Final Status': task.finalStatus || '',
    'Note': task.note || ''
  }));

  const ws = XLSX.utils.json_to_sheet(detailsData);
  
  ws['!cols'] = [
    { wch: 15 },
    { wch: 25 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 28 },
    { wch: 35 }
  ];

  return ws;
};

const createInsightsSheet = (analyticsData) => {
  const topPerformers = analyticsData
    .filter(u => u.totalTasks > 0 && ((u.eligible / u.totalTasks) * 100) >= 70)
    .slice(0, 10)
    .map((u, i) => ({
      'Category': 'Top Performer',
      'Rank': i + 1,
      'User': u.userName,
      'Total Tasks': u.totalTasks,
      'Success Rate (%)': ((u.eligible / u.totalTasks) * 100).toFixed(1),
      'Key Strength': 'High success rate demonstrates excellent execution'
    }));

  const needsImprovement = analyticsData
    .filter(u => u.totalTasks > 0 && ((u.eligible / u.totalTasks) * 100) < 50)
    .map((u, i) => ({
      'Category': 'Priority Area',
      'Rank': i + 1,
      'User': u.userName,
      'Total Tasks': u.totalTasks,
      'Success Rate (%)': ((u.eligible / u.totalTasks) * 100).toFixed(1),
      'Key Issue': 'Success rate below target - requires coaching and support'
    }));

  const volumeLeaders = [...analyticsData]
    .sort((a, b) => b.totalTasks - a.totalTasks)
    .slice(0, 10)
    .map((u, i) => ({
      'Category': 'Volume Leader',
      'Rank': i + 1,
      'User': u.userName,
      'Total Tasks': u.totalTasks,
      'Success Rate (%)': u.totalTasks > 0 ? ((u.eligible / u.totalTasks) * 100).toFixed(1) : '0.0',
      'Key Strength': 'High task volume demonstrates strong productivity'
    }));

  const insightsData = [...topPerformers, ...needsImprovement, ...volumeLeaders];

  const ws = XLSX.utils.json_to_sheet(insightsData);
  
  ws['!cols'] = [
    { wch: 18 },
    { wch: 6 },
    { wch: 20 },
    { wch: 12 },
    { wch: 16 },
    { wch: 55 }
  ];

  return ws;
};

const generatePerformanceChart = async (req, res) => {
  let inputPath = null;
  let outputPath = null;

  try {
    console.log('Starting task performance chart generation...');
    await ensureTempDir();

    const { startDate: customStartDate, endDate: customEndDate } = req.body;

    let dateFilter = {};
    if (customStartDate && customEndDate) {
      const startDateObj = new Date(customStartDate);
      const endDateObj = new Date(customEndDate);
      
      const filterStart = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate(), 0, 0, 0, 0);
      const filterEnd = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: filterStart,
          $lte: filterEnd
        }
      };
    }

    const query = { ...dateFilter };
    const allTasks = await TaskManagementData.find(query).lean();

    if (allTasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data untuk generate chart",
        error: "No data available for the selected period"
      });
    }

    const userPerformanceMap = new Map();

    allTasks.forEach(task => {
      const userName = task.user || 'Unknown';

      if (!userPerformanceMap.has(userName)) {
        userPerformanceMap.set(userName, {
          userName,
          totalTasks: 0,
          eligible: 0,
          notEligible: 0,
          invited: 0,
          changedMind: 0,
          noResponse: 0,
          projects: new Set(),
          cities: new Set()
        });
      }

      const userStats = userPerformanceMap.get(userName);
      userStats.totalTasks++;

      if (task.finalStatus === 'Eligible') {
        userStats.eligible++;
      } else if (task.finalStatus && task.finalStatus.includes('Not Eligible')) {
        userStats.notEligible++;
      }

      if (task.replyRecord === 'Invited') {
        userStats.invited++;
      } else if (task.replyRecord === 'Changed Mind') {
        userStats.changedMind++;
      } else if (task.replyRecord === 'No Responses') {
        userStats.noResponse++;
      }

      if (task.project) {
        userStats.projects.add(task.project);
      }
      if (task.city) {
        userStats.cities.add(task.city);
      }
    });

    const analyticsData = Array.from(userPerformanceMap.values()).map(user => ({
      ...user,
      projects: Array.from(user.projects),
      cities: Array.from(user.cities)
    }));

    analyticsData.sort((a, b) => b.totalTasks - a.totalTasks);

    const performanceData = analyticsData.map((user, index) => {
      const successRate = user.totalTasks > 0 ? ((user.eligible / user.totalTasks) * 100) : 0;
      const responseRate = user.totalTasks > 0 ? (((user.invited + user.changedMind + user.noResponse) / user.totalTasks) * 100) : 0;
      const conversionRate = user.invited > 0 ? ((user.eligible / user.invited) * 100) : 0;

      let performanceLevel = 'Needs Improvement';
      if (successRate >= 70) performanceLevel = 'Excellent';
      else if (successRate >= 50) performanceLevel = 'Good';
      else if (successRate >= 30) performanceLevel = 'Fair';

      return {
        'Rank': index + 1,
        'User Name': user.userName,
        'Total Tasks': user.totalTasks,
        'Eligible': user.eligible,
        'Not Eligible': user.notEligible,
        'Success Rate': successRate.toFixed(1),
        'Invited': user.invited,
        'Changed Mind': user.changedMind,
        'No Response': user.noResponse,
        'Response Rate': responseRate.toFixed(1),
        'Conversion Rate': conversionRate.toFixed(1),
        'Projects': user.projects.join(', '),
        'Cities': user.cities.join(', '),
        'Performance Level': performanceLevel
      };
    });

    const totalTasks = allTasks.length;
    const totalEligible = allTasks.filter(t => t.finalStatus === 'Eligible').length;
    const totalNotEligible = allTasks.filter(t => t.finalStatus && t.finalStatus.includes('Not Eligible')).length;
    const overallSuccessRate = totalTasks > 0 ? ((totalEligible / totalTasks) * 100).toFixed(1) : '0';
    const avgTasksPerUser = analyticsData.length > 0 ? Math.round(totalTasks / analyticsData.length) : 0;

    const totalInvited = allTasks.filter(t => t.replyRecord === 'Invited').length;
    const totalChangedMind = allTasks.filter(t => t.replyRecord === 'Changed Mind').length;
    const totalNoResponse = allTasks.filter(t => t.replyRecord === 'No Responses').length;
    const totalResponses = totalInvited + totalChangedMind + totalNoResponse;
    const responseRate = totalTasks > 0 ? ((totalResponses / totalTasks) * 100).toFixed(1) : '0';

    const summaryData = [
      {
        'Metric': 'Total Tasks',
        'Value': totalTasks.toLocaleString(),
        'Unit': 'tasks',
        'Description': 'Total number of tasks processed in the selected period'
      },
      {
        'Metric': 'Overall Success Rate',
        'Value': overallSuccessRate,
        'Unit': 'percentage',
        'Description': 'Percentage of tasks marked as Eligible'
      },
      {
        'Metric': 'Total Eligible',
        'Value': totalEligible.toLocaleString(),
        'Unit': 'tasks',
        'Description': 'Number of tasks successfully qualified as Eligible'
      },
      {
        'Metric': 'Total Not Eligible',
        'Value': totalNotEligible.toLocaleString(),
        'Unit': 'tasks',
        'Description': 'Number of tasks that did not meet eligibility criteria'
      },
      {
        'Metric': 'Average Tasks per User',
        'Value': avgTasksPerUser.toLocaleString(),
        'Unit': 'tasks',
        'Description': 'Average workload distribution across all users'
      },
      {
        'Metric': 'Response Rate',
        'Value': responseRate,
        'Unit': 'percentage',
        'Description': 'Percentage of tasks with recorded responses'
      },
      {
        'Metric': 'Active Users',
        'Value': analyticsData.length.toLocaleString(),
        'Unit': 'users',
        'Description': 'Number of users who processed tasks in this period'
      }
    ];

    const topPerformers = performanceData.filter(u => parseFloat(u['Success Rate']) >= 70).slice(0, 10);
    const priorityAreas = performanceData.filter(u => parseFloat(u['Success Rate']) < 50);
    const volumeLeaders = [...performanceData].sort((a, b) => b['Total Tasks'] - a['Total Tasks']).slice(0, 10);

    const insightsData = [
      ...topPerformers.map(user => ({
        'Category': 'Top Performer',
        'User': user['User Name'],
        'Total Tasks': user['Total Tasks'],
        'Success Rate': user['Success Rate'],
        'Performance Level': user['Performance Level'],
        'Rank': user['Rank'],
        'Issues': '-'
      })),
      ...priorityAreas.map(user => ({
        'Category': 'Priority Area',
        'User': user['User Name'],
        'Total Tasks': user['Total Tasks'],
        'Success Rate': user['Success Rate'],
        'Performance Level': user['Performance Level'],
        'Rank': user['Rank'],
        'Issues': 'Low success rate requires immediate coaching and process review'
      })),
      ...volumeLeaders.map(user => ({
        'Category': 'Volume Leader',
        'User': user['User Name'],
        'Total Tasks': user['Total Tasks'],
        'Success Rate': user['Success Rate'],
        'Performance Level': user['Performance Level'],
        'Rank': user['Rank'],
        'Issues': '-'
      }))
    ];

    const chartData = {
      performanceData,
      summaryData,
      insightsData,
      dateRange: customStartDate && customEndDate ? {
        start: new Date(customStartDate).toLocaleDateString('id-ID'),
        end: new Date(customEndDate).toLocaleDateString('id-ID')
      } : null
    };

    console.log('Processed chart data:', {
      performanceCount: performanceData.length,
      summaryCount: summaryData.length,
      insightsCount: insightsData.length
    });

    const inputFilename = generateUniqueFilename("task_analytics_data", "json");
    const outputFilename = generateUniqueFilename("task_analytics_chart", "xlsx");

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
    const fileName = `Task_Performance_Analytics_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;

    console.log('Sending file to client...');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    res.send(fileBuffer);

  } catch (error) {
    console.error("Generate performance chart error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal generate performance chart",
      error: error.message || "Failed to generate task performance chart",
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
};

module.exports = {
  getPerformanceAnalytics,
  getUserPerformance,
  getPerformanceSummary,
  exportPerformanceReport,
  generatePerformanceChart
};