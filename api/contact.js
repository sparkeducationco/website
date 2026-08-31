const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
module.exports = async function handler(request, response) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ error: 'Method not allowed.' }); }
  const { name, email, district, devices, message = '' } = request.body || {};
  if (!name?.trim() || !email?.trim() || !district?.trim() || !devices?.trim()) return response.status(400).json({ error: 'Please complete all required fields.' });
  if (!EMAIL_PATTERN.test(email)) return response.status(400).json({ error: 'Please enter a valid email address.' });
  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL) return response.status(500).json({ error: 'Contact email is not configured yet.' });
  const emailResponse = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.CONTACT_FROM_EMAIL, to: ['contact@sparkforschools.com'], reply_to: email.trim(), subject: `Demo request from ${name.trim()} — ${district.trim()}`, text: [`Name: ${name.trim()}`, `Email: ${email.trim()}`, `District: ${district.trim()}`, `Devices: ${devices.trim()}`, '', 'Message:', message.trim() || '(No message provided)'].join('\n') }) });
  if (!emailResponse.ok) { console.error('Resend delivery failed:', await emailResponse.text()); return response.status(502).json({ error: 'Unable to send your request. Please try again.' }); }
  return response.status(200).json({ ok: true });
}
