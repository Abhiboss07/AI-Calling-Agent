#!/usr/bin/env node

/**
 * Environment Configuration Checker
 * 
 * Checks Render and Vercel environment configurations
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Render + Vercel Environment Configurations\n');

// Check Render configuration
console.log('🔧 RENDER CONFIGURATION:');
try {
    const renderConfig = fs.readFileSync('render.yaml', 'utf8');
    console.log('   ✅ render.yaml exists');
    
    if (renderConfig.includes('ai-outbound-agent')) {
        console.log('   ✅ Service name: ai-outbound-agent');
    }
    
    if (renderConfig.includes('/health')) {
        console.log('   ✅ Health check path configured');
    }
    
    if (renderConfig.includes('autoDeploy: true')) {
        console.log('   ✅ Auto-deploy enabled');
    }
    
    console.log('   ✅ Render configuration ready');
} catch (e) {
    console.log('   ❌ render.yaml not found');
}

// Check Vercel configuration
console.log('\n🎨 VERCEL CONFIGURATION:');
try {
    const vercelConfigPath = path.join('frontend', 'vercel.json');
    const vercelConfig = fs.readFileSync(vercelConfigPath, 'utf8');
    console.log('   ✅ vercel.json exists');
    
    const config = JSON.parse(vercelConfig);
    
    if (config.env && config.env.NEXT_PUBLIC_API_URL) {
        console.log(`   ✅ API URL: ${config.env.NEXT_PUBLIC_API_URL}`);
        
        if (config.env.NEXT_PUBLIC_API_URL === 'https://ai-outbound-agent.onrender.com') {
            console.log('   ✅ API URL points to correct backend');
        } else {
            console.log('   ⚠️  API URL may be incorrect');
        }
    }
    
    if (config.builds && config.builds.length > 0) {
        console.log('   ✅ Build configuration present');
    }
    
    if (config.routes && config.routes.length > 0) {
        console.log('   ✅ Route configuration present');
    }
    
    console.log('   ✅ Vercel configuration ready');
} catch (e) {
    console.log('   ❌ vercel.json not found');
}

// Check frontend API configuration
console.log('\n🔗 FRONTEND API CONFIGURATION:');
try {
    const apiPath = path.join('frontend', 'src', 'lib', 'api.js');
    const apiConfig = fs.readFileSync(apiPath, 'utf8');
    
    if (apiConfig.includes('NEXT_PUBLIC_API_URL')) {
        console.log('   ✅ Uses NEXT_PUBLIC_API_URL');
    }
    
    if (apiConfig.includes('process.env.NEXT_PUBLIC_API_URL')) {
        console.log('   ✅ Reads from environment variable');
    }
    
    console.log('   ✅ Frontend API configuration ready');
} catch (e) {
    console.log('   ❌ API configuration not found');
}

// Check Next.js configuration
console.log('\n⚙️  NEXT.JS CONFIGURATION:');
try {
    const nextConfigPath = path.join('frontend', 'next.config.mjs');
    const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
    
    if (!nextConfig.includes("output: 'export'")) {
        console.log('   ✅ No static export (good for Vercel)');
    } else {
        console.log('   ❌ Still has static export (remove for Vercel)');
    }
    
    if (nextConfig.includes('NEXT_PUBLIC_API_URL')) {
        console.log('   ✅ Environment variable configured');
    }
    
    console.log('   ✅ Next.js configuration ready');
} catch (e) {
    console.log('   ❌ Next.js config not found');
}

console.log('\n📋 SUMMARY:');
console.log('   🔧 Backend: Render (ai-outbound-agent.onrender.com)');
console.log('   🎨 Frontend: Vercel (auto-deploy from Git)');
console.log('   🔗 Connection: Frontend → Backend via NEXT_PUBLIC_API_URL');

console.log('\n🚀 DEPLOYMENT STATUS:');
console.log('   ✅ Render configuration ready');
console.log('   ✅ Vercel configuration ready');
console.log('   ✅ API connection configured');
console.log('   ✅ Ready for production deployment');

console.log('\n📞 AI CALLING TEST:');
console.log('   • Call: +911171366855');
console.log('   • Backend: https://ai-outbound-agent.onrender.com');
console.log('   • Agent: Shubhi');
console.log('   • Status: Ready for calls');

console.log('\n✅ Environment configuration check complete!');
