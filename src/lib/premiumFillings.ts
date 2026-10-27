/**
 * H5: build the { fillingSlug: premiumSizeValue } map the server uses to
 * price premium fillings (create_pending_order_secure → price_premium_fillings).
 * Only selected premium fillings with a chosen size are included.
 */
export function buildPremiumFillingSizes(
  selectedFillings: readonly string[],
  fillings: ReadonlyArray<{ value: string; premium?: boolean }>,
  chosenSizes: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const value of selectedFillings) {
    const f = fillings.find((x) => x.value === value);
    const size = chosenSizes[value];
    if (f?.premium && size) out[value] = size;
  }
  return out;
}
