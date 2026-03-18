import { aiEngine } from "../src/lib/ai-engine";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { feature, schoolId, data } = req.body;

  console.log("------------------------------------------");
  console.log(`🤖 [AI ENGINE] New Request Received!`);
  console.log(`🧠 Feature: ${feature}`);
  console.log(`🏫 School ID: ${schoolId}`);
  console.log(`📊 Data size: ${JSON.stringify(data).length} chars`);
  console.log("------------------------------------------");

  try {
    const startTime = Date.now();
    const insights = await aiEngine.getInsights({
      feature,
      schoolId,
      data,
      forceRefresh: false // Always use cache if available
    });
    const endTime = Date.now();

    console.log(`✅ [AI ENGINE] Success! (${endTime - startTime}ms)`);
    console.log(`✨ Status: Insights Generated & Cached`);
    console.log("------------------------------------------");

    res.status(200).json(insights);
  } catch (error) {
    console.error(`❌ [AI ENGINE] Error:`, error.message);
    res.status(500).json({ error: "AI Processing Failed" });
  }
}
