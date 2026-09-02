const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    '[nextinvoice-server] WARNING: OPENAI_API_KEY is not set. AI extraction endpoints will fail. ' +
      'Copy server/.env.example to server/.env and fill in your key.'
  );
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

/**
 * Calls the Responses API with a JSON-schema constrained output.
 * @param {Array<object>} content - array of input_text / input_file / input_image content parts
 * @param {object} schema - JSON schema describing the expected object shape
 * @param {string} schemaName - name for the schema (required by the API)
 */
async function extractStructured(content, schema, schemaName) {
  const response = await client.responses.create({
    model: MODEL,
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }
  return JSON.parse(text);
}

module.exports = { client, MODEL, extractStructured };
