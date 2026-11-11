/* =========================================
   GIFTELLA ADMIN - COMPLETE VERSION
   ========================================= */

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const BUCKET = "product-images";

const $ = id => document.getElementById(id);

const loginSection = $("login");
const dashboard = $("dashboard");
const message = $("message");

function showMessage(text) {
  message.textContent = text;
}

// =========================================
// ضغط الصور
// =========================================

async function compressImage(file) {
  const image = new Image();
  const imageURL = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = imageURL;
    });

    const maxSize = 1600;
    const ratio = Math.min(
      1,
      maxSize / Math.max(image.width, image.height)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذر تجهيز الصورة");

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, "image/webp", 0.80);
    });

    if (!blob) throw new Error("فشل ضغط الصورة");

    return new File(
      [blob],
      file.name.replace(/\.[^.]+$/, "") + ".webp",
      { type: "image/webp" }
    );

  } finally {
    URL.revokeObjectURL(imageURL);
  }
}

// =========================================
// تسجيل الدخول
// =========================================

$("loginBtn").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const button = $("loginBtn");

  if (!email || !password) {
    showMessage("اكتبي الإيميل وكلمة المرور");
    return;
  }

  button.disabled = true;
  showMessage("جاري تسجيل الدخول...");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (!data.session) {
      throw new Error("لم يتم إنشاء جلسة دخول");
    }

    await showDashboard();

  } catch (error) {
    showMessage("فشل الدخول: " + error.message);
  } finally {
    button.disabled = false;
  }
};

// =========================================
// عرض لوحة التحكم
// =========================================

async function showDashboard() {
  loginSection.hidden = true;
  dashboard.hidden = false;

  showMessage("تم تسجيل الدخول بنجاح");

  await loadAdminProducts();
}

// استعادة تسجيل الدخول عند فتح الصفحة
(async function restoreSession() {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
      await showDashboard();
    }
  } catch (error) {
    showMessage("تعذر استعادة تسجيل الدخول: " + error.message);
  }
})();

// =========================================
// تسجيل الخروج
// =========================================

$("logoutBtn").onclick = async () => {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    location.reload();

  } catch (error) {
    showMessage("خطأ تسجيل الخروج: " + error.message);
  }
};

// =========================================
// رفع الصور
// =========================================

async function uploadProductImages(files) {
  const urls = [];

  for (const file of files) {
    showMessage("جاري ضغط ورفع الصور...");

    const compressedFile = await compressImage(file);

    const filePath =
      "compressed-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2) +
      ".webp";

    const { error } = await db.storage
      .from(BUCKET)
      .upload(filePath, compressedFile, {
        contentType: "image/webp",
        upsert: false
      });

    if (error) throw error;

    const { data } = db.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    if (!data?.publicUrl) {
      throw new Error("تعذر إنشاء رابط الصورة");
    }

    urls.push(data.publicUrl);
  }

  return urls;
}

// =========================================
// إضافة منتج
// =========================================

$("saveBtn").onclick = async () => {
  const button = $("saveBtn");

  const name = $("name").value.trim();
  const description = $("description").value.trim();
  const price = Number($("price").value);
  const originalValue = $("originalPrice").value.trim();
  const original_price = originalValue
    ? Number(originalValue)
    : null;
  const category = $("category").value.trim();

  const is_best_seller = $("bestSeller").checked;
  const is_new = $("isNew").checked;

  const files = Array.from($("images").files || []);

  if (!name || !Number.isFinite(price) || price <= 0) {
    showMessage("اكتبي اسم المنتج وسعر صحيح");
    return;
  }

  if (
    original_price !== null &&
    (!Number.isFinite(original_price) || original_price <= price)
  ) {
    showMessage("السعر قبل الخصم لازم يكون أكبر من السعر الحالي");
    return;
  }

  if (files.length === 0) {
    showMessage("اختاري صورة واحدة على الأقل");
    return;
  }

  button.disabled = true;

  try {
    const images = await uploadProductImages(files);

    const product = {
      name,
      description,
      price,
      original_price,
      category,
      image_url: images[0],
      images,
      is_active: true,
      is_best_seller,
      is_new
    };

    const { error } = await db
      .from("products")
      .insert([product]);

    if (error) throw error;

    showMessage("تم حفظ المنتج بنجاح");

    $("name").value = "";
    $("description").value = "";
    $("price").value = "";
    $("originalPrice").value = "";
    $("category").value = "";
    $("images").value = "";
    $("bestSeller").checked = false;
    $("isNew").checked = false;

    await loadAdminProducts();

  } catch (error) {
    showMessage("تعذر حفظ المنتج: " + error.message);
  } finally {
    button.disabled = false;
  }
};

