const mongoose = require("mongoose");

const larkConfigSchema = new mongoose.Schema({
tenant_access_token: {
type: String,
default: ""
},
user_access_token: {
type: String,
default: ""
},
app_access_token: {
type: String,
default: ""
},
expires_at: {
type: Date,
default: null
},
updatedAt: {
type: Date,
default: Date.now
}
}, {
timestamps: true,
collection: "larkconfig"
});

larkConfigSchema.pre("save", function(next) {
this.updatedAt = new Date();
next();
});

larkConfigSchema.statics.updateTokens = async function(tokens) {
try {
console.log("🔄 Updating tokens in database...");
console.log("📊 New token data:", {
tenant_access_token: tokens.tenant_access_token ? `${tokens.tenant_access_token.substring(0, 10)}...` : "empty",
expire: tokens.expire
});

await this.deleteMany({});
console.log("🗑️ Cleared existing token records");

const newConfig = new this({
tenant_access_token: tokens.tenant_access_token || "",
user_access_token: tokens.user_access_token || "",
app_access_token: tokens.app_access_token || "",
expires_at: tokens.expire ? new Date(Date.now() + (tokens.expire * 1000)) : null,
updatedAt: new Date()
});

const savedConfig = await newConfig.save();
console.log("✅ New tokens saved to database");
console.log("📊 Saved config ID:", savedConfig._id);
console.log("📊 Expires at:", savedConfig.expires_at);

return savedConfig;
} catch (error) {
console.error("❌ Error updating tokens in database:", error.message);
throw error;
}
};

larkConfigSchema.statics.getTokens = async function() {
try {
const config = await this.findOne().sort({ createdAt: -1 });
if (!config) {
console.log("⚠️ No token config found in database");
return { 
tenant_access_token: "", 
user_access_token: "", 
app_access_token: "" 
};
}
console.log("📊 Retrieved tokens from database");
return config;
} catch (error) {
console.error("❌ Error getting tokens from database:", error.message);
return { 
tenant_access_token: "", 
user_access_token: "", 
app_access_token: "" 
};
}
};

module.exports = mongoose.model("LarkConfig", larkConfigSchema);