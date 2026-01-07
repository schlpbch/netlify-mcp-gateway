/**
 * Namespace resolution utilities for routing requests to backend servers
 */

const NAMESPACE_MAP: Record<string, string> = {
  journey: 'journey-service-mcp',
  mobility: 'swiss-mobility-mcp',
  aareguru: 'aareguru-mcp',
  meteo: 'open-meteo-mcp',
  weather: 'open-meteo-mcp',
};

/**
 * Extract server ID from a namespaced name (e.g., "journey.findTrips" -> "journey-service-mcp")
 */
export function extractServerId(namespacedName: string): string {
  if (!namespacedName) {
    throw new Error('namespacedName is required');
  }
  const prefix = namespacedName.split('.')[0];
  return NAMESPACE_MAP[prefix] || `${prefix}-mcp`;
}

/**
 * Strip namespace from a tool/prompt name (e.g., "journey.findTrips" -> "findTrips")
 */
export function stripNamespace(namespacedName: string): string {
  if (!namespacedName) {
    return '';
  }
  const dotIndex = namespacedName.indexOf('.');
  return dotIndex === -1
    ? namespacedName
    : namespacedName.substring(dotIndex + 1);
}

/**
 * Add namespace prefix to a tool/prompt name
 */
export function addNamespace(serverId: string, name: string): string {
  if (!serverId || !name) {
    return name || '';
  }
  // Reverse lookup to find prefix
  for (const [prefix, id] of Object.entries(NAMESPACE_MAP)) {
    if (id === serverId) {
      return `${prefix}.${name}`;
    }
  }

  // Fallback: use server ID without "-mcp" suffix
  const prefix = serverId.replace('-mcp', '');
  return `${prefix}.${name}`;
}

/**
 * Get namespace prefix for a server ID
 */
export function getNamespacePrefix(serverId: string): string {
  if (!serverId) {
    return '';
  }
  for (const [prefix, id] of Object.entries(NAMESPACE_MAP)) {
    if (id === serverId) {
      return prefix;
    }
  }
  return serverId.replace('-mcp', '');
}
