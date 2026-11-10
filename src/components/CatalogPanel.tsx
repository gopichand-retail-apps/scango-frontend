import { Plus, Search, ScanLine } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy, formatMoney, nestedCopy } from "../lib/format";
import type { Catalog, PublicModel, Product } from "../lib/types";

function matchesProduct(product: Product, query: string, categoryId: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const matchesCategory = !categoryId || product.categoryId === categoryId;
  const matchesText =
    !normalizedQuery ||
    [product.name, product.description, product.barcode].some((value) => value.toLowerCase().includes(normalizedQuery));
  return matchesCategory && matchesText;
}

function productCategoryLabel(model: PublicModel, catalog: Catalog, product: Product): string {
  const category = catalog.categories.find((entry) => entry.id === product.categoryId);
  if (!category) throw new TypeError(`Missing catalog category mapping: ${product.categoryId}`);
  return nestedCopy(model, "categories", category.labelKey);
}

export function CatalogPanel({
  model,
  catalog,
  disabled,
  busy,
  onScan,
}: {
  model: PublicModel;
  catalog: Catalog;
  disabled: boolean;
  busy: boolean;
  onScan: (barcode: string, source: "barcode" | "search") => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [barcode, setBarcode] = useState("");
  const products = catalog.products.filter((product) => matchesProduct(product, query, categoryId));

  function submitBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = barcode.trim();
    if (!value || disabled || busy) return;
    setBarcode("");
    void onScan(value, "barcode");
  }

  return (
    <section className="catalog-panel" aria-labelledby="catalog-heading">
      <div className="section-heading catalog-heading">
        <div>
          <span className="section-kicker">{copy(model, "scanStage")}</span>
          <h2 id="catalog-heading">{copy(model, "catalogHeading")}</h2>
        </div>
        <span className="catalog-count">
          {products.length} / {catalog.products.length}
        </span>
      </div>
      <form className="scan-form" onSubmit={submitBarcode}>
        <label className="scan-input-wrap">
          <ScanLine size={18} aria-hidden="true" />
          <span className="sr-only">{copy(model, "barcode")}</span>
          <input
            autoComplete="off"
            autoCapitalize="characters"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder={copy(model, "barcodePlaceholder")}
            aria-label={copy(model, "barcode")}
            maxLength={model.data.app.maximumBarcodeLength}
          />
        </label>
        <button
          className="button button-primary scan-submit"
          type="submit"
          disabled={disabled || busy || !barcode.trim()}
        >
          <Plus size={18} aria-hidden="true" />
          {copy(model, "scanItem")}
        </button>
      </form>
      <div className="catalog-tools">
        <label className="catalog-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{copy(model, "searchProducts")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy(model, "searchPlaceholder")}
          />
        </label>
      </div>
      <div className="category-filters" aria-label={copy(model, "allCategories")}>
        <button
          className={categoryId ? "category-filter" : "category-filter is-active"}
          type="button"
          aria-pressed={!categoryId}
          onClick={() => setCategoryId("")}
        >
          {copy(model, "allCategories")}
        </button>
        {catalog.categories.map((category) => (
          <button
            className={categoryId === category.id ? "category-filter is-active" : "category-filter"}
            type="button"
            key={category.id}
            aria-pressed={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
          >
            <span className="category-swatch" style={{ backgroundColor: category.color }} aria-hidden="true" />
            {nestedCopy(model, "categories", category.labelKey)}
          </button>
        ))}
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <article className="product-tile" key={product.id}>
              <div className="product-image-wrap">
                <img src={product.image} alt={product.name} loading="lazy" />
                <span className="product-category-label">{productCategoryLabel(model, catalog, product)}</span>
              </div>
              <div className="product-tile-body">
                <div className="product-title-row">
                  <div>
                    <h3>{product.name}</h3>
                    <small>{product.barcode}</small>
                  </div>
                  <strong>{formatMoney(model, product.priceCents)}</strong>
                </div>
                <p>{product.description}</p>
                <button
                  className="button button-add"
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void onScan(product.barcode, "search")}
                >
                  <Plus size={16} aria-hidden="true" />
                  {copy(model, "addToBasket")}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-catalog" role="status">
          {copy(model, "emptySearch")}
        </p>
      )}
    </section>
  );
}
