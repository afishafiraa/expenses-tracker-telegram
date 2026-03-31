import 'dotenv/config';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

async function testGoogleSheets(): Promise<void> {
  console.log('🧪 Testing Google Sheets API...\n');

  if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Missing credentials in .env file');
    return;
  }

  try {
    // Authenticate
    const auth = new google.auth.JWT({
      email: CLIENT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Test 1: Read spreadsheet metadata
    console.log('📋 Reading spreadsheet info...');
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    console.log(`✅ Connected to: "${metadata.data.properties?.title}"`);
    console.log(`   Spreadsheet ID: ${SPREADSHEET_ID}`);

    // Test 2: Create a test sheet tab for current month
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    console.log(`\n📝 Creating test sheet: "${currentMonth}"...`);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: currentMonth,
              },
            },
          },
        ],
      },
    });

    console.log(`✅ Sheet "${currentMonth}" created!`);

    // Test 3: Write headers
    console.log('\n📝 Writing headers...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${currentMonth}!A1:J1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          [
            'Date',
            'Vendor',
            'Item',
            'Category',
            'Price',
            'Payment Method',
            'Description',
            'Effective Price',
            'Cumulative Price',
            'Source',
          ],
        ],
      },
    });

    console.log('✅ Headers written!');

    // Test 4: Write a sample row
    console.log('\n📝 Writing sample bill...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${currentMonth}!A2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            '2026-03-24',
            'Test Vendor',
            'Test Item',
            'Food',
            100,
            'Cash',
            'Test expense',
            100,
            '=H2', // Formula for cumulative (first row = effective price)
            'text',
          ],
        ],
      },
    });

    console.log('✅ Sample bill written!');
    console.log(`\n🎉 Success! Check your spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);

  } catch (error) {
    console.error('❌ Failed:', (error as Error).message);
    if ((error as any).response?.data) {
      console.error('Details:', (error as any).response.data);
    }
  }
}

testGoogleSheets();
