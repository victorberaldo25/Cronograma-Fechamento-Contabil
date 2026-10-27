/**
 * AgroTech Bioenergia S.A. | VB Systems - RPA & Analytics
 * Mock Data: Cronograma de Fechamento Contábil Mensal & SLA Fiscal
 */
window.DEMO_MODE = true;

window.MOCK_FECHAMENTO = {
  empresa: "AgroTech Bioenergia S.A.",
  competencia: "10/2026",
  status_geral: {
    total_tarefas: 42,
    concluidas: 36,
    em_andamento: 4,
    atrasadas: 2,
    progresso_pct: 85.7
  },
  tarefas: [
    { id: 1, setor: "Contas a Pagar", descricao: "Fechamento e conciliação de faturas de compras", responsavel: "Analista Financeiro 01", prazo: "D-2", status: "Concluído" },
    { id: 2, setor: "Almoxarifado & Estoque", descricao: "Inventário físico e conciliação do SB2 Protheus", responsavel: "Coordenador de Estoque", prazo: "D-1", status: "Concluído" },
    { id: 3, setor: "Fiscal", descricao: "Apuração de ICMS, PIS/COFINS e validação DIFAL", responsavel: "Especialista Tributário", prazo: "D+2", status: "Em Andamento" },
    { id: 4, setor: "Contabilidade", descricao: "Conciliação bancária e lançamentos de depreciação", responsavel: "Contador Sênior", prazo: "D+3", status: "Em Andamento" },
    { id: 5, setor: "Controladoria", descricao: "Consolidação da DRE e Fechamento Executivo", responsavel: "Gerente de Controladoria", prazo: "D+5", status: "Pendente" }
  ]
};
