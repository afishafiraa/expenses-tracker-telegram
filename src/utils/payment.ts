// Payment method keywords → normalized name
const PAYMENT_MAP: Array<{ keywords: string[]; name: string }> = [
  // Card
  { keywords: ['credit', 'credit card', 'debit', 'debit card', 'card', 'visa', 'mastercard', 'jcb', 'amex'], name: 'Card' },

  // Cash
  { keywords: ['cash', 'money', 'tunai', 'genkin', '現金'], name: 'Cash' },

  // Japan payment tools
  { keywords: ['paypay', 'pay pay'], name: 'PayPay' },
  { keywords: ['suica'], name: 'Suica' },
  { keywords: ['pasmo'], name: 'PASMO' },
  { keywords: ['icoca'], name: 'ICOCA' },
  { keywords: ['nanaco'], name: 'nanaco' },
  { keywords: ['waon'], name: 'WAON' },
  { keywords: ['rakuten pay', 'rakuten'], name: 'Rakuten Pay' },
  { keywords: ['line pay', 'linepay'], name: 'LINE Pay' },
  { keywords: ['merpay', 'mer pay'], name: 'merPay' },
  { keywords: ['d barai', 'd払い', 'd-barai', 'docomo'], name: 'd Barai' },
  { keywords: ['au pay', 'aupay'], name: 'au PAY' },
  { keywords: ['apple pay', 'applepay'], name: 'Apple Pay' },
  { keywords: ['google pay', 'googlepay', 'gpay'], name: 'Google Pay' },
  { keywords: ['quicpay', 'quic pay'], name: 'QUICPay' },
  { keywords: ['id', 'id決済'], name: 'iD' },
  { keywords: ['edy'], name: 'Edy' },

  // Southeast Asia payment tools
  { keywords: ['grabpay', 'grab pay'], name: 'GrabPay' },
  { keywords: ['gopay', 'go pay'], name: 'GoPay' },
  { keywords: ['ovo'], name: 'OVO' },
  { keywords: ['dana'], name: 'DANA' },
  { keywords: ['shopeepay', 'shopee pay'], name: 'ShopeePay' },
  { keywords: ['truemoney', 'true money'], name: 'TrueMoney' },
  { keywords: ['promptpay', 'prompt pay'], name: 'PromptPay' },

  // General
  { keywords: ['qr', 'qr code', 'qr pay', 'qris'], name: 'QR' },
  { keywords: ['transfer', 'bank transfer', 'wire', 'bank'], name: 'Transfer' },
  { keywords: ['alipay', 'ali pay'], name: 'Alipay' },
  { keywords: ['wechat', 'wechat pay', 'wechatpay'], name: 'WeChat Pay' },
];

/**
 * Normalize user payment input to a standard payment method name.
 * Returns only the tool/method name.
 */
export function normalizePaymentMethod(input: string): string {
  const lower = input.toLowerCase().trim();

  for (const { keywords, name } of PAYMENT_MAP) {
    for (const keyword of keywords) {
      if (lower === keyword || lower.includes(keyword)) {
        return name;
      }
    }
  }

  // If no match, capitalize first letter and return as-is
  return input.trim().charAt(0).toUpperCase() + input.trim().slice(1);
}
