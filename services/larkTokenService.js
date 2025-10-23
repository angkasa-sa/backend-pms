const https = require("https");
const LarkConfig = require("../models/LarkConfig");

const APP_ID = process.env.LARK_APP_ID || "cli_a8100896dcb81010";
const APP_SECRET = process.env.LARK_APP_SECRET || "HySokQAcahOUpisfMDSgNe3IVuYocDh3";
const API_URL = "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const getTenantAccessToken = () => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, 10000);

    const postData = JSON.stringify({
      app_id: APP_ID,
      app_secret: APP_SECRET
    });

    const options = {
      method: "POST",
      timeout: 8000,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(postData)
      }
    };

    const req = https.request(API_URL, options, (res) => {
      clearTimeout(timeout);
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.code === 0) {
            resolve(response);
          } else {
            reject(new Error(`Lark API Error: ${response.msg}`));
          }
        } catch (error) {
          reject(new Error("Invalid JSON response from Lark API"));
        }
      });
    });

    req.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    req.on("timeout", () => {
      clearTimeout(timeout);
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.write(postData);
    req.end();
  });
};

const updateTokensInDB = async (tokens) => {
  try {
    const result = await Promise.race([
      LarkConfig.updateTokens(tokens),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Database operation timeout")), 5000))
    ]);
    console.log("💾 Tokens saved to database successfully");
    return result;
  } catch (error) {
    console.error("❌ Error saving tokens to database:", error.message);
    throw error;
  }
};

const initializeLarkTokens = async () => {
  const maxRetries = 2;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`🔑 Initializing Lark tokens... (attempt ${attempt + 1}/${maxRetries})`);

      const result = await Promise.race([
        getTenantAccessToken(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Token request timeout")), 8000))
      ]);

      const tokens = {
        tenant_access_token: result.tenant_access_token || "",
        user_access_token: "",
        app_access_token: "",
        expire: result.expire
      };

      await updateTokensInDB(tokens);

      console.log("✅ Lark tokens initialized successfully");
      console.log(`📊 Token expires in: ${result.expire} seconds`);

      return tokens;
    } catch (error) {
      attempt++;
      console.error(`❌ Error initializing Lark tokens (attempt ${attempt}):`, error.message);
      
      if (attempt >= maxRetries) {
        console.error("❌ Max retries reached for Lark token initialization");
        
        const emptyTokens = {
          tenant_access_token: "",
          user_access_token: "",
          app_access_token: ""
        };

        try {
          await updateTokensInDB(emptyTokens);
        } catch (dbError) {
          console.error("❌ Failed to save empty tokens:", dbError.message);
        }

        return emptyTokens;
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

const refreshTokenIfNeeded = async () => {
  try {
    const config = await Promise.race([
      LarkConfig.findOne(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Database query timeout")), 3000))
    ]);

    if (!config || !config.expires_at || new Date() >= config.expires_at) {
      console.log("🔄 Refreshing Lark token...");
      return await initializeLarkTokens();
    }

    return {
      tenant_access_token: config.tenant_access_token,
      user_access_token: config.user_access_token,
      app_access_token: config.app_access_token
    };
  } catch (error) {
    console.error("❌ Error refreshing token:", error.message);
    return await initializeLarkTokens();
  }
};

const forceRefreshTokens = async () => {
  try {
    console.log("🔄 Force refreshing Lark tokens...");
    const result = await getTenantAccessToken();

    const tokens = {
      tenant_access_token: result.tenant_access_token || "",
      user_access_token: "",
      app_access_token: "",
      expire: result.expire
    };

    await updateTokensInDB(tokens);

    console.log("✅ Lark tokens force refreshed successfully");
    console.log(`📊 New token expires in: ${result.expire} seconds`);
    return tokens;
  } catch (error) {
    console.error("❌ Error force refreshing Lark tokens:", error.message);
    throw error;
  }
};

module.exports = {
  initializeLarkTokens,
  refreshTokenIfNeeded,
  forceRefreshTokens,
  getTenantAccessToken
};