/**
 * Performance Utilities
 * Debounce, throttle, and other performance helpers
 */

/**
 * Debounce function
 * Delays execution until after wait time has elapsed since last call
 */
function debounce(func, wait = 300) {
    let timeout;
    
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * Ensures function is only called once per wait period
 */
function throttle(func, wait = 300) {
    let inThrottle;
    let lastFunc;
    let lastRan;
    
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            lastRan = Date.now();
            inThrottle = true;
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= wait) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, Math.max(wait - (Date.now() - lastRan), 0));
        }
    };
}

/**
 * Async debounce
 * Debounce for async functions
 */
function debounceAsync(func, wait = 300) {
    let timeout;
    let pendingPromise = null;
    
    return function(...args) {
        return new Promise((resolve, reject) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            
            timeout = setTimeout(async () => {
                try {
                    if (pendingPromise) {
                        await pendingPromise;
                    }
                    pendingPromise = func.apply(this, args);
                    const result = await pendingPromise;
                    pendingPromise = null;
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, wait);
        });
    };
}

/**
 * Request Animation Frame throttle
 * Uses RAF for smooth animations
 */
function rafThrottle(func) {
    let rafId = null;
    
    return function(...args) {
        if (rafId) {
            return;
        }
        
        rafId = requestAnimationFrame(() => {
            func.apply(this, args);
            rafId = null;
        });
    };
}

/**
 * Memoize function results
 * Caches function results based on arguments
 */
function memoize(func, maxSize = 50) {
    const cache = new Map();
    
    return function(...args) {
        const key = JSON.stringify(args);
        
        if (cache.has(key)) {
            return cache.get(key);
        }
        
        const result = func.apply(this, args);
        
        if (cache.size >= maxSize) {
            // Delete oldest entry
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        
        cache.set(key, result);
        return result;
    };
}

/**
 * Lazy loader
 * Loads content when element is in viewport
 */
function lazyLoad(element, loadFunc) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadFunc();
                observer.unobserve(element);
            }
        });
    });
    
    observer.observe(element);
    return observer;
}

/**
 * Performance monitor
 * Track function execution time
 */
function measurePerformance(func, name = 'Function') {
    return function(...args) {
        const start = performance.now();
        const result = func.apply(this, args);
        const end = performance.now();
        
        console.log(`[PERF] ${name}: ${(end - start).toFixed(2)}ms`);
        
        return result;
    };
}

/**
 * Async performance monitor
 */
function measurePerformanceAsync(func, name = 'AsyncFunction') {
    return async function(...args) {
        const start = performance.now();
        const result = await func.apply(this, args);
        const end = performance.now();
        
        console.log(`[PERF] ${name}: ${(end - start).toFixed(2)}ms`);
        
        return result;
    };
}

/**
 * Batch updates
 * Collects multiple calls and executes once
 */
function batchUpdates(func, wait = 100) {
    let pending = [];
    let timeout;
    
    return function(item) {
        pending.push(item);
        
        if (timeout) {
            clearTimeout(timeout);
        }
        
        timeout = setTimeout(() => {
            const batch = pending.slice();
            pending = [];
            func(batch);
        }, wait);
    };
}

/**
 * Idle callback wrapper
 * Executes function when browser is idle
 */
function runWhenIdle(func, timeout = 2000) {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => func(), { timeout });
    } else {
        setTimeout(func, timeout);
    }
}

module.exports = {
    debounce,
    throttle,
    debounceAsync,
    rafThrottle,
    memoize,
    lazyLoad,
    measurePerformance,
    measurePerformanceAsync,
    batchUpdates,
    runWhenIdle
};

