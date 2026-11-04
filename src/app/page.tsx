import { naoIndexar } from "@/lib/seo";
import EntradaCrm from "./EntradaCrm";

// crm-raiz-vai-ao-login: a primeira tela do CRM é o login. A raiz só decide o
// destino e pede para não ser indexada.
export const metadata = naoIndexar;

export default function Raiz() {
  return <EntradaCrm />;
}
