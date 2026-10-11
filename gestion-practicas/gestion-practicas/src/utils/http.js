// Utilidades HTTP: error con código de estado y envoltorio para handlers async.
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { HttpError, ah };
