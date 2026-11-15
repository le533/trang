const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const fields = {};
    errors.array().forEach(e => { fields[e.path] = e.msg; });
    return res.status(422).json({ success: false, message: 'Dữ liệu không hợp lệ.', errors: fields });
  }
  next();
}

module.exports = { validate };
