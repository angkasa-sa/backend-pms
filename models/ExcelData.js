const mongoose = require("mongoose");

const DataSchema = new mongoose.Schema({
"Client Name": String,
"Project Name": String,
"Date": String,
"Drop Point": String,
"HUB": String,
"Order Code": String,
Weight: String,
RoundDown: Number,
RoundUp: Number,
WeightDecimal: Number,
Distance: Number,
"RoundDown Distance": Number,
"RoundUp Distance": Number,
"Payment Term": String,
"Cnee Name": String,
"Cnee Address 1": String,
"Cnee Address 2": String,
"Cnee Area": String,
lat_long: String,
"Location Expected": String,
"Additional Notes For Address": Number,
"Slot Time": String,
"Cnee Phone": String,
"Courier Code": String,
"Courier Name": String,
"Driver Phone": String,
"Receiver": String,
"Recipient Email": String,
"Items Name": String,
"Photo Delivery": String,
"Batch": String,
ETA: String,
"Receiving Date": String,
"Receiving Time": String,
"Delivery Start Date": String,
"Delivery Start Time": String,
"Pickup Done": String,
"DropOff Done": String,
"Delivery Start": String,
"Add Charge 1": String,
"Add Charge 2": Number,
"Cost": Number,
"Add Cost 1": Number,
"Add Cost 2": Number,
"Selling Price": Number,
"Zona": String,
"Total Pengiriman": Number,
"Delivery Status": {
type: String,
enum: ["ONTIME", "LATE", ""],
default: ""
}
}, {
timestamps: true,
strict: false
});

DataSchema.methods.calculateDeliveryStatus = function() {
if (!this["Receiving Time"] || !this.ETA || this.ETA === "INVALID" || this.ETA === "No valid time") {
return "";
}

const parseTime = (timeStr) => {
if (!timeStr || typeof timeStr !== "string") return null;
const cleanTime = timeStr.split(" ")[0];
const timeParts = cleanTime.split(":");
if (timeParts.length < 2) return null;
const hours = parseInt(timeParts[0], 10);
const minutes = parseInt(timeParts[1], 10);
if (isNaN(hours) || isNaN(minutes)) return null;
if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
return hours * 60 + minutes;
};

const receivingMinutes = parseTime(this["Receiving Time"]);
const etaMinutes = parseTime(this.ETA);

if (receivingMinutes === null || etaMinutes === null) {
return "";
}

return receivingMinutes <= etaMinutes ? "ONTIME" : "LATE";
};

DataSchema.pre('save', function(next) {
if (this.isModified('Receiving Time') || this.isModified('ETA')) {
this["Delivery Status"] = this.calculateDeliveryStatus();
}
next();
});

DataSchema.pre('updateOne', function(next) {
const update = this.getUpdate();
if (update.$set && (update.$set['Receiving Time'] || update.$set['ETA'])) {
const doc = this.getOptions().document || {};
const receivingTime = update.$set['Receiving Time'] || doc['Receiving Time'];
const eta = update.$set['ETA'] || doc['ETA'];

if (receivingTime && eta) {
const tempDoc = { 
"Receiving Time": receivingTime, 
ETA: eta,
calculateDeliveryStatus: DataSchema.methods.calculateDeliveryStatus
};
update.$set["Delivery Status"] = tempDoc.calculateDeliveryStatus();
}
}
next();
});

DataSchema.index({ "Client Name": 1, "Order Code": 1 });
DataSchema.index({ "Courier Code": 1 });
DataSchema.index({ "HUB": 1 });
DataSchema.index({ "Delivery Status": 1 });

module.exports = mongoose.model("ExcelData", DataSchema);