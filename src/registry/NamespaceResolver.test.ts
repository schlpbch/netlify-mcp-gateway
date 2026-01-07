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
