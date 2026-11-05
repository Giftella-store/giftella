
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

// قراءة ملف CSV
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(v => v !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  row.push(field.trim());
  if (row.some(v => v !== "")) rows.push(row);

  const headers = rows.shift().map(h => h.toLowerCase());

  return rows.map(values =>
    Object.fromEntries(headers.map((h, i) => [h, values[i] || ""]))
  );
}

// استيراد المنتجات من CSV
document.getElementById("importBtn").addEventListener("click", async () => {
  const file = document.getElementById("productsCSV").files[0];

  if (!file) {
    alert("اختاري ملف CSV أولاً");
    return;
  }

  try {
    const text = await file.text();

    const products = parseCSV(text).map(p => ({
      name: p.name,
      description: p.description || "",
      price: Number(p.price),
      original_price: p.original_price
        ? Number(p.original_price)
        : null,
      category: p.category || "",
      image_url: p.image_url || null,

      is_best_seller: ["true", "1", "yes"].includes(
        (p.is_best_seller || "").toLowerCase()
      ),

      is_new: ["true", "1", "yes"].includes(
        (p.is_new || "").toLowerCase()
      ),

      is_active: true
    }));

    if (products.some(p =>
      !p.name || !Number.isFinite(p.price) || p.price <= 0
    )) {
      alert("تأكدي أن كل منتج له اسم وسعر صحيح");
      return;
    }

    const { error } = await db.from("products").insert(products);

    if (error) throw error;

    alert("تم استيراد المنتجات بنجاح");
    document.getElementById("productsCSV").value = "";
    loadAdminProducts();

  } catch (error) {
    alert("حصل خطأ أثناء الاستيراد: " + error.message);
  }
});

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

// إضافة منتج جديد
document.getElementById("saveBtn").onclick = async () => {
  const name = document.getElementById("name").value.trim();
  const description = document.getElementById("description").value.trim();
  const price = Number(document.getElementById("price").value);

  const originalInput =
    document.getElementById("originalPrice").value;

  const original_price = originalInput
    ? Number(originalInput)
    : null;

  const is_best_seller =
    document.getElementById("bestSeller").checked;

  const is_new =
    document.getElementById("isNew").checked;

  const category =
    document.getElementById("category").value.trim();

  const imageFiles =
    Array.from(document.getElementById("images").files);

  if (!name || !price || price <= 0 || !category) {
    message.textContent =
      "اكتبي اسم المنتج والسعر والقسم بشكل صحيح";
    return;
  }

  if (
    original_price !== null &&
    (original_price <= price || original_price <= 0)
  ) {
    message.textContent =
      "السعر قبل الخصم لازم يكون أكبر من السعر الحالي";
    return;
  }

  const saveButton = document.getElementById("saveBtn");
  saveButton.disabled = true;
  message.textContent = "جاري حفظ المنتج...";

  try {
    let image_url = "";
    let images = [];

    for (const imageFile of imageFiles) {
      const filePath =
        Date.now() + "-" +
        Math.random().toString(36).slice(2) + "-" +
        imageFile.name;

      const { error: uploadError } = await db.storage
        .from("product-images")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: imageData } = db.storage
        .from("product-images")
        .getPublicUrl(filePath);

      images.push(imageData.publicUrl);
    }

    image_url = images[0] || "";

    const { error } = await db.from("products").insert([{
      name,
      description,
      price,
      original_price,
      is_best_seller,
      is_new,
      category,
      image_url,
      images,
      is_active: true
    }]);

    if (error) throw error;

    message.textContent = "تم حفظ المنتج بنجاح 🎉";

    document.getElementById("name").value = "";
    document.getElementById("description").value = "";
    document.getElementById("price").value = "";
    document.getElementById("originalPrice").value = "";
    document.getElementById("bestSeller").checked = false;
    document.getElementById("isNew").checked = false;
    document.getElementById("category").value = "";
    document.getElementById("images").value = "";

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

  const description = prompt(
    "وصف المنتج:",
    product.description || ""
  );
  if (description === null) return;

  const priceText = prompt(
    "السعر الحالي بالجنيه:",
    product.price
  );
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

  if (
    original_price !== null &&
    (!original_price || original_price <= price)
  ) {
    message.textContent =
      "السعر قبل الخصم لازم يكون أكبر من السعر الحالي";
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
    message.textContent =
      "خطأ تعديل المنتج: " + error.message;
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
    message.textContent =
      "خطأ تحديث الأكثر مبيعًا: " + error.message;
  } else {
    message.textContent = "تم تحديث حالة المنتج ⭐";
    loadAdminProducts();
  }
}

// تشغيل أو إلغاء NEW
async function toggleNew(product) {
  const { error } = await db
    .from("products")
    .update({
      is_new: !product.is_new
    })
    .eq("id", product.id);

  if (error) {
    message.textContent =
      "خطأ تحديث NEW: " + error.message;
  } else {
    message.textContent = "تم تحديث علامة NEW 💗";
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
    area.textContent =
      "خطأ تحميل المنتجات: " + error.message;
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

    const statusLabels = [];

    if (product.is_best_seller) {
      statusLabels.push("⭐ الأكثر مبيعًا");
    }

    if (product.is_new) {
      statusLabels.push("💗 NEW");
    }

    status.textContent = statusLabels.length
      ? statusLabels.join(" | ")
      : "منتج عادي";

    // زر تعديل المنتج
    const editButton = document.createElement("button");
    editButton.textContent = "تعديل المنتج";
    editButton.onclick = () => editProduct(product);

    // زر الأكثر مبيعًا
    const bestSellerButton =
      document.createElement("button");

    bestSellerButton.textContent = product.is_best_seller
      ? "إلغاء الأكثر مبيعًا"
      : "تفعيل الأكثر مبيعًا";

    bestSellerButton.onclick =
      () => toggleBestSeller(product);

    // زر NEW
    const newButton = document.createElement("button");

    newButton.textContent = product.is_new
      ? "إلغاء NEW 💗"
      : "تفعيل NEW 💗";

    newButton.onclick = () => toggleNew(product);

    // زر حذف المنتج
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
        message.textContent =
          "خطأ حذف المنتج: " + error.message;
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
      newButton,
      deleteButton
    );

    area.appendChild(item);
  });
}

// التحقق من تسجيل الدخول عند فتح الصفحة
showDashboard();
    
