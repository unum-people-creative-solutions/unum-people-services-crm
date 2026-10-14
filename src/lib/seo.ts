import type { Metadata } from "next";

// Telas que exigem login: o Google não deve indexá-las nem seguir os links
// delas (quem não está logado é mandado para o login do Cognito).
export const naoIndexar: Metadata = {
  robots: { index: false, follow: false },
};
