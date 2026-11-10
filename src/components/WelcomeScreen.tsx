import { ArrowRight, ShoppingBasket } from "lucide-react";
import { copy } from "../lib/format";
import type { PublicModel, Product } from "../lib/types";

export function WelcomeScreen({
  model,
  products,
  busy,
  onStart,
}: {
  model: PublicModel;
  products: Product[];
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <main className="welcome-screen" id="home">
      <section className="welcome-copy">
        <span className="section-kicker">{copy(model, "kioskEyebrow")}</span>
        <h1>{copy(model, "welcomeTitle")}</h1>
        <p>{copy(model, "welcomeDescription")}</p>
        <button className="button button-primary start-button" type="button" onClick={onStart} disabled={busy}>
          <ShoppingBasket size={19} aria-hidden="true" />
          {copy(model, "startCheckout")}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </section>
      <section className="welcome-products" aria-label={copy(model, "catalogHeading")}>
        {products.slice(0, 4).map((product, index) => (
          <figure className={`welcome-product welcome-product-${index + 1}`} key={product.id}>
            <img src={product.image} alt={product.name} />
            <figcaption>{product.name}</figcaption>
          </figure>
        ))}
        <div className="welcome-product-stamp" aria-hidden="true">
          <span>{copy(model, "marketMonogram")}</span>
          <small>
            {copy(model, "marketName").toUpperCase()}
            <br />
            {copy(model, "marketDescriptor").toUpperCase()}
          </small>
        </div>
      </section>
    </main>
  );
}
