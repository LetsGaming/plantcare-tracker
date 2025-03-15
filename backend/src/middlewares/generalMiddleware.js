const { removeEmptyFields } = require("../utils/generalUtils");

const cleanRequestBody = (req, res, next) => {
  req.body = removeEmptyFields(req.body);
  next();
};

module.exports = {
  cleanRequestBody,
};
