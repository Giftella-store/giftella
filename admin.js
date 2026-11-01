const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const loginSection = document.getElementById("login");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("message");

document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = "بيانات الدخول غير صحيحة";
  } else {
    showDashboard();
  }
};

async function showDashboard() {
  const { data } = await db.auth.getSession();

  if (!data.session) return;

  loginSection.hidden = true;
  dashboard.hidden = false;
  loadAdminProducts();
}

document.getElementById("logoutBtn").onclick = async () => {
  await db.auth.signOut();
  location.reload();
};

document.getElementById("saveBtn").onclick = async () => {
  const name = document.getElementById("name").value.trim();
  const description = document.getElementById("description").value;
  const price = Number(document.getElementById("price").value);
  const category = document.getElementById("category").value;
  const imageFile = document.getElementById("image").files[0];

  if (!name || !price || price <= 0) {
    message.textContent = "اكتبي اسم المنتج والسعر بشكل صحيح";
    return;
  }

  message.textContent = "جاري حفظ المنتج...";

  let image_url = "";

  if (imageFile) {
    const filePath = Date.now() + "-" + imageFile.name;

    const { error: uploadError } = await db.storage
      .from("product-images")
      .upload(filePath, imageFile);

    if (uploadError) {
      message.textContent = "خطأ رفع الصورة: " + uploadError.message;
    }

    const { data } = db.storage
      .from("product-images")
      .getPublicUrl(filePath);

    image_url = data.publicUrl;
  }

  const { error } = await db.from("products").insert([{
    name,
    description,
    price,
    category,
    image_url,
    is_active: true
  }]);

  if (error) {
    message.textContent = "تعذر حفظ المنتج";
    return;
  }

  message.textContent = "تم حفظ المنتج بنجاح 🎉";

  document.getElementById("name").value = "";
  document.getElementById("description").value = "";
  document.getElementById("price").value = "";
  document.getElementById("category").value = "";
  document.getElementById("image").value = "";

  loadAdminProducts();
};

async function loadAdminProducts() {
  const area = document.getElementById("adminProducts");

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    area.textContent = "تعذر تحميل المنتجات";
    return;
  }

  area.innerHTML = "";

  data.forEach(product => {
    const item = document.createElement("div");
    item.style.padding = "12px";
    item.style.background = "white";
    item.style.margin = "10px 0";

    const title = document.createElement("strong");
    title.textContent = product.name;

    const price = document.createElement("p");
    price.textContent = product.price + " جنيه";

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "حذف المنتج";

    deleteButton.onclick = async () => {
      if (!confirm("متأكدة إنك عايزة تحذفي المنتج؟")) return;

      const { error } = await db
        .from("products")
        .delete()
        .eq("id", product.id);

      if (error) {
        message.textContent = "تعذر حذف المنتج";
      } else {
        message.textContent = "تم حذف المنتج";
        loadAdminProducts();
      }
    };

    item.append(title, price, deleteButton);
    area.appendChild(item);
  });
}

showDashboard();
