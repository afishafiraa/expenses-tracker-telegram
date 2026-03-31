/**
 * Extract vendor/merchant name from user input
 * Removes common prepositions and particles
 */
export function extractVendorName(input: string): string {
  let cleaned = input.trim();

  // Remove common English prepositions at the start
  const englishPrepositions = [
    /^at\s+/i,
    /^in\s+/i,
    /^on\s+/i,
    /^from\s+/i,
    /^to\s+/i,
  ];

  for (const pattern of englishPrepositions) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove common Japanese particles
  // で (de - at/in/by)
  // に (ni - at/in/to)
  // へ (e - to/towards)
  // の (no - of/possessive)
  const japaneseParticles = [
    /で$/,      // at the end: "コンビニで" -> "コンビニ"
    /^で/,      // at the start: "でコンビニ" -> "コンビニ"
    /\sで$/,    // with space: "7-11 で" -> "7-11"
    /^で\s/,    // with space: "で 7-11" -> "7-11"
    /に$/,
    /^に/,
    /\sに$/,
    /^に\s/,
    /へ$/,
    /^へ/,
    /\sへ$/,
    /^へ\s/,
  ];

  for (const pattern of japaneseParticles) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Trim again after removal
  cleaned = cleaned.trim();

  // Capitalize first letter if it's English
  if (cleaned.length > 0 && /^[a-z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned || input; // Return original if somehow empty
}
