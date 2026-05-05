#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const srcDir = path.join(root, 'src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function patchFile(file) {
  let text = fs.readFileSync(file, 'utf8');
  const original = text;

  // Remove common inline row-level "Excluir compra inteira" buttons.
  text = text.replace(/\n?\s*<button[^>]*>[\s\S]{0,300}?Excluir compra inteira[\s\S]{0,300}?<\/button>\s*/g, '\n');
  text = text.replace(/\n?\s*<[^>]+className=\{?[^\n>]*[^>]*>[\s\S]{0,300}?Excluir compra inteira[\s\S]{0,300}?<\/[^>]+>\s*/g, (m) => {
    // Avoid removing header button if line already contains recolher/ver parcelas context.
    return /Ver parcelas|Recolher detalhes|recolher detalhes|ver parcelas/i.test(m) ? m : '\n';
  });

  // If there is a header action group with Ver parcelas / Recolher detalhes, inject the unique button once.
  const hasDeleteWhole = /Excluir compra inteira/.test(text);
  if (!hasDeleteWhole) {
    const headerPatterns = [
      /(Recolher detalhes[\s\S]{0,120}<\/button>)/,
      /(Ver parcelas[\s\S]{0,120}<\/button>)/
    ];

    for (const pattern of headerPatterns) {
      if (pattern.test(text)) {
        text = text.replace(pattern, `$1\n\n<button\n  type="button"\n  className="btn btn-danger-soft"\n  onClick={() => handleDeleteInstallmentPlan?.(plan.id)}\n>\n  Excluir compra inteira\n</button>`);
        break;
      }
    }
  }

  if (text !== original) {
    fs.writeFileSync(file, text, 'utf8');
    return true;
  }
  return false;
}

if (!fs.existsSync(srcDir)) {
  console.error('Pasta src não encontrada. Rode este script na raiz do projeto.');
  process.exit(1);
}

const files = walk(srcDir);
let patched = 0;
for (const file of files) {
  try {
    if (patchFile(file)) {
      console.log('Ajustado:', path.relative(root, file));
      patched++;
    }
  } catch (error) {
    // ignore parse-risky files
  }
}

if (patched === 0) {
  console.log('Nenhum arquivo foi alterado automaticamente. Faça o ajuste manual no componente de Parcelamentos:');
  console.log('- remova o botão `Excluir compra inteira` de cada linha/parcela;');
  console.log('- mantenha esse botão apenas no cabeçalho do plano, ao lado de `Ver parcelas` / `Recolher detalhes`.');
} else {
  console.log(`Concluído. ${patched} arquivo(s) alterado(s).`);
}
