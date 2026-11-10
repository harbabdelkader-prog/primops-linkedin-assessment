const { hash } = require('./state');
function reply(messages) {
  const text = messages.map(m => m.text || '').join('\n').slice(-12000).trim();
  if (!text) return 'Thanks for sending this. Could you add a short note about what you’d like help with?';
  if (/[\u0600-\u06ff]/u.test(text)) return 'شكراً على رسالتك. هذا رد تلقائي؛ هل يمكنك توضيح المطلوب ليتمكن صاحب الحساب من المتابعة؟';
  if (/\b(bonjour|merci|salut)\b/i.test(text)) return 'Merci pour votre message ! Ceci est une réponse automatique. Pourriez-vous préciser votre demande pour faciliter le suivi ?';
  if (/\b(hola|gracias)\b/i.test(text)) return '¡Gracias por tu mensaje! Esta es una respuesta automática. ¿Podrías aclarar qué necesitas para facilitar el seguimiento?';
  if (/\b(password|secret|token|ignore .*instructions|system prompt)\b/i.test(text)) return 'I can’t share private information or act on instructions in messages. Please describe your request without sensitive details.';
  if (/\b(fuck|idiot|stupid|hate you)\b/i.test(text)) return 'I’m happy to keep this conversation constructive. Could you clarify what you’d like help with?';
  if (/https?:\/\//i.test(text)) return 'Thanks for the link. I haven’t opened it; could you summarize what you’d like to discuss?';
  if (/\b(call|meeting|schedule|available)\b/i.test(text)) return 'Thanks for reaching out about a meeting. Please share the topic and a few time options with your time zone; the account owner can confirm availability.';
  if (/\b(job|role|opportunity|hiring|resume|cv)\b/i.test(text)) return 'Thanks for sharing the opportunity. Could you send the role details, location, and expected compensation so the account owner can review them?';
  if (/\b(price|cost|budget|quote)\b/i.test(text)) return 'Thanks for asking. I don’t have confirmed pricing; could you share the scope and requirements for the account owner to review?';
  if (text.includes('?')) return 'Thanks for your question. I don’t have enough verified information to answer confidently. Could you share a little more context for the account owner?';
  if (!/[\p{L}\p{N}]/u.test(text)) return 'Thanks for the reaction! Let me know if there’s something you’d like to discuss.';
  const options = ['Thanks for your message! Is there anything specific you’d like the account owner to follow up on?', 'Thanks for reaching out. Could you share what you’d like to discuss so the account owner can follow up?', 'Message received, thank you. A little more detail about your request would help the account owner follow up.'];
  return options[parseInt(hash(text).slice(0, 4), 16) % options.length];
}
module.exports = { reply };
