/**
 * Multi-language response normalization
 * Supports: English, Japanese, Indonesian, Vietnamese
 */

export type YesNoResponse = 'yes' | 'no' | 'unknown';
export type TaxTimingResponse = 'before' | 'after' | 'unknown';

/**
 * Normalize Yes/No responses across multiple languages
 */
export function normalizeYesNo(input: string): YesNoResponse {
  const cleaned = input.toLowerCase().trim();

  const exactYes = [
    'yes', 'y', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'correct',
    'はい', 'hai', 'うん', 'un', 'そう', 'sou', 'そうです', 'soudesu',
    'ええ', 'ee', 'オッケー', 'okkē', 'いいえす',
    'ya', 'iya', 'iye', 'yoi', 'betul', 'benar', 'oke', 'baik',
    'có', 'co', 'vâng', 'vang', 'đúng', 'dung', 'được', 'duoc',
  ];

  const exactNo = [
    'no', 'n', 'nah', 'nope', 'not', 'negative',
    'いいえ', 'iie', 'いや', 'iya', 'ううん', 'uun', 'ちがう', 'chigau',
    '違う', 'いえ', 'ie', 'ノー', 'no-',
    'tidak', 'tak', 'nggak', 'enggak', 'gak', 'bukan', 'ndak',
    'không', 'khong', 'không có', 'khong co', 'ko', 'hok',
  ];

  if (exactYes.includes(cleaned)) return 'yes';
  if (exactNo.includes(cleaned)) return 'no';

  return 'unknown';
}

/**
 * Normalize Before/After tax responses
 */
export function normalizeTaxTiming(input: string): TaxTimingResponse {
  const cleaned = input.toLowerCase().trim();

  // Before tax patterns
  const beforePatterns = [
    // English
    'before', 'before tax', 'pre-tax', 'pretax', 'exclude', 'excluding',
    'not include', 'without', 'gross',
    // Japanese
    '税抜', 'zeinuki', '税別', 'zeibetsu', '前', 'mae', 'まえ',
    '税抜き', 'zeinuki', '税込前', 'zeikomi mae',
    // Indonesian
    'sebelum', 'sebelum pajak', 'belum pajak', 'belum termasuk',
    'belom', 'tanpa pajak', 'kotor',
    // Vietnamese
    'trước', 'truoc', 'trước thuế', 'truoc thue', 'chưa có thuế',
    'chua co thue', 'chưa thuế', 'chua thue',
  ];

  // After tax patterns
  const afterPatterns = [
    // English
    'after', 'after tax', 'post-tax', 'posttax', 'include', 'including',
    'included', 'with', 'total', 'final', 'net',
    // Japanese
    '税込', 'zeikomi', '税込み', 'zeikommi', '後', 'ato', 'あと',
    '込み', 'komi', '込', 'トータル', 'to-taru', '合計', 'goukei',
    // Indonesian
    'sesudah', 'setelah', 'sudah pajak', 'termasuk', 'termasuk pajak',
    'sama pajak', 'total', 'nett', 'bersih',
    // Vietnamese
    'sau', 'sau thuế', 'sau thue', 'đã có thuế', 'da co thue',
    'có thuế', 'co thue', 'tổng', 'tong', 'cuối', 'cuoi',
  ];

  if (beforePatterns.some(pattern => cleaned.includes(pattern))) {
    return 'before';
  }

  if (afterPatterns.some(pattern => cleaned.includes(pattern))) {
    return 'after';
  }

  return 'unknown';
}

/**
 * Check if user wants to cancel/skip current action
 */
export function isCancelIntent(input: string): boolean {
  const cleaned = input.toLowerCase().trim();

  const cancelPatterns = [
    // English
    'cancel', 'skip', 'stop', 'quit', 'exit', 'back', 'nevermind', 'never mind',
    // Japanese
    'キャンセル', 'kyanseru', 'やめ', 'yame', 'やめる', 'yameru',
    '中止', 'chuushi', 'スキップ', 'sukippu', '戻る', 'modoru',
    // Indonesian
    'batal', 'batalkan', 'lewat', 'lewati',
    'gak jadi', 'nggak jadi', 'kembali',
    // Vietnamese
    'hủy', 'huy', 'bỏ qua', 'bo qua', 'thôi', 'thoi',
    'dừng', 'dung', 'quay lại', 'quay lai',
  ];

  return cancelPatterns.includes(cleaned);
}

/**
 * Generate multi-language response message
 */
export function getMultiLangMessage(type: 'yes_no' | 'tax_timing' | 'invalid'): string {
  switch (type) {
    case 'yes_no':
      return `Please answer:
• Yes / No`;

    case 'tax_timing':
      return `Is the price:
1️⃣ Before tax (税抜 / Sebelum pajak / Trước thuế)
2️⃣ After tax (税込 / Termasuk pajak / Sau thuế)

Please answer: Before / After`;

    case 'invalid':
      return `Sorry, I didn't understand that. Please try again or type "cancel" to skip.`;

    default:
      return 'Please answer the question.';
  }
}
