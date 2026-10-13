// This runs on Netlify's servers, never in the visitor's browser —
// so the API key here stays private and can't be stolen from the app.
// Uses Google's Gemini API, which has a free tier (no card required).

const SYSTEM_SCOPE = `You are the assistant inside "Mass Servers", an app for the Catholic Altar Servers Association of Blessed Tansi Catholic Church, New Rumuokwurusi, Port Harcourt.
Only answer questions about: the Catholic Mass and liturgy, altar-serving duties/training/vestments, the sacraments (baptism, communion, confirmation etc.), church societies, general Catholic faith and devotion questions, and this association's schedule/membership process.
If someone asks about anything unrelated to the Catholic Church or Mass serving, politely say that's outside what you can help with here, and steer them back to church/serving topics.
Keep answers warm, concise (3-5 sentences unless more detail is genuinely needed), and pastoral in tone.`;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let question;
  try {
    question = JSON.parse(event.body || '{}').question;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!question || typeof question !== 'string' || question.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid question' }) };
  }

  if (!process.env.GEMINI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing its API key setup' }) };
  }

  // Configurable via a Netlify env var in case Google renames/retires a model later —
  // change GEMINI_MODEL in Netlify's environment variables without touching this code.
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_SCOPE }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { maxOutputTokens: 600 }
        })
      }
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Upstream error', detail: errBody }) };
    }

    const data = await resp.json();
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts
      : [];
    const text = parts.map(p => p.text || '').join('');

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text || "I couldn't come up with an answer — please try asking again." })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error', detail: String(err) }) };
  }
};
