const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const loginSection = document.getElementById("login");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("message");

// تسجيل الدخول
document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  message.textContent = "جاري تسجيل الدخول...";

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = "خطأ تسجيل الدخول: " + error.message;
    return;
  }

  message.textContent = "";
  showDashboard();
};

// عرض لوحة التحكم
async function showDashboard() {
  const { data, error } = await db.auth.getSession();

  if (error || !data.session) {
    loginSection.hidden = false;
    dashboard.hidden = true;
    return;
  }

  loginSection.hidden = true;
  dashboard.hidden = false;

  loadAdminProducts();
}

// تسجيل الخروج
document.getElementById("logoutBtn").onclick = async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    message.textContent = "خطأ تسجيل الخروج: " + error.message;
    return;
  }

  location.reload();
};

// إضافة منتج
document.getElementById("saveBtn").onclick = async () => {
  const name = document.getElementById("name").value.trim();
  const description = document.getElementById("description").value.trim();
  const price = Number(document.getElementById("price").value);
  const category = document.getElementById("category").value.trim();
  const imageFile = document.getElementById("image").files[0];

  if (!name || !price || price <= 0 || !category) {
    message.textContent = "اكتبي اسم المنتج والسعر والقسم بشكل صحيح";
    return;
  }

  const saveButton = document.getElementById("saveBtn");

  saveButton.disabled = true;
  message.textContent = "جاري حفظ المنتج...";

  try {
    let image_url = "";

    // رفع الصورة إذا تم اختيارها
    if (imageFile) {
      const filePath = Date.now() + "-" + imageFile.name;

      const { error: uploadError } = await db.storage
        .from("product-images")
        .upload(filePath, imageFile);

      if (uploadError) {
        message.textContent =
          "خطأ رفع الصورة: " + uploadError.message;
        return;
      }

      const { data: imageData } = db.storage
        .from("product-images")
        .getPublicUrl(filePath);

      image_url = imageData.publicUrl;
    }

    // حفظ بيانات المنتج
    const { error } = await db.from("products").insert([{
      name,
      description,
      price,
      category,
      image_url,
      is_active: true
    }]);

    if (error) {
      message.textContent =
        "خطأ حفظ المنتج: " + error.message;
      return;
    }

    message.textContent = "تم حفظ المنتج بنجاح 🎉";

    document.getElementById("name").value = "";
    document.getElementById("description").value = "";
    document.getElementById("price").value = "";
    document.getElementById("category").value = "";
    document.getElementById("image").value = "";

    loadAdminProducts();

  } catch (error) {
    message.textContent = "حدث خطأ: " + error.message;

  } finally {
    saveButton.disabled = false;
  }
};

// تحميل المنتجات
async function loadAdminProducts() {
  const area = document.getElementById("adminProducts");

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    area.textContent = "خطأ تحميل المنتجات: " + error.message;
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
      if (!confirm("متأكدة إنك عايزة تحذفي المنتج؟")) {
        return;
      }

      const { error } = await db
        .from("products")
        .delete()
        .eq("id", product.id);

      if (error) {
        message.textContent = "خطأ حذف المنتج: " + error.message;
      } else {
        message.textContent = "تم حذف المنتج";
        loadAdminProducts();
      }
    };

    item.append(title, price, deleteButton);
    area.appendChild(item);
  });
}

// التحقق من تسجيل الدخول عند فتح الصفحة
showDashboard();
