import 'dotenv/config';
import { google } from 'googleapis';
import type { BillEntry } from '../types.js';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL!;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')!;

export class SheetsService {
  private sheets;

  constructor() {
    const auth = new google.auth.JWT({
      email: CLIENT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  private getMonthlySheetName(): string {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  async ensureMonthlySheetExists(): Promise<string> {
    const sheetName = this.getMonthlySheetName();

    try {
      // Check if sheet exists
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      });

      const sheetExists = spreadsheet.data.sheets?.some(
        (sheet) => sheet.properties?.title === sheetName
      );

      if (!sheetExists) {
        console.log(`📝 Creating new sheet: ${sheetName}`);

        // Create new sheet
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });

        // Write headers
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A1:J1`,
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

        console.log(`✅ Sheet "${sheetName}" created with headers`);
      }

      return sheetName;
    } catch (error) {
      console.error('❌ Failed to ensure monthly sheet:', (error as Error).message);
      throw error;
    }
  }

  async appendBill(bill: BillEntry): Promise<void> {
    try {
      const sheetName = await this.ensureMonthlySheetExists();

      // Get current row count to calculate cumulative price formula
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:A`,
      });

      const rowCount = response.data.values?.length || 1;
      const nextRow = rowCount + 1;

      // Cumulative formula: if first data row, use effectivePrice, else add to previous cumulative
      const cumulativeFormula = nextRow === 2
        ? `=H${nextRow}`
        : `=I${nextRow - 1}+H${nextRow}`;

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              bill.date,
              bill.vendor,
              bill.item,
              bill.category,
              bill.amount,
              bill.currency,
              bill.taxRate || 0,
              bill.paymentMethod,
              bill.description,
              bill.amountInDefaultCurrency || bill.amount,
              cumulativeFormula,
              bill.source,
            ],
          ],
        },
      });

      console.log(`✅ Bill appended to sheet "${sheetName}"`);
    } catch (error) {
      console.error('❌ Failed to append bill:', (error as Error).message);
      throw error;
    }
  }

  async getMonthlyTotal(): Promise<{ beforeTax: number; afterTax: number }> {
    try {
      const sheetName = this.getMonthlySheetName();

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!E2:H`,
      });

      const values = response.data.values || [];

      let beforeTax = 0;
      let afterTax = 0;

      for (const row of values) {
        const price = parseFloat(row[0]) || 0; // Column E (Price)
        const effectivePrice = parseFloat(row[3]) || 0; // Column H (Effective Price)
        beforeTax += price;
        afterTax += effectivePrice;
      }

      return { beforeTax, afterTax };
    } catch (error) {
      console.error('❌ Failed to get monthly total:', (error as Error).message);
      return { beforeTax: 0, afterTax: 0 };
    }
  }
}
