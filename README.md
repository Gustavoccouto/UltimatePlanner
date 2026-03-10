# 📋 Setup Planner Sync - Gerenciador de Projetos com Google Sheets

Ultimate Planner Pro, uma interface digital avançada desenvolvida para a gestão estratégica de projetos e controle financeiro pessoal. A plataforma utiliza inteligência artificial para automatizar a criação de cronogramas e sugerir orçamentos baseados em custos médios de mercado. Através de recursos de análise de dados, o sistema permite monitorar o progresso geral, fluxos de caixa e a eficiência de gastos por categoria. Os usuários podem realizar o gerenciamento de saldo em tempo real, registrando aportes, retiradas e sincronizando informações via Google Apps Script. O painel oferece ainda ferramentas para configuração de itens, checklists detalhados e um histórico completo de movimentações financeiras para garantir total transparência operacional.

#
<img width="1325" height="898" alt="image" src="https://github.com/user-attachments/assets/9ec84a9f-45c2-44b5-88ee-ee49a711c877"/>

</br>

---

## 🚀 Recursos Principais

- **Criação Automática de Projeto Inicial:**  
  Ao acessar o sistema pela primeira vez, um projeto padrão é criado automaticamente com itens pré-configurados.

- **Gerenciamento de Itens:**  
  Os usuários podem:
  - Adicionar novos itens  
  - Editar itens existentes  
  - Marcar como concluído  
  - Excluir itens  
  - Atualizar valores mínimos e máximos  

- **Sincronização com Google Sheets (Apps Script):**  
  Todos os dados do LocalStorage são enviados para uma única célula da planilha, mantendo o histórico atualizado sempre que ocorre qualquer modificação (adição, edição ou exclusão).

- **Histórico de Conexões:**  
  O sistema armazena automaticamente os links utilizados do Google Apps Script, permitindo acesso rápido sem precisar digitar novamente.

- **Persistência de Dados Local:**  
  Utiliza LocalStorage para garantir que os dados do usuário não sejam perdidos ao fechar o navegador.

- **Interface Simples e Intuitiva:**  
  Desenvolvida em HTML, CSS (Tailwind CSS) e JavaScript puro, com foco em usabilidade e clareza.

- **Botão de Logout:**  
  Permite desconectar do script atual e escolher outro link de sincronização facilmente.

---

## 🧠 Tecnologias Utilizadas

- HTML5  
- CSS3 (Tailwind CSS)  
- JavaScript (Vanilla JS)  
- LocalStorage  
- Google Apps Script  
- Google Sheets  

---

## ⚙️ Funcionamento Geral

1. Ao abrir a aplicação, o usuário informa o link `exec` do Google Apps Script.
2. O sistema:
   - Busca os dados armazenados na planilha
   - Sincroniza com o LocalStorage
   - Renderiza os projetos e itens no front-end
3. Qualquer alteração realizada:
   - Atualiza o LocalStorage
   - Atualiza automaticamente a planilha do Google Sheets
4. O histórico de links é salvo localmente para acessos futuros.

---

## 📦 Instalação e Execução

Não é necessário servidor ou banco de dados local.
