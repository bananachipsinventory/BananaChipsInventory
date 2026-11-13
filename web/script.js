
const $ = (selector) => document.querySelector(selector);

let products = [];
let transactions = [];

const rupiah = (value) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);

const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

function todayISO() {
    const date = new Date();
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function showToast(message, type = "success") {
    const container = $("#toast-container");
    const toast = document.createElement("div");

    toast.className = `toast ${type === "error" ? "error" : ""}`;

    toast.innerHTML = `
        <span class="toast-icon">${type === "error" ? "⚠️" : "🌿"}</span>
        <div>
            <strong>${type === "error" ? "Perlu diperiksa" : "Berhasil!"}</strong>
            <small>${escapeHTML(message)}</small>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(15px)";
        toast.style.transition = ".25s";
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}

function setDate() {
    const today = todayISO();

    $("#today-date").textContent = new Date().toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    });

    document.querySelectorAll(".transaction-date").forEach(input => {
        input.value = today;
        input.max = today;
    });
}

// NAVIGASI
function goToPage(pageId) {
    const target = $("#" + pageId);
    if (!target) return;

    document.querySelectorAll(".page").forEach(page => {
        page.classList.toggle("active", page.id === pageId);
    });

    document.querySelectorAll(".nav-link").forEach(button => {
        button.classList.toggle("active", button.dataset.page === pageId);
    });

    const titles = {
        dashboard: "Dashboard",
        products: "Data Produk",
        incoming: "Barang Masuk",
        outgoing: "Barang Keluar",
        history: "Riwayat Transaksi"
    };

    $("#page-title").textContent = titles[pageId];
    $("#breadcrumb-page").textContent = titles[pageId];

    $("#sidebar").classList.remove("open");

    if (pageId === "products") renderProducts();
    if (pageId === "history") renderHistory();
}

document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", () => goToPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => goToPage(button.dataset.go));
});

$("#mobile-menu").addEventListener("click", () => {
    $("#sidebar").classList.toggle("open");
});

// STATUS STOK
function getStockStatus(stock) {
    if (stock <= 0) {
        return { label: "Habis", className: "empty" };
    }

    if (stock <= 10) {
        return { label: "Menipis", className: "low" };
    }

    return { label: "Tersedia", className: "available" };
}

function emptyRow(message, columns) {
    return `
        <tr>
            <td colspan="${columns}">
                <div class="empty-state">${message}</div>
            </td>
        </tr>
    `;
}

// AMBIL DATA DARI JAVA
async function loadData(showError = true) {
    try {
        const response = await fetch("/api/state");

        if (!response.ok) {
            throw new Error("Tidak dapat mengambil data dari server.");
        }

        const data = await response.json();

        products = data.products || [];
        transactions = data.transactions || [];

        renderDashboard();
        renderProducts();
        renderHistory();
        updateProductOptions();
        updateAllPreviews();

    } catch (error) {
        console.error(error);

        if (showError) {
            showToast(
                "Periksa apakah server Java masih berjalan.",
                "error"
            );
        }
    }
}

// DASHBOARD
function renderDashboard() {
    const totalProducts = products.length;
    const totalStock = products.reduce(
        (total, product) => total + Number(product.stock), 0
    );

    const lowStock = products.filter(
        product => Number(product.stock) <= 10
    ).length;

    $("#total-products").textContent = totalProducts;
    $("#total-stock").textContent = totalStock;
    $("#low-stock").textContent = lowStock;

    renderDashboardTable();
    renderStockChart();
    renderRecentActivity();
}

function renderDashboardTable() {
    const table = $("#dashboard-table");

    if (!products.length) {
        table.innerHTML = emptyRow(
            "🍌 Belum ada produk. Mulai dengan menambahkan varian Banana Chips!",
            5
        );
        return;
    }

    table.innerHTML = products.map(product => {
        const status = getStockStatus(Number(product.stock));

        return `
            <tr>
                <td class="product-code">${escapeHTML(product.code)}</td>
                <td class="product-name-cell">${escapeHTML(product.name)}</td>
                <td>${rupiah(product.price)}</td>
                <td><strong>${Number(product.stock)}</strong> pcs</td>
                <td><span class="status ${status.className}">${status.label}</span></td>
            </tr>
        `;
    }).join("");
}

// GRAFIK STOK
function renderStockChart() {
    const chart = $("#stock-chart");

    if (!products.length) {
        chart.innerHTML = `<div class="empty-state">Belum ada data produk.</div>`;
        return;
    }

    const colors = [
        "#d8af42",
        "#9a7048",
        "#85a96e",
        "#e2bd61",
        "#c88a60"
    ];

    const maxStock = Math.max(
        ...products.map(product => Number(product.stock)),
        1
    );

    chart.innerHTML = products.map((product, index) => {
        const stock = Number(product.stock);
        const width = stock === 0 ? 0 : Math.max((stock / maxStock) * 100, 3);

        return `
            <div class="chart-row">
                <span class="chart-name">${escapeHTML(product.name)}</span>
                <div class="chart-track">
                    <div class="chart-fill"
                         style="width:${width}%;background:${colors[index % colors.length]}">
                    </div>
                </div>
                <span class="chart-value">${stock}</span>
            </div>
        `;
    }).join("");
}

// AKTIVITAS TERBARU
function renderRecentActivity() {
    const container = $("#recent-activity");
    const latest = transactions.slice(0, 4);

    if (!latest.length) {
        container.innerHTML = `
            <div class="empty-state">Belum ada aktivitas transaksi.</div>
        `;
        return;
    }

    container.innerHTML = latest.map(item => {
        const incoming = item.type === "Masuk";

        return `
            <div class="activity-item">
                <div class="activity-icon ${incoming ? "in" : "out"}">
                    ${incoming ? "↓" : "↑"}
                </div>
                <div class="activity-info">
                    <strong>${escapeHTML(item.name)}</strong>
                    <small>${escapeHTML(item.date)} · ${incoming ? "Barang masuk" : "Barang keluar"}</small>
                </div>
                <span class="activity-quantity ${incoming ? "in" : "out"}">
                    ${incoming ? "+" : "−"}${Number(item.quantity)}
                </span>
            </div>
        `;
    }).join("");
}

// DATA PRODUK
function renderProducts() {
    const table = $("#product-table");
    const search = ($("#product-search")?.value || "").toLowerCase();

    const filtered = products.filter(product =>
        product.name.toLowerCase().includes(search) ||
        product.code.toLowerCase().includes(search)
    );

    $("#product-count").textContent =
        `${filtered.length} dari ${products.length} produk ditampilkan`;

    if (!filtered.length) {
        table.innerHTML = emptyRow(
            products.length ? "Produk yang dicari tidak ditemukan." : "Belum ada produk yang terdaftar.",
            5
        );
        return;
    }

    table.innerHTML = filtered.map(product => {
        const status = getStockStatus(Number(product.stock));

        return `
            <tr>
                <td class="product-code">${escapeHTML(product.code)}</td>
                <td class="product-name-cell">${escapeHTML(product.name)}</td>
                <td>${rupiah(product.price)}</td>
                <td><strong>${Number(product.stock)}</strong> pcs</td>
                <td><span class="status ${status.className}">${status.label}</span></td>
            </tr>
        `;
    }).join("");
}

$("#product-search").addEventListener("input", renderProducts);

// PILIHAN PRODUK TRANSAKSI
function updateProductOptions() {
    document.querySelectorAll(".product-select").forEach(select => {
        const oldValue = select.value;

        select.innerHTML = `
            <option value="">Pilih produk</option>
            ${products.map(product => `
                <option value="${escapeHTML(product.code)}">
                    ${escapeHTML(product.name)} — Stok ${Number(product.stock)} pcs
                </option>
            `).join("")}
        `;

        if (products.some(product => product.code === oldValue)) {
            select.value = oldValue;
        }
    });
}

// PREVIEW STOK
function updatePreview(type) {
    const form = type === "Masuk"
        ? $("#incoming-form")
        : $("#outgoing-form");

    const prefix = type === "Masuk" ? "incoming" : "outgoing";

    const code = form.elements.code.value;
    const quantity = Number(form.elements.quantity.value) || 0;

    const product = products.find(item => item.code === code);

    const currentElement = $(`#${prefix}-current`);
    const quantityElement = $(`#${prefix}-quantity`);
    const totalElement = $(`#${prefix}-total`);

    if (!product) {
        currentElement.textContent = "—";
        quantityElement.textContent = type === "Masuk" ? "+ 0" : "− 0";
        totalElement.textContent = "—";

        if (type === "Keluar") {
            $("#outgoing-warning").textContent =
                "Pilih produk untuk melihat perkiraan stok.";
            $("#outgoing-warning").classList.remove("warning-text");
        }

        return;
    }

    const current = Number(product.stock);
    const finalStock = type === "Masuk"
        ? current + quantity
        : current - quantity;

    currentElement.textContent = `${current} pcs`;
    quantityElement.textContent =
        `${type === "Masuk" ? "+" : "−"} ${quantity} pcs`;

    totalElement.textContent = `${finalStock} pcs`;

    if (type === "Keluar") {
        const warning = $("#outgoing-warning");

        if (quantity > current) {
            warning.textContent = "⚠️ Jumlah melebihi stok yang tersedia!";
            warning.classList.add("warning-text");
            totalElement.textContent = "Stok kurang";
        } else {
            warning.textContent =
                "Stok mencukupi. Perubahan disimpan setelah transaksi berhasil.";
            warning.classList.remove("warning-text");
        }
    }
}

function updateAllPreviews() {
    updatePreview("Masuk");
    updatePreview("Keluar");
}

["incoming", "outgoing"].forEach(page => {
    const form = $(`#${page}-form`);

    form.elements.code.addEventListener("change", () => {
        updatePreview(page === "incoming" ? "Masuk" : "Keluar");
    });

    form.elements.quantity.addEventListener("input", () => {
        updatePreview(page === "incoming" ? "Masuk" : "Keluar");
    });
});

// SIMPAN FORM KE SERVER JAVA
async function submitForm(form, endpoint, buttonLabel) {
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.innerHTML;

    button.disabled = true;
    button.textContent = "Menyimpan...";

    try {
        const formData = new FormData(form);

        if (formData.has("code")) {
            formData.set("code", String(formData.get("code")).trim().toUpperCase());
        }

        const response = await fetch(endpoint, {
            method: "POST",
            body: new URLSearchParams(formData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Data gagal disimpan.");
        }

        form.reset();

        if (form.classList.contains("transaction-form")) {
            setDate();
        }

        await loadData(false);

        showToast(result.message || "Data berhasil disimpan.");

    } catch (error) {
        showToast(error.message, "error");
    } finally {
        button.disabled = false;
        button.innerHTML = originalText || buttonLabel;
    }
}

// FORM TAMBAH PRODUK
$("#product-form").addEventListener("submit", event => {
    event.preventDefault();

    if (!event.target.reportValidity()) return;

    submitForm(
        event.target,
        "/api/product",
        "Simpan Produk →"
    );
});

// FORM BARANG MASUK
$("#incoming-form").addEventListener("submit", event => {
    event.preventDefault();

    if (!event.target.reportValidity()) return;

    submitForm(
        event.target,
        "/api/transaction",
        "Simpan Barang Masuk →"
    );
});

// FORM BARANG KELUAR
$("#outgoing-form").addEventListener("submit", event => {
    event.preventDefault();

    if (!event.target.reportValidity()) return;

    const code = event.target.elements.code.value;
    const quantity = Number(event.target.elements.quantity.value);
    const product = products.find(item => item.code === code);

    if (!product) {
        showToast("Pilih produk terlebih dahulu.", "error");
        return;
    }

    if (quantity > Number(product.stock)) {
        showToast("Jumlah barang keluar melebihi stok tersedia.", "error");
        return;
    }

    submitForm(
        event.target,
        "/api/transaction",
        "Simpan Barang Keluar →"
    );
});

// RIWAYAT TRANSAKSI
function renderHistory() {
    const table = $("#history-table");
    const search = ($("#history-search")?.value || "").toLowerCase();
    const filter = $("#history-filter")?.value || "Semua";

    const incomingCount = transactions.filter(t => t.type === "Masuk").length;
    const outgoingCount = transactions.filter(t => t.type === "Keluar").length;

    $("#history-in-count").textContent = incomingCount;
    $("#history-out-count").textContent = outgoingCount;
    $("#history-total-count").textContent = transactions.length;

    const filtered = transactions.filter(item => {
        const matchesType = filter === "Semua" || item.type === filter;

        const searchText = [
            item.id,
            item.date,
            item.code,
            item.name,
            item.type
        ].join(" ").toLowerCase();

        return matchesType && searchText.includes(search);
    });

    $("#history-result-count").textContent =
        `Menampilkan ${filtered.length} dari ${transactions.length} transaksi`;

    if (!filtered.length) {
        table.innerHTML = emptyRow(
            transactions.length
                ? "Tidak ada transaksi yang sesuai dengan pencarian."
                : "Belum ada riwayat transaksi.",
            6
        );
        return;
    }

    table.innerHTML = filtered.map(item => {
        const incoming = item.type === "Masuk";

        return `
            <tr>
                <td class="product-code">${escapeHTML(item.id)}</td>
                <td>${escapeHTML(item.date)}</td>
                <td>${escapeHTML(item.code)}</td>
                <td class="product-name-cell">${escapeHTML(item.name)}</td>
                <td class="${incoming ? "type-in" : "type-out"}">
                    ${incoming ? "↓ Barang Masuk" : "↑ Barang Keluar"}
                </td>
                <td><strong>${incoming ? "+" : "−"}${Number(item.quantity)}</strong> pcs</td>
            </tr>
        `;
    }).join("");
}

$("#history-search").addEventListener("input", renderHistory);
$("#history-filter").addEventListener("change", renderHistory);

// MULAI APLIKASI
setDate();
loadData();
