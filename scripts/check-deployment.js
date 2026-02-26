#!/usr/bin/env node

/**
 * Deployment Status Check
 * 
 * Checks if the latest deployment is active and working
 */

const https = require('https');

console.log('🔍 DEPLOYMENT STATUS CHECK\n');

const TEST_CONFIG = {
    backend: 'ai-outbound-agent.onrender.com',
    latestCommit: 'be807b1' // Latest commit hash
};

async function checkDeploymentStatus() {
    console.log('🔍 Checking Deployment Status...');
    
    try {
        // Check if server is running
        const healthResponse = await makeRequest('GET', '/health');
        
        if (healthResponse.status === 200) {
            const health = JSON.parse(healthResponse.body);
            console.log('   ✅ Server is healthy');
            console.log(`   📊 System Status: ${health.system?.status || 'unknown'}`);
            console.log(`   ⏱️ Uptime: ${Math.round(health.uptime || 0)}s`);
            
            // Check if routes are accessible
            console.log('\n🔍 Checking Route Accessibility...');
            
            const routes = [
                { path: '/api/v1/calls/test-start', method: 'POST', name: 'Test Call Start' },
                { path: '/monitor/metrics', method: 'GET', name: 'Monitoring Metrics' },
                { path: '/stream', method: 'GET', name: 'WebSocket Endpoint' },
                { path: '/vobiz/answer', method: 'POST', name: 'Vobiz Answer' }
            ];
            
            let workingRoutes = 0;
            
            for (const route of routes) {
                try {
                    const response = await makeRequest(route.method, route.path, 
                        route.method === 'POST' ? {
                            campaignId: 'test-' + Date.now(),
                            phoneNumber: '+919580818926',
                            testMode: true
                        } : null
                    );
                    
                    const isWorking = response.status === 200 || (route.method === 'GET' && response.status === 400);
                    
                    if (isWorking) {
                        workingRoutes++;
                        console.log(`   ✅ ${route.name}: ${response.status}`);
                    } else {
                        console.log(`   ❌ ${route.name}: ${response.status}`);
                    }
                } catch (error) {
                    console.log(`   ❌ ${route.name}: Error - ${error.message}`);
                }
            }
            
            console.log(`\n📊 Route Status: ${workingRoutes}/${routes.length} working`);
            
            if (workingRoutes === routes.length) {
                console.log('\n🎉 DEPLOYMENT COMPLETE AND WORKING!');
                console.log('   ✅ All routes are accessible');
                console.log('   ✅ Ready for live call testing');
                console.log('   📞 Test call to +919580818926 should work');
            } else {
                console.log('\n⚠️  DEPLOYMENT INCOMPLETE');
                console.log('   🔧 Some routes are not accessible');
                console.log('   ⏳ Deployment may still be in progress');
                console.log('   🔄 Check Render dashboard for deployment status');
            }
            
        } else {
            console.log(`   ❌ Server not healthy: ${healthResponse.status}`);
        }
        
    } catch (error) {
        console.log(`   ❌ Deployment check failed: ${error.message}`);
    }
    
    console.log('\n🔧 NEXT STEPS:');
    console.log('   1. Check Render deployment dashboard');
    console.log('   2. Verify latest commit is deployed');
    console.log('   3. Check for any deployment errors');
    console.log('   4. If needed, manually trigger redeploy');
    console.log('   5. Test routes after deployment completes');
    
    console.log('\n📞 READY TO TEST:');
    console.log('   📱 Phone: +919580818926');
    console.log('   🤖 Agent: Shubhi (Real Estate Assistant)');
    console.log('   🔧 Backend: https://ai-outbound-agent.onrender.com');
    console.log('   🎨 Frontend: https://calling-agent-5xwy8mk2l-abhishek-yadav-s-projects-2e9f191c.vercel.app/dashboard');
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
                'User-Agent': 'Deployment-Check/1.0'
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

// Run the check
checkDeploymentStatus().catch(console.error);
