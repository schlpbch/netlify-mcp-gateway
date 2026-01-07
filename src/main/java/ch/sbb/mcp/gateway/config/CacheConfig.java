package ch.sbb.mcp.gateway.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration for in-memory caching using Caffeine.
 */
@Configuration
@EnableCaching
public class CacheConfig {
    
    private static final Logger log = LoggerFactory.getLogger(CacheConfig.class);
    
    public CacheConfig() {
        log.info("Enabled in-memory caching with Caffeine");
    }
}
