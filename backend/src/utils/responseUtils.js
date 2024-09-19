const successResponse = (res, data, statusCode = 200) => {
  res.status(statusCode).json({ success: true, data });
};

const errorResponse = (res, error, statusCode = 500) => {
  res.status(statusCode).json({ success: false, error });
};

export default { successResponse, errorResponse };
