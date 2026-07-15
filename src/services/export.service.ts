import 'dotenv/config';
import ExcelJS from 'exceljs';
import type { DatabaseService } from './database.service.js';
import type { Currency } from '../types.js';
import { roundAmount } from '../utils/currency.js';
import * as fs from 'fs';
import * as path from 'path';

export class ExportService {
  private database: DatabaseService;

  constructor(database: DatabaseService) {
    this.database = database;
  }

  /**
   * Get current quarter info
   */
  private getQuarterInfo(date: Date): { quarter: number; startMonth: number; endMonth: number } {
    const month = date.getMonth() + 1; // 1-12
    let quarter: number;
    let startMonth: number;
    let endMonth: number;

    if (month >= 1 && month <= 3) {
      quarter = 1;
      startMonth = 1;
      endMonth = 3;
    } else if (month >= 4 && month <= 6) {
      quarter = 2;
      startMonth = 4;
      endMonth = 6;
    } else if (month >= 7 && month <= 9) {
      quarter = 3;
      startMonth = 7;
      endMonth = 9;
    } else {
      quarter = 4;
      startMonth = 10;
      endMonth = 12;
    }

    return { quarter, startMonth, endMonth };
  }

  /**
   * Export user's quarterly expenses to Excel file
   */
  async exportToExcel(
    userId: string,
    userName: string,
    userCurrency: string,
    targetQuarter?: number,
    targetYear?: number
  ): Promise<{ filePath: string; quarterInfo: string }> {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const currentQuarterInfo = this.getQuarterInfo(now);

      // Use target quarter/year if specified, otherwise current
      const year = targetYear || currentYear;
      const quarter = targetQuarter || currentQuarterInfo.quarter;
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = quarter * 3;

      // For current quarter, limit to current month; for past quarters, include all months
      const isCurrentQuarter = year === currentYear && quarter === currentQuarterInfo.quarter;
      const maxMonth = isCurrentQuarter ? Math.min(endMonth, currentMonth) : endMonth;

      console.log(`📊 Exporting Q${quarter} expenses for user ${userId}...`);

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'BillNot';
      workbook.created = new Date();

      let totalSheets = 0;
      let totalExpenses = 0;

      // Generate sheets for each month in the quarter (up to current month for current quarter)
      for (let month = startMonth; month <= maxMonth; month++) {
        const expenses = await this.database.getMonthlyExpenses(userId, year, month);

        // Skip months with no expenses
        if (expenses.length === 0) {
          continue;
        }

        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
        const sheet = workbook.addWorksheet(monthName);

        // Headers
        const headers = [
          'Date',
          'Merchant',
          'Item',
          'Category',
          'Original Price',
          `Price (${userCurrency})`,
          'Payment Method',
          'Notes',
          `Effective Price (${userCurrency})`,
          'Cumulative Total',
        ];

        const headerRow = sheet.addRow(headers);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Data rows with cumulative total
        let cumulativeTotal = 0;

        expenses.forEach((exp) => {
          // Original price (if currency is different from user's default)
          const originalPrice = exp.currency !== userCurrency
            ? `${roundAmount(Number(exp.amount), exp.currency as Currency)} ${exp.currency}`
            : '';

          // Pre-tax base price, converted to the user's default currency.
          const basePriceInDefault = Number(exp.amount) * Number(exp.exchange_rate || 1);

          // Effective price = final tax-inclusive amount, already computed and
          // stored at save time as amount_in_default_currency. Do NOT re-apply
          // tax here — that double-counted it (see BUG-01).
          const effectivePrice = Number(exp.amount_in_default_currency);

          // Cumulative total
          cumulativeTotal += effectivePrice;

          // Round per the default currency's convention (zero-decimal → whole
          // units; others keep cents) instead of always ceiling (see PR review).
          const cur = userCurrency as Currency;
          sheet.addRow([
            exp.date,
            exp.vendor,
            exp.item,
            exp.category,
            originalPrice,
            roundAmount(basePriceInDefault, cur),
            exp.payment_method || 'Unknown',
            exp.description || '',
            roundAmount(effectivePrice, cur),
            roundAmount(cumulativeTotal, cur),
          ]);
        });

        // Column widths
        sheet.columns = [
          { width: 12 },  // Date
          { width: 20 },  // Merchant
          { width: 20 },  // Item
          { width: 15 },  // Category
          { width: 15 },  // Original Price
          { width: 15 },  // Price (JPY)
          { width: 18 },  // Payment Method
          { width: 30 },  // Notes
          { width: 18 },  // Effective Price
          { width: 18 },  // Cumulative Total
        ];

        // Add borders and alignment
        sheet.eachRow((row, rowNumber) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };

            // Align numbers to right
            if (rowNumber > 1 && [5, 6, 9, 10].includes(Number(cell.col))) {
              cell.alignment = { horizontal: 'right' };
            }
          });
        });

        totalSheets++;
        totalExpenses += expenses.length;
      }

      if (totalSheets === 0) {
        throw new Error('No expenses found for this quarter');
      }

      // Generate filename
      const filename = `${userName.replace(/\s+/g, '_')}_Q${quarter}_${year}.xlsx`;
      const outputPath = path.join(process.cwd(), 'exports', filename);

      // Ensure exports directory exists
      const exportsDir = path.join(process.cwd(), 'exports');
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      await workbook.xlsx.writeFile(outputPath);

      const quarterInfo = `Q${quarter} ${year} (${this.getMonthName(startMonth)} - ${this.getMonthName(endMonth)})`;

      console.log(`✅ Excel file created: ${outputPath} (${totalSheets} sheets, ${totalExpenses} expenses)`);

      return { filePath: outputPath, quarterInfo };
    } catch (error) {
      console.error('❌ Error exporting to Excel:', error);
      throw error;
    }
  }

  private getMonthName(month: number): string {
    return new Date(2000, month - 1).toLocaleString('default', { month: 'short' });
  }
}
