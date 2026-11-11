
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

// =========================================
// رسائل لوحة التحكم
// =========================================

function showMessage(text) {
  message.textContent = text;
}

// =========================================
// ضغط الصور إلى WebP
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

    if (!ctx) {
      throw new Error("تعذر تجهيز الصورة للضغط");
    }

    ctx.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const blob = await new Promise(resolve => {
      canvas.toBlob(
        resolve,
        "image/webp",
        0.80
      );
    });

    if (!blob) {
      throw new Error("فشل ضغط الصورة");
    }

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
  const loginBtn = document.getElementById("loginBtn");

  try {
    loginBtn.disabled = true;
    showMessage("جاري تسجيل الدخول...");

    if (!email || !password) {
      showMessage("من فضلك اكتبي الإيميل وكلمة المرور");
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
      showMessage("لم يتم إنشاء جلسة دخول. حاولي مرة أخرى.");
      return;
    }

    showMessage("تم تسجيل الدخول بنجاح");
    await showDashboard();

  } catch (error) {
    showMessage("حصل خطأ: " + error.message);
    console.error(error);

  } finally {
    loginBtn.disabled = false;
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

    } else if (
      (c === "\n" || c === "\r") &&
      !quoted
    ) {
      if (c === "\r" && text[i + 1] === "\n") {
        i++;
      }

      row.push(field.trim());

      if (row.some(v => v !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";

    } else {
      field += c;
    }
  }

  row.push(field.trim());

  if (row.some(v => v !== "")) {
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(h => h.toLowerCase());

  return rows.map(values =>
    Object.fromEntries(
      headers.map((h, i) => [h, values[i] || ""])
    )
  );
}

document.getElementById("importBtn").addEventListener(
  "click",
  async () => {
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

      if (
        !products.length ||
        products.some(p =>
          !p.name ||
          !Number.isFinite(p.price) ||
          p.price <= 0
        )
      ) {
        alert("تأكدي من أسماء المنتجات وأسعارها");
        return;
      }

      const { error } = await db
        .from("products")
        .insert(products);

      if (error) throw error;

      alert("تم استيراد المنتجات بنجاح");

      document.getElementById("productsCSV").value = "";

      loadAdminProducts();

    } catch (error) {
      alert("حصل خطأ أثناء الاستيراد: " + error.message);
    }
  }
);

// =========================================
// زر ضغط الصور القديمة
// =========================================

function createOptimizeButton() {
  if (document.getElementById("optimizeImagesBtn")) {
    return;
  }

  const button = document.createElement("button");

  button.id = "optimizeImagesBtn";
  button.textContent = "ضغط الصور القديمة وتوفير المساحة";

  button.style.cssText = `
    display:block;
    width:100%;
    margin:15px 0;
    padding:14px;
    background:#8050a8;
    color:white;
    border:0;
    border-radius:12px;
    font-size:16px;
    font-weight:bold;
    cursor:pointer;
  `;

  dashboard.insertBefore(button, dashboard.firstChild);

  button.onclick = optimizeOldImages;
}

// =========================================
// استخراج مسار الصورة من رابط Supabase
// =========================================

function getStoragePathFromUrl(url) {
  if (typeof url !== "string") return null;

  try {
    const pathname = new URL(url).pathname;

    const markers = [
      `/storage/v1/object/public/${BUCKET}/`,
      `/storage/v1/object/sign/${BUCKET}/`,
      `/storage/v1/render/image/public/${BUCKET}/`
    ];

    for (const marker of markers) {
      const index = pathname.indexOf(marker);

      if (index !== -1) {
        return decodeURIComponent(
          pathname.slice(index + marker.length)
        );
      }
    }

    return null;

  } catch {
    return null;
  }
}

// =========================================
// قراءة الصور من التخزين
// مع دعم المجلدات الفرعية
// =========================================

async function listAllStorageFiles(folder = "", result = []) {
  let offset = 0;

  while (true) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(folder, {
        limit: 100,
        offset,
        sortBy: {
          column: "name",
          order: "asc"
        }
      });

    if (error) throw error;

    if (!data || !data.length) break;

    for (const item of data) {
      const path = folder
        ? `${folder}/${item.name}`
        : item.name;

      if (item.id) {
        result.push({
          ...item,
          fullPath: path
        });

      } else {
        await listAllStorageFiles(path, result);
      }
    }

    if (data.length < 100) break;

    offset += 100;
  }

  return result;
}

// =========================================
// تجهيز الصور الموجودة داخل المنتج
// =========================================

