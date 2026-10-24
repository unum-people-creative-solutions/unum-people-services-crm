"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Inbox, Bell, Columns3, MessageCircle, Receipt, UserPlus } from "lucide-react";
import { redirectToHostedUI } from "@/lib/pkce";

const TERMOS_DE_USO_URL = "https://unumpeople.com.br/termos/9824049f-1b1b-4391-b271-53230c69f9b9/v2";

export default function LandingPage() {
  useEffect(() => {
    // Detecta se o app está rodando em modo standalone (PWA/TWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone
      || document.referrer.includes('android-app://');

    if (isStandalone) {
      void redirectToHostedUI("/");
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <nav className="border-b border-support-grey/10 sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/images/logo_simbolo.webp" alt="Unum People Símbolo" width={40} height={40} className="h-8 w-auto" />
            <Image src="/images/logo_texto.webp" alt="Unum People" width={160} height={32} className="h-8 w-auto" />
          </div>
          <button
            type="button"
            onClick={() => redirectToHostedUI("/")}
            className="bg-brand-orange text-white px-6 py-2.5 rounded-full font-bold text-sm hover:brightness-110 transition-all shadow-md"
          >
            Entrar
          </button>
        </div>
      </nav>

      <header className="py-24 lg:py-40 px-4 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm font-black text-brand-orange uppercase tracking-[0.3em] mb-3">
            CRM da Unum People
          </p>
          <h1 className="text-5xl md:text-7xl font-black text-brand-blue leading-[1.05] mb-8 tracking-tight">
            Cada contato da sua página, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-blue to-brand-orange">num lugar só</span>.
          </h1>
          <p className="text-xl md:text-2xl text-support-grey font-medium leading-relaxed mb-12 max-w-3xl mx-auto">
            Quem preenche o formulário da sua página entra direto no CRM, e o seu celular avisa na hora. Você acompanha cada pessoa até virar cliente.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => redirectToHostedUI("/")}
              className="w-full sm:w-auto bg-brand-orange text-white px-12 py-5 rounded-2xl font-black text-xl hover:brightness-110 transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              Entrar
            </button>
            <a
              href="https://unumpeople.app/crm"
              className="w-full sm:w-auto text-support-grey font-bold text-lg hover:text-brand-blue transition-colors"
            >
              Ainda não é cliente? Conheça os planos
            </a>
          </div>
        </div>
      </header>

      <section className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-black text-brand-blue tracking-tight">O que você faz no CRM</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Inbox className="text-brand-orange" aria-hidden="true" />}
              title="Contato direto da página"
              description="Quem preenche o formulário da sua página aparece em Novos Leads, sem você copiar nada."
            />
            <FeatureCard
              icon={<Bell className="text-brand-blue" aria-hidden="true" />}
              title="Aviso no celular"
              description="O CRM avisa quando chega contato. No iPhone, o aviso só funciona com o CRM adicionado à tela de início."
            />
            <FeatureCard
              icon={<Columns3 className="text-brand-purple" aria-hidden="true" />}
              title="Cada pessoa na sua etapa"
              description="Arraste o contato entre Novos Leads, Em Atendimento, Agendados e Ganho e saiba quem está esperando resposta."
            />
            <FeatureCard
              icon={<MessageCircle className="text-brand-orange" aria-hidden="true" />}
              title="WhatsApp com um toque"
              description="Abra a conversa com o contato direto do cartão dele, sem salvar o número."
            />
            <FeatureCard
              icon={<Receipt className="text-brand-blue" aria-hidden="true" />}
              title="Vendas de cada cliente"
              description="Registre cada venda e veja quanto cada cliente já comprou. Baixe tudo numa planilha quando precisar."
            />
            <FeatureCard
              icon={<UserPlus className="text-brand-purple" aria-hidden="true" />}
              title="Também quem chegou por fora"
              description="Cadastre você mesmo quem veio por indicação ou telefone."
            />
          </div>
        </div>
      </section>

      <section className="py-24 bg-brand-blue text-white">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-black mb-8 tracking-tight">Ainda não usa o CRM?</h2>
          <p className="text-xl md:text-2xl font-medium leading-relaxed mb-12 max-w-3xl mx-auto">
            Ele vem junto com a página e o blog, num dos planos da Unum People. Você monta a página e vê como fica antes de pagar.
          </p>
          <div className="flex flex-col items-center justify-center gap-5">
            <a
              href="https://unumpeople.app/crm"
              className="w-full sm:w-auto bg-brand-orange text-white px-12 py-5 rounded-2xl font-black text-xl hover:brightness-110 transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              Conhecer os planos
            </a>
            <div className="flex items-center justify-center gap-2">
              <span className="font-bold text-lg">Já é cliente?</span>
              <button
                type="button"
                onClick={() => redirectToHostedUI("/")}
                className="font-bold text-lg hover:text-brand-orange transition-colors"
              >
                Entrar
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white text-brand-blue py-20 border-t border-support-grey/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-12 border-b border-support-grey/10 pb-16 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-8">
                <Image src="/images/logo_texto.webp" alt="Unum People" width={240} height={48} className="h-12 w-auto" />
              </div>
              <p className="text-support-grey font-medium max-w-sm">
                O caminho mais curto entre você e o seu cliente.
              </p>
            </div>
            <div className="flex flex-wrap gap-10 md:justify-end text-sm">
              <button
                type="button"
                onClick={() => redirectToHostedUI("/")}
                className="font-bold hover:text-brand-orange transition-colors"
              >
                Entrar
              </button>
              <Link href={TERMOS_DE_USO_URL} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand-orange transition-colors flex items-center gap-2">
                Termos de uso
              </Link>
              <Link href="https://unumpeople.com.br/privacidade" target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand-orange transition-colors flex items-center gap-2">
                Privacidade
              </Link>
            </div>
          </div>
          <div className="text-center text-support-grey/50 text-[10px] font-black uppercase tracking-[0.4em]">
            © {new Date().getFullYear()} Unum People - Creative Solutions. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-white p-10 rounded-2xl border border-support-grey/10 shadow-sm">
      <div className="bg-gray-50 border border-support-grey/5 w-16 h-16 rounded-xl flex items-center justify-center mb-8">
        {icon}
      </div>
      <h3 className="text-2xl font-black text-brand-blue mb-4 tracking-tight">{title}</h3>
      <p className="text-support-grey font-medium leading-relaxed">{description}</p>
    </div>
  );
}
