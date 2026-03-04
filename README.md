# 📋 Setup Planner Sync - Gerenciador de Projetos com Google Sheets

<img width="1325" height="898" alt="image" src="https://github.com/user-attachments/assets/9ec84a9f-45c2-44b5-88ee-ee49a711c877" />

</br>

Bem-vindo ao **Setup Planner Sync**, uma aplicação web interativa para gerenciar projetos e itens de compra (setup gamer, escritório, lifestyle, etc.) com sincronização automática entre **LocalStorage** e **Google Sheets via Google Apps Script**.

Este projeto foi desenvolvido com foco em organização, persistência de dados e facilidade de uso, permitindo que o usuário mantenha seu planejamento salvo localmente e na nuvem, com histórico de conexões.

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

### Passos:

Clone o repositório:
```bash
git clone https://github.com/seu-usuario/setup-planner-sync.git
