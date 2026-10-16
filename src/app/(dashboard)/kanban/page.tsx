"use client";

import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import api, { LeadService, TenantService, LeadData, MonthSale } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { useTenant } from "@/contexts/TenantContext";
import { Plus, X, LogOut, Settings, DollarSign, AlertCircle, Calendar, Eye, EyeOff, Users, Edit2, Mail, Phone, User, Search, TrendingUp, RefreshCw, HelpCircle, Tag, ExternalLink, LayoutGrid, ArrowRightLeft, MessageCircle, Clock, Trash2, AlertTriangle } from "lucide-react";
import { logoutFromHostedUI } from "@/lib/pkce";

import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadSchema } from "@/lib/validations";
import { ganhoRange, todayLocalISODate, formatCalendarDate } from "@/lib/dates";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { CPFInput } from "@/components/ui/CPFInput";
import { z } from "zod";

type LeadFormValues = z.infer<typeof leadSchema>;

const COLUMNS = [
  { id: "NOVO", title: "Novos Leads", order: 0 },
  { id: "ATENDIMENTO", title: "Em Atendimento", order: 1 },
  { id: "AGENDADO", title: "Agendados", order: 2 },
  { id: "GANHO", title: "Ganho (Conversão)", order: 3 },
  { id: "PERDIDO", title: "Perdido", order: 4 },
];

