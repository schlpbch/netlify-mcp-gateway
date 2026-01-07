package ch.sbb.mcp.gateway.cache;

import ch.sbb.mcp.gateway.config.GatewayProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.DigestUtils;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory response cache for MCP tool results using Caffeine.
 * 
 * <p>Provides caching with configurable TTL, cache key generation,
 * and pattern-based invalidation.</p>
 */
@Service
public class ResponseCache {
    
    private static final Logger log = LoggerFactory.getLogger(ResponseCache.class);
    
    private final Map<String, Cache<String, Object>> caches = new ConcurrentHashMap<>();
    private final GatewayProperties properties;
    private final ObjectMapper objectMapper;
    
    public ResponseCache(GatewayProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }
    
    /**
     * Get cached result.
     * 
     * @param key the cache key
     * @return the cached value, or null if not found
     */
    @SuppressWarnings("unchecked")
    public <T> T get(String key) {
        try {
            Cache<String, Object> cache = getDefaultCache();
            Object value = cache.getIfPresent(key);
            if (value != null) {
                log.debug("Cache hit for key: {}", key);
            } else {
                log.debug("Cache miss for key: {}", key);
            }
            return (T) value;
        } catch (Exception e) {
            log.warn("Failed to get from cache: {}", e.getMessage());
            return null;
        }
    }
    
    /**
     * Cache result with TTL.
     * 
     * @param key the cache key
     * @param value the value to cache
     * @param ttl the time-to-live
     */
    public <T> void set(String key, T value, Duration ttl) {
        try {
            Cache<String, Object> cache = getCacheForTtl(ttl);
            cache.put(key, value);
            log.debug("Cached value for key: {} with TTL: {}", key, ttl);
        } catch (Exception e) {
            log.warn("Failed to set cache: {}", e.getMessage());
        }
    }
    
    /**
     * Invalidate cache by pattern.
     * 
     * @param pattern the key pattern (e.g., "mcp:gateway:tool:*")
     */
    public void invalidate(String pattern) {
        try {
            // For in-memory cache, we invalidate all caches
            caches.values().forEach(Cache::invalidateAll);
            log.info("Invalidated all cache entries");
        } catch (Exception e) {
            log.warn("Failed to invalidate cache: {}", e.getMessage());
        }
    }
    
    /**
     * Generate cache key from operation, name, and parameters.
     * 
     * @param operation the operation type (e.g., "tool", "resource", "prompt")
     * @param name the tool/resource/prompt name
     * @param params the parameters
     * @return the cache key
     */
    public String generateKey(String operation, String name, Map<String, Object> params) {
        try {
            String paramsJson = objectMapper.writeValueAsString(params);
            String paramsHash = DigestUtils.md5DigestAsHex(paramsJson.getBytes());
            return String.format("mcp:gateway:%s:%s:%s", operation, name, paramsHash);
        } catch (Exception e) {
            log.warn("Failed to generate cache key: {}", e.getMessage());
            // Fallback to simple key without hash
            return String.format("mcp:gateway:%s:%s", operation, name);
        }
    }
    
    /**
     * Get default TTL from configuration.
     * 
     * @return the default TTL
     */
    public Duration getDefaultTtl() {
        return properties.getCache().getDefaultTtl();
    }
    
    /**
     * Get or create cache for specific TTL.
     * 
     * @param ttl the time-to-live
     * @return the cache instance
     */
    private Cache<String, Object> getCacheForTtl(Duration ttl) {
        String cacheKey = "ttl_" + ttl.toMinutes();
        return caches.computeIfAbsent(cacheKey, k -> 
            Caffeine.newBuilder()
                .maximumSize(properties.getCache().getMaxSize())
                .expireAfterWrite(ttl)
                .build()
        );
    }
    
    /**
     * Get default cache.
     * 
     * @return the default cache instance
     */
    private Cache<String, Object> getDefaultCache() {
        return getCacheForTtl(getDefaultTtl());
    }
    
    /**
     * Warm cache with predicted requests (for event bus integration).
     * 
     * @param toolName the tool name
     * @param argsArray list of argument maps to pre-cache
     */
    public void warmCache(String toolName, java.util.List<Map<String, Object>> argsArray) {
        log.info("Cache warming not yet implemented for tool: {}", toolName);
        // TODO: Implement cache warming when event bus is integrated
    }
}
