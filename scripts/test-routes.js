#!/usr/bin/env node

/**
 * Quick API Route Test
 * 
 * Tests if API routes are properly mounted
 */

const https = require('https');

console.log('🔍 QUICK API ROUTE TEST\n');

const TEST_CONFIG = {
    backend: 'ai-outbound-agent.onrender.com'
};

async function testRoutes() {
    console.log('🔍 Testing API Routes...');
    
    const routes = [
        { path: '/health', method: 'GET', description: 'Health check' },
        { path: '/api/v1/calls/test-start', method: 'POST', description: 'Test call start' },
        { path: '/api/v1/calls/start', method: 'POST', description: 'Protected call start' },
        { path: '/monitor/metrics', method: 'GET', description: 'Monitoring metrics' },
        { path: '/stream', method: 'GET', description: 'WebSocket endpoint' },
        { path: '/vobiz/answer', method: 'POST', description: 'Vobiz answer webhook' }
    ];
    
    const results = [];
    
    for (const route of routes) {
        try {
            console.log(`\n🔍 Testing ${route.description}...`);
            
            const response = await makeRequest(route.method, route.path, route.path === '/api/v1/calls/test-start' ? {
                campaignId: 'route-test-' + Date.now(),
                phoneNumber: '+919580818926',
                fromNumber: '+911234567890',
                language: 'en-IN',
                agentName: 'Shubhi',
                testMode: true
            } : null);
            
            const success = response.status === 200 || (route.method === 'GET' && response.status === 400);
            
            console.log(`${success ? '✅' : '❌'} ${route.description}: ${response.status}`);
            
            if (response.status === 404) {
                console.log(`   📄 Error: Route not found`);
            } else if (response.status >= 500) {
                console.log(`   📄 Error: Server error`);
            } else if (success) {
                console.log(`   ✅ Route accessible and working`);
            }
            
            results.push({
                route: route.description,
                path: route.path,
                method: route.method,
                status: response.status,
                success: success
            });
            
        } catch (error) {
            console.log(`❌ ${route.description} Error: ${error.message}`);
            results.push({
                route: route.description,
                path: route.path,
                method: route.method,
                status: 'ERROR',
                success: false,
                error: error.message
            });
        }
    }
    
    console.log('\n📊 ROUTE TEST SUMMARY:');
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`   ${status} ${result.route}: ${result.status} (${result.method} ${result.path})`);
    });
    
    console.log(`\n🎯 OVERALL: ${successCount}/${totalCount} routes working`);
    
    if (successCount === totalCount) {
        console.log('\n🎉 ALL ROUTES ARE WORKING!');
        console.log('   ✅ Backend is properly deployed');
        console.log('   ✅ API routes are accessible');
        console.log('   ✅ Ready for live call testing');
    } else {
        console.log('\n⚠️  SOME ROUTES ARE NOT WORKING');
        console.log('   🔧 Check deployment and routing');
        console.log('   🔧 Verify server restart');
    }
    
    return results;
}

function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const postData = data ? JSON.stringify(data) : null;
        
        const options = {
            hostname: TEST_CONFIG.backend,
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(postData && { 'Content-Length': Buffer.byteLength(postData) }),
                'User-Agent': 'Route-Test/1.0'
            },
            timeout: 10000
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: responseData
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

// Run the test
testRoutes().catch(console.error);
