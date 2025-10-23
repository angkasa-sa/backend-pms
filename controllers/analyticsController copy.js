const TaskManagementData = require("../models/TaskManagementData");
const XLSX = require('xlsx');

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

const formatHistoryForExport = (historyArray, historyType) => {
  if (!historyArray || historyArray.length === 0) return '';
  
  return historyArray.map(h => {
    const date = h.editedAt ? new Date(h.editedAt).toLocaleString('id-ID') : '-';
    const editor = h.editedBy || 'System';
    const oldVal = h.oldValue || '-';
    const newVal = h.newValue || '-';
    
    if (historyType === 'edit') {
      return `[${date}] ${h.fieldName}: "${oldVal}" → "${newVal}" (by ${editor})`;
    } else if (historyType === 'replyRecord') {
      return `[${date}] "${oldVal}" → "${newVal}" (by ${editor})`;
    } else if (historyType === 'finalStatus') {
      return `[${date}] "${oldVal}" → "${newVal}" (by ${editor})`;
    }
    return '';
  }).join(' | ');
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
          noResponse: 0
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
    });

    const performanceExportData = Array.from(userPerformanceMap.values()).map(user => ({
      'User': user.userName,
      'Total Tasks': user.totalTasks,
      'Eligible': user.eligible,
      'Not Eligible': user.notEligible,
      'Success Rate': user.totalTasks > 0 ? `${((user.eligible / user.totalTasks) * 100).toFixed(1)}%` : '0%',
      'Invited': user.invited,
      'Changed Mind': user.changedMind,
      'No Response': user.noResponse
    }));

    performanceExportData.sort((a, b) => b['Total Tasks'] - a['Total Tasks']);

    const detailedTasksData = allTasks.map(task => ({
      'User': task.user || '',
      'Full Name': task.fullName || '',
      'Date': task.date ? new Date(task.date).toLocaleDateString('id-ID') : '',
      'Phone Number': task.phoneNumber || '',
      'Domicile': task.domicile || '',
      'City': task.city || '',
      'Project': task.project || '',
      'Reply Record': task.replyRecord || '',
      'Final Status': task.finalStatus || '',
      'Note': task.note || '',
      'NIK': task.nik || '',
      'Edit History': formatHistoryForExport(task.editHistory, 'edit'),
      'Reply Record History': formatHistoryForExport(task.replyRecordHistory, 'replyRecord'),
      'Final Status History': formatHistoryForExport(task.finalStatusHistory, 'finalStatus'),
      'Created At': new Date(task.createdAt).toLocaleString('id-ID'),
      'Updated At': new Date(task.updatedAt).toLocaleString('id-ID')
    }));

    const wb = XLSX.utils.book_new();

    const wsPerformance = XLSX.utils.json_to_sheet(performanceExportData);
    const wscolsPerformance = [
      { wch: 20 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 }
    ];
    wsPerformance['!cols'] = wscolsPerformance;
    XLSX.utils.book_append_sheet(wb, wsPerformance, 'Performance Summary');

    const wsDetails = XLSX.utils.json_to_sheet(detailedTasksData);
    const wscolsDetails = [
      { wch: 15 },
      { wch: 30 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
      { wch: 30 },
      { wch: 20 },
      { wch: 50 },
      { wch: 50 },
      { wch: 50 },
      { wch: 20 },
      { wch: 20 }
    ];
    wsDetails['!cols'] = wscolsDetails;
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Detailed Tasks Data');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);

    console.log(`Performance report exported successfully: ${performanceExportData.length} users, ${detailedTasksData.length} tasks`);
  } catch (error) {
    console.error("Export performance report error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Gagal export performance report", 
      error: error.message 
    });
  }
};

module.exports = {
  getPerformanceAnalytics,
  getUserPerformance,
  getPerformanceSummary,
  exportPerformanceReport
};