// =========================================
// تحميل المنتجات
// =========================================

async function loadAdminProducts() {
  const container = $("adminProducts");

  container.innerHTML = "جاري تحميل المنتجات...";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    container.innerHTML = "";

    if (!data || data.length === 0) {
      container.textContent = "لا توجد منتجات حاليًا";
      return;
    }

    data.forEach(product => {
      const card = document.createElement("div");

      card.style.cssText = `
        border:1px solid #ddd;
        border-radius:12px;
        padding:12px;
        margin:12px 0;
        background:#fff;
      `;

      const title = document.createElement("h3");
      title.textContent = product.name || "منتج بدون اسم";

      const price = document.createElement("p");
      price.textContent = "السعر: " + product.price + " جنيه";

      const category = document.createElement("p");
      category.textContent = "القسم: " + (product.category || "");

      const status = document.createElement("p");
      status.textContent =
        (product.is_best_seller ? "⭐ الأكثر مبيعًا " : "") +
        (product.is_new ? "💗 NEW" : "");

      const editButton = document.createElement("button");
      editButton.textContent = "تعديل";
      editButton.onclick = () => editProduct(product);

      const deleteButton = document.createElement("button");
      deleteButton.textContent = "حذف";
      deleteButton.style.marginRight = "8px";
      deleteButton.style.background = "#c13f87";
      deleteButton.style.color = "#fff";
      deleteButton.onclick = () => deleteProduct(product);

      card.append(
        title,
        price,
        category,
        status,
        editButton,
        deleteButton
      );

      container.appendChild(card);
    });

  } catch (error) {
    container.textContent = "تعذر تحميل المنتجات: " + error.message;
  }
}

// =========================================
// تعديل منتج
// =========================================

async function editProduct(product) {
  const name = prompt("اسم المنتج:", product.name || "");
  if (name === null) return;

  const priceText = prompt("السعر:", product.price);
  if (priceText === null) return;

  const price = Number(priceText);

  if (!name.trim() || !Number.isFinite(price) || price <= 0) {
    alert("الاسم والسعر غير صحيحين");
    return;
  }

  const description = prompt(
    "وصف المنتج:",
    product.description || ""
  );
  if (description === null) return;

  const category = prompt(
    "القسم:",
    product.category || ""
  );
  if (category === null) return;

  const bestSeller = confirm(
    "هل تريدين وضع المنتج ضمن الأكثر مبيعًا؟"
  );

  const isNew = confirm(
    "هل تريدين إظهار علامة NEW؟"
  );

  try {
    showMessage("جاري تعديل المنتج...");

    const { error } = await db
      .from("products")
      .update({
        name: name.trim(),
        price,
        description,
        category,
        is_best_seller: bestSeller,
        is_new: isNew
      })
      .eq("id", product.id);

    if (error) throw error;

    showMessage("تم تعديل المنتج بنجاح");
    await loadAdminProducts();

  } catch (error) {
    showMessage("تعذر تعديل المنتج: " + error.message);
  }
}

// =========================================
// حذف منتج
// =========================================

