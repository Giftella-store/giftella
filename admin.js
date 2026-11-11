
/* =========================================
   GIFTELLA ADMIN
   ========================================= */

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const loginSection = document.getElementById("login");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("message");

const BUCKET = "product-images";

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

document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const button = document.getElementById("loginBtn");

  try {
    button.disabled = true;
    showMessage("جاري تسجيل الدخول...");

    if (!email || !password) {
      showMessage("اكتبي الإيميل وكلمة المرور");
      return;
    }

    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage("فشل الدخول: " + error.message);
      return;
    }

    if (!data.session) {
      showMessage("لم يتم إنشاء جلسة دخول");
      return;
    }

    await showDashboard();

  } catch (error) {
    showMessage("خطأ: " + error.message);
    console.error(error);

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

// =========================================
// تسجيل الخروج
// =========================================

document.getElementById("logoutBtn").onclick = async () => {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    location.reload();

  } catch (error) {
    showMessage("خطأ تسجيل الخروج: " + error.message);
  }
};

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

document.getElementById("importBtn").onclick = async () => {
  const file = document.getElementById("productsCSV").files[0];

  if (!file) {
    alert("اختاري ملف CSV أولاً");
    return;
  }

  try {
    showMessage("جاري استيراد المنتجات...");

    const products = parseCSV(await file.text()).map(p => ({
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

    if (
      !products.length ||
      products.some(p =>
        !p.name ||
        !Number.isFinite(p.price) ||
        p.price <= 0
      )
    ) {
      showMessage("راجعي أسماء المنتجات والأسعار في ملف CSV");
      return;
    }

    const { error } = await db.from("products").insert(products);
    if (error) throw error;

    document.getElementById("productsCSV").value = "";
    showMessage("تم استيراد المنتجات بنجاح");
    await loadAdminProducts();

  } catch (error) {
    showMessage("خطأ الاستيراد: " + error.message);
  }
};

// =========================================
// إضافة منتج
// =========================================

document.getElementById("saveBtn").onclick = async () => {
  const button = document.getElementById("saveBtn");

  const name = document.getElementById("name").value.trim();
  const description = document.getElementById("description").value.trim();
  const price = Number(document.getElementById("price").value);

  const originalInput =
    document.getElementById("originalPrice").value;

  const original_price = originalInput
    ? Number(originalInput)
    : null;

  const category = document.getElementById("category").value.trim();

  const is_best_seller =
    document.getElementById("bestSeller").checked;

  const is_new =
    document.getElementById("isNew").checked;

  const imageFiles = Array.from(
    document.getElementById("images").files
  );

  if (!name || !category || !Number.isFinite(price) || price <= 0) {
    showMessage("اكتبي اسم المنتج والسعر والقسم بشكل صحيح");
    return;
  }

  if (
    original_price !== null &&
    (!Number.isFinite(original_price) || original_price <= price)
  ) {
    showMessage("السعر قبل الخصم لازم يكون أكبر من السعر الحالي");
    return;
  }

  button.disabled = true;

  try {
    const images = [];

    for (const file of imageFiles) {
      showMessage("جاري ضغط ورفع الصور...");

      const compressedFile = await compressImage(file);

      const filePath =
        Date.now() + "-" +
        Math.random().toString(36).slice(2) +
        ".webp";

      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filePath, compressedFile, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data } = db.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      images.push(data.publicUrl);
    }

    const { error } = await db.from("products").insert([{
      name,
      description,
      price,
      original_price,
      is_best_seller,
      is_new,
      category,
      image_url: images[0] || "",
      images,
      is_active: true
    }]);

    if (error) throw error;

    showMessage("تم حفظ المنتج بنجاح");

    document.getElementById("name").value = "";
    document.getElementById("description").value = "";
    document.getElementById("price").value = "";
    document.getElementById("originalPrice").value = "";
    document.getElementById("bestSeller").checked = false;
    document.getElementById("isNew").checked = false;
    document.getElementById("category").value = "";
    document.getElementById("images").value = "";

    await loadAdminProducts();

  } catch (error) {
    showMessage("حدث خطأ: " + error.message);

  } finally {
    button.disabled = false;
  }
};

// =========================================
// تعديل منتج
// =========================================

async function editProduct(product) {
  const name = prompt("اسم المنتج:", product.name);
  if (name === null) return;

  const description = prompt(
    "وصف المنتج:",
    product.description || ""
  );
  if (description === null) return;

  const priceText = prompt("السعر الحالي:", product.price);
  if (priceText === null) return;

  const price = Number(priceText);
  if (!Number.isFinite(price) || price <= 0) {
    showMessage("السعر غير صحيح");
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
    (!Number.isFinite(original_price) || original_price <= price)
  ) {
    showMessage("السعر قبل الخصم لازم يكون أكبر من السعر الحالي");
    return;
  }

  const category = prompt("القسم:", product.category || "");
  if (category === null) return;

  try {
    const { error } = await db.from("products")
      .update({
        name: name.trim(),
        description: description.trim(),
        price,
        original_price,
        category: category.trim()
      })
      .eq("id", product.id);

    if (error) throw error;

    showMessage("تم تعديل المنتج");
    await loadAdminProducts();

  } catch (error) {
    showMessage("خطأ التعديل: " + error.message);
  }
}

// =========================================
// تحديث الأكثر مبيعًا و NEW
// =========================================

async function toggleProductField(product, field) {
  try {
    const { error } = await db.from("products")
      .update({ [field]: !product[field] })
      .eq("id", product.id);

    if (error) throw error;

    showMessage("تم تحديث المنتج");
    await loadAdminProducts();

  } catch (error) {
    showMessage("خطأ التحديث: " + error.message);
  }
}

// =========================================
// حذف منتج
// =========================================

async function deleteProduct(product) {
  if (!confirm("هل أنتِ متأكدة من حذف المنتج؟")) return;

  try {
    const { error } = await db.from("products")
      .delete()
      .eq("id", product.id);

    if (error) throw error;

    showMessage("تم حذف المنتج");
    await loadAdminProducts();

  } catch (error) {
    showMessage("خطأ الحذف: " + error.message);
  }
}

// =========================================
// تحميل المنتجات الحالية
// =========================================

async function loadAdminProducts() {
  const area = document.getElementById("adminProducts");
  area.textContent = "جاري تحميل المنتجات...";

  try {
    const { data: products, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    area.innerHTML = "";

    if (!products || !products.length) {
      area.textContent = "لا توجد منتجات حاليًا";
      return;
    }

    products.forEach(product => {
      const card = document.createElement("div");

      card.style.cssText = `
        border:1px solid #ead8ed;
        border-radius:12px;
        padding:12px;
        margin:12px 0;
        background:#fff;
      `;

      const title = document.createElement("h3");
      title.textContent = product.name || "بدون اسم";

      const details = document.createElement("p");
      details.textContent =
        `السعر: ${product.price} جنيه | القسم: ${product.category || ""}`;

      const status = document.createElement("p");
      status.textContent =
        `الأكثر مبيعًا: ${product.is_best_seller ? "نعم" : "لا"} | ` +
        `NEW: ${product.is_new ? "نعم" : "لا"}`;

      const editButton = document.createElement("button");
      editButton.textContent = "تعديل";
      editButton.onclick = () => editProduct(product);

      const bestButton = document.createElement("button");
      bestButton.textContent = product.is_best_seller
        ? "إلغاء الأكثر مبيعًا"
        : "⭐ الأكثر مبيعًا";
      bestButton.onclick = () =>
        toggleProductField(product, "is_best_seller");

      const newButton = document.createElement("button");
      newButton.textContent = product.is_new
        ? "إلغاء NEW"
        : "💗 NEW";
      newButton.onclick = () =>
        toggleProductField(product, "is_new");

      const deleteButton = document.createElement("button");
      deleteButton.textContent = "حذف المنتج";
      deleteButton.onclick = () => deleteProduct(product);

      card.append(
        title,
        details,
        status,
        editButton,
        bestButton,
        newButton,
        deleteButton
      );

      area.appendChild(card);
    });

  } catch (error) {
    area.textContent = "تعذر تحميل المنتجات: " + error.message;
    showMessage("خطأ تحميل المنتجات: " + error.message);
  }
}

// =========================================
// ضغط الصور القديمة دفعة واحدة
// =========================================

document.getElementById("compressOldImagesBtn").onclick = async () => {
  const button = document.getElementById("compressOldImagesBtn");
  const progress = document.getElementById("compressionProgress");

  if (!confirm(
    "هنضغط صور المنتجات القديمة كلها. الصور الأصلية لن تُحذف. هل نكمل؟"
  )) {
    return;
  }

  button.disabled = true;

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let compressedCount = 0;

  // يمنع رفع نفس الرابط أكثر من مرة خلال العملية
  const convertedImages = new Map();

  try {
    showMessage("جاري جلب المنتجات...");

    const { data: products, error } = await db
      .from("products")
      .select("id, image_url, images");

    if (error) throw error;

    const total = products.length;

    if (!total) {
      showMessage("لا توجد منتجات.");
      return;
    }

    for (let i = 0; i < total; i++) {
      const product = products[i];

      try {
        // نعتمد على images إذا كانت تحتوي صورًا،
        // وإلا نستخدم image_url كصورة أساسية.
        let imageUrls = [];

        if (
          Array.isArray(product.images) &&
          product.images.length > 0
        ) {
          imageUrls = product.images;
        } else if (product.image_url) {
          imageUrls = [product.image_url];
        }

        imageUrls = [
          ...new Set(
            imageUrls.filter(
              url => typeof url === "string" && url.trim() !== ""
            )
          )
        ];

        if (!imageUrls.length) {
          skipped++;
          continue;
        }

        const newUrls = [];

        for (const imageUrl of imageUrls) {
          // استخدم الرابط المحوّل سابقًا إن وجد
          if (convertedImages.has(imageUrl)) {
            newUrls.push(convertedImages.get(imageUrl));
            continue;
          }

          const marker = `/storage/v1/object/public/${BUCKET}/`;
          const url = new URL(imageUrl);

          if (!url.pathname.includes(marker)) {
            throw new Error(
              "رابط الصورة ليس من مجلد صور المنتجات"
            );
          }

          // الصور التي تنتهي بـ WebP تم ضغطها بالفعل
          if (url.pathname.toLowerCase().endsWith(".webp")) {
            convertedImages.set(imageUrl, imageUrl);
            newUrls.push(imageUrl);
            continue;
          }

          const encodedPath = url.pathname.split(marker)[1];

          if (!encodedPath) {
            throw new Error("تعذر تحديد مسار الصورة");
          }

          const oldPath = decodeURIComponent(encodedPath);

          const response = await fetch(imageUrl);

          if (!response.ok) {
            throw new Error("تعذر تحميل الصورة الأصلية");
          }

          const originalBlob = await response.blob();

          const originalFile = new File(
            [originalBlob],
            oldPath.split("/").pop() || "image.jpg",
            {
              type: originalBlob.type || "image/jpeg"
            }
          );

          const compressedFile = await compressImage(originalFile);

          const newPath =
            "compressed-" +
            Date.now() + "-" +
            Math.random().toString(36).slice(2) +
            ".webp";

          const { error: uploadError } = await db.storage
            .from(BUCKET)
            .upload(newPath, compressedFile, {
              contentType: "image/webp",
              cacheControl: "31536000",
              upsert: false
            });

          if (uploadError) throw uploadError;

          const { data: publicData } = db.storage
            .from(BUCKET)
            .getPublicUrl(newPath);

          if (!publicData || !publicData.publicUrl) {
            throw new Error("تعذر إنشاء رابط الصورة الجديدة");
          }

          convertedImages.set(imageUrl, publicData.publicUrl);
          newUrls.push(publicData.publicUrl);
          compressedCount++;
        }

        // لا نحدّث المنتج إلا بعد تجهيز كل صوره بنجاح
        const { error: updateError } = await db
          .from("products")
          .update({
            image_url: newUrls[0] || "",
            images: newUrls
          })
          .eq("id", product.id);

        if (updateError) throw updateError;

        success++;

      } catch (error) {
        failed++;
        console.error(
          "فشل تحويل المنتج:",
          product.id,
          error
        );
      }

      progress.textContent =
        `تمت معالجة ${i + 1} من ${total}` +
        ` | نجح: ${success}` +
        ` | فشل: ${failed}` +
        ` | بدون صور: ${skipped}` +
        ` | صور مضغوطة: ${compressedCount}`;
    }

    showMessage(
      `انتهى التحويل. ` +
      `منتجات نجحت: ${success} | ` +
      `منتجات فشلت: ${failed} | ` +
      `بدون صور: ${skipped} | ` +
      `صور مضغوطة: ${compressedCount}. ` +
      `الصور الأصلية لم تُحذف.`
    );

  } catch (error) {
    showMessage("حدث خطأ: " + error.message);
    console.error(error);

  } finally {
    button.disabled = false;
  }
};

// =========================================
// حذف الصور الأصلية القديمة غير المستخدمة
// =========================================

console.log("زر حذف الصور تم ربطه");
document.getElementById("deleteOldImagesBtn").onclick = async () => {
  const button = document.getElementById("deleteOldImagesBtn");
  const progress = document.getElementById("deleteOldImagesProgress");

  if (!confirm(
    "سيتم فحص صور المنتجات وحذف ملفات JPG وJPEG وPNG غير المستخدمة فقط. صور WebP لن تُحذف. هل تريدين المتابعة؟"
  )) return;

  button.disabled = true;
  progress.textContent = "جاري فحص المنتجات والصور...";

  try {
    // قراءة كل المنتجات على دفعات
    const products = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from("products")
        .select("image_url, images")
        .range(offset, offset + 499);

      if (error) throw error;
      products.push(...(data || []));
      if (!data || data.length < 500) break;
    }

    // استخراج مسارات الصور المستخدمة في المنتجات
    const usedPaths = new Set();
    const marker = `/storage/v1/object/public/${BUCKET}/`;

    function addUsedUrl(value) {
      if (typeof value !== "string" || !value.trim()) return;

      try {
        const url = new URL(value);
        const index = url.pathname.indexOf(marker);
        if (index === -1) return;

        const path = decodeURIComponent(
          url.pathname.slice(index + marker.length)
        );

        if (path) usedPaths.add(path);
      } catch (_) {}
    }

    for (const product of products) {
      addUsedUrl(product.image_url);

      let images = product.images;

      if (typeof images === "string") {
        try { images = JSON.parse(images); }
        catch (_) { images = []; }
      }

      if (Array.isArray(images)) {
        images.forEach(addUsedUrl);
      }
    }

    // جلب كل ملفات التخزين، بما فيها المجلدات والصفحات التالية
    const allFiles = [];

    async function scanFolder(folder = "") {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await db.storage
          .from(BUCKET)
          .list(folder, {
            limit: 100,
            offset,
            sortBy: { column: "name", order: "asc" }
          });

        if (error) throw error;

        for (const item of data || []) {
          const path = folder
            ? `${folder}/${item.name}`
            : item.name;

          if (item.id === null) {
            await scanFolder(path);
          } else {
            allFiles.push(path);
          }
        }

        if (!data || data.length < 100) break;
      }
    }

    await scanFolder("");

    // تحديد الصور القديمة غير المرتبطة بأي منتج
    const oldFiles = allFiles.filter(path =>
      /\.(jpg|jpeg|png)$/i.test(path) &&
      !usedPaths.has(path)
    );

    const keptFiles = allFiles.filter(path =>
      /\.(jpg|jpeg|png)$/i.test(path) &&
      usedPaths.has(path)
    );

    if (!oldFiles.length) {
      progress.textContent =
        `لا توجد صور قديمة غير مستخدمة. الصور القديمة المستخدمة التي احتفظنا بها: ${keptFiles.length}`;
      return;
    }

    if (!confirm(
      `تم العثور على ${oldFiles.length} صورة قديمة غير مستخدمة.\n` +
      `وسيتم الاحتفاظ بـ ${keptFiles.length} صورة قديمة ما زالت مرتبطة بمنتجات.\n\n` +
      `هل توافقين على حذف الصور غير المستخدمة فقط؟`
    )) {
      progress.textContent = "تم إلغاء الحذف، ولم يتم حذف أي صورة.";
      return;
    }

    // الحذف على دفعات
    let deleted = 0;

    for (let i = 0; i < oldFiles.length; i += 50) {
      const batch = oldFiles.slice(i, i + 50);

      const { error } = await db.storage
        .from(BUCKET)
        .remove(batch);

      if (error) throw error;

      deleted += batch.length;
      progress.textContent =
        `تم حذف ${deleted} من ${oldFiles.length} صورة قديمة...`;
    }

    progress.textContent =
      `اكتمل الحذف بنجاح. تم حذف ${deleted} صورة قديمة غير مستخدمة، والاحتفاظ بـ ${keptFiles.length} صورة قديمة مرتبطة بمنتجات. صور WebP لم تُمس.`;

    showMessage("تم حذف الصور الأصلية القديمة غير المستخدمة بنجاح.");

  } catch (error) {
    progress.textContent = "تعذر إكمال العملية: " + error.message;
    showMessage("خطأ الحذف: " + error.message);
    console.error(error);

  } finally {
    button.disabled = false;
  }
};

// =========================================
// التحقق من جلسة الدخول عند فتح الصفحة
// =========================================

(async function initializeAdmin() {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
      await showDashboard();
    } else {
      loginSection.hidden = false;
      dashboard.hidden = true;
    }

  } catch (error) {
    loginSection.hidden = false;
    dashboard.hidden = true;
    showMessage("تعذر الاتصال: " + error.message);
    console.error(error);
  }
})();
