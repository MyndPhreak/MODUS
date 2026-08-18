import { defineEventHandler, getQuery, createError } from "h3";
import { getRepos } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || "20"), 10) || 20));
  const search = typeof query.search === "string" ? query.search : undefined;
  const offset = (page - 1) * limit;

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable",
    });
  }

  const [{ servers, total }, stats] = await Promise.all([
    repos.xp.getPublicServersLeaderboard(limit, offset, search),
    repos.xp.getPublicGlobalStats(),
  ]);

  const top3 = page === 1 && !search ? servers.slice(0, 3) : [];

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    stats,
    top3,
    servers,
  };
});
