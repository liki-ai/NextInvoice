const express = require('express');
const { extractStructured } = require('../openaiClient');

const router = express.Router();

const CLIENT_SCHEMA = {
  type: 'object',
  properties: {
    fullName: { type: 'string', description: 'Full name of the client/customer' },
    address: { type: 'string', description: 'Full postal address of the client, as one line' },
    phone: { type: 'string', description: 'Phone number of the client, including country code if present' },
  },
  required: ['fullName', 'address', 'phone'],
  additionalProperties: false,
};

router.post('/extract-client', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Field "text" is required and must be a non-empty string.' });
    }

    const result = await extractStructured(
      [
        {
          type: 'input_text',
          text:
            'Extract the client/customer full name, address and phone number from the following text. ' +
            'The text may be in Albanian or English, informal, or missing punctuation. ' +
            'If a field is genuinely not present, return an empty string for it. Do not invent data.\n\n' +
            `TEXT:\n"""\n${text}\n"""`,
        },
      ],
      CLIENT_SCHEMA,
      'client_extraction'
    );

    return res.json(result);
  } catch (err) {
    console.error('[extract-client] error:', err);
    return res.status(500).json({ error: 'Failed to extract client data. ' + (err.message || '') });
  }
});

module.exports = router;
