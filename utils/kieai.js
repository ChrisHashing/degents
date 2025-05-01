const axios = require("axios");
require('dotenv').config();

const API_KEY = process.env.KIE_API_KEY;
if (!API_KEY) {
  throw new Error("❌ Missing KIEAI_API_KEY in environment variables.");
}

let pausedUntil = 0;

function isPaused() {
  return Date.now() < pausedUntil;
}

function pauseFor(ms) {
  pausedUntil = Date.now() + ms;
  const minutes = Math.round(ms / 60000);
  console.warn(`⏸️ Pausing Kie.ai requests for ${minutes} minute(s).`);
}

async function sendToKieAI(promptText) {
  const url = "https://kieai.erweima.ai/api/v1/gpt4o-image/generate";
  const filesUrl = ["https://raw.githubusercontent.com/ChrisHashing/temp/main/image.png"];

  const payload = {
    filesUrl,
    prompt: promptText,
    size: "1:1",
    isEnhance: false,
    uploadCn: false
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    });

    if (res.data?.code === 402) {
      console.error("❌ Kie.ai error (402): Credits exhausted.");
      pauseFor(10 * 60 * 1000); // 10 mins
      return null;
    }

    const taskId = res.data?.data?.taskId;
    if (!taskId) {
      console.warn("⚠️ No taskId returned");
      return null;
    }

    console.log(`✅ Kie.ai generation task accepted: ${taskId}`);
    return taskId;

  } catch (err) {
    console.error("❌ Error sending to Kie.ai:", err.message);
    return null;
  }
}

async function pollKieAITask(taskId, maxRetries = 20, interval = 5000) {
  const url = `https://kieai.erweima.ai/api/v1/gpt4o-image/record-info?taskId=${taskId}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${API_KEY}`
  };

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await axios.get(url, { headers });
      const data = res.data?.data;

      if (res.data.code === 200 && data?.status === "SUCCESS") {
        const resultUrl = data.response?.resultUrls?.[0];
        if (resultUrl) return resultUrl;
      }

      if (data?.status === "FAILED") {
        throw new Error("Kie.ai reported task failed.");
      }

    } catch (err) {
      console.warn(`⚠️ Poll attempt ${i + 1} failed: ${err.message}`);
    }

    await new Promise(res => setTimeout(res, interval));
  }

  throw new Error("⏳ Timeout: Kie.ai task did not complete in time");
}

module.exports = {
  sendToKieAI,
  pollKieAITask,
  isPaused
};
