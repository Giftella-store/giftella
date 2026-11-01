
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
  const originalInput = document.getElementById("originalPrice").value;
  const original_price = originalInput ? Number(originalInput) : null;
  const is_best_seller = document.getElementById("bestSeller").checked;
  const category = document.getElementById("category").value.trim();
  const imageFile = document.getElementById("image").files[0];

  if (!name || !price || price <= 0 || !category) {
    message.textContent = "اكتبي اسم المنتج والسعر والقسم بشكل صحيح";
    return;
  }

  if (original_price !== null &&
      (original_price <= price || original_price <= 0)) {
    message.textContent = "السعر قبل الخصم لازم يكون أكبر من السعر الحالي";
    return;
  }

  const saveButton = document.getElementById("saveBtn");
  saveButton.disabled = true;
  message.textContent = "جاري حفظ المنتج...";

  try {
    let image_url = "";

    if (imageFile) {
      const filePath = Date.now() + "-" + imageFile.name;

      const { error: uploadError } = await db.storage
        .from("product-images")
        .upload(filePath, imageFile);

      if (uploadError) {
        message.textContent = "خطأ رفع الصورة: " + uploadError.message;
        return;
      }

      const { data: imageData } = db.storage
        .from("product-images")
        .getPublicUrl(filePath);

      image_url = imageData.publicUrl;
    }

    const { error } = await db.from("products").insert([{
      name,
      description,
      price,
      original_price,
      is_best_seller,
      category,
      image_url,
      is_active: true
    }]);

    if (error) {
      message.textContent = "خطأ حفظ المنتج: " + error.message;
      return;
    }

    message.textContent = "تم حفظ المنتج بنجاح 🎉";

    document.getElementById("name").value = "";
    document.getElementById("description").value = "";
    document.getElementById("price").value = "";
    document.getElementById("originalPrice").value = "";
    document.getElementById("bestSeller").checked = false;
    document.getElementById("category").value = "";
    document.getElementById("image").value = "";

    loadAdminProducts();

  } catch (error) {
    message.textContent = "حدث خطأ: " + error.message;
  } finally {
    saveButton.disabled = false;
  }
};

// تعديل بيانات المنتج
async function editProduct(product) {
  const name = prompt("اسم المنتج:", product.name);
  if (name === null) return;

  const description = prompt("وصف المنتج:", product.description || "");
  if (description === null) return;

  const priceText = prompt("السعر الحالي بالجنيه:", product.price);
  if (priceText === null) return;

  const price = Number(priceText);
  if (!price || price <= 0) {
    message.textContent = "السعر غير صحيح";
    return;
  }

  const originalText = prompt(
    "السعر قبل الخصم (اتركيه فارغًا بدون خصم):",
    product.original_price ?? ""
  );
  if (originalText === null) return;

  const original_price = originalText.trim() === ""
    ? null
    : Number(originalText);

  if (original_price !== null &&
      (!original_price || original_price <= price)) {
    message.textContent = "السعر قبل الخصم لازم يكون أكبر من السعر الحالي";
    return;
  }

  const category = prompt("القسم:", product.category);
  if (category === null) return;

  const { error } = await db
    .from("products")
    .update({
      name: name.trim(),
      description: description.trim(),
      price,
      original_price,
      category: category.trim()
    })
    .eq("id", product.id);

  if (error) {
    message.textContent = "خطأ تعديل المنتج: " + error.message;
  } else {
    message.textContent = "تم تعديل المنتج بنجاح";
    loadAdminProducts();
  }
}

// تشغيل أو إلغاء الأكثر مبيعًا
async function toggleBestSeller(product) {
  const { error } = await db
    .from("products")
    .update({
      is_best_seller: !product.is_best_seller
    })
    .eq("id", product.id);

  if (error) {
    message.textContent = "خطأ تحديث الأكثر مبيعًا: " + error.message;
  } else {
    message.textContent = "تم تحديث حالة المنتج ⭐";
    loadAdminProducts();
  }
}

// تحميل المنتجات
async function loadAdminProducts() {
  const area = document.getElementById("adminProducts");
  area.textContent = "جاري تحميل المنتجات...";

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
    item.style.borderRadius = "10px";

    const title = document.createElement("strong");
    title.textContent = product.name;

    const price = document.createElement("p");
    price.textContent = product.original_price
      ? `قبل الخصم: ${product.original_price} جنيه — بعد الخصم: ${product.price} جنيه`
      : `${product.price} جنيه`;

    const status = document.createElement("p");
    status.textContent = product.is_best_seller
      ? "⭐ الأكثر مبيعًا"
      : "ليس ضمن الأكثر مبيعًا";

    const editButton = document.createElement("button");
    editButton.textContent = "تعديل المنتج";
    editButton.onclick = () => editProduct(product);

    const bestSellerButton = document.createElement("button");
    bestSellerButton.textContent = product.is_best_seller
      ? "إلغاء الأكثر مبيعًا"
      : "تفعيل الأكثر مبيعًا";
    bestSellerButton.onclick = () => toggleBestSeller(product);

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "حذف المنتج";

    deleteButton.onclick = async () => {
      if (!confirm("متأكدة إنك عايزة تحذفي المنتج؟")) return;

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

    item.append(
      title,
      price,
      status,
      editButton,
      bestSellerButton,
      deleteButton
    );

    area.appendChild(item);
  });
}

// التحقق من تسجيل الدخول عند فتح الصفحة
showDashboard();
