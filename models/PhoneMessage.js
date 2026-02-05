const mongoose = require("mongoose");

const phoneMessageSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("PhoneMessage", phoneMessageSchema);