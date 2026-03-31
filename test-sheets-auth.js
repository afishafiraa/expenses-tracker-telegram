import 'dotenv/config';
import { google } from 'googleapis';

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

console.log('🔍 Testing Google Sheets API Authentication...\n');

console.log('📧 Service Account Email:', CLIENT_EMAIL);
console.log('🔑 Private Key (first 50 chars):', PRIVATE_KEY?.substring(0, 50) + '...\n');

async function testAuth() {
  try {
    // Create auth client
    const auth = new google.auth.JWT({
      email: CLIENT_EMAIL,
      key: PRIVATE_KEY,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });

    console.log('1️⃣ Creating JWT auth client... ✅\n');

    // Get access token
    console.log('2️⃣ Requesting access token...');
    const tokenResponse = await auth.getAccessToken();

    if (tokenResponse.token) {
      console.log('✅ Access token received!');
      console.log('   Token (first 20 chars):', tokenResponse.token.substring(0, 20) + '...\n');
    } else {
      console.log('❌ No access token received\n');
      return;
    }

    // Test creating a spreadsheet
    const sheets = google.sheets({ version: 'v4', auth });

    console.log('3️⃣ Attempting to create a test spreadsheet...');
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'BillNot Test - ' + new Date().toISOString(),
        },
        sheets: [
          {
            properties: {
              title: 'Test Sheet',
            },
          },
        ],
      },
    });

    console.log('✅ SUCCESS! Spreadsheet created!');
    console.log('   Spreadsheet ID:', createResponse.data.spreadsheetId);
    console.log('   URL:', `https://docs.google.com/spreadsheets/d/${createResponse.data.spreadsheetId}/edit`);
    console.log('\n🎉 All tests passed! Your service account has the correct permissions.\n');

  } catch (error) {
    console.log('\n❌ ERROR:', error.message);

    if (error.code === 403) {
      console.log('\n🔴 Permission Denied (403 Forbidden)\n');
      console.log('Possible causes:');
      console.log('1. Google Sheets API is not enabled');
      console.log('   → https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=billnot');
      console.log('');
      console.log('2. Google Drive API is not enabled');
      console.log('   → https://console.cloud.google.com/apis/library/drive.googleapis.com?project=billnot');
      console.log('');
      console.log('3. Service account lacks IAM permissions');
      console.log('   → https://console.cloud.google.com/iam-admin/iam?project=billnot');
      console.log('   → Make sure', CLIENT_EMAIL, 'has "Editor" role');
      console.log('');
      console.log('4. Wrong project selected in Google Cloud Console');
      console.log('   → Verify project "billnot" is selected');
    } else if (error.code === 401) {
      console.log('\n🔴 Authentication Failed (401 Unauthorized)\n');
      console.log('The service account credentials are invalid.');
      console.log('Download a fresh JSON key from:');
      console.log('https://console.cloud.google.com/iam-admin/serviceaccounts?project=billnot');
    } else {
      console.log('\nFull error:', error);
    }
  }
}

testAuth();
