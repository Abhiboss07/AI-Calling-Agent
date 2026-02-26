#!/usr/bin/env node

/**
 * Live Call Test and Monitor
 * 
 * Makes test call to +919580818926 and monitors real-time backend activity
 */

const https = require('https');
const WebSocket = require('ws');

console.log('📞 LIVE CALL TEST AND MONITOR\n');

const TEST_CONFIG = {
    backend: 'ai-outbound-agent.onrender.com',
    phoneNumber: '+919580818926',
    agentName: 'Shubhi',
    testDuration: 60000 // 60 seconds max
};

async function initiateTestCall() {
    console.log('🚀 Initiating Test Call...');
    console.log(`   📞 Calling: ${TEST_CONFIG.phoneNumber}`);
    console.log(`   🤖 Agent: ${TEST_CONFIG.agentName} (Real Estate Assistant)`);
    
    try {
        // Create test call via API
        const callData = {
            campaignId: 'live-test-' + Date.now(),
            phoneNumber: TEST_CONFIG.phoneNumber,
            fromNumber: '+911234567890',
            language: 'en-IN',
            agentName: TEST_CONFIG.agentName,
            testMode: true
        };
        
        // Create test call via public API
        const response = await makeRequest('POST', '/api/v1/calls/test-start', callData);
        
        if (response.status === 200) {
            const result = JSON.parse(response.body);
            console.log('   Call initiated successfully');
            console.log(`   Call ID: ${result.callId || result._id}`);
            console.log(`   Status: ${result.status || 'initiated'}`);
            console.log(`   📞 Status: ${result.status || 'initiated'}`);
            
            return {
                success: true,
                callId: result.callId || result._id,
                status: result.status || 'initiated'
            };
        } else {
            console.log(`   ❌ Call initiation failed: ${response.status}`);
            console.log(`   📄 Error: ${response.body}`);
            
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.body}`
            };
        }
    } catch (error) {
        console.log(`   ❌ Call initiation error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

async function monitorBackendActivity() {
    console.log('\n🔍 Monitoring Backend Activity...');
    
    // Connect to monitoring WebSocket for real-time updates
    return new Promise((resolve) => {
        const ws = new WebSocket(`wss://${TEST_CONFIG.backend}:3002`);
        
        const startTime = Date.now();
        let events = [];
        
        ws.on('open', () => {
            console.log('   ✅ Connected to monitoring WebSocket');
            
            // Subscribe to all events
            ws.send(JSON.stringify({
                type: 'subscribe_all',
                timestamp: Date.now()
            }));
        });
        
        ws.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString());
                const timestamp = new Date().toLocaleTimeString();
                
                events.push({
                    time: timestamp,
                    type: event.type,
                    data: event.payload
                });
                
                // Log real-time events
                switch (event.type) {
                    case 'call_started':
                        console.log(`   📞 [${timestamp}] Call Started: ${event.payload.phoneNumber}`);
                        break;
                    case 'call_ended':
                        console.log(`   🔚 [${timestamp}] Call Ended: ${event.payload.callUuid} (${Math.round(event.payload.duration/1000)}s)`);
                        break;
                    case 'transcript':
                        console.log(`   💬 [${timestamp}] Transcript: ${event.payload.speaker} - "${event.payload.text}"`);
                        break;
                    case 'agent_speaking':
                        console.log(`   🤖 [${timestamp}] Agent Speaking: ${event.payload.callUuid}`);
                        break;
                    case 'customer_speaking':
                        console.log(`   🗣️ [${timestamp}] Customer Speaking: ${event.payload.callUuid}`);
                        break;
                    case 'metrics':
                        console.log(`   📊 [${timestamp}] Metrics: ${event.payload.activeCalls} active, ${event.payload.totalCalls} total`);
                        break;
                    default:
                        console.log(`   📡 [${timestamp}] Event: ${event.type}`);
                }
            } catch (error) {
                console.log(`   ❌ Parse error: ${error.message}`);
            }
        });
        
        ws.on('close', () => {
            const duration = Date.now() - startTime;
            console.log(`   🔌 Monitoring ended after ${Math.round(duration/1000)}s`);
            console.log(`   📊 Total events captured: ${events.length}`);
            
            // Analyze events
            analyzeEvents(events);
            resolve(events);
        });
        
        ws.on('error', (error) => {
            console.log(`   ❌ Monitoring error: ${error.message}`);
            resolve(events);
        });
        
        // Auto-close after test duration
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }, TEST_CONFIG.testDuration);
    });
}

