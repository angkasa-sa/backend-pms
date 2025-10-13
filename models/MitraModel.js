const mongoose = require("mongoose");

const MitraSchema = new mongoose.Schema({
  mitraId: String,
  username: String,
  fullName: String,
  phoneNumber: {
    type: String,
    required: true
  },
  unitName: String,
  assistantCoordinator: String,
  commissionFee: String,
  mitraStatus: String,
  city: String,
  attendance: String,
  otp: String,
  bankInfoProvided: String,
  appVersion: String,
  appVersionCode: String,
  appApiVersion: String,
  androidVersion: String,
  lastActive: String,
  createdAt: String,
  registeredAt: String,
  hubCategory: String,
  businessCategory: String
}, {
  timestamps: true
});

module.exports = mongoose.model("Mitra", MitraSchema);