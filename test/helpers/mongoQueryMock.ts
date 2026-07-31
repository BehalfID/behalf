import { vi } from "vitest";

/**
 * Mongoose-style query mock that supports both chained and mutable call shapes:
 *   Model.findOne().select().lean()
 *   const q = Model.findOne(); q.select(...); return q.lean();
 *   Model.find().sort().limit().lean()
 */
export function leanQuery<T>(value: T) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    sort: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    skip: ReturnType<typeof vi.fn>;
    maxTimeMS: ReturnType<typeof vi.fn>;
    lean: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(),
    sort: vi.fn(),
    limit: vi.fn(),
    skip: vi.fn(),
    maxTimeMS: vi.fn(),
    lean: vi.fn().mockResolvedValue(value)
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.maxTimeMS.mockReturnValue(query);
  return query;
}
