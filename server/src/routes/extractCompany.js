const express = require('express');
const multer = require('multer');
const { extractStructured } = require('../openaiClient');

const router = express.Router();
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

const COMPANY_SCHEMA = {
  type: 'object',
  properties: {
    companyName: { type: 'string' },
    contactPerson: { type: 'string', description: 'Name of the person issuing/signing the invoice, if present' },
    streetAddress: { type: 'string' },
    state: { type: 'string', description: 'State, region or country, e.g. Kosove' },
    zipCode: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
  },
  required: ['companyName', 'contactPerson', 'streetAddress', 'state', 'zipCode', 'email', 'phone'],
  additionalProperties: false,
};

router.post('/extract-company', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Form field "file" (the sample invoice) is required.' });
    }

    const base64 = file.buffer.toString('base64');
    const mimeType = file.mimetype || 'application/octet-stream';
    const isImage = mimeType.startsWith('image/');

    const filePart = isImage
      ? { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` }
      : { type: 'input_file', filename: file.originalname || 'invoice.pdf', file_data: `data:${mimeType};base64,${base64}` };

    const result = await extractStructured(
      [
        filePart,
        {
          type: 'input_text',
          text:
            'This is a sample invoice. Extract the SELLER / ISSUING COMPANY details (not the client the invoice is billed to): ' +
            'company name, the contact person who issued/signed it, street address, state/region/country, zip/postal code, email and phone number. ' +
            'The document may be in Albanian and/or English. If a field is not present, return an empty string for it. Do not invent data.',
        },
      ],
      COMPANY_SCHEMA,
      'company_extraction'
    );

    return res.json(result);
  } catch (err) {
    console.error('[extract-company] error:', err);
    return res.status(500).json({ error: 'Failed to extract company data. ' + (err.message || '') });
  }
});

module.exports = router;
