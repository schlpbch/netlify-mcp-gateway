import {
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  extractServerId,
  stripNamespace,
  addNamespace,
  getNamespacePrefix,
} from './NamespaceResolver.ts';

Deno.test('extractServerId - extracts server ID from known namespaces', () => {
  assertEquals(extractServerId('journey.findTrips'), 'journey-service-mcp');
  assertEquals(extractServerId('mobility.getStations'), 'swiss-mobility-mcp');
  assertEquals(extractServerId('aareguru.getCurrentConditions'), 'aareguru-mcp');
  assertEquals(extractServerId('meteo.getForecast'), 'open-meteo-mcp');
  assertEquals(extractServerId('weather.getTemperature'), 'open-meteo-mcp');
});

Deno.test('extractServerId - falls back to prefix-mcp for unknown namespaces', () => {
  assertEquals(extractServerId('unknown.someTool'), 'unknown-mcp');
  assertEquals(extractServerId('custom.anotherTool'), 'custom-mcp');
});

Deno.test('extractServerId - handles names without namespace', () => {
  assertEquals(extractServerId('findTrips'), 'findTrips-mcp');
});

Deno.test('stripNamespace - removes namespace prefix from tool name', () => {
  assertEquals(stripNamespace('journey.findTrips'), 'findTrips');
  assertEquals(stripNamespace('mobility.getStations'), 'getStations');
  assertEquals(stripNamespace('aareguru.getCurrentConditions'), 'getCurrentConditions');
});

Deno.test('stripNamespace - returns original name if no namespace', () => {
  assertEquals(stripNamespace('findTrips'), 'findTrips');
  assertEquals(stripNamespace('getStations'), 'getStations');
});

Deno.test('stripNamespace - handles multiple dots correctly', () => {
  assertEquals(stripNamespace('journey.some.nested.tool'), 'some.nested.tool');
});

Deno.test('addNamespace - adds correct namespace prefix for known servers', () => {
  assertEquals(addNamespace('journey-service-mcp', 'findTrips'), 'journey.findTrips');
  assertEquals(addNamespace('swiss-mobility-mcp', 'getStations'), 'mobility.getStations');
  assertEquals(addNamespace('aareguru-mcp', 'getCurrentConditions'), 'aareguru.getCurrentConditions');
  assertEquals(addNamespace('open-meteo-mcp', 'getForecast'), 'meteo.getForecast');
});

Deno.test('addNamespace - falls back to server ID without -mcp suffix', () => {
  assertEquals(addNamespace('custom-mcp', 'myTool'), 'custom.myTool');
  assertEquals(addNamespace('unknown-mcp', 'someTool'), 'unknown.someTool');
});

Deno.test('getNamespacePrefix - returns correct prefix for known servers', () => {
  assertEquals(getNamespacePrefix('journey-service-mcp'), 'journey');
  assertEquals(getNamespacePrefix('swiss-mobility-mcp'), 'mobility');
  assertEquals(getNamespacePrefix('aareguru-mcp'), 'aareguru');
  assertEquals(getNamespacePrefix('open-meteo-mcp'), 'meteo');
});

Deno.test('getNamespacePrefix - falls back to server ID without -mcp suffix', () => {
  assertEquals(getNamespacePrefix('custom-mcp'), 'custom');
  assertEquals(getNamespacePrefix('another-service-mcp'), 'another-service');
});

// ================== EDGE CASES ==================

Deno.test('extractServerId - throws for empty string', () => {
  try {
    extractServerId('');
    throw new Error('Should have thrown');
  } catch (error) {
    assertEquals((error as Error).message, 'namespacedName is required');
  }
});

Deno.test('extractServerId - handles weather alias for meteo', () => {
  // Both 'meteo' and 'weather' should map to 'open-meteo-mcp'
  assertEquals(extractServerId('weather.getTemperature'), 'open-meteo-mcp');
  assertEquals(extractServerId('meteo.getTemperature'), 'open-meteo-mcp');
});

Deno.test('extractServerId - handles deeply nested namespaces', () => {
  // Should only use the first segment
  assertEquals(extractServerId('journey.trips.find.v2'), 'journey-service-mcp');
});

Deno.test('extractServerId - handles names starting with dot', () => {
  // Edge case: name starting with dot
  assertEquals(extractServerId('.hidden'), '-mcp');
});

