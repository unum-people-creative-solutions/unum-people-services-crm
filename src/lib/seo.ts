import type { Metadata } from "next";

// Telas que exigem login e o retorno do login (/auth/callback): o Google não
// deve indexá-las nem seguir os links delas.
export const naoIndexar: Metadata = {
  robots: { index: false, follow: false },
};
