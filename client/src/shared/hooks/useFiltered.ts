import { useMemo } from 'react';

/**
 * Filter + sort an array based on a search query and an optional predicate /
 * sort comparator. Memoized.
 *
 *   const visible = useFiltered(items, query, {
 *     fields: ['name', 'website'],
 *     predicate: (item) => item.status === 'live',
 *     sortBy: (a, b) => b.createdAt - a.createdAt,
 *   });
 */
type FilterOptions<T> = {
  fields?: string[];
  predicate?: (item: T) => boolean;
  sortBy?: (a: T, b: T) => number;
};

export default function useFiltered<T = any>(
  items: T[] | null | undefined,
  query: string,
  options: FilterOptions<T> = {},
): T[] {
  const { fields = [], predicate, sortBy } = options;
  return useMemo(() => {
    if (!Array.isArray(items)) return [];
    const trimmed = typeof query === 'string' ? query.trim().toLowerCase() : '';

    let result: T[] = items;

    if (trimmed) {
      result = result.filter((item) => {
        if (!item) return false;
        if (!fields.length) {
          return JSON.stringify(item).toLowerCase().includes(trimmed);
        }
        return fields.some((field) => {
          const value = (item as any)?.[field];
          return value != null && String(value).toLowerCase().includes(trimmed);
        });
      });
    }

    if (typeof predicate === 'function') {
      result = result.filter(predicate);
    }

    if (typeof sortBy === 'function') {
      result = [...result].sort(sortBy);
    }

    return result;
  }, [items, query, fields, predicate, sortBy]);
}
