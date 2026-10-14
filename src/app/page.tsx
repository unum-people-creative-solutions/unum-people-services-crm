"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle, BarChart3, Users, Zap, ShieldCheck, FileText, Smartphone } from "lucide-react";
import { redirectToHostedUI } from "@/lib/pkce";

const TERMOS_DE_USO_URL = "https://unumpeople.com.br/termos/9824049f-1b1b-4391-b271-53230c69f9b9/v1";
const POLITICA_PRIVACIDADE_URL = "https://unumpeople.com.br/termos/5558327c-6ee1-4549-8e1b-dc03fdae516a/v1";

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
      {/* Navigation */}
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
            Acessar Painel
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="py-24 lg:py-40 px-4 relative overflow-hidden bg-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-[0.03]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] bg-gradient-to-br from-brand-blue via-brand-purple to-brand-orange rounded-full blur-[120px]" />
        </div>
        
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-black text-brand-blue leading-[1.05] mb-8 tracking-tight">
            A tecnologia que conecta e <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-blue to-brand-orange">aproxima pessoas.</span>
          </h1>
          <p className="text-xl md:text-2xl text-support-grey font-medium leading-relaxed mb-12 max-w-3xl mx-auto">
            A tecnologia é a ponte invisível; a relação direta e o resultado prático são o foco. <br className="hidden md:block" />
            O Unum People CRM é o caminho mais curto entre você e o seu cliente.
          </p>
          <div className="flex flex-col sm:row items-center justify-center gap-5">
            <Link 
              href="https://unumpeople.app/#planos" 
              className="w-full sm:w-auto bg-brand-orange text-white px-12 py-5 rounded-2xl font-black text-xl hover:brightness-110 transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              Começar Agora
            </Link>
            <a 
              href="#features" 
              className="w-full sm:w-auto text-support-grey font-bold text-lg hover:text-brand-blue transition-colors flex items-center gap-2"
            >
              Ver Funcionalidades <Zap size={20} />
            </a>
          </div>
        </div>
      </header>

      {/* Principles Section */}
      <section className="py-24 bg-gray-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-sm font-black text-brand-purple uppercase tracking-[0.3em] mb-3">Princípios Norteadores</h2>
            <p className="text-3xl md:text-4xl font-black text-brand-blue tracking-tight">O que nos move adiante</p>
          </div>
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6">
            <ValueCard 
              title="Unidade" 
              description="Atuar em convergência, eliminando divisões entre o empreendedor e seu cliente." 
            />
            <ValueCard 
              title="Conexão" 
              description="Estabelecer pontes legítimas ligando propósitos e necessidades de forma direta." 
            />
            <ValueCard 
              title="Relacionamento" 
              description="Priorizar as pessoas antes das transações. Negócios são sustentados pela confiança." 
            />
            <ValueCard 
              title="Jornada" 
              description="Caminhar lado a lado, respeitando o tempo e apoiando o crescimento contínuo." 
            />
            <ValueCard 
              title="Transformação" 
              description="Gerar frutos reais e impacto positivo, permitindo que os negócios prosperem." 
            />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-sm font-black text-brand-orange uppercase tracking-[0.3em] mb-3">Ecossistema Unum People</h2>
            <p className="text-3xl md:text-5xl font-black text-brand-blue tracking-tight">Inteligência & Produtividade</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              icon={<BarChart3 className="text-brand-orange" />}
              title="Atribuição Google Ads"
              description="Rastreie a origem dos seus leads e entenda quais campanhas estão gerando vendas reais."
            />
            <FeatureCard 
              icon={<Users className="text-brand-purple" />}
              title="Kanban de Vendas"
              description="Visualize seu fluxo comercial de forma intuitiva, movendo leads entre etapas com facilidade."
            />
            <FeatureCard 
              icon={<Zap className="text-brand-blue" />}
              title="Ações Rápidas"
              description="Automatize contatos via WhatsApp e registre vendas com agilidade total."
            />
            <FeatureCard 
              icon={<Smartphone className="text-brand-orange" />}
              title="App Android"
              description="Receba notificações push instantâneas e tenha a gestão do funil na palma da mão."
            />
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-24 bg-brand-blue text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-orange rounded-full blur-[100px] -mr-48 -mt-48" />
        </div>
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-black mb-16 tracking-tight">Exclusivo Unum People CRM</h2>
          <div className="grid sm:grid-cols-2 gap-x-16 gap-y-10 text-left">
            <CheckItem text="Conformidade total com a LGPD e privacidade." />
            <CheckItem text="Interface mobile-first vanguardista." />
            <CheckItem text="Dashboards em tempo real com métricas de LTV." />
            <CheckItem text="Suporte dedicado ao marketing de performance." />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white text-brand-blue py-20 border-t border-support-grey/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-12 border-b border-support-grey/10 pb-16 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-8">
                <Image src="/images/logo_texto.webp" alt="Unum People" width={240} height={48} className="h-12 w-auto" />
              </div>
              <p className="text-support-grey font-medium max-w-sm">
                O caminho mais curto entre você e o seu cliente. <br />
                Tecnologia para conexões reais.
              </p>
            </div>
            <div className="flex flex-wrap gap-10 md:justify-end text-sm">
              <button
                type="button"
                onClick={() => redirectToHostedUI("/")}
                className="font-bold hover:text-brand-orange transition-colors"
              >
                Login
              </button>
              <Link href={TERMOS_DE_USO_URL} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand-orange transition-colors flex items-center gap-2">
                Termos de Uso
              </Link>
              <Link href={POLITICA_PRIVACIDADE_URL} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand-orange transition-colors flex items-center gap-2">
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

function ValueCard({ title, description }: { title: string, description: string }) {
  return (
    <div className="bg-white p-8 rounded-2xl border border-support-grey/10 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-xl hover:-translate-y-1 transition-all">
      <h3 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-br from-brand-blue to-brand-orange mb-4">{title}</h3>
      <p className="text-support-grey text-sm font-medium leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="group bg-white p-10 rounded-2xl border border-support-grey/10 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
      <div className="bg-gray-50 border border-support-grey/5 w-16 h-16 rounded-xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
        {icon}
      </div>
      <h3 className="text-2xl font-black text-brand-blue mb-4 tracking-tight">{title}</h3>
      <p className="text-support-grey font-medium leading-relaxed">{description}</p>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="bg-white/10 p-1 rounded-full">
        <CheckCircle className="text-brand-orange shrink-0" size={24} />
      </div>
      <span className="text-white font-bold text-lg">{text}</span>
    </div>
  );
}