function analyzeEvents(events) {
    console.log('\n📊 EVENT ANALYSIS:');
    
    const callEvents = events.filter(e => e.type === 'call_started' || e.type === 'call_ended');
    const transcriptEvents = events.filter(e => e.type === 'transcript');
    const speakingEvents = events.filter(e => e.type === 'agent_speaking' || e.type === 'customer_speaking');
    
    console.log(`   📞 Call Events: ${callEvents.length}`);
    console.log(`   💬 Transcript Events: ${transcriptEvents.length}`);
    console.log(`   🗣️ Speaking Events: ${speakingEvents.length}`);
    
    if (transcriptEvents.length > 0) {
        const agentMessages = transcriptEvents.filter(e => e.data.speaker === 'agent');
        const customerMessages = transcriptEvents.filter(e => e.data.speaker === 'customer');
        
        console.log(`   🤖 Agent Messages: ${agentMessages.length}`);
        console.log(`   🗣️ Customer Messages: ${customerMessages.length}`);
        
        // Check for real estate context
        const realEstateKeywords = ['property', 'real estate', 'house', 'apartment', 'booking', 'visit', 'price', 'location'];
        const hasRealEstateContext = transcriptEvents.some(e => 
            realEstateKeywords.some(keyword => 
                e.data.text.toLowerCase().includes(keyword)
            )
        );
        
        console.log(`   🏠 Real Estate Context: ${hasRealEstateContext ? '✅ Yes' : '❌ No'}`);
        
        if (agentMessages.length > 0) {
            const agentResponses = agentMessages.map(e => e.data.text);
            console.log('   🤖 Agent Responses:');
            agentResponses.forEach((response, index) => {
                console.log(`      ${index + 1}. "${response}"`);
            });
        }
    }
    
    // Check for issues
    const issues = [];
    
    if (callEvents.length === 0) {
        issues.push('No call events detected');
    }
    
    if (transcriptEvents.length === 0) {
        issues.push('No transcript events');
    }
    
    if (speakingEvents.length === 0) {
        issues.push('No speaking detection events');
    }
    
    if (issues.length > 0) {
        console.log('\n⚠️  ISSUES DETECTED:');
        issues.forEach((issue, index) => {
            console.log(`   ${index + 1}. ${issue}`);
        });
    } else {
        console.log('\n✅ REAL-TIME MONITORING WORKING CORRECTLY');
    }
}

async function checkBackendHealth() {
    console.log('🔧 Checking Backend Health...');
    
    try {
        const response = await makeRequest('GET', '/health');
        
        if (response.status === 200) {
            const health = JSON.parse(response.body);
            console.log('   ✅ Backend is healthy');
            console.log(`   📊 Active Sessions: ${health.system?.activeSessions || 0}`);
            console.log(`   📊 Max Sessions: ${health.system?.maxSessions || 10}`);
            console.log(`   📊 System Status: ${health.system?.status || 'unknown'}`);
            console.log(`   ⏱️ Uptime: ${Math.round(health.uptime || 0)}s`);
            
            return true;
        } else {
            console.log(`   ❌ Backend health check failed: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Health check error: ${error.message}`);
        return false;
    }
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
                'User-Agent': 'Live-Call-Test/1.0'
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

async function main() {
    console.log('🎯 LIVE CALL TEST CONFIGURATION:');
    console.log(`   📞 Phone: ${TEST_CONFIG.phoneNumber}`);
    console.log(`   🤖 Agent: ${TEST_CONFIG.agentName} (Real Estate Assistant)`);
    console.log(`   🔧 Backend: ${TEST_CONFIG.backend}`);
    console.log(`   ⏱️ Duration: ${TEST_CONFIG.testDuration/1000}s max`);
    
    // Check backend health first
    const isHealthy = await checkBackendHealth();
    
    if (!isHealthy) {
        console.log('\n❌ BACKEND NOT HEALTHY - CANNOT PROCEED WITH CALL TEST');
        console.log('🔧 Please fix backend issues before making test calls');
        return;
    }
    
    console.log('\n📞 INITIATING TEST CALL...');
    
    // Initiate test call
    const callResult = await initiateTestCall();
    
    if (callResult.success) {
        console.log('\n🔍 MONITORING REAL-TIME ACTIVITY...');
        console.log('   (Monitoring for 60 seconds or until call ends)');
        
        // Monitor real-time activity
        const events = await monitorBackendActivity();
        
        console.log('\n📊 FINAL RESULTS:');
        console.log(`   📞 Call Status: ${callResult.status}`);
        console.log(`   🆔 Call ID: ${callResult.callId}`);
        console.log(`   📡 Events Captured: ${events.length}`);
        
        // Provide recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        if (events.length > 0) {
            console.log('   ✅ Real-time monitoring is working');
            console.log('   ✅ WebSocket streaming is functional');
            console.log('   ✅ Agent responses are being tracked');
        } else {
            console.log('   ⚠️  No real-time events captured');
            console.log('   🔧 Check WebSocket connection');
            console.log('   🔧 Verify monitoring server status');
        }
        
    } else {
        console.log('\n❌ CALL INITIATION FAILED:');
        console.log(`   📄 Error: ${callResult.error}`);
        console.log('   🔧 Check API configuration and authentication');
    }
    
    console.log('\n✅ Live call test complete!');
}

// Run the test
main().catch(console.error);