function getProductImages(product) {
  if (Array.isArray(product.images)) {
    return product.images;
  }

  if (typeof product.images === "string") {
    try {
      const parsed = JSON.parse(product.images);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [product.images];
    }
  }

  return [];
}

// =========================================
// ضغط الصور القديمة
// =========================================

async function optimizeOldImages() {
  const button = document.getElementById("optimizeImagesBtn");

  const confirmed = confirm(
    "سيتم ضغط الصور القديمة وتحديث روابط المنتجات، " +
    "ثم حذف الصور الأصلية بعد نجاح التحديث. " +
    "تأكدي من عدم إغلاق الصفحة أثناء العملية. هل نبدأ؟"
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "جاري ضغط الصور...";

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  const bucket = db.storage.from(BUCKET);

  try {
    showMessage("جاري قراءة المنتجات...");

    const { data: products, error: productsError } = await db
      .from("products")
      .select("id,image_url,images");

    if (productsError) throw productsError;

    showMessage("جاري قراءة الصور من التخزين...");

    const files = await listAllStorageFiles();

    const imageFiles = files.filter(file =>
      /\.(jpg|jpeg|png|webp)$/i.test(file.name) &&
      !file.fullPath.startsWith("optimized/")
    );

    if (!imageFiles.length) {
      showMessage("لم يتم العثور على صور تحتاج إلى المعالجة.");
      return;
    }

    for (let i = 0; i < imageFiles.length; i++) {
      const item = imageFiles[i];

      let newPath = null;
      let uploaded = false;
      let updatedAny = false;

      try {
        const oldPath = item.fullPath;

        const affected = products.filter(product => {
          const mainPath = getStoragePathFromUrl(
            product.image_url
          );

          const extraPaths = getProductImages(product)
            .map(getStoragePathFromUrl);

          return (
            mainPath === oldPath ||
            extraPaths.includes(oldPath)
          );
        });

        if (!affected.length) {
          skipped++;
          continue;
        }

        showMessage(
          `جاري ضغط الصورة ${i + 1} من ${imageFiles.length}...`
        );

        const { data: originalBlob, error: downloadError } =
          await bucket.download(oldPath);

        if (downloadError) throw downloadError;

        const originalFile = new File(
          [originalBlob],
          item.name,
          {
            type: originalBlob.type || "image/jpeg"
          }
        );

        const compressedFile = await compressImage(originalFile);

        if (compressedFile.size >= originalBlob.size) {
          skipped++;
          continue;
        }

        newPath =
          "optimized/" +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2) +
          ".webp";

        const { error: uploadError } = await bucket.upload(
          newPath,
          compressedFile,
          {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: false
          }
        );

        if (uploadError) throw uploadError;

        uploaded = true;

        const { data: newData } = bucket.getPublicUrl(newPath);
        const newUrl = newData.publicUrl;

        // تحديث روابط كل المنتجات المرتبطة بالصورة
        for (const product of affected) {
          const mainPath = getStoragePathFromUrl(
            product.image_url
          );

          const oldImages = getProductImages(product);

          const newImages = oldImages.map(url =>
            getStoragePathFromUrl(url) === oldPath
              ? newUrl
              : url
          );

          const newImageUrl =
            mainPath === oldPath
              ? newUrl
              : product.image_url;

          const { error: updateError } = await db
            .from("products")
            .update({
              image_url: newImageUrl,
              images: newImages
            })
            .eq("id", product.id);

          if (updateError) throw updateError;

          updatedAny = true;

          // تحديث النسخة المحلية
          product.image_url = newImageUrl;
          product.images = newImages;
        }

        // التأكد من أن كل المنتجات أصبحت تستخدم الصورة الجديدة
        const remainingReferences = products.some(product => {
          if (
            getStoragePathFromUrl(product.image_url) === oldPath
          ) {
            return true;
          }

          return getProductImages(product).some(
            url => getStoragePathFromUrl(url) === oldPath
          );
        });

        if (remainingReferences) {
          skipped++;
          continue;
        }

        // حذف الصورة الأصلية بعد تحديث جميع الروابط
        const { error: deleteError } = await bucket.remove([
          oldPath
        ]);

        if (deleteError) {
          skipped++;
          console.error("تعذر حذف الصورة الأصلية:", oldPath, deleteError);
          continue;
        }

        completed++;

      } catch (error) {
        failed++;

        console.error(
          "خطأ في معالجة الصورة:",
          item.fullPath,
          error
        );

        // لا نحذف النسخة الجديدة إذا تم تحديث أي منتج إليها
        if (uploaded && newPath && !updatedAny) {
          await bucket.remove([newPath]);
        }
      }

      button.textContent =
        `تم ضغط ${completed} صورة`;

      showMessage(
        `التقدم: ${i + 1} من ${imageFiles.length} | ` +
        `تم ضغط: ${completed} | ` +
        `تم تخطي: ${skipped} | ` +
        `أخطاء: ${failed}`
      );
    }

    showMessage(
      `انتهت العملية. تم ضغط ${completed} صورة، ` +
      `وتخطي ${skipped} صورة، وأخطاء ${failed}.`
    );

    button.textContent = "إعادة فحص وضغط الصور القديمة";

    loadAdminProducts();

  } catch (error) {
    showMessage(
      "تعذر إكمال العملية: " + error.message
    );

    button.textContent = "إعادة المحاولة";

  } finally {
    button.disabled = false;
  }
}

