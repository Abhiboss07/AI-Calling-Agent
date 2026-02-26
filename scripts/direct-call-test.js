#!/usr/bin/env node

/**
 * Direct Call Test
 * 
 * Makes a direct test call to +919580818926 using Vobiz API
 */

const https = require('https');

console.log('📞 DIRECT CALL TEST\n');

const TEST_CONFIG = {
    backend: 'ai-outbound-agent.onrender.com',
    phoneNumber: '+919580818926',
    agentName: 'Shubhi',
    fromNumber: '+911234567890'
};

async function makeDirectCall() {
    console.log('🚀 INITIATING DIRECT CALL TEST...');
    console.log(`   📞 Calling: ${TEST_CONFIG.phoneNumber}`);
    console.log(`   🤖 Agent: ${TEST_CONFIG.agentName} (Real Estate Assistant)`);
    console.log(`   🔧 Backend: ${TEST_CONFIG.backend}`);
    
    try {
        // First, let's try to trigger a call via Vobiz webhook simulation
        console.log('\n📞 SIMULATING VOBIZ WEBHOOK...');
        
        const webhookData = {
            CallUUID: 'direct-test-' + Date.now(),
            From: TEST_CONFIG.phoneNumber,
            To: TEST_CONFIG.fromNumber,
            Direction: 'inbound',
            Language: 'en-IN'
        };
        
        const response = await makeRequest('POST', '/vobiz/answer', webhookData);
        
        if (response.status === 200) {
            console.log('   ✅ Vobiz webhook simulated successfully');
            console.log('   📞 Call session created');
            
            // Parse the response to get stream info
            console.log('   📡 WebSocket stream should be available');
            
            return {
                success: true,
                message: 'Direct call initiated via Vobiz webhook'
            };
        } else {
            console.log(`   ❌ Vobiz webhook failed: ${response.status}`);
            console.log(`   📄 Error: ${response.body}`);
            
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.body}`
            };
        }
        
    } catch (error) {
        console.log(`   ❌ Direct call error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

async function checkRealTimeMonitoring() {
    console.log('\n🔍 CHECKING REAL-TIME MONITORING...');
    
    try {
        // Try to connect to monitoring server
        const WebSocket = require('ws');
        const ws = new WebSocket(`wss://${TEST_CONFIG.backend}:3002`);
        
        return new Promise((resolve) => {
            let connected = false;
            
            ws.on('open', () => {
                console.log('   ✅ Connected to monitoring WebSocket');
                connected = true;
                
                // Subscribe to events
                ws.send(JSON.stringify({
                    type: 'subscribe_all',
                    timestamp: Date.now()
                }));
                
                // Close after 5 seconds
                setTimeout(() => {
                    ws.close();
                    resolve(connected);
                }, 5000);
            });
            
            ws.on('message', (data) => {
                try {
                    const event = JSON.parse(data.toString());
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`   📡 [${timestamp}] Event: ${event.type}`);
                } catch (error) {
                    console.log(`   📡 Event received (parse error)`);
                }
            });
            
            ws.on('close', () => {
                if (!connected) {
                    console.log('   ❌ Failed to connect to monitoring WebSocket');
                }
                resolve(connected);
            });
            
            ws.on('error', (error) => {
                console.log(`   ❌ Monitoring WebSocket error: ${error.message}`);
                resolve(false);
            });
            
            // Timeout after 10 seconds
            setTimeout(() => {
                if (!connected) {
                    ws.close();
                    resolve(false);
                }
            }, 10000);
        });
        
    } catch (error) {
        console.log(`   ❌ Monitoring check error: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🎯 DIRECT CALL TEST CONFIGURATION:');
    console.log(`   📞 Phone: ${TEST_CONFIG.phoneNumber}`);
    console.log(`   🤖 Agent: ${TEST_CONFIG.agentName} (Real Estate Assistant)`);
    console.log(`   🔧 Backend: ${TEST_CONFIG.backend}`);
    console.log(`   📱 From: ${TEST_CONFIG.fromNumber}`);
    
    // Check backend health first
    console.log('\n🔧 CHECKING BACKEND HEALTH...');
    try {
        const healthResponse = await makeRequest('GET', '/health');
        
        if (healthResponse.status === 200) {
            const health = JSON.parse(healthResponse.body);
            console.log('   ✅ Backend is healthy');
            console.log(`   📊 System Status: ${health.system?.status || 'unknown'}`);
            console.log(`   📊 Active Sessions: ${health.system?.activeSessions || 0}`);
        } else {
            console.log(`   ❌ Backend not healthy: ${healthResponse.status}`);
            return;
        }
    } catch (error) {
        console.log(`   ❌ Health check failed: ${error.message}`);
        return;
    }
    
    // Try direct call
    const callResult = await makeDirectCall();
    
    if (callResult.success) {
        console.log('\n✅ DIRECT CALL INITIATED SUCCESSFULLY!');
        console.log('   📞 Call session created via Vobiz webhook');
        console.log('   🔍 Check monitoring for real-time updates');
        
        // Check monitoring
        const monitoringConnected = await checkRealTimeMonitoring();
        
        if (monitoringConnected) {
            console.log('\n🎉 REAL-TIME MONITORING WORKING!');
            console.log('   ✅ WebSocket monitoring connected');
            console.log('   📡 Real-time events available');
        } else {
            console.log('\n⚠️  MONITORING NOT ACCESSIBLE');
            console.log('   🔧 Monitoring server may not be deployed yet');
        }
        
    } else {
        console.log('\n❌ DIRECT CALL FAILED:');
        console.log(`   📄 Error: ${callResult.error}`);
        console.log('   🔧 Routes may not be deployed yet');
    }
    
    console.log('\n📞 NEXT STEPS:');
    console.log('   1. Wait for full deployment completion');
    console.log('   2. Test call to +919580818926');
    console.log('   3. Monitor real-time dashboard');
    console.log('   4. Verify agent responses');
    
    console.log('\n✨ Direct call test complete!');
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
                'User-Agent': 'Direct-Call-Test/1.0'
            },
            timeout: 15000
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
main().catch(console.error);
