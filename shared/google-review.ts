/** Formulário “Escrever avaliação” da Loja GEEKS (Place ID). */
export const GOOGLE_REVIEW_LOJA_URL =
  "https://search.google.com/local/writereview?placeid=ChIJrcvudQAxCQcRkpS8xkTbkg0";

/** Frase educada para WhatsApp / SMS (opcional, sem pressão). */
export const GOOGLE_REVIEW_ASK_TEXT = `Se puder e quiser, uma avaliação no Google ajuda muito a loja:\n${GOOGLE_REVIEW_LOJA_URL}`;

/** Cooldown entre pedidos automáticos (ms). */
export const GOOGLE_REVIEW_ASK_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
