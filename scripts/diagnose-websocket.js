#!/usr/bin/env node

/**
 * WebSocket Diagnosis Tool
 * 
 * Diagnoses WebSocket connection issues and provides fixes
 */

const WebSocket = require('ws');
const https = require('https');

console.log('🔌 WEBSOCKET DIAGNOSIS TOOL\n');

const TEST_CONFIG = {
    backend: 'ai-outbound-agent.onrender.com',
    phoneNumber: '+919580818926',
    testCallUuid: 'ws-diagnosis-' + Date.now()
};

async function diagnoseWebSocket() {
    console.log('🔍 Diagnosing WebSocket Connection...');
    console.log(`   🔗 Target: wss://${TEST_CONFIG.backend}/stream`);
    
    // Test 1: Basic WebSocket connection
    console.log('\n1️⃣ Testing Basic WebSocket Connection...');
    await testBasicConnection();
    
    // Test 2: Connection with proper parameters
    console.log('\n2️⃣ Testing with Required Parameters...');
    await testWithParameters();
    
    // Test 3: Connection with Vobiz simulation
    console.log('\n3️⃣ Testing Vobiz Flow Simulation...');
    await testVobizFlow();
    
    // Test 4: Check WebSocket endpoint accessibility
    console.log('\n4️⃣ Checking Endpoint Accessibility...');
    await checkEndpointAccessibility();
}

async function testBasicConnection() {
    return new Promise((resolve) => {
        const ws = new WebSocket(`wss://${TEST_CONFIG.backend}/stream`);
        
        const timeout = setTimeout(() => {
            console.log('   ❌ Basic connection timeout');
            resolve(false);
        }, 5000);
        
        ws.on('open', () => {
            clearTimeout(timeout);
            console.log('   ✅ Basic connection successful');
            ws.close();
            resolve(true);
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`   ❌ Basic connection error: ${error.message}`);
            resolve(false);
        });
    });
}

async function testWithParameters() {
    return new Promise((resolve) => {
        const params = new URLSearchParams({
            callUuid: TEST_CONFIG.testCallUuid,
            callerNumber: TEST_CONFIG.phoneNumber.replace('+', ''),
            language: 'en-IN'
        });
        
        const ws = new WebSocket(`wss://${TEST_CONFIG.backend}/stream?${params}`);
        
        const timeout = setTimeout(() => {
            console.log('   ❌ Parameter connection timeout');
            resolve(false);
        }, 5000);
        
        ws.on('open', () => {
            clearTimeout(timeout);
            console.log('   ✅ Parameter connection successful');
            console.log(`   📞 Call UUID: ${TEST_CONFIG.testCallUuid}`);
            console.log(`   📱 Phone: ${TEST_CONFIG.phoneNumber}`);
            ws.close();
            resolve(true);
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`   ❌ Parameter connection error: ${error.message}`);
            resolve(false);
        });
    });
}

async function testVobizFlow() {
    console.log('   📞 Simulating Vobiz call flow...');
    
    // First trigger answer webhook
    const webhookResult = await triggerAnswerWebhook();
    if (!webhookResult) {
        console.log('   ❌ Failed to trigger answer webhook');
        return false;
    }
    
    console.log('   ✅ Answer webhook triggered');
    
    // Now test WebSocket with the call UUID from webhook
    return new Promise((resolve) => {
        const params = new URLSearchParams({
            callUuid: TEST_CONFIG.testCallUuid,
            callerNumber: TEST_CONFIG.phoneNumber.replace('+', ''),
            language: 'en-IN'
        });
        
        const ws = new WebSocket(`wss://${TEST_CONFIG.backend}/stream?${params}`);
        
        const timeout = setTimeout(() => {
            console.log('   ❌ Vobiz flow connection timeout');
            resolve(false);
        }, 5000);
        
        ws.on('open', () => {
            clearTimeout(timeout);
            console.log('   ✅ Vobiz flow connection successful');
            
            // Test sending audio data
            setTimeout(() => {
                const testAudio = Buffer.alloc(160, 0); // 20ms of silence
                ws.send(testAudio);
                console.log('   📤 Test audio data sent');
            }, 1000);
            
            setTimeout(() => {
                ws.close();
                resolve(true);
            }, 2000);
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`   📥 Received: ${message.event || 'unknown event'}`);
            } catch (e) {
                console.log('   📥 Received binary audio data');
            }
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`   ❌ Vobiz flow error: ${error.message}`);
            resolve(false);
        });
    });
}

