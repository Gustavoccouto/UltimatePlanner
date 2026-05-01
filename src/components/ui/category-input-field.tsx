import type { Category } from "@/lib/domain/app-types";

type Props = {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  categories: Category[];
  helper?: string;
  placeholder?: string;
};

export function CategoryInputField({
  id,
  label = "Categoria",
  value,
  onChange,
  categories,
  helper = "Digite livremente. O app sugere categorias já usadas e cria a categoria automaticamente ao salvar.",
  placeholder = "Ex.: Mercado, Transporte, Salário"
}: Props) {
  const listId = `${id}-suggestions`;
  const suggestions = Array.from(
    new Map(
      categories
        .filter((category) => !category.is_deleted && !category.is_archived)
        .map((category) => [category.name.trim().toLowerCase(), category])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <label className="field category-input-field">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((category) => <option key={category.id} value={category.name} />)}
      </datalist>
      <small className="form-hint">{helper}</small>
    </label>
  );
}