Deno.test('extractServerId - handles numeric prefix', () => {
  assertEquals(extractServerId('123.tool'), '123-mcp');
});

Deno.test('stripNamespace - returns empty string for empty input', () => {
  assertEquals(stripNamespace(''), '');
});

Deno.test('stripNamespace - handles only namespace (no tool name)', () => {
  assertEquals(stripNamespace('journey.'), '');
});

Deno.test('stripNamespace - handles multiple consecutive dots', () => {
  assertEquals(stripNamespace('journey..tool'), '.tool');
});

Deno.test('stripNamespace - preserves case', () => {
  assertEquals(stripNamespace('journey.FindTrips'), 'FindTrips');
  assertEquals(stripNamespace('MOBILITY.GetStations'), 'GetStations');
});

Deno.test('addNamespace - handles empty name', () => {
  assertEquals(addNamespace('journey-service-mcp', ''), '');
});

Deno.test('addNamespace - handles empty serverId', () => {
  assertEquals(addNamespace('', 'toolName'), 'toolName');
});

Deno.test('addNamespace - handles both empty', () => {
  assertEquals(addNamespace('', ''), '');
});

Deno.test('addNamespace - handles serverId without -mcp suffix', () => {
  assertEquals(addNamespace('myservice', 'tool'), 'myservice.tool');
});

Deno.test('addNamespace - uses first matching prefix for servers with multiple aliases', () => {
  // open-meteo-mcp has both 'meteo' and 'weather' as prefixes
  // It should use the first one found in the map iteration
  const result = addNamespace('open-meteo-mcp', 'getForecast');
  // The order depends on Object.entries iteration, but it should be one of these
  assertEquals(result === 'meteo.getForecast' || result === 'weather.getForecast', true);
});

Deno.test('getNamespacePrefix - handles empty serverId', () => {
  assertEquals(getNamespacePrefix(''), '');
});

Deno.test('getNamespacePrefix - handles serverId with multiple -mcp suffixes', () => {
  assertEquals(getNamespacePrefix('my-mcp-mcp'), 'my-mcp');
});

Deno.test('getNamespacePrefix - preserves case in fallback', () => {
  assertEquals(getNamespacePrefix('MyService-mcp'), 'MyService');
});

// ================== ROUND TRIP TESTS ==================

Deno.test('extractServerId and addNamespace are inverse operations for known servers', () => {
  const testCases = [
    { serverId: 'journey-service-mcp', tool: 'findTrips' },
    { serverId: 'swiss-mobility-mcp', tool: 'getStations' },
    { serverId: 'aareguru-mcp', tool: 'getCurrentConditions' },
  ];

  for (const { serverId, tool } of testCases) {
    const namespaced = addNamespace(serverId, tool);
    const extractedServerId = extractServerId(namespaced);
    assertEquals(extractedServerId, serverId);
  }
});

Deno.test('stripNamespace and addNamespace are inverse operations', () => {
  const testCases = [
    { serverId: 'journey-service-mcp', namespacedTool: 'journey.findTrips' },
    { serverId: 'swiss-mobility-mcp', namespacedTool: 'mobility.getStations' },
    { serverId: 'aareguru-mcp', namespacedTool: 'aareguru.getCurrentConditions' },
  ];

  for (const { serverId, namespacedTool } of testCases) {
    const stripped = stripNamespace(namespacedTool);
    const renamespaced = addNamespace(serverId, stripped);
    assertEquals(renamespaced, namespacedTool);
  }
});

// ================== SPECIAL CHARACTER TESTS ==================

Deno.test('extractServerId - handles underscores in name', () => {
  assertEquals(extractServerId('journey.find_trips_v2'), 'journey-service-mcp');
});

Deno.test('extractServerId - handles hyphens in tool name', () => {
  assertEquals(extractServerId('journey.find-trips'), 'journey-service-mcp');
});

Deno.test('stripNamespace - preserves special characters in tool name', () => {
  assertEquals(stripNamespace('journey.find_trips-v2'), 'find_trips-v2');
});

Deno.test('addNamespace - preserves special characters in tool name', () => {
  assertEquals(addNamespace('journey-service-mcp', 'find_trips-v2'), 'journey.find_trips-v2');
});
