/**
 * HTML to PDF Converter
 * Converts the AI Calling Agent guide to PDF
 * Run with: node convert-to-pdf.js
 */

const fs = require('fs');
const path = require('path');

async function convertHTMLToPDF() {
  try {
    console.log('Checking for PDF conversion tools...\n');
    
    // Method 1: Try using wkhtmltopdf (if installed)
    const { execSync } = require('child_process');
    
    try {
      execSync('wkhtmltopdf --version', { stdio: 'ignore' });
      console.log('✅ wkhtmltopdf found! Converting to PDF...\n');
      
      const htmlFile = path.join(__dirname, 'AI_CALLING_AGENT_COMPLETE_GUIDE.html');
      const pdfFile = path.join(__dirname, 'AI_CALLING_AGENT_COMPLETE_GUIDE.pdf');
      
      execSync(`wkhtmltopdf "${htmlFile}" "${pdfFile}"`, { stdio: 'inherit' });
      
      console.log('\n✅ PDF created successfully!');
      console.log(`📄 File: ${pdfFile}`);
      console.log(`📊 Size: ${(fs.statSync(pdfFile).size / 1024 / 1024).toFixed(2)} MB`);
      
    } catch (e) {
      console.log('⚠️ wkhtmltopdf not found.\n');
      console.log('Alternative Methods:\n');
      
      console.log('METHOD 1: Using Your Browser (Recommended)');
      console.log('─────────────────────────────────────────');
      console.log('1. Open: AI_CALLING_AGENT_COMPLETE_GUIDE.html in Chrome/Firefox');
      console.log('2. Press: Ctrl+P (Print)');
      console.log('3. Select: "Save as PDF"');
      console.log('4. Choose location and save\n');
      
      console.log('METHOD 2: Online Converter');
      console.log('─────────────────────────');
      console.log('1. Upload AI_CALLING_AGENT_COMPLETE_GUIDE.html to:');
      console.log('   https://cloudconvert.com/html-to-pdf');
      console.log('2. Download the PDF\n');
      
      console.log('METHOD 3: Install wkhtmltopdf (For Automation)');
      console.log('──────────────────────────────────────────────');
      console.log('Windows:');
      console.log('  Download: https://wkhtmltopdf.org/');
      console.log('  Add to PATH environment variable\n');
      
      console.log('After setup, run: node convert-to-pdf.js\n');
      
      // Create a simple guide file instead
      createManualGuide();
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

function createManualGuide() {
  const guide = `
╔════════════════════════════════════════════════════════════════════════╗
║     HOW TO CONVERT HTML TO PDF - STEP BY STEP GUIDE                    ║
╚════════════════════════════════════════════════════════════════════════╝

YOUR FILE: AI_CALLING_AGENT_COMPLETE_GUIDE.html

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPTION A: USING GOOGLE CHROME (EASIEST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open Google Chrome
2. Press Ctrl+O (Open File)
3. Navigate to: AI_CALLING_AGENT_COMPLETE_GUIDE.html
4. Click "Open"
5. Press Ctrl+P (Print dialog opens)
6. Scroll down and select "Save as PDF" instead of printer
7. Click "Save"
8. Choose your download location
9. Your PDF is ready! ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPTION B: USING MICROSOFT EDGE (EQUALLY EASY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open Microsoft Edge
2. Press Ctrl+O (Open File)
3. Navigate to: AI_CALLING_AGENT_COMPLETE_GUIDE.html
4. Click "Open"
5. Press Ctrl+P (Print dialog opens)
6. Select "Print to PDF" from printer dropdown
7. Click "Print"
8. Choose location and save! ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPTION C: USING FIREFOX (ALSO WORKS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open Firefox
2. Press Ctrl+O (Open File)
3. Navigate to: AI_CALLING_AGENT_COMPLETE_GUIDE.html
4. Click "Open"
5. Press Ctrl+P (Print dialog opens)
6. Select "Print to File" 
7. Choose PDF format
8. Save the file! ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPTION D: ONLINE CONVERTER (NO SOFTWARE NEEDED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Method 1 - CloudConvert:
  1. Visit: https://cloudconvert.com/html-to-pdf
  2. Click "Select File"
  3. Choose: AI_CALLING_AGENT_COMPLETE_GUIDE.html
  4. Click "Convert"
  5. Download your PDF ✅

Method 2 - Zamzar:
  1. Visit: https://www.zamzar.com/convert/html-to-pdf/
  2. Upload the HTML file
  3. Click "Convert Now"
  4. Download! ✅

Method 3 - Online-Convert:
  1. Visit: https://document.online-convert.com/convert-to-pdf
  2. Upload HTML file
  3. Click "Convert"
  4. Download PDF ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPTION E: ADVANCED - US WKHTMLTOPDF (Automated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Windows Installation:
  1. Download from: https://wkhtmltopdf.org/
  2. Run the installer
  3. Add to PATH:
     - Right-click "This PC" → Properties
     - Click "Advanced system settings"
     - Click "Environment Variables"
     - Under "System variables", find "Path"
     - Click "Edit" → "New"
     - Add: C:\\Program Files\\wkhtmltopdf\\bin
     - Click OK to save
  4. Restart terminal/command prompt
  5. Run this command:
     wkhtmltopdf AI_CALLING_AGENT_COMPLETE_GUIDE.html AI_CALLING_AGENT_COMPLETE_GUIDE.pdf
  6. PDF created! ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDED: Use Option A (Google Chrome Print to PDF) - It's the easiest! ✅

Need help? All options include automatic formatting and pagination.

`;

  fs.writeFileSync(
    path.join(__dirname, 'HOW_TO_CONVERT_TO_PDF.txt'),
    guide
  );
  
  console.log(guide);
  console.log('\n📄 Quick reference saved to: HOW_TO_CONVERT_TO_PDF.txt');
}

convertHTMLToPDF();