async function triggerAnswerWebhook() {
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            CallUUID: TEST_CONFIG.testCallUuid,
            From: TEST_CONFIG.phoneNumber,
            To: '+911234567890',
            Direction: 'inbound',
            language: 'en-IN'
        });
        
        const req = https.request({
            hostname: TEST_CONFIG.backend,
            path: '/vobiz/answer',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-Vobiz-Signature': 'test-signature'
            },
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const success = res.statusCode === 200;
                console.log(`   📞 Answer webhook: ${res.statusCode}`);
                resolve(success);
            });
        });
        
        req.on('error', () => resolve(false));
        req.write(postData);
        req.end();
    });
}

async function checkEndpointAccessibility() {
    console.log('   🔍 Checking WebSocket endpoint...');
    
    return new Promise((resolve) => {
        const req = https.request({
            hostname: TEST_CONFIG.backend,
            path: '/stream',
            method: 'GET',
            timeout: 5000
        }, (res) => {
            console.log(`   📡 Stream endpoint: ${res.statusCode}`);
            
            // WebSocket endpoints should return 400 for GET requests (protocol upgrade required)
            if (res.statusCode === 400) {
                console.log('   ✅ WebSocket endpoint accessible (400 = expected for GET)');
                resolve(true);
            } else {
                console.log('   ❌ Unexpected response for WebSocket endpoint');
                resolve(false);
            }
        });
        
        req.on('error', () => {
            console.log('   ❌ WebSocket endpoint not accessible');
            resolve(false);
        });
        
        req.end();
    });
}

async function provideSolutions() {
    console.log('\n🔧 WEBSOCKET SOLUTIONS:');
    console.log('\n📋 DIAGNOSIS RESULTS:');
    
    const results = {
        basic: await testBasicConnection(),
        parameters: await testWithParameters(),
        vobiz: await testVobizFlow(),
        endpoint: await checkEndpointAccessibility()
    };
    
    console.log('\n📊 TEST RESULTS:');
    console.log(`   🔌 Basic Connection: ${results.basic ? '✅' : '❌'}`);
    console.log(`   📞 With Parameters: ${results.parameters ? '✅' : '❌'}`);
    console.log(`   🔄 Vobiz Flow: ${results.vobiz ? '✅' : '❌'}`);
    console.log(`   📡 Endpoint Access: ${results.endpoint ? '✅' : '❌'}`);
    
    console.log('\n🛠️  RECOMMENDED FIXES:');
    
    if (!results.basic) {
        console.log('   ❌ Basic WebSocket connection failed');
        console.log('   🔧 Fix: Check if WebSocket server is running');
        console.log('   🔧 Fix: Verify SSL certificate for WSS://');
        console.log('   🔧 Fix: Check firewall/proxy settings');
    }
    
    if (!results.parameters) {
        console.log('   ❌ Parameter connection failed');
        console.log('   🔧 Fix: Ensure required query parameters are present');
        console.log('   🔧 Fix: Check parameter validation in server');
    }
    
    if (!results.vobiz) {
        console.log('   ❌ Vobiz flow failed');
        console.log('   🔧 Fix: Ensure answer webhook creates session');
        console.log('   🔧 Fix: Check session management in WebSocket handler');
    }
    
    if (!results.endpoint) {
        console.log('   ❌ Endpoint not accessible');
        console.log('   🔧 Fix: Check route mounting in server.js');
        console.log('   🔧 Fix: Verify express-ws configuration');
    }
    
    const allPass = Object.values(results).every(Boolean);
    
    if (allPass) {
        console.log('\n🎉 ALL WEBSOCKET TESTS PASSED!');
        console.log('   ✅ WebSocket streaming is fully functional');
        console.log('   🚀 Ready for real-time audio processing');
    } else {
        console.log('\n⚠️  WEBSOCKET NEEDS ATTENTION');
        console.log('   🔧 Apply the fixes above and retest');
    }
    
    console.log('\n📞 NEXT STEPS:');
    console.log('   1. Fix WebSocket connection issues');
    console.log('   2. Test with real Vobiz calls');
    console.log('   3. Implement real-time frontend updates');
    console.log('   4. Add live call monitoring');
}

// Run diagnosis
diagnoseWebSocket().then(provideSolutions).catch(console.error);
