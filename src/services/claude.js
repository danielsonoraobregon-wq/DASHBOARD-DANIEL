const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generarRespuesta(comentario, terreno, nombreUsuario) {
  const system = `Eres el asistente de ventas de TerrenosBot. Respondes comentarios de Facebook e Instagram sobre terrenos en venta.

REGLAS:
- Responde siempre en español, de forma amable y profesional
- Sé conciso (máximo 3 oraciones)
- Siempre termina invitando al WhatsApp: ${process.env.WHATSAPP_NUMBER || 'wa.me/573001234567'}
- Usa el nombre del usuario si está disponible
- Si el comentario es ofensivo o spam, responde con la palabra exacta: BLOQUEAR

INFORMACIÓN DEL TERRENO:
${terreno.info}

Estado actual: ${terreno.estado}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system,
    messages: [
      {
        role: 'user',
        content: `Comentario de ${nombreUsuario || 'un usuario'}: "${comentario}"`
      }
    ]
  });

  return message.content[0].text;
}

module.exports = { generarRespuesta };
