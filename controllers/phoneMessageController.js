const XLSX = require("xlsx");
const PhoneMessage = require("../models/PhoneMessage");

exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Excel file is empty"
      });
    }

    const phoneMessages = data.map(row => ({
      phone: row.phone || row.Phone || "",
      message: row.message || row.Message || ""
    })).filter(item => item.phone && item.message);

    if (phoneMessages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid phone and message data found in Excel"
      });
    }

    await PhoneMessage.deleteMany({});
    const result = await PhoneMessage.insertMany(phoneMessages);

    res.json({
      success: true,
      message: `Successfully uploaded ${result.length} records`,
      count: result.length
    });

  } catch (error) {
    console.error("Error uploading Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload Excel file",
      error: error.message
    });
  }
};

exports.getAllMessages = async (req, res) => {
  try {
    const messages = await PhoneMessage.find().sort({ uploadedAt: -1 });
    res.json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: error.message
    });
  }
};

exports.deleteAllMessages = async (req, res) => {
  try {
    await PhoneMessage.deleteMany({});
    res.json({
      success: true,
      message: "All messages deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete messages",
      error: error.message
    });
  }
};

exports.sendMessages = async (req, res) => {
  try {
    const { customMessage } = req.body;
    const WAHA_BASE_URL = process.env.WAHA_BASE_URL || "http://localhost:5001";
    const API_KEY = process.env.WAHA_API_KEY || "1c67560aad774aa7a5f7fdf28ae01ae7";

    const messages = await PhoneMessage.find().sort({ uploadedAt: -1 });

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No messages found in database. Please upload Excel file first."
      });
    }

    const results = [];
    
    for (const msg of messages) {
      const phone = msg.phone.trim();
      const normalizedPhone = normalizePhone(phone);
      const chatId = `${normalizedPhone}@c.us`;
      const textToSend = customMessage && customMessage.trim() ? customMessage : msg.message;

      try {
        const response = await fetch(`${WAHA_BASE_URL}/api/sendText`, {
          method: "POST",
          headers: {
            "accept": "application/json",
            "X-Api-Key": API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chatId: chatId,
            text: textToSend,
            session: "default"
          })
        });

        if (response.ok) {
          results.push({
            phone: normalizedPhone,
            success: true,
            message: "Message sent successfully"
          });
        } else {
          const errorData = await response.json();
          results.push({
            phone: normalizedPhone,
            success: false,
            error: errorData.message || "Failed to send message"
          });
        }
      } catch (error) {
        results.push({
          phone: normalizedPhone,
          success: false,
          error: error.message
        });
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    res.json({
      success: true,
      message: `Sent ${successCount} messages successfully, ${failedCount} failed`,
      total: results.length,
      successCount,
      failedCount,
      results
    });

  } catch (error) {
    console.error("Error sending messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send messages",
      error: error.message
    });
  }
};

function normalizePhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('62')) {
    return cleaned;
  } else if (cleaned.startsWith('0')) {
    return '62' + cleaned.substring(1);
  } else if (cleaned.startsWith('8')) {
    return '62' + cleaned;
  }
  
  return cleaned;
}