async function deleteProduct(product) {
  if (!confirm("متأكدة إنك عايزة تحذفي المنتج؟")) return;

  try {
    showMessage("جاري حذف المنتج...");

    const { error } = await db
      .from("products")
      .delete()
      .eq("id", product.id);

    if (error) throw error;

    showMessage("تم حذف المنتج بنجاح");
    await loadAdminProducts();

  } catch (error) {
    showMessage("تعذر حذف المنتج: " + error.message);
  }
}

// =========================================
// استيراد CSV
// =========================================

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

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

  if (!rows.length) return [];

  const headers = rows.shift().map(h => h.toLowerCase());

  return rows.map(values =>
    Object.fromEntries(
      headers.map((h, i) => [h, values[i] || ""])
    )
  );
}

$("importBtn").onclick = async () => {
  const file = $("productsCSV").files[0];

  if (!file) {
    alert("اختاري ملف CSV أولًا");
    return;
  }

  const button = $("importBtn");
  button.disabled = true;

  try {
    showMessage("جاري استيراد المنتجات...");

    const rows = parseCSV(await file.text());

    const products = rows.map(p => ({
      name: p.name,
      description: p.description || "",
      price: Number(p.price),
      original_price: p.original_price
        ? Number(p.original_price)
        : null,
      category: p.category || "",
      image_url: p.image_url || null,
      images: p.image_url ? [p.image_url] : [],
      is_active: true,
      is_best_seller: ["true", "1", "yes"].includes(
        (p.is_best_seller || "").toLowerCase()
      ),
      is_new: ["true", "1", "yes"].includes(
        (p.is_new || "").toLowerCase()
      )
    }));

    if (
      products.some(p =>
        !p.name ||
        !Number.isFinite(p.price) ||
        p.price <= 0
      )
    ) {
      throw new Error("يوجد منتج بدون اسم أو بسعر غير صحيح");
    }

    const { error } = await db
      .from("products")
      .insert(products);

    if (error) throw error;

    showMessage("تم استيراد المنتجات بنجاح");
    $("productsCSV").value = "";

    await loadAdminProducts();

  } catch (error) {
    showMessage("فشل الاستيراد: " + error.message);
  } finally {
    button.disabled = false;
  }
};

// =========================================
// ضغط الصور القديمة
// =========================================

$("compressOldImagesBtn").onclick = async () => {
  const button = $("compressOldImagesBtn");
  const progress = $("compressionProgress");

  if (!confirm("هنضغط الصور القديمة ونحدّث روابطها. نكمل؟")) {
    return;
  }

  button.disabled = true;

  try {
    const { data: products, error } = await db
      .from("products")
      .select("id, image_url, images");

    if (error) throw error;

    let success = 0;
    let failed = 0;
    let skipped = 0;
    let compressedCount = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      const oldImages = Array.isArray(product.images)
        ? product.images
        : product.image_url
          ? [product.image_url]
          : [];

      const uniqueImages = [...new Set(oldImages)];

      if (!uniqueImages.length) {
        skipped++;
        continue;
      }

      if (uniqueImages.every(url => url.includes("compressed-") || url.endsWith(".webp"))) {
        skipped++;
        continue;
      }

      try {
        const newUrls = [];

        for (const imageUrl of uniqueImages) {
          if (imageUrl.includes("compressed-") || imageUrl.endsWith(".webp")) {
            newUrls.push(imageUrl);
            continue;
          }

          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error("تعذر تحميل الصورة");

          const originalFile = new File(
            [await response.blob()],
            "old-image.jpg",
            { type: "image/jpeg" }
          );

          const compressedFile = await compressImage(originalFile);

          const newPath =
            "compressed-" +
            Date.now() +
            "-" +
            Math.random().toString(36).slice(2) +
            ".webp";

          const { error: uploadError } = await db.storage
            .from(BUCKET)
            .upload(newPath, compressedFile, {
              contentType: "image/webp",
              upsert: false
            });

          if (uploadError) throw uploadError;

          const { data } = db.storage
            .from(BUCKET)
            .getPublicUrl(newPath);

          newUrls.push(data.publicUrl);
          compressedCount++;
        }

        const { error: updateError } = await db
          .from("products")
          .update({
            image_url: newUrls[0],
            images: newUrls
          })
          .eq("id", product.id);

        if (updateError) throw updateError;

        success++;

      } catch (error) {
        failed++;
        console.error(error);
      }

      progress.textContent =
        "تمت معالجة " + (i + 1) + " من " + products.length +
        " | نجح: " + success +
        " | فشل: " + failed +
        " | بدون صور: " + skipped +
        " | صور مضغوطة: " + compressedCount;
    }

    showMessage(
      "انتهى الضغط. نجح: " + success +
      " | فشل: " + failed +
      " | صور جديدة: " + compressedCount
    );

  } catch (error) {
    showMessage("حدث خطأ: " + error.message);
  } finally {
    button.disabled = false;
  }
};

