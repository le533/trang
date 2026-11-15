const crypto = require('crypto');

function sortParameters(parameters) {
  return Object.fromEntries(
    Object.entries(parameters)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function encodeVnpay(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function createSigningString(parameters) {
  return Object.entries(sortParameters(parameters))
    .map(([key, value]) => `${encodeVnpay(key)}=${encodeVnpay(value)}`)
    .join('&');
}

function createVnpaySignature(parameters, secret) {
  return crypto.createHmac('sha512', secret).update(createSigningString(parameters), 'utf8').digest('hex');
}

function verifyVnpaySignature(parameters, secret) {
  const received = String(parameters.vnp_SecureHash || '').toLowerCase();
  if (!/^[a-f0-9]{128}$/.test(received)) return false;
  const { vnp_SecureHash, vnp_SecureHashType, ...signedParameters } = parameters;
  const expected = createVnpaySignature(signedParameters, secret);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  return receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function formatVnpayDate(date) {
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

module.exports = {
  createSigningString,
  createVnpaySignature,
  formatVnpayDate,
  sortParameters,
  verifyVnpaySignature,
};
