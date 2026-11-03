'use strict';
class AppError extends Error {
  constructor(code) { super(code); this.code = code; }
}
module.exports = { AppError };
