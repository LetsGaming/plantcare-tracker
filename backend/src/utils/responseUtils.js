const logger = require("./logger");
const { isDev } = require("./generalUtils");
/**
 * Creates a base response object.
 * @param {boolean} success - Indicates if the operation was successful.
 * @param {string} message - A message related to the response.
 * @param {any} [data] - Any additional data to include.
 * @returns {Object} - The standardized response object.
 */
const createResponseObject = (success, message, data = null) => {
  return {
    success,
    timestamp: new Date().toISOString(),
    message,
    ...(data && { data }), // Only include the 'data' field if data is not null
  };
};

/**
 * Sends a standardized success response.
 * @param {Response} res - Express response object.
 * @param {any} data - The data to send back.
 * @param {number} [statusCode=200] - HTTP status code.
 */
const successResponse = (
  res,
  data,
  message = "Operation successful",
  statusCode = 200
) => {
  const response = createResponseObject(true, message, data);
  res.status(statusCode).json(response);
};

/**
 * Sends a standardized error response.
 * @param {Response} res - Express response object.
 * @param {string} error - Error message to send back.
 * @param {number} [statusCode=500] - HTTP status code.
 * @param {Error} [errObj] - Optional error object to log.
 */
const errorResponse = (res, errorMsg, statusCode = 500, errObj = null, doLogMsg = isDev) => {
  if (errObj) {
    // Log the error object with a stack trace or as a JSON string
    if (errObj instanceof Error) {
      logger.error(errObj.message, errObj.stack ? errObj.stack : ""); // Log stack trace if it's an Error object
    } else {
      logger.error(JSON.stringify(errObj, null, 2)); // Log other objects in a readable JSON format
    }
  } else {
    if (doLogMsg) {
      logger.error(errorMsg);
    }
  }

  const response = createResponseObject(false, errorMsg);
  res.status(statusCode).json(response);
};

/**
 * Sends a response for validation failures.
 * @param {Response} res - Express response object.
 * @param {string} message - Validation error message.
 */
const validationErrorResponse = (res, message) => {
  errorResponse(res, message, 400);
};

const notFoundResponse = (res, message = "Resource not found") => {
  errorResponse(res, message, 404);
};

/**
 * A Class to manage an SSE stream lifecycle.
 */
class SSEManager {
  constructor(res, maxChunkSize = 16384) {
    // Default 16KB
    this.res = res;
    this.sentIds = new Set();
    this.totalSent = 0;
    this.maxChunkSize = maxChunkSize;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    this.heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 20000);
  }

  /**
   * Sends unique items in chunks to respect size limits.
   */
  sendUnique(items, idKey = "id") {
    const unique = items.filter((item) => {
      const id = item[idKey];
      if (id && !this.sentIds.has(id)) {
        this.sentIds.add(id);
        return true;
      }
      return false;
    });

    if (unique.length > 0) {
      this.totalSent += unique.length;
      this._chunkAndSend(unique);
    }
  }

  /**
   * Internal helper to split large arrays into smaller SSE messages.
   */
  _chunkAndSend(dataArray) {
    let currentBatch = [];
    let currentBatchSize = 0;

    for (const item of dataArray) {
      const itemString = JSON.stringify(item);
      const itemSize = Buffer.byteLength(itemString, "utf8");

      // If adding this item exceeds the limit, send the current batch first
      if (
        currentBatchSize + itemSize > this.maxChunkSize &&
        currentBatch.length > 0
      ) {
        this._emit(currentBatch);
        currentBatch = [];
        currentBatchSize = 0;
      }

      currentBatch.push(item);
      currentBatchSize += itemSize;
    }

    // Send the remaining items
    if (currentBatch.length > 0) {
      this._emit(currentBatch);
    }
  }

  _emit(data) {
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    this.res.flush?.();
  }

  end(finalMessage) {
    const stats = finalMessage || { total: this.totalSent };
    clearInterval(this.heartbeat);
    this.res.write(`event: done\ndata: ${JSON.stringify(stats)}\n\n`);
    this.res.end();
  }
}

const setupSSE = (res) => new SSEManager(res);

module.exports = {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  setupSSE,
};
