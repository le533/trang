function getPagination(query, { defaultLimit, maxLimit }) {
  const requestedPage = Number(query.page);
  const requestedLimit = Number(query.limit);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(maxLimit, requestedLimit)
    : defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { getPagination };
