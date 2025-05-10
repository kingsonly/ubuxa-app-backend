import * as argon from 'argon2';
import { PaginatedResult, PaginationQueryDto, SortOrder } from './dto/pagination.dto';
import { Prisma } from '@prisma/client';

export async function hashPassword(passwordString: string) {
  return await argon.hash(passwordString);
}

export const getLastNDaysDate = (days: number): Date => {
  const now = new Date();
  const nDaysAgo = new Date(now);
  nDaysAgo.setDate(now.getDate() - days);

  return nDaysAgo;
};

/**
 * Creates a paginated result from Prisma query results
 * @param data The data returned from the Prisma query
 * @param count The total count of records
 * @param paginationQuery The pagination query parameters
 * @returns A paginated result object
 */
export function createPaginatedResponse<T>(
  data: T[],
  count: number,
  paginationQuery: PaginationQueryDto,
): PaginatedResult<T> {
  const { page = 1, limit = 10 } = paginationQuery;
  const totalPages = Math.ceil(count / limit);

  return {
    data,
    meta: {
      total: count,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Creates Prisma query options for pagination, sorting, and filtering
 * @param paginationQuery The pagination query parameters
 * @param searchFields Fields to search in when search parameter is provided
 * @param filterOptions Additional filter options
 * @returns Prisma query options
 */
export function createPrismaQueryOptions<T extends Record<string, any>>(
  paginationQuery: PaginationQueryDto,
  searchFields: string[] = [],
  filterOptions: T = {} as T,
) {
  const { page = 1, limit = 10, sortBy, sortOrder = SortOrder.DESC, search } = paginationQuery;
  const skip = (page - 1) * limit;

  // Create search conditions if search parameter is provided
  let searchConditions = {};
  if (search && searchFields.length > 0) {
    searchConditions = {
      OR: searchFields.map((field) => ({
        [field]: {
          contains: search,
          mode: 'insensitive',
        },
      })),
    };
  }

  // Create sort options - use Prisma.SortOrder enum instead of string
  const orderBy = sortBy 
    ? { [sortBy]: sortOrder === SortOrder.ASC ? Prisma.SortOrder.asc : Prisma.SortOrder.desc } 
    : { createdAt: Prisma.SortOrder.desc };

  return {
    skip,
    take: limit,
    orderBy,
    where: {
      ...filterOptions,
      ...searchConditions,
    },
  };
}