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
  'Also extract line items when present: item/service name, quantity and unit price as a number only (no currency word). ' +
  'If quantity is not clearly stated, use "1". ' +
  'Handwritten notes often start with the person name, then city, then phone, then items and prices (e.g. "Fustan 80 euro"). ' +
  'A city such as Prishtinë belongs in address, not in the name. Keep the written person name even if it looks unusual. ' +
  'The source may be Albanian, English or Italian, typed or handwritten, a note, screenshot, order or invoice. ' +
  'If a field is genuinely not present, return an empty string for it (and an empty items array if there are no items). Do not invent data.';

function sniffImageMime(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const brand = buf.toString('ascii', 4, 16);
  if (brand.startsWith('ftyp') && /heic|heif|mif1|msf1/i.test(brand)) return 'image/heic';
  return '';
}

function unsupportedImageError() {
  const err = new Error('UNSUPPORTED_IMAGE');
  err.code = 'UNSUPPORTED_IMAGE';
  return err;
}

function normalizeOpenAiImage(dataUrl, mimeHint) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return dataUrl;
  let buf;
  try {
    buf = Buffer.from(match[2], 'base64');
  } catch {
    throw unsupportedImageError();
  }
  const sniffed = sniffImageMime(buf);
  if (sniffed === 'image/heic') throw unsupportedImageError();
  const mime = sniffed || mimeHint || match[1];
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) {
    throw unsupportedImageError();
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function imageFromBody(body) {
  const raw = typeof body?.image === 'string' ? body.image.trim() : '';
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return normalizeOpenAiImage(raw);
  if (/^[A-Za-z0-9+/=]+$/.test(raw.slice(0, 80))) {
    return normalizeOpenAiImage(`data:image/jpeg;base64,${raw}`);
  }
  return '';
}

router.post('/extract-client', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    let image = '';
    try {
      image = imageFromBody(req.body);
    } catch (err) {
      if (err?.code === 'UNSUPPORTED_IMAGE' && !file && !text) throw err;
    }
    if (!file && !text && !image) {
      return res.status(400).json({ error: 'Provide text or an image file.' });
    }

    const content = [];
    if (image) {
      content.push({ type: 'input_image', image_url: image, detail: 'high' });
    } else if (file) {
      const base64 = file.buffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';
      if (mimeType.startsWith('image/')) {
        content.push({
          type: 'input_image',
          image_url: normalizeOpenAiImage(`data:${mimeType};base64,${base64}`, mimeType),
          detail: 'high',
        });
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
    if (err?.code === 'UNSUPPORTED_IMAGE') {
      return res.status(400).json({
        error: 'The photo format is not supported. Use a JPEG or PNG photo.',
      });
    }
    return res.status(500).json({ error: 'Failed to extract client data. ' + (err.message || '') });
  }
});

module.exports = router;
