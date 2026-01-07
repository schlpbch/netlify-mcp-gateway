import type { ServerRegistration } from '../types/server.ts';

/**
 * Type guard for fulfilled promises
 */
export function isFulfilled<T>(
  result: PromiseSettledResult<T>
): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled';
}

/**
 * Aggregate data from multiple servers in parallel with graceful error handling.
 *
 * @param servers - List of servers to query
 * @param fetcher - Async function to fetch data from each server
 * @param entityName - Name of the entity being fetched (for error logging)
 * @returns Flattened array of all results from successful fetches
 */
export async function aggregateFromServers<T>(
  servers: ServerRegistration[],
  fetcher: (server: ServerRegistration) => Promise<T[]>,
  entityName: string
): Promise<T[]> {
  const results = await Promise.allSettled(
    servers.map((server) => fetcher(server))
  );

  // Log failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `Failed to list ${entityName} from ${servers[index].id}:`,
        result.reason
      );
    }
  });

  // Return flattened successful results
  return results.filter(isFulfilled).flatMap((r) => r.value);
}
