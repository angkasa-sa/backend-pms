const mongoose = require('mongoose');

const ShipmentPerformanceSchema = new mongoose.Schema({
  business: {
    type: String,
    trim: true,
    default: '-'
  },
  hub: {
    type: String,
    trim: true,
    default: '-'
  },
  mitra_name: {
    type: String,
    required: [true, 'Mitra name is required'],
    trim: true
  },
  delivery_date: {
    type: String,
    trim: true,
    default: '-'
  },
  weekly: {
    type: String,
    trim: true,
    default: '-'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

ShipmentPerformanceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

ShipmentPerformanceSchema.index({ business: 1 });
ShipmentPerformanceSchema.index({ hub: 1 });
ShipmentPerformanceSchema.index({ mitra_name: 1 });
ShipmentPerformanceSchema.index({ delivery_date: 1 });
ShipmentPerformanceSchema.index({ weekly: 1 });
ShipmentPerformanceSchema.index({ business: 1, hub: 1 });

module.exports = mongoose.models.ShipmentPerformance || mongoose.model('ShipmentPerformance', ShipmentPerformanceSchema);