#!/usr/bin/env node

/**
 * Deployment Tracker
 * 
 * Tracks and monitors both Vercel (frontend) and Render (backend) deployments
 */

const https = require('https');

console.log('🚀 DEPLOYMENT TRACKER\n');

const DEPLOYMENT_CONFIG = {
    frontend: {
        name: 'Vercel Frontend',
        url: 'https://calling-agent-5xwy8mk2l-abhishek-yadav-s-projects-2e9f191c.vercel.app',
        healthPath: '/'
    },
    backend: {
        name: 'Render Backend',
        url: 'https://ai-outbound-agent.onrender.com',
        healthPath: '/health'
    },
    commit: 'be807b1'
};

async function trackDeployments() {
    console.log('📊 TRACKING DEPLOYMENTS...');
    console.log(`   📋 Latest Commit: ${DEPLOYMENT_CONFIG.commit}`);
    console.log('');
    
    // Track frontend deployment
    console.log('🎨 FRONTEND DEPLOYMENT (Vercel):');
    await checkDeployment(DEPLOYMENT_CONFIG.frontend);
    
    console.log('');
    
    // Track backend deployment
    console.log('🔧 BACKEND DEPLOYMENT (Render):');
    await checkDeployment(DEPLOYMENT_CONFIG.backend);
    
    console.log('');
    
    // Summary
    console.log('📊 DEPLOYMENT SUMMARY:');
    const frontendStatus = await checkDeploymentStatus(DEPLOYMENT_CONFIG.frontend);
    const backendStatus = await checkDeploymentStatus(DEPLOYMENT_CONFIG.backend);
    
    console.log(`   🎨 Frontend: ${frontendStatus ? '✅ Deployed' : '⏳ In Progress'}`);
    console.log(`   🔧 Backend: ${backendStatus ? '✅ Deployed' : '⏳ In Progress'}`);
    
    if (frontendStatus && backendStatus) {
        console.log('\n🎉 BOTH DEPLOYMENTS COMPLETE!');
        console.log('   ✅ Ready for live testing');
        console.log('   📞 Test call to +919580818926');
        console.log('   🔍 Monitor real-time dashboard');
        
        console.log('\n📱 LIVE TESTING LINKS:');
        console.log(`   🎨 Frontend: ${DEPLOYMENT_CONFIG.frontend.url}/dashboard`);
        console.log(`   🔧 Backend: ${DEPLOYMENT_CONFIG.backend.url}`);
        console.log('   📞 Phone: +919580818926');
        console.log('   🤖 Agent: Shubhi (Real Estate Assistant)');
        
    } else {
        console.log('\n⏳ DEPLOYMENTS IN PROGRESS...');
        console.log('   ⏱️ Wait 2-3 minutes for completion');
        console.log('   🔄 Check again in a moment');
    }
}

async function checkDeployment(service) {
    try {
        const response = await makeRequest('GET', service.healthPath, null, service.url);
        
        if (response.status === 200) {
            console.log(`   ✅ ${service.name}: Deployed and healthy`);
            console.log(`   📊 Status: ${response.status}`);
            return true;
        } else if (response.status >= 500) {
            console.log(`   🔴 ${service.name}: Server error (${response.status})`);
            return false;
        } else {
            console.log(`   🟡 ${service.name}: Deploying (${response.status})`);
            return false;
        }
    } catch (error) {
        if (error.message.includes('timeout')) {
            console.log(`   ⏳ ${service.name}: Still deploying...`);
        } else {
            console.log(`   ❌ ${service.name}: Error - ${error.message}`);
        }
        return false;
    }
}

async function checkDeploymentStatus(service) {
    try {
        const response = await makeRequest('GET', service.healthPath, null, service.url);
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

function makeRequest(method, path, data = null, baseUrl) {
    return new Promise((resolve, reject) => {
        const postData = data ? JSON.stringify(data) : null;
        const url = new URL(path, baseUrl);
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(postData && { 'Content-Length': Buffer.byteLength(postData) }),
                'User-Agent': 'Deployment-Tracker/1.0'
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

// Track deployments
trackDeployments().catch(console.error);
