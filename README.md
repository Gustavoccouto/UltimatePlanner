# 💼 Finance Premium

Sistema web moderno de finanças pessoais e planejamento, desenvolvido com foco em experiência premium, organização visual, confiabilidade de dados e arquitetura escalável sem dependência de build step.

---

## 🧠 Sobre o Projeto

O **Finance Premium** é uma aplicação completa para gestão financeira pessoal, permitindo controle detalhado de contas, transações, cartões, projetos, metas e investimentos, com sincronização entre dispositivos utilizando Google Sheets como banco de dados.

A aplicação segue o conceito **local-first**, garantindo funcionamento offline com sincronização posterior, mantendo consistência e integridade dos dados.

---

## 🚀 Principais Funcionalidades

### Dashboard
- visão geral das finanças
- saldo total derivado
- receitas e despesas
- economia líquida
- gráficos de fluxo mensal
- movimentações recentes

### Contas
- múltiplas contas e bancos
- histórico completo
- saldo calculado automaticamente

### Transações
- receitas, despesas e transferências
- categorização e organização
- filtros e busca

### Cartões
- controle de limite
- datas de fechamento e vencimento
- faturas e parcelamentos
- pagamentos de fatura

### Projetos
- gestão de custos por projeto
- participantes
- divisão de aportes por pessoa
- acompanhamento de progresso

### Metas
- definição de objetivos financeiros
- controle de evolução
- percentual concluído

### Investimentos
- acompanhamento de aportes
- valor atual
- rentabilidade simples

### Relatórios
- análise por categoria
- comparação mensal
- custos por projeto
- visão consolidada

### Busca Global
- pesquisa unificada em todos os módulos

### Integridade de Dados
- validação de consistência
- identificação de erros
- verificação de sincronização

---

## 🧱 Arquitetura

A aplicação é estruturada de forma modular, sem frameworks, com separação clara de responsabilidades:

- UI modular
- estado centralizado
- serviços desacoplados
- utilitários reutilizáveis

---

## 💾 Persistência de Dados

A aplicação utiliza uma arquitetura híbrida:

### Local
- IndexedDB como base principal
- armazenamento offline
- fila de sincronização

### Nuvem
- Google Apps Script como API
- Google Sheets como banco de dados
- dados armazenados em formato JSON

Cada registro é salvo com:
- `id`
- `payload_json`
- `updatedAt`

---

## 🔄 Sincronização

- modelo local-first
- sincronização assíncrona
- fila de envio
- reprocessamento em caso de falha
- reconciliação entre local e remoto

---

## 🎨 Interface

- design minimalista e moderno
- predominância de branco
- hierarquia visual clara
- cartões com estética fintech
- uso leve de glassmorphism
- responsivo para desktop e mobile

---

## ⚙️ Filosofia do Sistema

- simplicidade com profundidade funcional
- organização visual clara
- dados sempre consistentes
- arquitetura preparada para crescimento
- experiência próxima de produtos financeiros reais