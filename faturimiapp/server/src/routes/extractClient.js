const express = require('express');
const multer = require('multer');
const { extractStructured } = require('../openaiClient');

const router = express.Router();
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

const INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    fullName: { type: 'string', description: 'Full name of the client/customer (the buyer, not the seller)' },
    address: { type: 'string', description: 'Full postal address of the client, as one line' },
    phone: { type: 'string', description: 'Phone number of the client, including country code if present' },
    email: { type: 'string', description: 'Email of the client if present' },
    businessId: { type: 'string', description: 'Business ID / NUI of the client if present' },
    items: {
      type: 'array',
      description: 'Products or services found on the note/photo/text',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Item or service name' },
          quantity: {
            type: 'string',
            description: 'Quantity if clearly present (e.g. 2 or 3). If missing, use "1".',
          },
          unitPrice: { type: 'string', description: 'Unit price if present, otherwise empty' },
        },
        required: ['description', 'quantity', 'unitPrice'],
        additionalProperties: false,
      },
    },
  },
  required: ['fullName', 'address', 'phone', 'email', 'businessId', 'items'],
  additionalProperties: false,
};

const EXTRACT_INSTRUCTIONS =
  'Extract the CLIENT/customer (the buyer, not the seller): full name, address, phone, email and business ID. ' +
  'Also extract line items when present: item/service name, quantity and unit price. ' +
  'If quantity is not clearly stated, use "1". ' +
  'The source may be Albanian, English or Italian, typed or handwritten, a note, screenshot, order or invoice. ' +
  'If a field is genuinely not present, return an empty string for it (and an empty items array if there are no items). Do not invent data.';

router.post('/extract-client', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!file && !text) {
      return res.status(400).json({ error: 'Provide text or an image file.' });
    }

    const content = [];
    if (file) {
      const base64 = file.buffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';
      if (mimeType.startsWith('image/')) {
        content.push({ type: 'input_image', image_url: `data:${mimeType};base64,${base64}` });
      } else {
        content.push({
          type: 'input_file',
          filename: file.originalname || 'note.pdf',
          file_data: `data:${mimeType};base64,${base64}`,
        });
      }
    }
    content.push({
      type: 'input_text',
      text: text ? `${EXTRACT_INSTRUCTIONS}\n\nTEXT:\n"""\n${text}\n"""` : EXTRACT_INSTRUCTIONS,
    });

    const result = await extractStructured(content, INVOICE_SCHEMA, 'invoice_extraction');
    return res.json(result);
  } catch (err) {
    console.error('[extract-client] error:', err);
    return res.status(500).json({ error: 'Failed to extract client data. ' + (err.message || '') });
  }
});

module.exports = router;
