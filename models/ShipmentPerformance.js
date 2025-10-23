const mongoose = require('mongoose');

const ShipmentPerformanceSchema = new mongoose.Schema({
  client_name: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  project_name: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  delivery_date: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  drop_point: { 
    type: String, 
    trim: true, 
    default: '-' 
  },
  hub: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  order_code: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  weight: { 
    type: String, 
    trim: true, 
    default: '-' 
  },
  distance_km: { 
    type: String, 
    trim: true, 
    default: '-' 
  },
  mitra_code: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  mitra_name: { 
    type: String, 
    required: [true, 'Mitra name is required'], 
    trim: true, 
    index: true 
  },
  receiving_date: { 
    type: String, 
    trim: true, 
    default: '-' 
  },
  vehicle_type: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  cost: { 
    type: String, 
    trim: true, 
    default: '-' 
  },
  sla: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  weekly: { 
    type: String, 
    trim: true, 
    default: '-', 
    index: true 
  },
  delivery_month: { 
    type: Number, 
    index: true 
  },
  delivery_year: { 
    type: Number, 
    index: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  collection: 'shipmentperformances',
  strict: true,
  timestamps: true
});

ShipmentPerformanceSchema.index({ client_name: 1, delivery_year: 1, delivery_month: 1 });
ShipmentPerformanceSchema.index({ mitra_name: 1, client_name: 1, delivery_year: 1 });
ShipmentPerformanceSchema.index({ client_name: 1, hub: 1, delivery_year: 1 });
ShipmentPerformanceSchema.index({ weekly: 1, delivery_year: 1, delivery_month: 1 });
ShipmentPerformanceSchema.index({ delivery_year: 1, delivery_month: 1 });
ShipmentPerformanceSchema.index({ mitra_name: 1, delivery_year: 1 });
ShipmentPerformanceSchema.index({ client_name: 1, mitra_name: 1 });
ShipmentPerformanceSchema.index({ hub: 1, mitra_name: 1 });

ShipmentPerformanceSchema.pre('save', function(next) {
  if (this.delivery_date && this.delivery_date !== '-') {
    const parts = this.delivery_date.split('/');
    if (parts.length === 3) {
      this.delivery_month = parseInt(parts[1], 10);
      this.delivery_year = parseInt(parts[2], 10);
    }
  }
  next();
});

ShipmentPerformanceSchema.statics.getProjectAnalysisData = async function(filters = {}) {
  const matchStage = { client_name: { $ne: '-' }, mitra_name: { $exists: true, $ne: null } };
  
  if (filters.year) matchStage.delivery_year = parseInt(filters.year);
  if (filters.project) matchStage.client_name = filters.project;
  if (filters.hub) matchStage.hub = filters.hub;

  const pipeline = [
    { $match: matchStage },
    { $group: {
        _id: { project: "$client_name", year: "$delivery_year", hub: "$hub", month: "$delivery_month" },
        mitras: { $addToSet: "$mitra_name" },
        count: { $sum: 1 }
      }
    },
    { $group: {
        _id: { project: "$_id.project", year: "$_id.year", hub: "$_id.hub" },
        monthlyData: { $push: { month: "$_id.month", mitraCount: { $size: "$mitras" } } },
        allMitras: { $push: "$mitras" }
      }
    },
    { $project: {
        project: "$_id.project",
        year: "$_id.year",
        hub: "$_id.hub",
        monthlyData: 1,
        total: { $size: { $reduce: { input: "$allMitras", initialValue: [], in: { $setUnion: ["$$value", "$$this"] } } } }
      }
    },
    { $sort: { project: 1, year: -1, hub: 1 } }
  ];

  return await this.aggregate(pipeline).allowDiskUse(true).exec();
};

ShipmentPerformanceSchema.statics.getProjectWeeklyData = async function(filters = {}) {
  const matchStage = { client_name: { $ne: '-' }, weekly: { $ne: '-' }, mitra_name: { $exists: true, $ne: null } };
  
  if (filters.year) matchStage.delivery_year = parseInt(filters.year);
  if (filters.project) matchStage.client_name = filters.project;
  if (filters.hub) matchStage.hub = filters.hub;

  const pipeline = [
    { $match: matchStage },
    { $group: {
        _id: { project: "$client_name", year: "$delivery_year", hub: "$hub", weekly: "$weekly" },
        mitras: { $addToSet: "$mitra_name" }
      }
    },
    { $group: {
        _id: { project: "$_id.project", year: "$_id.year", hub: "$_id.hub" },
        weeklyData: { $push: { weekly: "$_id.weekly", mitraCount: { $size: "$mitras" } } },
        allMitras: { $push: "$mitras" }
      }
    },
    { $project: {
        project: "$_id.project",
        year: "$_id.year",
        hub: "$_id.hub",
        weeklyData: 1,
        total: { $size: { $reduce: { input: "$allMitras", initialValue: [], in: { $setUnion: ["$$value", "$$this"] } } } }
      }
    },
    { $sort: { project: 1, year: -1, hub: 1 } }
  ];

  return await this.aggregate(pipeline).allowDiskUse(true).exec();
};

ShipmentPerformanceSchema.statics.getMitraAnalysisData = async function(filters = {}) {
  const matchStage = { mitra_name: { $exists: true, $ne: null }, client_name: { $ne: '-' } };
  
  if (filters.year) matchStage.delivery_year = parseInt(filters.year);
  if (filters.client) matchStage.client_name = filters.client;
  if (filters.hub) matchStage.hub = filters.hub;
  if (filters.mitra) matchStage.mitra_name = { $regex: filters.mitra, $options: 'i' };

  const pipeline = [
    { $match: matchStage },
    { $group: {
        _id: { mitra: "$mitra_name", client: "$client_name", year: "$delivery_year", hub: "$hub", month: "$delivery_month" },
        deliveryCount: { $sum: 1 }
      }
    },
    { $group: {
        _id: { mitra: "$_id.mitra", client: "$_id.client", year: "$_id.year", hub: "$_id.hub" },
        monthlyData: { $push: { month: "$_id.month", count: "$deliveryCount" } },
        total: { $sum: "$deliveryCount" }
      }
    },
    { $project: {
        mitra_name: "$_id.mitra",
        client: "$_id.client",
        year: "$_id.year",
        hub: "$_id.hub",
        monthlyData: 1,
        total: 1
      }
    },
    { $sort: { mitra_name: 1, client: 1, year: -1 } }
  ];

  return await this.aggregate(pipeline).allowDiskUse(true).exec();
};

ShipmentPerformanceSchema.statics.getMitraWeeklyData = async function(filters = {}) {
  const matchStage = { mitra_name: { $exists: true, $ne: null }, client_name: { $ne: '-' }, weekly: { $ne: '-' } };
  
  if (filters.year) matchStage.delivery_year = parseInt(filters.year);
  if (filters.client) matchStage.client_name = filters.client;
  if (filters.hub) matchStage.hub = filters.hub;
  if (filters.mitra) matchStage.mitra_name = { $regex: filters.mitra, $options: 'i' };

  const pipeline = [
    { $match: matchStage },
    { $group: {
        _id: { mitra: "$mitra_name", client: "$client_name", year: "$delivery_year", hub: "$hub", weekly: "$weekly" },
        deliveryCount: { $sum: 1 }
      }
    },
    { $group: {
        _id: { mitra: "$_id.mitra", client: "$_id.client", year: "$_id.year", hub: "$_id.hub" },
        weeklyData: { $push: { weekly: "$_id.weekly", count: "$deliveryCount" } },
        total: { $sum: "$deliveryCount" }
      }
    },
    { $project: {
        mitra_name: "$_id.mitra",
        client: "$_id.client",
        year: "$_id.year",
        hub: "$_id.hub",
        weeklyData: 1,
        total: 1
      }
    },
    { $sort: { mitra_name: 1, client: 1, year: -1 } }
  ];

  return await this.aggregate(pipeline).allowDiskUse(true).exec();
};

module.exports = mongoose.models.ShipmentPerformance || mongoose.model('ShipmentPerformance', ShipmentPerformanceSchema);