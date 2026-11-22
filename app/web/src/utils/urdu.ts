/** Arabic-script Unicode ranges (covers Urdu + Arabic + extended characters). */
const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * True when the text contains Arabic/Urdu script characters.
 * Used to switch names (businesses, accounts, customers…) to the
 * standard Urdu Noori Nastaleeq font automatically.
 */
export function isUrdu(text: string | null | undefined): boolean {
  return !!text && ARABIC_SCRIPT.test(text);
}

/** Class name for mixed/Urdu text so Urdu glyphs render in Noori Nastaleeq. */
export function urduClass(text: string | null | undefined): string {
  return isUrdu(text) ? "urdu" : "";
}

/**
 * Spread onto text inputs holding names. While typing, the input switches to
 * Urdu Noori Nastaleeq as soon as the value contains Urdu script and back to
 * Latin when it doesn't, with RTL direction for readability.
 */
export const urduInputProps = {
  onInput: (event: { currentTarget: HTMLInputElement }) => {
    const el = event.currentTarget;
    const urdu = isUrdu(el.value);
    el.classList.toggle("urdu", urdu);
    el.dir = urdu ? "rtl" : "";
  },
};
