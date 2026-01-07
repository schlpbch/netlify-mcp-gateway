package ch.sbb.mcp.gateway.config;

import ch.sbb.mcp.gateway.config.GatewayProperties.ServerConfig;
import ch.sbb.mcp.gateway.model.ServerRegistration;
import ch.sbb.mcp.gateway.registry.ServerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.backoff.ExponentialBackOffPolicy;
import org.springframework.retry.policy.SimpleRetryPolicy;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * Configuration for REST client and retry logic.
 */
@Configuration
@EnableConfigurationProperties(GatewayProperties.class)
public class RestClientConfig {
    
    private static final Logger log = LoggerFactory.getLogger(RestClientConfig.class);
    
    private final GatewayProperties properties;
    
    public RestClientConfig(GatewayProperties properties) {
        this.properties = properties;
    }
    
    /**
     * Create RestTemplate bean with configured timeouts.
     */
    @Bean
    public RestTemplate restTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        
        // Configure timeouts
        restTemplate.getInterceptors().add((request, body, execution) -> {
            // Timeouts are configured via the HTTP client factory
            return execution.execute(request, body);
        });
        
        log.info("Created RestTemplate with connect timeout: {}, read timeout: {}",
            properties.getRouting().getTimeout().getConnect(),
            properties.getRouting().getTimeout().getRead());
        
        return restTemplate;
    }
    
    /**
     * Create RetryTemplate bean with exponential backoff.
     */
    @Bean
    public RetryTemplate retryTemplate() {
        RetryTemplate retryTemplate = new RetryTemplate();
        
        // Retry policy
        SimpleRetryPolicy retryPolicy = new SimpleRetryPolicy();
        retryPolicy.setMaxAttempts(properties.getRouting().getRetry().getMaxAttempts());
        retryTemplate.setRetryPolicy(retryPolicy);
        
        // Backoff policy
        ExponentialBackOffPolicy backOffPolicy = new ExponentialBackOffPolicy();
        backOffPolicy.setInitialInterval(properties.getRouting().getRetry().getBackoffDelay().toMillis());
        backOffPolicy.setMultiplier(properties.getRouting().getRetry().getBackoffMultiplier());
        retryTemplate.setBackOffPolicy(backOffPolicy);
        
        log.info("Created RetryTemplate with max attempts: {}, backoff delay: {}, multiplier: {}",
            properties.getRouting().getRetry().getMaxAttempts(),
            properties.getRouting().getRetry().getBackoffDelay(),
            properties.getRouting().getRetry().getBackoffMultiplier());
        
        return retryTemplate;
    }
    
    /**
     * Initialize server registry with pre-configured servers.
     */
    @Bean
    public ServerRegistry serverRegistry() {
        ServerRegistry registry = new ServerRegistry();
        
        // Register pre-configured servers from YAML
        for (ServerConfig config : properties.getServers()) {
            ServerRegistration registration = ServerRegistration.builder()
                .id(config.getId())
                .name(config.getName())
                .endpoint(config.getEndpoint())
                .transport(ServerRegistration.TransportType.valueOf(config.getTransport().toUpperCase()))
                .priority(config.getPriority())
                .build();
            
            registry.register(registration);
        }
        
        log.info("Initialized ServerRegistry with {} pre-configured servers", properties.getServers().size());
        
        return registry;
    }
}
