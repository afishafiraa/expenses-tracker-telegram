import 'dotenv/config';
import { google } from 'googleapis';

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

console.log('🔍 Comprehensive Google Cloud Permissions Check\n');
console.log('=' .repeat(60));

async function checkPermissions() {
  try {
    // Step 1: Create auth
    const auth = new google.auth.JWT({
      email: CLIENT_EMAIL,
      key: PRIVATE_KEY,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    });

    console.log('📧 Service Account:', CLIENT_EMAIL);
    console.log('');

    // Step 2: Get access token
    console.log('1️⃣ Testing Authentication...');
    const tokenResponse = await auth.getAccessToken();

    if (tokenResponse.token) {
      console.log('   ✅ Authentication successful');
      console.log('   Token obtained:', tokenResponse.token.substring(0, 30) + '...\n');
    } else {
      console.log('   ❌ Failed to get access token\n');
      return;
    }

    // Step 3: Check enabled APIs using Service Usage API
    console.log('2️⃣ Checking Enabled APIs...');
    const serviceUsage = google.serviceusage({ version: 'v1', auth });

    const projectId = 'billnot';
    const services = [
      'sheets.googleapis.com',
      'drive.googleapis.com',
    ];

    for (const service of services) {
      try {
        const response = await serviceUsage.services.get({
          name: `projects/${projectId}/services/${service}`,
        });

        const state = response.data.state;
        if (state === 'ENABLED') {
          console.log(`   ✅ ${service} is ENABLED`);
        } else {
          console.log(`   ❌ ${service} is ${state}`);
        }
      } catch (err) {
        console.log(`   ⚠️  ${service} - Cannot check (might need Service Usage API enabled)`);
      }
    }
    console.log('');

    // Step 4: Test Sheets API read permission
    console.log('3️⃣ Testing Sheets API Read Permission...');
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Try to get spreadsheet metadata (read-only test)
      const testSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

      if (testSpreadsheetId) {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: testSpreadsheetId,
        });
        console.log(`   ✅ Can READ spreadsheet: ${response.data.properties?.title}`);
      } else {
        console.log('   ⚠️  No GOOGLE_SHEETS_SPREADSHEET_ID in .env to test read');
      }
    } catch (err) {
      console.log('   ❌ Cannot read spreadsheet:', err.message);
    }
    console.log('');

    // Step 5: Test Sheets API write permission
    console.log('4️⃣ Testing Sheets API Write Permission...');
    try {
      const testSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

      if (testSpreadsheetId) {
        // Try to add a test value (will rollback)
        await sheets.spreadsheets.values.append({
          spreadsheetId: testSpreadsheetId,
          range: 'Sheet1!A1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [['Test from BillNot - ' + new Date().toISOString()]],
          },
        });
        console.log('   ✅ Can WRITE to existing spreadsheet');
      } else {
        console.log('   ⚠️  No GOOGLE_SHEETS_SPREADSHEET_ID in .env to test write');
      }
    } catch (err) {
      console.log('   ❌ Cannot write to spreadsheet:', err.message);
    }
    console.log('');

    // Step 6: Test Sheets API create permission
    console.log('5️⃣ Testing Sheets API Create Permission...');
    try {
      const createResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: 'BillNot Permission Test - ' + new Date().toISOString(),
          },
        },
      });
      console.log('   ✅ Can CREATE new spreadsheets');
      console.log('   Created:', createResponse.data.spreadsheetUrl);
    } catch (err) {
      console.log('   ❌ Cannot create spreadsheets');
      console.log('   Error:', err.message);
      console.log('   Code:', err.code);
    }
    console.log('');

    // Final recommendations
    console.log('=' .repeat(60));
    console.log('📋 DIAGNOSIS:\n');
    console.log('If CREATE fails but READ/WRITE work:');
    console.log('→ Service account CAN access existing shared files');
    console.log('→ Service account CANNOT create new files');
    console.log('');
    console.log('SOLUTION:');
    console.log('1. Manually create ONE spreadsheet in Google Sheets');
    console.log('2. Share it with:', CLIENT_EMAIL);
    console.log('3. Give "Editor" permission');
    console.log('4. Copy the spreadsheet ID to GOOGLE_SHEETS_SPREADSHEET_ID');
    console.log('5. Bot will add new sheets/tabs to that spreadsheet');

  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    console.log('\nFull error:', error);
  }
}

checkPermissions();
