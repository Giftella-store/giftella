const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

async function loadProducts() {
  const area = document.getElementById("products");

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    area.textContent = "حدث خطأ في تحميل المنتجات";
    return;
  }

  if (!data || data.length === 0) {
    area.textContent = "قريبًا منتجاتنا الجميلة 💗";
    return;
  }

  area.innerHTML = data.map(product => `
    <div class="product">
      ${product.image_url ? `<img src="${product.image_url}" alt="">` : ""}
      <h3>${product.name}</h3>
      <p>${product.description || ""}</p>
      <p>${product.price} جنيه</p>
    </div>
  `).join("");
}

loadProducts();