// Helpers de Formatação
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const maskCurrency = (value: string) => {
  if (!value) return "";
  const cleanValue = value.replace(/\D/g, "");
  const numberValue = (Number(cleanValue) / 100).toFixed(2).replace(".", ",");
  return numberValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const unmaskCurrency = (value: string) => {
  if (!value) return 0;
  return Number(value.replace(/\./g, "").replace(",", "."));
};

// Converte string YYYY-MM-DD ou ISO para Date local sem problemas de fuso horário
const parseSafeDate = (dateStr: any) => {
  if (!dateStr) return new Date();
  
  // Se for string, tenta extrair YYYY-MM-DD para criar data local
  if (typeof dateStr === "string") {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      return new Date(year, month - 1, day);
    }
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

// Helper para Inatividade
const getInactivityStatus = (updatedAt: any, columnId: string) => {
  // Cores (Classes completas para o Tailwind extrair)
  const BLUE = "bg-blue-600";
  const ORANGE = "bg-orange-500";
  const RED = "bg-red-600";

  const defaultStatus = { color: BLUE, animate: false, message: "", showTooltip: false };

  if (!["NOVO", "ATENDIMENTO", "AGENDADO"].includes(columnId)) {
    return defaultStatus;
  }

  if (!updatedAt) return defaultStatus;

  const lastUpdate = new Date(updatedAt);
  const now = new Date();
  
  if (isNaN(lastUpdate.getTime())) return defaultStatus;

  const diffMs = now.getTime() - lastUpdate.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours >= 48) {
    return { 
      color: RED, 
      animate: false, 
      message: `Inatividade crítica: mais de ${diffHours}h sem atualizações. Recomendado: Contato urgente.`,
      showTooltip: true 
    };
  }
  if (diffHours >= 24) {
    return { 
      color: ORANGE, 
      animate: true, 
      message: `Atenção: ${diffHours}h de inatividade. Recomendado: Enviar follow-up.`,
      showTooltip: true 
    };
  }
  
  return defaultStatus;
};

function KanbanContent() {
  const searchParams = useSearchParams();
  const { session, logout, setSession } = useAuthStore();
  const {
    activeTenantId,
    activeTenantName,
    availableTenants,
    isMultiTenant,
    switchTenant,
    isLoadingTenants,
  } = useTenant();

  // "Acessar CRM" na lista de tenants abre /kanban?tenant_id=<id>. Aplica uma
  // vez por valor, depois que a lista carrega (o switchTenant recusa tenant
  // bloqueado); uma troca posterior pelo seletor não é desfeita. Enquanto o
  // pedido não foi tratado, o quadro não carrega: senão buscaria os leads do
  // tenant antigo, e a resposta atrasada poderia sobrescrever o quadro.
  const requestedTenantId = searchParams.get("tenant_id");
  const [handledTenantRequest, setHandledTenantRequest] = useState<string | null>(null);
  const waitingForRequestedTenant = !!requestedTenantId && handledTenantRequest !== requestedTenantId;
  useEffect(() => {
    if (!requestedTenantId || isLoadingTenants) return;
    if (handledTenantRequest === requestedTenantId) return;
    if (requestedTenantId !== activeTenantId) {
      switchTenant(requestedTenantId);
    }
    setHandledTenantRequest(requestedTenantId);
  }, [requestedTenantId, isLoadingTenants, handledTenantRequest, activeTenantId, switchTenant]);

  const [boardData, setBoardData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  
  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isNewSaleModalOpen, setIsNewSaleModalOpen] = useState(false);
  const [isQuickMoveModalOpen, setIsQuickMoveModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmText] = useState("");
  
  const [showRevenue, setShowRevenue] = useState(false);

  // Vendas do mês selecionado (fonte do Faturamento e da exportação — RF-09/RF-10)
  const [monthSales, setMonthSales] = useState<MonthSale[]>([]);
  const [salesError, setSalesError] = useState(false);
  const salesRequestId = useRef(0);
  
  const [quickMoveLead, setQuickMoveLead] = useState<any>(null);
  const [saleValueMasked, setSaleValueMasked] = useState("");
  const [saleDate, setSaleDate] = useState(todayLocalISODate());
  const [pendingMove, setPendingMove] = useState<any>(null);
  // Trava de clique duplo em "Confirmar Venda" (a ref bloqueia reenvios antes do re-render)
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const submittingSaleRef = useRef(false);

  // Forms
  const createLeadForm = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      origem: "Indicação"
    }
  });

  const editLeadForm = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
  });

  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingLeadSales, setEditingLeadSales] = useState<any[]>([]);
  const [editingLeadStatus, setEditingLeadStatus] = useState<string>("");
  const [editingLeadSource, setEditingLeadSource] = useState<string>("");

  // Estados para Busca de Nova Venda
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [foundCustomers, setFoundCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  // Controle de Tenant

  // Lógica de Filtro de Mês
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const [isMobile, setIsMobile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Função para exportar Excel de vendas e leads
  const handleExportSales = () => {
    if (salesError) {
      alert("Não foi possível carregar as vendas do mês. Atualize e tente de novo.");
      return;
    }

    setIsExporting(true);
    try {
      if (monthSales.length === 0) {
        alert("Nenhuma venda encontrada no período selecionado.");
        setIsExporting(false);
        return;
      }

      // 1. DADOS PARA A ABA DE RESUMO (Primeira Aba): uma linha por lead_id
      const salesByLead = new Map<string, MonthSale[]>();
      monthSales.forEach((sale) => {
        const list = salesByLead.get(sale.lead_id);
        if (list) list.push(sale);
        else salesByLead.set(sale.lead_id, [sale]);
      });

      const summaryData: any[] = [];
      let grandTotal = 0;

      salesByLead.forEach((leadSales) => {
        const lead = leadSales[0];
        const totalLeadSales = leadSales.reduce((sum, s) => sum + s.valor, 0);
        grandTotal += totalLeadSales;

        summaryData.push({
          "Nome do Cliente": lead.nome,
          "E-mail": lead.email,
          "Telefone": lead.telefone || "N/A",
          "CPF": lead.cpf || "N/A",
          "Data Nasc.": lead.data_nascimento ? formatCalendarDate(lead.data_nascimento) : "N/A",
          "Origem": lead.origem,
          "Qtd. Vendas": leadSales.length,
          "Total de Vendas (R$)": totalLeadSales
        });
      });

      // Adiciona linha de TOTAL no Resumo
      summaryData.push({
        "Nome do Cliente": "TOTAL GERAL",
        "E-mail": "",
        "Telefone": "",
        "CPF": "",
        "Data Nasc.": "",
        "Origem": "",
        "Qtd. Vendas": "",
        "Total de Vendas (R$)": grandTotal
      });

      // 2. DADOS PARA A ABA DE VENDAS DETALHADAS (Segunda Aba): uma linha por venda
      const detailedData: any[] = monthSales.map((sale) => ({
        "Nome do Cliente": sale.nome,
        "E-mail": sale.email,
        "CPF": sale.cpf || "N/A",
        "Data Nasc.": sale.data_nascimento ? formatCalendarDate(sale.data_nascimento) : "N/A",
        "Valor da Venda (R$)": sale.valor,
        "Data da Venda": formatCalendarDate(sale.data)
      }));

      // Criação do Livro e Abas
      const wb = XLSX.utils.book_new();

      // Aba 1: Resumo
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      const summaryCols = [{ wch: 35 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }];
      wsSummary['!cols'] = summaryCols;
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

      // Aba 2: Vendas Detalhadas
      const wsDetailed = XLSX.utils.json_to_sheet(detailedData);
      const detailedCols = [{ wch: 35 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];
      wsDetailed['!cols'] = detailedCols;
      XLSX.utils.book_append_sheet(wb, wsDetailed, "Vendas Detalhadas");

      // Download
      const fileName = `relatorio-comercial-${activeTenantName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

    } catch (error) {
      console.error("Erro ao exportar Excel:", error);
      alert("Erro ao gerar relatório Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Faturamento do período: soma das vendas do mês (GET /leads?view=sales), não dos cards do quadro
  const totalRevenue = monthSales.reduce((sum, s) => sum + s.valor, 0);

  // Refs para rastrear mudanças e otimizar fetches
  const prevTenantId = useRef<string | null>(null);
  const prevMonth = useRef<number | null>(null);
  const prevYear = useRef<number | null>(null);

  const loadLeads = useCallback(async (statusListOrSilent: string[] | boolean = COLUMNS.map(c => c.id), silentParam = false) => {
    if (!activeTenantId) return;

    const statusList = Array.isArray(statusListOrSilent) ? statusListOrSilent : COLUMNS.map(c => c.id);
    const silent = typeof statusListOrSilent === 'boolean' ? statusListOrSilent : silentParam;

    if (!silent) setLoading(true);

    // Faturamento: busca independente do quadro — uma falha aqui não derruba as colunas (RF-11)
    const requestId = ++salesRequestId.current;
    const month = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    LeadService.listSalesByMonth(month, activeTenantId)
      .then((sales) => {
        if (requestId !== salesRequestId.current) return;
        setMonthSales(sales || []);
        setSalesError(false);
      })
      .catch((err) => {
        console.error(err);
        if (requestId !== salesRequestId.current) return;
        setMonthSales([]);
        setSalesError(true);
      });

    try {
      // Perdido: data da perda é um instante real, então usa os limites locais do navegador.
      const start = new Date(selectedYear, selectedMonth, 1).toISOString();
      const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString();
      // Ganho: data da venda é um dia de calendário (meia-noite UTC), então usa limites UTC.
      const ganho = ganhoRange(selectedYear, selectedMonth);
      
      const results: any = {};
      await Promise.all(statusList.map(async (status) => {
        const isFiltered = status === "GANHO" || status === "PERDIDO";
        const range = status === "GANHO" ? { start: ganho.start, end: ganho.end } : { start, end };
        const data = await LeadService.list(
          status, 
          isFiltered ? range.start : undefined, 
          isFiltered ? range.end : undefined, 
          activeTenantId
        );
        results[status] = data || [];
      }));
      
      setBoardData((prev: any) => ({ ...prev, ...results }));
    } catch (err) { 
      console.error(err);
      if (!silent) setBoardData({});
    } finally { 
      if (!silent) setLoading(false); 
    }
  }, [activeTenantId, selectedYear, selectedMonth]);

  useEffect(() => {
    if (activeTenantId && !waitingForRequestedTenant) {
      const tenantChanged = activeTenantId !== prevTenantId.current;
      const dateChanged = selectedMonth !== prevMonth.current || selectedYear !== prevYear.current;

      if (tenantChanged) {
        loadLeads(); // Recarrega tudo
      } else if (dateChanged) {
        loadLeads(["GANHO", "PERDIDO"], true); // Recarrega apenas colunas filtradas
      }

      prevTenantId.current = activeTenantId;
      prevMonth.current = selectedMonth;
      prevYear.current = selectedYear;
    }

    if (availableTenants.length > 0) {
      const found = availableTenants.find(t => t.id === activeTenantId);
      if (found) {
        // Sincroniza o nome na sessão global se houver divergência
        if (session && found.nome_negocio !== session.tenantName) {
          setSession({
            ...session,
            tenantId: activeTenantId,
            tenantName: found.nome_negocio
          });
        }
      }
    }
  }, [selectedMonth, selectedYear, activeTenantId, availableTenants, loadLeads, session, setSession, waitingForRequestedTenant]);

  const handleLogout = () => {
    logout();
    logoutFromHostedUI();
  };

  const handleCreateLead = async (data: LeadFormValues) => {
    try {
      await LeadService.create(data, activeTenantId);
      setIsModalOpen(false);
      createLeadForm.reset();
      loadLeads();
    } catch (err) { alert("Falha ao criar lead"); }
  };

  const handleEditClick = (lead: any) => {
    setEditingLeadId(lead.id);
    setEditingLeadSales(lead.sales || []);
    setEditingLeadStatus(lead.status);
    setEditingLeadSource(lead.source || "");
    
    editLeadForm.reset({
      nome: lead.nome,
      email: lead.email || "",
      telefone: lead.telefone,
      cpf: lead.cpf || "",
      data_nascimento: lead.data_nascimento || "",
      origem: lead.origem,
      anotacoes: lead.anotacoes || ""
    });
    
    setIsEditModalOpen(true);
  };

  const handleUpdateLead = async (data: LeadFormValues) => {
    if (!editingLeadId) return;
    try {
      await LeadService.update(editingLeadId, data, activeTenantId);
      setIsEditModalOpen(false);
      setEditingLeadId(null);
      loadLeads(true);
    } catch (err) { alert("Falha ao atualizar lead"); }
  };

  const handleDeleteLead = async () => {
    if (!editingLeadId || deleteConfirmationText.toLowerCase() !== "excluir") return;
    try {
      await LeadService.delete(editingLeadId, activeTenantId);
      setIsDeleteConfirmModalOpen(false);
      setIsEditModalOpen(false);
      setEditingLeadId(null);
      setDeleteConfirmText("");
      loadLeads(true);
    } catch (err) { alert("Falha ao excluir lead"); }
  };

  const handleSearchCustomers = async (query: string) => {
    setCustomerSearchQuery(query);
    if (query.length < 2) {
      setFoundCustomers([]);
      return;
    }

    const normalize = (str: string) => 
      str?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() || "";
    
    const normalizedQuery = normalize(query);

    // 1. Busca Local Otimizada (Abrangente e Case/Accent Insensitive)
    const localMatches = Object.values(boardData).flat().filter((lead: any) => {
      const nomeNorm = normalize(lead.nome);
      const emailNorm = normalize(lead.email);
      const telefone = lead.telefone || "";
      
      return nomeNorm.includes(normalizedQuery) || 
             emailNorm.includes(normalizedQuery) || 
             telefone.includes(query);
    });

    try {
      // 2. Busca Global via API
      const apiResults = await LeadService.searchCustomers(query, activeTenantId);
      
      // Mescla e remove duplicatas por ID
      const combined = [...localMatches, ...(apiResults || [])];
      const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
      
      setFoundCustomers(unique);
    } catch (err) { 
      console.error(err);
      setFoundCustomers(localMatches);
    }
  };

  const handleAddManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || submittingSaleRef.current) return;
    submittingSaleRef.current = true;
    setIsSubmittingSale(true);
    try {
      const rawValue = unmaskCurrency(saleValueMasked);
      await LeadService.addSale(selectedCustomer.id, rawValue, saleDate, activeTenantId);
      setIsNewSaleModalOpen(false);
      setSelectedCustomer(null);
      setSaleValueMasked("");
      setSaleDate(todayLocalISODate());
      loadLeads(true);
    } catch (err) {
      alert("Falha ao registrar venda");
    } finally {
      submittingSaleRef.current = false;
      setIsSubmittingSale(false);
    }
  };

  const executeMove = async (draggableId: string, destinationId: string, valor = 0, dataVenda?: string) => {
    try {
      await LeadService.updateStatus(draggableId, destinationId, valor, dataVenda, activeTenantId);
      // Sincroniza com o servidor para pegar dados atualizados
      loadLeads(true);
    } catch (err) { 
      console.error(err);
      alert("Falha ao salvar movimento no servidor. Sincronizando...");
      loadLeads(); 
    }
  };

  const confirmSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingMove || submittingSaleRef.current) return;
    submittingSaleRef.current = true;
    setIsSubmittingSale(true);
    try {
      const rawValue = unmaskCurrency(saleValueMasked);
      await executeMove(pendingMove.draggableId, pendingMove.destinationId, rawValue, saleDate);
      setIsSaleModalOpen(false);
      setSaleValueMasked("");
      setSaleDate(todayLocalISODate());
      setPendingMove(null);
    } finally {
      submittingSaleRef.current = false;
      setIsSubmittingSale(false);
    }
  };

  const confirmBackwardsMove = async () => {
    if (!pendingMove) return;
    await executeMove(pendingMove.draggableId, pendingMove.destinationId);
    setIsConfirmModalOpen(false);
    setPendingMove(null);
  };

  const onDragEnd = async (result: any) => {
    const { source, destination, draggableId } = result;
    
    // Se não mudou de lugar, não faz nada
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;

    // 1. ATUALIZAÇÃO OTIMISTA IMEDIATA (Evita o card pular de volta)
    const newBoardData = { ...boardData };
    const sourceLeads = Array.from(boardData[source.droppableId] || []);
    const destLeads = Array.from(boardData[destination.droppableId] || []);
    
    const [movedLead] = sourceLeads.splice(source.index, 1);
    if (movedLead) {
      const updatedLead = { ...movedLead, status: destination.droppableId };
      destLeads.splice(destination.index, 0, updatedLead);
      
      newBoardData[source.droppableId] = sourceLeads;
      newBoardData[destination.droppableId] = destLeads;
      setBoardData(newBoardData);
    }

    const sourceColDef = COLUMNS.find(c => c.id === source.droppableId);
    const destColDef = COLUMNS.find(c => c.id === destination.droppableId);

    // 2. LÓGICA DE MODAIS (Mantém o card no destino enquanto aguarda)
    if (destination.droppableId === "GANHO") {
      setPendingMove({ draggableId, sourceId: source.droppableId, destinationId: destination.droppableId, sourceIndex: source.index, destinationIndex: destination.index });
      setIsSaleModalOpen(true);
      return;
    }
    
    if (destColDef && sourceColDef && destColDef.order < sourceColDef.order) {
      setPendingMove({ draggableId, sourceId: source.droppableId, destinationId: destination.droppableId, sourceIndex: source.index, destinationIndex: destination.index });
      setIsConfirmModalOpen(true);
      return;
    }

    // 3. MOVIMENTO NORMAL: Sincroniza com servidor
    await executeMove(draggableId, destination.droppableId);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <Navbar 
        onRefresh={() => loadLeads()}
        onNewLead={() => setIsModalOpen(true)}
        onNewSale={() => setIsNewSaleModalOpen(true)}
      >
        <div className="hidden md:flex items-center gap-3">

          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <Calendar size={14} className="text-gray-400 ml-2" />
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold text-gray-700 p-2 cursor-pointer">
              {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold text-gray-700 p-2 cursor-pointer">
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 px-3 py-2 rounded-lg ml-2">
            <span className="text-[10px] font-bold text-green-700 uppercase">Faturamento</span>
            <span className="text-sm font-black text-green-700 font-mono">{salesError ? "Indisponível" : showRevenue ? formatCurrency(totalRevenue) : "R$ ••••••"}</span>
            <button onClick={() => setShowRevenue(!showRevenue)} className="text-green-600">{showRevenue ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </div>

          <button 
            onClick={handleExportSales}
            disabled={isExporting}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Exportar Relatório de Vendas (CSV)"
          >
            <TrendingUp size={14} className={isExporting ? "animate-pulse text-brand-blue" : "text-gray-400"} />
            {isExporting ? "Exportando..." : "Exportar Relatório"}
          </button>
        </div>

        {/* Mobile Revenue (Line 1) */}
        <div className="flex md:hidden items-center gap-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 px-2.5 py-1.5 rounded-xl shadow-sm">
            <span className="text-[10px] font-black text-green-700 font-mono">
              {salesError ? "Indisponível" : showRevenue ? formatCurrency(totalRevenue) : "R$ •••"}
            </span>
            <button 
              onClick={() => setShowRevenue(!showRevenue)} 
              className="text-green-600 p-0.5 active:scale-95 transition-transform"
            >
              {showRevenue ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button 
            onClick={handleExportSales}
            disabled={isExporting}
            className="p-2 bg-white border border-gray-200 rounded-xl shadow-sm active:scale-90 transition-all text-gray-500"
          >
            <TrendingUp size={16} className={isExporting ? "animate-pulse text-brand-blue" : ""} />
          </button>
        </div>
      </Navbar>

      {/* Mobile Filter Bar (Line 2) */}
      <div className="flex md:hidden items-center justify-between bg-white border-b border-gray-100 p-3 shadow-sm z-10">
        <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100">
          <Calendar size={14} className="text-gray-400 ml-2" />
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold text-gray-700 p-1.5 cursor-pointer outline-none">
            {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold text-gray-700 p-1.5 cursor-pointer outline-none">
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <button 
          onClick={() => loadLeads()}
          disabled={loading}
          className={`p-2.5 text-brand-blue bg-primary-50 rounded-xl active:scale-95 transition-all border border-primary-100 shadow-sm ${loading ? 'opacity-50' : ''}`}
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <main className="flex-1 p-4 md:p-6 min-h-0 relative">
        {/* Overlay de Loading Moderno (Cobrindo todo o viewport) */}
        {loading && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/30 backdrop-blur-[1.5px] transition-all duration-300 text-gray-900">
            <div className="bg-white p-6 rounded-2xl shadow-2xl border border-gray-100 flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
              <div className="relative flex items-center justify-center">
                <RefreshCw className="animate-spin text-brand-blue" size={42} />
                <div className="absolute inset-0 animate-ping rounded-full border-4 border-primary-100 opacity-20"></div>
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-gray-800 uppercase tracking-tighter">Sincronizando</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Aguarde um instante</p>
              </div>
            </div>
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full overflow-x-auto pb-4 custom-scrollbar snap-x snap-mandatory scroll-smooth px-4 md:px-0">
            {COLUMNS.map((col) => (
              <div key={col.id} className="w-[85vw] md:w-72 flex flex-col bg-gray-200/50 rounded-lg p-3 max-h-full flex-shrink-0 snap-center border border-gray-200/50 md:border-transparent shadow-sm md:shadow-none">
                <h2 className="font-bold text-gray-700 mb-4 px-1 flex justify-between items-center uppercase text-[10px] tracking-widest shrink-0">
                  {col.title} <span className="bg-gray-300 text-[10px] py-0.5 px-2 rounded-full">{boardData[col.id]?.length || 0}</span>
                </h2>
                <Droppable droppableId={col.id}>
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                      {boardData[col.id]?.map((lead: any, index: number) => {
                        const monthSales = lead.sales?.filter((s: any) => {
                          const d = parseSafeDate(s.data);
                          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
                        }) || [];
                        const monthTotal = monthSales.reduce((sum: number, s: any) => sum + s.valor, 0);
                        const totalLtv = lead.sales?.reduce((sum: number, s: any) => sum + s.valor, 0) || 0;
                        
                        return (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided) => {
                              // Tenta encontrar a data de atualização mais recente
                              const lastUpdateDate = lead.updated_at || lead.updatedAt || lead.created_at || lead.createdAt;
                              const status = getInactivityStatus(lastUpdateDate, col.id);
                              
                              return (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="bg-white rounded shadow-sm mb-3 hover:shadow-md group relative transition-all w-full overflow-hidden border border-gray-100">
                                  {/* Indicador de Inatividade (Linha Lateral) */}
                                  <div className="absolute left-0 top-0 bottom-0 w-1.5 z-10 group/indicator cursor-help">
                                    <div className={`absolute inset-0 ${status.color} ${status.animate ? 'animate-pulse' : ''}`} />
                                    {status.showTooltip && (
                                      <div className="absolute left-3 top-2 w-48 opacity-0 group-hover/indicator:opacity-100 pointer-events-none transition-all duration-200 z-[60] translate-x-1 group-hover/indicator:translate-x-0">
                                        <div className="bg-gray-900/95 text-white text-[10px] p-2.5 rounded-xl shadow-2xl border border-gray-700 backdrop-blur-md ring-1 ring-white/10">
                                          <p className="font-medium leading-relaxed">{status.message}</p>
                                          <div className="absolute left-[-4px] top-3 w-2 h-2 bg-gray-900 rotate-45 border-l border-b border-gray-700"></div>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="p-4 pl-5">
                                    <div className="absolute top-2 right-2 flex gap-1">
                                      <button 
                                        onClick={() => handleEditClick(lead)} 
                                        className="p-1.5 text-gray-400 hover:text-brand-blue md:opacity-0 md:group-hover:opacity-100 transition-all bg-gray-50 md:bg-transparent rounded-md active:bg-gray-100"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                      <button 
                                        onClick={() => { setQuickMoveLead(lead); setIsQuickMoveModalOpen(true); }} 
                                        className="md:hidden p-1.5 text-brand-blue bg-primary-50 rounded-md active:bg-primary-100 transition-colors"
                                      >
                                        <ArrowRightLeft size={14} />
                                      </button>
                                    </div>
                                    <div className="font-bold text-gray-900 group-hover:text-brand-blue transition-colors truncate pr-16" title={lead.nome}>{lead.nome}</div>
                                    
                                    <div className="flex items-center justify-between mt-1 gap-2">
                                      <div className="text-xs text-gray-500 truncate flex-1">{lead.telefone}</div>
                                      <div className="flex gap-1">
                                        {lead.telefone && (
                                          <a 
                                            href={`https://wa.me/${lead.telefone.replace(/\D/g, "")}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                                            title="WhatsApp"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <MessageCircle size={14} />
                                          </a>
                                        )}
                                        {lead.email && (
                                          <a 
                                            href={`mailto:${lead.email}`}
                                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title="E-mail"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Mail size={14} />
                                          </a>
                                        )}
                                      </div>
                                    </div>

                                    {monthTotal > 0 && (
                                      <div className="text-xs font-black text-green-600 mt-2">
                                        {formatCurrency(monthTotal)}
                                      </div>
                                    )}

                                    {totalLtv > monthTotal && (
                                      <div className="text-[9px] text-brand-purple font-bold uppercase mt-1">
                                        LTV: {formatCurrency(totalLtv)}
                                      </div>
                                    )}

                                    <div className="flex flex-col gap-1 mt-2">
                                      {lead.origem && (
                                        <div className="text-[10px] text-gray-400 italic flex items-center gap-1 truncate">
                                          <Tag size={10} className="shrink-0" /> <span className="truncate">{lead.origem}</span>
                                        </div>
                                      )}
                                      <div className="text-[9px] text-gray-400 flex items-center gap-1">
                                        <Clock size={9} className="shrink-0" /> 
                                        <span>Atualizado em {new Date(lastUpdateDate || new Date()).toLocaleDateString('pt-BR')}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </main>

      {/* Modal Novo Lead */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
            className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center md:p-4 z-50 backdrop-blur-sm"
          >
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
              drag={isMobile ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (isMobile && info.offset.y > 150) {
                  setIsModalOpen(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-md shadow-2xl text-gray-900 max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="shrink-0 px-6 pt-6">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-primary-700"><Plus size={20}/> Novo Lead Manual</h2>
                  <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-6 pb-6 custom-scrollbar">
                <form onSubmit={createLeadForm.handleSubmit(handleCreateLead)} className="space-y-4">
                  <Input 
                    label="Nome" 
                    {...createLeadForm.register("nome")}
                    error={createLeadForm.formState.errors.nome?.message}
                    placeholder="Nome do cliente"
                  />
                  <Input 
                    label="E-mail" 
                    type="email"
                    {...createLeadForm.register("email")}
                    error={createLeadForm.formState.errors.email?.message}
                    placeholder="email@exemplo.com"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Controller
                      control={createLeadForm.control}
                      name="cpf"
                      render={({ field }) => (
                        <CPFInput
                          label="CPF"
                          {...field}
                          error={createLeadForm.formState.errors.cpf?.message}
                          placeholder="000.000.000-00"
                        />
                      )}
                    />
                    <Input 
                      label="Data de Nascimento" 
                      type="date"
                      {...createLeadForm.register("data_nascimento")}
                      error={createLeadForm.formState.errors.data_nascimento?.message}
                    />
                  </div>
                  <Controller
                    control={createLeadForm.control}
                    name="telefone"
                    render={({ field }) => (
                      <PhoneInput
                        label="WhatsApp"
                        {...field}
                        error={createLeadForm.formState.errors.telefone?.message}
                        placeholder="(00) 00000-0000"
                      />
                    )}
                  />
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Origem</label>
                    <select 
                      {...createLeadForm.register("origem")}
                      className="w-full border p-2 rounded-md outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                    >
                      <option value="Indicação">Indicação</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Instagram">Instagram</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Outro">Outro</option>                
                    </select>
                    {createLeadForm.formState.errors.origem && <p className="text-red-500 text-xs mt-1">{createLeadForm.formState.errors.origem.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Anotações</label>
                    <textarea 
                      {...createLeadForm.register("anotacoes")}
                      className="w-full border p-2 rounded-md outline-none focus:ring-2 focus:ring-brand-blue min-h-[80px] text-sm"
                      placeholder="Observações iniciais..."
                    />
                    {createLeadForm.formState.errors.anotacoes && <p className="text-red-500 text-xs mt-1">{createLeadForm.formState.errors.anotacoes.message}</p>}
                  </div>
                  <button type="submit" className="w-full bg-brand-orange text-white p-3 rounded-md font-bold hover:brightness-110 shadow-lg transition-all mt-4">Criar Lead</button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Nova Venda (Busca de Clientes) */}
      <AnimatePresence>
        {isNewSaleModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {setIsNewSaleModalOpen(false); setSelectedCustomer(null);}}
            className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center md:p-4 z-50 backdrop-blur-sm text-gray-900"
          >
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
              drag={isMobile ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (isMobile && info.offset.y > 150) {
                  setIsNewSaleModalOpen(false);
                  setSelectedCustomer(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-md shadow-2xl max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="shrink-0 px-6 pt-6">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-green-700"><TrendingUp size={20}/> Registrar Nova Venda</h2>
                  <button onClick={() => {setIsNewSaleModalOpen(false); setSelectedCustomer(null);}}><X size={20} /></button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-6 pb-6 custom-scrollbar">
                {!selectedCustomer ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="text" placeholder="Pesquisar cliente por nome..." value={customerSearchQuery} onChange={(e) => handleSearchCustomers(e.target.value)} className="w-full border p-3 pl-10 rounded-md outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar">
                      {foundCustomers.map(c => (
                        <button key={c.id} onClick={() => setSelectedCustomer(c)} className="w-full text-left p-3 hover:bg-green-50 rounded-md border border-transparent hover:border-green-100 flex justify-between items-center group transition-all">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-800">{c.nome}</span>
                            <span className="text-[10px] text-gray-500">{c.telefone} {c.status ? `• ${c.status}` : ''}</span>
                          </div>
                          <Plus size={14} className="text-green-500 opacity-0 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleAddManualSale} className="space-y-4">
                    <div className="bg-green-50 p-4 rounded-md border border-green-100 flex justify-between items-center">
                      <div>
                        <p className="text-[10px] text-green-600 font-bold uppercase">Cliente selecionado</p>
                        <p className="font-bold text-green-900">{selectedCustomer.nome}</p>
                      </div>
                      <button type="button" onClick={() => setSelectedCustomer(null)} className="text-xs text-green-700 hover:underline font-bold">Trocar</button>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Valor da Venda</label>
                      <div className="relative">
                        <span className="absolute left-4 top-4 text-2xl font-black text-green-600">R$</span>
                        <input type="text" required autoFocus value={saleValueMasked} onChange={(e) => setSaleValueMasked(maskCurrency(e.target.value))} className="w-full border p-4 pl-14 rounded-md outline-none focus:ring-2 focus:ring-green-500 text-3xl font-black text-gray-800" placeholder="0,00" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="new-sale-date" className="block text-sm font-bold text-gray-700 mb-2">Data da Venda</label>
                      <input id="new-sale-date" type="date" required value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="w-full border p-3 rounded-md outline-none focus:ring-2 focus:ring-green-500 font-bold text-gray-700" />
                    </div>
                    <button type="submit" disabled={isSubmittingSale} className="w-full bg-green-600 text-white p-4 rounded-md font-bold hover:bg-green-700 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Venda</button>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditModalOpen && editingLeadId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsEditModalOpen(false)}
            className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 text-gray-900"
          >
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
              drag={isMobile ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (isMobile && info.offset.y > 150) {
                  setIsEditModalOpen(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-md shadow-xl max-h-[95vh] md:max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="shrink-0 px-6 pt-6">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Edit2 size={18} className="text-brand-blue" /> Editar Lead</h2>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button" 
                      onClick={() => setIsDeleteConfirmModalOpen(true)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      title="Excluir Lead"
                    >
                      <Trash2 size={20} />
                    </button>
                    <button onClick={() => setIsEditModalOpen(false)}><X size={20} /></button>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-6 pb-6 custom-scrollbar">
                <form onSubmit={editLeadForm.handleSubmit(handleUpdateLead)} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <Input 
                      label="Nome"
                      {...editLeadForm.register("nome")}
                      error={editLeadForm.formState.errors.nome?.message}
                    />
                    <Input 
                      label="E-mail"
                      type="email"
                      {...editLeadForm.register("email")}
                      error={editLeadForm.formState.errors.email?.message}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Controller
                        control={editLeadForm.control}
                        name="cpf"
                        render={({ field }) => (
                          <CPFInput
                            label="CPF"
                            {...field}
                            error={editLeadForm.formState.errors.cpf?.message}
                            placeholder="000.000.000-00"
                          />
                        )}
                      />
                      <Input 
                        label="Data de Nascimento" 
                        type="date"
                        {...editLeadForm.register("data_nascimento")}
                        error={editLeadForm.formState.errors.data_nascimento?.message}
                      />
                    </div>
                    <Controller
                      control={editLeadForm.control}
                      name="telefone"
                      render={({ field }) => (
                        <PhoneInput
                          label="WhatsApp"
                          {...field}
                          error={editLeadForm.formState.errors.telefone?.message}
                          placeholder="(00) 00000-0000"
                        />
                      )}
                    />
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase">Origem</label>
                      {editingLeadSource === "LANDING_PAGE" ? (
                        <div className="flex flex-col gap-1">
                          <div className="w-full border p-2 rounded-md bg-gray-50 text-gray-500 italic flex items-start gap-2 overflow-hidden">
                            <Tag size={14} className="shrink-0 mt-0.5" /> 
                            <span className="flex-1 break-all">{editLeadForm.getValues("origem")}</span>
                          </div>
                          <span className="text-[10px] text-amber-600 font-medium">Leads vindos do site não podem ter a origem alterada.</span>
                        </div>
                      ) : (
                        <select 
                          {...editLeadForm.register("origem")}
                          className="w-full border p-2 rounded-md outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                        >
                          <option value="Indicação">Indicação</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Instagram">Instagram</option>
                          <option value="Facebook">Facebook</option>
                          <option value="Outro">Outro</option>
                        </select>
                      )}
                      {editLeadForm.formState.errors.origem && <p className="text-red-500 text-xs mt-1">{editLeadForm.formState.errors.origem.message}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase">Anotações</label>
                      <textarea 
                        {...editLeadForm.register("anotacoes")}
                        className="w-full border p-2 rounded-md outline-none focus:ring-2 focus:ring-brand-blue min-h-[100px] text-sm"
                        placeholder="Adicione observações sobre este lead..."
                      />
                      {editLeadForm.formState.errors.anotacoes && <p className="text-red-500 text-xs mt-1">{editLeadForm.formState.errors.anotacoes.message}</p>}
                    </div>
                  </div>
                  
                  <div className="mt-8 border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-gray-700 uppercase flex items-center gap-2"><DollarSign size={16} className="text-green-600" /> Vendas do mês</h3>
                      {editingLeadStatus === "GANHO" && (
                        <button 
                          type="button"
                          onClick={() => {
                            // find lead in boardData to get current object for selection
                            const allLeads = Object.values(boardData).flat() as any[];
                            const lead = allLeads.find(l => l.id === editingLeadId);
                            if (lead) setSelectedCustomer(lead);
                            setIsNewSaleModalOpen(true);
                            setIsEditModalOpen(false);
                          }}
                          className="flex items-center gap-1 text-[11px] font-black bg-green-50 text-green-700 px-2.5 py-1 rounded border border-green-200 hover:bg-green-600 hover:text-white transition-all shadow-sm"
                        >
                          $ +
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {editingLeadSales?.length > 0 ? editingLeadSales.map((s: any) => (
                        <div key={s.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-md border">
                          <span className="text-xs font-bold text-gray-400">{parseSafeDate(s.data).toLocaleDateString('pt-BR')}</span>
                          <span className="font-black text-green-700">{formatCurrency(s.valor)}</span>
                        </div>
                      )) : <p className="text-center text-xs text-gray-400 py-4 italic">Nenhuma venda registrada.</p>}
                    </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 bg-gray-100 p-3 rounded-md font-bold">Cancelar</button>
                    <button type="submit" className="flex-1 bg-brand-orange text-white p-3 rounded-md font-bold hover:brightness-110">Salvar Alterações</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modais de Movimentação (Simplificados) */}
      <AnimatePresence>
        {isSaleModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setIsSaleModalOpen(false); setPendingMove(null); loadLeads(true); }}
            className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center md:p-4 z-50 text-gray-900"
          >
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
              drag={isMobile ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (isMobile && info.offset.y > 150) {
                  setIsSaleModalOpen(false);
                  setPendingMove(null);
                  loadLeads(true);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-sm border-t-4 border-green-500 shadow-2xl max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="shrink-0 px-6 pt-6">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
                <h2 className="text-lg font-bold text-green-700 mb-4 flex items-center gap-2"><DollarSign size={20} /> Venda Concluída!</h2>
              </div>

              <div className="overflow-y-auto flex-1 px-6 pb-6 custom-scrollbar">
                <form onSubmit={confirmSale} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Valor da Venda</label>
                    <div className="relative">
                      <span className="absolute left-4 top-4 text-2xl font-black text-green-600">R$</span>
                      <input type="text" required autoFocus value={saleValueMasked} onChange={(e) => setSaleValueMasked(maskCurrency(e.target.value))} className="w-full border p-4 pl-14 rounded-md outline-none focus:ring-2 focus:ring-green-500 text-3xl font-black text-gray-800" placeholder="0,00" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="move-sale-date" className="block text-xs font-bold text-gray-400 uppercase mb-1">Data da Venda</label>
                    <input id="move-sale-date" type="date" required value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="w-full border p-3 rounded-md outline-none focus:ring-2 focus:ring-green-500 font-bold text-gray-700" />
                  </div>
                  <button type="submit" disabled={isSubmittingSale} className="w-full bg-green-600 text-white p-4 rounded-md font-bold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Venda</button>
                  <button type="button" onClick={() => { setIsSaleModalOpen(false); setPendingMove(null); loadLeads(true); }} className="w-full bg-gray-100 p-2 mt-2 rounded font-bold text-gray-500 text-xs">Cancelar movimento</button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isConfirmModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setIsConfirmModalOpen(false); setPendingMove(null); loadLeads(true); }}
            className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 text-gray-900"
          >
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
              drag={isMobile ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (isMobile && info.offset.y > 150) {
                  setIsConfirmModalOpen(false);
                  setPendingMove(null);
                  loadLeads(true);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-sm shadow-xl text-gray-900 border-t-4 border-orange-500 max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="shrink-0 px-6 pt-6">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
                <h2 className="text-lg font-bold text-orange-600 mb-4 flex items-center gap-2"><AlertCircle size={20} /> Mover para trás?</h2>
              </div>

              <div className="overflow-y-auto flex-1 px-6 pb-6 custom-scrollbar">
                <p className="text-sm text-gray-600 mb-6 font-medium">Deseja realmente retroceder este lead para uma etapa anterior do funil?</p>
                <div className="flex gap-3">
                  <button onClick={confirmBackwardsMove} className="flex-1 bg-orange-600 text-white p-2 rounded font-bold hover:bg-orange-700 transition-all">Sim, mover</button>
                  <button onClick={() => { setIsConfirmModalOpen(false); setPendingMove(null); loadLeads(true); }} className="flex-1 bg-gray-100 p-2 rounded font-bold hover:bg-gray-200 transition-all">Não, cancelar</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Move Modal (Bottom Sheet) */}
      <AnimatePresence>
        {isQuickMoveModalOpen && quickMoveLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setIsQuickMoveModalOpen(false); setQuickMoveLead(null); }}
            className="fixed inset-0 bg-black/60 z-[70] flex items-end"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 150) {
                  setIsQuickMoveModalOpen(false);
                  setQuickMoveLead(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full rounded-t-[32px] p-6 pb-10 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />
              <div className="mb-6">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mover Lead</p>
                <h3 className="text-xl font-black text-gray-800 truncate">{quickMoveLead.nome}</h3>
              </div>
              
              <div className="grid gap-3">
                {COLUMNS.map((col) => {
                  if (col.id === quickMoveLead.status) return null;
                  
                  return (
                    <button
                      key={col.id}
                      onClick={() => {
                        const sourceColDef = COLUMNS.find(c => c.id === quickMoveLead.status);
                        const destColDef = col;
                        
                        const moveData = {
                          draggableId: quickMoveLead.id,
                          sourceId: quickMoveLead.status,
                          destinationId: col.id
                        };

                        if (col.id === "GANHO") {
                          setPendingMove(moveData);
                          setIsSaleModalOpen(true);
                        } else if (destColDef.order < (sourceColDef?.order || 0)) {
                          setPendingMove(moveData);
                          setIsConfirmModalOpen(true);
                        } else {
                          executeMove(quickMoveLead.id, col.id);
                        }
                        
                        setIsQuickMoveModalOpen(false);
                        setQuickMoveLead(null);
                      }}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 active:bg-primary-50 rounded-2xl border border-gray-100 active:border-primary-200 transition-all group"
                    >
                      <span className="font-bold text-gray-700 group-active:text-primary-700">{col.title}</span>
                      <ArrowRightLeft size={18} className="text-gray-300 group-active:text-primary-400" />
                    </button>
                  );
                })}
              </div>
              
              <button 
                onClick={() => { setIsQuickMoveModalOpen(false); setQuickMoveLead(null); }}
                className="w-full mt-6 p-4 text-sm font-bold text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação de Exclusão */}
      <AnimatePresence>
        {isDeleteConfirmModalOpen && editingLeadId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setIsDeleteConfirmModalOpen(false); setDeleteConfirmText(""); }}
            className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center md:p-4 z-[80] backdrop-blur-sm text-gray-900"
          >
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-sm shadow-2xl border-t-4 border-red-500 max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="shrink-0 px-6 pt-6 text-center">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
                <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={32} className="text-red-600" />
                </div>
                <h2 className="text-xl font-black text-red-600 mb-2">Excluir {(Object.values(boardData).flat() as any[]).find((l: any) => l.id === editingLeadId)?.nome || "este Lead"}?</h2>
                <p className="text-sm text-gray-500 font-medium px-4">Esta ação é irreversível e apagará todo o histórico de vendas e contatos.</p>
              </div>

              <div className="overflow-y-auto flex-1 px-6 py-6 space-y-4">
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                  <p className="text-xs text-amber-800 font-bold uppercase mb-1">Dica de Gestão</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">Se o motivo for falta de interesse, recomendamos mover para a coluna <span className="font-bold">PERDIDO</span> para manter suas estatísticas de funil precisas.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Para confirmar, digite <span className="text-red-600 italic">excluir</span> abaixo:</label>
                  <input 
                    type="text" 
                    value={deleteConfirmationText} 
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Digite excluir"
                    className="w-full border-2 border-red-100 p-3 rounded-xl outline-none focus:border-red-500 text-center font-bold transition-all"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <button 
                    onClick={handleDeleteLead}
                    disabled={deleteConfirmationText.toLowerCase() !== "excluir"}
                    className="w-full bg-red-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-red-200 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale disabled:pointer-events-none"
                  >
                    Sim, excluir permanentemente
                  </button>
                  <button 
                    onClick={() => { setIsDeleteConfirmModalOpen(false); setDeleteConfirmText(""); }}
                    className="w-full bg-gray-50 text-gray-500 p-4 rounded-xl font-bold hover:bg-gray-100 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }`}</style>
    </div>
  );
}

export default function KanbanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Carregando interface...</div>}>
      <KanbanContent />
    </Suspense>
  );
}
