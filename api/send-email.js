export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, html } = req.body;
  const apiKey = process.env.VITE_RESEND_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'EDUINTELLECT <invite@edulent.dgion.com>',
        to,
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json(data);
    } else {
      console.error('Resend API Error:', data);
      return res.status(response.status).json(data);
    }
  } catch (error) {
    console.error('Serverless Function Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
