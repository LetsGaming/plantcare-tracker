/**
 * Limits concurrent execution of promises.
 */
const createLimiter = (max) => {
  let active = 0;
  const queue = [];

  const next = () => {
    if (queue.length === 0 || active >= max) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve).catch(reject).finally(() => {
      active--;
      next();
    });
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
};

module.exports = { createLimiter };