// =========================================
// حذف الصور القديمة غير المستخدمة
// =========================================

$("deleteOldImagesBtn").onclick = async () => {
  const button = $("deleteOldImagesBtn");
  const progress = $("deleteOldImagesProgress");

  if (!confirm("هنفحص الصور القديمة الأول. نكمل؟")) return;

  button.disabled = true;
  progress.textContent = "جاري فحص الصور...";

  try {
    const { data: products, error } = await db
      .from("products")
      .select("image_url, images");

    if (error) throw error;

    if (!products || products.length === 0) {
      throw new Error("لم نتمكن من قراءة المنتجات. أوقفنا الحذف للحماية.");
    }

    const usedPaths = new Set();
    const marker = "/storage/v1/object/public/" + BUCKET + "/";

    function addUsedUrl(url) {
      if (!url) return;

      if (typeof url !== "string") {
        throw new Error("رابط صورة غير مفهوم");
      }

      let parsed;

      try {
        parsed = new URL(url);
      } catch {
        throw new Error("رابط صورة غير صالح");
      }

      const index = parsed.pathname.indexOf(marker);
      if (index === -1) return;

      const path = decodeURIComponent(
        parsed.pathname.slice(index + marker.length)
      );

      if (!path) throw new Error("مسار صورة فارغ");

      usedPaths.add(path);
    }

    for (const product of products) {
      addUsedUrl(product.image_url);

      if (Array.isArray(product.images)) {
        product.images.forEach(addUsedUrl);
      }
    }

    const { data: files, error: listError } = await db.storage
      .from(BUCKET)
      .list("", {
        limit: 1000,
        offset: 0
      });

    if (listError) throw listError;

    if (!files || files.length === 0) {
      throw new Error("تعذر قراءة ملفات التخزين. لم نحذف أي صورة.");
    }

    const oldFiles = files
      .filter(file => file.id != null)
      .filter(file => /\.(jpe?g|png)$/i.test(file.name))
      .map(file => file.name);

    const unused = oldFiles.filter(path => !usedPaths.has(path));

    progress.textContent =
      "الصور القديمة: " + oldFiles.length +
      " | غير المستخدمة: " + unused.length;

    if (!unused.length) {
      showMessage("لا توجد صور قديمة غير مستخدمة.");
      return;
    }

    if (!confirm(
      "وجدنا " + unused.length +
      " صورة قديمة غير مستخدمة. هل توافقين على حذفها نهائيًا؟"
    )) {
      showMessage("تم إلغاء الحذف");
      return;
    }

    const { error: deleteError } = await db.storage
      .from(BUCKET)
      .remove(unused);

    if (deleteError) throw deleteError;

    showMessage("تم حذف " + unused.length + " صورة قديمة غير مستخدمة.");

  } catch (error) {
    showMessage("تعذر حذف الصور: " + error.message);
    console.error(error);
  } finally {
    button.disabled = false;
  }
};
