/** Espelho de shared/google-review.ts (tsc do server não inclui ../shared). */
export const GOOGLE_REVIEW_LOJA_URL =
  "https://search.google.com/local/writereview?placeid=ChIJrcvudQAxCQcRkpS8xkTbkg0";

export const GOOGLE_REVIEW_ASK_TEXT = `Se puder e quiser, uma avaliação no Google ajuda muito a loja:\n${GOOGLE_REVIEW_LOJA_URL}`;

export const GOOGLE_REVIEW_ASK_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