// =========================================
// عرض لوحة التحكم
// =========================================

async function showDashboard() {
  const { data, error } = await db.auth.getSession();

  if (error || !data.session) {
    loginSection.hidden = false;
    dashboard.hidden = true;
    return;
  }

  loginSection.hidden = true;
  dashboard.hidden = false;

  createOptimizeButton();

  loadAdminProducts();
}

// =========================================
// تسجيل الخروج
// =========================================

document.getElementById("logoutBtn").onclick = async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    showMessage("خطأ تسجيل الخروج: " + error.message);
    return;
  }

  location.reload();
};

// =========================================
// إضافة منتج جديد
// =========================================

document.getElementById("saveBtn").onclick = async () => {
  const name = document.getElementById("name").value.trim();

  const description =
    document.getElementById("description").value.trim();

  const price = Number(
    document.getElementById("price").value
  );

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

  const imageFiles = Array.from(
    document.getElementById("images").files
  );

  if (
    !name ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !category
  ) {
    showMessage(
      "اكتبي اسم المنتج والسعر والقسم بشكل صحيح"
    );
    return;
  }

  if (
    original_price !== null &&
    (
      !Number.isFinite(original_price) ||
      original_price <= price ||
      original_price <= 0
    )
  ) {
    showMessage(
      "السعر قبل الخصم لازم يكون أكبر من السعر الحالي"
    );
    return;
  }

  const saveButton = document.getElementById("saveBtn");

  saveButton.disabled = true;

  showMessage("جاري حفظ المنتج...");

  try {
    const images = [];

    for (const imageFile of imageFiles) {
      showMessage("جاري ضغط ورفع الصور...");

      const compressedFile = await compressImage(imageFile);

      const filePath =
        Date.now() +
        "-" +
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

      const { data: imageData } = db.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      images.push(imageData.publicUrl);
    }

    const image_url = images[0] || "";

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

    showMessage("تم حفظ المنتج بنجاح 🎉");

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
    showMessage("حدث خطأ: " + error.message);

  } finally {
    saveButton.disabled = false;
  }
};

// =========================================
// تعديل بيانات المنتج
// =========================================

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
    (
      !Number.isFinite(original_price) ||
      original_price <= price
    )
  ) {
    showMessage(
      "السعر قبل الخصم لازم يكون أكبر من السعر الحالي"
    );
    return;
  }

  const category = prompt(
    "القسم:",
    product.category
  );

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
    showMessage("خطأ تعديل المنتج: " + error.message);

  } else {
    showMessage("تم تعديل المنتج بنجاح");
    loadAdminProducts();
  }
}

// =========================================
// الأكثر مبيعًا
// =========================================

async function toggleBestSeller(product) {
  const { error } = await db
    .from("products")
    .update({
      is_best_seller: !product.is_best_seller
    })
    .eq("id", product.id);

  if (error) {
    showMessage(
      "خطأ تحديث الأكثر مبيعًا: " + error.message
    );

  } else {
    showMessage("تم تحديث حالة المنتج ⭐");
    loadAdminProducts();
  }
}

// =========================================
// NEW
// =========================================

async function toggleNew(product) {
  const { error } = await db
    .from("products")
    .update({
      is_new: !product.is_new
    })
    .eq("id", product.id);

  if (error) {
    showMessage(
      "خطأ تحديث NEW: " + error.message
    );

  } else {
    showMessage("تم تحديث علامة NEW 💗");
    loadAdminProducts();
  }
}

// =========================================
// تحميل المنتجات
// =========================================

async function loadAdminProducts() {
  const area = document.getElementById("adminProducts");

  area.textContent = "جاري تحميل المنتجات...";

  const
