const crypto = require("crypto");

const tickets = new Map();

const createTicket = (userId) => {
  const ticket = crypto.randomBytes(32).toString("hex");
  // Ticket expires in 60 seconds
  tickets.set(ticket, { userId, expires: Date.now() + 60000 });
  return ticket;
};

const validateAndBurnTicket = (ticket) => {
  const data = tickets.get(ticket);
  if (!data) return null;

  tickets.delete(ticket); // Single-use only

  if (Date.now() > data.expires) return null;
  return data.userId;
};

module.exports = {
  createTicket,
  validateAndBurnTicket,
};
